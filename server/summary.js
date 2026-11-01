// Resumen diario a Miguel: las citas de mañana, por Telegram / WhatsApp.
// Lo lanza el Cron Trigger de Cloudflare (worker.js → scheduled) cada tarde.
import { getSettings } from './db.js';
import { channels, notify } from './notify.js';
import { addDays, nowInMadrid, toHHMM } from './time.js';

const fmtDate = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const num = (v) => {
  const m = String(v ?? '').trim().replace(/\s*€$/, '').match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  return m ? Number(`${m[1]}.${m[2] || 0}`) : null;
};
const euros = (n) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} €`;
const parseParty = (raw) => {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/** Texto del resumen para `date` a partir de las filas de `bookings` (confirmadas, ordenadas). */
export function summaryText(date, rows, { siteUrl = '' } = {}) {
  const day = fmtDate.format(new Date(`${date}T00:00:00Z`)).replace(',', '');
  if (!rows.length) return `📋 Mañana ${day}: no tienes citas.`;
  const people = rows.reduce((n, r) => n + Math.max(1, parseParty(r.party).length), 0);
  const total = rows.reduce((s, r) => s + (num(r.price) ?? 0), 0);
  const head = `📋 Mañana ${day}: ${people} ${people === 1 ? 'persona' : 'personas'}${total ? ` · ${euros(total)}` : ''}`;
  const lines = [head, ''];
  for (const r of rows) {
    const party = parseParty(r.party);
    if (party.length > 1) {
      for (const p of party) lines.push(`${toHHMM(p.start)} ${p.name} · ${p.service}${num(p.price) ? ` · ${euros(num(p.price))}` : ''}`);
    } else {
      lines.push(`${toHHMM(r.start_min)} ${r.name} · ${r.service_name}${num(r.price) ? ` · ${euros(num(r.price))}` : ''}`);
    }
    lines.push(`      Tel. ${r.phone}${r.notes && party.length < 2 ? ` · ${r.notes}` : ''}`);
  }
  if (siteUrl) lines.push('', `Agenda: ${siteUrl.replace(/\/$/, '')}/admin`);
  return lines.join('\n');
}

/**
 * Envía el resumen de mañana. Si `force` es falso, no envía nada cuando el
 * resumen está desactivado en Ajustes o cuando mañana no hay citas.
 */
export async function sendDailySummary({ db, env, now = nowInMadrid(), fetchImpl = fetch, siteUrl = env.SITE_URL || '', force = false }) {
  if (!channels(env).length) return { sent: false, reason: 'sin-canales' };
  const settings = await getSettings(db);
  if (!force && !settings.dailySummary) return { sent: false, reason: 'desactivado' };
  const date = addDays(now.date, 1);
  const rows = await db.all("SELECT * FROM bookings WHERE status = 'confirmed' AND date = ? ORDER BY start_min", date);
  if (!force && !rows.length) return { sent: false, reason: 'sin-citas', date };
  const results = await notify(env, summaryText(date, rows, { siteUrl }), fetchImpl);
  return { sent: true, date, count: rows.length, results: Object.fromEntries(results) };
}
