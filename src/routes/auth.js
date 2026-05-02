import { User } from '../../models/User.js';
import { query } from '../../config/database.js';
import { nanoid } from 'nanoid';

export default async function authRoutes(fastify) {
  // Login
  fastify.post('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body;
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password required' });
    }

    const user = await User.verifyPassword(email, password);
    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Create session
    const sessionResult = await query(
      `INSERT INTO sessions (user_id, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days') RETURNING id`,
      [user.id, request.ip, request.headers['user-agent']]
    );

    reply.setCookie('session_id', sessionResult.rows[0].id, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });

    return { user };
  });

  // Register
  fastify.post('/api/auth/register', async (request, reply) => {
    const { email, password, name, phone } = request.body;
    if (!email || !password || !name) {
      return reply.code(400).send({ error: 'Email, password, and name required' });
    }

    const existing = await User.findByEmail(email);
    if (existing) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const user = await User.create({ email, password, name, phone, role: 'customer' });

    // Auto-login
    const sessionResult = await query(
      `INSERT INTO sessions (user_id, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days') RETURNING id`,
      [user.id, request.ip, request.headers['user-agent']]
    );

    reply.setCookie('session_id', sessionResult.rows[0].id, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });

    return { user };
  });

  // Logout
  fastify.post('/api/auth/logout', async (request, reply) => {
    const sessionId = request.cookies?.session_id;
    if (sessionId) {
      await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    }
    reply.clearCookie('session_id');
    return { ok: true };
  });

  // Get current user
  fastify.get('/api/auth/me', async (request) => {
    if (!request.user) return { user: null };
    return { user: request.user };
  });
}
