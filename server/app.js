import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { getSettings, saveSettings, transaction, DEFAULT_SETTINGS } from './db.js';
import { daySummary, freeSlots, hasAnyHours, isSlotFree, busyRanges, openIntervals } from './availability.js';
import { addDays, isValidDate, nowInMadrid, toHHMM, toMinutes } from './time.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (msg) => new HttpError(400, msg);

/* ---------- helpers ---------- */

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readJson(req) {
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Se esperaba JSON.');
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 32 * 1024) throw new HttpError(413, 'Petición demasiado grande.');
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw bad('JSON no válido.');
  }
}

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function cleanPhone(v) {
  const p = str(v, 30).replace(/[^\d+]/g, '');
  return p;
}

function newCode() {
  // Sin caracteres que se confunden (0/O, 1/I/L)
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

function publicSettings(s) {
  return {
    hours: s.hours,
    phone: s.phone,
    whatsapp: s.whatsapp,
    email: s.email,
    instagram: s.instagram,
    address: s.address,
    city: s.city,
    maxDaysAhead: s.maxDaysAhead,
    minNoticeMinutes: s.minNoticeMinutes,
    bookingNote: s.bookingNote,
    bookingOpen: hasAnyHours(s),
  };
}

function serviceRow(r) {
  return {
    id: r.id,
    category: r.category,
    name: r.name,
    description: r.description,
    duration: r.duration,
    price: r.price,
    active: !!r.active,
    sort: r.sort,
  };
}

function bookingRow(r, { full = false } = {}) {
  const b = {
    code: r.code,
    service: r.service_name,
    date: r.date,
    start: toHHMM(r.start_min),
    end: toHHMM(r.end_min),
    name: r.name,
    status: r.status,
  };
  if (full) {
    Object.assign(b, {
      id: r.id,
      serviceId: r.service_id,
      phone: r.phone,
      email: r.email,
      notes: r.notes,
      source: r.source,
      createdAt: r.created_at,
      cancelledAt: r.cancelled_at,
    });
  }
  return b;
}

/* ---------- rate limit (memoria) ---------- */

function rateLimiter(limit, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) return false;
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}

/* ---------- sesión de administración ---------- */

