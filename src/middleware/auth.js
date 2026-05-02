import { query } from '../config/database.js';

export async function authMiddleware(request, reply) {
  const sessionId = request.cookies?.session_id;
  if (!sessionId) {
    if (request.url.startsWith('/api/admin')) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    request.user = null;
    return;
  }

  try {
    const result = await query(
      `SELECT s.id, s.user_id, u.email, u.name, u.role, u.is_active
       FROM sessions s JOIN users u ON s.user_id = u.id
       WHERE s.id = $1 AND s.expires_at > NOW() AND u.is_active = true`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      reply.clearCookie('session_id');
      request.user = null;
      if (request.url.startsWith('/api/admin')) {
        return reply.code(401).send({ error: 'Session expired' });
      }
      return;
    }

    request.user = result.rows[0];
  } catch (err) {
    console.error('[Auth] Error:', err.message);
    request.user = null;
  }
}
