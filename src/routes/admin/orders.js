import { Order } from '../../models/Order.js';
import { requirePermission } from '../../middleware/rbac.js';
import { paginate, paginationMeta } from '../../utils/pagination.js';

export default async function orderRoutes(fastify) {
  // List orders
  fastify.get('/api/admin/orders', { preHandler: [requirePermission('orders:read')] }, async (request) => {
    const { page, limit } = paginate(request.query);
    const { status, payment_status, search, dateFrom, dateTo } = request.query;

    const { orders, total } = await Order.findAll({ page, limit, status, payment_status, search, dateFrom, dateTo });
    return { orders, pagination: paginationMeta(total, page, limit) };
  });

  // Get order detail
  fastify.get('/api/admin/orders/:id', { preHandler: [requirePermission('orders:read')] }, async (request, reply) => {
    const order = await Order.findById(request.params.id);
    if (!order) return reply.code(404).send({ error: 'Order not found' });
    return { order };
  });

  // Update order status
  fastify.put('/api/admin/orders/:id/status', { preHandler: [requirePermission('orders:update')] }, async (request, reply) => {
    const { status, admin_note } = request.body;
    if (!status) return reply.code(400).send({ error: 'Status is required' });

    const order = await Order.updateStatus(request.params.id, status, admin_note);
    if (!order) return reply.code(404).send({ error: 'Order not found' });
    return { order };
  });
}
