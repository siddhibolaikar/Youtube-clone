import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function createApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  // Emulators need only a project id.
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return initializeApp({ projectId: projectId || "demo-yourtube" });
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Vercel/.env store the key on one line with literal "\n" sequences.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin is not configured: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY"
    );
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export const adminApp = () => createApp();
export const adminAuth = () => getAuth(createApp());
export const adminDb = () => getFirestore(createApp());
