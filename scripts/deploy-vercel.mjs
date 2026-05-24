// Deploy Vercel ponta a ponta:
// 1) valida token
// 2) lê project info
// 3) escreve .vercel/project.json
// 4) reseta env vars de prod
// 5) deploy
// 6) repointa webhook Telegram
//
// Uso: node scripts/deploy-vercel.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

// --- env loading ---
const envFile = join(process.cwd(), ".env.local");
const env = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
}

const TOKEN = env.VERCEL_TOKEN;
if (!TOKEN) {
  console.error("VERCEL_TOKEN ausente em .env.local");
  process.exit(1);
}
const PROJECT_ID = env.VERCEL_PROJECT_ID;
if (!PROJECT_ID) {
  console.error("VERCEL_PROJECT_ID ausente em .env.local");
  process.exit(1);
}

const baseHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
};

async function api(path, init = {}) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: { ...baseHeaders, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    const msg = typeof json === "object" ? JSON.stringify(json) : String(json);
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${msg.slice(0, 400)}`);
  }
  return json;
}

// --- 1) valida token ---
console.log("→ Validando token...");
const user = await api("/v2/user");
console.log(`  user: ${user.user?.username ?? user.user?.email ?? "?"}`);

// --- 2) projeto ---
console.log(`→ Buscando projeto ${PROJECT_ID}...`);
const project = await api(`/v9/projects/${PROJECT_ID}`);
console.log(`  nome: ${project.name}  org: ${project.accountId}`);

// --- 3) .vercel/project.json ---
const vercelDir = join(process.cwd(), ".vercel");
if (!existsSync(vercelDir)) mkdirSync(vercelDir, { recursive: true });
writeFileSync(
  join(vercelDir, "project.json"),
  JSON.stringify({ projectId: project.id, orgId: project.accountId }, null, 2),
);
console.log("  .vercel/project.json escrito");

// --- 4) env vars ---
// extrair FIREBASE_PRIVATE_KEY do JSON do service account
function extractPrivateKey() {
  const path = env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!path) throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH ausente");
  const sa = JSON.parse(readFileSync(path, "utf8"));
  return sa.private_key; // string com \n REAIS (não escapados)
}

const desired = {
  // Public client (Firebase Web)
  NEXT_PUBLIC_FIREBASE_API_KEY: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  // Server admin
  FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: extractPrivateKey(),
  // App
  USER_ID: env.USER_ID,
  USER_TIMEZONE: env.USER_TIMEZONE,
  ALLOWED_FIREBASE_UIDS: env.ALLOWED_FIREBASE_UIDS,
  // LLM
  ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: env.ANTHROPIC_MODEL,
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  OPENAI_CLASSIFIER_MODEL: env.OPENAI_CLASSIFIER_MODEL,
  OPENAI_EMBEDDING_MODEL: env.OPENAI_EMBEDDING_MODEL,
  // Telegram
  TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET: env.TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_USER_ID: env.TELEGRAM_USER_ID,
  // API
  API_SECRET: env.API_SECRET,
  CRON_SECRET: env.CRON_SECRET,
  // Calendar
  GOOGLE_CALENDAR_URL_PESSOAL: env.GOOGLE_CALENDAR_URL_PESSOAL,
  GOOGLE_CALENDAR_URL_TRABALHO: env.GOOGLE_CALENDAR_URL_TRABALHO,
};

console.log("→ Lendo envs atuais do projeto...");
const existing = await api(`/v9/projects/${PROJECT_ID}/env?decrypt=false`);
const existingMap = new Map(
  (existing.envs ?? []).map((e) => [`${e.key}|${(e.target || []).join(",")}`, e]),
);

console.log("→ Sincronizando envs (production)...");
let pushed = 0;
for (const [key, value] of Object.entries(desired)) {
  if (!value || String(value).trim().length === 0) {
    console.log(`  · skip vazio: ${key}`);
    continue;
  }

  // remove versão antiga em production (se existir) pra evitar 409
  for (const e of existing.envs ?? []) {
    if (e.key === key && (e.target || []).includes("production")) {
      await api(`/v9/projects/${PROJECT_ID}/env/${e.id}`, { method: "DELETE" });
    }
  }

  const type = key.startsWith("NEXT_PUBLIC_") ? "plain" : "encrypted";
  await api(`/v10/projects/${PROJECT_ID}/env`, {
    method: "POST",
    body: JSON.stringify({
      key,
      value: String(value),
      target: ["production"],
      type,
    }),
  });
  console.log(`  ✓ ${key} (${type})`);
  pushed++;
}
console.log(`  ${pushed} envs publicadas`);

// --- 5) deploy ---
console.log("→ Disparando deploy de produção (vercel --prod)...");
try {
  const out = execSync(
    `npx --yes vercel deploy --prod --yes --token ${TOKEN}`,
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );
  console.log(out);
} catch (err) {
  console.error("Deploy stdout:", err.stdout?.toString?.());
  console.error("Deploy stderr:", err.stderr?.toString?.());
  throw err;
}

// --- 6) descobre URL final ---
console.log("→ Buscando URL de produção...");
const deps = await api(`/v6/deployments?projectId=${PROJECT_ID}&limit=1&state=READY,BUILDING,QUEUED,INITIALIZING`);
const latest = deps.deployments?.[0];
const prodUrl = latest?.alias?.[0] ?? latest?.url;
console.log(`  url: https://${prodUrl}`);

// --- 7) re-aponta webhook Telegram ---
if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET && prodUrl) {
  console.log("→ Re-apontando webhook Telegram pra prod...");
  const setWh = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: `https://${prodUrl}/api/telegram/webhook`,
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      }),
    },
  );
  const setWhJson = await setWh.json();
  console.log("  webhook:", setWhJson);
}

console.log("\n=== DEPLOY OK ===");
console.log(`URL: https://${prodUrl}`);
