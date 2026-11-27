/**
 * Конфиг прокси. Все запросы к Vinted идут через Webshare.
 * Ключ берётся из .env (WEBSHARE_API_KEY) — в код его не пишем.
 */
import 'dotenv/config';

export type ProxyMode = 'list' | 'rotating' | 'off';

export const proxyConfig = {
  apiKey: process.env.WEBSHARE_API_KEY ?? '',
  mode: (process.env.PROXY_MODE ?? 'list') as ProxyMode,
  /** Базовый URL Webshare API v2 */
  apiBase: 'https://proxy.webshare.io/api/v2',
  /** Фильтр стран прокси (ISO-коды), пусто = любые */
  countries: (process.env.PROXY_COUNTRIES ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
  refreshMinutes: Number(process.env.PROXY_REFRESH_MINUTES ?? 60),
  /** Эндпоинт rotating-режима Webshare */
  rotatingHost: 'p.webshare.io',
  rotatingPort: 80,
  /** Сколько ошибок подряд терпим, прежде чем временно выкинуть прокси */
  maxFailures: 3,
  /** На сколько выкидываем «плохой» прокси, мс */
  cooldownMs: 10 * 60 * 1000,
};
