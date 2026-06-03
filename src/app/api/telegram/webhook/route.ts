import { NextResponse } from "next/server";
import {
  type TelegramUpdate,
  downloadVoice,
  sendMessage,
  editMessageText,
  answerCallback,
} from "@/lib/telegram";
import { transcribeAudio } from "@/lib/whisper";
import { classifyCapture } from "@/lib/router/classifyCapture";
import { ingestCapture } from "@/lib/firestore/captures";
import { adminDb } from "@/lib/firebase/admin";
import {
  COL,
  type MercadoItemDoc,
  type RawCaptureDoc,
  type TaskDoc,
  URGENCY,
  type Urgency,
} from "@/lib/schema";
import { FieldValue } from "firebase-admin/firestore";
import { USER_ID } from "@/lib/userConfig";
import { answerQuestion } from "@/lib/llm/answerQuestion";

export const runtime = "nodejs";

const ALLOWED_USER_ID = Number(process.env.TELEGRAM_USER_ID ?? "0");

// Limite prático: Telegram aceita keyboards grandes mas vira parede de botões.
// Mostra os N primeiros e avisa que tem mais.
const MERCADO_LIST_MAX_BUTTONS = 15;

export async function POST(req: Request) {
  // 1) Verifica segredo do header (Telegram envia se foi configurado no setWebhook)
  const incomingSecret = req.headers.get("x-telegram-bot-api-secret-token");
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || incomingSecret !== expected) {
    return NextResponse.json({ error: "bad secret" }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  try {
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallback(update.callback_query);
    }
  } catch (err) {
    console.error("[telegram-webhook] handler error:", err);
    // Sempre 200 pro Telegram não reentregar — o erro vai pro log
  }

  return NextResponse.json({ ok: true });
}

