import { Cart } from '../../models/Cart.js';
import { Order } from '../../models/Order.js';

export default async function cartRoutes(fastify) {
  // Get cart
  fastify.get('/api/store/cart', async (request) => {
    const userId = request.user?.id;
    const sessionId = request.cookies?.cart_session;

    if (!userId && !sessionId) {
      return { items: [], total: 0 };
    }

    const cart = await Cart.get(userId, sessionId);

    // Calculate totals
    let total = 0;
    for (const item of cart.items) {
      if (item.product) {
        total += parseFloat(item.product.price) * item.quantity;
      }
    }

    return { ...cart, total };
  });

  // Add to cart
  fastify.post('/api/store/cart/add', async (request, reply) => {
    const { product_id, variant_id, quantity = 1 } = request.body;
    if (!product_id) return reply.code(400).send({ error: 'product_id required' });

    let userId = request.user?.id;
    let sessionId = request.cookies?.cart_session;

    if (!userId && !sessionId) {
      const { nanoid } = await import('nanoid');
      sessionId = nanoid(24);
      reply.setCookie('cart_session', sessionId, {
        path: '/', httpOnly: true, sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60,
      });
    }

    const cart = await Cart.addItem(userId, sessionId, product_id, variant_id, quantity);
    return { cart };
  });

  // Update cart item
  fastify.put('/api/store/cart/:itemId', async (request) => {
    const { quantity } = request.body;
    const userId = request.user?.id;
    const sessionId = request.cookies?.cart_session;

    const cart = await Cart.updateItem(userId, sessionId, request.params.itemId, quantity);
    return { cart };
  });

  // Remove from cart
  fastify.delete('/api/store/cart/:itemId', async (request) => {
    const userId = request.user?.id;
    const sessionId = request.cookies?.cart_session;
    const cart = await Cart.removeItem(userId, sessionId, request.params.itemId);
    return { cart };
  });

  // Checkout
  fastify.post('/api/store/checkout', async (request, reply) => {
    const { items, billing, shipping, payment_method, coupon_code, customer_note } = request.body;

    if (!items?.length) return reply.code(400).send({ error: 'Cart is empty' });
    if (!billing?.name || !billing?.email || !billing?.address) {
      return reply.code(400).send({ error: 'Billing info required' });
    }

    try {
      const order = await Order.create({
        user_id: request.user?.id,
        items,
        billing,
        shipping,
        payment_method: payment_method || 'cod',
        coupon_code,
        customer_note,
      });

      // Clear cart
      await Cart.clear(request.user?.id, request.cookies?.cart_session);

      return { order };
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });
}
