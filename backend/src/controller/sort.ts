import type { SortId } from './dictionaries.js';
import type { VintedItem } from './types.js';

// Vinted отдаёт состояние текстом на языке домена — сопоставляем грубо по ключевым словам.
const CONDITION_RANK: [RegExp, number][] = [
  [/tag|étiquette|etikett|etiqueta|cartellino|metk|label/i, 0],
  [/new|neuf|neu|nuevo|nuovo|nowy|nieuw|novo/i, 1],
  [/very good|très bon|sehr gut|muy bueno|ottimo|bardzo dobry|zeer goed/i, 2],
  [/good|bon|gut|bueno|buono|dobry|goed|bom/i, 3],
  [/satisf|befriedigend|aceptable|discreto|zadowal|redelijk/i, 4],
];
export function conditionRank(s: string | null): number {
  if (!s) return 9;
  for (const [re, r] of CONDITION_RANK) if (re.test(s)) return r;
  return 9;
}

/** Досортировка загруженной пачки для сортировок, которых нет у Vinted. */
export function sortItems(items: VintedItem[], sort: SortId | undefined): VintedItem[] {
  const a = [...items];
  const t = (i: VintedItem) => i.createdAt?.getTime() ?? 0;
  const total = (i: VintedItem) => i.totalPrice ?? i.price;
  switch (sort) {
    case 'price_low_to_high':
      return a.sort((x, y) => x.price - y.price);
    case 'price_high_to_low':
      return a.sort((x, y) => y.price - x.price);
    case 'total_low_to_high':
      return a.sort((x, y) => total(x) - total(y));
    case 'total_high_to_low':
      return a.sort((x, y) => total(y) - total(x));
    case 'oldest_first':
      return a.sort((x, y) => t(x) - t(y));
    case 'favourites_desc':
      return a.sort((x, y) => y.favouriteCount - x.favouriteCount);
    case 'views_desc':
      return a.sort((x, y) => y.viewCount - x.viewCount);
    case 'condition_best':
      return a.sort((x, y) => conditionRank(x.status) - conditionRank(y.status));
    case 'brand_az':
      return a.sort((x, y) => (x.brand ?? '￿').localeCompare(y.brand ?? '￿'));
    case 'newest_first':
    case 'found_recently':
      return a.sort((x, y) => t(y) - t(x));
    default:
      return a; // relevance — как отдал Vinted
  }
}