async function handleMessage(msg: NonNullable<TelegramUpdate["message"]>) {
  // 2) Verifica que veio de você
  if (ALLOWED_USER_ID && msg.from.id !== ALLOWED_USER_ID) {
    await sendMessage({
      chatId: msg.chat.id,
      text: "Esse bot é privado.",
    });
    return;
  }

  let rawText: string | null = null;
  let audioUrl: string | null = null;
  let transcriptionSource: "whisper" | "telegram" | "none" = "none";
  let source: "telegram_voice" | "telegram_text" = "telegram_text";

  // 3) Resolve o texto (transcreve se voz)
  if (msg.voice) {
    source = "telegram_voice";
    audioUrl = msg.voice.file_id;
    const audio = await downloadVoice(msg.voice.file_id);
    if (!audio) {
      await sendMessage({ chatId: msg.chat.id, text: "❌ Não consegui baixar o áudio." });
      return;
    }
    const text = await transcribeAudio(audio.buffer, audio.filename, audio.mimeType);
    if (!text) {
      await sendMessage({ chatId: msg.chat.id, text: "❌ Não consegui transcrever." });
      return;
    }
    rawText = text;
    transcriptionSource = "whisper";
  } else if (msg.text) {
    rawText = msg.text;
  }

  if (!rawText) {
    await sendMessage({
      chatId: msg.chat.id,
      text: "Manda texto ou áudio. Outras mídias eu ignoro.",
    });
    return;
  }

  // 3.5) Pré-classifier: se for pedido explícito de listar o mercado,
  // mostra a lista com botões inline pra marcar como comprado.
  // Isso curto-circuita o classifier porque é puramente uma ação de UI,
  // não vale a pena gastar token nem criar raw_capture.
  if (isMercadoListIntent(rawText)) {
    await sendMercadoList(msg.chat.id, msg.message_id);
    return;
  }

  // 4) Classifica
  const classification = await classifyCapture(rawText);

  // 4.a) Se for pergunta/listagem, responde direto SEM criar raw_capture
  if (classification.kind === "query") {
    try {
      const { answer } = await answerQuestion(rawText);
      await sendMessage({
        chatId: msg.chat.id,
        text: answer,
        replyToMessageId: msg.message_id,
      });
      await adminDb.collection(COL.auditLog).add({
        user_id: USER_ID,
        action: "query_answered",
        resource_type: "query",
        resource_id: null,
        metadata: { source, question: rawText.slice(0, 500), answer_chars: answer.length },
        created_at: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error("[telegram] query failed:", err);
      await sendMessage({
        chatId: msg.chat.id,
        text: "❗ Não consegui responder agora. Tenta de novo em alguns segundos.",
        replyToMessageId: msg.message_id,
      });
    }
    return;
  }

  // 4.b) Demais kinds: grava o capture
  const result = await ingestCapture({
    source,
    rawText,
    audioUrl,
    transcriptionSource,
    classification,
  });

  // 5) Resposta dependente do tipo
  if (classification.kind === "mercado") {
    const items = result.mercadoItems ?? [];
    const lines = items.length
      ? [`🛒 Adicionado à lista de mercado (${items.length}):`, ...items.map((i) => `• ${i}`)]
      : ["🛒 Tentei adicionar à lista de mercado, mas não identifiquei nenhum item."];
    await sendMessage({
      chatId: msg.chat.id,
      text: lines.join("\n"),
      replyToMessageId: msg.message_id,
    });
    return;
  }

  if (classification.kind === "bill") {
    const amount =
      classification.bill_amount !== null && Number.isFinite(classification.bill_amount)
        ? new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: classification.bill_currency || "BRL",
          }).format(classification.bill_amount)
        : "valor não informado";
    const due = classification.due_date ? ` · vence ${classification.due_date}` : "";
    const recur = classification.bill_category === "recorrente"
      ? ` · recorrente${classification.bill_recurrence ? ` (${classification.bill_recurrence})` : ""}`
      : "";
    await sendMessage({
      chatId: msg.chat.id,
      text: `💳 Conta a pagar: ${classification.title}\n${amount}${due}${recur}`,
      replyToMessageId: msg.message_id,
    });
    return;
  }

  if (classification.kind === "mercado_purchase") {
    const items = result.mercadoItems ?? [];
    const text = items.length
      ? `✅ Compra de mercado registrada — ${items.length} item${items.length > 1 ? "s" : ""} marcado${items.length > 1 ? "s" : ""} como comprado:\n${items.map((i) => `• ${i}`).join("\n")}`
      : "⚠️ Nenhum item pendente na lista de mercado pra marcar como comprado.";
    await sendMessage({
      chatId: msg.chat.id,
      text,
      replyToMessageId: msg.message_id,
    });
    return;
  }

  if (classification.kind === "task_complete") {
    const tasks = result.tasksCompleted ?? [];
    if (tasks.length === 0) {
      await sendMessage({
        chatId: msg.chat.id,
        text: `⚠️ Não encontrei nenhuma tarefa aberta que case com: "${classification.title}".\n\nMande "listar tarefas" pra ver as ativas.`,
        replyToMessageId: msg.message_id,
      });
      return;
    }
    const t = tasks[0];
    await sendMessage({
      chatId: msg.chat.id,
      text: `✅ Tarefa concluída: ${t.title}`,
      replyToMessageId: msg.message_id,
      inlineKeyboard: [
        [{ text: "↩️ Desfazer", callback_data: `task_undo:${t.id}` }],
      ],
    });
    return;
  }

  // Default: task/decision/note/idea/meal/habit_log → keyboard de scheduled_to+key
  const scheduledLabel = {
    hoje: "Hoje",
    amanha: "Amanhã",
    esta_semana: "Esta semana",
    este_mes: "Este mês",
    data_especifica: "Data específica",
  }[classification.scheduled_to];

  const lines = [
    `✅ Capturado — ${classification.kind} / ${scheduledLabel}${classification.key ? " · KEY" : ""}`,
    classification.title,
  ];
  if (classification.due_date) {
    lines.push(`due: ${classification.due_date}`);
  }
  if (classification.tags.length > 0) {
    lines.push(`tags: ${classification.tags.map((t) => `#${t}`).join(" ")}`);
  }

  await sendMessage({
    chatId: msg.chat.id,
    text: lines.join("\n"),
    replyToMessageId: msg.message_id,
    inlineKeyboard: [
      [
        { text: "Hoje", callback_data: `urg:today:${result.captureId}` },
        { text: "Semana", callback_data: `urg:this_week:${result.captureId}` },
        { text: "Mês", callback_data: `urg:this_month:${result.captureId}` },
        { text: "Algum dia", callback_data: `urg:someday:${result.captureId}` },
      ],
      [{ text: classification.key ? "Desmarcar KEY" : "Marcar KEY", callback_data: `key:${result.captureId}` }],
    ],
  });
}

async function handleCallback(cb: NonNullable<TelegramUpdate["callback_query"]>) {
  if (ALLOWED_USER_ID && cb.from.id !== ALLOWED_USER_ID) {
    await answerCallback(cb.id, "Privado.");
    return;
  }
  const data = cb.data ?? "";
  const [op, ...rest] = data.split(":");

  if (op === "urg") {
    const [urgency, captureId] = rest;
    if (!(URGENCY as readonly string[]).includes(urgency) || !captureId) {
      await answerCallback(cb.id, "Opção inválida.");
      return;
    }
    await applyUrgencyOverride(captureId, urgency as Urgency);
    await answerCallback(cb.id, `Urgência: ${urgency}`);
  } else if (op === "key") {
    const [captureId] = rest;
    if (!captureId) {
      await answerCallback(cb.id, "ID ausente.");
      return;
    }
    await toggleKey(captureId);
    await answerCallback(cb.id, "KEY alternado.");
  } else if (op === "mercado_done") {
    const [itemId] = rest;
    if (!itemId) {
      await answerCallback(cb.id, "ID ausente.");
      return;
    }
    const itemName = await markMercadoBought(itemId);
    await answerCallback(cb.id, itemName ? `✅ ${itemName}` : "Item não encontrado.");
    // Re-renderiza a lista na mesma mensagem
    if (cb.message?.chat?.id && cb.message.message_id) {
      await refreshMercadoListMessage(cb.message.chat.id, cb.message.message_id);
    }
  } else if (op === "task_undo") {
    const [taskId] = rest;
    if (!taskId) {
      await answerCallback(cb.id, "ID ausente.");
      return;
    }
    const title = await undoTaskComplete(taskId);
    await answerCallback(cb.id, title ? `↩️ Reaberta: ${title}` : "Tarefa não encontrada.");
    if (cb.message?.chat?.id && cb.message.message_id && title) {
      await editMessageText({
        chatId: cb.message.chat.id,
        messageId: cb.message.message_id,
        text: `↩️ Tarefa reaberta: ${title}`,
      });
    }
  } else {
    await answerCallback(cb.id, "Comando desconhecido.");
  }
}

async function applyUrgencyOverride(captureId: string, urgency: Urgency) {
  const captureRef = adminDb.collection(COL.rawCaptures).doc(captureId);
  const snap = await captureRef.get();
  if (!snap.exists) return;
  const cap = snap.data() as RawCaptureDoc;
  await captureRef.update({
    "classification.urgency": urgency,
  });
  if (cap.routed_to === "tasks" && cap.routed_id) {
    const taskRef = adminDb.collection(COL.tasks).doc(cap.routed_id);
    await taskRef.update({
      urgency,
      priority_score: priorityScore(urgency, cap.classification.key),
      updated_at: FieldValue.serverTimestamp(),
    });
  }
  await adminDb.collection(COL.auditLog).add({
    user_id: USER_ID,
    action: "override_urgency",
    resource_type: "raw_capture",
    resource_id: captureId,
    metadata: { urgency },
    created_at: FieldValue.serverTimestamp(),
  });
}

async function toggleKey(captureId: string) {
  const captureRef = adminDb.collection(COL.rawCaptures).doc(captureId);
  const snap = await captureRef.get();
  if (!snap.exists) return;
  const cap = snap.data() as RawCaptureDoc;
  const newKey = !cap.classification.key;
  await captureRef.update({ "classification.key": newKey });
  if (cap.routed_to === "tasks" && cap.routed_id) {
    const taskRef = adminDb.collection(COL.tasks).doc(cap.routed_id);
    await taskRef.update({
      key: newKey,
      priority_score: priorityScore(cap.classification.urgency, newKey),
      updated_at: FieldValue.serverTimestamp(),
    });
  }
  await adminDb.collection(COL.auditLog).add({
    user_id: USER_ID,
    action: "toggle_key",
    resource_type: "raw_capture",
    resource_id: captureId,
    metadata: { key: newKey },
    created_at: FieldValue.serverTimestamp(),
  });
}

function priorityScore(urgency: Urgency, key: boolean): number {
  const urgencyWeight = { today: 100, this_week: 60, this_month: 30, someday: 10 }[urgency];
  return urgencyWeight + (key ? 50 : 0);
}

// === Helpers para o fluxo de mercado via Telegram ===

// Heurística: detecta pedidos curtos pra ver a lista. Mantém amplo o suficiente
// pra pegar variações comuns mas sem consumir "comprei", "comprar", etc.
function isMercadoListIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (t === "/mercado" || t === "/lista" || t === "/compras") return true;
  // bate "listar mercado", "mostra a lista de mercado", "ver minha lista de compras", etc.
  if (/\b(listar|mostrar?|exibir|ver|qual)\b[^?\n]{0,30}\b(mercado|lista de (mercado|compras)|lista do mercado)\b/.test(t)) {
    return true;
  }
  if (/^(minha )?lista de (mercado|compras)\??$/.test(t)) return true;
  if (/^mercado\??$/.test(t)) return true;
  if (/^mercado pendentes?$/.test(t)) return true;
  if (/\bque (tem|falta) (na |no )?(lista|mercado)\b/.test(t)) return true;
  return false;
}

