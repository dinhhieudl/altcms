import { Setting } from '../../models/Setting.js';
import { requireRole } from '../../middleware/rbac.js';

export default async function settingsRoutes(fastify) {
  fastify.get('/api/admin/settings', { preHandler: [requireRole('admin', 'editor')] }, async (request) => {
    const { group } = request.query;
    const settings = await Setting.getAll(group);
    return { settings };
  });

  fastify.put('/api/admin/settings', { preHandler: [requireRole('admin')] }, async (request) => {
    const { group, settings } = request.body;
    await Setting.setMany(settings, group);
    return { ok: true };
  });
}
