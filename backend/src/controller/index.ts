export * from './controller.js';
export * from './domains.js';
export * from './dictionaries.js';
export * from './types.js';
export { VintedHttp, VintedHttpError } from './http.js';
export { sortItems } from './sort.js';

import { VintedController } from './controller.js';
import { VintedHttp } from './http.js';

/**
 * Общий экземпляр — одна пачка сессий/прокси на весь процесс.
 * VINTED_MOCK_URL=http://127.0.0.1:5555 — гонять всё в локальный мок (npm run mock:vinted), без прокси.
 */
const mock = process.env.VINTED_MOCK_URL;
export const vinted = new VintedController(mock ? new VintedHttp((code) => `${mock}/${code}`) : undefined);
