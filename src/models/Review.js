import { query } from '../config/database.js';

export const Review = {
  async findByProduct(productId, { page = 1, limit = 10, approved_only = true } = {}) {
    const conditions = ['r.product_id = $1'];
    const params = [productId];
    let idx = 2;

    if (approved_only) { conditions.push('r.is_approved = true'); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const offset = (page - 1) * limit;

    const countResult = await query(`SELECT COUNT(*) FROM reviews r ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const result = await query(
      `SELECT r.*, u.name as reviewer_name FROM reviews r
       LEFT JOIN users u ON r.user_id = u.id ${where}
       ORDER BY r.created_at DESC LIMIT $${idx++} OFFSET $${idx}`, params
    );

    return { reviews: result.rows, total };
  },

  async create(data) {
    const result = await query(
      `INSERT INTO reviews (product_id, user_id, reviewer_name, reviewer_email, rating, title, content, is_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [data.product_id, data.user_id, data.reviewer_name, data.reviewer_email,
       data.rating, data.title, data.content, data.is_verified || false]
    );
    return result.rows[0];
  },

  async approve(id) {
    const result = await query(
      'UPDATE reviews SET is_approved = true WHERE id = $1 RETURNING *', [id]
    );
    return result.rows[0];
  },

  async delete(id) {
    const result = await query('DELETE FROM reviews WHERE id = $1 RETURNING id', [id]);
    return result.rows[0];
  },

  async getProductStats(productId) {
    const result = await query(
      `SELECT COUNT(*) as count, COALESCE(AVG(rating), 0) as avg_rating
       FROM reviews WHERE product_id = $1 AND is_approved = true`, [productId]
    );
    return {
      count: parseInt(result.rows[0].count),
      avg_rating: parseFloat(result.rows[0].avg_rating).toFixed(1),
    };
  },
};
