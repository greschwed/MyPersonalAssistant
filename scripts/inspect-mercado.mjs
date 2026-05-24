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

const snap = await db
  .collection("mercado")
  .orderBy("created_at", "desc")
  .limit(20)
  .get();

console.log(`mercado items (${snap.size}):`);
for (const doc of snap.docs) {
  const d = doc.data();
  const created = d.created_at?.toDate?.()?.toISOString?.() ?? "?";
  const bought = d.bought_at?.toDate?.()?.toISOString?.() ?? "—";
  const badge = d.status === "Comprado" ? "✓" : "•";
  console.log(`  ${badge} ${d.status.padEnd(10)} ${d.item.padEnd(15)} criado=${created} comprado=${bought}`);
}
