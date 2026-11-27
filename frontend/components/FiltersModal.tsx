'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, type Category, type Domain, type Filters, type Option, type SavedSearch, type SortId } from '@/lib/api';

export interface Dicts {
  domains: Domain[];
  sorts: { id: SortId; title: string }[];
  statuses: Option[];
  colors: Option[];
  categories: Category[];
}

interface Props {
  dicts: Dicts;
  initial: Filters;
  /** если редактируем сохранённый поиск */
  editing?: SavedSearch | null;
  onClose: () => void;
  onSearch: (f: Filters) => void;
  onSave: (data: { name: string; filters: Filters; pollIntervalMinutes: number }, id?: number) => void;
}

const INTERVALS = [
  { v: 5, t: '5 мин' },
  { v: 15, t: '15 мин' },
  { v: 30, t: '30 мин' },
  { v: 60, t: '1 час' },
  { v: 180, t: '3 часа' },
  { v: 360, t: '6 часов' },
  { v: 720, t: '12 часов' },
  { v: 1440, t: '1 день' },
];

function flatten(cats: Category[], depth = 0, path: string[] = []): { id: number; label: string; path: string }[] {
  return cats.flatMap((c) => [
    { id: c.id, label: `${'  '.repeat(depth)}${c.title}`, path: [...path, c.title].join(' / ') },
    ...flatten(c.children ?? [], depth + 1, [...path, c.title]),
  ]);
}

function toggle(list: number[] | undefined, id: number) {
  const s = new Set(list ?? []);
  s.has(id) ? s.delete(id) : s.add(id);
  return [...s];
}

