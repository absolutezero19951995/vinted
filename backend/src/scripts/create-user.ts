// npm run user:create -w backend -- <ник> <пароль>
import { createUser } from '../services/auth.js';
import { pool } from '../db/client.js';

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('Использование: npm run user:create -w backend -- <ник> <пароль>');
  process.exit(1);
}
const u = await createUser(username, password);
console.log(`Создан пользователь #${u.id} ${u.username}`);
await pool.end();
