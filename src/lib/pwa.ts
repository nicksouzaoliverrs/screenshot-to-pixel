// Single guarded service-worker registration point. Never registers in dev, inside iframes,
// or on Lovable preview hosts; unregisters stale app workers there. Vercel/custom domains are allowed.
const PROJECT_ID = "d36dfd2d-24c0-4b79-a021-98d7924152a8";
const PREVIEW_LABEL = /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/;

function isPreviewHost(host: string) {
  for (const d of [".lovable.app", ".gpt-eng.com", ".gptengineer.run"]) {
    if (host.endsWith(d)) {
      const label = host.slice(0, -d.length).split(".")[0] ?? "";
      if (PREVIEW_LABEL.test(label)) return true;
      if (label === `project--${PROJECT_ID}-dev`) return true;
    }
  }
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  return false;
}

function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** True when this context may run the app's service worker (and therefore web push). */
export function serviceWorkerAllowed(): boolean {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false;
  if (inIframe()) return false;
  if (isPreviewHost(window.location.hostname.toLowerCase())) return false;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return false;
  return true;
}

async function unregisterAppWorkers() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.filter((r) => [r.active, r.waiting, r.installing].some((w) => w?.scriptURL.endsWith("/sw.js"))).map((r) => r.unregister()),
    );
  } catch {
    /* ignore */
  }
}

type UpdateListener = (apply: () => void) => void;
let onUpdate: UpdateListener | null = null;
let pendingApply: (() => void) | null = null;
/** Controlled updates: the UI shows "Nova versão disponível" and applies it on tap. */
export function onAppUpdate(cb: UpdateListener) {
  onUpdate = cb;
  if (pendingApply) cb(pendingApply);
}

let started = false;
export async function registerPWA() {
  if (started || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  started = true;
  if (!serviceWorkerAllowed()) {
    await unregisterAppWorkers();
    return;
  }
  const { Workbox } = await import("workbox-window");
  const wb = new Workbox("/sw.js", { scope: "/" });
  wb.addEventListener("waiting", () => {
    const apply = () => {
      wb.addEventListener("controlling", () => window.location.reload());
      wb.messageSkipWaiting();
    };
    pendingApply = apply;
    onUpdate?.(apply);
  });
  await wb.register();
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
