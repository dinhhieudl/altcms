import { query } from '../config/database.js';

export const Setting = {
  async get(key) {
    const result = await query('SELECT value FROM settings WHERE key = $1', [key]);
    return result.rows[0]?.value;
  },

  async getAll(group) {
    const conditions = [];
    const params = [];
    if (group) { conditions.push('group_name = $1'); params.push(group); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(`SELECT key, value, group_name FROM settings ${where} ORDER BY key`, params);

    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    return settings;
  },

  async set(key, value, group = 'general') {
    await query(
      `INSERT INTO settings (key, value, group_name, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, group_name = $3, updated_at = NOW()`,
      [key, JSON.stringify(value), group]
    );
  },

  async setMany(data, group = 'general') {
    for (const [key, value] of Object.entries(data)) {
      await Setting.set(key, value, group);
    }
  },
};
