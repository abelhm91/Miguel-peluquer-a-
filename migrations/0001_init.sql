-- Esquema de la agenda de Miguel de la Cruz.
-- Lo usan Cloudflare D1 (wrangler d1 migrations apply) y el servidor Node local.

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

-- Servicios iniciales (especialidades del Instagram de Miguel).
-- Duraciones orientativas, sin precios: se ajustan desde /admin.
-- Cada fila solo entra si la tabla tiene exactamente las anteriores (no duplica al reabrir).
INSERT INTO services (category, name, description, duration, sort)
  SELECT 'Falleras', 'Peinado de fallera', 'Peinado tradicional de fallera con moños y aderezo.', 90, 0 WHERE (SELECT COUNT(*) FROM services) = 0;
INSERT INTO services (category, name, description, duration, sort)
  SELECT 'Falleras', 'Peinado de fallera infantil', 'Peinado de fallera para las más pequeñas.', 60, 1 WHERE (SELECT COUNT(*) FROM services) = 1;
INSERT INTO services (category, name, description, duration, sort)
  SELECT 'Trenzas', 'Trenzas', 'Trenzas para chica y chico.', 60, 2 WHERE (SELECT COUNT(*) FROM services) = 2;
INSERT INTO services (category, name, description, duration, sort)
  SELECT 'Peinados y recogidos', 'Peinado', 'Peinado para un día especial o un evento.', 45, 3 WHERE (SELECT COUNT(*) FROM services) = 3;
INSERT INTO services (category, name, description, duration, sort)
  SELECT 'Peinados y recogidos', 'Recogido', 'Recogido para bodas, comuniones y celebraciones.', 60, 4 WHERE (SELECT COUNT(*) FROM services) = 4;
INSERT INTO services (category, name, description, duration, sort)
  SELECT 'Peinados y recogidos', 'Novia', 'Peinado o recogido de novia. Cuéntame la fecha de la boda en las notas.', 90, 5 WHERE (SELECT COUNT(*) FROM services) = 5;
INSERT INTO services (category, name, description, duration, sort)
  SELECT 'Peluquería', 'Mechas', 'Mechas y color.', 120, 6 WHERE (SELECT COUNT(*) FROM services) = 6;
