// API de reservas. Funciona igual en Cloudflare Workers y en Node:
// recibe un Request estándar y devuelve un Response.

import { getSettings, saveSettings } from './db.js';
import { daySummary, freeSlots, hasAnyHours, busyRanges, openIntervals, effectiveMaxDays, nextFallasEnd } from './availability.js';
import { addDays, isValidDate, nowInMadrid, toHHMM, toMinutes } from './time.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (msg) => new HttpError(400, msg);

/* ---------- helpers ---------- */

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

async function readJson(req) {
  const type = req.headers.get('content-type') || '';
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Se esperaba JSON.');
  const text = await req.text();
  if (text.length > 32 * 1024) throw new HttpError(413, 'Petición demasiado grande.');
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw bad('JSON no válido.');
  }
}

export const MAX_PEOPLE = 4;
/** Número de personas para una cita seguida (1–4). */
const peopleOf = (v) => Math.min(MAX_PEOPLE, Math.max(1, Math.floor(Number(v)) || 1));

/** Nombre del servicio de una cita de grupo: "Trenzas · 2 personas" o "Peinado de fallera + Trenzas". */
function partyLabel(list) {
  if (list.length === 1) return list[0].service;
  const names = [...new Set(list.map((p) => p.service))];
  return names.length === 1 ? `${names[0]} · ${list.length} personas` : names.join(' + ');
}

const parseParty = (raw) => {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const cleanPhone = (v) => str(v, 30).replace(/[^\d+]/g, '');

function randomInt(n) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}

function randomToken(bytes = 18) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64url(a);
}

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function newCode() {
  // Sin caracteres que se confunden (0/O, 1/I/L)
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function publicSettings(s, today) {
  return {
    hours: s.hours,
    phone: s.phone,
    whatsapp: s.whatsapp,
    email: s.email,
    instagram: s.instagram,
    address: s.address,
    city: s.city,
    maxDaysAhead: effectiveMaxDays(s, today),
    fallasEnd: nextFallasEnd(today),
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
    serviceId: r.service_id,
    party: parseParty(r.party).map((p) => ({ name: p.name, serviceId: p.serviceId, service: p.service, start: toHHMM(p.start), end: toHHMM(p.end) })),
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

/* ---------- límite de peticiones (memoria, por instancia) ---------- */

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

/* ---------- sesión de administración (HMAC con Web Crypto) ---------- */

function makeAuth({ adminPassword, sessionSecret }) {
  const secret = sessionSecret || randomToken(32);
  const MAX_AGE = 60 * 60 * 24 * 14; // 14 días
  const keyP = crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  async function sign(payload) {
    const sig = await crypto.subtle.sign('HMAC', await keyP, new TextEncoder().encode(payload));
    return b64url(new Uint8Array(sig));
  }

  async function issue() {
    const payload = `admin.${Math.floor(Date.now() / 1000) + MAX_AGE}`;
    return `${payload}.${await sign(payload)}`;
  }

  async function verify(token) {
    if (!token) return false;
    const i = token.lastIndexOf('.');
    if (i < 0) return false;
    const payload = token.slice(0, i);
    if (!safeEqual(token.slice(i + 1), await sign(payload))) return false;
    return Number(payload.split('.')[1]) > Date.now() / 1000;
  }

  async function checkPassword(pw) {
    if (!adminPassword || typeof pw !== 'string') return false;
    return safeEqual(await sign(`pw:${pw}`), await sign(`pw:${adminPassword}`));
  }

  return { issue, verify, checkPassword, MAX_AGE, enabled: !!adminPassword };
}

function getCookie(req, name) {
  const raw = req.headers.get('cookie') || '';
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
      if (toMinutes(ranges[j][0]) < toMinutes(ranges[j - 1][1])) throw bad(`Los tramos del día ${i + 1} se solapan.`);
    }
    return ranges;
  });
}

function validateService(body) {
  const name = str(body.name, 80);
  const duration = Number(body.duration);
  if (!name) throw bad('El servicio necesita un nombre.');
  if (!Number.isInteger(duration) || duration < 10 || duration > 600) throw bad('La duración debe estar entre 10 y 600 minutos.');
  return {
    category: str(body.category, 60),
    name,
    description: str(body.description, 400),
    duration,
    price: str(body.price, 40),
    active: body.active === false ? 0 : 1,
  };
}

