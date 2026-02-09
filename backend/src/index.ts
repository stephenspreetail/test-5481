import { buildApp } from "./app.js";
import { config } from "./config/index.js";
import { closeDatabase } from "./db/index.js";
import { authService } from "./services/auth.service.js";

async function main() {
  const app = await buildApp();

  // Graceful shutdown with guard against multiple calls
  let isShuttingDown = false;
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

  signals.forEach((signal) => {
    process.on(signal, async () => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      app.log.info(`Received ${signal}, shutting down gracefully...`);

      // Force exit after 5 seconds if graceful shutdown hangs
      const forceExitTimeout = setTimeout(() => {
        app.log.warn("Graceful shutdown timed out, forcing exit");
        process.exit(1);
      }, 5000);

      try {
        await app.close();
        await closeDatabase();
        clearTimeout(forceExitTimeout);
        process.exit(0);
      } catch (err) {
        app.log.error("Error during shutdown:", err);
        clearTimeout(forceExitTimeout);
        process.exit(1);
      }
    });
  });

  try {
    await app.listen({ port: config.BACKEND_PORT, host: config.BACKEND_HOST });
    app.log.info(`Server running at http://${config.BACKEND_HOST}:${config.BACKEND_PORT}`);

    // Clean up expired refresh tokens periodically
    const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
    const runTokenCleanup = async () => {
      try {
        const count = await authService.cleanupExpiredTokens();
        if (count > 0) {
          app.log.info(`[Auth] Cleaned up ${count} expired refresh tokens`);
        }
      } catch (err) {
        app.log.error("[Auth] Failed to clean up expired tokens:", err);
      }
    };
    runTokenCleanup(); // Run once at startup
    setInterval(runTokenCleanup, CLEANUP_INTERVAL_MS);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
