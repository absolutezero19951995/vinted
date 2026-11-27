import { ProxyAgent, type Dispatcher } from 'undici';
import { proxyConfig } from './config.js';
import { fetchProxyConfigCredentials, fetchProxyList } from './webshare.js';

export interface PooledProxy {
  key: string;
  url: string;
  country?: string;
  failures: number;
  disabledUntil: number;
  agent: Dispatcher;
}

/**
 * Пул прокси. Отдаёт следующий живой прокси по кругу,
 * считает ошибки и временно выключает плохие.
 */
export class ProxyPool {
  private proxies: PooledProxy[] = [];
  private idx = 0;
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  get enabled() {
    return proxyConfig.mode !== 'off';
  }

  get size() {
    return this.proxies.length;
  }

  private async load() {
    let urls: { key: string; url: string; country?: string }[] = [];
    if (proxyConfig.mode === 'rotating') {
      const { username, password } = await fetchProxyConfigCredentials();
      const u = `http://${encodeURIComponent(username)}-rotate:${encodeURIComponent(password)}@${proxyConfig.rotatingHost}:${proxyConfig.rotatingPort}`;
      urls = [{ key: 'rotating', url: u }];
    } else {
      const list = await fetchProxyList();
      urls = list.map((p) => ({
        key: `${p.proxy_address}:${p.port}`,
        url: `http://${encodeURIComponent(p.username)}:${encodeURIComponent(p.password)}@${p.proxy_address}:${p.port}`,
        country: p.country_code,
      }));
    }
    if (!urls.length) throw new Error('Webshare вернул пустой список прокси');
    const old = new Map(this.proxies.map((p) => [p.key, p]));
    this.proxies = urls.map((u) => old.get(u.key) ?? { ...u, failures: 0, disabledUntil: 0, agent: new ProxyAgent(u.url) });
    this.loadedAt = Date.now();
  }

  private async ensureLoaded() {
    const stale = Date.now() - this.loadedAt > proxyConfig.refreshMinutes * 60_000;
    if (this.proxies.length && !stale) return;
    if (!this.loading) {
      this.loading = this.load().finally(() => (this.loading = null));
    }
    try {
      await this.loading;
    } catch (e) {
      // если обновление упало, но старый список есть — работаем на нём
      if (!this.proxies.length) throw e;
    }
  }

  /** Следующий доступный прокси (или null, если прокси выключены). */
  async next(): Promise<PooledProxy | null> {
    if (!this.enabled) return null;
    await this.ensureLoaded();
    const now = Date.now();
    for (let i = 0; i < this.proxies.length; i++) {
      const p = this.proxies[(this.idx + i) % this.proxies.length];
      if (p.disabledUntil <= now) {
        this.idx = (this.idx + i + 1) % this.proxies.length;
        return p;
      }
    }
    // все в «бане» — берём того, кто раньше всех освободится
    return [...this.proxies].sort((a, b) => a.disabledUntil - b.disabledUntil)[0];
  }

  reportSuccess(p: PooledProxy | null) {
    if (p) p.failures = 0;
  }

  reportFailure(p: PooledProxy | null) {
    if (!p) return;
    p.failures++;
    if (p.failures >= proxyConfig.maxFailures) {
      p.disabledUntil = Date.now() + proxyConfig.cooldownMs;
      p.failures = 0;
    }
  }
}

export const proxyPool = new ProxyPool();
