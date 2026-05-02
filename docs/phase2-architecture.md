# altCMS — Phase 2: System Architect

> **Status:** ✅ Complete
> **Self-evaluation:** Schema thiết kế tối ưu cho PostgreSQL với JSONB cho flexibility. Tech stack chọn Node.js+Fastify cho tốc độ và developer experience. Migration flow xử lý được cả 3 source (DB, API, XML). Có thể cải thiện bằng benchmark thực tế với dataset lớn.

---

## 1. Tech Stack Decision

### 1.1 Comparison Matrix

| Criteria | Node.js + Fastify | Go + Fiber | Python + FastAPI | PHP + Laravel |
|----------|-------------------|------------|-------------------|---------------|
| **Performance** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Developer Speed** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Ecosystem** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Memory Usage** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Hiring Pool** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **WP Migration Tools** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Template Engine** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

### 🏆 Decision: **Node.js + Fastify + PostgreSQL + EJS + Tailwind**

**Rationale:**
- Fastify: ~30k req/s, lowest overhead among Node frameworks
- PostgreSQL: JSONB for custom fields, full-text search natively, excellent for 10k+ products
- EJS: Server-side rendering for SEO + speed (no SPA hydration overhead)
- Tailwind: Utility-first CSS, tiny production bundle, no JS dependency
- Native ESM modules for tree-shaking

### 1.2 Architecture Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                        altCMS Architecture                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    REVERSE PROXY (Caddy/Nginx)           │    │
│  │              SSL termination + Static file cache         │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────┐    │
│  │                    FASTIFY SERVER                        │    │
│  │                                                          │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐  │    │
│  │  │  Admin API   │  │ Storefront  │  │ Migration API  │  │    │
│  │  │  /api/admin  │  │ /api/store  │  │ /api/migrate   │  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └───────┬────────┘  │    │
│  │         │                │                  │            │    │
│  │  ┌──────▼────────────────▼──────────────────▼────────┐  │    │
│  │  │              SERVICE LAYER                         │  │    │
│  │  │  ProductService, OrderService, ContentService,     │  │    │
│  │  │  AuthService, MigrationService, SEOService         │  │    │
│  │  └──────────────────────┬────────────────────────────┘  │    │
│  │                         │                                │    │
│  │  ┌──────────────────────▼────────────────────────────┐  │    │
│  │  │              REPOSITORY LAYER                      │  │    │
│  │  │  PostgreSQL (pg driver) + Connection Pool          │  │    │
│  │  └──────────────────────┬────────────────────────────┘  │    │
│  └─────────────────────────┼────────────────────────────────┘    │
│                            │                                     │
│  ┌─────────────────────────▼────────────────────────────────┐    │
│  │                    PostgreSQL 16                          │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │    │
│  │  │  Users   │  │ Products │  │  Orders  │  │ Content  │ │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                    ASSETS                                │    │
│  │  /uploads/ (images)  →  Local disk / S3-compatible       │    │
│  │  /public/  (static)  →  Served by Caddy/Nginx            │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema (PostgreSQL)

### 2.1 Core Tables

