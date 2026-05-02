import { query } from '../config/database.js';

export const Redirect = {
  async findByPath(path) {
    // Try exact match first
    let result = await query(
      'SELECT * FROM redirects WHERE old_path = $1 AND is_active = true AND is_regex = false',
      [path]
    );
    if (result.rows[0]) return result.rows[0];

    // Try regex matches
    const regexRedirects = await query(
      'SELECT * FROM redirects WHERE is_active = true AND is_regex = true ORDER BY created_at'
    );

    for (const r of regexRedirects.rows) {
      try {
        if (new RegExp(r.old_path).test(path)) {
          await query('UPDATE redirects SET hit_count = hit_count + 1 WHERE id = $1', [r.id]);
          return r;
        }
      } catch (e) { /* invalid regex, skip */ }
    }

    return null;
  },

  async findAll({ page = 1, limit = 50 } = {}) {
    const offset = (page - 1) * limit;
    const countResult = await query('SELECT COUNT(*) FROM redirects');
    const total = parseInt(countResult.rows[0].count);
    const result = await query(
      'SELECT * FROM redirects ORDER BY hit_count DESC, old_path LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return { redirects: result.rows, total };
  },

  async create(data) {
    const result = await query(
      `INSERT INTO redirects (old_path, new_path, status_code, is_regex)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (old_path) WHERE NOT is_regex
       DO UPDATE SET new_path = $2, status_code = $3 RETURNING *`,
      [data.old_path, data.new_path, data.status_code || 301, data.is_regex || false]
    );
    return result.rows[0];
  },

  async createBulk(redirects) {
    for (const r of redirects) {
      await Redirect.create(r);
    }
  },

  async delete(id) {
    await query('DELETE FROM redirects WHERE id = $1', [id]);
  },
};
