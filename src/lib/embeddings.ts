import "server-only";

import { OPENAI_EMBEDDING_MODEL, getOpenAI } from "@/lib/llm/openai";

export async function embedText(text: string): Promise<number[] | null> {
  if (!text || text.trim().length === 0) return null;
  try {
    const client = getOpenAI();
    const resp = await client.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL,
      input: text.slice(0, 8000),
    });
    const vec = resp.data[0]?.embedding;
    return Array.isArray(vec) ? vec : null;
  } catch (err) {
    console.error("[embeddings] failed:", err);
    return null;
  }
}
