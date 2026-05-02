import { query } from '../config/database.js';

export const Taxonomy = {
  async findById(id) {
    const result = await query('SELECT * FROM taxonomies WHERE id = $1', [id]);
    return result.rows[0];
  },

  async findBySlug(slug, type) {
    const conditions = ['slug = $1'];
    const params = [slug];
    if (type) { conditions.push('type = $2'); params.push(type); }
    const result = await query(`SELECT * FROM taxonomies WHERE ${conditions.join(' AND ')}`, params);
    return result.rows[0];
  },

  async findAll({ type, parent_id, search } = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (type) { conditions.push(`type = $${idx++}`); params.push(type); }
    if (parent_id !== undefined) {
      conditions.push(parent_id ? `parent_id = $${idx++}` : 'parent_id IS NULL');
      if (parent_id) params.push(parent_id);
    }
    if (search) { conditions.push(`name ILIKE $${idx++}`); params.push(`%${search}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT * FROM taxonomies ${where} ORDER BY sort_order, name`, params
    );
    return result.rows;
  },

  async findTree(type) {
    const all = await Taxonomy.findAll({ type });
    const map = new Map();
    const roots = [];

    for (const item of all) {
      item.children = [];
      map.set(item.id, item);
    }

    for (const item of all) {
      if (item.parent_id && map.has(item.parent_id)) {
        map.get(item.parent_id).children.push(item);
      } else {
        roots.push(item);
      }
    }

    return roots;
  },

  async create(data) {
    const result = await query(
      `INSERT INTO taxonomies (name, slug, description, type, parent_id, image, display_type, sort_order, meta_title, meta_description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [data.name, data.slug, data.description, data.type, data.parent_id,
       data.image, data.display_type || 'default', data.sort_order || 0,
       data.meta_title, data.meta_description]
    );
    return result.rows[0];
  },

  async update(id, data) {
    const fields = [];
    const params = [];
    let idx = 1;

    for (const key of ['name', 'slug', 'description', 'parent_id', 'image', 'display_type', 'sort_order', 'meta_title', 'meta_description']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        params.push(data[key]);
      }
    }

    if (fields.length === 0) return Taxonomy.findById(id);
    fields.push('updated_at = NOW()');
    params.push(id);

    await query(`UPDATE taxonomies SET ${fields.join(', ')} WHERE id = $${idx}`, params);
    return Taxonomy.findById(id);
  },

  async delete(id) {
    // Move children to parent
    const tax = await Taxonomy.findById(id);
    if (tax) {
      await query('UPDATE taxonomies SET parent_id = $1 WHERE parent_id = $2', [tax.parent_id, id]);
    }
    await query('DELETE FROM content_taxonomies WHERE taxonomy_id = $1', [id]);
    const result = await query('DELETE FROM taxonomies WHERE id = $1 RETURNING id', [id]);
    return result.rows[0];
  },
};
