import { query, transaction } from '../config/database.js';
import bcrypt from 'bcryptjs';

export const User = {
  async findById(id) {
    const result = await query(
      `SELECT id, email, name, role, avatar_url, phone, is_active, last_login_at, created_at
       FROM users WHERE id = $1`, [id]
    );
    return result.rows[0];
  },

  async findByEmail(email) {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  },

  async findAll({ page = 1, limit = 20, role, search } = {}) {
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (role) { conditions.push(`role = $${paramIdx++}`); params.push(role); }
    if (search) {
      conditions.push(`(name ILIKE $${paramIdx} OR email ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countResult = await query(`SELECT COUNT(*) FROM users ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const result = await query(
      `SELECT id, email, name, role, is_active, created_at FROM users ${where}
       ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`, params
    );

    return { users: result.rows, total };
  },

  async create({ email, password, name, role = 'customer', phone }) {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (email, password_hash, name, role, phone)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role, created_at`,
      [email, passwordHash, name, role, phone]
    );
    return result.rows[0];
  },

  async update(id, data) {
    const fields = [];
    const params = [];
    let idx = 1;

    for (const [key, value] of Object.entries(data)) {
      if (['name', 'email', 'role', 'phone', 'avatar_url', 'is_active'].includes(key)) {
        fields.push(`${key} = $${idx++}`);
        params.push(value);
      }
    }

    if (data.password) {
      fields.push(`password_hash = $${idx++}`);
      params.push(await bcrypt.hash(data.password, 12));
    }

    fields.push(`updated_at = NOW()`);
    params.push(id);

    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, email, name, role, is_active, updated_at`, params
    );
    return result.rows[0];
  },

  async verifyPassword(email, password) {
    const user = await User.findByEmail(email);
    if (!user || !user.is_active) return null;
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return null;
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  },
};
