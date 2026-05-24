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
const { getFirestore } = await import("firebase-admin/firestore");

const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const sa = JSON.parse(readFileSync(saPath, "utf8"));
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    }),
  });
}
const db = getFirestore();

const limit = Number(process.argv[2] ?? 15);
const snap = await db
  .collection("audit_log")
  .orderBy("created_at", "desc")
  .limit(limit)
  .get();

for (const doc of snap.docs) {
  const d = doc.data();
  const ts = d.created_at?.toDate?.()?.toISOString?.() ?? "?";
  console.log(`${ts}  ${d.action}  resource=${d.resource_type}#${d.resource_id ?? "-"}`);
  console.log(`  meta: ${JSON.stringify(d.metadata)}`);
}
console.log(`total: ${snap.size}`);
