// Cria o vector index em memory_chunks.embedding via Firestore Admin REST API.
// Usa o service account do Firebase Admin SDK pra autenticar (não precisa do firebase-tools CLI).
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
  credentials: {
    client_email: sa.client_email,
    private_key: sa.private_key,
  },
  scopes: ["https://www.googleapis.com/auth/datastore"],
});

const client = await auth.getClient();
const projectId = sa.project_id;
const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/memory_chunks/indexes`;

const indexBody = {
  queryScope: "COLLECTION",
  fields: [
    {
      fieldPath: "embedding",
      vectorConfig: {
        dimension: 1536,
        flat: {},
      },
    },
  ],
};

console.log("Creating vector index on memory_chunks.embedding (1536 dims, COSINE-ready)...");
const res = await client.request({
  url,
  method: "POST",
  data: indexBody,
});

console.log("Operation:", JSON.stringify(res.data, null, 2));
console.log("\nO índice está sendo criado em background. Pode levar 1-10 minutos.");
console.log("Status: https://console.firebase.google.com/project/" + projectId + "/firestore/indexes");
