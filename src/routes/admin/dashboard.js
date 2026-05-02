import { requireRole } from '../../middleware/rbac.js';
import { query } from '../../config/database.js';

export default async function dashboardRoutes(fastify) {
  fastify.get('/api/admin/dashboard/stats', { preHandler: [requireRole('admin', 'editor')] }, async () => {
    const [products, orders, revenue, users, posts] = await Promise.all([
      query("SELECT COUNT(*) FROM products WHERE status = 'published'"),
      query('SELECT COUNT(*) FROM orders'),
      query("SELECT COALESCE(SUM(total), 0) as revenue FROM orders WHERE payment_status = 'paid'"),
      query("SELECT COUNT(*) FROM users WHERE role = 'customer'"),
      query("SELECT COUNT(*) FROM posts WHERE status = 'published'"),
    ]);

    return {
      stats: {
        products: parseInt(products.rows[0].count),
        orders: parseInt(orders.rows[0].count),
        revenue: parseFloat(revenue.rows[0].revenue),
        customers: parseInt(users.rows[0].count),
        posts: parseInt(posts.rows[0].count),
      },
    };
  });

  fastify.get('/api/admin/dashboard/charts', { preHandler: [requireRole('admin', 'editor')] }, async (request) => {
    const days = Math.max(1, Math.min(365, parseInt(request.query.days) || 30));

    const result = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue
       FROM orders WHERE created_at >= NOW() - INTERVAL '1 day' * $1
       GROUP BY DATE(created_at) ORDER BY date`,
      [days]
    );

    return { chart: result.rows };
  });
}
