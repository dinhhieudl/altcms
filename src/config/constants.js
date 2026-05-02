export const ROLES = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  AUTHOR: 'author',
  CUSTOMER: 'customer',
};

export const PERMISSIONS = {
  [ROLES.ADMIN]: ['*'], // all permissions
  [ROLES.EDITOR]: [
    'products:read', 'products:write', 'products:delete',
    'posts:read', 'posts:write', 'posts:delete',
    'pages:read', 'pages:write', 'pages:delete',
    'orders:read', 'orders:update',
    'media:read', 'media:write', 'media:delete',
    'users:read',
    'taxonomies:read', 'taxonomies:write',
    'settings:read',
    'migrate:read',
  ],
  [ROLES.AUTHOR]: [
    'posts:read', 'posts:write:own',
    'media:read', 'media:write',
  ],
  [ROLES.CUSTOMER]: [
    'cart:read', 'cart:write',
    'orders:read:own',
    'profile:read', 'profile:write',
  ],
};

export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  FAILED: 'failed',
};

export const PRODUCT_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
};

export const PRODUCT_TYPE = {
  SIMPLE: 'simple',
  VARIABLE: 'variable',
  GROUPED: 'grouped',
  DIGITAL: 'digital',
};

export const CONTENT_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
  SCHEDULED: 'scheduled',
};

export const TAXONOMY_TYPES = {
  PRODUCT_CAT: 'product_cat',
  POST_CAT: 'post_cat',
  PRODUCT_TAG: 'product_tag',
  POST_TAG: 'post_tag',
};
