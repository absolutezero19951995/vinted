import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { and, desc, eq } from 'drizzle-orm';
import { ZodError } from 'zod';
import { vinted, VintedHttpError, type SearchFilters, type SortId } from '../controller/index.js';
import { db, schema } from '../db/client.js';
import { pollNow } from '../scheduler/index.js';
import { AuthError, createSession, destroySession, login, register, userBySession } from '../services/auth.js';
import { listUserListings, markSeen, runSearch } from '../services/searches.js';
import { credentialsSchema, filtersSchema, savedSearchSchema } from './schemas.js';

const { savedSearches, searchRuns } = schema;
const COOKIE = 'vsid';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: number; username: string } | null;
  }
}

export async function buildServer() {
  const app = Fastify({ logger: { level: 'info' } });
  await app.register(cookie);

  app.decorateRequest('user', null);
  app.addHook('preHandler', async (req) => {
    req.user = await userBySession(req.cookies[COOKIE]);
  });

  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: 'Нужно войти' });
  };

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'Неверные данные', issues: err.issues });
    if (err instanceof AuthError) return reply.code(err.status).send({ error: err.message });
    if (err instanceof VintedHttpError) return reply.code(502).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: err instanceof Error ? err.message : 'Ошибка сервера' });
  });

  const setSession = async (reply: FastifyReply, userId: number) => {
    const s = await createSession(userId);
    reply.setCookie(COOKIE, s.token, { path: '/', httpOnly: true, sameSite: 'lax', expires: s.expiresAt });
  };

  // ---------- auth ----------
  app.post('/api/auth/register', async (req, reply) => {
    const { username, password } = credentialsSchema.parse(req.body);
    const u = await register(username, password);
    await setSession(reply, u.id);
    return { user: u };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const { username, password } = credentialsSchema.parse(req.body);
    const u = await login(username, password);
    await setSession(reply, u.id);
    return { user: u };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const t = req.cookies[COOKIE];
    if (t) await destroySession(t);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => ({ user: req.user }));

  // ---------- справочники ----------
  app.get('/api/dict/domains', async () => vinted.domains());
  app.get('/api/dict/sorts', async () => vinted.sortOptions());
  app.get('/api/dict/statuses', async () => vinted.statuses());
  app.get('/api/dict/colors', { preHandler: requireUser }, async () => vinted.colors());
  app.get('/api/dict/categories', { preHandler: requireUser }, async () => vinted.categories());
  app.get<{ Querystring: { q?: string } }>('/api/dict/brands', { preHandler: requireUser }, async (req) =>
    vinted.brands(req.query.q ?? ''),
  );
  app.get<{ Querystring: { categoryId?: string } }>('/api/dict/sizes', { preHandler: requireUser }, async (req) => {
    const id = Number(req.query.categoryId);
    return Number.isFinite(id) && id > 0 ? vinted.sizes(id) : [];
  });

  // ---------- живой поиск ----------
  app.post<{ Body: { filters: unknown; page?: number } }>('/api/search', { preHandler: requireUser }, async (req) => {
    const filters = filtersSchema.parse(req.body?.filters ?? {}) as SearchFilters;
    const page = Math.max(1, Number(req.body?.page ?? 1));
    const r = await runSearch({ userId: req.user!.id, filters, trigger: 'manual', page });
    return { items: r.items.map(({ raw: _raw, ...i }) => i), errors: r.errors, hasMore: r.hasMore, page };
  });

  app.get<{ Params: { domain: string; id: string } }>('/api/items/:domain/:id', { preHandler: requireUser }, async (req) => {
    const { raw: _raw, ...item } = await vinted.getItem(req.params.domain, Number(req.params.id));
    return item;
  });

  // ---------- сохранённые поиски ----------
  app.get('/api/searches', { preHandler: requireUser }, async (req) =>
    db.select().from(savedSearches).where(eq(savedSearches.userId, req.user!.id)).orderBy(desc(savedSearches.createdAt)),
  );

  app.post('/api/searches', { preHandler: requireUser }, async (req) => {
    const body = savedSearchSchema.parse(req.body);
    const [row] = await db
      .insert(savedSearches)
      .values({ ...body, filters: body.filters as SearchFilters, userId: req.user!.id })
      .returning();
    return row;
  });

  const own = (req: FastifyRequest<{ Params: { id: string } }>) =>
    and(eq(savedSearches.id, Number(req.params.id)), eq(savedSearches.userId, req.user!.id));

  app.put<{ Params: { id: string } }>('/api/searches/:id', { preHandler: requireUser }, async (req, reply) => {
    const body = savedSearchSchema.partial().parse(req.body);
    const [row] = await db
      .update(savedSearches)
      .set({ ...body, filters: body.filters as SearchFilters | undefined, updatedAt: new Date() })
      .where(own(req))
      .returning();
    return row ?? reply.code(404).send({ error: 'Не найдено' });
  });

  app.delete<{ Params: { id: string } }>('/api/searches/:id', { preHandler: requireUser }, async (req) => {
    await db.delete(savedSearches).where(own(req));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/searches/:id/poll', { preHandler: requireUser }, async (req) => {
    await pollNow(req.user!.id, Number(req.params.id));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/searches/:id/seen', { preHandler: requireUser }, async (req) => {
    await markSeen(req.user!.id, Number(req.params.id));
    return { ok: true };
  });

  // ---------- найденные объявления ----------
  app.get<{
    Querystring: { searchId?: string; sort?: SortId; domains?: string; unseen?: string; limit?: string; offset?: string };
  }>('/api/listings', { preHandler: requireUser }, async (req) => {
    const q = req.query;
    const rows = await listUserListings({
      userId: req.user!.id,
      searchId: q.searchId ? Number(q.searchId) : undefined,
      sort: q.sort,
      domains: q.domains ? q.domains.split(',').filter(Boolean) : undefined,
      onlyUnseen: q.unseen === 'true',
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
    return rows.map(({ listing: { raw: _raw, ...l }, foundAt, unseen }) => ({ ...l, foundAt, unseen }));
  });

  // ---------- история ----------
  app.get('/api/history', { preHandler: requireUser }, async (req) =>
    db.select().from(searchRuns).where(eq(searchRuns.userId, req.user!.id)).orderBy(desc(searchRuns.startedAt)).limit(100),
  );

  app.get('/api/health', async () => ({ ok: true }));

  return app;
}
