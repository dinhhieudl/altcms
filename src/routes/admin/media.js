import { Media } from '../../models/Media.js';
import { requirePermission } from '../../middleware/rbac.js';
import { paginate, paginationMeta } from '../../utils/pagination.js';
import { config } from '../../config/app.js';
import path from 'path';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';

// Magic bytes for allowed image types
const MAGIC_BYTES = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/gif': [0x47, 0x49, 0x46],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header (WebP starts with RIFF)
};

function detectMimeType(buffer) {
  for (const [mime, bytes] of Object.entries(MAGIC_BYTES)) {
    if (buffer.length >= bytes.length) {
      const match = bytes.every((b, i) => buffer[i] === b);
      if (match) {
        // Extra check for WebP: bytes 8-11 should be "WEBP"
        if (mime === 'image/webp') {
          if (buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
            return mime;
          }
          continue;
        }
        return mime;
      }
    }
  }
  return null;
}

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

    // Verify file type by magic bytes (not just Content-Type header)
    const detectedType = detectMimeType(buffer);
    if (!detectedType) {
      return reply.code(400).send({ error: 'Invalid image file — magic bytes do not match any allowed type' });
    }

    // Use detected type, not client-provided type
    const mimeType = detectedType;

    await fs.writeFile(filePath, buffer);

    const media = await Media.create({
      filename,
      original_name: data.filename,
      mime_type: mimeType,
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
