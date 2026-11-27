import type { VintedItem } from './types.js';

function money(v: any): { amount: number; currency: string | null } | null {
  if (v == null) return null;
  if (typeof v === 'object') {
    const a = Number(v.amount);
    return Number.isFinite(a) ? { amount: a, currency: v.currency_code ?? null } : null;
  }
  const a = Number(v);
  return Number.isFinite(a) ? { amount: a, currency: null } : null;
}

/** Приводит элемент из /api/v2/catalog/items (или items/:id) к нашему виду. */
export function normalizeItem(raw: any, domain: string, host: string, defaultCurrency: string): VintedItem {
  const price = money(raw.price) ?? { amount: 0, currency: null };
  const total = money(raw.total_item_price);
  const ts = raw.photo?.high_resolution?.timestamp ?? raw.photos?.[0]?.high_resolution?.timestamp;
  const photoUrl = raw.photo?.url ?? raw.photos?.[0]?.url ?? null;
  const url = raw.url ? (String(raw.url).startsWith('http') ? raw.url : `https://${host}${raw.url}`) : `https://${host}/items/${raw.id}`;
  return {
    id: Number(raw.id),
    domain,
    title: raw.title ?? '',
    brand: raw.brand_title ?? raw.brand?.title ?? null,
    size: raw.size_title ?? raw.size ?? null,
    status: typeof raw.status === 'string' ? raw.status : (raw.status?.title ?? null),
    price: price.amount,
    currency: price.currency ?? raw.currency ?? defaultCurrency,
    totalPrice: total?.amount ?? null,
    url,
    photoUrl,
    sellerId: raw.user?.id ?? raw.user_id ?? null,
    sellerLogin: raw.user?.login ?? null,
    favouriteCount: Number(raw.favourite_count ?? 0),
    viewCount: Number(raw.view_count ?? 0),
    createdAt: ts ? new Date(Number(ts) * 1000) : raw.created_at_ts ? new Date(raw.created_at_ts) : null,
    raw,
  };
}
