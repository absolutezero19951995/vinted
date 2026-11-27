/**
 * Все домены Vinted. В фильтре поиска можно включать/выключать любые.
 * Каталог id (категории/бренды/цвета/состояния) у Vinted общие для всех доменов,
 * а валюта отличается.
 */
export interface VintedDomain {
  code: string; // наш ключ
  host: string;
  country: string;
  currency: string;
}

export const VINTED_DOMAINS: VintedDomain[] = [
  { code: 'fr', host: 'www.vinted.fr', country: 'Франция', currency: 'EUR' },
  { code: 'de', host: 'www.vinted.de', country: 'Германия', currency: 'EUR' },
  { code: 'es', host: 'www.vinted.es', country: 'Испания', currency: 'EUR' },
  { code: 'it', host: 'www.vinted.it', country: 'Италия', currency: 'EUR' },
  { code: 'nl', host: 'www.vinted.nl', country: 'Нидерланды', currency: 'EUR' },
  { code: 'be', host: 'www.vinted.be', country: 'Бельгия', currency: 'EUR' },
  { code: 'at', host: 'www.vinted.at', country: 'Австрия', currency: 'EUR' },
  { code: 'lu', host: 'www.vinted.lu', country: 'Люксембург', currency: 'EUR' },
  { code: 'pt', host: 'www.vinted.pt', country: 'Португалия', currency: 'EUR' },
  { code: 'ie', host: 'www.vinted.ie', country: 'Ирландия', currency: 'EUR' },
  { code: 'fi', host: 'www.vinted.fi', country: 'Финляндия', currency: 'EUR' },
  { code: 'gr', host: 'www.vinted.gr', country: 'Греция', currency: 'EUR' },
  { code: 'hr', host: 'www.vinted.hr', country: 'Хорватия', currency: 'EUR' },
  { code: 'si', host: 'www.vinted.si', country: 'Словения', currency: 'EUR' },
  { code: 'sk', host: 'www.vinted.sk', country: 'Словакия', currency: 'EUR' },
  { code: 'lt', host: 'www.vinted.lt', country: 'Литва', currency: 'EUR' },
  { code: 'lv', host: 'www.vinted.lv', country: 'Латвия', currency: 'EUR' },
  { code: 'ee', host: 'www.vinted.ee', country: 'Эстония', currency: 'EUR' },
  { code: 'pl', host: 'www.vinted.pl', country: 'Польша', currency: 'PLN' },
  { code: 'cz', host: 'www.vinted.cz', country: 'Чехия', currency: 'CZK' },
  { code: 'hu', host: 'www.vinted.hu', country: 'Венгрия', currency: 'HUF' },
  { code: 'ro', host: 'www.vinted.ro', country: 'Румыния', currency: 'RON' },
  { code: 'se', host: 'www.vinted.se', country: 'Швеция', currency: 'SEK' },
  { code: 'dk', host: 'www.vinted.dk', country: 'Дания', currency: 'DKK' },
  { code: 'uk', host: 'www.vinted.co.uk', country: 'Великобритания', currency: 'GBP' },
];

const byCode = new Map(VINTED_DOMAINS.map((d) => [d.code, d]));

export function getDomain(code: string): VintedDomain {
  const d = byCode.get(code);
  if (!d) throw new Error(`Неизвестный домен Vinted: ${code}`);
  return d;
}

export function isDomainCode(code: string) {
  return byCode.has(code);
}
