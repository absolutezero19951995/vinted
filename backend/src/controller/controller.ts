import { COLORS, ROOT_CATEGORIES, SORT_OPTIONS, STATUSES, nativeOrder } from './dictionaries.js';
import { VINTED_DOMAINS, getDomain } from './domains.js';
import { VintedHttp, VintedHttpError } from './http.js';
import { normalizeItem } from './normalize.js';
import { sortItems } from './sort.js';
import type { SearchFilters, SearchPageResult, VintedItem } from './types.js';

const ids = (a?: number[]) => (a && a.length ? a.join(',') : undefined);

/** Простой in-memory кеш для справочников (не Redis — просто чтобы не дёргать Vinted на каждый клик). */
class TtlCache {
  private m = new Map<string, { at: number; v: unknown }>();
  constructor(private ttlMs: number) {}
  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.m.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.v as T;
    const v = await load();
    this.m.set(key, { at: Date.now(), v });
    return v;
  }
}

export interface CategoryNode {
  id: number;
  title: string;
  children: CategoryNode[];
}

/**
 * Контроллер над внутренним (неофициальным) API Vinted.
 * Все методы принимают код домена (fr, de, pl…) или список доменов.
 */
export class VintedController {
  private dictCache = new TtlCache(12 * 60 * 60_000);

  constructor(public readonly http = new VintedHttp()) {}

  // ---------- поиск ----------

  /** Строит query-параметры для /api/v2/catalog/items. */
  static catalogParams(f: SearchFilters, page: number, perPage: number) {
    return {
      page,
      per_page: perPage,
      search_text: f.text?.trim() || undefined,
      catalog_ids: ids(f.categoryIds),
      brand_ids: ids(f.brandIds),
      size_ids: ids(f.sizeIds),
      status_ids: ids(f.statusIds),
      color_ids: ids(f.colorIds),
      price_from: f.priceFrom,
      price_to: f.priceTo,
      order: nativeOrder(f.sort),
    };
  }

  /** Одна страница каталога на одном домене. */
  async searchDomain(domain: string, f: SearchFilters, page = 1, perPage = 96) {
    const d = getDomain(domain);
    const params = VintedController.catalogParams(f, page, perPage);
    const data = await this.http.getJson<any>(domain, '/api/v2/catalog/items', {
      ...params,
      currency: f.priceFrom !== undefined || f.priceTo !== undefined ? d.currency : undefined,
    });
    const items: VintedItem[] = (data.items ?? []).map((r: any) => normalizeItem(r, domain, d.host, d.currency));
    const pag = data.pagination;
    const hasMore = pag ? pag.current_page < pag.total_pages : items.length >= perPage;
    return { items, hasMore };
  }

  /**
   * Поиск по нескольким доменам сразу. Ошибка одного домена не валит весь поиск.
   * Результат досортирован по выбранной сортировке.
   */
  async search(f: SearchFilters, page = 1, perPage = 96): Promise<SearchPageResult> {
    const domains = f.domains?.length ? f.domains : VINTED_DOMAINS.map((d) => d.code);
    const errors: SearchPageResult['errors'] = [];
    let items: VintedItem[] = [];
    let hasMore = false;
    // последовательно — запросы всё равно идут через троттлинг, а так меньше шансов словить 429
    for (const domain of domains) {
      try {
        const r = await this.searchDomain(domain, f, page, perPage);
        items = items.concat(r.items);
        hasMore ||= r.hasMore;
      } catch (e) {
        errors.push({ domain, message: e instanceof Error ? e.message : String(e) });
      }
    }
    // одно объявление может светиться на нескольких доменах — оставляем первое
    const seen = new Set<number>();
    items = items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
    return { items: sortItems(items, f.sort), errors, hasMore };
  }

  // ---------- объявление ----------

  /** Детали объявления. У Vinted менялся путь — пробуем оба. */
  async getItem(domain: string, id: number): Promise<VintedItem & { description?: string }> {
    const d = getDomain(domain);
    const raw = await this.firstOk(domain, [`/api/v2/items/${id}/details`, `/api/v2/items/${id}`]);
    const item = raw.item ?? raw;
    return { ...normalizeItem(item, domain, d.host, d.currency), description: item.description };
  }

