import { config } from './config.js';
import { buildServer } from './api/server.js';
import { startScheduler, stopScheduler } from './scheduler/index.js';
import { pool } from './db/client.js';

const app = await buildServer();
await app.listen({ port: config.port, host: '0.0.0.0' });
startScheduler();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    stopScheduler();
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
