/**
 * Administration des commandes de la boutique.
 *
 * Rappel : une commande transmise à AliExpress y reste « à payer » tant que
 * l'admin ne l'a pas réglée à la main dans son compte AliExpress — aucune
 * API ne le fait. L'écran de détail montre donc l'état EN DIRECT chez
 * AliExpress et le lien pour payer.
 */
import { API_BASE_URL } from './config';

export type AdminOrdersTab = 'in_progress' | 'to_transmit' | 'shipped' | 'delivered' | 'all';
export type OrderStage = 'awaiting_payment' | 'cancelled' | 'preparing' | 'shipped' | 'delivered' | 'unknown';

export interface AdminOrderRow {
  reference: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  itemCount: number;
  customer: string | null;
  transmitted: boolean;
  trackingNumber: string | null;
}

export interface AdminOrderDetail {
  reference: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  customer: { name: string; email: string } | null;
  address: Record<string, string>;
  trackingNumber: string | null;
  trackingUrl: string | null;
  items: Array<{
    title: string;
    image: string | null;
    variant: string | null;
    quantity: number;
    unitPriceCents: number;
    aliexpressProductId: string | null;
  }>;
  aliexpress: Array<{
    id: string;
    url: string;
    stage: OrderStage;
    status: string | null;
    endReason: string | null;
    amount: string | null;
    trackingNumber: string | null;
    carrier: string | null;
  }>;
}

export const TAB_LABEL: Record<AdminOrdersTab, string> = {
  in_progress: 'En cours',
  to_transmit: 'À transmettre',
  shipped: 'Expédiées',
  delivered: 'Livrées',
  all: 'Toutes',
};

/** Statut YUMIA, tel que l'admin a besoin de le lire. */
export const STATUS_LABEL: Record<string, string> = {
  paid: 'Payée · à transmettre',
  fulfilling: 'Transmise · à payer ou en préparation',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
  pending: 'Paiement en attente',
};

/** État chez AliExpress. */
export const STAGE_LABEL: Record<OrderStage, string> = {
  awaiting_payment: '💳 À payer sur AliExpress',
  cancelled: '⚠️ Annulée chez AliExpress',
  preparing: '📦 Payée · le vendeur prépare',
  shipped: '🚚 Expédiée',
  delivered: '✅ Livrée',
  unknown: '❔ État inconnu',
};

export function euros(cents: number, currency = 'EUR'): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} ${currency === 'EUR' ? '€' : currency}`;
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[]; error?: { message?: string } | string };
      const m = Array.isArray(body.message) ? body.message[0] : body.message;
      if (typeof m === 'string') message = m;
      else if (typeof body.error === 'string') message = body.error;
      else if (body.error?.message) message = body.error.message;
    } catch {
      // corps non JSON
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const adminOrdersApi = {
  list: (token: string, tab: AdminOrdersTab) =>
    call<{ counts: Record<Exclude<AdminOrdersTab, 'all'>, number>; orders: AdminOrderRow[] }>(
      token, `/shop/admin/orders?tab=${tab}`,
    ),
  detail: (token: string, reference: string) =>
    call<AdminOrderDetail>(token, `/shop/admin/orders/${encodeURIComponent(reference)}`),
  sync: (token: string, reference: string) =>
    call<{ stage: OrderStage }>(token, `/shop/admin/orders/${encodeURIComponent(reference)}/sync`, { method: 'POST' }),
  retransmit: (token: string, reference: string) =>
    call<{ status: string; aliexpressOrderId: string | null }>(
      token, `/shop/admin/orders/${encodeURIComponent(reference)}/retransmit`, { method: 'POST' },
    ),
};
