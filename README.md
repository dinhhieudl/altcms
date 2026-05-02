# altCMS — Lightweight Agentic CMS

> Thay thế WordPress + WooCommerce + Flatsome với tốc độ và bảo mật vượt trội.

## Tính năng chính

- **Products** — CRUD đầy đủ, biến thể (variable products), thuộc tính, hình ảnh gallery
- **Orders** — Quản lý đơn hàng, trạng thái, thanh toán COD/Stripe
- **Blog & Pages** — Viết bài Markdown/HTML, SEO metadata
- **Migration** — Tự động migrate từ WordPress (DB direct / REST API / XML)
- **SEO** — Schema.org JSON-LD, sitemap, meta tags, breadcrumbs, clean URLs
- **Admin Dashboard** — Giao diện hiện đại, responsive, dark mode
- **Cart & Checkout** — Server-side cart, guest checkout, coupon
- **Media Library** — Upload, quản lý hình ảnh
- **RBAC** — Admin, Editor, Author, Customer roles
- **Performance** — SSR với EJS, PostgreSQL full-text search, target <1s load

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 22+ (ESM) |
| Framework | Fastify 5 |
| Database | PostgreSQL 16 |
| Template | EJS + Tailwind CSS 3 |
| Auth | Cookie-based sessions + bcrypt |
| Proxy | Caddy 2 (SSL + gzip) |
| Container | Docker + Docker Compose |

## Quick Start

```bash
# 1. Clone
git clone https://github.com/dinhhieudl/altcms.git
cd altcms

# 2. Setup env
cp .env.example .env
# Edit .env with your settings

# 3. Start with Docker
docker compose up -d

# 4. Access
# Storefront: http://localhost:3000
# Admin:      http://localhost:3000/admin
# Login:      admin@altcms.local / admin123
```

## Manual Setup (without Docker)

```bash
# Prerequisites: Node.js 20+, PostgreSQL 16+

# 1. Install dependencies
npm install

# 2. Create database
createdb altcms

# 3. Configure
cp .env.example .env
# Edit DATABASE_URL in .env

# 4. Run migrations (auto-creates tables + admin user)
npm start

# 5. Build CSS
npm run build:css

# 6. Access
# http://localhost:3000
```

## Migration từ WordPress

### Cách 1: Direct Database (nhanh nhất)
1. Vào Admin → Migration
2. Chọn "Database (MySQL)"
3. Nhập thông tin kết nối WP database
4. Nhấn "Kết nối" → "Quét dữ liệu"
5. Xem preview → "Full Migration"

### Cách 2: REST API (không cần DB access)
1. Vào Admin → Migration
2. Chọn "REST API"
3. Nhập URL site WP + App Password
4. Tiến hành migration

### Cách 3: Import XML
```bash
# Export WP data as XML, then:
curl -X POST http://localhost:3000/api/admin/migrate/import-xml \
  -F "file=@wordpress-export.xml"
```

## Project Structure

```
altcms/
├── src/
│   ├── app.js              # Fastify app entry
│   ├── server.js            # Server startup
│   ├── config/              # App config, DB, constants
│   ├── middleware/           # Auth, RBAC, sanitizer
│   ├── models/              # Data access layer (12 models)
│   ├── routes/
│   │   ├── admin/           # Admin API routes (9 modules)
│   │   ├── store/           # Storefront routes
│   │   └── auth.js          # Authentication
│   ├── migration/           # WP migration engine
│   ├── migrations/          # DB schema migrations
│   ├── views/
│   │   ├── admin/           # Admin EJS templates
│   │   ├── store/           # Storefront EJS templates
│   │   ├── layouts/         # Page layouts
│   │   └── partials/        # Header, footer
│   ├── public/              # Static assets (CSS, JS)
│   └── utils/               # Helpers (slug, pagination, schema)
├── docker-compose.yml
├── Dockerfile
├── Caddyfile
└── README.md
```

## API Documentation

### Authentication
```
POST /api/auth/login         { email, password }
POST /api/auth/register      { email, password, name }
POST /api/auth/logout
GET  /api/auth/me
```

### Admin (requires auth)
```
GET    /api/admin/products          # List products
POST   /api/admin/products          # Create product
PUT    /api/admin/products/:id      # Update product
DELETE /api/admin/products/:id      # Delete product

GET    /api/admin/orders            # List orders
PUT    /api/admin/orders/:id/status # Update order status

GET/POST /api/admin/posts           # Blog posts CRUD
GET/POST /api/admin/pages           # Static pages CRUD
GET/POST /api/admin/media           # Media management
GET/POST /api/admin/taxonomies      # Categories & tags
GET/PUT  /api/admin/settings        # Site settings
GET      /api/admin/dashboard/stats # Dashboard data
POST     /api/admin/migrate/connect # Connect WP source
POST     /api/admin/migrate/start   # Start migration
```

### Storefront (public)
```
GET  /api/store/products             # Browse products
GET  /api/store/products/:slug       # Product detail
GET  /api/store/search?q=...         # Full-text search
GET  /api/store/posts                # Blog listing
GET  /api/store/categories           # Category tree

GET  /api/store/cart                 # View cart
POST /api/store/cart/add             # Add to cart
PUT  /api/store/cart/:idx            # Update quantity
POST /api/store/checkout             # Place order
```

## Performance Targets

| Metric | Target | How |
|--------|--------|-----|
| TTFB | <100ms | Fastify + connection pooling |
| LCP | <1.5s | SSR + optimized images |
| FID | <100ms | Minimal JS, no framework |
| CLS | <0.1 | Fixed layouts, lazy loading |
| DB Query | <50ms | Indexes + query optimization |

## Security

- **XSS Prevention**: Input sanitization middleware
- **SQL Injection**: Parameterized queries (pg driver)
- **CSRF**: SameSite cookies
- **Rate Limiting**: 100 req/min per IP
- **Auth**: Bcrypt password hashing, httpOnly session cookies
- **Headers**: X-Content-Type-Options, X-Frame-Options, CSP
- **RBAC**: Role-based access control on all admin routes

## License

MIT
