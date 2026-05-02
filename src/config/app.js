import 'dotenv/config';

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',

  db: {
    connectionString: process.env.DATABASE_URL || 'postgresql://altcms:altcms@localhost:5432/altcms',
    max: 20,
    idleTimeoutMillis: 30000,
  },

  session: {
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },

  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@altcms.local',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },

  upload: {
    dir: process.env.UPLOAD_DIR || './src/uploads',
    maxSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  },

  store: {
    itemsPerPage: parseInt(process.env.STORE_ITEMS_PER_PAGE || '20', 10),
    currency: process.env.CURRENCY || 'VND',
  },

  wp: {
    dbHost: process.env.WP_DB_HOST,
    dbPort: parseInt(process.env.WP_DB_PORT || '3306', 10),
    dbName: process.env.WP_DB_NAME,
    dbUser: process.env.WP_DB_USER,
    dbPass: process.env.WP_DB_PASS,
    apiUrl: process.env.WP_API_URL,
    apiUser: process.env.WP_API_USER,
    apiPass: process.env.WP_API_PASS,
  },
};
