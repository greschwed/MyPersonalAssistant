import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { USER_ID, localDateKey } from "@/lib/userConfig";
import { embedText } from "@/lib/embeddings";
import {
  COL,
  type Classification,
  type CaptureSource,
  type RawCaptureDoc,
  type TaskDoc,
  type DailyLogDoc,
} from "@/lib/schema";

type IngestInput = {
  source: CaptureSource;
  rawText: string;
  audioUrl: string | null;
  transcriptionSource: RawCaptureDoc["transcription_source"];
  classification: Classification;
};

export type IngestResult = {
  captureId: string;
  routedTo: RawCaptureDoc["routed_to"];
  routedId: string | null;
  memoryChunkId: string | null;
};

function priorityScore(c: Classification): number {
  const urgencyWeight = { today: 100, this_week: 60, this_month: 30, someday: 10 }[c.urgency];
  const keyBoost = c.key ? 50 : 0;
  return urgencyWeight + keyBoost;
}

export async function ingestCapture(input: IngestInput): Promise<IngestResult> {
  const db = adminDb;
  const now = FieldValue.serverTimestamp();
  const captureRef = db.collection(COL.rawCaptures).doc();

  let routedTo: RawCaptureDoc["routed_to"] = "raw_captures";
  let routedId: string | null = null;

  // 1) Decide a coleção alvo + grava o documento downstream
  if (input.classification.kind === "task" || input.classification.kind === "decision") {
    const taskRef = db.collection(COL.tasks).doc();
    const task: TaskDoc = {
      user_id: USER_ID,
      title: input.classification.title,
      description: input.classification.summary,
      urgency: input.classification.urgency,
      key: input.classification.key,
      priority_score: priorityScore(input.classification),
      tags: input.classification.tags,
      due_date: input.classification.due_date,
      owner: USER_ID,
      entity_id: null, // resolução de entity virá depois (Fase 4)
      capture_id: captureRef.id,
      completed_at: null,
      created_at: now,
      updated_at: now,
    };
    await taskRef.set(task);
    routedTo = "tasks";
    routedId = taskRef.id;
  } else if (input.classification.kind === "meal" || input.classification.kind === "habit_log") {
    const date = localDateKey();
    const logId = `${USER_ID}_${date}`;
    const logRef = db.collection(COL.dailyLogs).doc(logId);

    if (input.classification.kind === "meal") {
      await upsertMealInDailyLog(db, logRef, logId, date, input.classification, input.rawText);
    } else {
      await upsertHabitInDailyLog(db, logRef, logId, date, input.classification);
    }
    routedTo = "daily_logs";
    routedId = logRef.id;
  }
  // notes, ideas, journals → ficam só em raw_captures (queryáveis via memory)

  // 2) Grava o raw_capture (sempre)
  const captureDoc: RawCaptureDoc = {
    user_id: USER_ID,
    source: input.source,
    raw_text: input.rawText,
    audio_url: input.audioUrl,
    transcription_source: input.transcriptionSource,
    classification: input.classification,
    routed_to: routedTo,
    routed_id: routedId,
    created_at: now,
  };
  await captureRef.set(captureDoc);

  // 3) Embedding + memory chunk (não-bloqueante de erro)
  let memoryChunkId: string | null = null;
  const memoryText = `${input.classification.title}\n${input.classification.summary}\n${input.rawText}`.trim();
  const embedding = await embedText(memoryText);
  if (embedding) {
    const chunkRef = db.collection(COL.memoryChunks).doc();
    await chunkRef.set({
      user_id: USER_ID,
      source_type: "capture",
      source_id: captureRef.id,
      text: memoryText.slice(0, 4000),
      embedding: FieldValue.vector(embedding),
      created_at: now,
    });
    memoryChunkId = chunkRef.id;
  }

  // 4) Audit log
  await db.collection(COL.auditLog).add({
    user_id: USER_ID,
    action: "ingest_capture",
    resource_type: "raw_capture",
    resource_id: captureRef.id,
    metadata: {
      source: input.source,
      kind: input.classification.kind,
      urgency: input.classification.urgency,
      llm_source: input.classification.llm_source,
      routed_to: routedTo,
      routed_id: routedId,
      memory_chunk_id: memoryChunkId,
    },
    created_at: now,
  });

  return {
    captureId: captureRef.id,
    routedTo,
    routedId,
    memoryChunkId,
  };
}

async function upsertMealInDailyLog(
  db: Firestore,
  logRef: FirebaseFirestore.DocumentReference,
  logId: string,
  date: string,
  classification: Classification,
  rawText: string,
) {
  const meal = {
    id: cryptoRandomId(),
    t: nowHHMM(),
    n: classification.title || rawText.slice(0, 80),
    kcal: 0,
    p: 0,
    c: 0,
    f: 0,
    estimated: false,
    raw: rawText.slice(0, 300),
  };
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(logRef);
    if (snap.exists) {
      const data = snap.data() as DailyLogDoc;
      const meals = data.notes?.nutrition?.meals ?? [];
      tx.update(logRef, {
        "notes.nutrition.meals": [...meals, meal],
        updated_at: FieldValue.serverTimestamp(),
      });
    } else {
      const doc: DailyLogDoc = {
        user_id: USER_ID,
        log_date: date,
        notes: { nutrition: { meals: [meal] } },
        mood: null,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      };
      tx.set(logRef, doc);
    }
  });
  return logId;
}

async function upsertHabitInDailyLog(
  db: Firestore,
  logRef: FirebaseFirestore.DocumentReference,
  logId: string,
  date: string,
  classification: Classification,
) {
  const habitName = classification.tags[0] ?? classification.title.toLowerCase();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(logRef);
    if (snap.exists) {
      const data = snap.data() as DailyLogDoc;
      const existing = data.notes?.habits ?? { done: [], total: 6 };
      const done = Array.from(new Set([...existing.done, habitName]));
      tx.update(logRef, {
        "notes.habits": { done, total: existing.total },
        updated_at: FieldValue.serverTimestamp(),
      });
    } else {
      const doc: DailyLogDoc = {
        user_id: USER_ID,
        log_date: date,
        notes: { habits: { done: [habitName], total: 6 } },
        mood: null,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      };
      tx.set(logRef, doc);
    }
  });
  return logId;
}

function cryptoRandomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function nowHHMM(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: process.env.USER_TIMEZONE ?? "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}
