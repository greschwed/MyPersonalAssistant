// Lista todos os usuários do Firebase Auth (admin SDK).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { initializeApp, cert, getApps } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");

const sa = JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8"));
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    }),
  });
}

const list = await getAuth().listUsers(50);
const allowed = (process.env.ALLOWED_FIREBASE_UIDS ?? process.env.ALLOWED_FIREBASE_UID ?? "")
  .split(",").map(s => s.trim()).filter(Boolean);

console.log(`total: ${list.users.length}\n`);
for (const u of list.users) {
  const flag = allowed.includes(u.uid) ? "✓ allowed" : "  blocked";
  const created = u.metadata.creationTime;
  console.log(`${flag}  ${u.uid}  ${u.email ?? "—"}  (${u.displayName ?? "—"})`);
  console.log(`           criado=${created}`);
}
