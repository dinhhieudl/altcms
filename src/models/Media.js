import { query } from '../config/database.js';

export const Media = {
  async findById(id) {
    const result = await query('SELECT * FROM media WHERE id = $1', [id]);
    return result.rows[0];
  },

  async findAll({ page = 1, limit = 50, folder, mime_type } = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (folder) { conditions.push(`folder = $${idx++}`); params.push(folder); }
    if (mime_type) { conditions.push(`mime_type LIKE $${idx++}`); params.push(`${mime_type}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countResult = await query(`SELECT COUNT(*) FROM media ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const result = await query(
      `SELECT * FROM media ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`, params
    );

    return { media: result.rows, total };
  },

  async create(data) {
    const result = await query(
      `INSERT INTO media (filename, original_name, mime_type, size, width, height, url, alt_text, title, folder, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [data.filename, data.original_name, data.mime_type, data.size,
       data.width, data.height, data.url, data.alt_text, data.title,
       data.folder || '/', data.uploaded_by]
    );
    return result.rows[0];
  },

  async update(id, data) {
    const fields = [];
    const params = [];
    let idx = 1;

    for (const key of ['alt_text', 'title', 'folder']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        params.push(data[key]);
      }
    }

    if (fields.length === 0) return Media.findById(id);
    params.push(id);

    await query(`UPDATE media SET ${fields.join(', ')} WHERE id = $${idx}`, params);
    return Media.findById(id);
  },

  async delete(id) {
    const result = await query('DELETE FROM media WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  },
};