```sql
-- ============================================
-- USERS & AUTHENTICATION
-- ============================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'customer'
                    CHECK (role IN ('admin','editor','author','customer')),
    avatar_url      TEXT,
    phone           VARCHAR(50),
    is_active       BOOLEAN DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    wp_id           INTEGER UNIQUE,  -- migration reference
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================
-- PRODUCTS
-- ============================================
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            VARCHAR(255) UNIQUE NOT NULL,
    name            VARCHAR(500) NOT NULL,
    description     TEXT,
    short_desc      VARCHAR(1000),
    sku             VARCHAR(100) UNIQUE,
    price           DECIMAL(12,2) NOT NULL DEFAULT 0,
    compare_at_price DECIMAL(12,2),          -- original price for "sale"
    cost_price      DECIMAL(12,2),           -- for profit calculation
    currency        VARCHAR(3) DEFAULT 'VND',
    type            VARCHAR(20) DEFAULT 'simple'
                    CHECK (type IN ('simple','variable','grouped','digital')),
    status          VARCHAR(20) DEFAULT 'draft'
                    CHECK (status IN ('draft','published','archived')),
    visibility      VARCHAR(20) DEFAULT 'visible'
                    CHECK (visibility IN ('visible','hidden','catalog','search')),

    -- Inventory
    manage_stock    BOOLEAN DEFAULT false,
    stock_quantity  INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 5,
    backorders_allowed BOOLEAN DEFAULT false,
    sold_individually BOOLEAN DEFAULT false,

    -- Physical
    weight          DECIMAL(8,2),
    length          DECIMAL(8,2),
    width           DECIMAL(8,2),
    height          DECIMAL(8,2),
    shipping_class  VARCHAR(100),

    -- SEO
    meta_title      VARCHAR(255),
    meta_description VARCHAR(500),
    canonical_url   TEXT,
    og_title        VARCHAR(255),
    og_description  VARCHAR(500),
    og_image        TEXT,

    -- Media
    featured_image  TEXT,
    gallery         JSONB DEFAULT '[]',       -- [{url, alt, width, height}]

    -- Flexible attributes (ACF-like)
    custom_fields   JSONB DEFAULT '{}',

    -- Relations
    brand_id        UUID REFERENCES brands(id),
    created_by      UUID REFERENCES users(id),

    -- Migration
    wp_id           INTEGER UNIQUE,

    -- Timestamps
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_type ON products(type);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_created ON products(created_at DESC);
CREATE INDEX idx_products_search ON products USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- ============================================
-- PRODUCT VARIANTS (for variable products)
-- ============================================
CREATE TABLE product_variants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku             VARCHAR(100) UNIQUE,
    name            VARCHAR(255),
    price           DECIMAL(12,2) NOT NULL,
    compare_at_price DECIMAL(12,2),
    stock_quantity  INTEGER DEFAULT 0,
    weight          DECIMAL(8,2),
    image           TEXT,
    attributes      JSONB NOT NULL DEFAULT '{}',  -- {"color": "Red", "size": "XL"}
    is_active       BOOLEAN DEFAULT true,
    sort_order      INTEGER DEFAULT 0,
    wp_id           INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_variants_product ON product_variants(product_id);

-- ============================================
-- BRANDS
-- ============================================
CREATE TABLE brands (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) UNIQUE NOT NULL,
    logo_url        TEXT,
    description     TEXT,
    website_url     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ATTRIBUTES (Color, Size, Material, etc.)
-- ============================================
CREATE TABLE attributes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    type            VARCHAR(20) DEFAULT 'select'
                    CHECK (type IN ('select','color','text','number')),
    is_filterable   BOOLEAN DEFAULT true,
    is_visible_on_product BOOLEAN DEFAULT true,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE attribute_values (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attribute_id    UUID NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
    value           VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL,
    color_hex       VARCHAR(7),              -- for color type
    sort_order      INTEGER DEFAULT 0,
    UNIQUE(attribute_id, slug)
);

-- Link product variants to attribute values
CREATE TABLE variant_attribute_values (
    variant_id      UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    attribute_value_id UUID NOT NULL REFERENCES attribute_values(id) ON DELETE CASCADE,
    PRIMARY KEY (variant_id, attribute_value_id)
);

-- ============================================
-- TAXONOMY (Categories & Tags - unified)
-- ============================================
CREATE TABLE taxonomies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL,
    description     TEXT,
    type            VARCHAR(20) NOT NULL
                    CHECK (type IN ('product_cat','post_cat','product_tag','post_tag')),
    parent_id       UUID REFERENCES taxonomies(id),
    image           TEXT,
    display_type    VARCHAR(20) DEFAULT 'default'
                    CHECK (display_type IN ('default','products','subcategories','both')),
    sort_order      INTEGER DEFAULT 0,
    meta_title      VARCHAR(255),
    meta_description VARCHAR(500),
    wp_id           INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(slug, type)
);

CREATE INDEX idx_taxonomies_type ON taxonomies(type);
CREATE INDEX idx_taxonomies_parent ON taxonomies(parent_id);

-- Content ↔ Taxonomy relations
CREATE TABLE content_taxonomies (
    content_id      UUID NOT NULL,
    taxonomy_id     UUID NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,
    content_type    VARCHAR(20) NOT NULL CHECK (content_type IN ('product','post','page')),
    PRIMARY KEY (content_id, taxonomy_id, content_type)
);

CREATE INDEX idx_content_tax_content ON content_taxonomies(content_id, content_type);
CREATE INDEX idx_content_tax_taxonomy ON content_taxonomies(taxonomy_id);

-- ============================================
-- POSTS & PAGES
-- ============================================
CREATE TABLE posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            VARCHAR(255) UNIQUE NOT NULL,
    title           VARCHAR(500) NOT NULL,
    content         TEXT,                     -- Markdown or HTML
    excerpt         VARCHAR(1000),
    format          VARCHAR(20) DEFAULT 'standard'
                    CHECK (format IN ('standard','gallery','video','audio','quote','link')),
    status          VARCHAR(20) DEFAULT 'draft'
                    CHECK (status IN ('draft','published','archived','scheduled')),

    -- SEO
    meta_title      VARCHAR(255),
    meta_description VARCHAR(500),
    canonical_url   TEXT,
    og_title        VARCHAR(255),
    og_description  VARCHAR(500),
    og_image        TEXT,

    -- Media
    featured_image  TEXT,

    -- Flexible data
    custom_fields   JSONB DEFAULT '{}',

    -- Relations
    author_id       UUID REFERENCES users(id),
    wp_id           INTEGER UNIQUE,

    -- Timestamps
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_published ON posts(published_at DESC);
CREATE INDEX idx_posts_search ON posts USING gin(to_tsvector('english', title || ' ' || COALESCE(content, '')));

-- Pages use same structure as posts
CREATE TABLE pages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            VARCHAR(255) UNIQUE NOT NULL,
    title           VARCHAR(500) NOT NULL,
    content         TEXT,
    template        VARCHAR(100) DEFAULT 'default',
    status          VARCHAR(20) DEFAULT 'draft'
                    CHECK (status IN ('draft','published','archived')),

    -- SEO
    meta_title      VARCHAR(255),
    meta_description VARCHAR(500),
    canonical_url   TEXT,
    og_title        VARCHAR(255),
    og_description  VARCHAR(500),
    og_image        TEXT,

    featured_image  TEXT,
    custom_fields   JSONB DEFAULT '{}',
    sort_order      INTEGER DEFAULT 0,
    author_id       UUID REFERENCES users(id),
    wp_id           INTEGER UNIQUE,
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pages_slug ON pages(slug);

-- ============================================
-- ORDERS
-- ============================================
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number    VARCHAR(50) UNIQUE NOT NULL,   -- human-readable: #ALT-00001
    user_id         UUID REFERENCES users(id),

    -- Status
    status          VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','processing','shipped',
                                      'delivered','cancelled','refunded','failed')),
    payment_status  VARCHAR(20) DEFAULT 'pending'
                    CHECK (payment_status IN ('pending','paid','partially_refunded',
                                              'refunded','failed')),
    fulfillment_status VARCHAR(20) DEFAULT 'unfulfilled'
                    CHECK (fulfillment_status IN ('unfulfilled','partial','fulfilled')),

    -- Customer info (snapshot at order time)
    billing_name    VARCHAR(255),
    billing_email   VARCHAR(255),
    billing_phone   VARCHAR(50),
    billing_address JSONB,                  -- {line1, line2, city, state, zip, country}

    shipping_name   VARCHAR(255),
    shipping_phone  VARCHAR(50),
    shipping_address JSONB,

    -- Totals
    subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_total  DECIMAL(12,2) DEFAULT 0,
    shipping_total  DECIMAL(12,2) DEFAULT 0,
    tax_total       DECIMAL(12,2) DEFAULT 0,
    total           DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency        VARCHAR(3) DEFAULT 'VND',

    -- Payment
    payment_method  VARCHAR(50),
    payment_ref     VARCHAR(255),           -- gateway transaction ID

    -- Shipping
    shipping_method VARCHAR(100),
    tracking_number VARCHAR(255),
    shipped_at      TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,

    -- Notes
    customer_note   TEXT,
    admin_note      TEXT,

    -- Coupon
    coupon_code     VARCHAR(50),

    -- Flexible data
    custom_fields   JSONB DEFAULT '{}',

    wp_id           INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

CREATE TABLE order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    variant_id      UUID REFERENCES product_variants(id),
    name            VARCHAR(500) NOT NULL,  -- snapshot
    sku             VARCHAR(100),
    price           DECIMAL(12,2) NOT NULL, -- snapshot
    quantity        INTEGER NOT NULL DEFAULT 1,
    subtotal        DECIMAL(12,2) NOT NULL,
    discount_total  DECIMAL(12,2) DEFAULT 0,
    tax_total       DECIMAL(12,2) DEFAULT 0,
    total           DECIMAL(12,2) NOT NULL,
    image           TEXT,                   -- snapshot
    attributes      JSONB DEFAULT '{}',     -- snapshot of variant attrs
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ============================================
-- COUPONS
-- ============================================
CREATE TABLE coupons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(50) UNIQUE NOT NULL,
    type            VARCHAR(20) NOT NULL CHECK (type IN ('percentage','fixed','free_shipping')),
    value           DECIMAL(12,2) NOT NULL,
    min_order_amount DECIMAL(12,2),
    max_discount    DECIMAL(12,2),
    usage_limit     INTEGER,
    usage_count     INTEGER DEFAULT 0,
    per_user_limit  INTEGER DEFAULT 1,
    applicable_products UUID[] DEFAULT '{}',
    applicable_categories UUID[] DEFAULT '{}',
    starts_at       TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CART (server-side for guest + logged-in)
-- ============================================
CREATE TABLE carts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    session_id      VARCHAR(255),           -- for guest users
    items           JSONB DEFAULT '[]',     -- [{product_id, variant_id, quantity}]
    coupon_code     VARCHAR(50),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX idx_carts_user ON carts(user_id);
CREATE INDEX idx_carts_session ON carts(session_id);

-- ============================================
-- MEDIA
-- ============================================
CREATE TABLE media (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename        VARCHAR(500) NOT NULL,
    original_name   VARCHAR(500),
    mime_type       VARCHAR(100),
    size            INTEGER,                -- bytes
    width           INTEGER,
    height          INTEGER,
    url             TEXT NOT NULL,
    alt_text        VARCHAR(500),
    title           VARCHAR(500),
    folder          VARCHAR(255) DEFAULT '/',
    uploaded_by     UUID REFERENCES users(id),
    wp_id           INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_media_folder ON media(folder);

-- ============================================
-- MENUS
-- ============================================
CREATE TABLE menus (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    location        VARCHAR(50),            -- header, footer, mobile
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE menu_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id         UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES menu_items(id),
    title           VARCHAR(255) NOT NULL,
    url             TEXT,
    type            VARCHAR(20) DEFAULT 'custom'
                    CHECK (type IN ('custom','page','post','category','product')),
    target_id       UUID,                   -- reference to page/post/etc
    css_class       VARCHAR(100),
    icon            VARCHAR(50),
    sort_order      INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REDIRECTS (for migration)
-- ============================================
CREATE TABLE redirects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    old_path        TEXT NOT NULL,
    new_path        TEXT NOT NULL,
    status_code     INTEGER DEFAULT 301,
    is_regex        BOOLEAN DEFAULT false,
    hit_count       INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_redirects_old_path ON redirects(old_path) WHERE NOT is_regex;
CREATE INDEX idx_redirects_active ON redirects(is_active);

-- ============================================
-- SETTINGS (key-value store)
-- ============================================
CREATE TABLE settings (
    key             VARCHAR(100) PRIMARY KEY,
    value           JSONB NOT NULL,
    group_name      VARCHAR(50) DEFAULT 'general',
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REVIEWS
-- ============================================
CREATE TABLE reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    reviewer_name   VARCHAR(255),
    reviewer_email  VARCHAR(255),
    rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title           VARCHAR(255),
    content         TEXT,
    is_verified     BOOLEAN DEFAULT false,  -- verified purchase
    is_approved     BOOLEAN DEFAULT false,
    wp_id           INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);

-- ============================================
-- SESSIONS (for auth)
-- ============================================
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    token           VARCHAR(500) UNIQUE NOT NULL,
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user ON sessions(user_id);
```

