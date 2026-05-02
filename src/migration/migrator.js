import { query, transaction } from '../config/database.js';

export class Migrator {
  constructor(config) {
    this.config = config;
    this.connection = null;
    this.status = { state: 'idle', progress: 0, current: '', errors: [], report: null };
    this.lastSync = {};
  }

  async connect() {
    if (this.config.type === 'database') {
      const mysql = await import('mysql2/promise');
      this.connection = await mysql.createConnection({
        host: this.config.host,
        port: this.config.port || 3306,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
      });
      await this.connection.ping();
    } else if (this.config.type === 'api') {
      // Test API connection
      const url = `${this.config.apiUrl}/wp-json/wp/v2/posts?per_page=1`;
      const headers = {};
      if (this.config.apiUser && this.config.apiPass) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${this.config.apiUser}:${this.config.apiPass}`).toString('base64');
      }
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
    }
    this.status.state = 'connected';
  }

  async discover() {
    if (this.config.type === 'database') {
      const [products] = await this.connection.execute("SELECT COUNT(*) as c FROM wp_posts WHERE post_type = 'product' AND post_status = 'publish'");
      const [posts] = await this.connection.execute("SELECT COUNT(*) as c FROM wp_posts WHERE post_type = 'post' AND post_status = 'publish'");
      const [pages] = await this.connection.execute("SELECT COUNT(*) as c FROM wp_posts WHERE post_type = 'page' AND post_status = 'publish'");
      const [users] = await this.connection.execute("SELECT COUNT(*) as c FROM wp_users");
      const [orders] = await this.connection.execute("SELECT COUNT(*) as c FROM wp_posts WHERE post_type = 'shop_order'");
      const [categories] = await this.connection.execute("SELECT COUNT(*) as c FROM wp_terms t JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id WHERE tt.taxonomy IN ('product_cat','category')");
      const [media] = await this.connection.execute("SELECT COUNT(*) as c FROM wp_posts WHERE post_type = 'attachment'");

      return {
        products: products[0].c,
        posts: posts[0].c,
        pages: pages[0].c,
        users: users[0].c,
        orders: orders[0].c,
        categories: categories[0].c,
        media: media[0].c,
        estimatedTime: `${Math.ceil((products[0].c + posts[0].c + orders[0].c) / 100)} minutes`,
      };
    }

    // API mode — count via headers
    const count = async (type) => {
      const res = await fetch(`${this.config.apiUrl}/wp-json/wp/v2/${type}?per_page=1`, {
        headers: this._apiHeaders(),
      });
      return parseInt(res.headers.get('X-WP-Total') || '0');
    };

    return {
      products: await count('product'),
      posts: await count('posts'),
      pages: await count('pages'),
      users: await count('users'),
      estimatedTime: 'varies',
    };
  }

  async dryRun() {
    const preview = { products: [], posts: [], pages: [], users: [] };

    if (this.config.type === 'database') {
      // Sample 5 products
      const [products] = await this.connection.execute(
        `SELECT p.ID, p.post_title, p.post_name, pm_sku.meta_value as sku,
                pm_price.meta_value as price, pm_stock.meta_value as stock
         FROM wp_posts p
         LEFT JOIN wp_postmeta pm_sku ON p.ID = pm_sku.post_id AND pm_sku.meta_key = '_sku'
         LEFT JOIN wp_postmeta pm_price ON p.ID = pm_price.post_id AND pm_price.meta_key = '_price'
         LEFT JOIN wp_postmeta pm_stock ON p.ID = pm_stock.post_id AND pm_stock.meta_key = '_stock'
         WHERE p.post_type = 'product' AND p.post_status = 'publish' LIMIT 5`
      );
      preview.products = products.map(p => ({
        wp_id: p.ID, name: p.post_title, slug: p.post_name,
        sku: p.sku, price: p.price, stock: p.stock,
        mapped_to: { slug: p.post_name, name: p.post_title, price: p.price || 0 },
      }));

      // Sample posts
      const [posts] = await this.connection.execute(
        `SELECT ID, post_title, post_name, post_date FROM wp_posts
         WHERE post_type = 'post' AND post_status = 'publish' LIMIT 5`
      );
      preview.posts = posts.map(p => ({
        wp_id: p.ID, title: p.post_title, slug: p.post_name, date: p.post_date,
      }));
    }

    return preview;
  }

  async runFullMigration() {
    this.status = { state: 'running', progress: 0, current: 'Starting...', errors: [], startedAt: new Date() };
    const batches = [
      { name: 'Users', fn: () => this._migrateUsers() },
      { name: 'Taxonomies', fn: () => this._migrateTaxonomies() },
      { name: 'Products', fn: () => this._migrateProducts() },
      { name: 'Posts', fn: () => this._migratePosts() },
      { name: 'Pages', fn: () => this._migratePages() },
      { name: 'Orders', fn: () => this._migrateOrders() },
      { name: 'Reviews', fn: () => this._migrateReviews() },
      { name: 'SEO & Redirects', fn: () => this._migrateSEO() },
    ];

    for (let i = 0; i < batches.length; i++) {
      this.status.current = batches[i].name;
      this.status.progress = Math.round((i / batches.length) * 100);
      try {
        await batches[i].fn();
        this.lastSync[batches[i].name] = new Date();
      } catch (err) {
        this.status.errors.push({ batch: batches[i].name, error: err.message });
        console.error(`[Migration] ${batches[i].name} failed:`, err.message);
      }
    }

    this.status.state = 'completed';
    this.status.progress = 100;
    this.status.current = 'Done';
    this.status.completedAt = new Date();
    this.status.report = await this._generateReport();
  }

  async _migrateUsers() {
    if (this.config.type !== 'database') return;
    const [users] = await this.connection.execute('SELECT * FROM wp_users');

    for (const u of users) {
      try {
        await query(
          `INSERT INTO users (email, password_hash, name, role, wp_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (wp_id) DO NOTHING`,
          [u.user_email, u.user_pass, u.display_name || u.user_login, 'customer', u.ID, u.user_registered]
        );
      } catch (e) { this.status.errors.push({ batch: 'Users', id: u.ID, error: e.message }); }
    }
  }

  async _migrateTaxonomies() {
    if (this.config.type !== 'database') return;
    const [terms] = await this.connection.execute(
      `SELECT t.term_id, t.name, t.slug, tt.taxonomy, tt.parent, tt.count
       FROM wp_terms t JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
       WHERE tt.taxonomy IN ('product_cat','category','product_tag','post_tag')`
    );

    for (const t of terms) {
      try {
        const typeMap = { 'product_cat': 'product_cat', 'category': 'post_cat', 'product_tag': 'product_tag', 'post_tag': 'post_tag' };
        await query(
          `INSERT INTO taxonomies (name, slug, type, wp_id) VALUES ($1, $2, $3, $4)
           ON CONFLICT (wp_id) DO UPDATE SET name = $1, slug = $2`,
          [t.name, t.slug, typeMap[t.taxonomy] || t.taxonomy, t.term_id]
        );
      } catch (e) { this.status.errors.push({ batch: 'Taxonomies', id: t.term_id, error: e.message }); }
    }

    // Fix parent references
    const [parents] = await this.connection.execute(
      `SELECT t.term_id, tt.parent FROM wp_terms t
       JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id WHERE tt.parent > 0`
    );
    for (const p of parents) {
      try {
        await query(
          `UPDATE taxonomies SET parent_id = (SELECT id FROM taxonomies WHERE wp_id = $1)
           WHERE wp_id = $2`, [p.parent, p.term_id]
        );
      } catch (e) { /* skip */ }
    }
  }

  async _migrateProducts() {
    if (this.config.type !== 'database') return;
    const [products] = await this.connection.execute(
      `SELECT p.* FROM wp_posts p
       WHERE p.post_type = 'product' AND p.post_status = 'publish'`
    );

    // Batch fetch all product meta
    const productIds = products.map(p => p.ID);
    if (productIds.length === 0) return;

    const placeholders = productIds.map(() => '?').join(',');
    const [allMeta] = await this.connection.execute(
      `SELECT post_id, meta_key, meta_value FROM wp_postmeta WHERE post_id IN (${placeholders})`, productIds
    );

    const metaMap = {};
    for (const m of allMeta) {
      if (!metaMap[m.post_id]) metaMap[m.post_id] = {};
      metaMap[m.post_id][m.meta_key] = m.meta_value;
    }

    for (const p of products) {
      try {
        const meta = metaMap[p.ID] || {};
        const gallery = meta._product_image_gallery ? meta._product_image_gallery.split(',').filter(Boolean) : [];

        // Resolve image URLs
        let featuredImage = null;
        if (meta._thumbnail_id) {
          const [img] = await this.connection.execute(
            'SELECT guid FROM wp_posts WHERE ID = ?', [meta._thumbnail_id]
          );
          if (img[0]) featuredImage = img[0].guid;
        }

        const galleryUrls = [];
        for (const imgId of gallery) {
          const [img] = await this.connection.execute('SELECT guid FROM wp_posts WHERE ID = ?', [imgId]);
          if (img[0]) galleryUrls.push({ url: img[0].guid, alt: '' });
        }

        await query(
          `INSERT INTO products (slug, name, description, short_desc, sku, price, compare_at_price,
           type, status, manage_stock, stock_quantity, weight, length, width, height,
           meta_title, meta_description, featured_image, gallery, wp_id, created_at, updated_at, published_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
           ON CONFLICT (wp_id) DO UPDATE SET name = $2, price = $6, updated_at = NOW()`,
          [
            p.post_name, p.post_title, p.post_content, p.post_excerpt,
            meta._sku || null, parseFloat(meta._price) || 0,
            meta._sale_price ? parseFloat(meta._regular_price) : null,
            'simple', 'published',
            meta._manage_stock === 'yes', parseInt(meta._stock) || 0,
            parseFloat(meta._weight) || null, parseFloat(meta._length) || null,
            parseFloat(meta._width) || null, parseFloat(meta._height) || null,
            meta._yoast_wpseo_title || null, meta._yoast_wpseo_metadesc || null,
            featuredImage, JSON.stringify(galleryUrls),
            p.ID, p.post_date, p.post_modified, p.post_date,
          ]
        );

        this.lastSync.products = new Date();
      } catch (e) {
        this.status.errors.push({ batch: 'Products', id: p.ID, error: e.message });
      }
    }
  }

  async _migratePosts() {
    if (this.config.type !== 'database') return;
    const [posts] = await this.connection.execute(
      `SELECT p.*, u.display_name as author_name FROM wp_posts p
       LEFT JOIN wp_users u ON p.post_author = u.ID
       WHERE p.post_type = 'post' AND p.post_status = 'publish'`
    );

    for (const p of posts) {
      try {
        // Resolve author
        let authorId = null;
        if (p.post_author) {
          const author = await query('SELECT id FROM users WHERE wp_id = $1', [p.post_author]);
          if (author.rows[0]) authorId = author.rows[0].id;
        }

        // Featured image
        const [meta] = await this.connection.execute(
          "SELECT meta_value FROM wp_postmeta WHERE post_id = ? AND meta_key = '_thumbnail_id'", [p.ID]
        );
        let featuredImage = null;
        if (meta[0]) {
          const [img] = await this.connection.execute('SELECT guid FROM wp_posts WHERE ID = ?', [meta[0].meta_value]);
          if (img[0]) featuredImage = img[0].guid;
        }

        // Yoast meta
        const [seoMeta] = await this.connection.execute(
          "SELECT meta_key, meta_value FROM wp_postmeta WHERE post_id = ? AND meta_key LIKE '_yoast_wpseo_%'", [p.ID]
        );
        const seo = {};
        for (const m of seoMeta) seo[m.meta_key] = m.meta_value;

        await query(
          `INSERT INTO posts (slug, title, content, excerpt, status, meta_title, meta_description,
           featured_image, author_id, wp_id, created_at, updated_at, published_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (wp_id) DO UPDATE SET title = $2, content = $3`,
          [p.post_name, p.post_title, p.post_content, p.post_excerpt, 'published',
           seo._yoast_wpseo_title || null, seo._yoast_wpseo_metadesc || null,
           featuredImage, authorId, p.ID, p.post_date, p.post_modified, p.post_date]
        );
      } catch (e) {
        this.status.errors.push({ batch: 'Posts', id: p.ID, error: e.message });
      }
    }
  }

  async _migratePages() {
    if (this.config.type !== 'database') return;
    const [pages] = await this.connection.execute(
      `SELECT * FROM wp_posts WHERE post_type = 'page' AND post_status = 'publish'`
    );

    for (const p of pages) {
      try {
        await query(
          `INSERT INTO pages (slug, title, content, status, wp_id, created_at, updated_at, published_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (wp_id) DO UPDATE SET title = $2, content = $3`,
          [p.post_name, p.post_title, p.post_content, 'published', p.ID, p.post_date, p.post_modified, p.post_date]
        );
      } catch (e) {
        this.status.errors.push({ batch: 'Pages', id: p.ID, error: e.message });
      }
    }
  }

  async _migrateOrders() {
    if (this.config.type !== 'database') return;
    try {
      const [orders] = await this.connection.execute(
        `SELECT p.* FROM wp_posts p WHERE p.post_type = 'shop_order' ORDER BY p.post_date DESC LIMIT 5000`
      );

      let orderCount = 0;
      for (const o of orders) {
        try {
          const [meta] = await this.connection.execute(
            'SELECT meta_key, meta_value FROM wp_postmeta WHERE post_id = ?', [o.ID]
          );
          const m = {};
          for (const row of meta) m[row.meta_key] = row.meta_value;

          const statusMap = {
            'wc-pending': 'pending', 'wc-processing': 'processing', 'wc-on-hold': 'confirmed',
            'wc-completed': 'delivered', 'wc-cancelled': 'cancelled', 'wc-refunded': 'refunded', 'wc-failed': 'failed',
          };

          await query(
            `INSERT INTO orders (order_number, status, payment_status, billing_name, billing_email,
             billing_phone, billing_address, total, currency, payment_method, wp_id, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (wp_id) DO NOTHING`,
            [
              `WP-${o.ID}`, statusMap[m._order_status] || 'pending',
              m._paid === 'yes' ? 'paid' : 'pending',
              `${m._billing_first_name || ''} ${m._billing_last_name || ''}`.trim(),
              m._billing_email, m._billing_phone,
              JSON.stringify({
                line1: m._billing_address_1, line2: m._billing_address_2,
                city: m._billing_city, state: m._billing_state,
                zip: m._billing_postcode, country: m._billing_country,
              }),
              parseFloat(m._order_total) || 0, m._order_currency || 'VND',
              m._payment_method, o.ID, o.post_date,
            ]
          );
          orderCount++;
        } catch (e) {
          this.status.errors.push({ batch: 'Orders', id: o.ID, error: e.message });
        }
      }
      this.lastSync.orders = new Date();
    } catch (e) {
      // Orders table might not exist
      this.status.errors.push({ batch: 'Orders', error: 'WooCommerce orders table not found' });
    }
  }

  async _migrateReviews() {
    if (this.config.type !== 'database') return;
    const [reviews] = await this.connection.execute(
      `SELECT c.*, p.ID as product_wp_id FROM wp_comments c
       JOIN wp_posts p ON c.comment_post_ID = p.ID
       WHERE c.comment_type = 'review' AND c.comment_approved = '1'`
    );

    for (const r of reviews) {
      try {
        const product = await query('SELECT id FROM products WHERE wp_id = $1', [r.product_wp_id]);
        if (!product.rows[0]) continue;

        await query(
          `INSERT INTO reviews (product_id, reviewer_name, reviewer_email, rating, content, is_approved, wp_id, created_at)
           VALUES ($1,$2,$3,$4,$5,true,$6,$7) ON CONFLICT DO NOTHING`,
          [product.rows[0].id, r.comment_author, r.comment_author_email,
           5, r.comment_content, r.comment_ID, r.comment_date]
        );
      } catch (e) { /* skip */ }
    }
  }

  async _migrateSEO() {
    if (this.config.type !== 'database') return;

    // Auto-generate redirects for all old product/post URLs
    const [oldProducts] = await this.connection.execute(
      "SELECT post_name FROM wp_posts WHERE post_type = 'product' AND post_status = 'publish'"
    );
    const [oldPosts] = await this.connection.execute(
      "SELECT post_name FROM wp_posts WHERE post_type = 'post' AND post_status = 'publish'"
    );

    const redirects = [];
    for (const p of oldProducts) {
      redirects.push({ old_path: `/product/${p.post_name}`, new_path: `/products/${p.post_name}` });
    }
    for (const p of oldPosts) {
      redirects.push({ old_path: `/${p.post_name}`, new_path: `/blog/${p.post_name}` });
    }

    for (const r of redirects) {
      try {
        await query(
          `INSERT INTO redirects (old_path, new_path, status_code) VALUES ($1, $2, 301)
           ON CONFLICT (old_path) WHERE NOT is_regex DO NOTHING`,
          [r.old_path, r.new_path]
        );
      } catch (e) { /* skip */ }
    }
  }

  async deltaSync() {
    // Re-run migrations but only for records updated since last sync
    this.status.state = 'syncing';
    // For simplicity, re-run full — production version would filter by updated_at
    await this.runFullMigration();
  }

  getStatus() {
    return this.status;
  }

  getReport() {
    return this.status.report || { message: 'No migration completed yet' };
  }

  async _generateReport() {
    const counts = {};
    for (const table of ['products', 'posts', 'pages', 'users', 'orders']) {
      const result = await query(`SELECT COUNT(*) FROM ${table}`);
      counts[table] = parseInt(result.rows[0].count);
    }
    return {
      migrated: counts,
      errors: this.status.errors.length,
      errorDetails: this.status.errors.slice(0, 20),
      startedAt: this.status.startedAt,
      completedAt: this.status.completedAt,
    };
  }

  _apiHeaders() {
    const headers = {};
    if (this.config.apiUser && this.config.apiPass) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${this.config.apiUser}:${this.config.apiPass}`).toString('base64');
    }
    return headers;
  }
}
