import type { SortId } from './dictionaries.js';

/** Фильтры поиска — то, что хранится в saved_searches.filters (jsonb). */
export interface SearchFilters {
  text?: string;
  categoryIds?: number[];
  brandIds?: number[];
  sizeIds?: number[];
  statusIds?: number[];
  colorIds?: number[];
  priceFrom?: number;
  priceTo?: number;
  sort?: SortId;
  /** Коды доменов (fr, de, pl...). Пусто = все. */
  domains?: string[];
  /** Только для UI (названия брендов по id), контроллер игнорирует */
  labels?: Record<string, string>;
}

/** Нормализованное объявление — одинаковое для всех доменов. */
export interface VintedItem {
  id: number;
  domain: string;
  title: string;
  brand: string | null;
  size: string | null;
  status: string | null;
  price: number;
  currency: string;
  totalPrice: number | null;
  url: string;
  photoUrl: string | null;
  sellerId: number | null;
  sellerLogin: string | null;
  favouriteCount: number;
  viewCount: number;
  /** Время публикации, если удалось вытащить (из таймстемпа фото). */
  createdAt: Date | null;
  raw: unknown;
}

export interface SearchPageResult {
  items: VintedItem[];
  errors: { domain: string; message: string }[];
  /** Есть ли ещё страницы хоть на одном домене */
  hasMore: boolean;
}