### 2.2 Seed Data (Settings)

```sql
INSERT INTO settings (key, value, group_name) VALUES
('site_name', '"altCMS Store"', 'general'),
('site_description', '"Lightweight E-Commerce CMS"', 'general'),
('site_url', '"http://localhost:3000"', 'general'),
('currency', '"VND"', 'general'),
('language', '"vi"', 'general'),
('timezone', '"Asia/Ho_Chi_Minh"', 'general'),
('meta_title', '"altCMS - Fast & Secure E-Commerce"', 'seo'),
('meta_description', '"A lightweight CMS replacing WordPress + WooCommerce"', 'seo'),
('og_image', '""', 'seo'),
('items_per_page', '20', 'store'),
('enable_reviews', 'true', 'store'),
('enable_guest_checkout', 'true', 'store'),
('low_stock_threshold', '5', 'store'),
('smtp_host', '""', 'email'),
('smtp_port', '587', 'email'),
('smtp_user', '""', 'email'),
('smtp_pass', '""', 'email'),
('stripe_public_key', '""', 'payment'),
('stripe_secret_key', '""', 'payment');
```

---

## 3. Migration Flow (Detailed)

### 3.1 Migration Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MIGRATION SERVICE                                │
│                                                                      │
│  Phase 1: DISCOVERY                                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  • Connect to WP source (DB/API/XML)                        │    │
│  │  • Inventory: count products, posts, pages, users, orders   │    │
│  │  • Detect WP version, active plugins (WC, Yoast, etc.)      │    │
│  │  • Report estimated migration time                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                           │                                          │
│  Phase 2: DRY RUN                                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  • Extract sample data (10 items per type)                  │    │
│  │  • Transform and validate mappings                          │    │
│  │  • Show diff preview to admin                               │    │
│  │  • Flag potential issues (missing images, broken refs)      │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                           │                                          │
│  Phase 3: FULL MIGRATION (batched)                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Batch 1: Users (1000/batch)                                │    │
│  │  Batch 2: Brands + Categories + Tags                        │    │
│  │  Batch 3: Products + Variants + Attributes (500/batch)      │    │
│  │  Batch 4: Posts + Pages                                     │    │
│  │  Batch 5: Orders + Order Items                              │    │
│  │  Batch 6: Media (download + re-upload)                      │    │
│  │  Batch 7: Reviews                                           │    │
│  │  Batch 8: SEO data (Yoast meta, redirects)                  │    │
│  │                                                             │    │
│  │  • Progress bar per batch                                   │    │
│  │  • Error handling: log + skip vs halt                       │    │
│  │  • Transaction per batch (rollback on failure)              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                           │                                          │
│  Phase 4: VALIDATION                                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  • Count comparison (source vs target)                      │    │
│  │  • Spot check: random 50 products, verify images            │    │
│  │  • SEO check: all meta fields populated                     │    │
│  │  • URL check: redirect map covers all old URLs              │    │
│  │  • Generate migration report                                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                           │                                          │
│  Phase 5: DELTA SYNC (optional)                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  • Track last_synced_at per entity type                     │    │
│  │  • Only import new/updated records                          │    │
│  │  • Handle deletions (soft-delete or archive)                │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Field Mapping (WP → altCMS)

