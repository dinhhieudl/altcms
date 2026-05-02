import { requireRole } from '../../middleware/rbac.js';
import { Migrator } from '../../migration/migrator.js';

let migrator = null;
let migrationLock = false;

// Allowlist for migration DB hosts — prevents SSRF into internal networks
const ALLOWED_HOSTS = (process.env.MIGRATION_HOSTS || 'localhost,127.0.0.1,::1').split(',');

function isAllowedHost(host) {
  if (!host) return false;
  const h = host.toLowerCase().trim();
  return ALLOWED_HOSTS.some(allowed => allowed.toLowerCase().trim() === h);
}

export default async function migrateRoutes(fastify) {
  // Test connection
  fastify.post('/api/admin/migrate/connect', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const { type, host, port, database, user, password, apiUrl, apiUser, apiPass } = request.body;

    try {
      if (type === 'database') {
        if (!isAllowedHost(host)) {
          return reply.code(403).send({ error: `Host "${host}" not allowed. Set MIGRATION_HOSTS env to allow additional hosts.` });
        }
        migrator = new Migrator({ type: 'database', host, port, database, user, password });
        await migrator.connect();
      } else if (type === 'api') {
        // Validate apiUrl is HTTPS or localhost
        try {
          const url = new URL(apiUrl);
          if (!['https:', 'http:'].includes(url.protocol)) {
            return reply.code(400).send({ error: 'Only HTTP/HTTPS URLs allowed' });
          }
          if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
            return reply.code(403).send({ error: 'HTTPS required for non-localhost API connections' });
          }
        } catch {
          return reply.code(400).send({ error: 'Invalid API URL' });
        }
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

    if (migrationLock) {
      return reply.code(409).send({ error: 'Migration already in progress. Check /status.' });
    }

    try {
      migrationLock = true;
      // Run migration in background, release lock when done
      migrator.runFullMigration()
        .catch(err => { console.error('[Migration] Error:', err); })
        .finally(() => { migrationLock = false; });

      return { ok: true, message: 'Migration started. Check /status for progress.' };
    } catch (err) {
      migrationLock = false;
      return reply.code(500).send({ error: err.message });
    }
  });

  // Get migration status
  fastify.get('/api/admin/migrate/status', { preHandler: [requireRole('admin')] }, async () => {
    if (!migrator) return { status: 'idle', message: 'No migration in progress' };
    return { ...migrator.getStatus(), locked: migrationLock };
  });

  // Delta sync
  fastify.post('/api/admin/migrate/sync', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    if (!migrator) return reply.code(400).send({ error: 'No connection established.' });
    if (migrationLock) return reply.code(409).send({ error: 'Migration already in progress.' });

    try {
      migrationLock = true;
      await migrator.deltaSync();
      return { ok: true, message: 'Delta sync completed' };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    } finally {
      migrationLock = false;
    }
  });

  // Validation report
  fastify.get('/api/admin/migrate/report', { preHandler: [requireRole('admin')] }, async () => {
    if (!migrator) return { report: null };
    return { report: migrator.getReport() };
  });
}
