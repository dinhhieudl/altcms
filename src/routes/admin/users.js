import { User } from '../../models/User.js';
import { requireRole } from '../../middleware/rbac.js';
import { paginate, paginationMeta } from '../../utils/pagination.js';
import { ROLES } from '../../config/constants.js';
import { query } from '../../config/database.js';

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

  fastify.put('/api/admin/users/:id', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const targetId = request.params.id;
    const updates = request.body;

    // Prevent self-demotion
    if (targetId === request.user.id && updates.role && updates.role !== request.user.role) {
      return reply.code(400).send({ error: 'Cannot change your own role' });
    }

    // Only admins can set admin/editor roles
    if (updates.role && [ROLES.ADMIN, ROLES.EDITOR].includes(updates.role)) {
      if (request.user.role !== ROLES.ADMIN) {
        return reply.code(403).send({ error: 'Only admins can assign admin/editor roles' });
      }
    }

    // Prevent demoting the last admin
    if (updates.role && updates.role !== ROLES.ADMIN) {
      const target = await User.findById(targetId);
      if (target?.role === ROLES.ADMIN) {
        const adminCount = await query("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = true");
        if (parseInt(adminCount.rows[0].count) <= 1) {
          return reply.code(400).send({ error: 'Cannot demote the last admin' });
        }
      }
    }

    const user = await User.update(targetId, updates);
    if (!user) return reply.code(404).send({ error: 'User not found' });

    // If password or role changed, invalidate all other sessions for this user
    if (updates.password || updates.role) {
      const currentSession = request.cookies?.session_id;
      await query('DELETE FROM sessions WHERE user_id = $1 AND id != $2', [targetId, currentSession]);
    }

    return { user };
  });

  fastify.delete('/api/admin/users/:id', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    if (request.params.id === request.user.id) {
      return reply.code(400).send({ error: 'Cannot delete yourself' });
    }

    // Prevent deleting the last admin
    const target = await User.findById(request.params.id);
    if (target?.role === ROLES.ADMIN) {
      const adminCount = await query("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = true");
      if (parseInt(adminCount.rows[0].count) <= 1) {
        return reply.code(400).send({ error: 'Cannot delete the last admin' });
      }
    }

    // Invalidate sessions
    await query('DELETE FROM sessions WHERE user_id = $1', [request.params.id]);
    await query('DELETE FROM users WHERE id = $1', [request.params.id]);
    return { ok: true };
  });
}