  async getUser(domain: string, userId: number) {
    const raw = await this.http.getJson<any>(domain, `/api/v2/users/${userId}`);
    return raw.user ?? raw;
  }

  async getUserItems(domain: string, userId: number, page = 1, perPage = 96) {
    const d = getDomain(domain);
    const raw = await this.http.getJson<any>(domain, `/api/v2/wardrobe/${userId}/items`, { page, per_page: perPage, order: 'relevance' });
    return (raw.items ?? []).map((r: any) => normalizeItem(r, domain, d.host, d.currency));
  }

  // ---------- справочники ----------

  domains() {
    return VINTED_DOMAINS;
  }

  sortOptions() {
    return SORT_OPTIONS.map(({ id, title }) => ({ id, title }));
  }

  statuses() {
    return STATUSES;
  }

  async colors(domain = 'fr') {
    return this.dictCache.get(`colors:${domain}`, async () => {
      try {
        const raw = await this.http.getJson<any>(domain, '/api/v2/colors');
        const list = (raw.colors ?? []).map((c: any) => ({ id: c.id, title: c.title, hex: c.hex ?? '' }));
        return list.length ? list : COLORS;
      } catch {
        return COLORS;
      }
    });
  }

  /** Дерево категорий. */
  async categories(domain = 'fr'): Promise<CategoryNode[]> {
    return this.dictCache.get(`cats:${domain}`, async () => {
      try {
        const raw = await this.firstOk(domain, ['/api/v2/catalogs', '/api/v2/catalog/initializers']);
        const roots = raw.catalogs ?? raw.dtos?.catalogs ?? [];
        const map = (c: any): CategoryNode => ({ id: c.id, title: c.title, children: (c.catalogs ?? []).map(map) });
        const tree = roots.map(map);
        return tree.length ? tree : ROOT_CATEGORIES;
      } catch {
        return ROOT_CATEGORIES;
      }
    });
  }

  /** Поиск брендов по названию. */
  async brands(keyword: string, domain = 'fr'): Promise<{ id: number; title: string }[]> {
    const kw = keyword.trim();
    if (!kw) return [];
    return this.dictCache.get(`brands:${domain}:${kw.toLowerCase()}`, async () => {
      try {
        const raw = await this.http.getJson<any>(domain, '/api/v2/brands', { keyword: kw });
        return (raw.brands ?? []).map((b: any) => ({ id: b.id, title: b.title }));
      } catch {
        const raw = await this.http.getJson<any>(domain, '/api/v2/catalog/filters/search', {
          filter_code: 'brand',
          filter_search_text: kw,
        });
        return (raw.options ?? []).map((b: any) => ({ id: Number(b.id), title: b.title }));
      }
    });
  }

  /** Размеры для категории (размерные сетки зависят от категории). */
  async sizes(categoryId: number, domain = 'fr'): Promise<{ id: number; title: string; group?: string }[]> {
    return this.dictCache.get(`sizes:${domain}:${categoryId}`, async () => {
      try {
        const raw = await this.http.getJson<any>(domain, '/api/v2/catalog/filters', { catalog_ids: categoryId });
        const f = (raw.filters ?? []).find((x: any) => x.code === 'size');
        const out: { id: number; title: string; group?: string }[] = [];
        const walk = (opts: any[], group?: string) => {
          for (const o of opts ?? []) {
            if (o.options?.length) walk(o.options, o.title);
            else out.push({ id: Number(o.id), title: o.title, group });
          }
        };
        walk(f?.options ?? []);
        if (out.length) return out;
        throw new Error('нет размеров в catalog/filters');
      } catch {
        const raw = await this.http.getJson<any>(domain, '/api/v2/size_groups', { catalog_ids: categoryId });
        return (raw.size_groups ?? []).flatMap((g: any) =>
          (g.sizes ?? []).map((s: any) => ({ id: s.id, title: s.title, group: g.title })),
        );
      }
    });
  }

  private async firstOk(domain: string, paths: string[]): Promise<any> {
    let last: unknown;
    for (const p of paths) {
      try {
        return await this.http.getJson<any>(domain, p);
      } catch (e) {
        last = e;
        if (!(e instanceof VintedHttpError)) throw e;
      }
    }
    throw last;
  }
}
