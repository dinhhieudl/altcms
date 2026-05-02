import { query } from '../config/database.js';

export const Page = {
  async findById(id) {
    const result = await query('SELECT * FROM pages WHERE id = $1', [id]);
    return result.rows[0];
  },

  async findBySlug(slug) {
    const result = await query('SELECT * FROM pages WHERE slug = $1 AND status = $2', [slug, 'published']);
    return result.rows[0];
  },

  async findAll({ page = 1, limit = 50, status, search } = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (search) {
      conditions.push(`(title ILIKE $${idx} OR content ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countResult = await query(`SELECT COUNT(*) FROM pages ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const result = await query(
      `SELECT id, slug, title, template, status, featured_image, sort_order, created_at
       FROM pages ${where} ORDER BY sort_order, created_at DESC LIMIT $${idx++} OFFSET $${idx}`, params
    );

    return { pages: result.rows, total };
  },

  async create(data) {
    const result = await query(
      `INSERT INTO pages (slug, title, content, template, status, meta_title,
       meta_description, og_image, featured_image, custom_fields, author_id, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [data.slug, data.title, data.content, data.template || 'default',
       data.status || 'draft', data.meta_title, data.meta_description, data.og_image,
       data.featured_image, JSON.stringify(data.custom_fields || {}),
       data.author_id, data.sort_order || 0]
    );
    return result.rows[0];
  },

  async update(id, data) {
    const fields = [];
    const params = [];
    let idx = 1;

    for (const key of ['slug', 'title', 'content', 'template', 'status', 'meta_title',
      'meta_description', 'canonical_url', 'og_title', 'og_description', 'og_image',
      'featured_image', 'custom_fields', 'sort_order']) {
      if (data[key] !== undefined) {
        const val = key === 'custom_fields' ? JSON.stringify(data[key]) : data[key];
        fields.push(`${key} = $${idx++}`);
        params.push(val);
      }
    }

    if (fields.length === 0) return Page.findById(id);
    fields.push('updated_at = NOW()');
    params.push(id);

    await query(`UPDATE pages SET ${fields.join(', ')} WHERE id = $${idx}`, params);
    return Page.findById(id);
  },

  async delete(id) {
    const result = await query('DELETE FROM pages WHERE id = $1 RETURNING id', [id]);
    return result.rows[0];
  },
};
