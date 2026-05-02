import { buildApp } from './app.js';
import { config } from './config/app.js';
import { healthCheck } from './config/database.js';
import { runMigrations } from './migrations/run.js';

async function start() {
  try {
    // Run database migrations
    await runMigrations();

    // Check DB health
    const dbHealth = await healthCheck();
    if (!dbHealth.ok) {
      console.error('[Server] Database health check failed:', dbHealth.error);
      process.exit(1);
    }
    console.log('[Server] Database connected:', dbHealth.time);

    // Build and start app
    const app = await buildApp();

    await app.listen({ port: config.port, host: config.host });
    console.log(`[Server] altCMS running at http://${config.host}:${config.port}`);
    console.log(`[Server] Admin panel: http://localhost:${config.port}/admin`);
    console.log(`[Server] Admin login: ${config.admin.email} / ${config.admin.password}`);

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n[Server] ${signal} received, shutting down...`);
      await app.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

start();
