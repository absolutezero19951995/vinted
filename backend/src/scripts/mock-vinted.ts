/**
 * Локальный мок API Vinted — чтобы гонять фронт и тесты без прокси и без бана.
 * Запуск: npm run mock:vinted -w backend, затем в .env: VINTED_MOCK_URL=http://127.0.0.1:5555 и PROXY_MODE=off
 */
import { createServer } from 'node:http';

const BRANDS = ["Levi's", 'Nike', 'Zara', 'Adidas', 'Carhartt', 'Ralph Lauren'];
const STATUSES = ['New with tags', 'New without tags', 'Very good', 'Good', 'Satisfactory'];
let nextId = 5_000_000_000;
const born = Date.now();

function item(domain: string, i: number) {
  const id = 4_000_000_000 + i * 7 + domain.charCodeAt(0);
  const price = ((i * 37) % 60) + 3;
  return {
    id,
    title: `${BRANDS[i % BRANDS.length]} item #${i} (${domain})`,
    price: { amount: price.toFixed(1), currency_code: domain === 'pl' ? 'PLN' : 'EUR' },
    total_item_price: { amount: (price * 1.05 + 0.7).toFixed(2), currency_code: domain === 'pl' ? 'PLN' : 'EUR' },
    brand_title: BRANDS[i % BRANDS.length],
    size_title: ['S', 'M', 'L', 'W32 L32'][i % 4],
    status: STATUSES[i % STATUSES.length],
    url: `/items/${id}-mock`,
    favourite_count: (i * 13) % 50,
    view_count: (i * 29) % 400,
    user: { id: 1000 + i, login: `seller${i}` },
    photo: { url: `https://picsum.photos/seed/${id}/300/400`, high_resolution: { timestamp: Math.floor((born - i * 3600_000) / 1000) } },
  };
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const [, domain, ...rest] = url.pathname.split('/');
  const path = '/' + rest.join('/');
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (path === '/') {
    res.writeHead(200, { 'set-cookie': [`access_token_web=mock-${domain}; Path=/`, `_vinted_${domain}_session=abc; Path=/`] });
    return res.end('<html></html>');
  }
  if (!String(req.headers.cookie).includes('access_token_web=')) return json(401, { code: 100, message: 'unauthorized' });
  if (path === '/api/v2/catalog/items') {
    const page = Number(url.searchParams.get('page') ?? 1);
    const per = Number(url.searchParams.get('per_page') ?? 96);
    // каждый запрос — пара «новых» объявлений сверху, чтобы планировщику было что находить
    const fresh = [nextId++, nextId++].map((n) => ({ ...item(domain, n % 1000), id: n }));
    let items = [...fresh, ...Array.from({ length: per }, (_, k) => item(domain, (page - 1) * per + k))];
    const to = url.searchParams.get('price_to');
    if (to) items = items.filter((x) => Number(x.price.amount) <= Number(to));
    return json(200, { items, pagination: { current_page: page, total_pages: 3 } });
  }
  if (path.startsWith('/api/v2/items/')) return json(200, { item: { ...item(domain, 1), description: 'Mock description' } });
  if (path === '/api/v2/brands') return json(200, { brands: BRANDS.map((t, i) => ({ id: 50 + i, title: t })).filter((b) => b.title.toLowerCase().includes((url.searchParams.get('keyword') ?? '').toLowerCase())) });
  if (path === '/api/v2/catalogs') return json(200, { catalogs: [{ id: 5, title: 'Men', catalogs: [{ id: 2050, title: 'Clothing', catalogs: [{ id: 257, title: 'Jeans', catalogs: [] }] }] }, { id: 1904, title: 'Women', catalogs: [] }] });
  if (path === '/api/v2/catalog/filters') return json(200, { filters: [{ code: 'size', options: [{ title: 'Letter', options: [{ id: 206, title: 'S' }, { id: 207, title: 'M' }, { id: 208, title: 'L' }] }] }] });
  return json(404, { message: 'not found' });
});

const port = Number(process.env.MOCK_PORT ?? 5555);
server.listen(port, () => console.log(`mock vinted on http://127.0.0.1:${port}`));
