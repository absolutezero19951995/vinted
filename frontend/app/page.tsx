'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import FiltersModal, { type Dicts } from '@/components/FiltersModal';
import { api, ApiError, cleanFilters, type Filters, type Item, type SavedSearch, type SortId } from '@/lib/api';

type View = { kind: 'live' } | { kind: 'saved'; id: number };

const DEFAULT_FILTERS: Filters = { sort: 'newest_first' };

function intervalLabel(min: number) {
  if (min < 60) return `${min} мин`;
  if (min < 1440) return `${min / 60} ч`;
  return `${min / 1440} д`;
}

function timeAgo(iso?: string | null) {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 0) return `через ${Math.round(-s / 60)} мин`;
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.round(s / 60)} мин назад`;
  if (s < 86400) return `${Math.round(s / 3600)} ч назад`;
  return `${Math.round(s / 86400)} д назад`;
}

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: number; username: string } | null>(null);
  const [dicts, setDicts] = useState<Dicts | null>(null);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [view, setView] = useState<View>({ kind: 'live' });
  const [liveFilters, setLiveFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortId>('newest_first');
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [errors, setErrors] = useState<{ domain: string; message: string }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; editing: SavedSearch | null }>({ open: false, editing: null });

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return router.replace('/login');
      setError(e instanceof Error ? e.message : String(e));
    },
    [router],
  );

  // старт: кто я + справочники + сохранённые поиски
  useEffect(() => {
    (async () => {
      const me = await api<{ user: typeof user }>('/auth/me');
      if (!me.user) return router.replace('/login');
      setUser(me.user);
      const [domains, sorts, statuses, colors, categories] = await Promise.all([
        api('/dict/domains'),
        api('/dict/sorts'),
        api('/dict/statuses'),
        api('/dict/colors'),
        api('/dict/categories'),
      ]);
      setDicts({ domains, sorts, statuses, colors, categories });
      setSearches(await api('/searches'));
    })().catch(handle);
  }, [router, handle]);

  const refreshSearches = useCallback(() => api<SavedSearch[]>('/searches').then(setSearches).catch(handle), [handle]);

  // живой поиск
  const runLive = useCallback(
    async (f: Filters, p = 1) => {
      if (f.domains?.includes('__none__')) return setError('Выбери хотя бы одну страну');
      setLoading(true);
      setError('');
      try {
        const r = await api<{ items: Item[]; errors: typeof errors; hasMore: boolean }>('/search', {
          method: 'POST',
          json: { filters: cleanFilters(f), page: p },
        });
        setItems((cur) => (p === 1 ? r.items : [...cur, ...r.items]));
        setErrors(r.errors);
        setHasMore(r.hasMore);
        setPage(p);
      } catch (e) {
        handle(e);
      } finally {
        setLoading(false);
      }
    },
    [handle],
  );

  // сохранённые результаты
  const loadSaved = useCallback(
    async (id: number, s: SortId, offset = 0) => {
      setLoading(true);
      setError('');
      try {
        const rows = await api<Item[]>(`/listings?searchId=${id}&sort=${s}&limit=96&offset=${offset}`);
        setItems((cur) => (offset === 0 ? rows : [...cur, ...rows]));
        setHasMore(rows.length === 96);
        setErrors([]);
      } catch (e) {
        handle(e);
      } finally {
        setLoading(false);
      }
    },
    [handle],
  );

  useEffect(() => {
    if (view.kind === 'saved') void loadSaved(view.id, sort);
  }, [view, sort, loadSaved]);

  const current = view.kind === 'saved' ? searches.find((s) => s.id === view.id) ?? null : null;

  async function save(data: { name: string; filters: Filters; pollIntervalMinutes: number }, id?: number) {
    if (data.filters.domains?.includes('__none__')) return setError('Выбери хотя бы одну страну');
    try {
      const body = { ...data, filters: cleanFilters(data.filters) };
      const row = id
        ? await api<SavedSearch>(`/searches/${id}`, { method: 'PUT', json: body })
        : await api<SavedSearch>('/searches', { method: 'POST', json: body });
      await refreshSearches();
      setModal({ open: false, editing: null });
      setView({ kind: 'saved', id: row.id });
      if (!id) {
        // сразу первый опрос, чтобы не ждать интервал
        await api(`/searches/${row.id}/poll`, { method: 'POST' });
        setTimeout(() => {
          loadSaved(row.id, sort);
          refreshSearches();
        }, 2500);
      }
    } catch (e) {
      handle(e);
    }
  }

  async function action(s: SavedSearch, kind: 'poll' | 'toggle' | 'delete') {
    try {
      if (kind === 'poll') {
        await api(`/searches/${s.id}/poll`, { method: 'POST' });
        setTimeout(() => {
          refreshSearches();
          if (view.kind === 'saved' && view.id === s.id) loadSaved(s.id, sort);
        }, 2500);
      } else if (kind === 'toggle') {
        await api(`/searches/${s.id}`, { method: 'PUT', json: { enabled: !s.enabled } });
      } else {
        if (!confirm(`Удалить поиск «${s.name}» и его результаты?`)) return;
        await api(`/searches/${s.id}`, { method: 'DELETE' });
        if (view.kind === 'saved' && view.id === s.id) setView({ kind: 'live' });
      }
      await refreshSearches();
    } catch (e) {
      handle(e);
    }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
  }

  if (!user || !dicts) return <div style={{ padding: 24 }} className="muted">{error || 'Загрузка…'}</div>;

  const activeFilters = view.kind === 'saved' ? current?.filters ?? {} : liveFilters;
  const domainsLabel = activeFilters.domains?.length ? activeFilters.domains.map((d) => d.toUpperCase()).join(', ') : 'все страны';

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="row">
          <strong style={{ flex: 1 }}>{user.username}</strong>
          <button onClick={logout}>Выйти</button>
        </div>
        <div
          className={`search-item ${view.kind === 'live' ? 'active' : ''}`}
          onClick={() => {
            setView({ kind: 'live' });
            setItems([]);
            setSort(liveFilters.sort ?? 'newest_first');
          }}
        >
          🔎 Живой поиск
        </div>
        <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase' }}>
          Мои поиски
        </div>
        {!searches.length && <div className="muted">Пока нет. Настрой фильтры и нажми «Сохранить поиск».</div>}
        {searches.map((s) => (
          <div
            key={s.id}
            className={`search-item ${view.kind === 'saved' && view.id === s.id ? 'active' : ''}`}
            onClick={() => {
              setView({ kind: 'saved', id: s.id });
              setSort(s.filters.sort ?? 'newest_first');
            }}
          >
            <div style={{ opacity: s.enabled ? 1 : 0.5 }}>
              <strong>{s.name}</strong>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              раз в {intervalLabel(s.pollIntervalMinutes)} · опрос {timeAgo(s.lastPolledAt)}
              {!s.enabled && ' · на паузе'}
            </div>
            <div className="actions" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => action(s, 'poll')}>Опросить</button>
              <button onClick={() => setModal({ open: true, editing: s })}>Изменить</button>
              <button onClick={() => action(s, 'toggle')}>{s.enabled ? 'Пауза' : 'Вкл'}</button>
              <button className="danger" onClick={() => action(s, 'delete')}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </aside>

      <main className="main">
        <div className="topbar">
          <button className="primary" onClick={() => setModal({ open: true, editing: current })}>
            Фильтры
          </button>
          <span className="muted">
            {view.kind === 'saved' ? `«${current?.name}»` : 'Живой поиск'} · {domainsLabel}
            {activeFilters.text ? ` · «${activeFilters.text}»` : ''}
            {activeFilters.priceTo !== undefined ? ` · до ${activeFilters.priceTo}` : ''}
          </span>
          <span className="spacer" />
          <select
            value={sort}
            onChange={(e) => {
              const s = e.target.value as SortId;
              setSort(s);
              if (view.kind === 'live') {
                const f = { ...liveFilters, sort: s };
                setLiveFilters(f);
                if (items.length) void runLive(f);
              }
            }}
          >
            {dicts.sorts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="errors">{error}</div>}
        {!!errors.length && (
          <div className="errors">
            Не ответили: {errors.map((e) => e.domain.toUpperCase()).join(', ')}
            <details>
              <summary>подробнее</summary>
              {errors.map((e) => (
                <div key={e.domain}>
                  {e.domain}: {e.message}
                </div>
              ))}
            </details>
          </div>
        )}

        {!items.length && !loading && (
          <div className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>
            {view.kind === 'live' ? 'Открой «Фильтры» и нажми «Искать сейчас».' : 'Пока ничего не нашлось. Нажми «Опросить» слева.'}
          </div>
        )}

        <div className="grid">
          {items.map((i) => (
            <a key={`${i.domain}:${i.vintedId ?? i.id}`} className="card" href={i.url} target="_blank" rel="noreferrer">
              {i.photoUrl ? <img src={i.photoUrl} alt="" loading="lazy" /> : <div style={{ aspectRatio: '3/4' }} />}
              <div className="body">
                <div className="price">
                  {i.unseen && <span className="new-dot" title="новое" />}
                  {i.price} {i.currency}
                  {i.totalPrice ? <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · {i.totalPrice} с комиссией</span> : null}
                </div>
                <div className="title" title={i.title}>
                  {i.title}
                </div>
                <div className="meta">
                  {[i.brand, i.size, i.status].filter(Boolean).join(' · ')}
                </div>
                <div className="meta row" style={{ gap: 6 }}>
                  <span className="tag">{i.domain.toUpperCase()}</span>♥ {i.favouriteCount}
                  {i.foundAt && <span>· найдено {timeAgo(i.foundAt)}</span>}
                </div>
              </div>
            </a>
          ))}
        </div>

        {loading && <div className="muted" style={{ padding: 16 }}>Ищу…</div>}
        {hasMore && !loading && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <button
              onClick={() => (view.kind === 'live' ? runLive(liveFilters, page + 1) : loadSaved(view.id, sort, items.length))}
            >
              Ещё
            </button>
          </div>
        )}
      </main>

      {modal.open && (
        <FiltersModal
          dicts={dicts}
          initial={modal.editing ? { ...modal.editing.filters, sort: modal.editing.filters.sort ?? sort } : { ...liveFilters, sort }}
          editing={modal.editing}
          onClose={() => setModal({ open: false, editing: null })}
          onSave={save}
          onSearch={(f) => {
            setModal({ open: false, editing: null });
            setView({ kind: 'live' });
            setLiveFilters(f);
            setSort(f.sort ?? 'newest_first');
            void runLive(f);
          }}
        />
      )}
    </div>
  );
}
