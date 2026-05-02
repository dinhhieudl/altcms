import { query } from '../config/database.js';

export const Coupon = {
  async findById(id) {
    const result = await query('SELECT * FROM coupons WHERE id = $1', [id]);
    return result.rows[0];
  },

  async findByCode(code) {
    const result = await query(
      `SELECT * FROM coupons WHERE code = $1 AND is_active = true
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (expires_at IS NULL OR expires_at > NOW())`, [code.toUpperCase()]
    );
    return result.rows[0];
  },

  async findAll({ page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const countResult = await query('SELECT COUNT(*) FROM coupons');
    const total = parseInt(countResult.rows[0].count);
    const result = await query('SELECT * FROM coupons ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return { coupons: result.rows, total };
  },

  async create(data) {
    const result = await query(
      `INSERT INTO coupons (code, type, value, min_order_amount, max_discount, usage_limit,
       per_user_limit, starts_at, expires_at, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [data.code.toUpperCase(), data.type, data.value, data.min_order_amount,
       data.max_discount, data.usage_limit, data.per_user_limit || 1,
       data.starts_at, data.expires_at, data.is_active !== false]
    );
    return result.rows[0];
  },

  async update(id, data) {
    const fields = [];
    const params = [];
    let idx = 1;

    for (const key of ['code', 'type', 'value', 'min_order_amount', 'max_discount',
      'usage_limit', 'per_user_limit', 'starts_at', 'expires_at', 'is_active']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        params.push(key === 'code' ? data[key].toUpperCase() : data[key]);
      }
    }

    if (fields.length === 0) return Coupon.findById(id);
    params.push(id);

    await query(`UPDATE coupons SET ${fields.join(', ')} WHERE id = $${idx}`, params);
    return Coupon.findById(id);
  },

  async delete(id) {
    const result = await query('DELETE FROM coupons WHERE id = $1 RETURNING id', [id]);
    return result.rows[0];
  },
};
