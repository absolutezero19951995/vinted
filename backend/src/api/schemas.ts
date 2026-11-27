import { z } from 'zod';
import { SORT_OPTIONS, isDomainCode } from '../controller/index.js';

const idList = z.array(z.coerce.number().int().positive()).max(200).optional();

export const filtersSchema = z.object({
  text: z.string().max(200).optional(),
  categoryIds: idList,
  brandIds: idList,
  sizeIds: idList,
  statusIds: idList,
  colorIds: idList,
  priceFrom: z.coerce.number().nonnegative().optional(),
  priceTo: z.coerce.number().nonnegative().optional(),
  sort: z.enum(SORT_OPTIONS.map((s) => s.id) as [string, ...string[]]).optional(),
  domains: z.array(z.string().refine(isDomainCode, 'неизвестный домен')).optional(),
  /** только для UI: названия выбранных брендов и т.п. (id → название) */
  labels: z.record(z.string(), z.string()).optional(),
});

export const savedSearchSchema = z.object({
  name: z.string().min(1).max(100),
  filters: filtersSchema,
  /** от 5 минут до 1 дня */
  pollIntervalMinutes: z.coerce.number().int().min(5).max(1440).default(60),
  pagesPerPoll: z.coerce.number().int().min(1).max(10).default(1),
  enabled: z.boolean().default(true),
  notify: z.boolean().default(false),
});

export const credentialsSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
});
