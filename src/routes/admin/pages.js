import { Page } from '../../models/Page.js';
import { requirePermission } from '../../middleware/rbac.js';
import { paginate, paginationMeta } from '../../utils/pagination.js';

export default async function pageRoutes(fastify) {
  fastify.get('/api/admin/pages', { preHandler: [requirePermission('pages:read')] }, async (request) => {
    const { page, limit } = paginate(request.query);
    const { status, search } = request.query;
    const { pages, total } = await Page.findAll({ page, limit, status, search });
    return { pages, pagination: paginationMeta(total, page, limit) };
  });

  fastify.get('/api/admin/pages/:id', { preHandler: [requirePermission('pages:read')] }, async (request, reply) => {
    const page = await Page.findById(request.params.id);
    if (!page) return reply.code(404).send({ error: 'Page not found' });
    return { page };
  });

  fastify.post('/api/admin/pages', { preHandler: [requirePermission('pages:write')] }, async (request, reply) => {
    const data = request.body;
    data.author_id = request.user.id;
    if (!data.title) return reply.code(400).send({ error: 'Title is required' });
    if (!data.slug) data.slug = data.title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    const page = await Page.create(data);
    return reply.code(201).send({ page });
  });

  fastify.put('/api/admin/pages/:id', { preHandler: [requirePermission('pages:write')] }, async (request) => {
    const page = await Page.update(request.params.id, request.body);
    return { page };
  });

  fastify.delete('/api/admin/pages/:id', { preHandler: [requirePermission('pages:delete')] }, async (request) => {
    await Page.delete(request.params.id);
    return { ok: true };
  });
}
