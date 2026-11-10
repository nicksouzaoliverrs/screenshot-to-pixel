// Web push via Firebase Cloud Messaging, using the app's own service worker (sw.js + push-sw.js).
import { firebaseVapidKey, isFirebaseConfigured } from "./firebase/config";
import { isIOS, isStandalone, serviceWorkerAllowed } from "./pwa";

export type PushState = "unconfigured" | "unsupported" | "preview" | "ios-install" | "denied" | "on" | "off";
const LS_KEY = "escala-push-token";

export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (!isFirebaseConfigured || !firebaseVapidKey) return "unconfigured";
  if (isIOS() && !isStandalone()) return "ios-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (!serviceWorkerAllowed()) return "preview";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && localStorage.getItem(LS_KEY) ? "on" : "off";
}

/** Must be called from a tap (browsers ignore permission prompts without a user gesture). */
export async function enablePush() {
  const { isSupported, getMessaging, getToken } = await import("firebase/messaging");
  if (!(await isSupported())) throw new Error("Este navegador não suporta notificações.");
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permissão de notificações negada. Libere nas configurações do navegador.");
  const reg = await navigator.serviceWorker.ready;
  const { fbApp } = await import("./firebase/client");
  const token = await getToken(getMessaging(fbApp()), { vapidKey: firebaseVapidKey, serviceWorkerRegistration: reg });
  if (!token) throw new Error("Não foi possível ativar as notificações neste aparelho.");
  const { registerPushToken } = await import("./api/push.functions");
  await registerPushToken({ data: { token, ua: navigator.userAgent.slice(0, 400) } });
  localStorage.setItem(LS_KEY, token);
}

export async function disablePush() {
  const token = localStorage.getItem(LS_KEY);
  try {
    const { getMessaging, deleteToken } = await import("firebase/messaging");
    const { fbApp } = await import("./firebase/client");
    await deleteToken(getMessaging(fbApp()));
  } catch {
    /* ignore */
  }
  if (token) {
    const { unregisterPushToken } = await import("./api/push.functions");
    await unregisterPushToken({ data: { token } }).catch(() => {});
  }
  localStorage.removeItem(LS_KEY);
}
