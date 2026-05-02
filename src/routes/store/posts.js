import { Post } from '../../models/Post.js';
import { paginate, paginationMeta } from '../../utils/pagination.js';
import { generateSchemaOrg } from '../../utils/schema-org.js';

export default async function storePostRoutes(fastify) {
  fastify.get('/api/store/posts', async (request) => {
    const { page, limit } = paginate(request.query, 10);
    const { category, search } = request.query;
    const { posts, total } = await Post.findAll({ page, limit, status: 'published', category, search });
    return { posts, pagination: paginationMeta(total, page, limit) };
  });

  fastify.get('/api/store/posts/:slug', async (request, reply) => {
    const post = await Post.findBySlug(request.params.slug);
    if (!post) return reply.code(404).send({ error: 'Post not found' });

    const schema = generateSchemaOrg('article', post);
    const breadcrumb = generateSchemaOrg('breadcrumb', {
      items: [
        { name: 'Home', url: '/' },
        { name: 'Blog', url: '/blog' },
        { name: post.title },
      ],
    });

    return { post, schema: [schema, breadcrumb] };
  });
}
