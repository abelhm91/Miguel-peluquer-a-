// Texto del recordatorio que Miguel manda por WhatsApp a la clienta el día antes.
// Lo usan el panel (navegador) y el resumen diario de Telegram (servidor).

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «mañana martes 3» si es el día siguiente a `today`; si no, «el martes 3». */
function whenText(date, today) {
  const d = new Date(`${date}T00:00:00Z`);
  const label = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
  if (today) {
    const t = new Date(`${today}T00:00:00Z`);
    const diff = Math.round((d - t) / 86400000);
    if (diff === 0) return `hoy ${label}`;
    if (diff === 1) return `mañana ${label}`;
  }
  return `el ${label}`;
}

const hhmm = (s) => String(s).replace(/^0(\d)/, '$1');

/**
 * b: { name, date, start, code, token, party? }  ·  opts: { today, siteUrl, address }
 */
export function reminderText(b, { today = '', siteUrl = '', address = 'Calle del Cid, 12, Paterna' } = {}) {
  const first = String(b.name || '').trim().split(/\s+/)[0] || '';
  const group = Array.isArray(b.party) && b.party.length > 1 ? ` (${b.party.length} personas)` : '';
  const lines = [
    `Hola${first ? ` ${first}` : ''}, soy Miguel de la Cruz. Te recuerdo tu cita ${whenText(b.date, today)} a las ${hhmm(b.start)}${group} en ${address}.`,
  ];
  if (siteUrl && b.code && b.token) {
    lines.push(`Si no puedes venir, cámbiala o cancélala aquí: ${siteUrl.replace(/\/$/, '')}/cita?c=${b.code}&t=${encodeURIComponent(b.token)}`);
  }
  lines.push('¡Hasta pronto!');
  return lines.join('\n');
}

/** Enlace de WhatsApp con el texto ya escrito (números españoles de 9 cifras → +34). */
export function waLink(phone, text) {
  let n = String(phone || '').replace(/\D/g, '');
  if (n.length === 9) n = `34${n}`;
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : '';
}
