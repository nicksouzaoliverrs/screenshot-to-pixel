export type ThemePref = "claro" | "escuro" | "sistema";
const KEY = "escala-theme";

export function getThemePref(): ThemePref {
  if (typeof window === "undefined") return "sistema";
  return (localStorage.getItem(KEY) as ThemePref) || "sistema";
}

export function applyStoredTheme(pref: ThemePref = getThemePref()) {
  if (typeof window === "undefined") return;
  const dark = pref === "escuro" || (pref === "sistema" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function setThemePref(pref: ThemePref) {
  localStorage.setItem(KEY, pref);
  applyStoredTheme(pref);
}
