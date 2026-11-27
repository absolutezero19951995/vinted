import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { vinted, type SearchFilters, type SortId, type VintedItem } from '../controller/index.js';
import { conditionRank } from '../controller/sort.js';
import { db, schema } from '../db/client.js';

const { listings, savedSearches, searchListings, searchRuns } = schema;

/** Сохраняет/обновляет объявления, возвращает id в нашей БД по ключу domain:vintedId. */
export async function upsertListings(items: VintedItem[]) {
  const ids = new Map<string, number>();
  if (!items.length) return ids;
  const rows = items.map((i) => ({
    vintedId: i.id,
    domain: i.domain,
    title: i.title,
    brand: i.brand,
    size: i.size,
    status: i.status,
    price: i.price,
    totalPrice: i.totalPrice,
    currency: i.currency,
    url: i.url,
    photoUrl: i.photoUrl,
    sellerId: i.sellerId,
    sellerLogin: i.sellerLogin,
    favouriteCount: i.favouriteCount,
    viewCount: i.viewCount,
    conditionRank: conditionRank(i.status),
    postedAt: i.createdAt,
    raw: i.raw,
  }));
  const ex = (c: string) => sql.raw(`excluded.${c}`);
  const res = await db
    .insert(listings)
    .values(rows)
    .onConflictDoUpdate({
      target: [listings.domain, listings.vintedId],
      set: {
        title: ex('title'),
        price: ex('price'),
        totalPrice: ex('total_price'),
        favouriteCount: ex('favourite_count'),
        viewCount: ex('view_count'),
        status: ex('status'),
        photoUrl: ex('photo_url'),
        raw: ex('raw'),
        lastSeenAt: sql`now()`,
      },
    })
    .returning({ id: listings.id, domain: listings.domain, vintedId: listings.vintedId });
  for (const r of res) ids.set(`${r.domain}:${r.vintedId}`, r.id);
  return ids;
}

export interface RunResult {
  runId: number;
  items: VintedItem[];
  newCount: number;
  errors: { domain: string; message: string }[];
  hasMore: boolean;
}

/**
 * Запускает поиск: ходит в Vinted, пишет объявления в БД,
 * привязывает их к сохранённому поиску (если он есть) и пишет историю.
 */
export async function runSearch(opts: {
  userId: number;
  filters: SearchFilters;
  trigger: 'manual' | 'schedule';
  searchId?: number;
  page?: number;
  pages?: number;
}): Promise<RunResult> {
  const [run] = await db
    .insert(searchRuns)
    .values({ userId: opts.userId, searchId: opts.searchId ?? null, trigger: opts.trigger, filters: opts.filters })
    .returning({ id: searchRuns.id });

  const startPage = opts.page ?? 1;
  const pages = Math.max(1, opts.pages ?? 1);
  let items: VintedItem[] = [];
  let errors: RunResult['errors'] = [];
  let hasMore = false;
  for (let p = startPage; p < startPage + pages; p++) {
    const r = await vinted.search(opts.filters, p);
    items = items.concat(r.items);
    errors = errors.concat(r.errors);
    hasMore = r.hasMore;
    if (!r.hasMore) break;
  }

  const idMap = await upsertListings(items);
  let newCount = 0;
  if (opts.searchId && idMap.size) {
    const inserted = await db
      .insert(searchListings)
      .values([...idMap.values()].map((listingId) => ({ searchId: opts.searchId!, listingId })))
      .onConflictDoNothing()
      .returning({ listingId: searchListings.listingId });
    newCount = inserted.length;
  }

  await db
    .update(searchRuns)
    .set({ finishedAt: new Date(), itemsFound: items.length, newItems: newCount, errors: errors.length ? errors : null })
    .where(eq(searchRuns.id, run.id));

  return { runId: run.id, items, newCount, errors, hasMore };
}

/** ORDER BY для сохранённых результатов — все 12 сортировок по всей базе. */
function orderBy(sort: SortId | undefined, foundAt: SQL.Aliased<Date> | SQL): SQL[] {
  const total = sql`coalesce(${listings.totalPrice}, ${listings.price})`;
  const posted = sql`coalesce(${listings.postedAt}, ${listings.firstSeenAt})`;
  switch (sort) {
    case 'price_low_to_high':
      return [asc(listings.price), desc(listings.id)];
    case 'price_high_to_low':
      return [desc(listings.price), desc(listings.id)];
    case 'total_low_to_high':
      return [asc(total), desc(listings.id)];
    case 'total_high_to_low':
      return [desc(total), desc(listings.id)];
    case 'oldest_first':
      return [asc(posted)];
    case 'favourites_desc':
      return [desc(listings.favouriteCount), desc(listings.id)];
    case 'views_desc':
      return [desc(listings.viewCount), desc(listings.id)];
    case 'condition_best':
      return [asc(listings.conditionRank), desc(posted)];
    case 'brand_az':
      return [sql`${listings.brand} asc nulls last`, desc(listings.id)];
    case 'found_recently':
    case 'relevance':
      return [sql`${foundAt} desc`, desc(listings.id)];
    case 'newest_first':
    default:
      return [desc(posted)];
  }
}

/** Найденные объявления пользователя (по одному поиску или по всем его поискам). */
export async function listUserListings(opts: {
  userId: number;
  searchId?: number;
  sort?: SortId;
  domains?: string[];
  onlyUnseen?: boolean;
  limit?: number;
  offset?: number;
}) {
  const conds: SQL[] = [eq(savedSearches.userId, opts.userId)];
  if (opts.searchId) conds.push(eq(searchListings.searchId, opts.searchId));
  if (opts.onlyUnseen) conds.push(eq(searchListings.unseen, true));

  // одно объявление может найтись несколькими поисками пользователя — схлопываем
  const agg = db
    .select({
      listingId: searchListings.listingId,
      foundAt: sql<Date>`max(${searchListings.foundAt})`.mapWith(searchListings.foundAt).as('found_at'),
      unseen: sql<boolean>`bool_or(${searchListings.unseen})`.as('unseen'),
    })
    .from(searchListings)
    .innerJoin(savedSearches, eq(savedSearches.id, searchListings.searchId))
    .where(and(...conds))
    .groupBy(searchListings.listingId)
    .as('agg');

  return db
    .select({ listing: listings, foundAt: agg.foundAt, unseen: agg.unseen })
    .from(agg)
    .innerJoin(listings, eq(listings.id, agg.listingId))
    .where(opts.domains?.length ? inArray(listings.domain, opts.domains) : undefined)
    .orderBy(...orderBy(opts.sort, sql`${agg.foundAt}`))
    .limit(Math.min(opts.limit ?? 96, 500))
    .offset(opts.offset ?? 0);
}

export async function markSeen(userId: number, searchId: number) {
  await db.execute(sql`
    update ${searchListings} set unseen = false
    where ${searchListings.searchId} = ${searchId}
      and exists (select 1 from ${savedSearches} s where s.id = ${searchId} and s.user_id = ${userId})`);
}
