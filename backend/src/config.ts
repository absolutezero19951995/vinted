import 'dotenv/config';

function bool(v: string | undefined, def: boolean) {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}
function int(v: string | undefined, def: number) {
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : def;
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://vinted:vinted@localhost:5432/vinted',
  port: int(process.env.PORT, 4000),
  registrationEnabled: bool(process.env.REGISTRATION_ENABLED, true),
  maxUsers: int(process.env.MAX_USERS, 5),
  sessionTtlDays: int(process.env.SESSION_TTL_DAYS, 30),
  scheduler: {
    enabled: bool(process.env.SCHEDULER_ENABLED, true),
    tickSeconds: int(process.env.SCHEDULER_TICK_SECONDS, 30),
    concurrency: int(process.env.SCHEDULER_CONCURRENCY, 2),
  },
  vinted: {
    requestDelayMs: int(process.env.VINTED_REQUEST_DELAY_MS, 1500),
  },
};