export default function FiltersModal({ dicts, initial, editing, onClose, onSearch, onSave }: Props) {
  const [f, setF] = useState<Filters>(initial);
  const [brandQuery, setBrandQuery] = useState('');
  const [brandHits, setBrandHits] = useState<Option[]>([]);
  // названия выбранных брендов/размеров — чтобы показывать чипы
  const [sizes, setSizes] = useState<Option[]>([]);
  const [name, setName] = useState(editing?.name ?? '');
  const [interval, setInterval] = useState(editing?.pollIntervalMinutes ?? 60);

  const cats = useMemo(() => flatten(dicts.categories), [dicts.categories]);
  const set = (patch: Partial<Filters>) => setF((cur) => ({ ...cur, ...patch }));
  const allDomains = dicts.domains.map((d) => d.code);
  const selectedDomains = f.domains?.length ? f.domains : allDomains;
  const categoryId = f.categoryIds?.[0];

  // бренды: поиск с задержкой
  useEffect(() => {
    const q = brandQuery.trim();
    if (q.length < 2) return setBrandHits([]);
    const t = setTimeout(() => api<Option[]>(`/dict/brands?q=${encodeURIComponent(q)}`).then(setBrandHits).catch(() => setBrandHits([])), 300);
    return () => clearTimeout(t);
  }, [brandQuery]);

  // размеры зависят от категории
  useEffect(() => {
    if (!categoryId) return setSizes([]);
    api<Option[]>(`/dict/sizes?categoryId=${categoryId}`).then(setSizes).catch(() => setSizes([]));
  }, [categoryId]);

  const num = (v: string) => (v === '' ? undefined : Number(v));

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Фильтры">
        <div className="row">
          <h2 style={{ flex: 1 }}>{editing ? `Поиск: ${editing.name}` : 'Фильтры'}</h2>
          <button onClick={onClose} aria-label="Закрыть">✕</button>
        </div>

        <div className="section">
          <label>Текст</label>
          <input value={f.text ?? ''} onChange={(e) => set({ text: e.target.value })} placeholder="например: levis 501" />
        </div>

        <div className="section">
          <div className="row">
            <label style={{ flex: 1, margin: 0 }}>Страны ({selectedDomains.length} из {allDomains.length})</label>
            <button onClick={() => set({ domains: [] })}>Все</button>
            <button onClick={() => set({ domains: ['__none__'] })}>Ни одной</button>
          </div>
          <div className="chips">
            {dicts.domains.map((d) => {
              const on = selectedDomains.includes(d.code);
              return (
                <span
                  key={d.code}
                  className={`chip ${on ? 'on' : ''}`}
                  title={d.host}
                  onClick={() => {
                    const base = selectedDomains.filter((x) => x !== '__none__');
                    const next = on ? base.filter((x) => x !== d.code) : [...base, d.code];
                    set({ domains: next.length === allDomains.length ? [] : next.length ? next : ['__none__'] });
                  }}
                >
                  {d.code.toUpperCase()} · {d.country}
                </span>
              );
            })}
          </div>
        </div>

        <div className="two">
          <div className="section">
            <label>Категория</label>
            <select
              value={categoryId ?? ''}
              onChange={(e) => set({ categoryIds: e.target.value ? [Number(e.target.value)] : [], sizeIds: [] })}
            >
              <option value="">Любая</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id} title={c.path}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="section">
            <label>Сортировка</label>
            <select value={f.sort ?? 'newest_first'} onChange={(e) => set({ sort: e.target.value as SortId })}>
              {dicts.sorts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="section">
          <label>Бренд</label>
          {!!f.brandIds?.length && (
            <div className="chips">
              {f.brandIds.map((id) => (
                <span key={id} className="chip on" onClick={() => set({ brandIds: toggle(f.brandIds, id) })}>
                  {f.labels?.[`brand:${id}`] ?? `#${id}`} ✕
                </span>
              ))}
            </div>
          )}
          <input value={brandQuery} onChange={(e) => setBrandQuery(e.target.value)} placeholder="начни вводить бренд…" />
          {!!brandHits.length && (
            <div className="suggest">
              {brandHits.slice(0, 30).map((b) => (
                <div
                  key={b.id}
                  onClick={() => {
                    set({
                      brandIds: [...new Set([...(f.brandIds ?? []), b.id])],
                      labels: { ...f.labels, [`brand:${b.id}`]: b.title },
                    });
                    setBrandQuery('');
                    setBrandHits([]);
                  }}
                >
                  {b.title}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <label>Размер</label>
          {!categoryId ? (
            <span className="muted">Сначала выбери категорию — размерные сетки у Vinted зависят от неё.</span>
          ) : sizes.length ? (
            <div className="chips">
              {sizes.map((s) => (
                <span
                  key={s.id}
                  className={`chip ${f.sizeIds?.includes(s.id) ? 'on' : ''}`}
                  title={s.group}
                  onClick={() => set({ sizeIds: toggle(f.sizeIds, s.id) })}
                >
                  {s.title}
                </span>
              ))}
            </div>
          ) : (
            <span className="muted">Размеров для этой категории нет или не загрузились.</span>
          )}
        </div>

        <div className="two">
          <div className="section">
            <label>Цена от</label>
            <input type="number" min={0} value={f.priceFrom ?? ''} onChange={(e) => set({ priceFrom: num(e.target.value) })} />
          </div>
          <div className="section">
            <label>Цена до</label>
            <input type="number" min={0} value={f.priceTo ?? ''} onChange={(e) => set({ priceTo: num(e.target.value) })} />
          </div>
        </div>
        <span className="muted" style={{ marginTop: -10, fontSize: 12 }}>
          Цена в валюте каждой страны (EUR, PLN, CZK…).
        </span>

        <div className="section">
          <label>Состояние</label>
          <div className="chips">
            {dicts.statuses.map((s) => (
              <span key={s.id} className={`chip ${f.statusIds?.includes(s.id) ? 'on' : ''}`} onClick={() => set({ statusIds: toggle(f.statusIds, s.id) })}>
                {s.title}
              </span>
            ))}
          </div>
        </div>

        <div className="section">
          <label>Цвет</label>
          <div className="chips">
            {dicts.colors.map((c) => (
              <span key={c.id} className={`chip ${f.colorIds?.includes(c.id) ? 'on' : ''}`} onClick={() => set({ colorIds: toggle(f.colorIds, c.id) })}>
                <span className="swatch" style={{ background: c.hex ? `#${c.hex}` : 'linear-gradient(90deg,red,yellow,blue)' }} />
                {c.title}
              </span>
            ))}
          </div>
        </div>

        <div className="section">
          <label>Сохранить как поиск (бот будет опрашивать сам)</label>
          <div className="two">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название, напр. Levi's до 10€" />
            <select value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
              {INTERVALS.map((i) => (
                <option key={i.v} value={i.v}>
                  Опрос раз в {i.t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="footer">
          <button onClick={() => setF({ sort: f.sort })}>Сбросить</button>
          <button disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), filters: f, pollIntervalMinutes: interval }, editing?.id)}>
            {editing ? 'Обновить поиск' : 'Сохранить поиск'}
          </button>
          <button className="primary" onClick={() => onSearch(f)}>
            Искать сейчас
          </button>
        </div>
      </div>
    </div>
  );
}
