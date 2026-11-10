import { createMiddleware } from "@tanstack/react-start";

/** Browser side: attaches the current Firebase ID token to every server function call. */
export const attachFirebaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  let token = "";
  try {
    const { isFirebaseConfigured } = await import("@/lib/firebase/config");
    if (isFirebaseConfigured) {
      const { fbAuth } = await import("@/lib/firebase/client");
      const user = fbAuth().currentUser;
      if (user) token = await user.getIdToken();
    }
  } catch {
    /* not signed in */
  }
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