async function fetchPendingMercado(): Promise<Array<{ id: string; item: string }>> {
  const snap = await adminDb
    .collection(COL.mercado)
    .where("user_id", "==", USER_ID)
    .where("status", "==", "A Comprar")
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, item: (d.data() as MercadoItemDoc).item }))
    .sort((a, b) => a.item.localeCompare(b.item));
}

function buildMercadoListMessage(items: Array<{ id: string; item: string }>): {
  text: string;
  keyboard: { text: string; callback_data: string }[][];
} {
  if (items.length === 0) {
    return {
      text: "🛒 Lista de mercado vazia.\n\nMande \"Comprar X, Y, Z\" pra adicionar.",
      keyboard: [],
    };
  }
  const visible = items.slice(0, MERCADO_LIST_MAX_BUTTONS);
  const hidden = items.length - visible.length;
  const lines = [`🛒 Lista de mercado (${items.length} item${items.length === 1 ? "" : "s"}):`, ""];
  for (const it of visible) lines.push(`• ${it.item}`);
  if (hidden > 0) lines.push(`  ...+${hidden} (toca um abaixo pra marcar como comprado)`);
  else lines.push("", "Toca pra marcar como comprado:");

  const keyboard: { text: string; callback_data: string }[][] = visible.map((it) => [
    { text: `✓ ${it.item}`.slice(0, 60), callback_data: `mercado_done:${it.id}` },
  ]);
  return { text: lines.join("\n"), keyboard };
}

