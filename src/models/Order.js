import { query, transaction } from '../config/database.js';
import { nanoid } from 'nanoid';

export const Order = {
  async findById(id) {
    const result = await query(
      `SELECT o.*, u.name as customer_name, u.email as customer_email
       FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = $1`, [id]
    );
    const order = result.rows[0];
    if (!order) return null;

    const items = await query('SELECT * FROM order_items WHERE order_id = $1', [id]);
    order.items = items.rows;
    return order;
  },

  async findByNumber(orderNumber) {
    const result = await query('SELECT id FROM orders WHERE order_number = $1', [orderNumber]);
    return result.rows[0] ? Order.findById(result.rows[0].id) : null;
  },

  async findAll({ page = 1, limit = 20, status, payment_status, user_id, search, dateFrom, dateTo } = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) { conditions.push(`o.status = $${idx++}`); params.push(status); }
    if (payment_status) { conditions.push(`o.payment_status = $${idx++}`); params.push(payment_status); }
    if (user_id) { conditions.push(`o.user_id = $${idx++}`); params.push(user_id); }
    if (dateFrom) { conditions.push(`o.created_at >= $${idx++}`); params.push(dateFrom); }
    if (dateTo) { conditions.push(`o.created_at <= $${idx++}`); params.push(dateTo); }
    if (search) {
      conditions.push(`(o.order_number ILIKE $${idx} OR o.billing_name ILIKE $${idx} OR o.billing_email ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countResult = await query(`SELECT COUNT(*) FROM orders o ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const result = await query(
      `SELECT o.id, o.order_number, o.status, o.payment_status, o.total, o.currency,
              o.billing_name, o.billing_email, o.created_at, u.name as customer_name
       FROM orders o LEFT JOIN users u ON o.user_id = u.id
       ${where} ORDER BY o.created_at DESC LIMIT $${idx++} OFFSET $${idx}`, params
    );

    return { orders: result.rows, total };
  },

  async create({ user_id, items, billing, shipping, payment_method, coupon_code, customer_note }) {
    return transaction(async (client) => {
      // Generate order number
      const countResult = await client.query('SELECT COUNT(*) FROM orders');
      const orderNumber = `ALT-${String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0')}`;

      // Calculate totals
      let subtotal = 0;
      const processedItems = [];

      for (const item of items) {
        const product = (await client.query('SELECT * FROM products WHERE id = $1', [item.product_id])).rows[0];
        if (!product) throw new Error(`Product ${item.product_id} not found`);

        let price = parseFloat(product.price);
        let variant = null;
        if (item.variant_id) {
          variant = (await client.query('SELECT * FROM product_variants WHERE id = $1', [item.variant_id])).rows[0];
          if (variant) price = parseFloat(variant.price);
        }

        const itemTotal = price * item.quantity;
        subtotal += itemTotal;

        processedItems.push({
          product_id: product.id,
          variant_id: variant?.id || null,
          name: product.name + (variant ? ` - ${variant.name}` : ''),
          sku: variant?.sku || product.sku,
          price,
          quantity: item.quantity,
          subtotal: itemTotal,
          total: itemTotal,
          image: product.featured_image,
          attributes: variant?.attributes || {},
        });
      }

      // Apply coupon if provided
      let discountTotal = 0;
      if (coupon_code) {
        const coupon = (await client.query(
          'SELECT * FROM coupons WHERE code = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())',
          [coupon_code]
        )).rows[0];

        if (coupon) {
          if (coupon.type === 'percentage') {
            discountTotal = subtotal * (parseFloat(coupon.value) / 100);
          } else if (coupon.type === 'fixed') {
            discountTotal = parseFloat(coupon.value);
          }
          if (coupon.max_discount && discountTotal > parseFloat(coupon.max_discount)) {
            discountTotal = parseFloat(coupon.max_discount);
          }
          await client.query('UPDATE coupons SET usage_count = usage_count + 1 WHERE id = $1', [coupon.id]);
        }
      }

      const total = subtotal - discountTotal;

      // Create order
      const orderResult = await client.query(
        `INSERT INTO orders (order_number, user_id, status, payment_status, billing_name, billing_email,
         billing_phone, billing_address, shipping_name, shipping_phone, shipping_address, subtotal,
         discount_total, total, currency, payment_method, coupon_code, customer_note)
         VALUES ($1,$2,'pending','pending',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [orderNumber, user_id, billing.name, billing.email, billing.phone,
         JSON.stringify(billing.address), shipping?.name || billing.name,
         shipping?.phone || billing.phone, JSON.stringify(shipping?.address || billing.address),
         subtotal, discountTotal, total, 'VND', payment_method, coupon_code, customer_note]
      );

      const order = orderResult.rows[0];

      // Create order items
      for (const item of processedItems) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, variant_id, name, sku, price, quantity, subtotal, total, image, attributes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [order.id, item.product_id, item.variant_id, item.name, item.sku,
           item.price, item.quantity, item.subtotal, item.total, item.image,
           JSON.stringify(item.attributes)]
        );

        // Decrease stock
        if (item.variant_id) {
          await client.query(
            'UPDATE product_variants SET stock_quantity = stock_quantity - $1 WHERE id = $2',
            [item.quantity, item.variant_id]
          );
        } else {
          await client.query(
            'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
            [item.quantity, item.product_id]
          );
        }
      }

      return Order.findById(order.id);
    });
  },

  async updateStatus(id, status, admin_note) {
    const fields = ['status = $2', 'updated_at = NOW()'];
    const params = [id, status];
    let idx = 3;

    if (status === 'shipped') fields.push('fulfillment_status = $' + (idx++));
    if (status === 'delivered') {
      fields.push('delivered_at = NOW()');
      fields.push('fulfillment_status = $' + (idx++));
      params.push('fulfilled');
    }
    if (admin_note) {
      fields.push('admin_note = $' + (idx++));
      params.push(admin_note);
    }

    await query(`UPDATE orders SET ${fields.join(', ')} WHERE id = $1`, params);
    return Order.findById(id);
  },
};
