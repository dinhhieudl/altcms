import { query, transaction } from '../config/database.js';
import { slugify } from '../utils/slugify.js';

export const Product = {
  async findById(id) {
    const result = await query(
      `SELECT p.*, b.name as brand_name
       FROM products p LEFT JOIN brands b ON p.brand_id = b.id
       WHERE p.id = $1`, [id]
    );
    const product = result.rows[0];
    if (!product) return null;

    // Load variants
    const variants = await query(
      'SELECT * FROM product_variants WHERE product_id = $1 ORDER BY sort_order', [id]
    );
    product.variants = variants.rows;

    // Load taxonomy
    const taxonomies = await query(
      `SELECT t.* FROM taxonomies t
       JOIN content_taxonomies ct ON t.id = ct.taxonomy_id
       WHERE ct.content_id = $1 AND ct.content_type = 'product'`, [id]
    );
    product.taxonomies = taxonomies.rows;

    return product;
  },

  async findBySlug(slug) {
    const result = await query(
      `SELECT p.*, b.name as brand_name
       FROM products p LEFT JOIN brands b ON p.brand_id = b.id
       WHERE p.slug = $1`, [slug]
    );
    if (!result.rows[0]) return null;
    return Product.findById(result.rows[0].id);
  },

  async findAll({ page = 1, limit = 20, status, type, category, search, minPrice, maxPrice, sort = 'created_at', order = 'DESC' } = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) { conditions.push(`p.status = $${idx++}`); params.push(status); }
    if (type) { conditions.push(`p.type = $${idx++}`); params.push(type); }
    if (minPrice) { conditions.push(`p.price >= $${idx++}`); params.push(minPrice); }
    if (maxPrice) { conditions.push(`p.price <= $${idx++}`); params.push(maxPrice); }
    if (search) {
      conditions.push(`to_tsvector('english', p.name || ' ' || COALESCE(p.description, '')) @@ plainto_tsquery('english', $${idx})`);
      params.push(search);
      idx++;
    }
    if (category) {
      conditions.push(`EXISTS (
        SELECT 1 FROM content_taxonomies ct
        JOIN taxonomies t ON ct.taxonomy_id = t.id
        WHERE ct.content_id = p.id AND ct.content_type = 'product' AND t.slug = $${idx++}
      )`);
      params.push(category);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const allowedSorts = ['created_at', 'name', 'price', 'updated_at'];
    const sortField = allowedSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    const countResult = await query(`SELECT COUNT(*) FROM products p ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const result = await query(
      `SELECT p.id, p.slug, p.name, p.short_desc, p.price, p.compare_at_price,
              p.currency, p.type, p.status, p.stock_quantity, p.featured_image,
              p.created_at, b.name as brand_name
       FROM products p LEFT JOIN brands b ON p.brand_id = b.id
       ${where} ORDER BY p.${sortField} ${sortOrder} LIMIT $${idx++} OFFSET $${idx}`, params
    );

    return { products: result.rows, total };
  },

  async create(data) {
    return transaction(async (client) => {
      const slug = data.slug || slugify(data.name);

      const result = await client.query(
        `INSERT INTO products (slug, name, description, short_desc, sku, price, compare_at_price,
         cost_price, currency, type, status, manage_stock, stock_quantity, weight, length, width,
         height, meta_title, meta_description, featured_image, gallery, custom_fields, brand_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
         RETURNING *`,
        [slug, data.name, data.description, data.short_desc, data.sku, data.price || 0,
         data.compare_at_price, data.cost_price, data.currency || 'VND', data.type || 'simple',
         data.status || 'draft', data.manage_stock || false, data.stock_quantity || 0,
         data.weight, data.length, data.width, data.height,
         data.meta_title, data.meta_description, data.featured_image,
         JSON.stringify(data.gallery || []), JSON.stringify(data.custom_fields || {}),
         data.brand_id, data.created_by]
      );

      const product = result.rows[0];

      // Create variants if variable product
      if (data.type === 'variable' && data.variants?.length) {
        for (const v of data.variants) {
          await client.query(
            `INSERT INTO product_variants (product_id, sku, name, price, compare_at_price, stock_quantity, attributes, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [product.id, v.sku, v.name, v.price, v.compare_at_price, v.stock_quantity || 0,
             JSON.stringify(v.attributes || {}), v.sort_order || 0]
          );
        }
      }

      // Assign taxonomies
      if (data.taxonomy_ids?.length) {
        for (const taxId of data.taxonomy_ids) {
          await client.query(
            `INSERT INTO content_taxonomies (content_id, taxonomy_id, content_type) VALUES ($1, $2, 'product')`,
            [product.id, taxId]
          );
        }
      }

      return product;
    });
  },

  async update(id, data) {
    return transaction(async (client) => {
      const fields = [];
      const params = [];
      let idx = 1;

      const allowed = ['name', 'description', 'short_desc', 'sku', 'price', 'compare_at_price',
        'cost_price', 'currency', 'type', 'status', 'visibility', 'manage_stock', 'stock_quantity',
        'low_stock_threshold', 'weight', 'length', 'width', 'height', 'meta_title', 'meta_description',
        'canonical_url', 'og_title', 'og_description', 'og_image', 'featured_image', 'gallery',
        'custom_fields', 'brand_id', 'published_at'];

      for (const key of allowed) {
        if (data[key] !== undefined) {
          const value = ['gallery', 'custom_fields'].includes(key) ? JSON.stringify(data[key]) : data[key];
          fields.push(`${key} = $${idx++}`);
          params.push(value);
        }
      }

      if (data.slug) {
        fields.push(`slug = $${idx++}`);
        params.push(data.slug);
      }

      if (fields.length === 0) return await Product.findById(id);

      fields.push(`updated_at = NOW()`);
      params.push(id);

      await client.query(`UPDATE products SET ${fields.join(', ')} WHERE id = $${idx}`, params);

      // Update variants if provided
      if (data.variants) {
        await client.query('DELETE FROM product_variants WHERE product_id = $1', [id]);
        for (const v of data.variants) {
          await client.query(
            `INSERT INTO product_variants (product_id, sku, name, price, compare_at_price, stock_quantity, attributes, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [id, v.sku, v.name, v.price, v.compare_at_price, v.stock_quantity || 0,
             JSON.stringify(v.attributes || {}), v.sort_order || 0]
          );
        }
      }

      // Update taxonomies if provided
      if (data.taxonomy_ids) {
        await client.query(
          `DELETE FROM content_taxonomies WHERE content_id = $1 AND content_type = 'product'`, [id]
        );
        for (const taxId of data.taxonomy_ids) {
          await client.query(
            `INSERT INTO content_taxonomies (content_id, taxonomy_id, content_type) VALUES ($1, $2, 'product')`,
            [id, taxId]
          );
        }
      }

      return Product.findById(id);
    });
  },

  async delete(id) {
    const result = await query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    return result.rows[0];
  },

  async updateStock(id, quantity, variantId = null) {
    if (variantId) {
      return query(
        `UPDATE product_variants SET stock_quantity = stock_quantity + $1, updated_at = NOW()
         WHERE id = $2 AND product_id = $3 RETURNING stock_quantity`,
        [quantity, variantId, id]
      );
    }
    return query(
      'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2 RETURNING stock_quantity',
      [quantity, id]
    );
  },
};