function makeAuth({ adminPassword, sessionSecret }) {
  const secret = sessionSecret || randomBytes(32).toString('hex');
  const MAX_AGE = 60 * 60 * 24 * 14; // 14 días

  const sign = (payload) => createHmac('sha256', secret).update(payload).digest('base64url');

  function issue() {
    const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
    const payload = `admin.${exp}`;
    return `${payload}.${sign(payload)}`;
  }

  function verify(token) {
    if (!token) return false;
    const i = token.lastIndexOf('.');
    if (i < 0) return false;
    const payload = token.slice(0, i);
    const sig = Buffer.from(token.slice(i + 1));
    const good = Buffer.from(sign(payload));
    if (sig.length !== good.length || !timingSafeEqual(sig, good)) return false;
    const exp = Number(payload.split('.')[1]);
    return exp > Date.now() / 1000;
  }

  function checkPassword(pw) {
    if (!adminPassword || typeof pw !== 'string') return false;
    const a = createHmac('sha256', secret).update(pw).digest();
    const b = createHmac('sha256', secret).update(adminPassword).digest();
    return timingSafeEqual(a, b);
  }

  return { issue, verify, checkPassword, MAX_AGE, enabled: !!adminPassword };
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

/* ---------- validación ---------- */

function validateHours(hours) {
  if (!Array.isArray(hours) || hours.length !== 7) throw bad('El horario debe tener 7 días.');
  return hours.map((day, i) => {
    if (!Array.isArray(day)) throw bad('Horario no válido.');
    const ranges = day.map((r) => {
      if (!Array.isArray(r) || r.length !== 2) throw bad('Horario no válido.');
      const a = toMinutes(r[0]);
      const b = toMinutes(r[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
        throw bad(`Revisa el horario del día ${i + 1}: la hora de cierre debe ser posterior a la de apertura.`);
      }
      return [toHHMM(a), toHHMM(b)];
    });
    ranges.sort((x, y) => toMinutes(x[0]) - toMinutes(y[0]));
    for (let j = 1; j < ranges.length; j++) {
      if (toMinutes(ranges[j][0]) < toMinutes(ranges[j - 1][1])) {
        throw bad(`Los tramos del día ${i + 1} se solapan.`);
      }
    }
    return ranges;
  });
}

function validateService(body) {
  const name = str(body.name, 80);
  const duration = Number(body.duration);
  if (!name) throw bad('El servicio necesita un nombre.');
  if (!Number.isInteger(duration) || duration < 10 || duration > 600) {
    throw bad('La duración debe estar entre 10 y 600 minutos.');
  }
  return {
    category: str(body.category, 60),
    name,
    description: str(body.description, 400),
    duration,
    price: str(body.price, 40),
    active: body.active === false ? 0 : 1,
    sort: Number.isInteger(body.sort) ? body.sort : 0,
  };
}

/* ---------- aplicación ---------- */

export function createApp({ db, publicDir, adminPassword, sessionSecret, secureCookies = false, now = () => nowInMadrid() }) {
  const auth = makeAuth({ adminPassword, sessionSecret });
  const bookingLimiter = rateLimiter(6, 60 * 60 * 1000);
  const loginLimiter = rateLimiter(10, 15 * 60 * 1000);

  const isAdmin = (req) => auth.verify(getCookie(req, 'pentinats_admin'));
  const requireAdmin = (req) => {
    if (!isAdmin(req)) throw new HttpError(401, 'Inicia sesión para continuar.');
  };

  const getService = (id) => db.prepare('SELECT * FROM services WHERE id = ?').get(id);

  function createBooking(body, { source, allowAnyTime = false }) {
    const settings = getSettings(db);
    const service = getService(Number(body.serviceId));
    if (!service || (!service.active && source === 'web')) throw bad('Ese servicio no está disponible.');
    const date = str(body.date, 10);
    if (!isValidDate(date)) throw bad('Elige un día.');
    const start = toMinutes(str(body.time, 5));
    if (!Number.isFinite(start)) throw bad('Elige una hora.');
    const name = str(body.name, 80);
    const phone = cleanPhone(body.phone);
    const email = str(body.email, 120);
    const notes = str(body.notes, 600);
    if (name.length < 2) throw bad('Escribe tu nombre.');
    if (source === 'web' && phone.replace(/\D/g, '').length < 9) {
      throw bad('Escribe un teléfono válido para que Miguel pueda avisarte.');
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Revisa el correo electrónico.');
    const duration = Number(body.duration) > 0 && source === 'admin' ? Number(body.duration) : service.duration;

    return transaction(db, () => {
      if (allowAnyTime) {
        const clash = busyRanges(db, date).some(([b0, b1]) => start < b1 && b0 < start + duration);
        if (clash && !body.force) throw new HttpError(409, 'Esa hora se solapa con otra cita o un bloqueo.');
      } else if (!isSlotFree(db, settings, date, start, duration, now())) {
        throw new HttpError(409, 'Vaya, esa hora acaba de ocuparse. Elige otra, por favor.');
      }
      let code;
      do code = newCode();
      while (db.prepare('SELECT 1 FROM bookings WHERE code = ?').get(code));
      const token = randomBytes(18).toString('base64url');
      db.prepare(
        `INSERT INTO bookings (code, token, service_id, service_name, date, start_min, end_min, name, phone, email, notes, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(code, token, service.id, service.name, date, start, start + duration, name, phone, email, notes, source);
      const row = db.prepare('SELECT * FROM bookings WHERE code = ?').get(code);
      return { ...bookingRow(row, { full: source === 'admin' }), token };
    });
  }

  /* ----- rutas API ----- */

  async function api(req, res, url) {
    const path = url.pathname;
    const m = req.method;
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

    // Público
    if (m === 'GET' && path === '/api/info') {
      const settings = getSettings(db);
      const services = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY sort, id').all().map(serviceRow);
      const n = now();
      return send(res, 200, { settings: publicSettings(settings), services, today: n.date, nowMinutes: n.minutes });
    }

    if (m === 'GET' && path === '/api/days') {
      const settings = getSettings(db);
      const service = getService(Number(url.searchParams.get('service')));
      if (!service || !service.active) throw bad('Servicio no válido.');
      const n = now();
      const from = isValidDate(url.searchParams.get('from')) ? url.searchParams.get('from') : n.date;
      const count = Math.min(62, Math.max(1, Number(url.searchParams.get('n')) || 14));
      return send(res, 200, { days: daySummary(db, settings, from, count, service.duration, n) });
    }

    if (m === 'GET' && path === '/api/slots') {
      const settings = getSettings(db);
      const service = getService(Number(url.searchParams.get('service')));
      const date = url.searchParams.get('date');
      if (!service || !service.active) throw bad('Servicio no válido.');
      if (!isValidDate(date)) throw bad('Fecha no válida.');
      const slots = freeSlots(db, settings, date, service.duration, now()).map(toHHMM);
      return send(res, 200, { date, slots });
    }

    if (m === 'POST' && path === '/api/bookings') {
      if (!bookingLimiter(ip)) throw new HttpError(429, 'Demasiadas reservas seguidas. Inténtalo más tarde.');
      const body = await readJson(req);
      if (str(body.website)) return send(res, 201, { ok: true }); // trampa anti-spam
      const b = createBooking(body, { source: 'web' });
      return send(res, 201, b);
    }

    let mm = path.match(/^\/api\/bookings\/([A-Z0-9]{6})$/);
    if (m === 'GET' && mm) {
      const row = db.prepare('SELECT * FROM bookings WHERE code = ?').get(mm[1]);
      if (!row || row.token !== url.searchParams.get('t')) throw new HttpError(404, 'No encontramos esa reserva.');
      return send(res, 200, bookingRow(row));
    }

    mm = path.match(/^\/api\/bookings\/([A-Z0-9]{6})\/cancel$/);
    if (m === 'POST' && mm) {
      const body = await readJson(req);
      const row = db.prepare('SELECT * FROM bookings WHERE code = ?').get(mm[1]);
      if (!row || row.token !== body.token) throw new HttpError(404, 'No encontramos esa reserva.');
      if (row.status === 'confirmed') {
        db.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?").run(row.id);
      }
      const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(row.id);
      return send(res, 200, bookingRow(updated));
    }

    // Administración
    if (m === 'POST' && path === '/api/admin/login') {
      if (!auth.enabled) throw new HttpError(503, 'El panel no está activado: falta la variable ADMIN_PASSWORD en el servidor.');
      if (!loginLimiter(ip)) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');
      const body = await readJson(req);
      if (!auth.checkPassword(body.password)) throw new HttpError(401, 'Contraseña incorrecta.');
      const cookie = `pentinats_admin=${auth.issue()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${auth.MAX_AGE}${secureCookies ? '; Secure' : ''}`;
      return send(res, 200, { ok: true }, { 'set-cookie': cookie });
    }

    if (m === 'POST' && path === '/api/admin/logout') {
      return send(res, 200, { ok: true }, { 'set-cookie': 'pentinats_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
    }

    if (m === 'GET' && path === '/api/admin/session') {
      return send(res, 200, { loggedIn: isAdmin(req), enabled: auth.enabled });
    }

    if (path.startsWith('/api/admin/')) {
      requireAdmin(req);
      // Mutaciones solo con JSON (además de SameSite=Strict) para evitar CSRF.

      if (m === 'GET' && path === '/api/admin/overview') {
        const settings = getSettings(db);
        const services = db.prepare('SELECT * FROM services ORDER BY sort, id').all().map(serviceRow);
        const n = now();
        return send(res, 200, { settings, services, today: n.date, nowMinutes: n.minutes });
      }

      if (m === 'GET' && path === '/api/admin/day') {
        const date = url.searchParams.get('date');
        if (!isValidDate(date)) throw bad('Fecha no válida.');
        const settings = getSettings(db);
        const bookings = db
          .prepare('SELECT * FROM bookings WHERE date = ? ORDER BY start_min, id')
          .all(date)
          .map((r) => bookingRow(r, { full: true }));
        const blocks = db
          .prepare('SELECT * FROM blocks WHERE date = ? ORDER BY start_min')
          .all(date)
          .map((r) => ({ id: r.id, date: r.date, start: toHHMM(r.start_min), end: toHHMM(Math.min(r.end_min, 1440)), reason: r.reason }));
        const open = openIntervals(settings, date).map(([a, b]) => [toHHMM(a), toHHMM(b)]);
        return send(res, 200, { date, open, bookings, blocks });
      }

      if (m === 'GET' && path === '/api/admin/upcoming') {
        const n = now();
        const to = addDays(n.date, Math.min(365, Number(url.searchParams.get('days')) || 60));
        const rows = db
          .prepare(
            "SELECT * FROM bookings WHERE status = 'confirmed' AND date >= ? AND date <= ? ORDER BY date, start_min LIMIT 500"
          )
          .all(n.date, to)
          .map((r) => bookingRow(r, { full: true }));
        const counts = db
          .prepare("SELECT date, COUNT(*) AS n FROM bookings WHERE status = 'confirmed' AND date >= ? AND date <= ? GROUP BY date")
          .all(n.date, to);
        return send(res, 200, { bookings: rows, counts });
      }

      if (m === 'POST' && path === '/api/admin/bookings') {
        const body = await readJson(req);
        const b = createBooking(body, { source: 'admin', allowAnyTime: true });
        return send(res, 201, b);
      }

      mm = path.match(/^\/api\/admin\/bookings\/(\d+)\/cancel$/);
      if (m === 'POST' && mm) {
        await readJson(req);
        db.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ? AND status = 'confirmed'").run(Number(mm[1]));
        return send(res, 200, { ok: true });
      }

      mm = path.match(/^\/api\/admin\/bookings\/(\d+)\/restore$/);
      if (m === 'POST' && mm) {
        await readJson(req);
        const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(mm[1]));
        if (!row) throw new HttpError(404, 'No existe esa cita.');
        const clash = busyRanges(db, row.date, { excludeBookingId: row.id }).some(
          ([b0, b1]) => row.start_min < b1 && b0 < row.end_min
        );
        if (clash) throw new HttpError(409, 'No se puede recuperar: ese hueco ya está ocupado.');
        db.prepare("UPDATE bookings SET status = 'confirmed', cancelled_at = NULL WHERE id = ?").run(row.id);
        return send(res, 200, { ok: true });
      }

      if (m === 'POST' && path === '/api/admin/blocks') {
        const body = await readJson(req);
        const date = str(body.date, 10);
        if (!isValidDate(date)) throw bad('Elige un día.');
        const allDay = !!body.allDay;
        const a = allDay ? 0 : toMinutes(str(body.start, 5));
        const b = allDay ? 1440 : toMinutes(str(body.end, 5));
        if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) throw bad('Revisa las horas del bloqueo.');
        const days = Math.min(60, Math.max(1, Number(body.days) || 1));
        const ins = db.prepare('INSERT INTO blocks (date, start_min, end_min, reason) VALUES (?, ?, ?, ?)');
        transaction(db, () => {
          for (let i = 0; i < days; i++) ins.run(addDays(date, i), a, b, str(body.reason, 120));
        });
        return send(res, 201, { ok: true });
      }

      mm = path.match(/^\/api\/admin\/blocks\/(\d+)$/);
      if (m === 'DELETE' && mm) {
        db.prepare('DELETE FROM blocks WHERE id = ?').run(Number(mm[1]));
        return send(res, 200, { ok: true });
      }

      if (m === 'PUT' && path === '/api/admin/settings') {
        const body = await readJson(req);
        const patch = {};
        if ('hours' in body) patch.hours = validateHours(body.hours);
        for (const k of ['phone', 'whatsapp']) if (k in body) patch[k] = cleanPhone(body[k]);
        for (const k of ['email', 'instagram', 'address', 'city']) if (k in body) patch[k] = str(body[k], 120);
        if ('bookingNote' in body) patch.bookingNote = str(body.bookingNote, 400);
        const ints = { slotStep: [5, 120], minNoticeMinutes: [0, 60 * 24 * 7], maxDaysAhead: [1, 400] };
        for (const [k, [lo, hi]] of Object.entries(ints)) {
          if (k in body) {
            const v = Number(body[k]);
            if (!Number.isInteger(v) || v < lo || v > hi) throw bad(`Valor no válido para ${k}.`);
            patch[k] = v;
          }
        }
        saveSettings(db, patch);
        return send(res, 200, { settings: getSettings(db) });
      }

      if (m === 'POST' && path === '/api/admin/services') {
        const s = validateService(await readJson(req));
        const max = db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM services').get().m;
        const r = db
          .prepare('INSERT INTO services (category, name, description, duration, price, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(s.category, s.name, s.description, s.duration, s.price, s.active, max + 1);
        return send(res, 201, serviceRow(getService(Number(r.lastInsertRowid))));
      }

      mm = path.match(/^\/api\/admin\/services\/(\d+)$/);
      if (m === 'PUT' && mm) {
        const cur = getService(Number(mm[1]));
        if (!cur) throw new HttpError(404, 'No existe ese servicio.');
        const body = await readJson(req);
        const s = validateService({ ...serviceRow(cur), ...body });
        db.prepare('UPDATE services SET category = ?, name = ?, description = ?, duration = ?, price = ?, active = ?, sort = ? WHERE id = ?').run(
          s.category, s.name, s.description, s.duration, s.price, s.active, Number.isInteger(body.sort) ? body.sort : cur.sort, cur.id
        );
        return send(res, 200, serviceRow(getService(cur.id)));
      }
      if (m === 'DELETE' && mm) {
        // Las citas guardan el nombre del servicio, así que borrarlo no las rompe.
        db.prepare('UPDATE bookings SET service_id = NULL WHERE service_id = ?').run(Number(mm[1]));
        db.prepare('DELETE FROM services WHERE id = ?').run(Number(mm[1]));
        return send(res, 200, { ok: true });
      }
    }

    throw new HttpError(404, 'No encontrado.');
  }

  /* ----- estáticos ----- */

  const PAGES = { '/': 'index.html', '/admin': 'admin.html', '/cita': 'cita.html' };

  async function serveStatic(req, res, url) {
    let rel = PAGES[url.pathname.replace(/\/+$/, '') || '/'] || url.pathname.slice(1);
    const file = normalize(join(publicDir, decodeURIComponent(rel)));
    if (!file.startsWith(normalize(publicDir))) throw new HttpError(404, 'No encontrado.');
    let info;
    try {
      info = await stat(file);
    } catch {
      info = null;
    }
    if (!info || !info.isFile()) {
      const notFound = await readFile(join(publicDir, '404.html')).catch(() => null);
      res.writeHead(404, { 'content-type': MIME['.html'] });
      return res.end(notFound || 'No encontrado');
    }
    const ext = extname(file);
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      ...(ext === '.html' ? { 'x-frame-options': 'DENY' } : {}),
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método no permitido.');
      return await serveStatic(req, res, url);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      console.error(err);
      return send(res, 500, { error: 'Ha fallado algo en el servidor. Inténtalo de nuevo.' });
    }
  };
}

export { DEFAULT_SETTINGS };
