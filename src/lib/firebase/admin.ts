import "server-only";

import { cert, getApp, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

function loadServiceAccount(): ServiceAccount {
  const inlinePrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (inlinePrivateKey && projectId && clientEmail) {
    return {
      projectId,
      clientEmail,
      privateKey: inlinePrivateKey.replace(/\\n/g, "\n"),
    };
  }

  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!path) {
    throw new Error(
      "Firebase Admin SDK não configurado. Defina FIREBASE_SERVICE_ACCOUNT_PATH (dev) " +
        "ou FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (prod).",
    );
  }
  const json = JSON.parse(readFileSync(path, "utf8"));
  return {
    projectId: json.project_id,
    clientEmail: json.client_email,
    privateKey: json.private_key,
  };
}

const adminApp: App = getApps().length
  ? getApp()
  : initializeApp({ credential: cert(loadServiceAccount()) });

export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore = getFirestore(adminApp);
