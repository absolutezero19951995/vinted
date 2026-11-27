import { request } from 'undici';
import { proxyConfig } from './config.js';

export interface WebshareProxy {
  id: string;
  username: string;
  password: string;
  proxy_address: string;
  port: number;
  valid: boolean;
  country_code: string;
}

interface ListResponse {
  count: number;
  next: string | null;
  results: WebshareProxy[];
}

function authHeaders() {
  if (!proxyConfig.apiKey) throw new Error('WEBSHARE_API_KEY не задан в .env');
  return { Authorization: `Token ${proxyConfig.apiKey}` };
}

/** Скачивает весь список прокси аккаунта (mode=direct). */
export async function fetchProxyList(): Promise<WebshareProxy[]> {
  const out: WebshareProxy[] = [];
  let url: string | null = `${proxyConfig.apiBase}/proxy/list/?mode=direct&page=1&page_size=100`;
  if (proxyConfig.countries.length) url += `&country_code__in=${proxyConfig.countries.join(',')}`;
  while (url) {
    const res = await request(url, { headers: authHeaders() });
    if (res.statusCode !== 200) {
      throw new Error(`Webshare proxy/list ответил ${res.statusCode}: ${await res.body.text()}`);
    }
    const data = (await res.body.json()) as ListResponse;
    out.push(...data.results.filter((p) => p.valid));
    url = data.next;
  }
  return out;
}

/** Логин/пароль для rotating-эндпоинта (p.webshare.io). */
export async function fetchProxyConfigCredentials(): Promise<{ username: string; password: string }> {
  const res = await request(`${proxyConfig.apiBase}/proxy/config/`, { headers: authHeaders() });
  if (res.statusCode !== 200) {
    throw new Error(`Webshare proxy/config ответил ${res.statusCode}: ${await res.body.text()}`);
  }
  const data = (await res.body.json()) as { username: string; password: string };
  return { username: data.username, password: data.password };
}
