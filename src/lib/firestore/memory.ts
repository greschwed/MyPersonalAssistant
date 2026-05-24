import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { embedText } from "@/lib/embeddings";
import { COL, type MemoryChunkDoc, type RawCaptureDoc } from "@/lib/schema";

export type MemoryHit = {
  chunkId: string;
  sourceType: string;
  sourceId: string;
  text: string;
  capture?: {
    rawText: string;
    source: string;
    classification: RawCaptureDoc["classification"];
    createdAt: string | null;
  };
};

export async function searchMemory(query: string, limit = 20): Promise<MemoryHit[]> {
  const embedding = await embedText(query);
  if (!embedding) return [];

  // Firestore Vector Search via findNearest.
  // Requer índice vector em memory_chunks.embedding (criado via firebase deploy
  // ou Firebase Console). Sem índice, lança erro.
  const result = await adminDb
    .collection(COL.memoryChunks)
    .findNearest({
      vectorField: "embedding",
      queryVector: FieldValue.vector(embedding),
      limit,
      distanceMeasure: "COSINE",
    })
    .get();

  const hits: MemoryHit[] = [];

  for (const doc of result.docs) {
    const chunk = doc.data() as MemoryChunkDoc;
    const hit: MemoryHit = {
      chunkId: doc.id,
      sourceType: chunk.source_type,
      sourceId: chunk.source_id,
      text: chunk.text,
    };

    // Join com raw_capture se for o tipo capture (que cobre quase tudo no schema atual)
    if (chunk.source_type === "capture" && chunk.source_id) {
      const capSnap = await adminDb
        .collection(COL.rawCaptures)
        .doc(chunk.source_id)
        .get();
      if (capSnap.exists) {
        const cap = capSnap.data() as RawCaptureDoc & {
          created_at?: { toDate?: () => Date };
        };
        hit.capture = {
          rawText: cap.raw_text,
          source: cap.source,
          classification: cap.classification,
          createdAt: cap.created_at?.toDate?.()?.toISOString?.() ?? null,
        };
      }
    }
    hits.push(hit);
  }
  return hits;
}
