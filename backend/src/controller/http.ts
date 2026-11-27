import { request, type Dispatcher } from 'undici';
import { proxyPool, type PooledProxy } from '../proxy/index.js';
import { config } from '../config.js';
import { getDomain } from './domains.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export class VintedHttpError extends Error {
  constructor(
    public status: number,
    public domain: string,
    public path: string,
    body: string,
  ) {
    super(`Vinted ${domain} ${path} → HTTP ${status}: ${body.slice(0, 200)}`);
  }
}

interface Session {
  cookies: Map<string, string>;
  createdAt: number;
  proxy: PooledProxy | null;
}

/** Позволяет в тестах подменить базовый URL (http://localhost:xxxx). */
export type BaseUrlResolver = (domainCode: string) => string;
const defaultBaseUrl: BaseUrlResolver = (code) => `https://${getDomain(code).host}`;

/**
 * HTTP-клиент Vinted.
 * - Сессия (cookie access_token_web и т.п.) получается заходом на главную домена.
 *   Cloudflare привязывает куки к IP, поэтому сессия живёт вместе со «своим» прокси.
 * - На 401/403 сессия пересоздаётся (с другим прокси), на 429/5xx — повтор с паузой.
 */
export class VintedHttp {
  private sessions = new Map<string, Session>();
  private bootstrapping = new Map<string, Promise<Session>>();
  private lastRequestAt = 0;

  constructor(
    private baseUrl: BaseUrlResolver = defaultBaseUrl,
    private opts = { sessionTtlMs: 30 * 60_000, maxAttempts: 4, delayMs: config.vinted.requestDelayMs },
  ) {}

  private async throttle() {
    const wait = this.lastRequestAt + this.opts.delayMs - Date.now();
    this.lastRequestAt = Date.now() + Math.max(0, wait);
    if (wait > 0) await sleep(wait);
  }

  private headers(domain: string, extra: Record<string, string> = {}) {
    return {
      'user-agent': USER_AGENT,
      'accept-language': 'en-US,en;q=0.9',
      accept: 'application/json, text/plain, */*',
      referer: `${this.baseUrl(domain)}/`,
      ...extra,
    };
  }

  private absorbCookies(session: Session, setCookie: string | string[] | undefined) {
    if (!setCookie) return;
    for (const c of Array.isArray(setCookie) ? setCookie : [setCookie]) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) session.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  private cookieHeader(s: Session) {
    return [...s.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private async bootstrap(domain: string): Promise<Session> {
    const proxy = await proxyPool.next();
    const session: Session = { cookies: new Map(), createdAt: Date.now(), proxy };
    await this.throttle();
    const res = await request(`${this.baseUrl(domain)}/`, {
      method: 'GET',
      headers: this.headers(domain, { accept: 'text/html,application/xhtml+xml' }),
      dispatcher: proxy?.agent as Dispatcher | undefined,
      maxRedirections: 0,
    } as Parameters<typeof request>[1]);
    this.absorbCookies(session, res.headers['set-cookie']);
    await res.body.dump();
    if (res.statusCode >= 400) {
      proxyPool.reportFailure(proxy);
      throw new VintedHttpError(res.statusCode, domain, '/', 'bootstrap failed');
    }
    if (!session.cookies.has('access_token_web')) {
      // Не фатально: часть эндпоинтов работает и без него. Но обычно он есть.
      console.warn(`[vinted] ${domain}: на главной не выдали access_token_web, куки: ${[...session.cookies.keys()].join(',')}`);
    }
    proxyPool.reportSuccess(proxy);
    return session;
  }

  private async getSession(domain: string, fresh = false): Promise<Session> {
    const cur = this.sessions.get(domain);
    if (!fresh && cur && Date.now() - cur.createdAt < this.opts.sessionTtlMs) return cur;
    let p = this.bootstrapping.get(domain);
    if (!p) {
      p = this.bootstrap(domain).finally(() => this.bootstrapping.delete(domain));
      this.bootstrapping.set(domain, p);
    }
    const s = await p;
    this.sessions.set(domain, s);
    return s;
  }

  /** GET JSON с API домена: path вида /api/v2/catalog/items */
  async getJson<T = any>(domain: string, path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') qs.set(k, String(v));
    const url = `${this.baseUrl(domain)}${path}${qs.size ? `?${qs}` : ''}`;

    let lastErr: unknown;
    let fresh = false;
    for (let attempt = 1; attempt <= this.opts.maxAttempts; attempt++) {
      let session: Session | undefined;
      try {
        session = await this.getSession(domain, fresh);
        fresh = false;
        await this.throttle();
        const res = await request(url, {
          method: 'GET',
          headers: this.headers(domain, { cookie: this.cookieHeader(session) }),
          dispatcher: session.proxy?.agent as Dispatcher | undefined,
        });
        this.absorbCookies(session, res.headers['set-cookie']);
        const text = await res.body.text();
        if (res.statusCode === 200) {
          proxyPool.reportSuccess(session.proxy);
          return JSON.parse(text) as T;
        }
        const err = new VintedHttpError(res.statusCode, domain, path, text);
        if (res.statusCode === 401 || res.statusCode === 403) {
          // протухла сессия или заблокировали IP — новая сессия, новый прокси
          proxyPool.reportFailure(session.proxy);
          fresh = true;
          lastErr = err;
          continue;
        }
        if (res.statusCode === 429 || res.statusCode >= 500) {
          proxyPool.reportFailure(session.proxy);
          fresh = true;
          lastErr = err;
          await sleep(1000 * attempt * attempt);
          continue;
        }
        throw err; // 404 и прочее — повторять бессмысленно
      } catch (e) {
        if (e instanceof VintedHttpError && ![401, 403, 429].includes(e.status) && e.status < 500) throw e;
        if (!(e instanceof VintedHttpError)) {
          // сетевая ошибка / прокси умер
          proxyPool.reportFailure(session?.proxy ?? null);
          fresh = true;
        }
        lastErr = e;
        await sleep(500 * attempt);
      }
    }
    throw lastErr;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
