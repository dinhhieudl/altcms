import { User } from '../../models/User.js';
import { requireRole } from '../../middleware/rbac.js';
import { paginate, paginationMeta } from '../../utils/pagination.js';

export default async function userRoutes(fastify) {
  fastify.get('/api/admin/users', { preHandler: [requireRole('admin')] }, async (request) => {
    const { page, limit } = paginate(request.query);
    const { role, search } = request.query;
    const { users, total } = await User.findAll({ page, limit, role, search });
    return { users, pagination: paginationMeta(total, page, limit) };
  });

  fastify.get('/api/admin/users/:id', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const user = await User.findById(request.params.id);
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return { user };
  });

  fastify.put('/api/admin/users/:id', { preHandler: [requireRole('admin')] }, async (request) => {
    const user = await User.update(request.params.id, request.body);
    return { user };
  });

  fastify.delete('/api/admin/users/:id', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    if (request.params.id === request.user.id) {
      return reply.code(400).send({ error: 'Cannot delete yourself' });
    }
    const { query } = await import('../../config/database.js');
    await query('DELETE FROM users WHERE id = $1', [request.params.id]);
    return { ok: true };
  });
}
