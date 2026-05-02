import { query } from '../config/database.js';

export const Cart = {
  async get(userId, sessionId) {
    const condition = userId ? 'user_id = $1' : 'session_id = $1';
    const param = userId || sessionId;

    let result = await query(`SELECT * FROM carts WHERE ${condition}`, [param]);

    if (result.rows.length === 0) {
      result = await query(
        `INSERT INTO carts (user_id, session_id) VALUES ($1, $2) RETURNING *`,
        [userId || null, sessionId || null]
      );
    }

    const cart = result.rows[0];
    cart.items = cart.items || [];

    // Enrich items with product data
    if (cart.items.length > 0) {
      const productIds = cart.items.map(i => i.product_id);
      const products = await query(
        `SELECT id, name, slug, price, compare_at_price, stock_quantity, featured_image, status
         FROM products WHERE id = ANY($1) AND status = 'published'`, [productIds]
      );
      const productMap = new Map(products.rows.map(p => [p.id, p]));

      cart.items = cart.items
        .filter(item => productMap.has(item.product_id))
        .map(item => ({
          ...item,
          product: productMap.get(item.product_id),
        }));
    }

    return cart;
  },

  async addItem(userId, sessionId, productId, variantId, quantity = 1) {
    const cart = await Cart.get(userId, sessionId);
    const items = [...(cart.items || [])];

    const existingIdx = items.findIndex(
      i => i.product_id === productId && i.variant_id === (variantId || null)
    );

    if (existingIdx >= 0) {
      items[existingIdx].quantity += quantity;
    } else {
      items.push({ product_id: productId, variant_id: variantId || null, quantity });
    }

    const result = await query(
      'UPDATE carts SET items = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(items), cart.id]
    );

    return Cart.get(userId, sessionId);
  },

  async updateItem(userId, sessionId, itemId, quantity) {
    const cart = await Cart.get(userId, sessionId);
    const items = [...(cart.items || [])];

    const idx = items.findIndex((_, i) => i === parseInt(itemId));
    if (idx < 0) throw new Error('Item not found in cart');

    if (quantity <= 0) {
      items.splice(idx, 1);
    } else {
      items[idx].quantity = quantity;
    }

    await query('UPDATE carts SET items = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(items), cart.id]);

    return Cart.get(userId, sessionId);
  },

  async removeItem(userId, sessionId, itemId) {
    return Cart.updateItem(userId, sessionId, itemId, 0);
  },

  async clear(userId, sessionId) {
    const condition = userId ? 'user_id = $1' : 'session_id = $1';
    await query(`UPDATE carts SET items = '[]', coupon_code = NULL, updated_at = NOW() WHERE ${condition}`,
      [userId || sessionId]);
  },

  async setCoupon(userId, sessionId, couponCode) {
    const condition = userId ? 'user_id = $1' : 'session_id = $1';
    await query(`UPDATE carts SET coupon_code = $2, updated_at = NOW() WHERE ${condition}`,
      [userId || sessionId, couponCode]);
  },
};
