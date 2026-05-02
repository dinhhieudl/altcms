import { Product } from '../../models/Product.js';
import { requirePermission } from '../../middleware/rbac.js';
import { paginate, paginationMeta } from '../../utils/pagination.js';

export default async function productRoutes(fastify) {
  // List products (admin)
  fastify.get('/api/admin/products', { preHandler: [requirePermission('products:read')] }, async (request) => {
    const { page, limit } = paginate(request.query);
    const { status, type, search, sort, order } = request.query;

    const { products, total } = await Product.findAll({ page, limit, status, type, search, sort, order });
    return { products, pagination: paginationMeta(total, page, limit) };
  });

  // Get single product
  fastify.get('/api/admin/products/:id', { preHandler: [requirePermission('products:read')] }, async (request, reply) => {
    const product = await Product.findById(request.params.id);
    if (!product) return reply.code(404).send({ error: 'Product not found' });
    return { product };
  });

  // Create product
  fastify.post('/api/admin/products', { preHandler: [requirePermission('products:write')] }, async (request, reply) => {
    const data = request.body;
    data.created_by = request.user.id;

    if (!data.name) return reply.code(400).send({ error: 'Product name is required' });

    const product = await Product.create(data);
    return reply.code(201).send({ product });
  });

  // Update product
  fastify.put('/api/admin/products/:id', { preHandler: [requirePermission('products:write')] }, async (request, reply) => {
    const product = await Product.update(request.params.id, request.body);
    if (!product) return reply.code(404).send({ error: 'Product not found' });
    return { product };
  });

  // Delete product
  fastify.delete('/api/admin/products/:id', { preHandler: [requirePermission('products:delete')] }, async (request, reply) => {
    const result = await Product.delete(request.params.id);
    if (!result) return reply.code(404).send({ error: 'Product not found' });
    return { ok: true };
  });

  // Bulk actions
  fastify.post('/api/admin/products/bulk', { preHandler: [requirePermission('products:write')] }, async (request) => {
    const { action, ids } = request.body;
    const results = [];

    for (const id of ids) {
      try {
        if (action === 'delete') {
          await Product.delete(id);
        } else if (['published', 'draft', 'archived'].includes(action)) {
          await Product.update(id, { status: action });
        }
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: err.message });
      }
    }

    return { results };
  });
}
