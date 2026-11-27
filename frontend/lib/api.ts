export type SortId =
  | 'relevance' | 'newest_first' | 'price_low_to_high' | 'price_high_to_low'
  | 'total_low_to_high' | 'total_high_to_low' | 'oldest_first' | 'favourites_desc'
  | 'views_desc' | 'condition_best' | 'brand_az' | 'found_recently';

export interface Filters {
  text?: string;
  categoryIds?: number[];
  brandIds?: number[];
  sizeIds?: number[];
  statusIds?: number[];
  colorIds?: number[];
  priceFrom?: number;
  priceTo?: number;
  sort?: SortId;
  domains?: string[];
  labels?: Record<string, string>;
}

export interface Item {
  id: number;
  vintedId?: number;
  domain: string;
  title: string;
  brand: string | null;
  size: string | null;
  status: string | null;
  price: number;
  totalPrice: number | null;
  currency: string;
  url: string;
  photoUrl: string | null;
  favouriteCount: number;
  viewCount: number;
  foundAt?: string;
  unseen?: boolean;
}

export interface SavedSearch {
  id: number;
  name: string;
  filters: Filters;
  pollIntervalMinutes: number;
  enabled: boolean;
  lastPolledAt: string | null;
  nextPollAt: string;
}

export interface Domain { code: string; host: string; country: string; currency: string }
export interface Option { id: number; title: string; hex?: string; group?: string }
export interface Category { id: number; title: string; children: Category[] }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api${path}`, {
    ...rest,
    credentials: 'same-origin',
    headers: json !== undefined ? { 'content-type': 'application/json', ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** Ключи фильтров, где пустой массив/строка = «не задано». Чистим перед отправкой. */
export function cleanFilters(f: Filters): Filters {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length) || Number.isNaN(v)) continue;
    out[k] = v;
  }
  return out as Filters;
}
