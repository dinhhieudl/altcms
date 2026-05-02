import { query } from '../config/database.js';

export const Post = {
  async findById(id) {
    const result = await query(
      `SELECT p.*, u.name as author_name FROM posts p
       LEFT JOIN users u ON p.author_id = u.id WHERE p.id = $1`, [id]
    );
    const post = result.rows[0];
    if (!post) return null;

    const taxes = await query(
      `SELECT t.* FROM taxonomies t
       JOIN content_taxonomies ct ON t.id = ct.taxonomy_id
       WHERE ct.content_id = $1 AND ct.content_type = 'post'`, [id]
    );
    post.taxonomies = taxes.rows;
    return post;
  },

  async findBySlug(slug) {
    const result = await query('SELECT id FROM posts WHERE slug = $1 AND status = $2', [slug, 'published']);
    return result.rows[0] ? Post.findById(result.rows[0].id) : null;
  },

  async findAll({ page = 1, limit = 20, status, author_id, category, search } = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) { conditions.push(`p.status = $${idx++}`); params.push(status); }
    if (author_id) { conditions.push(`p.author_id = $${idx++}`); params.push(author_id); }
    if (search) {
      conditions.push(`to_tsvector('english', p.title || ' ' || COALESCE(p.content, '')) @@ plainto_tsquery('english', $${idx})`);
      params.push(search);
      idx++;
    }
    if (category) {
      conditions.push(`EXISTS (
        SELECT 1 FROM content_taxonomies ct JOIN taxonomies t ON ct.taxonomy_id = t.id
        WHERE ct.content_id = p.id AND ct.content_type = 'post' AND t.slug = $${idx++}
      )`);
      params.push(category);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countResult = await query(`SELECT COUNT(*) FROM posts p ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const result = await query(
      `SELECT p.id, p.slug, p.title, p.excerpt, p.status, p.featured_image,
              p.published_at, p.created_at, u.name as author_name
       FROM posts p LEFT JOIN users u ON p.author_id = u.id
       ${where} ORDER BY p.published_at DESC NULLS LAST, p.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`, params
    );

    return { posts: result.rows, total };
  },

  async create(data) {
    const result = await query(
      `INSERT INTO posts (slug, title, content, excerpt, format, status, meta_title,
       meta_description, og_image, featured_image, custom_fields, author_id, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [data.slug, data.title, data.content, data.excerpt, data.format || 'standard',
       data.status || 'draft', data.meta_title, data.meta_description, data.og_image,
       data.featured_image, JSON.stringify(data.custom_fields || {}), data.author_id,
       data.status === 'published' ? (data.published_at || new Date()) : null]
    );
    return result.rows[0];
  },

  async update(id, data) {
    const fields = [];
    const params = [];
    let idx = 1;

    const allowed = ['slug', 'title', 'content', 'excerpt', 'format', 'status',
      'meta_title', 'meta_description', 'canonical_url', 'og_title', 'og_description',
      'og_image', 'featured_image', 'custom_fields', 'published_at'];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        const val = key === 'custom_fields' ? JSON.stringify(data[key]) : data[key];
        fields.push(`${key} = $${idx++}`);
        params.push(val);
      }
    }

    if (fields.length === 0) return Post.findById(id);
    fields.push('updated_at = NOW()');
    params.push(id);

    await query(`UPDATE posts SET ${fields.join(', ')} WHERE id = $${idx}`, params);
    return Post.findById(id);
  },

  async delete(id) {
    const result = await query('DELETE FROM posts WHERE id = $1 RETURNING id', [id]);
    return result.rows[0];
  },
};
