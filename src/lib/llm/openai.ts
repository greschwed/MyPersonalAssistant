import "server-only";

import OpenAI from "openai";

let cached: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente");
  cached = new OpenAI({ apiKey });
  return cached;
}

export const OPENAI_CLASSIFIER_MODEL =
  process.env.OPENAI_CLASSIFIER_MODEL ?? "gpt-4o-mini";

export const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
