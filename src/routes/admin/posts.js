import { Post } from '../../models/Post.js';
import { requirePermission } from '../../middleware/rbac.js';
import { paginate, paginationMeta } from '../../utils/pagination.js';

export default async function postRoutes(fastify) {
  fastify.get('/api/admin/posts', { preHandler: [requirePermission('posts:read')] }, async (request) => {
    const { page, limit } = paginate(request.query);
    const { status, search } = request.query;
    const { posts, total } = await Post.findAll({ page, limit, status, search });
    return { posts, pagination: paginationMeta(total, page, limit) };
  });

  fastify.get('/api/admin/posts/:id', { preHandler: [requirePermission('posts:read')] }, async (request, reply) => {
    const post = await Post.findById(request.params.id);
    if (!post) return reply.code(404).send({ error: 'Post not found' });
    return { post };
  });

  fastify.post('/api/admin/posts', { preHandler: [requirePermission('posts:write')] }, async (request, reply) => {
    const data = request.body;
    data.author_id = request.user.id;
    if (!data.title) return reply.code(400).send({ error: 'Title is required' });
    if (!data.slug) data.slug = data.title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    const post = await Post.create(data);
    return reply.code(201).send({ post });
  });

  fastify.put('/api/admin/posts/:id', { preHandler: [requirePermission('posts:write')] }, async (request) => {
    const post = await Post.update(request.params.id, request.body);
    return { post };
  });

  fastify.delete('/api/admin/posts/:id', { preHandler: [requirePermission('posts:delete')] }, async (request) => {
    await Post.delete(request.params.id);
    return { ok: true };
  });
}