```
WordPress wp_posts → altCMS.products
──────────────────────────────────────
ID              → wp_id (reference)
post_title      → name
post_name       → slug
post_content    → description
post_excerpt    → short_desc
post_status     → status (publish→published, draft→draft, private→hidden)
post_date       → created_at
post_modified   → updated_at

WordPress wp_postmeta → altCMS.products
──────────────────────────────────────
_price          → price
_sale_price     → compare_at_price
_regular_price  → price (if no _price)
_sku            → sku
_stock          → stock_quantity
_manage_stock   → manage_stock
_weight         → weight
_length         → length
_width          → width
_height         → height
_thumbnail_id   → featured_image (resolve to URL)
_product_image_gallery → gallery (resolve to URLs)
_total_sales    → custom_fields._total_sales

WordPress wp_postmeta (Yoast) → altCMS.products
──────────────────────────────────────
_yoast_wpseo_title          → meta_title
_yoast_wpseo_metadesc       → meta_description
_yoast_wpseo_canonical      → canonical_url
_yoast_wpseo_opengraph-title → og_title
_yoast_wpseo_opengraph-description → og_description
_yoast_wpseo_opengraph-image → og_image

WordPress wp_terms → altCMS.taxonomies
──────────────────────────────────────
term_id         → wp_id
name            → name
slug            → slug
(parent lookup) → parent_id

WordPress wp_users → altCMS.users
──────────────────────────────────────
ID              → wp_id
user_login      → (not stored, use email)
user_email      → email
display_name    → name
user_pass       → password_hash (re-hash on first login)
```

