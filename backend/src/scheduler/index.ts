import { and, eq, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import { runSearch } from '../services/searches.js';

const { savedSearches } = schema;

let running = 0;
let timer: NodeJS.Timeout | null = null;

/**
 * «Забирает» поиски, которым пора опрашиваться: сразу сдвигает next_poll_at,
 * чтобы следующий тик (или второй процесс) не взял тот же поиск.
 * FOR UPDATE SKIP LOCKED — на случай, если запустят несколько инстансов.
 */
async function claimDue(limit: number) {
  if (limit <= 0) return [];
  const res = await db.execute<{ id: number; user_id: number; filters: any; pages_per_poll: number }>(sql`
    update ${savedSearches} s
       set next_poll_at = now() + make_interval(mins => s.poll_interval_minutes),
           last_polled_at = now()
     where s.id in (
       select id from ${savedSearches}
        where enabled = true and next_poll_at <= now()
        order by next_poll_at
        limit ${limit}
        for update skip locked)
    returning s.id, s.user_id, s.filters, s.pages_per_poll`);
  return res.rows;
}

async function tick() {
  const free = config.scheduler.concurrency - running;
  let due: Awaited<ReturnType<typeof claimDue>>;
  try {
    due = await claimDue(free);
  } catch (e) {
    console.error('[scheduler] не смог выбрать поиски', e);
    return;
  }
  for (const s of due) {
    running++;
    runSearch({ userId: s.user_id, searchId: s.id, filters: s.filters, trigger: 'schedule', pages: s.pages_per_poll })
      .then((r) => {
        console.log(`[scheduler] поиск #${s.id}: найдено ${r.items.length}, новых ${r.newCount}, ошибок ${r.errors.length}`);
        // TODO(бот): здесь будет хук — новые объявления → уведомления / правила автопокупки
      })
      .catch((e) => console.error(`[scheduler] поиск #${s.id} упал`, e))
      .finally(() => running--);
  }
}

export function startScheduler() {
  if (!config.scheduler.enabled || timer) return;
  console.log(`[scheduler] запущен, тик каждые ${config.scheduler.tickSeconds} c`);
  timer = setInterval(tick, config.scheduler.tickSeconds * 1000);
  void tick();
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** «Опросить сейчас» — просто ставим next_poll_at = now(). */
export async function pollNow(userId: number, searchId: number) {
  await db
    .update(savedSearches)
    .set({ nextPollAt: new Date() })
    .where(and(eq(savedSearches.id, searchId), eq(savedSearches.userId, userId)));
  void tick();
}
