// Avisos a Miguel cuando hay una reserva nueva, un cambio o una cancelación.
//
// Telegram (recomendado, gratis y oficial):
//   TELEGRAM_BOT_TOKEN  → el token que da @BotFather al crear el bot
//   TELEGRAM_CHAT_ID    → el número de chat de Miguel con su bot
// WhatsApp a tu propio número con CallMeBot (gratis, no oficial):
//   CALLMEBOT_PHONE     → tu número con prefijo, p. ej. +34600000000
//   CALLMEBOT_APIKEY    → la clave que te envía CallMeBot por WhatsApp
//
// Si no hay ninguno configurado, no se envía nada. Un fallo al avisar nunca
// impide guardar la reserva.

const fmtDate = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const longDate = (d) => {
  const s = fmtDate.format(new Date(`${d}T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const euros = (v) => (v ? `${String(v).replace('.', ',')} €` : '');

export function channels(env = {}) {
  const out = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) out.push('telegram');
  if (env.CALLMEBOT_PHONE && env.CALLMEBOT_APIKEY) out.push('whatsapp');
  return out;
}

/** Texto del aviso. `kind`: 'new' | 'changed' | 'cancelled' | 'test'. */
export function messageFor(kind, b = {}, { siteUrl = '' } = {}) {
  if (kind === 'test') return '✅ Aviso de prueba: así te llegarán las reservas nuevas de tu web.';
  const title = { new: '🗓️ Nueva cita', changed: '🔁 Cita cambiada', cancelled: '❌ Cita cancelada' }[kind] || 'Cita';
  const lines = [title, ''];
  if (b.party?.length > 1) {
    lines.push(`${b.party.length} personas seguidas:`);
    for (const p of b.party) lines.push(`  ${p.start} ${p.name} · ${p.service}${p.price ? ` · ${euros(p.price)}` : ''}`);
  } else {
    lines.push(`${b.name} · ${b.service}`);
  }
  lines.push(`${longDate(b.date)} · ${b.start}–${b.end}`);
  if (b.price) lines.push(`Total: ${euros(b.price)}`);
  if (b.phone) lines.push(`Tel.: ${b.phone}`);
  if (b.notes && kind !== 'cancelled') lines.push(`Notas: ${b.notes}`);
  if (b.replacedCode) lines.push(`(Sustituye a la cita ${b.replacedCode}, que queda cancelada)`);
  lines.push(`Código ${b.code}`);
  if (siteUrl) lines.push('', `Agenda: ${siteUrl.replace(/\/$/, '')}/admin`);
  return lines.join('\n');
}

/**
 * Envía el aviso por los canales configurados. Devuelve qué canales funcionaron.
 * `buttons` ([{ text, url }]) solo se muestran en Telegram, uno por fila.
 */
export async function notify(env, text, fetchImpl = fetch, { buttons = [] } = {}) {
  const jobs = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    jobs.push(
      fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          disable_web_page_preview: true,
          ...(buttons.length ? { reply_markup: { inline_keyboard: buttons.map((b) => [b]) } } : {}),
        }),
      }).then((r) => ['telegram', r.ok])
    );
  }
  if (env.CALLMEBOT_PHONE && env.CALLMEBOT_APIKEY) {
    const q = new URLSearchParams({ phone: env.CALLMEBOT_PHONE, text, apikey: env.CALLMEBOT_APIKEY });
    jobs.push(fetchImpl(`https://api.callmebot.com/whatsapp.php?${q}`).then((r) => ['whatsapp', r.ok]));
  }
  const results = await Promise.allSettled(jobs);
  return results.map((r) => (r.status === 'fulfilled' ? r.value : ['?', false]));
}
