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

  reply.code(statusCode).send({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
}
