import { createFileRoute } from "@tanstack/react-router";

// Scheduled job: reminders (day of event, 2h before, pending confirmation), scheduled notices and
// push retries. Called by Vercel Cron (Authorization: Bearer $CRON_SECRET) or any external scheduler.
async function run(request: Request) {
  const secret = process.env["CRON_SECRET"];
  const auth = request.headers.get("authorization") ?? "";
  const url = new URL(request.url);
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : url.searchParams.get("key") ?? "";
  if (!secret || provided !== secret) return new Response("Unauthorized", { status: 401 });

  const { runReminders } = await import("@/lib/server/jobs.server");
  try {
    const result = await runReminders(Date.now());
    return Response.json(result);
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/reminders")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
