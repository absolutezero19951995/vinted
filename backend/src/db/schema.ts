import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  time,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { SearchFilters } from '../controller/types.js';

const ts = (name: string) => timestamp(name, { withTimezone: true });

// ---------- пользователи ----------

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
});

// ---------- сохранённые поиски ----------

export const savedSearches = pgTable(
  'saved_searches',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    filters: jsonb('filters').$type<SearchFilters>().notNull(),
    /** Как часто опрашивать, минут. По умолчанию раз в час. */
    pollIntervalMinutes: integer('poll_interval_minutes').notNull().default(60),
    /** Сколько страниц тянуть за один опрос (по 96 штук) */
    pagesPerPoll: integer('pages_per_poll').notNull().default(1),
    enabled: boolean('enabled').notNull().default(true),
    /** Задел под бота: слать ли уведомления о новых объявлениях */
    notify: boolean('notify').notNull().default(false),
    lastPolledAt: ts('last_polled_at'),
    nextPollAt: ts('next_poll_at').notNull().defaultNow(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('saved_searches_due_idx').on(t.enabled, t.nextPollAt), index('saved_searches_user_idx').on(t.userId)],
);

// ---------- объявления ----------

/** Объявления глобальные (одно объявление может найтись у разных пользователей). */
export const listings = pgTable(
  'listings',
  {
    id: serial('id').primaryKey(),
    vintedId: bigint('vinted_id', { mode: 'number' }).notNull(),
    domain: text('domain').notNull(),
    title: text('title').notNull(),
    brand: text('brand'),
    size: text('size'),
    status: text('status'),
    price: numeric('price', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    totalPrice: numeric('total_price', { precision: 12, scale: 2, mode: 'number' }),
    currency: text('currency').notNull(),
    url: text('url').notNull(),
    photoUrl: text('photo_url'),
    sellerId: bigint('seller_id', { mode: 'number' }),
    sellerLogin: text('seller_login'),
    favouriteCount: integer('favourite_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    conditionRank: integer('condition_rank').notNull().default(9),
    postedAt: ts('posted_at'),
    raw: jsonb('raw'),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('listings_domain_vinted_id_uq').on(t.domain, t.vintedId)],
);

/** Какие объявления нашёл какой сохранённый поиск (через него — какой пользователь). */
export const searchListings = pgTable(
  'search_listings',
  {
    searchId: integer('search_id').notNull().references(() => savedSearches.id, { onDelete: 'cascade' }),
    listingId: integer('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }),
    foundAt: ts('found_at').notNull().defaultNow(),
    /** Пользователь ещё не смотрел */
    unseen: boolean('unseen').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.searchId, t.listingId] }), index('search_listings_found_idx').on(t.searchId, t.foundAt)],
);

// ---------- история ----------

export const runTrigger = pgEnum('run_trigger', ['manual', 'schedule']);

/** История запусков поиска: и ручные поиски из UI, и опросы по расписанию. */
export const searchRuns = pgTable(
  'search_runs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    searchId: integer('search_id').references(() => savedSearches.id, { onDelete: 'set null' }),
    trigger: runTrigger('trigger').notNull(),
    filters: jsonb('filters').$type<SearchFilters>().notNull(),
    startedAt: ts('started_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
    itemsFound: integer('items_found').notNull().default(0),
    newItems: integer('new_items').notNull().default(0),
    errors: jsonb('errors').$type<{ domain: string; message: string }[]>(),
  },
  (t) => [index('search_runs_user_idx').on(t.userId, t.startedAt)],
);

// ---------- задел под бота (пока не используется кодом) ----------

/**
 * Правило автопокупки: «покупай Levi's дешевле 10 € ночью».
 * Привязано к сохранённому поиску + доп. условия.
 */
export const purchaseRules = pgTable('purchase_rules', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  searchId: integer('search_id').notNull().references(() => savedSearches.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  maxPrice: numeric('max_price', { precision: 12, scale: 2, mode: 'number' }),
  maxTotalPrice: numeric('max_total_price', { precision: 12, scale: 2, mode: 'number' }),
  /** Окно активности (например 23:00–08:00), в часовом поясе пользователя */
  activeFrom: time('active_from'),
  activeTo: time('active_to'),
  timezone: text('timezone').notNull().default('Europe/Berlin'),
  maxPurchasesPerDay: integer('max_purchases_per_day').notNull().default(5),
  maxSpendPerDay: numeric('max_spend_per_day', { precision: 12, scale: 2, mode: 'number' }),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const purchaseStatus = pgEnum('purchase_status', [
  'pending', // бот решил купить
  'ordered', // заказ отправлен на Vinted
  'completed', // сделка завершена
  'cancel_requested', // пользователь утром нажал «отменить»
  'cancelled',
  'failed',
]);

export const purchases = pgTable('purchases', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ruleId: integer('rule_id').references(() => purchaseRules.id, { onDelete: 'set null' }),
  listingId: integer('listing_id').notNull().references(() => listings.id),
  status: purchaseStatus('status').notNull().default('pending'),
  vintedTransactionId: bigint('vinted_transaction_id', { mode: 'number' }),
  pricePaid: numeric('price_paid', { precision: 12, scale: 2, mode: 'number' }),
  currency: text('currency'),
  error: text('error'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  listingId: integer('listing_id').references(() => listings.id, { onDelete: 'cascade' }),
  purchaseId: integer('purchase_id').references(() => purchases.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull().default('web'), // web | telegram | ...
  payload: jsonb('payload'),
  sentAt: ts('sent_at'),
  readAt: ts('read_at'),
  createdAt: ts('created_at').notNull().default(sql`now()`),
});