async function sendMercadoList(chatId: number, replyToMessageId: number) {
  const items = await fetchPendingMercado();
  const { text, keyboard } = buildMercadoListMessage(items);
  await sendMessage({
    chatId,
    text,
    replyToMessageId,
    inlineKeyboard: keyboard.length ? keyboard : undefined,
  });
}

async function refreshMercadoListMessage(chatId: number, messageId: number) {
  const items = await fetchPendingMercado();
  const { text, keyboard } = buildMercadoListMessage(items);
  await editMessageText({
    chatId,
    messageId,
    text,
    inlineKeyboard: keyboard.length ? keyboard : undefined,
  });
}

async function markMercadoBought(itemId: string): Promise<string | null> {
  const ref = adminDb.collection(COL.mercado).doc(itemId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as MercadoItemDoc;
  if (data.user_id !== USER_ID) return null;
  if (data.status === "Comprado") return data.item; // idempotente
  await ref.update({
    status: "Comprado",
    bought_at: FieldValue.serverTimestamp(),
  });
  await adminDb.collection(COL.auditLog).add({
    user_id: USER_ID,
    action: "mercado_update",
    resource_type: "mercado_item",
    resource_id: itemId,
    metadata: { status: "Comprado", item: data.item, via: "telegram_button" },
    created_at: FieldValue.serverTimestamp(),
  });
  return data.item;
}

async function undoTaskComplete(taskId: string): Promise<string | null> {
  const ref = adminDb.collection(COL.tasks).doc(taskId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const cur = snap.data() as TaskDoc;
  if (cur.user_id !== USER_ID) return null;
  await ref.update({
    completed_at: null,
    updated_at: FieldValue.serverTimestamp(),
  });
  await adminDb.collection(COL.auditLog).add({
    user_id: USER_ID,
    action: "task_update",
    resource_type: "task",
    resource_id: taskId,
    metadata: { completed: false, via: "telegram_undo" },
    created_at: FieldValue.serverTimestamp(),
  });
  return cur.title ?? null;
}

// Para o setup inicial do webhook é útil ter GET — Vercel/Telegram não usa, mas dá pra testar saúde.
export async function GET() {
  return NextResponse.json({
    ok: true,
    bot_configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    user_id_pinned: Boolean(ALLOWED_USER_ID),
  });
}
