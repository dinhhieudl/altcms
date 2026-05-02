export function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeInput(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map(v => typeof v === 'string' ? sanitizeInput(v) : v);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Fields that legitimately contain HTML/Markdown — skip sanitization for these
const HTML_FIELDS = new Set([
  'content', 'description', 'short_desc', 'excerpt',
  'customer_note', 'admin_note',
]);

// Recursively sanitize all string values in an object, except HTML fields
function deepSanitize(obj, parentKey = '') {
  if (typeof obj === 'string') {
    return HTML_FIELDS.has(parentKey) ? obj : sanitizeInput(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepSanitize(item, parentKey));
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepSanitize(value, key);
    }
    return result;
  }
  return obj;
}

// Fastify hook — sanitize request body on all POST/PUT/PATCH requests
export async function sanitizeHook(request, reply) {
  if (request.body && typeof request.body === 'object') {
    request.body = deepSanitize(request.body);
  }
}

// CSRF protection — validate Origin/Referer header on state-changing requests
export async function csrfHook(request, reply) {
  const method = request.method;
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;

  // Skip CSRF for login/register (called from external forms) and API-key auth
  const skipPaths = ['/api/auth/login', '/api/auth/register'];
  if (skipPaths.includes(request.url)) return;

  const origin = request.headers.origin || request.headers.referer;
  if (!origin) {
    // Allow requests without Origin (e.g., curl, mobile apps) —
    // but for browser requests this is suspicious
    return;
  }

  try {
    const originUrl = new URL(origin);
    const host = request.headers.host;
    if (host && !host.includes(originUrl.hostname)) {
      return reply.code(403).send({ error: 'CSRF validation failed: origin mismatch' });
    }
  } catch {
    // Invalid origin URL — block
    return reply.code(403).send({ error: 'CSRF validation failed: invalid origin' });
  }
}
