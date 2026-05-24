// Polla até o vector index ficar READY.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { GoogleAuth } = await import("google-auth-library");

const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const sa = JSON.parse(readFileSync(saPath, "utf8"));
const auth = new GoogleAuth({
  credentials: { client_email: sa.client_email, private_key: sa.private_key },
  scopes: ["https://www.googleapis.com/auth/datastore"],
});
const client = await auth.getClient();
const projectId = sa.project_id;

const listUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/memory_chunks/indexes`;

for (let i = 0; i < 30; i++) {
  const { data } = await client.request({ url: listUrl, method: "GET" });
  const vecIdx = (data.indexes ?? []).find((ix) =>
    (ix.fields ?? []).some((f) => f.fieldPath === "embedding" && f.vectorConfig),
  );
  const state = vecIdx?.state ?? "MISSING";
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${state}\n`);
  if (state === "READY") break;
  await new Promise((r) => setTimeout(r, 20000));
}
