// Firebase web config is public by design (it identifies the project; security comes from
// Firestore rules and server-side token checks). Values come from VITE_FIREBASE_* env vars
// (set them on Vercel too) or from the constants below.
const FALLBACK = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  vapidKey: "",
};

function env(name: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[name];
  return typeof v === "string" ? v.trim() : "";
}

export const firebaseConfig = {
  apiKey: env("VITE_FIREBASE_API_KEY") || FALLBACK.apiKey,
  authDomain: env("VITE_FIREBASE_AUTH_DOMAIN") || FALLBACK.authDomain,
  projectId: env("VITE_FIREBASE_PROJECT_ID") || FALLBACK.projectId,
  storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET") || FALLBACK.storageBucket,
  messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID") || FALLBACK.messagingSenderId,
  appId: env("VITE_FIREBASE_APP_ID") || FALLBACK.appId,
};

export const firebaseVapidKey = env("VITE_FIREBASE_VAPID_KEY") || FALLBACK.vapidKey;

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
