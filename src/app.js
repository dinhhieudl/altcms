import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyFormbody from '@fastify/formbody';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import fastifyRateLimit from '@fastify/rate-limit';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from './config/app.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { Redirect } from './models/Redirect.js';
import { generateSchemaOrg } from './utils/schema-org.js';

// Route imports
import authRoutes from './routes/auth.js';
import productRoutes from './routes/admin/products.js';
import orderRoutes from './routes/admin/orders.js';
import postRoutes from './routes/admin/posts.js';
import pageRoutes from './routes/admin/pages.js';
import mediaRoutes from './routes/admin/media.js';
import userRoutes from './routes/admin/users.js';
import taxonomyRoutes from './routes/admin/taxonomies.js';
import settingsRoutes from './routes/admin/settings.js';
import dashboardRoutes from './routes/admin/dashboard.js';
import migrateRoutes from './routes/admin/migrate.js';
import storeProductRoutes from './routes/store/products.js';
import cartRoutes from './routes/store/cart.js';
import storePostRoutes from './routes/store/posts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.env === 'production' ? 'info' : 'debug',
      transport: config.env !== 'production' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
    },
    trustProxy: true,
  });

  // Plugins
  await app.register(fastifyCookie);
  await app.register(fastifyFormbody);
  await app.register(fastifyMultipart, { limits: { fileSize: config.upload.maxSize } });
  await app.register(fastifyRateLimit, { max: 100, timeWindow: '1 minute' });

  // Static files
  await app.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
    decorateReply: false,
  });
  await app.register(fastifyStatic, {
    root: path.resolve(config.upload.dir),
    prefix: '/uploads/',
    decorateReply: false,
  });

  // View engine
  await app.register(fastifyView, {
    engine: { ejs },
    root: path.join(__dirname, 'views'),
    viewExt: 'ejs',
    layout: 'layouts/main',
  });

  // Auth middleware
  app.addHook('preHandler', authMiddleware);

  // Global helpers for templates
  app.decorateReply('viewCtx', function (template, data = {}) {
    return this.view(template, {
      ...data,
      user: this.request.user || null,
      site: { name: 'altCMS', currency: config.store.currency },
      generateSchemaOrg,
    });
  });

  // Register API routes
  await app.register(authRoutes);
  await app.register(productRoutes);
  await app.register(orderRoutes);
  await app.register(postRoutes);
  await app.register(pageRoutes);
  await app.register(mediaRoutes);
  await app.register(userRoutes);
  await app.register(taxonomyRoutes);
  await app.register(settingsRoutes);
  await app.register(dashboardRoutes);
  await app.register(migrateRoutes);
  await app.register(storeProductRoutes);
  await app.register(cartRoutes);
  await app.register(storePostRoutes);

  // Frontend page routes
  app.get('/', async (request, reply) => {
    const { Product } = await import('./models/Product.js');
    const { Post } = await import('./models/Post.js');
    const [products, posts] = await Promise.all([
      Product.findAll({ limit: 8, status: 'published', sort: 'created_at', order: 'DESC' }),
      Post.findAll({ limit: 4, status: 'published' }),
    ]);
    return reply.viewCtx('store/home', {
      products: products.products,
      posts: posts.posts,
      title: 'Home',
      schema: [generateSchemaOrg('website', {}), generateSchemaOrg('organization', {})],
    });
  });

  app.get('/products', async (request, reply) => {
    const { Product } = await import('./models/Product.js');
    const { page, limit } = (await import('./utils/pagination.js')).paginate(request.query);
    const { category, search, sort, order } = request.query;
    const { products, total } = await Product.findAll({ page, limit, status: 'published', category, search, sort, order });
    const pagination = (await import('./utils/pagination.js')).paginationMeta(total, page, limit);
    return reply.viewCtx('store/products', { products, pagination, title: 'Products', query: request.query });
  });

  app.get('/products/:slug', async (request, reply) => {
    const { Product } = await import('./models/Product.js');
    const product = await Product.findBySlug(request.params.slug);
    if (!product || product.status !== 'published') {
      return reply.code(404).viewCtx('store/404', { title: 'Not Found' });
    }
    return reply.viewCtx('store/product', {
      product,
      title: product.name,
      schema: [generateSchemaOrg('product', product)],
    });
  });

  app.get('/blog', async (request, reply) => {
    const { Post } = await import('./models/Post.js');
    const { page, limit } = (await import('./utils/pagination.js')).paginate(request.query, 10);
    const { posts, total } = await Post.findAll({ page, limit, status: 'published' });
    const pagination = (await import('./utils/pagination.js')).paginationMeta(total, page, limit);
    return reply.viewCtx('store/blog', { posts, pagination, title: 'Blog' });
  });

  app.get('/blog/:slug', async (request, reply) => {
    const { Post } = await import('./models/Post.js');
    const post = await Post.findBySlug(request.params.slug);
    if (!post) return reply.code(404).viewCtx('store/404', { title: 'Not Found' });
    return reply.viewCtx('store/post', {
      post,
      title: post.title,
      schema: [generateSchemaOrg('article', post)],
    });
  });

  app.get('/cart', async (request, reply) => {
    return reply.viewCtx('store/cart', { title: 'Cart' });
  });

  app.get('/checkout', async (request, reply) => {
    return reply.viewCtx('store/checkout', { title: 'Checkout' });
  });

  app.get('/search', async (request, reply) => {
    const { Product } = await import('./models/Product.js');
    const { q, page = 1 } = request.query;
    let products = [];
    let pagination = { total: 0, page: 1, totalPages: 0 };
    if (q) {
      const result = await Product.findAll({ page: parseInt(page), limit: 20, status: 'published', search: q });
      products = result.products;
      pagination = (await import('./utils/pagination.js')).paginationMeta(result.total, parseInt(page), 20);
    }
    return reply.viewCtx('store/search', { products, pagination, query: q || '', title: `Search: ${q || ''}` });
  });

  // Admin dashboard page
  app.get('/admin', async (request, reply) => {
    if (!request.user || !['admin', 'editor'].includes(request.user.role)) {
      return reply.redirect('/admin/login');
    }
    return reply.viewCtx('admin/dashboard', { title: 'Dashboard' });
  });

  app.get('/admin/login', async (request, reply) => {
    if (request.user) return reply.redirect('/admin');
    return reply.viewCtx('admin/login', { title: 'Login' });
  });

  // Catch-all redirect handler
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not found' });
    }

    // Check redirects
    const redirect = await Redirect.findByPath(request.url);
    if (redirect) {
      return reply.code(redirect.status_code).redirect(redirect.new_path);
    }

    return reply.code(404).viewCtx('store/404', { title: 'Page Not Found' });
  });

  app.setErrorHandler(errorHandler);

  return app;
}
