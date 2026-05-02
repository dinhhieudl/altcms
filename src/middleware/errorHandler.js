export function errorHandler(error, request, reply) {
  console.error(`[Error] ${request.method} ${request.url}:`, error);

  if (error.validation) {
    return reply.code(400).send({
      error: 'Validation error',
      details: error.validation,
    });
  }

  if (error.statusCode === 429) {
    return reply.code(429).send({ error: 'Too many requests' });
  }

  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : error.message;

  const response = { error: message };

  // Only expose stack trace in development, and only on localhost
  if (process.env.NODE_ENV === 'development' && ['127.0.0.1', '::1', 'localhost'].includes(request.hostname)) {
    response.stack = error.stack;
  }

  reply.code(statusCode).send(response);
}
