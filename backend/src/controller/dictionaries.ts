/**
 * Статичные справочники. Живые версии тянутся из API Vinted (см. controller.ts),
 * а эти — запасной вариант, если API не ответил.
 * ID взяты из публичного веб-клиента Vinted — ПРЕДПОЛОЖЕНИЕ, могут поменяться.
 */

/** Состояние товара (status_ids в каталоге). Порядок = от лучшего к худшему. */
export const STATUSES = [
  { id: 6, title: 'Новое с бирками' },
  { id: 1, title: 'Новое без бирок' },
  { id: 2, title: 'Очень хорошее' },
  { id: 3, title: 'Хорошее' },
  { id: 4, title: 'Удовлетворительное' },
];

export const COLORS = [
  { id: 1, title: 'Чёрный', hex: '000000' },
  { id: 3, title: 'Серый', hex: '919191' },
  { id: 12, title: 'Белый', hex: 'FFFFFF' },
  { id: 20, title: 'Кремовый', hex: 'F4F0DA' },
  { id: 4, title: 'Бежевый', hex: 'F4E0C8' },
  { id: 21, title: 'Абрикосовый', hex: 'FFCC99' },
  { id: 11, title: 'Оранжевый', hex: 'FFA500' },
  { id: 22, title: 'Коралловый', hex: 'FF7F50' },
  { id: 7, title: 'Красный', hex: 'CC3300' },
  { id: 23, title: 'Бордовый', hex: '660033' },
  { id: 5, title: 'Розовый', hex: 'FF99CC' },
  { id: 24, title: 'Пудровый', hex: 'FFE5E5' },
  { id: 6, title: 'Фиолетовый', hex: '8000FF' },
  { id: 25, title: 'Сиреневый', hex: 'D9C3E6' },
  { id: 26, title: 'Голубой', hex: 'BCDDF6' },
  { id: 9, title: 'Синий', hex: '007BC4' },
  { id: 27, title: 'Тёмно-синий', hex: '000080' },
  { id: 17, title: 'Бирюзовый', hex: 'B7DCD1' },
  { id: 30, title: 'Мятный', hex: 'A2F5C9' },
  { id: 10, title: 'Зелёный', hex: '369A3D' },
  { id: 28, title: 'Тёмно-зелёный', hex: '01442F' },
  { id: 16, title: 'Хаки', hex: '86814A' },
  { id: 2, title: 'Коричневый', hex: '663300' },
  { id: 29, title: 'Горчичный', hex: 'E2B802' },
  { id: 8, title: 'Жёлтый', hex: 'FFF200' },
  { id: 13, title: 'Серебряный', hex: 'D6D6D6' },
  { id: 14, title: 'Золотой', hex: 'FFD700' },
  { id: 15, title: 'Разноцветный', hex: '' },
];

/** Верхние категории (на случай, если дерево категорий не загрузилось). */
export const ROOT_CATEGORIES = [
  { id: 1904, title: 'Женщинам', children: [] },
  { id: 5, title: 'Мужчинам', children: [] },
  { id: 1193, title: 'Детям', children: [] },
  { id: 1918, title: 'Дом', children: [] },
  { id: 2309, title: 'Развлечения', children: [] },
  { id: 2093, title: 'Питомцы', children: [] },
];

/**
 * 12 сортировок.
 * native — Vinted умеет сам (параметр order), остальные мы досортировываем
 * у себя: в живом поиске — внутри загруженных страниц, в сохранённых
 * результатах — по всей базе (SQL).
 */
export const SORT_OPTIONS = [
  { id: 'relevance', title: 'По релевантности', native: 'relevance' },
  { id: 'newest_first', title: 'Сначала новые', native: 'newest_first' },
  { id: 'price_low_to_high', title: 'Цена: по возрастанию', native: 'price_low_to_high' },
  { id: 'price_high_to_low', title: 'Цена: по убыванию', native: 'price_high_to_low' },
  { id: 'total_low_to_high', title: 'Итого с комиссией: по возрастанию', native: 'price_low_to_high' },
  { id: 'total_high_to_low', title: 'Итого с комиссией: по убыванию', native: 'price_high_to_low' },
  { id: 'oldest_first', title: 'Сначала старые', native: 'newest_first' },
  { id: 'favourites_desc', title: 'Больше всего в избранном', native: 'relevance' },
  { id: 'views_desc', title: 'Больше всего просмотров', native: 'relevance' },
  { id: 'condition_best', title: 'Лучшее состояние', native: 'newest_first' },
  { id: 'brand_az', title: 'Бренд А→Я', native: 'relevance' },
  { id: 'found_recently', title: 'Недавно найденные нами', native: 'newest_first' },
] as const;

export type SortId = (typeof SORT_OPTIONS)[number]['id'];

export function nativeOrder(sort: SortId | undefined): string {
  return SORT_OPTIONS.find((s) => s.id === sort)?.native ?? 'newest_first';
}
