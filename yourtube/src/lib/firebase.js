import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  inMemoryPersistence,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().find((a) => a.name === "[DEFAULT]") ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);
const storage = getStorage(app);

// Test-only: end-to-end tests run the app against the local emulators and
// sign in with email/password (Google sign-in can't be automated). Never set
// NEXT_PUBLIC_USE_EMULATORS in a real deployment.
if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true" && typeof window !== "undefined" && !window.__yourtubeTest) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  window.__yourtubeTest = { signIn: (email, password) => signInWithEmailAndPassword(auth, email, password) };
}

let otpAuth = null;

/**
 * A second, in-memory auth instance used only to receive the SMS code via
 * Firebase Phone Auth, so the Google session in `auth` is never replaced.
 */
export function getOtpAuth() {
  if (otpAuth) return otpAuth;
  const otpApp = getApps().find((a) => a.name === "otp") ?? initializeApp(firebaseConfig, "otp");
  try {
    otpAuth = initializeAuth(otpApp, { persistence: inMemoryPersistence });
  } catch {
    otpAuth = getAuth(otpApp);
  }
  return otpAuth;
}

export { auth, provider, db, storage, getApp };
