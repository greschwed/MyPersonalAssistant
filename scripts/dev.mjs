// Wrapper para `next dev` que limpa env vars herdadas que sabotariam o carregamento de .env.local.
// Algumas shells (notavelmente o Claude Code CLI) injetam variáveis vazias como
// ANTHROPIC_API_KEY="" no ambiente — e o @next/env trata isso como "já presente", ignorando
// o valor real em .env.local. Aqui removemos antes de spawnar o Next.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const POISONED = new Set([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_LOG",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_PROFILE",
  "ANTHROPIC_WEBHOOK_SIGNING_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_ORG_ID",
  "OPENAI_PROJECT",
]);

const envFile = join(process.cwd(), ".env.local");
const envFileKeys = new Set();
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (m) envFileKeys.add(m[1]);
  }
}

const cleaned = { ...process.env };
const removed = [];
for (const key of Object.keys(cleaned)) {
  // Remove se: (a) é uma poisoned var conhecida e está vazia/ausente, OU
  //            (b) está em .env.local e o valor herdado é vazio/falsy
  const val = cleaned[key];
  const inFile = envFileKeys.has(key);
  const empty = !val || val.trim().length === 0;
  const poisoned = POISONED.has(key);
  if (inFile && (empty || poisoned)) {
    delete cleaned[key];
    removed.push(key);
  }
}
if (removed.length) {
  console.log("[dev wrapper] desset env vars herdadas para deixar .env.local mandar:", removed.join(", "));
}

const isWin = process.platform === "win32";
const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: cleaned,
  shell: isWin, // Windows precisa de shell:true para spawnar .cmd
});
child.on("exit", (code) => process.exit(code ?? 0));
