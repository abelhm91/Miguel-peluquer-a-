// Tareas de mantenimiento: exportar citas a CSV y borrar las antiguas.
import { addDays, toHHMM } from './time.js';

/** Días que se guardan las citas pasadas (lo dice la política de privacidad). */
export const KEEP_DAYS = 365;

/** Borra las citas cuya fecha es anterior a hace un año. Devuelve cuántas. */
export async function purgeOldBookings(db, today) {
  const r = await db.run('DELETE FROM bookings WHERE date < ?', addDays(today, -KEEP_DAYS));
  return r.changes ?? 0;
}

const STATUS = { confirmed: 'Confirmada', cancelled: 'Cancelada' };
const SOURCE = { web: 'Web', admin: 'Manual' };

// Excel en español usa «;» como separador; el BOM hace que lea bien los acentos.
const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita fórmulas al abrirlo en Excel
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV de las filas de `bookings` (una línea por persona en las reservas de grupo). */
export function bookingsCsv(rows) {
  const head = ['Fecha', 'Hora', 'Fin', 'Nombre', 'Teléfono', 'Correo', 'Servicio', 'Precio (€)', 'Estado', 'Origen', 'Reserva hecha por', 'Código', 'Notas'];
  const out = [head];
  for (const r of rows) {
    let party = [];
    try {
      party = JSON.parse(r.party || '[]');
    } catch {
      party = [];
    }
    const base = [r.phone, r.email, null, null, STATUS[r.status] || r.status, SOURCE[r.source] || r.source];
    const people = Array.isArray(party) && party.length > 1 ? party : [{ name: r.name, service: r.service_name, start: r.start_min, end: r.end_min, price: r.price }];
    for (const p of people) {
      out.push([r.date, toHHMM(p.start), toHHMM(p.end), p.name, base[0], base[1], p.service, String(p.price ?? '').replace('.', ','), base[4], base[5], r.name, r.code, r.notes]);
    }
  }
  return '﻿' + out.map((l) => l.map(cell).join(';')).join('\r\n') + '\r\n';
}
