// Utilidades compartidas por la web pública, la página de cita y el panel.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    const e = new Error('No hay conexión. Revisa tu internet e inténtalo de nuevo.');
    e.status = 0;
    throw e;
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* sin cuerpo */
  }
  if (!res.ok) {
    const e = new Error(data?.error || 'Algo ha fallado. Inténtalo de nuevo.');
    e.status = res.status;
    throw e;
  }
  return data;
}

const utc = (d) => new Date(`${d}T00:00:00Z`);

export function addDays(d, n) {
  const x = utc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((utc(b) - utc(a)) / 86400000);
}

/** 0 = lunes … 6 = domingo */
export const weekday = (d) => (utc(d).getUTCDay() + 6) % 7;

const fmtLong = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtMonth = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtDow = new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: 'UTC' });
const fmtShort = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const longDate = (d) => cap(fmtLong.format(utc(d)));
/** Fecha larga con el año cuando no es el año en curso: "Viernes, 19 de marzo de 2027". */
export const fullDate = (d) => (d.slice(0, 4) === String(new Date().getFullYear()) ? longDate(d) : `${longDate(d)} de ${d.slice(0, 4)}`);
export const shortDate = (d) => cap(fmtShort.format(utc(d)).replace(/\./g, ''));
export const monthLabel = (d) => cap(fmtMonth.format(utc(d)));
const fmtMonthShort = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' });
export const monthShort = (d) => fmtMonthShort.format(utc(d)).replace('.', '');
export const dow = (d) => fmtDow.format(utc(d)).replace('.', '');
export const dayNum = (d) => utc(d).getUTCDate();

export const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** "09:30" → "9:30" */
export const prettyTime = (hhmm) => hhmm.replace(/^0(\d)/, '$1');

export function prettyMin(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function duration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function phoneHref(p) {
  return `tel:${p.replace(/[^\d+]/g, '')}`;
}

export function whatsappHref(p, text = '') {
  let n = p.replace(/\D/g, '');
  if (n.length === 9) n = `34${n}`;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function prettyPhone(p) {
  const d = p.replace(/\D/g, '');
  if (d.length === 9) return d.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4');
  if (d.length === 11 && d.startsWith('34')) return `+34 ${d.slice(2).replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4')}`;
  return p;
}

/** Fichero .ics para añadir la cita al calendario del móvil. */
export function icsFor({ code, service, date, start, end, address, link = '' }) {
  const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const stamp = (d, t) => `${d.replace(/-/g, '')}T${t.replace(':', '')}00`;
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pentinats//Reservas//ES',
    'BEGIN:VEVENT',
    `UID:${code}@pentinats`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=Europe/Madrid:${stamp(date, start)}`,
    `DTEND;TZID=Europe/Madrid:${stamp(date, end)}`,
    `SUMMARY:${service} · Miguel de la Cruz`,
    `LOCATION:${esc(address)}`,
    `DESCRIPTION:${esc(`Código de reserva ${code}${link ? `\nVer o cancelar la cita: ${link}` : ''}`)}`,
    ...(link ? [`URL:${link}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return new Blob([lines.join('\r\n')], { type: 'text/calendar' });
}

export const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k) || 'null');
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* almacenamiento no disponible */
    }
  },
};
