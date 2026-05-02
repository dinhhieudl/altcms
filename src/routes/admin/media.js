import { Media } from '../../models/Media.js';
import { requirePermission } from '../../middleware/rbac.js';
import { paginate, paginationMeta } from '../../utils/pagination.js';
import { config } from '../../config/app.js';
import path from 'path';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';

export default async function mediaRoutes(fastify) {
  fastify.get('/api/admin/media', { preHandler: [requirePermission('media:read')] }, async (request) => {
    const { page, limit } = paginate(request.query, 50);
    const { folder, mime_type } = request.query;
    const { media, total } = await Media.findAll({ page, limit, folder, mime_type });
    return { media, pagination: paginationMeta(total, page, limit) };
  });

  fastify.post('/api/admin/media/upload', { preHandler: [requirePermission('media:write')] }, async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No file provided' });

    const ext = path.extname(data.filename);
    const filename = `${nanoid(12)}${ext}`;
    const uploadDir = path.resolve(config.upload.dir);

    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, filename);

    const buffer = await data.toBuffer();
    if (buffer.length > config.upload.maxSize) {
      return reply.code(413).send({ error: 'File too large' });
    }

    if (!config.upload.allowedTypes.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'File type not allowed' });
    }

    await fs.writeFile(filePath, buffer);

    const media = await Media.create({
      filename,
      original_name: data.filename,
      mime_type: data.mimetype,
      size: buffer.length,
      url: `/uploads/${filename}`,
      uploaded_by: request.user.id,
    });

    return reply.code(201).send({ media });
  });

  fastify.put('/api/admin/media/:id', { preHandler: [requirePermission('media:write')] }, async (request) => {
    const media = await Media.update(request.params.id, request.body);
    return { media };
  });

  fastify.delete('/api/admin/media/:id', { preHandler: [requirePermission('media:delete')] }, async (request, reply) => {
    const media = await Media.findById(request.params.id);
    if (!media) return reply.code(404).send({ error: 'Media not found' });

    // Delete file
    try {
      const filePath = path.resolve(config.upload.dir, media.filename);
      await fs.unlink(filePath);
    } catch (e) { /* file may not exist */ }

    await Media.delete(request.params.id);
    return { ok: true };
  });
}
