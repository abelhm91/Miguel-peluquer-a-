// Acceso a datos con una interfaz asíncrona común:
//   db.get(sql, ...params)  → fila o null
//   db.all(sql, ...params)  → filas
//   db.run(sql, ...params)  → { changes, lastRowId }
//   db.batch([[sql, params], ...]) → ejecuta todo de una vez (atómico)
// Hay dos adaptadores: Cloudflare D1 (producción) y node:sqlite (local y tests).

export const DEFAULT_SETTINGS = {
  // Horario semanal: lunes (0) … domingo (6). Vacío = cerrado.
  // Se deja vacío a propósito: el horario real lo pone Miguel desde el panel.
  hours: [[], [], [], [], [], [], []],
  phone: '',
  whatsapp: '',
  email: '',
  instagram: 'peinados.migueldelacruz',
  address: 'Calle del Cid, 12, bajo',
  city: '46980 Paterna, Valencia',
  slotStep: 30, // minutos entre horas de inicio ofrecidas
  minNoticeMinutes: 120, // antelación mínima para reservar online
  maxDaysAhead: 120, // días vista (como mínimo siempre hasta las próximas Fallas)
  bookingNote: '',
};

/** Adaptador para un binding D1 de Cloudflare. */
export function d1Adapter(d1) {
  const st = (sql, params) => d1.prepare(sql).bind(...params);
  return {
    async get(sql, ...p) {
      return (await st(sql, p).first()) ?? null;
    },
    async all(sql, ...p) {
      return (await st(sql, p).all()).results;
    },
    async run(sql, ...p) {
      const r = await st(sql, p).run();
      return { changes: r.meta.changes, lastRowId: r.meta.last_row_id };
    },
    async batch(list) {
      await d1.batch(list.map(([sql, p = []]) => st(sql, p)));
    },
  };
}

/** Adaptador para node:sqlite (servidor local y tests). */
export async function nodeAdapter(file) {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdirSync, readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  const here = dirname(fileURLToPath(import.meta.url));
  // Aplica las migraciones pendientes, registrándolas igual que wrangler (tabla d1_migrations).
  const { readdirSync } = await import('node:fs');
  const dir = join(here, '..', 'migrations');
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT 1 FROM d1_migrations WHERE name = ?').get(f)) continue;
    db.exec(readFileSync(join(dir, f), 'utf8'));
    db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(f);
  }
  return {
    raw: db,
    async get(sql, ...p) {
      return db.prepare(sql).get(...p) ?? null;
    },
    async all(sql, ...p) {
      return db.prepare(sql).all(...p);
    },
    async run(sql, ...p) {
      const r = db.prepare(sql).run(...p);
      return { changes: Number(r.changes), lastRowId: Number(r.lastInsertRowid) };
    },
    async batch(list) {
      db.exec('BEGIN');
      try {
        for (const [sql, p = []] of list) db.prepare(sql).run(...p);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

export async function getSettings(db) {
  const rows = await db.all('SELECT key, value FROM settings');
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) out[r.key] = JSON.parse(r.value);
  }
  return out;
}

export async function saveSettings(db, patch) {
  const sql = 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';
  const list = Object.entries(patch)
    .filter(([k]) => k in DEFAULT_SETTINGS)
    .map(([k, v]) => [sql, [k, JSON.stringify(v)]]);
  if (list.length) await db.batch(list);
}
