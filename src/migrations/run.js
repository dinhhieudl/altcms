import { query, healthCheck } from '../config/database.js';
import { config } from '../config/app.js';
import bcrypt from 'bcryptjs';

export async function runMigrations() {
  console.log('[DB] Running migrations...');

  await query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    -- USERS
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('admin','editor','author','customer')),
      avatar_url TEXT,
      phone VARCHAR(50),
      is_active BOOLEAN DEFAULT true,
      last_login_at TIMESTAMPTZ,
      wp_id INTEGER UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    -- BRANDS
    CREATE TABLE IF NOT EXISTS brands (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      logo_url TEXT,
      description TEXT,
      website_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- PRODUCTS
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(500) NOT NULL,
      description TEXT,
      short_desc TEXT,
      sku VARCHAR(100) UNIQUE,
      price DECIMAL(12,2) NOT NULL DEFAULT 0,
      compare_at_price DECIMAL(12,2),
      cost_price DECIMAL(12,2),
      currency VARCHAR(3) DEFAULT 'VND',
      type VARCHAR(20) DEFAULT 'simple' CHECK (type IN ('simple','variable','grouped','digital')),
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
      visibility VARCHAR(20) DEFAULT 'visible' CHECK (visibility IN ('visible','hidden','catalog','search')),
      manage_stock BOOLEAN DEFAULT false,
      stock_quantity INTEGER DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 5,
      backorders_allowed BOOLEAN DEFAULT false,
      sold_individually BOOLEAN DEFAULT false,
      weight DECIMAL(8,2),
      length DECIMAL(8,2),
      width DECIMAL(8,2),
      height DECIMAL(8,2),
      shipping_class VARCHAR(100),
      meta_title TEXT,
      meta_description TEXT,
      canonical_url TEXT,
      og_title VARCHAR(255),
      og_description TEXT,
      og_image TEXT,
      featured_image TEXT,
      gallery JSONB DEFAULT '[]',
      custom_fields JSONB DEFAULT '{}',
      brand_id UUID REFERENCES brands(id),
      created_by UUID REFERENCES users(id),
      wp_id INTEGER UNIQUE,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
    CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
    CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
    CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at DESC);

    -- PRODUCT VARIANTS
    CREATE TABLE IF NOT EXISTS product_variants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      sku VARCHAR(100) UNIQUE,
      name VARCHAR(255),
      price DECIMAL(12,2) NOT NULL,
      compare_at_price DECIMAL(12,2),
      stock_quantity INTEGER DEFAULT 0,
      weight DECIMAL(8,2),
      image TEXT,
      attributes JSONB NOT NULL DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      wp_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

    -- ATTRIBUTES
    CREATE TABLE IF NOT EXISTS attributes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      type VARCHAR(20) DEFAULT 'select' CHECK (type IN ('select','color','text','number')),
      is_filterable BOOLEAN DEFAULT true,
      is_visible_on_product BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS attribute_values (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attribute_id UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
      value VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL,
      color_hex VARCHAR(7),
      sort_order INTEGER DEFAULT 0,
      UNIQUE(attribute_id, slug)
    );

    CREATE TABLE IF NOT EXISTS variant_attribute_values (
      variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
      attribute_value_id UUID NOT NULL REFERENCES attribute_values(id) ON DELETE CASCADE,
      PRIMARY KEY (variant_id, attribute_value_id)
    );

    -- TAXONOMIES
    CREATE TABLE IF NOT EXISTS taxonomies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL,
      description TEXT,
      type VARCHAR(20) NOT NULL CHECK (type IN ('product_cat','post_cat','product_tag','post_tag')),
      parent_id UUID REFERENCES taxonomies(id),
      image TEXT,
      display_type VARCHAR(20) DEFAULT 'default',
      sort_order INTEGER DEFAULT 0,
      meta_title TEXT,
      meta_description TEXT,
      wp_id INTEGER UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(slug, type)
    );
    CREATE INDEX IF NOT EXISTS idx_taxonomies_type ON taxonomies(type);

    CREATE TABLE IF NOT EXISTS content_taxonomies (
      content_id UUID NOT NULL,
      taxonomy_id UUID NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,
      content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('product','post','page')),
      PRIMARY KEY (content_id, taxonomy_id, content_type)
    );

    -- POSTS
    CREATE TABLE IF NOT EXISTS posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(255) UNIQUE NOT NULL,
      title VARCHAR(500) NOT NULL,
      content TEXT,
      excerpt TEXT,
      format VARCHAR(20) DEFAULT 'standard',
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','published','archived','scheduled')),
      meta_title TEXT,
      meta_description TEXT,
      canonical_url TEXT,
      og_title VARCHAR(255),
      og_description TEXT,
      og_image TEXT,
      featured_image TEXT,
      custom_fields JSONB DEFAULT '{}',
      author_id UUID REFERENCES users(id),
      wp_id INTEGER UNIQUE,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);

    -- PAGES
    CREATE TABLE IF NOT EXISTS pages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(255) UNIQUE NOT NULL,
      title VARCHAR(500) NOT NULL,
      content TEXT,
      template VARCHAR(100) DEFAULT 'default',
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
      meta_title TEXT,
      meta_description TEXT,
      canonical_url TEXT,
      og_title VARCHAR(255),
      og_description TEXT,
      og_image TEXT,
      featured_image TEXT,
      custom_fields JSONB DEFAULT '{}',
      sort_order INTEGER DEFAULT 0,
      author_id UUID REFERENCES users(id),
      wp_id INTEGER UNIQUE,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ORDERS
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_number VARCHAR(50) UNIQUE NOT NULL,
      user_id UUID REFERENCES users(id),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled','refunded','failed')),
      payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','partially_refunded','refunded','failed')),
      fulfillment_status VARCHAR(20) DEFAULT 'unfulfilled',
      billing_name VARCHAR(255),
      billing_email VARCHAR(255),
      billing_phone VARCHAR(50),
      billing_address JSONB,
      shipping_name VARCHAR(255),
      shipping_phone VARCHAR(50),
      shipping_address JSONB,
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
      discount_total DECIMAL(12,2) DEFAULT 0,
      shipping_total DECIMAL(12,2) DEFAULT 0,
      tax_total DECIMAL(12,2) DEFAULT 0,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      currency VARCHAR(3) DEFAULT 'VND',
      payment_method VARCHAR(50),
      payment_ref VARCHAR(255),
      shipping_method VARCHAR(100),
      tracking_number VARCHAR(255),
      shipped_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      customer_note TEXT,
      admin_note TEXT,
      coupon_code VARCHAR(50),
      custom_fields JSONB DEFAULT '{}',
      wp_id INTEGER UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

    CREATE TABLE IF NOT EXISTS order_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      variant_id UUID REFERENCES product_variants(id),
      name VARCHAR(500) NOT NULL,
      sku VARCHAR(100),
      price DECIMAL(12,2) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      subtotal DECIMAL(12,2) NOT NULL,
      discount_total DECIMAL(12,2) DEFAULT 0,
      tax_total DECIMAL(12,2) DEFAULT 0,
      total DECIMAL(12,2) NOT NULL,
      image TEXT,
      attributes JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

    -- COUPONS
    CREATE TABLE IF NOT EXISTS coupons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(50) UNIQUE NOT NULL,
      type VARCHAR(20) NOT NULL CHECK (type IN ('percentage','fixed','free_shipping')),
      value DECIMAL(12,2) NOT NULL,
      min_order_amount DECIMAL(12,2),
      max_discount DECIMAL(12,2),
      usage_limit INTEGER,
      usage_count INTEGER DEFAULT 0,
      per_user_limit INTEGER DEFAULT 1,
      applicable_products UUID[] DEFAULT '{}',
      applicable_categories UUID[] DEFAULT '{}',
      starts_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- CARTS
    CREATE TABLE IF NOT EXISTS carts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      session_id VARCHAR(255),
      items JSONB DEFAULT '[]',
      coupon_code VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
    );

    -- MEDIA
    CREATE TABLE IF NOT EXISTS media (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      filename VARCHAR(500) NOT NULL,
      original_name VARCHAR(500),
      mime_type VARCHAR(100),
      size INTEGER,
      width INTEGER,
      height INTEGER,
      url TEXT NOT NULL,
      alt_text VARCHAR(500),
      title VARCHAR(500),
      folder VARCHAR(255) DEFAULT '/',
      uploaded_by UUID REFERENCES users(id),
      wp_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- MENUS
    CREATE TABLE IF NOT EXISTS menus (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      location VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
      parent_id UUID REFERENCES menu_items(id),
      title VARCHAR(255) NOT NULL,
      url TEXT,
      type VARCHAR(20) DEFAULT 'custom',
      target_id UUID,
      css_class VARCHAR(100),
      icon VARCHAR(50),
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- REDIRECTS
    CREATE TABLE IF NOT EXISTS redirects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      old_path TEXT NOT NULL,
      new_path TEXT NOT NULL,
      status_code INTEGER DEFAULT 301,
      is_regex BOOLEAN DEFAULT false,
      hit_count INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_redirects_old_path ON redirects(old_path) WHERE NOT is_regex;

    -- SETTINGS
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value JSONB NOT NULL,
      group_name VARCHAR(50) DEFAULT 'general',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- REVIEWS
    CREATE TABLE IF NOT EXISTS reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id),
      reviewer_name VARCHAR(255),
      reviewer_email VARCHAR(255),
      rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      title VARCHAR(255),
      content TEXT,
      is_verified BOOLEAN DEFAULT false,
      is_approved BOOLEAN DEFAULT false,
      wp_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- SESSIONS
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(500) UNIQUE,
      ip_address VARCHAR(45),
      user_agent TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  `);

  // Seed default settings
  const defaults = [
    ['site_name', '"altCMS Store"', 'general'],
    ['site_description', '"Lightweight E-Commerce CMS"', 'general'],
    ['currency', '"VND"', 'general'],
    ['language', '"vi"', 'general'],
    ['timezone', '"Asia/Ho_Chi_Minh"', 'general'],
    ['items_per_page', '20', 'store'],
    ['enable_reviews', 'true', 'store'],
    ['enable_guest_checkout', 'true', 'store'],
  ];

  for (const [key, value, group] of defaults) {
    await query(
      `INSERT INTO settings (key, value, group_name) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
      [key, value, group]
    );
  }

  // Create admin user if not exists
  const existing = await query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(config.admin.password, 12);
    await query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin')`,
      [config.admin.email, hash, 'Administrator']
    );
    console.log(`[DB] Admin user created: ${config.admin.email}`);
  }

  console.log('[DB] Migrations complete.');
}
