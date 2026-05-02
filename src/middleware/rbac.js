import { PERMISSIONS, ROLES } from '../config/constants.js';

export function requireRole(...roles) {
  return async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    if (!roles.includes(request.user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
}

export function requirePermission(...permissions) {
  return async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const userPerms = PERMISSIONS[request.user.role] || [];
    if (userPerms.includes('*')) return; // admin

    const hasAll = permissions.every(p => userPerms.includes(p));
    if (!hasAll) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
}
