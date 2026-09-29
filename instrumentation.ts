/**
 * Runs once when the Next.js server starts (before it serves requests): migrations,
 * first-admin bootstrap and restoring running games (lib/server/bootstrap.ts).
 * Node.js runtime only; a failure is logged and never stops the server, since
 * ensureServerReady() retries from the first request that needs it.
 */

/** After SIGTERM/SIGINT: how long requests already in flight get before the final save and exit. */
const SHUTDOWN_GRACE_MS = 3_000;

export async function register() {
  // Keep the import INSIDE this constant-condition branch: bundlers drop the branch
  // for the edge compile. (An early `return` would not stop `pg` being bundled for edge.)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Graceful stop. Next.js stops accepting connections and waits for open ones, but
    // live game streams (SSE) never end on their own and browsers keep reusing their
    // keep-alive sockets, so without this every `docker compose restart` would wait out
    // the whole stop grace period and then be killed mid-write. The runtime saves and
    // closes the streams (clients back off and resume on the next process); after a
    // short grace for requests in flight, the final state is saved again and we exit.
    // (Only alongside Next's own handlers: with NEXT_MANUAL_SIG_HANDLE a listener here
    // would take over the signal.)
    if (!process.env.NEXT_MANUAL_SIG_HANDLE) {
      const { getGameRuntime } = await import("./lib/server/game-runtime");
      for (const signal of ["SIGTERM", "SIGINT"] as const) {
        process.once(signal, () => {
          const runtime = getGameRuntime();
          void (async () => {
            await runtime.shutdown();
            await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS));
            await runtime.flush();
            process.exit(signal === "SIGINT" ? 130 : 143);
          })();
        });
      }
    }
    try {
      const { ensureServerReady } = await import("./lib/server/bootstrap");
      await ensureServerReady();
    } catch (err) {
      console.error("[nusaquest] startup tasks failed:", err);
    }
  }
}
