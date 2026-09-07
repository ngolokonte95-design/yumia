/**
 * Client des endpoints boutique (`/shop/*`).
 * Tous les montants sont en centimes — voir `formatPrice` pour l'affichage.
 */
import { request } from './api';

export interface ShopCategory {
  id: string;
  slug: string;
  nameFr: string;
  emoji: string;
  universe: string | null;
  parentId: string | null;
  productsCount: number;
}

export interface ProductListItem {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  compareAtCents: number | null;
  currency: string;
  images: string[];
  rating: number | null;
  reviewsCount: number;
  salesCount: number;
  deliveryDays: number | null;
  featured: boolean;
  category: { slug: string; nameFr: string; emoji: string };
}

export interface ProductVariant {
  id: string;
  label: string;
  optionName: string | null;
  priceCents: number | null;
  stock: number;
  imageUrl: string | null;
}

export interface ProductReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  user: { id: string; displayName: string; photoUrl: string | null };
}

export interface ProductDetail extends ProductListItem {
  description: string | null;
  brand: string | null;
  videoUrl: string | null;
  specifications: Array<{ name: string; value: string }>;
  variants: ProductVariant[];
  reviews: ProductReview[];
  related: ProductListItem[];
  isWishlisted: boolean;
}

export interface CartLine {
  id: string;
  productId: string;
  variantId: string | null;
  variantLabel: string | null;
  title: string;
  slug: string;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  available: boolean;
}

export interface CartSummary {
  lines: CartLine[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  itemsCount: number;
}

export interface ShippingAddress {
  id: string;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  postalCode: string;
  countryCode: string;
  phone: string;
  isDefault: boolean;
}

export interface OrderItem {
  id: string;
  titleSnapshot: string;
  imageSnapshot: string | null;
  variantLabel: string | null;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: string;
  reference: string;
  status: 'pending' | 'paid' | 'fulfilling' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  createdAt: string;
  items: OrderItem[];
}

export interface ProductQuery {
  /** Signature d'index : les filtres sont sérialisés tels quels par `qs()`. */
  [key: string]: string | number | boolean | undefined;
  category?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  maxDeliveryDays?: number;
  featured?: boolean;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'bestsellers';
  page?: number;
  pageSize?: number;
}

/** Centimes → "12,90 €". */
export function formatPrice(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const shopApi = {
  categories: (token: string) => request<ShopCategory[]>('/shop/categories', { token }),

  products: (token: string, query: ProductQuery = {}) =>
    request<{ items: ProductListItem[]; total: number; page: number; pageSize: number; hasMore: boolean }>(
      `/shop/products${qs(query)}`,
      { token },
    ),

  product: (token: string, slug: string) =>
    request<ProductDetail>(`/shop/products/${encodeURIComponent(slug)}`, { token }),

  categoryForUniverse: (token: string, universe: string) =>
    request<ShopCategory | null>(`/shop/categories/by-universe/${encodeURIComponent(universe)}`, { token }),

  // Wishlist
  wishlist: (token: string) => request<ProductListItem[]>('/shop/wishlist', { token }),
  toggleWishlist: (token: string, productId: string) =>
    request<{ wishlisted: boolean }>(`/shop/wishlist/${productId}`, { token, method: 'POST' }),

  review: (token: string, productId: string, rating: number, comment?: string) =>
    request<{ rating: number }>(`/shop/products/${productId}/reviews`, {
      token, method: 'POST', body: { rating, comment },
    }),

  // Panier
  cart: (token: string) => request<CartSummary>('/shop/cart', { token }),
  addToCart: (token: string, productId: string, variantId?: string, quantity = 1) =>
    request<CartSummary>('/shop/cart/items', { token, method: 'POST', body: { productId, variantId, quantity } }),
  updateCartItem: (token: string, itemId: string, quantity: number) =>
    request<CartSummary>(`/shop/cart/items/${itemId}`, { token, method: 'PATCH', body: { quantity } }),
  removeCartItem: (token: string, itemId: string) =>
    request<CartSummary>(`/shop/cart/items/${itemId}`, { token, method: 'DELETE' }),

  // Adresses
  addresses: (token: string) => request<ShippingAddress[]>('/shop/addresses', { token }),
  createAddress: (token: string, body: Omit<ShippingAddress, 'id'>) =>
    request<ShippingAddress>('/shop/addresses', { token, method: 'POST', body }),
  deleteAddress: (token: string, id: string) =>
    request<{ ok: boolean }>(`/shop/addresses/${id}`, { token, method: 'DELETE' }),

  // Commandes
  checkout: (token: string, addressId: string) =>
    request<{ orderId: string; reference: string; totalCents: number; currency: string; checkoutUrl: string | null }>(
      '/shop/checkout', { token, method: 'POST', body: { addressId } },
    ),
  orders: (token: string) => request<Order[]>('/shop/orders', { token }),
  order: (token: string, id: string) => request<Order>(`/shop/orders/${id}`, { token }),
};
