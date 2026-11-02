import {
  $, $$, esc, api, addDays, longDate, shortDate, DAY_NAMES, prettyTime, toMin, duration,
  phoneHref, whatsappHref, prettyPhone, euros, priceValue, weekday, dow, dayNum,
} from './shared.js';
import { reminderText, waLink } from './reminder.js';

const ICON = (id) => `<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const view = $('#view');

const st = {
  overview: null,
  date: null,
};

/* ---------- utilidades ---------- */

let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('is-error', isError);
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), isError ? 5000 : 2600);
}

async function act(btn, fn, okMsg) {
  btn?.classList.add('is-loading');
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    if (e.status === 401) return showLogin();
    toast(e.message, true);
    throw e;
  } finally {
    btn?.classList.remove('is-loading');
  }
}

const today = () => st.overview.today;
const settings = () => st.overview.settings;
const hasHours = () => settings().hours.some((d) => d.length);

/* ---------- sesión ---------- */

async function start() {
  try {
    const s = await api('/api/admin/session');
    if (!s.enabled) {
      showLogin('El panel está desactivado: falta el secreto ADMIN_PASSWORD (en Cloudflare: Configuración → Variables y secretos, tipo Secreto, entorno Producción).');
      return;
    }
    if (!s.loggedIn) return showLogin();
    await loadOverview();
    showApp();
  } catch (e) {
    showLogin(e.message);
  }
}

function showLogin(msg = '') {
  $('#app').hidden = true;
  $('#login').hidden = false;
  const err = $('#login-error');
  err.hidden = !msg;
  err.innerHTML = msg ? `${ICON('info')}<span>${esc(msg)}</span>` : '';
  $('#pw').focus();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('button', e.target);
  btn.classList.add('is-loading');
  try {
    await api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value } });
    $('#pw').value = '';
    await loadOverview();
    showApp();
  } catch (err) {
    showLogin(err.message);
  } finally {
    btn.classList.remove('is-loading');
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST', body: {} }).catch(() => {});
  showLogin();
});

async function loadOverview() {
  st.overview = await api('/api/admin/overview');
  st.date ??= st.overview.today;
}

function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  route();
}

/* ---------- navegación ---------- */

const ROUTES = { agenda: renderAgenda, proximas: renderUpcoming, clientas: renderClients, horario: renderHours, servicios: renderServices, ajustes: renderSettings };

function route() {
  const tab = location.hash.slice(1).split('/')[0] || 'agenda';
  const fn = ROUTES[tab] || renderAgenda;
  $$('[data-tab]').forEach((a) => (a.getAttribute('data-tab') === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('#setup-banner').hidden = hasHours() || tab === 'horario';
  fn();
}

window.addEventListener('hashchange', () => {
  if (!$('#app').hidden) {
    route();
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
});

/* =========================================================
   Agenda del día
   ========================================================= */

/** WhatsApp con el recordatorio de la cita ya escrito (incluye su enlace para cambiarla). */
function remindHref(b) {
  const s = settings();
  const town = String(s.city || '').replace(/^\d+\s*/, '').split(',')[0].trim();
  return waLink(b.phone, reminderText(b, { today: today(), siteUrl: location.origin, address: [s.address, town].filter(Boolean).join(', ') }));
}

function apptHtml(b) {
  const cancelled = b.status !== 'confirmed';
  return `
    <li class="appt ${cancelled ? 'is-cancelled' : ''}">
      <div class="appt__time">${prettyTime(b.start)}<span>${prettyTime(b.end)}</span></div>
      <div class="appt__who">
        <strong>${esc(b.name)}${b.price ? ` <span class="appt__price">${esc(euros(b.price))}</span>` : ''}</strong>
        <span>${esc(b.service)} · ${duration(toMin(b.end) - toMin(b.start))}
          ${b.source === 'web' ? '<span class="tag tag--web">Web</span>' : '<span class="tag">Manual</span>'}
          ${cancelled ? '<span class="tag tag--off">Cancelada</span>' : ''}</span>
        ${
          b.party?.length > 1
            ? `<ol class="appt__party">${b.party
                .map((p) => `<li><b>${prettyTime(p.start)}</b> ${esc(p.name)} · <span>${esc(p.service)}${p.price ? ` · ${esc(euros(p.price))}` : ''}</span></li>`)
                .join('')}</ol>`
            : ''
        }
        ${
          b.phone
            ? `<div class="appt__links">
          <a href="${phoneHref(b.phone)}">${ICON('phone')}${esc(prettyPhone(b.phone))}</a>
          <a href="${whatsappHref(b.phone, `Hola ${b.name.split(' ')[0]}, soy Miguel de la Cruz. Te escribo por tu cita del ${shortDate(b.date)} a las ${prettyTime(b.start)}.`)}" target="_blank" rel="noopener">${ICON('chat')}WhatsApp</a>
          ${!cancelled && b.date >= today() ? `<a href="${remindHref(b)}" target="_blank" rel="noopener">${ICON('chat')}Recordar cita</a>` : ''}
        </div>`
            : ''
        }
        ${b.email ? `<span class="muted small">${esc(b.email)}</span>` : ''}
        ${(() => {
          const notes = (b.notes || '').split('\n').filter((l) => !(b.party?.length > 1 && /personas seguidas:/.test(l))).join('\n');
          return notes ? `<div class="appt__notes">${ICON('note')}<span>${esc(notes)}</span></div>` : '';
        })()}
      </div>
      <div>
        ${
          cancelled
            ? `<button class="btn btn--ghost btn--small" data-restore="${b.id}">Recuperar</button>`
            : `<button class="btn btn--danger btn--small" data-cancel="${b.id}" data-name="${esc(b.name)}">Cancelar</button>`
        }
      </div>
    </li>`;
}

function blockHtml(k) {
  const allDay = k.start === '00:00' && k.end === '24:00';
  return `
    <li class="appt is-block">
      <div class="appt__time">${allDay ? 'Todo el día' : `${prettyTime(k.start)}<span>${prettyTime(k.end)}</span>`}</div>
      <div class="appt__who"><strong>${ICON('lock')}<span class="visually-hidden">Bloqueado: </span>${esc(k.reason || 'Bloqueado')}</strong><span class="muted">No se puede reservar online</span></div>
      <div><button class="btn btn--ghost btn--small" data-unblock="${k.id}">Quitar</button></div>
    </li>`;
}

async function renderAgenda() {
  const date = st.date;
  view.innerHTML = `<div class="skeleton" style="height:48px;margin-bottom:16px"></div><div class="skeleton" style="height:240px"></div>`;
  let day;
  try {
    day = await api(`/api/admin/day?date=${date}`);
  } catch (e) {
    if (e.status === 401) return showLogin();
    view.innerHTML = `<div class="alert" role="alert">${ICON('info')}<span>${esc(e.message)}</span></div>`;
    return;
  }
  if (st.date !== date) return;

  // Huecos libres dentro del horario (entre citas y bloqueos confirmados).
  const busy = [
    ...day.bookings.filter((b) => b.status === 'confirmed').map((b) => [toMin(b.start), toMin(b.end)]),
    ...day.blocks.map((k) => [toMin(k.start), Math.min(toMin(k.end), 1440)]),
  ].sort((a, b) => a[0] - b[0]);
  const gaps = [];
  for (const [o, c] of day.open.map(([a, b]) => [toMin(a), toMin(b)])) {
    let t = o;
    for (const [b0, b1] of busy) {
      if (b1 <= t || b0 >= c) continue;
      if (b0 > t) gaps.push([t, b0]);
      t = Math.max(t, b1);
    }
    if (t < c) gaps.push([t, c]);
  }
  const hhmm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  const gapHtml = ([a, b]) => `
    <li class="gap"><span class="gap__time">${hhmm(a)}–${hhmm(b)}</span><span>Libre · ${duration(b - a)}</span>
      <button class="link-btn" data-gap="${hhmm(a).padStart(5, '0')}">${ICON('plus')}Apuntar cita</button></li>`;

  const items = [
    ...day.bookings.map((b) => ({ t: toMin(b.start), html: apptHtml(b), cancelled: b.status !== 'confirmed' })),
    ...day.blocks.map((k) => ({ t: toMin(k.start), html: blockHtml(k) })),
    ...gaps.filter(([a, b]) => b - a >= 30).map((g) => ({ t: g[0], html: gapHtml(g), gap: true })),
  ].sort((a, b) => a.t - b.t || (a.gap ? 1 : 0) - (b.gap ? 1 : 0) || (a.cancelled ? 1 : -1));
  const confirmed = day.bookings.filter((b) => b.status === 'confirmed');
  const active = confirmed.length;
  const people = confirmed.reduce((n, b) => n + Math.max(1, b.party?.length || 0), 0);
  const total = confirmed.reduce((n, b) => n + (priceValue(b.price) ?? 0), 0);
  const openTxt = day.open.length ? day.open.map(([a, b]) => `${prettyTime(a)}–${prettyTime(b)}`).join(', ') : 'Cerrado según tu horario';

  // Semana (lunes a domingo) del día que se ve.
  const monday = addDays(date, -weekday(date));
  let week = [];
  try {
    week = (await api(`/api/admin/range?from=${monday}&n=7`)).days;
  } catch {
    /* la tira de la semana es opcional */
  }
  if (st.date !== date) return;
  const weekHtml = week.length
    ? `<nav class="week" aria-label="Semana">${week
        .map(
          (d) => `<button type="button" class="week__day${d.date === date ? ' is-on' : ''}${d.date === today() ? ' is-today' : ''}" data-goto-day="${d.date}" aria-pressed="${d.date === date}">
          <span class="week__dow">${dow(d.date)}</span><span class="week__num">${dayNum(d.date)}</span>
          <span class="week__count">${d.count ? `${d.count} ${d.count === 1 ? 'cita' : 'citas'}` : '—'}</span></button>`
        )
        .join('')}</nav>`
    : '';

  const services = st.overview.services;
  view.innerHTML = `
    <div class="view-head">
      <div>
        <div class="day-title">${date === today() ? 'Hoy, ' : ''}${longDate(date)}</div>
        <div class="day-stats">
          <span><b>${active}</b> ${active === 1 ? 'cita' : 'citas'}</span>
          ${people > active ? `<span><b>${people}</b> personas</span>` : ''}
          ${total ? `<span><b>${euros(String(total))}</b> previstos</span>` : ''}
          <span class="muted">${openTxt}</span>
        </div>
      </div>
      <div class="daynav">
        <button class="icon-btn" data-day="-1" aria-label="Día anterior">${ICON('back')}</button>
        <button class="btn btn--ghost btn--small" data-day="0" ${date === today() ? 'disabled' : ''}>Hoy</button>
        <button class="icon-btn" data-day="1" aria-label="Día siguiente">${ICON('next')}</button>
        <label class="visually-hidden" for="pick-date">Ir a la fecha</label>
        <input type="date" id="pick-date" value="${date}">
      </div>
    </div>
    ${weekHtml}
    <div class="agenda-grid">
      <section aria-label="Citas del día">
        ${items.length ? `<ul class="timeline">${items.map((i) => i.html).join('')}</ul>` : `<div class="empty">No hay citas este día.</div>`}
      </section>
      <div class="side-forms">
        <details class="card" ${items.length ? '' : 'open'}>
          <summary>${ICON('plus')}Nueva cita</summary>
          <form class="form" id="new-appt">
            <div class="field"><label for="na-svc">Servicio</label>
              <select class="select" id="na-svc" name="serviceId" required>
                ${services.map((s) => `<option value="${s.id}" data-dur="${s.duration}">${esc(s.name)} · ${duration(s.duration)}</option>`).join('')}
              </select></div>
            <div class="row">
              <div class="field"><label for="na-time">Hora</label><input class="input" type="time" id="na-time" name="time" step="300" required></div>
              <div class="field"><label for="na-dur">Minutos</label><input class="input" type="number" id="na-dur" name="duration" min="10" max="600" step="5" value="${services[0]?.duration ?? 60}"></div>
            </div>
            <div class="field"><label for="na-name">Nombre</label><input class="input" id="na-name" name="name" required></div>
            <div class="field"><label for="na-phone">Teléfono <span class="muted">(opcional)</span></label><input class="input" id="na-phone" name="phone" type="tel"></div>
            <div class="field"><label for="na-notes">Notas</label><textarea class="textarea" id="na-notes" name="notes" rows="2"></textarea></div>
            <button class="btn btn--block" type="submit">Guardar cita</button>
          </form>
        </details>
        <details class="card">
          <summary>${ICON('lock')}Bloquear horas</summary>
          <form class="form" id="new-block">
            <label class="check"><input type="checkbox" name="allDay"> Todo el día</label>
            <div class="row" data-times>
              <div class="field"><label for="nb-start">Desde</label><input class="input" type="time" id="nb-start" name="start"></div>
              <div class="field"><label for="nb-end">Hasta</label><input class="input" type="time" id="nb-end" name="end"></div>
            </div>
            <div class="field"><label for="nb-days">Durante</label>
              <select class="select" id="nb-days" name="days">
                <option value="1">Solo este día</option>
                ${[2, 3, 4, 5, 6, 7, 10, 14, 21, 30].map((n) => `<option value="${n}">${n} días seguidos</option>`).join('')}
              </select></div>
            <div class="field"><label for="nb-reason">Motivo <span class="muted">(solo lo ves tú)</span></label><input class="input" id="nb-reason" name="reason" placeholder="Vacaciones, médico…"></div>
            <button class="btn btn--block" type="submit">Bloquear</button>
          </form>
        </details>
      </div>
    </div>`;

  $$('[data-day]', view).forEach((b) =>
    b.addEventListener('click', () => {
      const d = Number(b.dataset.day);
      st.date = d === 0 ? today() : addDays(st.date, d);
      renderAgenda();
    })
  );
  $$('[data-goto-day]', view).forEach((b) =>
    b.addEventListener('click', () => {
      st.date = b.dataset.gotoDay;
      renderAgenda();
    })
  );
  // "Apuntar cita" en un hueco libre: abre el formulario con esa hora.
  $$('[data-gap]', view).forEach((b) =>
    b.addEventListener('click', () => {
      const box = $('#new-appt').closest('details');
      box.open = true;
      $('#na-time').value = b.dataset.gap;
      box.scrollIntoView({ block: 'start', behavior: 'smooth' });
      $('#na-name').focus({ preventScroll: true });
    })
  );
  $('#pick-date').addEventListener('change', (e) => {
    if (e.target.value) {
      st.date = e.target.value;
      renderAgenda();
    }
  });
  $$('[data-cancel]', view).forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm(`¿Cancelar la cita de ${b.dataset.name}? El hueco quedará libre en la web.`)) return;
      await act(b, () => api(`/api/admin/bookings/${b.dataset.cancel}/cancel`, { method: 'POST', body: {} }), 'Cita cancelada');
      renderAgenda();
    })
  );
  $$('[data-restore]', view).forEach((b) =>
    b.addEventListener('click', async () => {
      await act(b, () => api(`/api/admin/bookings/${b.dataset.restore}/restore`, { method: 'POST', body: {} }), 'Cita recuperada');
      renderAgenda();
    })
  );
  $$('[data-unblock]', view).forEach((b) =>
    b.addEventListener('click', async () => {
      await act(b, () => api(`/api/admin/blocks/${b.dataset.unblock}`, { method: 'DELETE' }), 'Bloqueo quitado');
      renderAgenda();
    })
  );

  const na = $('#new-appt');
  na.serviceId.addEventListener('change', () => {
    na.duration.value = na.serviceId.selectedOptions[0].dataset.dur;
  });
  na.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      serviceId: Number(na.serviceId.value),
      date: st.date,
      time: na.time.value,
      duration: Number(na.duration.value),
      name: na.name.value,
      phone: na.phone.value,
      notes: na.notes.value,
    };
    const btn = $('button[type=submit]', na);
    try {
      await act(btn, () => api('/api/admin/bookings', { method: 'POST', body }), 'Cita guardada');
    } catch (err) {
      if (err.status === 409 && confirm(`${err.message}\n\n¿Guardarla igualmente?`)) {
        await act(btn, () => api('/api/admin/bookings', { method: 'POST', body: { ...body, force: true } }), 'Cita guardada');
      } else return;
    }
    renderAgenda();
  });

  const nb = $('#new-block');
  nb.allDay.addEventListener('change', () => ($('[data-times]', nb).hidden = nb.allDay.checked));
  nb.addEventListener('submit', async (e) => {
    e.preventDefault();
    await act(
      $('button[type=submit]', nb),
      () =>
        api('/api/admin/blocks', {
          method: 'POST',
          body: { date: st.date, allDay: nb.allDay.checked, start: nb.start.value, end: nb.end.value, days: Number(nb.days.value), reason: nb.reason.value },
        }),
      'Horas bloqueadas'
    );
    renderAgenda();
  });
}

/* =========================================================
   Próximas citas
   ========================================================= */

async function renderUpcoming() {
  view.innerHTML = `<div class="skeleton" style="height:240px"></div>`;
  let data;
  try {
    data = await api('/api/admin/upcoming');
  } catch (e) {
    if (e.status === 401) return showLogin();
    view.innerHTML = `<div class="alert">${esc(e.message)}</div>`;
    return;
  }
  const byDay = new Map();
  for (const b of data.bookings) {
    if (!byDay.has(b.date)) byDay.set(b.date, []);
    byDay.get(b.date).push(b);
  }
  view.innerHTML = `
    <div class="view-head"><h1>Próximas citas</h1><span class="muted">${data.bookings.length} ${data.bookings.length === 1 ? 'cita confirmada' : 'citas confirmadas'} desde hoy</span></div>
    <p class="export-row"><a class="btn btn--ghost btn--small" href="/api/admin/export.csv" download>${ICON('download')}Descargar todas las citas (Excel)</a><span class="muted small">Las citas de hace más de un año se borran solas.</span></p>
    ${
      byDay.size
        ? [...byDay.entries()]
            .map(
              ([d, list]) => `
      <section class="up-day">
        <h2><a href="#agenda" data-goto="${d}">${d === today() ? 'Hoy, ' : ''}${longDate(d)}</a> <span class="muted">· ${list.length} ${list.length === 1 ? 'cita' : 'citas'}${(() => {
          const t = list.reduce((n, b) => n + (priceValue(b.price) ?? 0), 0);
          return t ? ` · ${euros(String(t))}` : '';
        })()}</span></h2>
        <ul class="timeline">${list.map(apptHtml).join('')}</ul>
      </section>`
            )
            .join('')
        : `<div class="empty">Todavía no hay citas próximas.</div>`
    }`;
  $$('[data-goto]', view).forEach((a) => a.addEventListener('click', () => (st.date = a.dataset.goto)));
  $$('[data-cancel]', view).forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm(`¿Cancelar la cita de ${b.dataset.name}?`)) return;
      await act(b, () => api(`/api/admin/bookings/${b.dataset.cancel}/cancel`, { method: 'POST', body: {} }), 'Cita cancelada');
      renderUpcoming();
    })
  );
}

/* =========================================================
   Clientas
   ========================================================= */

const visitsText = (n) => `${n} ${n === 1 ? 'visita' : 'visitas'}`;

function clientLine(c) {
  const bits = [c.visits ? visitsText(c.visits) : 'Aún no ha venido'];
  if (c.nextDate) bits.push(`próxima: ${shortDate(c.nextDate)}`);
  else if (c.lastVisit) bits.push(`última: ${shortDate(c.lastVisit)}`);
  return `
    <li><a class="client" href="#clientas/${encodeURIComponent(c.key)}">
      <span class="client__name">${esc(c.name)}</span>
      <span class="client__meta">${c.phone ? `${esc(prettyPhone(c.phone))} · ` : ''}${bits.join(' · ')}</span>
      ${c.nextDate ? '<span class="tag tag--web">Tiene cita</span>' : ''}
    </a></li>`;
}

async function renderClients() {
  const key = decodeURIComponent(location.hash.split('/')[1] || '');
  if (key) return renderClient(key);
  const q = st.clientQuery || '';
  view.innerHTML = `
    <div class="view-head"><h1>Clientas</h1><span class="muted" data-client-count></span></div>
    <div class="field client-search">
      <label for="client-q" class="visually-hidden">Buscar clienta</label>
      ${ICON('search')}
      <input class="input" id="client-q" type="search" placeholder="Busca por nombre o teléfono" value="${esc(q)}" autocomplete="off">
    </div>
    <div data-client-list><div class="skeleton" style="height:200px"></div></div>`;
  const input = $('#client-q');
  let timer;
  let seq = 0;
  const load = async () => {
    const mine = ++seq;
    st.clientQuery = input.value.trim();
    let data;
    try {
      data = await api(`/api/admin/clients?q=${encodeURIComponent(st.clientQuery)}`);
    } catch (e) {
      if (e.status === 401) return showLogin();
      $('[data-client-list]').innerHTML = `<div class="alert">${esc(e.message)}</div>`;
      return;
    }
    if (mine !== seq) return;
    $('[data-client-count]').textContent = st.clientQuery ? `${data.total} ${data.total === 1 ? 'resultado' : 'resultados'}` : `${data.total} en total`;
    $('[data-client-list]').innerHTML = data.clients.length
      ? `<ul class="clients">${data.clients.map(clientLine).join('')}</ul>${data.total > data.clients.length ? `<p class="muted small">Se muestran ${data.clients.length}. Escribe para afinar la búsqueda.</p>` : ''}`
      : `<div class="empty">${st.clientQuery ? 'No encuentro a nadie con ese nombre o teléfono.' : 'Aquí aparecerán tus clientas cuando tengas citas.'}</div>`;
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(load, 200);
  });
  load();
}

async function renderClient(key) {
  view.innerHTML = `<div class="skeleton" style="height:240px"></div>`;
  let data;
  try {
    data = await api(`/api/admin/clients/${encodeURIComponent(key)}`);
  } catch (e) {
    if (e.status === 401) return showLogin();
    view.innerHTML = `<a class="back-link" href="#clientas">${ICON('back')}Clientas</a><div class="alert">${esc(e.message)}</div>`;
    return;
  }
  const { client: c, bookings } = data;
  const next = bookings.filter((b) => b.status === 'confirmed' && b.date >= today()).reverse();
  const past = bookings.filter((b) => !(b.status === 'confirmed' && b.date >= today()));
  const first = c.name.split(' ')[0];
  view.innerHTML = `
    <a class="back-link" href="#clientas">${ICON('back')}Clientas</a>
    <div class="view-head"><h1>${esc(c.name)}</h1></div>
    <div class="client-card card">
      ${
        c.phone
          ? `<div class="appt__links">
        <a href="${phoneHref(c.phone)}">${ICON('phone')}${esc(prettyPhone(c.phone))}</a>
        <a href="${whatsappHref(c.phone, `Hola ${first}, soy Miguel de la Cruz.`)}" target="_blank" rel="noopener">${ICON('chat')}WhatsApp</a>
      </div>`
          : '<span class="muted">Sin teléfono</span>'
      }
      ${c.email ? `<span class="muted small">${esc(c.email)}</span>` : ''}
      <dl class="client-stats">
        <div><dt>Visitas</dt><dd>${c.visits}</dd></div>
        <div><dt>Gastado</dt><dd>${c.spent ? esc(euros(String(c.spent))) : '—'}</dd></div>
        <div><dt>Última visita</dt><dd>${c.lastVisit ? esc(shortDate(c.lastVisit)) : '—'}</dd></div>
        <div><dt>Canceladas</dt><dd>${c.cancelled}</dd></div>
      </dl>
    </div>
    ${next.length ? `<section class="up-day"><h2>Próximas citas</h2><ul class="timeline">${next.map(historyItem).join('')}</ul></section>` : ''}
    <section class="up-day"><h2>Historial</h2>${past.length ? `<ul class="timeline">${past.map(historyItem).join('')}</ul>` : '<div class="empty">Todavía no tiene citas pasadas.</div>'}</section>`;
  $$('[data-cancel]', view).forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm(`¿Cancelar la cita de ${b.dataset.name}?`)) return;
      await act(b, () => api(`/api/admin/bookings/${b.dataset.cancel}/cancel`, { method: 'POST', body: {} }), 'Cita cancelada');
      renderClient(key);
    })
  );
  $$('[data-restore]', view).forEach((b) =>
    b.addEventListener('click', async () => {
      await act(b, () => api(`/api/admin/bookings/${b.dataset.restore}/restore`, { method: 'POST', body: {} }), 'Cita recuperada');
      renderClient(key);
    })
  );
}

/** Cita en la ficha: la fecha delante, sin repetir teléfono ni nombre. */
function historyItem(b) {
  const html = apptHtml({ ...b, phone: '', email: '' });
  return html.replace('<div class="appt__time">', `<div class="appt__time"><b class="appt__date">${esc(shortDate(b.date))}</b>`);
}

/* =========================================================
   Horario
   ========================================================= */

function renderHours() {
  const hours = structuredClone(settings().hours);
  const draw = () => {
    view.innerHTML = `
      <div class="view-head"><h1>Horario de apertura</h1></div>
      <p class="muted" style="margin:-8px 0 16px">Solo se pueden reservar horas dentro de este horario. Para días sueltos (vacaciones, festivos) usa <a href="#agenda">Bloquear horas</a> en la agenda.</p>
      <div class="hours-edit">
        ${DAY_NAMES.map(
          (name, i) => `
          <div class="hrow">
            <label class="check"><input type="checkbox" data-open="${i}" ${hours[i].length ? 'checked' : ''}> <strong>${name}</strong></label>
            <div class="hrow__ranges">
              ${
                hours[i].length
                  ? hours[i]
                      .map(
                        ([a, b], j) => `
                <div class="range">
                  <input type="time" aria-label="${name}, tramo ${j + 1}, apertura" data-d="${i}" data-r="${j}" data-k="0" value="${a}">
                  <span>a</span>
                  <input type="time" aria-label="${name}, tramo ${j + 1}, cierre" data-d="${i}" data-r="${j}" data-k="1" value="${b}">
                  <button class="icon-btn" data-del="${i}:${j}" aria-label="Quitar tramo">${ICON('trash')}</button>
                </div>`
                      )
                      .join('')
                  : '<span class="muted">Cerrado</span>'
              }
              ${hours[i].length ? `<div class="hrow__tools"><button class="link-btn" data-add="${i}">${ICON('plus')}Añadir tramo</button>${i < 5 ? `<button class="link-btn" data-copy-weekdays="${i}">Copiar de lunes a viernes</button>` : ''}</div>` : ''}
            </div>
          </div>`
        ).join('')}
      </div>
      <div class="savebar"><button class="btn" id="save-hours">Guardar horario</button></div>`;

    $$('[data-open]', view).forEach((c) =>
      c.addEventListener('change', () => {
        const i = Number(c.dataset.open);
        hours[i] = c.checked ? [['09:00', '14:00']] : [];
        draw();
      })
    );
    $$('input[type=time]', view).forEach((inp) =>
      inp.addEventListener('change', () => {
        hours[inp.dataset.d][inp.dataset.r][inp.dataset.k] = inp.value;
      })
    );
    $$('[data-copy-weekdays]', view).forEach((b) =>
      b.addEventListener('click', () => {
        const src = hours[Number(b.dataset.copyWeekdays)];
        for (let d = 0; d < 5; d++) hours[d] = structuredClone(src);
        draw();
        toast('Copiado de lunes a viernes. Recuerda guardar.');
      })
    );
    $$('[data-add]', view).forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.dataset.add);
        const last = hours[i][hours[i].length - 1];
        hours[i].push([last ? last[1] : '16:00', '20:00']);
        draw();
      })
    );
    $$('[data-del]', view).forEach((b) =>
      b.addEventListener('click', () => {
        const [i, j] = b.dataset.del.split(':').map(Number);
        hours[i].splice(j, 1);
        draw();
      })
    );
    $('#save-hours').addEventListener('click', async (e) => {
      const r = await act(e.currentTarget, () => api('/api/admin/settings', { method: 'PUT', body: { hours } }), 'Horario guardado');
      if (r) {
        st.overview.settings = r.settings;
        $('#setup-banner').hidden = true;
      }
    });
  };
  draw();
}

/* =========================================================
   Servicios
   ========================================================= */

function serviceForm(s = {}) {
  const id = s.id ?? 'new';
  return `
    <form class="card svc-edit ${s.active === false ? 'is-off' : ''}" data-svc="${id}">
      <div class="row3">
        <div class="field"><label for="s-name-${id}">Nombre</label><input class="input" id="s-name-${id}" name="name" required value="${esc(s.name ?? '')}"></div>
        <div class="field"><label for="s-cat-${id}">Categoría</label><input class="input" id="s-cat-${id}" name="category" list="cats" value="${esc(s.category ?? '')}"></div>
        <div class="field"><label for="s-dur-${id}">Minutos</label><input class="input" id="s-dur-${id}" name="duration" type="number" min="10" max="600" step="5" required value="${s.duration ?? 60}"></div>
        <div class="field"><label for="s-price-${id}">Precio (€)</label><input class="input" id="s-price-${id}" name="price" inputmode="decimal" placeholder="Ej.: 50" value="${esc(s.price ?? '')}"></div>
      </div>
      <div class="field"><label for="s-desc-${id}">Descripción</label><input class="input" id="s-desc-${id}" name="description" value="${esc(s.description ?? '')}"></div>
      <div class="actions">
        <label class="check"><input type="checkbox" name="active" ${s.active === false ? '' : 'checked'}> Visible en la web</label>
        <div style="display:flex;gap:8px">
          ${s.id ? `<button type="button" class="btn btn--danger btn--small" data-del-svc="${s.id}">${ICON('trash')}Borrar</button>` : ''}
          <button class="btn btn--small" type="submit">${s.id ? 'Guardar' : 'Añadir servicio'}</button>
        </div>
      </div>
    </form>`;
}

function renderServices() {
  const services = st.overview.services;
  const cats = [...new Set(services.map((s) => s.category).filter(Boolean))];
  view.innerHTML = `
    <div class="view-head"><h1>Servicios</h1></div>
    <p class="muted" style="margin:-8px 0 16px">La duración decide cuánto hueco ocupa cada cita. El precio va en euros (escribe solo el número, por ejemplo 50). Si lo dejas vacío no se muestra.</p>
    <datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <ol class="svc-items">${services
      .map(
        (sv, i) => `
      <li><details class="svc-item${sv.active ? '' : ' is-off'}">
        <summary>
          <span class="svc-item__main"><strong>${esc(sv.name)}</strong>
            <span class="muted">${esc(sv.category || 'Sin categoría')} · ${duration(sv.duration)}${sv.active ? '' : ' · <span class="tag">Oculto</span>'}</span></span>
          <span class="svc-item__price">${sv.price ? esc(euros(sv.price)) : '<span class="muted">Sin precio</span>'}</span>
          <span class="svc-item__move">
            <button type="button" class="icon-btn" data-move="-1" data-id="${sv.id}" aria-label="Subir ${esc(sv.name)}" ${i === 0 ? 'disabled' : ''}>${ICON('up')}</button>
            <button type="button" class="icon-btn" data-move="1" data-id="${sv.id}" aria-label="Bajar ${esc(sv.name)}" ${i === services.length - 1 ? 'disabled' : ''}>${ICON('down')}</button>
          </span>
          <span class="svc-item__edit">Editar</span>
        </summary>
        ${serviceForm(sv)}
      </details></li>`
      )
      .join('')}</ol>
    <details class="svc-item svc-item--new">
      <summary><span class="svc-item__main"><strong>${ICON('plus')} Nuevo servicio</strong></span></summary>
      ${serviceForm()}
    </details>`;

  $$('[data-move]', view).forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      const list = [...st.overview.services];
      const i = list.findIndex((x) => x.id === Number(b.dataset.id));
      const j = i + Number(b.dataset.move);
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      await act(b, () => Promise.all(list.map((x, k) => (x.sort === k ? null : api(`/api/admin/services/${x.id}`, { method: 'PUT', body: { sort: k } })))), 'Orden guardado').catch(() => null);
      await loadOverview();
      renderServices();
    })
  );

  $$('form[data-svc]', view).forEach((f) =>
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = f.dataset.svc;
      const body = {
        name: f.name.value,
        category: f.category.value,
        duration: Number(f.duration.value),
        price: f.price.value,
        description: f.description.value,
        active: f.active.checked,
      };
      const isNew = id === 'new';
      const r = await act(
        $('button[type=submit]', f),
        () => api(isNew ? '/api/admin/services' : `/api/admin/services/${id}`, { method: isNew ? 'POST' : 'PUT', body }),
        isNew ? 'Servicio añadido' : 'Servicio guardado'
      ).catch(() => null);
      if (r) {
        await loadOverview();
        if (isNew) renderServices();
        else f.classList.toggle('is-off', !r.active);
      }
    })
  );
  $$('[data-del-svc]', view).forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('¿Borrar este servicio? Las citas ya reservadas se mantienen.')) return;
      await act(b, () => api(`/api/admin/services/${b.dataset.delSvc}`, { method: 'DELETE' }), 'Servicio borrado');
      await loadOverview();
      renderServices();
    })
  );
}

/* =========================================================
   Ajustes
   ========================================================= */

function renderSettings() {
  const s = settings();
  view.innerHTML = `
    <div class="view-head"><h1>Ajustes</h1></div>
    <form class="stack" id="settings-form">
      <div class="card form">
        <h2 style="font-size:1.0625rem">Contacto que se muestra en la web</h2>
        <div class="row">
          <div class="field"><label for="st-phone">Teléfono</label><input class="input" id="st-phone" name="phone" type="tel" value="${esc(s.phone)}"></div>
          <div class="field"><label for="st-wa">WhatsApp</label><input class="input" id="st-wa" name="whatsapp" type="tel" value="${esc(s.whatsapp)}"></div>
        </div>
        <div class="row">
          <div class="field"><label for="st-email">Correo</label><input class="input" id="st-email" name="email" type="email" value="${esc(s.email)}"></div>
          <div class="field"><label for="st-ig">Instagram</label><input class="input" id="st-ig" name="instagram" value="${esc(s.instagram)}"></div>
        </div>
      </div>
      <div class="card form">
        <h2 style="font-size:1.0625rem">Reservas online</h2>
        <div class="row">
          <div class="field"><label for="st-notice">Antelación mínima</label>
            <select class="select" id="st-notice" name="minNoticeMinutes">
              ${[[0, 'Sin mínimo'], [60, '1 hora'], [120, '2 horas'], [240, '4 horas'], [720, '12 horas'], [1440, '1 día'], [2880, '2 días']]
                .map(([v, l]) => `<option value="${v}" ${s.minNoticeMinutes === v ? 'selected' : ''}>${l}</option>`)
                .join('')}
            </select></div>
          <div class="field"><label for="st-max">Se puede reservar hasta</label>
            <select class="select" id="st-max" name="maxDaysAhead">
              ${[[14, '2 semanas'], [30, '1 mes'], [60, '2 meses'], [90, '3 meses'], [120, '4 meses'], [180, '6 meses'], [365, '1 año']]
                .map(([v, l]) => `<option value="${v}" ${s.maxDaysAhead === v ? 'selected' : ''}>${l} vista</option>`)
                .join('')}
            </select>
            <span class="hint">Siempre se puede reservar, como mínimo, hasta el 19 de marzo de las próximas Fallas.</span></div>
        </div>
        <div class="field"><label for="st-step">Ofrecer horas cada</label>
          <select class="select" id="st-step" name="slotStep">
            ${[10, 15, 20, 30, 60].map((v) => `<option value="${v}" ${s.slotStep === v ? 'selected' : ''}>${v} minutos</option>`).join('')}
          </select></div>
        <div class="field"><label for="st-note">Aviso al elegir hora <span class="muted">(opcional)</span></label>
          <input class="input" id="st-note" name="bookingNote" maxlength="400" value="${esc(s.bookingNote)}" placeholder="Por ejemplo: para Fallas, reserva con tiempo.">
        </div>
      </div>
      <div class="card form">
        <h2 style="font-size:1.0625rem">Datos legales</h2>
        <p class="muted small">Salen en el aviso legal y en la política de privacidad de la web (la ley obliga a mostrarlos).</p>
        <div class="row">
          <div class="field"><label for="st-legal">Nombre y apellidos del titular</label><input class="input" id="st-legal" name="legalName" value="${esc(s.legalName)}" autocomplete="name"></div>
          <div class="field"><label for="st-nif">NIF / DNI</label><input class="input" id="st-nif" name="nif" value="${esc(s.nif)}" maxlength="20"></div>
        </div>
        <p class="muted small">El correo de arriba se usa como contacto para temas de privacidad.</p>
      </div>
      <div class="savebar"><button class="btn" type="submit">Guardar ajustes</button></div>
    </form>
    <section class="card form notify-card" aria-labelledby="notify-h">
      <h2 id="notify-h" style="font-size:1.0625rem">Avisos de reservas nuevas</h2>
      <p class="notify-status" data-notify-status><span class="skeleton" style="display:block;height:20px;width:60%"></span></p>
      <details class="notify-help">
        <summary>Cómo activar los avisos por Telegram (recomendado)</summary>
        <ol>
          <li>En Telegram, abre <b>@BotFather</b>, escribe <code>/newbot</code> y sigue los pasos. Te dará un <b>token</b>.</li>
          <li>Abre el chat con tu bot nuevo y envíale cualquier mensaje (por ejemplo «hola»).</li>
          <li>Abre en el navegador <code>https://api.telegram.org/bot&lt;TU_TOKEN&gt;/getUpdates</code> y copia el número que aparece en <code>"chat":{"id": …}</code>.</li>
          <li>En Cloudflare → tu Worker → Configuración → Variables y secretos, añade dos <b>Secretos</b>: <code>TELEGRAM_BOT_TOKEN</code> (el token) y <code>TELEGRAM_CHAT_ID</code> (el número). Implementa.</li>
          <li>Vuelve aquí y pulsa «Enviar aviso de prueba».</li>
        </ol>
      </details>
      <details class="notify-help">
        <summary>Cómo activarlos por WhatsApp (CallMeBot, no oficial)</summary>
        <ol>
          <li>Guarda el número de CallMeBot que indica su web (callmebot.com → WhatsApp) y envíale por WhatsApp: <code>I allow callmebot to send me messages</code>.</li>
          <li>Te responderá con tu <b>apikey</b>.</li>
          <li>En Cloudflare añade los <b>Secretos</b> <code>CALLMEBOT_PHONE</code> (tu número con +34) y <code>CALLMEBOT_APIKEY</code>. Implementa.</li>
        </ol>
        <p class="muted small">Es un servicio gratuito de terceros: puede tardar o fallar alguna vez. Telegram es más fiable.</p>
      </details>
      <div><button type="button" class="btn btn--ghost" data-notify-test disabled>Enviar aviso de prueba</button></div>
      <hr class="notify-sep">
      <h3 style="font-size:1rem">Resumen de mañana</h3>
      <label class="check"><input type="checkbox" data-daily ${s.dailySummary === false ? '' : 'checked'}> Mandarme cada tarde las citas del día siguiente</label>
      <p class="muted small">Llega sobre las 18:00 (las 19:00 en horario de verano), solo los días antes de que tengas citas.</p>
      <div><button type="button" class="btn btn--ghost" data-summary-test disabled>Enviarme el resumen de mañana ahora</button></div>
    </section>
    <form hidden>
    </form>`;

  // Estado de los avisos
  api('/api/admin/notify')
    .then(({ channels }) => {
      const names = { telegram: 'Telegram', whatsapp: 'WhatsApp' };
      $('[data-notify-status]').innerHTML = channels.length
        ? `${ICON('check')}<span>Activos: <b>${channels.map((c) => names[c] || c).join(' y ')}</b>. Te aviso de cada reserva nueva, cambio y cancelación.</span>`
        : `${ICON('info')}<span>Todavía no están activados. Sigue los pasos de abajo (se hace una sola vez).</span>`;
      $('[data-notify-test]').disabled = !channels.length;
      $('[data-summary-test]').disabled = !channels.length;
    })
    .catch(() => ($('[data-notify-status]').textContent = 'No se ha podido comprobar el estado de los avisos.'));
  $('[data-notify-test]').addEventListener('click', async (e) => {
    const r = await act(e.currentTarget, () => api('/api/admin/notify-test', { method: 'POST', body: {} })).catch(() => null);
    if (!r) return;
    const bad = Object.entries(r.results).filter(([, ok]) => !ok).map(([k]) => k);
    toast(bad.length ? `No se ha podido enviar por: ${bad.join(', ')}. Revisa los secretos.` : '¡Aviso enviado! Mira tu móvil.', !!bad.length);
  });

  $('[data-daily]').addEventListener('change', async (e) => {
    const on = e.currentTarget.checked;
    try {
      await api('/api/admin/settings', { method: 'PUT', body: { dailySummary: on } });
      toast(on ? 'Te mandaré el resumen cada tarde.' : 'Resumen diario desactivado.');
    } catch {
      e.currentTarget.checked = !on;
      toast('No se ha podido guardar. Inténtalo otra vez.', true);
    }
  });
  $('[data-summary-test]').addEventListener('click', async (e) => {
    const r = await act(e.currentTarget, () => api('/api/admin/summary-test', { method: 'POST', body: {} })).catch(() => null);
    if (!r) return;
    const bad = Object.entries(r.results || {}).filter(([, ok]) => !ok).map(([k]) => k);
    toast(bad.length ? `No se ha podido enviar por: ${bad.join(', ')}.` : '¡Resumen enviado! Mira tu móvil.', !!bad.length);
  });

  const f = $('#settings-form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      phone: f.phone.value,
      whatsapp: f.whatsapp.value,
      email: f.email.value,
      instagram: f.instagram.value.replace(/^@/, ''),
      minNoticeMinutes: Number(f.minNoticeMinutes.value),
      maxDaysAhead: Number(f.maxDaysAhead.value),
      slotStep: Number(f.slotStep.value),
      bookingNote: f.bookingNote.value,
      legalName: f.legalName.value,
      nif: f.nif.value,
    };
    const r = await act($('button[type=submit]', f), () => api('/api/admin/settings', { method: 'PUT', body }), 'Ajustes guardados').catch(() => null);
    if (r) st.overview.settings = r.settings;
  });
}

start();
