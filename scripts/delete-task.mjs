// Deleta uma task pelo ID e nullifica a referência no raw_capture.
// Uso: node scripts/delete-task.mjs <taskId>
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
const { getFirestore, FieldValue } = await import("firebase-admin/firestore");

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

const taskId = process.argv[2];
if (!taskId) {
  console.error("usage: node scripts/delete-task.mjs <taskId>");
  process.exit(1);
}

const taskRef = db.collection("tasks").doc(taskId);
const taskSnap = await taskRef.get();
if (!taskSnap.exists) {
  console.error(`task ${taskId} not found`);
  process.exit(1);
}
const task = taskSnap.data();
console.log("deleting task:", { id: taskId, title: task.title, capture: task.capture_id });

await taskRef.delete();

if (task.capture_id) {
  await db.collection("raw_captures").doc(task.capture_id).update({
    routed_to: null,
    routed_id: null,
    routed_ids: [],
  });
  console.log("cleared routed_to on raw_capture", task.capture_id);
}

await db.collection("audit_log").add({
  user_id: task.user_id,
  action: "delete_task",
  resource_type: "task",
  resource_id: taskId,
  metadata: { reason: "stray task from query intent", capture_id: task.capture_id ?? null },
  created_at: FieldValue.serverTimestamp(),
});
console.log("audit log written");
