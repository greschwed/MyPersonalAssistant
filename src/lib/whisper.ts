import "server-only";

import { getOpenAI } from "@/lib/llm/openai";

const WHISPER_MODEL = "whisper-1";

// Transcreve um Buffer de áudio. Telegram envia OGG (Opus); o Whisper aceita.
export async function transcribeAudio(
  audio: Buffer,
  filename: string,
  mimeType: string,
): Promise<string | null> {
  try {
    const client = getOpenAI();
    const file = new File([audio as BlobPart], filename, { type: mimeType });
    const resp = await client.audio.transcriptions.create({
      model: WHISPER_MODEL,
      file,
    });
    return resp.text ?? null;
  } catch (err) {
    console.error("[whisper] transcription failed:", err);
    return null;
  }
}
