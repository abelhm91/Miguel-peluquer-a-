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

/** Ocupación (citas confirmadas y bloqueos) de un día. */
export function busyRanges(db, date, { excludeBookingId } = {}) {
  const b = db
    .prepare("SELECT id, start_min, end_min FROM bookings WHERE date = ? AND status = 'confirmed'")
    .all(date)
    .filter((r) => r.id !== excludeBookingId)
    .map((r) => [r.start_min, r.end_min]);
  const k = db
    .prepare('SELECT start_min, end_min FROM blocks WHERE date = ?')
    .all(date)
    .map((r) => [r.start_min, r.end_min]);
  return [...b, ...k];
}

const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

/**
 * Horas de inicio libres para un servicio de `duration` minutos en `date`.
 * Devuelve minutos del día.
 */
export function freeSlots(db, settings, date, duration, now = nowInMadrid()) {
  const delta = daysBetween(now.date, date);
  if (delta < 0 || delta > settings.maxDaysAhead) return [];
  const step = Math.max(5, Number(settings.slotStep) || 15);
  const earliest = delta === 0 ? now.minutes + settings.minNoticeMinutes : -Infinity;
  // Si la antelación mínima cruza la medianoche, aplica también a mañana.
  const earliestTomorrow = now.minutes + settings.minNoticeMinutes - 1440;
  const minStart = delta === 0 ? earliest : delta === 1 ? earliestTomorrow : -Infinity;

  const busy = busyRanges(db, date);
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

/** true si [start, start+duration) cabe en el horario y no choca con nada. */
export function isSlotFree(db, settings, date, start, duration, now = nowInMadrid()) {
  return freeSlots(db, settings, date, duration, now).includes(start);
}

/** Resumen de los próximos `n` días: cuántos huecos libres tiene cada uno. */
export function daySummary(db, settings, from, n, duration, now = nowInMadrid()) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(from, i);
    const open = openIntervals(settings, date).length > 0;
    out.push({ date, open, free: open ? freeSlots(db, settings, date, duration, now).length : 0 });
  }
  return out;
}
