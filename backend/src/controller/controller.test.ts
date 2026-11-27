import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { VintedController } from './controller.js';
import { VintedHttp } from './http.js';
import { sortItems } from './sort.js';
import { proxyConfig } from '../proxy/config.js';
import { ProxyPool } from '../proxy/pool.js';

proxyConfig.mode = 'off';

function listen(handler: Parameters<typeof createServer>[1]): Promise<{ url: string; server: Server }> {
  return new Promise((resolve) => {
    const server = createServer(handler).listen(0, () => {
      const a = server.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${a.port}`, server });
    });
  });
}

test('catalogParams: фильтры → query Vinted', () => {
  const p = VintedController.catalogParams(
    { text: ' levis ', brandIds: [53, 7], statusIds: [2], priceTo: 10, sort: 'total_low_to_high' },
    2,
    96,
  );
  assert.equal(p.search_text, 'levis');
  assert.equal(p.brand_ids, '53,7');
  assert.equal(p.status_ids, '2');
  assert.equal(p.price_to, 10);
  assert.equal(p.order, 'price_low_to_high');
  assert.equal(p.catalog_ids, undefined);
  assert.equal(p.page, 2);
});

test('http: получает куку на главной и пересоздаёт сессию на 401', async () => {
  let homeHits = 0;
  let apiHits = 0;
  const { url, server } = await listen((req, res) => {
    if (req.url === '/fr/') {
      homeHits++;
      res.writeHead(200, { 'set-cookie': `access_token_web=t${homeHits}; Path=/` });
      return res.end('ok');
    }
    apiHits++;
    // первая сессия «протухла»
    if (String(req.headers.cookie).includes('access_token_web=t1')) {
      res.writeHead(401);
      return res.end('{}');
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ items: [{ id: 1, title: 'x', price: { amount: '5.0', currency_code: 'EUR' } }], pagination: { current_page: 1, total_pages: 1 } }));
  });
  try {
    const c = new VintedController(new VintedHttp((code) => `${url}/${code}`, { sessionTtlMs: 60_000, maxAttempts: 3, delayMs: 0 }));
    const r = await c.search({ domains: ['fr'] });
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0].price, 5);
    assert.equal(r.errors.length, 0);
    assert.equal(homeHits, 2);
    assert.equal(apiHits, 2);
  } finally {
    server.close();
  }
});

test('search: ошибка одного домена не валит остальные', async () => {
  const { url, server } = await listen((req, res) => {
    if (req.url?.endsWith('/')) {
      res.writeHead(200, { 'set-cookie': 'access_token_web=a' });
      return res.end();
    }
    if (req.url?.startsWith('/de/')) {
      res.writeHead(404);
      return res.end('nope');
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ items: [{ id: 2, title: 'y', price: '3' }] }));
  });
  try {
    const c = new VintedController(new VintedHttp((code) => `${url}/${code}`, { sessionTtlMs: 60_000, maxAttempts: 2, delayMs: 0 }));
    const r = await c.search({ domains: ['fr', 'de'] });
    assert.equal(r.items.length, 1);
    assert.deepEqual(r.errors.map((e) => e.domain), ['de']);
  } finally {
    server.close();
  }
});

test('sortItems: итоговая цена и избранное', () => {
  const base = { domain: 'fr', title: '', brand: null, size: null, status: null, currency: 'EUR', url: '', photoUrl: null, sellerId: null, sellerLogin: null, viewCount: 0, createdAt: null, raw: null };
  const items = [
    { ...base, id: 1, price: 5, totalPrice: 9, favouriteCount: 1 },
    { ...base, id: 2, price: 6, totalPrice: 7, favouriteCount: 10 },
  ];
  assert.deepEqual(sortItems(items, 'total_low_to_high').map((i) => i.id), [2, 1]);
  assert.deepEqual(sortItems(items, 'price_low_to_high').map((i) => i.id), [1, 2]);
  assert.deepEqual(sortItems(items, 'favourites_desc').map((i) => i.id), [2, 1]);
});

test('proxy pool: тянет список из Webshare по ключу и крутит по кругу', async () => {
  let auth = '';
  const { url, server } = await listen((req, res) => {
    auth = String(req.headers.authorization);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        count: 2,
        next: null,
        results: [
          { id: 'a', username: 'u', password: 'p', proxy_address: '1.1.1.1', port: 8000, valid: true, country_code: 'FR' },
          { id: 'b', username: 'u', password: 'p', proxy_address: '2.2.2.2', port: 8000, valid: true, country_code: 'DE' },
        ],
      }),
    );
  });
  const saved = { ...proxyConfig };
  try {
    Object.assign(proxyConfig, { mode: 'list', apiKey: 'test-key', apiBase: url });
    const pool = new ProxyPool();
    const a = await pool.next();
    const b = await pool.next();
    const c = await pool.next();
    assert.equal(auth, 'Token test-key');
    assert.equal(a?.key, '1.1.1.1:8000');
    assert.equal(b?.key, '2.2.2.2:8000');
    assert.equal(c?.key, '1.1.1.1:8000');
    // три ошибки подряд → прокси уходит в бан
    pool.reportFailure(a);
    pool.reportFailure(a);
    pool.reportFailure(a);
    assert.equal((await pool.next())?.key, '2.2.2.2:8000');
    assert.equal((await pool.next())?.key, '2.2.2.2:8000');
  } finally {
    Object.assign(proxyConfig, saved);
    server.close();
  }
});
