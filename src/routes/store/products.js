import { Product } from '../../models/Product.js';
import { Taxonomy } from '../../models/Taxonomy.js';
import { Review } from '../../models/Review.js';
import { paginate, paginationMeta } from '../../utils/pagination.js';
import { generateSchemaOrg } from '../../utils/schema-org.js';

export default async function storeProductRoutes(fastify) {
  // Public product listing
  fastify.get('/api/store/products', async (request) => {
    const { page, limit } = paginate(request.query, 20);
    const { category, search, minPrice, maxPrice, sort, order } = request.query;

    const { products, total } = await Product.findAll({
      page, limit, status: 'published', category, search, minPrice, maxPrice, sort, order,
    });

    return { products, pagination: paginationMeta(total, page, limit) };
  });

  // Single product by slug
  fastify.get('/api/store/products/:slug', async (request, reply) => {
    const product = await Product.findBySlug(request.params.slug);
    if (!product || product.status !== 'published') {
      return reply.code(404).send({ error: 'Product not found' });
    }

    // Get reviews
    const { reviews, total: reviewCount } = await Review.findByProduct(product.id);
    const reviewStats = await Review.getProductStats(product.id);
    product.reviews = reviews;
    product.review_count = reviewStats.count;
    product.avg_rating = reviewStats.avg_rating;

    // Schema.org
    const schema = generateSchemaOrg('product', product);
    const breadcrumb = generateSchemaOrg('breadcrumb', {
      items: [
        { name: 'Home', url: '/' },
        { name: 'Products', url: '/products' },
        ...(product.taxonomies?.filter(t => t.type === 'product_cat').map(t => ({
          name: t.name, url: `/category/${t.slug}`,
        })) || []),
        { name: product.name },
      ],
    });

    return { product, schema: [schema, breadcrumb] };
  });

  // Categories
  fastify.get('/api/store/categories', async (request) => {
    const tree = await Taxonomy.findTree('product_cat');
    return { categories: tree };
  });

  // Search
  fastify.get('/api/store/search', async (request) => {
    const { q, page = 1, limit = 20 } = request.query;
    if (!q) return { products: [], pagination: paginationMeta(0, 1, limit) };

    const { products, total } = await Product.findAll({
      page: parseInt(page), limit: parseInt(limit), status: 'published', search: q,
    });

    return { products, query: q, pagination: paginationMeta(total, parseInt(page), parseInt(limit)) };
  });
}
