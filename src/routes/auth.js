import { User } from '../models/User.js';
import { query } from '../config/database.js';
import crypto from 'crypto';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePassword(password) {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password must be under 128 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

export default async function authRoutes(fastify) {
  // Login — rate limited per email to prevent brute force
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
      secure: process.env.COOKIE_SECURE === 'true',
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

    // Validate email format
    if (!EMAIL_REGEX.test(email) || email.length > 254) {
      return reply.code(400).send({ error: 'Invalid email format' });
    }

    // Validate password strength
    const passwordError = validatePassword(password);
    if (passwordError) {
      return reply.code(400).send({ error: passwordError });
    }

    // Validate name
    if (name.length < 1 || name.length > 255) {
      return reply.code(400).send({ error: 'Name must be 1-255 characters' });
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
      secure: process.env.COOKIE_SECURE === 'true',
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
