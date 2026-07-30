import { loadCloudAuthConfig } from "./config.ts";
import { createDatabasePool } from "./db/pool.ts";
import { buildAuthServer } from "./server.ts";
import { createEmailOutboxWorker } from "./services/emailOutboxWorker.ts";

async function main(): Promise<void> {
  const config = loadCloudAuthConfig();
  const pool = createDatabasePool(config.databaseUrl);
  const server = await buildAuthServer(config, pool);
  const emailWorker = config.smtp ? createEmailOutboxWorker(pool, config.smtp) : null;
  emailWorker?.start();

  const shutdown = async (signal: string): Promise<void> => {
    server.log.info({ signal }, "shutting down authentication service");
    emailWorker?.stop();
    await server.close();
    await pool.end();
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await server.listen({ host: config.host, port: config.port });
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`authentication service failed to start: ${message}\n`);
  process.exitCode = 1;
});
