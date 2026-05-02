import { requireRole } from '../../middleware/rbac.js';
import { Migrator } from '../../migration/migrator.js';

let migrator = null;

export default async function migrateRoutes(fastify) {
  // Test connection
  fastify.post('/api/admin/migrate/connect', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const { type, host, port, database, user, password, apiUrl, apiUser, apiPass } = request.body;

    try {
      if (type === 'database') {
        migrator = new Migrator({ type: 'database', host, port, database, user, password });
        await migrator.connect();
      } else if (type === 'api') {
        migrator = new Migrator({ type: 'api', apiUrl, apiUser, apiPass });
        await migrator.connect();
      } else {
        return reply.code(400).send({ error: 'Invalid connection type' });
      }

      return { ok: true, message: 'Connection successful' };
    } catch (err) {
      return reply.code(400).send({ error: `Connection failed: ${err.message}` });
    }
  });

  // Discover source data
  fastify.post('/api/admin/migrate/discover', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    if (!migrator) return reply.code(400).send({ error: 'No connection established. Call /connect first.' });

    try {
      const inventory = await migrator.discover();
      return { inventory };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Dry run
  fastify.post('/api/admin/migrate/dry-run', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    if (!migrator) return reply.code(400).send({ error: 'No connection established.' });

    try {
      const preview = await migrator.dryRun();
      return { preview };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Start full migration
  fastify.post('/api/admin/migrate/start', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    if (!migrator) return reply.code(400).send({ error: 'No connection established.' });

    try {
      // Run migration in background
      migrator.runFullMigration().catch(err => {
        console.error('[Migration] Error:', err);
      });

      return { ok: true, message: 'Migration started. Check /status for progress.' };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Get migration status
  fastify.get('/api/admin/migrate/status', { preHandler: [requireRole('admin')] }, async () => {
    if (!migrator) return { status: 'idle', message: 'No migration in progress' };
    return migrator.getStatus();
  });

  // Delta sync
  fastify.post('/api/admin/migrate/sync', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    if (!migrator) return reply.code(400).send({ error: 'No connection established.' });

    try {
      await migrator.deltaSync();
      return { ok: true, message: 'Delta sync completed' };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Validation report
  fastify.get('/api/admin/migrate/report', { preHandler: [requireRole('admin')] }, async () => {
    if (!migrator) return { report: null };
    return { report: migrator.getReport() };
  });
}
