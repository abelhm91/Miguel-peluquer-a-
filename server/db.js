import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Servicios iniciales: las especialidades del perfil de Instagram de Miguel.
// Las duraciones son orientativas y se ajustan desde el panel (/admin).
// No hay precios: Miguel los añade si quiere mostrarlos.
const SEED_SERVICES = [
  { category: 'Falleras', name: 'Peinado de fallera', description: 'Peinado tradicional de fallera con moños y aderezo.', duration: 90 },
  { category: 'Falleras', name: 'Peinado de fallera infantil', description: 'Peinado de fallera para las más pequeñas.', duration: 60 },
  { category: 'Trenzas', name: 'Trenzas', description: 'Trenzas para chica y chico.', duration: 60 },
  { category: 'Peinados y recogidos', name: 'Peinado', description: 'Peinado para un día especial o un evento.', duration: 45 },
  { category: 'Peinados y recogidos', name: 'Recogido', description: 'Recogido para bodas, comuniones y celebraciones.', duration: 60 },
  { category: 'Peinados y recogidos', name: 'Novia', description: 'Peinado o recogido de novia. Cuéntale a Miguel la fecha de la boda en las notas.', duration: 90 },
  { category: 'Peluquería', name: 'Mechas', description: 'Mechas y color.', duration: 120 },
];

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
  slotStep: 15, // minutos entre horas de inicio ofrecidas
  minNoticeMinutes: 120, // antelación mínima para reservar online
  maxDaysAhead: 120, // hasta cuántos días vista se puede reservar
  bookingNote: '',
};

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY,
      category TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      duration INTEGER NOT NULL,
      price TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      token TEXT NOT NULL,
      service_id INTEGER,
      service_name TEXT NOT NULL,
      date TEXT NOT NULL,
      start_min INTEGER NOT NULL,
      end_min INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'confirmed',
      source TEXT NOT NULL DEFAULT 'web',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      cancelled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS bookings_date ON bookings(date, status);
    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY,
      date TEXT NOT NULL,
      start_min INTEGER NOT NULL,
      end_min INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS blocks_date ON blocks(date);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const count = db.prepare('SELECT COUNT(*) AS n FROM services').get().n;
  if (count === 0) {
    const ins = db.prepare(
      'INSERT INTO services (category, name, description, duration, sort) VALUES (?, ?, ?, ?, ?)'
    );
    SEED_SERVICES.forEach((s, i) => ins.run(s.category, s.name, s.description, s.duration, i));
  }
  return db;
}

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) out[r.key] = JSON.parse(r.value);
  }
  return out;
}

export function saveSettings(db, patch) {
  const up = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_SETTINGS) up.run(k, JSON.stringify(v));
  }
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
