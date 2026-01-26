import { buildApp } from "./app.js";
import { config } from "./config/index.js";
import { closeDatabase } from "./db/index.js";

async function main() {
  const app = await buildApp();

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      await app.close();
      await closeDatabase();
      process.exit(0);
    });
  });

  try {
    await app.listen({ port: config.BACKEND_PORT, host: config.BACKEND_HOST });
    app.log.info(`Server running at http://${config.BACKEND_HOST}:${config.BACKEND_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
