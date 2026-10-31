import { addDays, daysBetween, nowInMadrid, toMinutes, weekdayIndex } from './time.js';

/** Intervalos de apertura de un día, en minutos: [[540, 840], ...] */
export function openIntervals(settings, date) {
  const day = settings.hours?.[weekdayIndex(date)] ?? [];
  return day
    .map(([a, b]) => [toMinutes(a), toMinutes(b)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
}

export function hasAnyHours(settings) {
  return (settings.hours ?? []).some((d) => d && d.length > 0);
}

/** Ocupación (citas confirmadas y bloqueos) entre dos fechas, agrupada por día. */
export async function busyByDate(db, from, to, { excludeBookingId } = {}) {
  const [b, k] = await Promise.all([
    db.all("SELECT id, date, start_min, end_min FROM bookings WHERE date >= ? AND date <= ? AND status = 'confirmed'", from, to),
    db.all('SELECT date, start_min, end_min FROM blocks WHERE date >= ? AND date <= ?', from, to),
  ]);
  const map = new Map();
  for (const r of [...b.filter((r) => r.id !== excludeBookingId), ...k]) {
    if (!map.has(r.date)) map.set(r.date, []);
    map.get(r.date).push([r.start_min, r.end_min]);
  }
  return map;
}

export async function busyRanges(db, date, opts) {
  return (await busyByDate(db, date, date, opts)).get(date) ?? [];
}

const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

/** Último día de las próximas Fallas (19 de marzo) a partir de `today`. */
export function nextFallasEnd(today) {
  const y = Number(today.slice(0, 4));
  const thisYear = `${y}-03-19`;
  return today <= thisYear ? thisYear : `${y + 1}-03-19`;
}

/**
 * Días vista que se pueden reservar: el ajuste de Miguel, pero siempre
 * como mínimo hasta el final de las próximas Fallas.
 */
export function effectiveMaxDays(settings, today) {
  return Math.max(Number(settings.maxDaysAhead) || 0, daysBetween(today, nextFallasEnd(today)));
}

/** Horas de inicio libres (minutos del día), con la ocupación ya cargada. */
export function computeSlots(settings, date, duration, busy, now = nowInMadrid()) {
  const delta = daysBetween(now.date, date);
  if (delta < 0 || delta > effectiveMaxDays(settings, now.date)) return [];
  const step = Math.max(5, Number(settings.slotStep) || 15);
  // La antelación mínima cuenta desde ahora, aunque cruce la medianoche.
  const minStart = now.minutes + settings.minNoticeMinutes - delta * 1440;
  const out = [];
  for (const [open, close] of openIntervals(settings, date)) {
    for (let t = open; t + duration <= close; t += step) {
      if (t < minStart) continue;
      if (busy.some(([b0, b1]) => overlaps(t, t + duration, b0, b1))) continue;
      out.push(t);
    }
  }
  return out;
}

export async function freeSlots(db, settings, date, duration, now = nowInMadrid()) {
  return computeSlots(settings, date, duration, await busyRanges(db, date), now);
}

/** Resumen de los próximos `n` días: cuántos huecos libres tiene cada uno. */
export async function daySummary(db, settings, from, n, duration, now = nowInMadrid()) {
  const to = addDays(from, n - 1);
  const busy = await busyByDate(db, from, to);
  const out = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(from, i);
    // "open" = queda algún hueco posible ese día sin contar citas (si ya cerró hoy, cuenta como cerrado).
    const open = openIntervals(settings, date).length > 0 && computeSlots(settings, date, duration, [], now).length > 0;
    out.push({ date, open, free: open ? computeSlots(settings, date, duration, busy.get(date) ?? [], now).length : 0 });
  }
  return out;
}
