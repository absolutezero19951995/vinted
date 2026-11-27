# Vinted монитор

Ищет объявления на всех доменах Vinted по сохранённым фильтрам, складывает найденное в Postgres и показывает в веб-интерфейсе. Задел под бота автопокупки уже есть в схеме БД.

```
backend/                 Node.js + TypeScript, Fastify, Drizzle ORM, PostgreSQL
  src/controller/        обёртка над внутренним API Vinted (поиск, объявление, справочники, 25 доменов)
  src/proxy/             Webshare-прокси: config.ts, загрузка списка по API-ключу, пул с ротацией
  src/db/schema.ts       таблицы (users, sessions, saved_searches, listings, search_listings, search_runs, + purchase_rules, purchases, notifications под бота)
  src/scheduler/         опрос сохранённых поисков по их интервалу
  src/api/               HTTP API для фронта
  src/scripts/           создание пользователя, мок Vinted для локальной разработки
frontend/                Next.js: /login и / (результаты + фильтры в модалке)
```

## Запуск

```bash
npm install
docker compose up -d                 # Postgres 16 (или свой, тогда поправь DATABASE_URL)
cp backend/.env.example backend/.env # и впиши WEBSHARE_API_KEY
npm run db:migrate
npm run dev:backend                  # http://localhost:4000
npm run dev:frontend                 # http://localhost:3000
```

Зайти: на странице входа нажать «Регистрация» и придумать ник и пароль. Регистрация закрывается сама после `MAX_USERS` пользователей (или `REGISTRATION_ENABLED=false`). Можно и из консоли: `npm run user:create -w backend -- max пароль`.

### Без прокси и без Vinted (мок)

```bash
npm run mock:vinted -w backend
# в backend/.env:
VINTED_MOCK_URL=http://127.0.0.1:5555
PROXY_MODE=off
```

Мок отдаёт фейковые объявления и каждый запрос подкидывает пару «новых», чтобы было видно, как работает планировщик.

## Прокси (Webshare)

Все запросы к Vinted идут через `backend/src/proxy`. Настройки в `.env`:

| Переменная | Что делает |
|---|---|
| `WEBSHARE_API_KEY` | ключ из dashboard.webshare.io → API keys |
| `PROXY_MODE` | `list` — скачать список прокси и крутить по кругу (по умолчанию); `rotating` — один эндпоинт p.webshare.io, IP меняет сам Webshare; `off` — напрямую |
| `PROXY_COUNTRIES` | только прокси этих стран, напр. `FR,DE` |

Прокси, который 3 раза подряд вернул ошибку, выключается на 10 минут. Сессия Vinted (кука `access_token_web`) берётся заходом на главную домена через тот же прокси; на 401/403 сессия пересоздаётся через другой прокси, на 429/5xx запрос повторяется с паузой.

## Фильтры и сортировки

Фильтры: текст, страны (любой набор из 25 доменов), категория, бренд, размер (зависит от категории), цена от/до, состояние, цвет, сортировка.

Сортировок 12. Vinted сам умеет только 4 (релевантность, новые, цена ↑, цена ↓). Остальные (итоговая цена с комиссией ↑/↓, старые, избранное, просмотры, лучшее состояние, бренд А→Я, недавно найденные нами) в сохранённых поисках сортируются по всей базе в SQL, а в живом поиске только внутри загруженной страницы.

## Опрос

У каждого сохранённого поиска свой `poll_interval_minutes` (по умолчанию 60, от 5 минут до суток) и `pages_per_poll` (по 96 объявлений на страницу). Планировщик раз в `SCHEDULER_TICK_SECONDS` берёт поиски, которым пора, и опрашивает не больше `SCHEDULER_CONCURRENCY` одновременно. Каждый запуск пишется в `search_runs` (история), новые объявления помечаются как непросмотренные.

## Под бота (ещё не реализовано)

- `saved_searches.notify` — слать ли уведомления о новых;
- `purchase_rules` — правило автопокупки поверх поиска: макс. цена / итоговая цена, окно времени (например 23:00–08:00), лимиты в день;
- `purchases` — статусы `pending → ordered → completed`, плюс `cancel_requested / cancelled` для утренней отмены;
- `notifications` — что и кому отправили.

Точка подключения: `TODO(бот)` в `backend/src/scheduler/index.ts`.

## Тесты

```bash
npm test -w backend
```
