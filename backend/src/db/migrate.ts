import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db, pool } from './client.js';

const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');
await migrate(db, { migrationsFolder: folder });
console.log('Миграции применены');
await pool.end();
