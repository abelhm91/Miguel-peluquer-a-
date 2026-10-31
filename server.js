import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from './server/db.js';
import { createApp } from './server/app.js';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;
const dbFile = process.env.DATABASE_FILE || join(root, 'data', 'reservas.db');

if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠  ADMIN_PASSWORD no está definida: el panel /admin estará desactivado.');
}

const db = openDb(dbFile);
const handler = createApp({
  db,
  publicDir: join(root, 'public'),
  adminPassword: process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.SESSION_SECRET,
  secureCookies: process.env.NODE_ENV === 'production',
});

createServer(handler).listen(port, () => {
  console.log(`Reservas de Miguel de la Cruz en http://localhost:${port}  (panel: /admin)`);
});