// Inserta la cita solo si en ese mismo instante no hay otra cita ni bloqueo que se solape.
// Es una única sentencia, así que es atómica también en D1 (sin transacciones).
const INSERT_IF_FREE = `
  INSERT INTO bookings (code, token, service_id, service_name, date, start_min, end_min, name, phone, email, notes, source, party)
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE date = ? AND status = 'confirmed' AND start_min < ? AND end_min > ?)
    AND NOT EXISTS (SELECT 1 FROM blocks WHERE date = ? AND start_min < ? AND end_min > ?)`;

const INSERT_ANY = `
  INSERT INTO bookings (code, token, service_id, service_name, date, start_min, end_min, name, phone, email, notes, source, party)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/* ---------- aplicación ---------- */

export function createApi({ db, adminPassword, sessionSecret, secureCookies = false, now = () => nowInMadrid() }) {
  const auth = makeAuth({ adminPassword, sessionSecret });
  const bookingLimiter = rateLimiter(6, 60 * 60 * 1000);
  const loginLimiter = rateLimiter(10, 15 * 60 * 1000);

  const isAdmin = (req) => auth.verify(getCookie(req, 'pentinats_admin'));
  const getService = (id) => db.get('SELECT * FROM services WHERE id = ?', id);

  /**
   * Servicios de las demás personas (además de la principal), en orden.
   * Acepta `extra` (lista de ids o de {serviceId, name}) o, por compatibilidad, `people` (mismo servicio).
   */
  async function extrasFrom(main, { extra, people }, { web = true } = {}) {
    let list = Array.isArray(extra) ? extra : typeof extra === 'string' && extra ? extra.split(',') : null;
    if (!list) list = Array.from({ length: peopleOf(people) - 1 }, () => main.id);
    if (list.length > MAX_PEOPLE - 1) throw bad(`Como máximo se pueden reservar ${MAX_PEOPLE} personas seguidas.`);
    const out = [];
    for (const item of list) {
      const id = Number(typeof item === 'object' && item ? item.serviceId : item) || 0;
      const svc = id === main.id ? main : await getService(id);
      if (!svc || (web && !svc.active)) throw bad('Uno de los servicios elegidos no está disponible.');
      out.push({ svc, name: typeof item === 'object' && item ? str(item.name, 60) : '' });
    }
    return out;
  }

  async function createBooking(body, { source }) {
    const settings = await getSettings(db);
    const service = await getService(Number(body.serviceId) || 0);
    if (!service || (!service.active && source === 'web')) throw bad('Ese servicio no está disponible.');
    const date = str(body.date, 10);
    if (!isValidDate(date)) throw bad('Elige un día.');
    const start = toMinutes(str(body.time, 5));
    if (!Number.isFinite(start)) throw bad('Elige una hora.');
    const name = str(body.name, 80);
    const phone = cleanPhone(body.phone);
    const email = str(body.email, 120);
    // Demás personas (cada una con su servicio); los nombres son opcionales.
    const extras = source === 'web' ? await extrasFrom(service, body) : [];
    if (source === 'web' && !Array.isArray(body.extra) && Array.isArray(body.others)) {
      body.others.forEach((n, i) => extras[i] && !extras[i].name && (extras[i].name = str(n, 60)));
    }
    const baseNotes = str(body.notes, 600);
    if (name.length < 2) throw bad('Escribe tu nombre.');
    if (source === 'web' && phone.replace(/\D/g, '').length < 9) throw bad('Escribe un teléfono válido para que pueda avisarte.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Revisa el correo electrónico.');
    const custom = Number(body.duration);
    const duration =
      source === 'admin' && Number.isInteger(custom) && custom >= 10 && custom <= 600
        ? custom
        : service.duration + extras.reduce((n, x) => n + x.svc.duration, 0);
    const end = start + duration;

    // Orden y horas de cada persona (seguidas).
    let t = start;
    const party = [{ name, svc: service }, ...extras.map((x, i) => ({ name: x.name || `Persona ${i + 2}`, svc: x.svc }))].map((p) => {
      const item = { name: p.name, serviceId: p.svc.id, service: p.svc.name, start: t, end: t + (extras.length ? p.svc.duration : duration) };
      t = item.end;
      return item;
    });
    const notes = party.length > 1
      ? [`${party.length} personas seguidas: ${party.map((p) => `${toHHMM(p.start)} ${p.name} (${p.service})`).join(', ')}.`, baseNotes].filter(Boolean).join('\n')
      : baseNotes;

    if (source === 'web') {
      const slots = await freeSlots(db, settings, date, duration, now());
      if (!slots.includes(start)) throw new HttpError(409, 'Vaya, esa hora acaba de ocuparse. Elige otra, por favor.');
    } else if (end > 1440) {
      throw bad('La cita no puede pasar de medianoche.');
    }

    const force = source === 'admin' && body.force === true;
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = newCode();
      const token = randomToken();
      const label = party.length > 1 ? partyLabel(party) : service.name;
      const values = [code, token, service.id, label, date, start, end, name, phone, email, notes, source, party.length > 1 ? JSON.stringify(party) : ''];
      let r;
      try {
        r = force ? await db.run(INSERT_ANY, ...values) : await db.run(INSERT_IF_FREE, ...values, date, end, start, date, end, start);
      } catch (e) {
        if (/UNIQUE/i.test(String(e?.message))) continue; // código repetido: probar otro
        throw e;
      }
      if (r.changes !== 1) {
        throw new HttpError(409, source === 'web' ? 'Vaya, esa hora acaba de ocuparse. Elige otra, por favor.' : 'Esa hora se solapa con otra cita o un bloqueo.');
      }
      const row = await db.get('SELECT * FROM bookings WHERE code = ?', code);
      return { ...bookingRow(row, { full: source === 'admin' }), token };
    }
    throw new HttpError(500, 'No se ha podido guardar la cita. Inténtalo de nuevo.');
  }

  async function route(req, url) {
    const path = url.pathname;
    const m = req.method;
    const ip = req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
    let mm;

    /* ----- público ----- */

    if (m === 'GET' && path === '/api/info') {
      const [settings, services] = await Promise.all([
        getSettings(db),
        db.all('SELECT * FROM services WHERE active = 1 ORDER BY sort, id'),
      ]);
      const n = now();
      return json(200, { settings: publicSettings(settings, n.date), services: services.map(serviceRow), today: n.date, nowMinutes: n.minutes });
    }

    if (m === 'GET' && path === '/api/days') {
      const settings = await getSettings(db);
      const service = await getService(Number(url.searchParams.get('service')) || 0);
      if (!service || !service.active) throw bad('Servicio no válido.');
      const n = now();
      const from = isValidDate(url.searchParams.get('from')) ? url.searchParams.get('from') : n.date;
      const count = Math.min(62, Math.max(1, Number(url.searchParams.get('n')) || 14));
      const extras = await extrasFrom(service, { extra: url.searchParams.get('extra'), people: url.searchParams.get('people') });
      const total = service.duration + extras.reduce((a, x) => a + x.svc.duration, 0);
      return json(200, { days: await daySummary(db, settings, from, count, total, n) });
    }

    if (m === 'GET' && path === '/api/slots') {
      const settings = await getSettings(db);
      const service = await getService(Number(url.searchParams.get('service')) || 0);
      const date = url.searchParams.get('date');
      if (!service || !service.active) throw bad('Servicio no válido.');
      if (!isValidDate(date)) throw bad('Fecha no válida.');
      const extras = await extrasFrom(service, { extra: url.searchParams.get('extra'), people: url.searchParams.get('people') });
      const total = service.duration + extras.reduce((a, x) => a + x.svc.duration, 0);
      const slots = (await freeSlots(db, settings, date, total, now())).map(toHHMM);
      return json(200, { date, slots });
    }

    if (m === 'POST' && path === '/api/bookings') {
      const body = await readJson(req);
      // Cambio de hora: la cita anterior (con su enlace privado) aporta el teléfono y se cancela
      // solo después de guardar la nueva. No cuenta para el límite de reservas.
      let old = null;
      if (body.replaces && typeof body.replaces === 'object') {
        old = await db.get("SELECT * FROM bookings WHERE code = ? AND status = 'confirmed'", str(body.replaces.code, 6).toUpperCase());
        if (!old || !safeEqual(old.token, String(body.replaces.token || ''))) throw new HttpError(404, 'No encuentro la cita que quieres cambiar.');
        if (!cleanPhone(body.phone)) body.phone = old.phone;
        if (!str(body.email)) body.email = old.email;
      }
      if (!old && !bookingLimiter(ip)) {
        throw new HttpError(429, 'Has hecho varias reservas seguidas. Espera un rato o escríbeme por Instagram (@peinados.migueldelacruz).');
      }
      if (str(body.website)) return json(201, { ok: true }); // trampa anti-spam
      const created = await createBooking(body, { source: 'web' });
      if (old) {
        await db.run("UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ? AND status = 'confirmed'", old.id);
        created.replaced = { ok: true, code: old.code };
      }
      return json(201, created);
    }

    if (m === 'GET' && (mm = path.match(/^\/api\/bookings\/([A-Z0-9]{6})$/))) {
      const row = await db.get('SELECT * FROM bookings WHERE code = ?', mm[1]);
      if (!row || !safeEqual(row.token, url.searchParams.get('t') || '')) throw new HttpError(404, 'No encuentro esa reserva.');
      return json(200, bookingRow(row));
    }

    if (m === 'POST' && (mm = path.match(/^\/api\/bookings\/([A-Z0-9]{6})\/cancel$/))) {
      const body = await readJson(req);
      const row = await db.get('SELECT * FROM bookings WHERE code = ?', mm[1]);
      if (!row || !safeEqual(row.token, String(body.token || ''))) throw new HttpError(404, 'No encuentro esa reserva.');
      if (row.status === 'confirmed') {
        await db.run("UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?", row.id);
      }
      return json(200, bookingRow(await db.get('SELECT * FROM bookings WHERE id = ?', row.id)));
    }

    /* ----- administración ----- */

    if (m === 'POST' && path === '/api/admin/login') {
      if (!auth.enabled) throw new HttpError(503, 'El panel no está activado: falta el secreto ADMIN_PASSWORD (en Cloudflare: Configuración → Variables y secretos, tipo Secreto, entorno Producción).');
      if (!loginLimiter(ip)) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');
      const body = await readJson(req);
      if (!(await auth.checkPassword(body.password))) throw new HttpError(401, 'Contraseña incorrecta.');
      const cookie = `pentinats_admin=${await auth.issue()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${auth.MAX_AGE}${secureCookies ? '; Secure' : ''}`;
      return json(200, { ok: true }, { 'set-cookie': cookie });
    }

    if (m === 'POST' && path === '/api/admin/logout') {
      return json(200, { ok: true }, { 'set-cookie': `pentinats_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookies ? '; Secure' : ''}` });
    }

    if (m === 'GET' && path === '/api/admin/session') {
      return json(200, { loggedIn: await isAdmin(req), enabled: auth.enabled });
    }

    if (!path.startsWith('/api/admin/')) throw new HttpError(404, 'No encontrado.');
    if (!(await isAdmin(req))) throw new HttpError(401, 'Inicia sesión para continuar.');
    // Las mutaciones exigen JSON y la cookie es SameSite=Strict: protección frente a CSRF.

    if (m === 'GET' && path === '/api/admin/overview') {
      const [settings, services] = await Promise.all([getSettings(db), db.all('SELECT * FROM services ORDER BY sort, id')]);
      const n = now();
      return json(200, { settings, services: services.map(serviceRow), today: n.date, nowMinutes: n.minutes });
    }

    if (m === 'GET' && path === '/api/admin/day') {
      const date = url.searchParams.get('date');
      if (!isValidDate(date)) throw bad('Fecha no válida.');
      const [settings, bookings, blocks] = await Promise.all([
        getSettings(db),
        db.all('SELECT * FROM bookings WHERE date = ? ORDER BY start_min, id', date),
        db.all('SELECT * FROM blocks WHERE date = ? ORDER BY start_min', date),
      ]);
      return json(200, {
        date,
        open: openIntervals(settings, date).map(([a, b]) => [toHHMM(a), toHHMM(b)]),
        bookings: bookings.map((r) => bookingRow(r, { full: true })),
        blocks: blocks.map((r) => ({ id: r.id, date: r.date, start: toHHMM(r.start_min), end: toHHMM(Math.min(r.end_min, 1440)), reason: r.reason })),
      });
    }

    if (m === 'GET' && path === '/api/admin/upcoming') {
      const n = now();
      const to = addDays(n.date, Math.min(365, Number(url.searchParams.get('days')) || 60));
      const rows = await db.all(
        "SELECT * FROM bookings WHERE status = 'confirmed' AND date >= ? AND date <= ? ORDER BY date, start_min LIMIT 500",
        n.date,
        to
      );
      return json(200, { bookings: rows.map((r) => bookingRow(r, { full: true })) });
    }

    if (m === 'POST' && path === '/api/admin/bookings') {
      return json(201, await createBooking(await readJson(req), { source: 'admin' }));
    }

    if (m === 'POST' && (mm = path.match(/^\/api\/admin\/bookings\/(\d+)\/cancel$/))) {
      await readJson(req);
      await db.run("UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ? AND status = 'confirmed'", Number(mm[1]));
      return json(200, { ok: true });
    }

    if (m === 'POST' && (mm = path.match(/^\/api\/admin\/bookings\/(\d+)\/restore$/))) {
      await readJson(req);
      const row = await db.get('SELECT * FROM bookings WHERE id = ?', Number(mm[1]));
      if (!row) throw new HttpError(404, 'No existe esa cita.');
      const busy = await busyRanges(db, row.date, { excludeBookingId: row.id });
      if (busy.some(([b0, b1]) => row.start_min < b1 && b0 < row.end_min)) {
        throw new HttpError(409, 'No se puede recuperar: ese hueco ya está ocupado.');
      }
      await db.run("UPDATE bookings SET status = 'confirmed', cancelled_at = NULL WHERE id = ?", row.id);
      return json(200, { ok: true });
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
      const sql = 'INSERT INTO blocks (date, start_min, end_min, reason) VALUES (?, ?, ?, ?)';
      await db.batch(Array.from({ length: days }, (_, i) => [sql, [addDays(date, i), a, b, str(body.reason, 120)]]));
      return json(201, { ok: true });
    }

    if (m === 'DELETE' && (mm = path.match(/^\/api\/admin\/blocks\/(\d+)$/))) {
      await db.run('DELETE FROM blocks WHERE id = ?', Number(mm[1]));
      return json(200, { ok: true });
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
      await saveSettings(db, patch);
      return json(200, { settings: await getSettings(db) });
    }

    if (m === 'POST' && path === '/api/admin/services') {
      const s = validateService(await readJson(req));
      const max = (await db.get('SELECT COALESCE(MAX(sort), 0) AS m FROM services')).m;
      const r = await db.run(
        'INSERT INTO services (category, name, description, duration, price, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
        s.category, s.name, s.description, s.duration, s.price, s.active, max + 1
      );
      return json(201, serviceRow(await getService(r.lastRowId)));
    }

    if ((mm = path.match(/^\/api\/admin\/services\/(\d+)$/))) {
      const id = Number(mm[1]);
      if (m === 'PUT') {
        const cur = await getService(id);
        if (!cur) throw new HttpError(404, 'No existe ese servicio.');
        const body = await readJson(req);
        const s = validateService({ ...serviceRow(cur), ...body });
        const sort = Number.isInteger(body.sort) ? body.sort : cur.sort;
        await db.run(
          'UPDATE services SET category = ?, name = ?, description = ?, duration = ?, price = ?, active = ?, sort = ? WHERE id = ?',
          s.category, s.name, s.description, s.duration, s.price, s.active, sort, id
        );
        return json(200, serviceRow(await getService(id)));
      }
      if (m === 'DELETE') {
        // Las citas guardan el nombre del servicio, así que borrarlo no las rompe.
        await db.batch([
          ['UPDATE bookings SET service_id = NULL WHERE service_id = ?', [id]],
          ['DELETE FROM services WHERE id = ?', [id]],
        ]);
        return json(200, { ok: true });
      }
    }

    throw new HttpError(404, 'No encontrado.');
  }

  /** Devuelve la respuesta de la API, o null si la ruta no es de la API. */
  return async function handleApi(req) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return null;
    try {
      return await route(req, url);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message });
      console.error(err);
      return json(500, { error: 'Ha fallado algo en el servidor. Inténtalo de nuevo.' });
    }
  };
}
