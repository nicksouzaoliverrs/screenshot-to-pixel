// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// Vercel: vercel.json builds with NITRO_PRESET=vercel, which this config honours outside Lovable.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        // Registration happens only in src/lib/pwa.ts (guarded against dev/preview).
        injectRegister: null,
        registerType: "prompt",
        devOptions: { enabled: false },
        manifest: false, // static file: public/manifest.webmanifest
        filename: "sw.js",
        strategies: "generateSW",
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: false,
          navigateFallback: null,
          globPatterns: ["**/*.{js,css,woff2,png,svg,ico,webmanifest}", "offline.html"],
          globIgnores: ["**/splash/**"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          importScripts: ["/push-sw.js"],
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) =>
                request.mode === "navigate" && !url.pathname.startsWith("/~oauth") && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/__/"),
              handler: "NetworkFirst",
              options: {
                cacheName: "escala-pages",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 },
                precacheFallback: { fallbackURL: "/offline.html" },
              },
            },
            {
              urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com" || url.origin === "https://fonts.googleapis.com",
              handler: "StaleWhileRevalidate",
              options: { cacheName: "escala-fonts", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
          ],
        },
      }),
    ],
  },
});