---

## 4. API Design (REST)

### 4.1 Endpoint Structure

```
Authentication
──────────────
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me

Admin - Products
────────────────
GET    /api/admin/products              (list, filter, paginate)
POST   /api/admin/products              (create)
GET    /api/admin/products/:id          (read)
PUT    /api/admin/products/:id          (update)
DELETE /api/admin/products/:id          (delete)
POST   /api/admin/products/:id/variants (add variant)
PUT    /api/admin/products/:id/variants/:vid (update variant)
POST   /api/admin/products/bulk         (bulk actions)

Admin - Orders
──────────────
GET    /api/admin/orders
GET    /api/admin/orders/:id
PUT    /api/admin/orders/:id/status
POST   /api/admin/orders/:id/refund

Admin - Content
───────────────
GET    /api/admin/posts
POST   /api/admin/posts
GET    /api/admin/posts/:id
PUT    /api/admin/posts/:id
DELETE /api/admin/posts/:id

GET    /api/admin/pages
POST   /api/admin/pages
GET    /api/admin/pages/:id
PUT    /api/admin/pages/:id
DELETE /api/admin/pages/:id

Admin - Media
─────────────
GET    /api/admin/media
POST   /api/admin/media/upload
DELETE /api/admin/media/:id

Admin - Users
─────────────
GET    /api/admin/users
GET    /api/admin/users/:id
PUT    /api/admin/users/:id
DELETE /api/admin/users/:id

Admin - Taxonomy
────────────────
GET    /api/admin/taxonomies
POST   /api/admin/taxonomies
PUT    /api/admin/taxonomies/:id
DELETE /api/admin/taxonomies/:id

Admin - Settings
────────────────
GET    /api/admin/settings
PUT    /api/admin/settings

Admin - Migration
─────────────────
POST   /api/admin/migrate/connect      (test connection)
POST   /api/admin/migrate/discover      (inventory source data)
POST   /api/admin/migrate/dry-run       (preview migration)
POST   /api/admin/migrate/start         (full migration)
GET    /api/admin/migrate/status        (progress)
POST   /api/admin/migrate/sync          (delta sync)
GET    /api/admin/migrate/report        (validation report)

Admin - Dashboard
─────────────────
GET    /api/admin/dashboard/stats       (revenue, orders, products count)
GET    /api/admin/dashboard/charts      (revenue over time)

Storefront
──────────
GET    /api/store/products              (public product list)
GET    /api/store/products/:slug        (product detail)
GET    /api/store/categories            (category tree)
GET    /api/store/search                (full-text search)
GET    /api/store/cart                  (get cart)
POST   /api/store/cart/add              (add item)
PUT    /api/store/cart/:itemId          (update quantity)
DELETE /api/store/cart/:itemId          (remove item)
POST   /api/store/checkout              (place order)
GET    /api/store/orders/:id            (order status, auth required)

Blog
────
GET    /api/store/posts                 (public posts list)
GET    /api/store/posts/:slug           (single post)
```

