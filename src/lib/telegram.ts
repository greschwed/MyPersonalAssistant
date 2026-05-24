import "server-only";

const BASE = "https://api.telegram.org";

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN ausente");
  return t;
}

export async function downloadVoice(fileId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  filename: string;
} | null> {
  const t = token();
  const metaResp = await fetch(`${BASE}/bot${t}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const meta = (await metaResp.json()) as {
    ok: boolean;
    result?: { file_path: string };
  };
  if (!meta.ok || !meta.result?.file_path) {
    console.error("[telegram] getFile failed", meta);
    return null;
  }
  const filePath = meta.result.file_path;
  const fileResp = await fetch(`${BASE}/file/bot${t}/${filePath}`);
  if (!fileResp.ok) {
    console.error("[telegram] file download failed", fileResp.status);
    return null;
  }
  const arrayBuffer = await fileResp.arrayBuffer();
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "ogg";
  const mimeType = ext === "ogg" || ext === "oga" ? "audio/ogg" : `audio/${ext}`;
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType,
    filename: `voice.${ext}`,
  };
}

export type SendMessageOptions = {
  chatId: number;
  text: string;
  replyToMessageId?: number;
  inlineKeyboard?: { text: string; callback_data: string }[][];
  parseMode?: "Markdown" | "HTML";
};

export async function sendMessage(opts: SendMessageOptions): Promise<void> {
  const t = token();
  const body: Record<string, unknown> = {
    chat_id: opts.chatId,
    text: opts.text,
  };
  if (opts.replyToMessageId) body.reply_to_message_id = opts.replyToMessageId;
  if (opts.parseMode) body.parse_mode = opts.parseMode;
  if (opts.inlineKeyboard) {
    body.reply_markup = { inline_keyboard: opts.inlineKeyboard };
  }
  const resp = await fetch(`${BASE}/bot${t}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    console.error("[telegram] sendMessage failed", resp.status, await resp.text());
  }
}

export async function answerCallback(callbackQueryId: string, text: string): Promise<void> {
  const t = token();
  await fetch(`${BASE}/bot${t}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

// Tipos mínimos do payload do webhook (apenas o que usamos)
export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type TelegramMessage = {
  message_id: number;
  from: { id: number; first_name?: string; username?: string };
  chat: { id: number; type: string };
  date: number;
  text?: string;
  voice?: { file_id: string; duration: number; mime_type?: string };
  audio?: { file_id: string; duration: number; mime_type?: string };
};

export type TelegramCallbackQuery = {
  id: string;
  from: { id: number };
  message?: TelegramMessage;
  data?: string;
};
