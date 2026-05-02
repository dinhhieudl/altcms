import { Taxonomy } from '../../models/Taxonomy.js';
import { requirePermission } from '../../middleware/rbac.js';

export default async function taxonomyRoutes(fastify) {
  fastify.get('/api/admin/taxonomies', { preHandler: [requirePermission('taxonomies:read')] }, async (request) => {
    const { type, parent_id, search } = request.query;
    const taxonomies = await Taxonomy.findAll({ type, parent_id, search });
    return { taxonomies };
  });

  fastify.get('/api/admin/taxonomies/tree', { preHandler: [requirePermission('taxonomies:read')] }, async (request) => {
    const { type } = request.query;
    const tree = await Taxonomy.findTree(type);
    return { tree };
  });

  fastify.post('/api/admin/taxonomies', { preHandler: [requirePermission('taxonomies:write')] }, async (request, reply) => {
    if (!request.body.name || !request.body.type) {
      return reply.code(400).send({ error: 'Name and type are required' });
    }
    if (!request.body.slug) {
      request.body.slug = request.body.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    }
    const taxonomy = await Taxonomy.create(request.body);
    return reply.code(201).send({ taxonomy });
  });

  fastify.put('/api/admin/taxonomies/:id', { preHandler: [requirePermission('taxonomies:write')] }, async (request) => {
    const taxonomy = await Taxonomy.update(request.params.id, request.body);
    return { taxonomy };
  });

  fastify.delete('/api/admin/taxonomies/:id', { preHandler: [requirePermission('taxonomies:write')] }, async (request) => {
    await Taxonomy.delete(request.params.id);
    return { ok: true };
  });
}
