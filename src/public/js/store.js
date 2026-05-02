// Store frontend JS
document.addEventListener('DOMContentLoaded', () => {
  // Update cart count on load
  updateCartCount();

  // Mobile search toggle
  const searchBtn = document.querySelector('[data-toggle-search]');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      document.querySelector('.mobile-search')?.classList.toggle('hidden');
    });
  }
});

async function updateCartCount() {
  try {
    const res = await fetch('/api/store/cart');
    const data = await res.json();
    const count = data.items?.length || 0;
    const badge = document.getElementById('cart-count');
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle('hidden', count === 0);
    }
  } catch (e) { /* ignore */ }
}

// Quick add to cart (for product cards)
async function quickAddToCart(productId) {
  const res = await fetch('/api/store/cart/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId, quantity: 1 }),
  });
  if (res.ok) {
    updateCartCount();
    // Show toast
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in';
    toast.textContent = '✓ Đã thêm vào giỏ hàng';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }
}
