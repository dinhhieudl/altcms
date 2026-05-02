import { query } from '../config/database.js';

export const Menu = {
  async findByLocation(location) {
    const result = await query('SELECT * FROM menus WHERE location = $1', [location]);
    if (!result.rows[0]) return null;

    const items = await query(
      'SELECT * FROM menu_items WHERE menu_id = $1 AND is_active = true ORDER BY sort_order',
      [result.rows[0].id]
    );

    // Build tree
    const map = new Map();
    const roots = [];
    for (const item of items.rows) {
      item.children = [];
      map.set(item.id, item);
    }
    for (const item of items.rows) {
      if (item.parent_id && map.has(item.parent_id)) {
        map.get(item.parent_id).children.push(item);
      } else {
        roots.push(item);
      }
    }

    return { ...result.rows[0], items: roots };
  },

  async findAll() {
    const result = await query('SELECT * FROM menus ORDER BY name');
    return result.rows;
  },

  async create(data) {
    const result = await query(
      'INSERT INTO menus (name, slug, location) VALUES ($1, $2, $3) RETURNING *',
      [data.name, data.slug, data.location]
    );
    return result.rows[0];
  },

  async updateItem(itemId, data) {
    const fields = [];
    const params = [];
    let idx = 1;

    for (const key of ['title', 'url', 'type', 'target_id', 'css_class', 'icon', 'sort_order', 'parent_id', 'is_active']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        params.push(data[key]);
      }
    }

    if (fields.length === 0) return;
    params.push(itemId);

    await query(`UPDATE menu_items SET ${fields.join(', ')} WHERE id = $${idx}`, params);
  },

  async addItem(menuId, data) {
    const result = await query(
      `INSERT INTO menu_items (menu_id, parent_id, title, url, type, target_id, css_class, icon, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [menuId, data.parent_id, data.title, data.url, data.type || 'custom',
       data.target_id, data.css_class, data.icon, data.sort_order || 0]
    );
    return result.rows[0];
  },

  async removeItem(itemId) {
    await query('DELETE FROM menu_items WHERE id = $1', [itemId]);
  },
};
