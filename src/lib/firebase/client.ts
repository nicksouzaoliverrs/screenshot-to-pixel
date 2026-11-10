// Browser-only Firebase singletons. Never call these during SSR or at module scope.
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { firebaseConfig, isFirebaseConfigured } from "./config";

let app: FirebaseApp | undefined;
let db: Firestore | undefined;

export function fbApp(): FirebaseApp {
  if (!isFirebaseConfigured) throw new Error("Firebase ainda não foi configurado.");
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export function fbAuth(): Auth {
  return getAuth(fbApp());
}

export function fbDb(): Firestore {
  if (db) return db;
  const a = fbApp();
  try {
    // Offline cache: previously loaded data stays readable without internet and
    // queued writes sync once the connection is back (document ids are fixed, so no duplicates).
    db = initializeFirestore(a, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = getFirestore(a);
  }
  return db;
}
