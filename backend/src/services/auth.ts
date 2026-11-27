import { randomBytes } from 'node:crypto';
import { and, count, eq, gt } from 'drizzle-orm';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

const { users, sessions } = schema;

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function createUser(username: string, password: string) {
  const name = username.trim();
  if (name.length < 2) throw new AuthError('Ник слишком короткий');
  if (password.length < 4) throw new AuthError('Пароль минимум 4 символа');
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, name));
  if (existing.length) throw new AuthError('Такой ник уже занят', 409);
  const [u] = await db
    .insert(users)
    .values({ username: name, passwordHash: await hashPassword(password) })
    .returning({ id: users.id, username: users.username });
  return u;
}

export async function register(username: string, password: string) {
  if (!config.registrationEnabled) throw new AuthError('Регистрация выключена', 403);
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n >= config.maxUsers) throw new AuthError('Лимит пользователей достигнут', 403);
  return createUser(username, password);
}

export async function login(username: string, password: string) {
  const [u] = await db.select().from(users).where(eq(users.username, username.trim()));
  if (!u || !(await verifyPassword(password, u.passwordHash))) throw new AuthError('Неверный ник или пароль', 401);
  return { id: u.id, username: u.username };
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 86_400_000);
  await db.insert(sessions).values({ token, userId, expiresAt });
  return { token, expiresAt };
}

export async function userBySession(token: string | undefined) {
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id, username: users.username })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())));
  return row ?? null;
}

export async function destroySession(token: string) {
  await db.delete(sessions).where(eq(sessions.token, token));
}