---

## 5. Project Structure

```
altcms/
├── docs/
│   └── ten-phase.md
├── src/
│   ├── config/
│   │   ├── database.js          # PostgreSQL connection pool
│   │   ├── app.js               # App configuration
│   │   └── constants.js         # Enums, constants
│   ├── middleware/
│   │   ├── auth.js              # JWT/session auth
│   │   ├── rbac.js              # Role-based access
│   │   ├── rateLimit.js         # Rate limiting
│   │   ├── sanitize.js          # Input sanitization
│   │   └── errorHandler.js      # Global error handler
│   ├── models/                  # Data access layer
│   │   ├── User.js
│   │   ├── Product.js
│   │   ├── Post.js
│   │   ├── Page.js
│   │   ├── Order.js
│   │   ├── Cart.js
│   │   ├── Media.js
│   │   ├── Taxonomy.js
│   │   ├── Review.js
│   │   ├── Coupon.js
│   │   ├── Menu.js
│   │   ├── Setting.js
│   │   └── Redirect.js
│   ├── services/                # Business logic
│   │   ├── AuthService.js
│   │   ├── ProductService.js
│   │   ├── OrderService.js
│   │   ├── ContentService.js
│   │   ├── MediaService.js
│   │   ├── SEOService.js
│   │   ├── MigrationService.js
│   │   └── DashboardService.js
│   ├── routes/                  # Route handlers
│   │   ├── admin/
│   │   │   ├── products.js
│   │   │   ├── orders.js
│   │   │   ├── posts.js
│   │   │   ├── pages.js
│   │   │   ├── media.js
│   │   │   ├── users.js
│   │   │   ├── taxonomies.js
│   │   │   ├── settings.js
│   │   │   ├── migrate.js
│   │   │   └── dashboard.js
│   │   ├── store/
│   │   │   ├── products.js
│   │   │   ├── cart.js
│   │   │   ├── checkout.js
│   │   │   ├── posts.js
│   │   │   └── search.js
│   │   └── auth.js
│   ├── views/                   # EJS templates
│   │   ├── layouts/
│   │   │   └── main.ejs
│   │   ├── admin/
│   │   │   ├── dashboard.ejs
│   │   │   ├── products/
│   │   │   ├── orders/
│   │   │   ├── posts/
│   │   │   ├── settings/
│   │   │   └── migrate.ejs
│   │   ├── store/
│   │   │   ├── home.ejs
│   │   │   ├── product.ejs
│   │   │   ├── category.ejs
│   │   │   ├── cart.ejs
│   │   │   ├── checkout.ejs
│   │   │   ├── post.ejs
│   │   │   └── search.ejs
│   │   └── partials/
│   │       ├── header.ejs
│   │       ├── footer.ejs
│   │       ├── seo-meta.ejs
│   │       └── schema-jsonld.ejs
│   ├── utils/
│   │   ├── slugify.js
│   │   ├── validator.js
│   │   ├── pagination.js
│   │   └── schema-org.js
│   ├── migration/
│   │   ├── connectors/
│   │   │   ├── wp-database.js   # Direct MySQL connection
│   │   │   ├── wp-api.js        # REST API connector
│   │   │   └── wp-xml.js        # XML export parser
│   │   ├── transformers/
│   │   │   ├── product.js
│   │   │   ├── post.js
│   │   │   ├── user.js
│   │   │   └── order.js
│   │   └── migrator.js          # Main migration orchestrator
│   ├── public/
│   │   ├── css/
│   │   │   └── app.css          # Tailwind output
│   │   ├── js/
│   │   │   ├── admin.js
│   │   │   └── store.js
│   │   └── images/
│   ├── uploads/                 # User uploads
│   ├── migrations/              # DB migrations
│   │   └── 001_initial.sql
│   ├── app.js                   # Fastify app entry
│   └── server.js                # Server startup
├── scripts/
│   ├── setup.sh                 # First-run setup
│   ├── seed.sh                  # Seed sample data
│   └── build-css.sh             # Tailwind build
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── tailwind.config.js
└── README.md
```

---

*Phase 2 Complete. Auto-proceeding to Phase 3: Lead Developer...*
