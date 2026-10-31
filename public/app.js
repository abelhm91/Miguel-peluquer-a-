import {
  $, $$, esc, api, addDays, daysBetween, weekday, longDate, fullDate, shortDate, monthLabel, dow, dayNum,
  DAY_NAMES, toMin, prettyTime, prettyMin, duration, phoneHref, whatsappHref, prettyPhone, icsFor, store, partyRows,
} from './shared.js';

const ICON = (id) => `<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const ADDRESS = 'Calle del Cid, 12, bajo, 46980 Paterna, Valencia';
const WINDOW = 14;

const state = {
  info: null,
  services: [],
  serviceId: null,
  step: 'service',
  winStart: null,
  days: [],
  daysLoading: false,
  date: null,
  slots: null,
  slotsLoading: false,
  time: null,
  form: { name: '', phone: '', email: '', notes: '' },
  error: '',
  submitting: false,
  result: null,
  allTimes: false,
  extra: [], // demás personas: [{ serviceId, name }]
};

const MAX_PEOPLE = 4;
const svcById = (id) => state.services.find((x) => x.id === Number(id));
const peopleCount = () => 1 + state.extra.length;
const totalMin = () => (service()?.duration ?? 0) + state.extra.reduce((n, e) => n + (svcById(e.serviceId)?.duration ?? 0), 0);
const extraParam = () => (state.extra.length ? `&extra=${state.extra.map((e) => e.serviceId).join(',')}` : '');
/** "Peinado de fallera · 2 personas" o "Peinado de fallera + Trenzas" */
function groupLabel() {
  const s = service();
  if (!s) return '';
  if (!state.extra.length) return s.name;
  const names = [...new Set([s.name, ...state.extra.map((e) => svcById(e.serviceId)?.name)])];
  return names.length === 1 ? `${s.name} · ${peopleCount()} personas` : names.join(' + ');
}

/* Reserva en curso: sobrevive a una recarga o a cambiar de app (solo en esta pestaña). */
const FLOW_KEY = 'pentinats:flujo';
function saveFlow() {
  try {
    if (!dlg.open || state.step === 'done') sessionStorage.removeItem(FLOW_KEY);
    else sessionStorage.setItem(FLOW_KEY, JSON.stringify({ serviceId: state.serviceId, step: state.step, winStart: state.winStart, date: state.date, time: state.time, extra: state.extra }));
  } catch {
    /* almacenamiento no disponible */
  }
}
function readFlow() {
  try {
    return JSON.parse(sessionStorage.getItem(FLOW_KEY) || 'null');
  } catch {
    return null;
  }
}

const service = () => state.services.find((s) => s.id === state.serviceId);
const settings = () => state.info.settings;

/* =========================================================
   Página
   ========================================================= */

async function boot() {
  try {
    state.info = await api('/api/info');
  } catch (e) {
    $('#services').innerHTML = `<div class="alert" role="alert">${ICON('info')}<span>No se han podido cargar los servicios. ${esc(e.message)}</span></div>`;
    return;
  }
  state.services = state.info.services;
  renderServices();
  renderFallas();
  renderHours();
  renderStatus();
  renderContact();
  setupTopbar();
  if (location.hash === '#reservar') {
    const f = readFlow();
    if (f && state.services.some((x) => x.id === f.serviceId) && (!f.winStart || f.winStart >= state.info.today)) {
      Object.assign(state, { serviceId: f.serviceId, winStart: f.winStart || state.info.today, date: f.date, time: f.time, extra: (Array.isArray(f.extra) ? f.extra : []).filter((e) => svcById(e.serviceId)).slice(0, MAX_PEOPLE - 1) });
      state.step = f.step === 'details' && !(f.date && f.time) ? 'time' : f.step;
    }
    openBooking();
  }
}

function groups() {
  const map = new Map();
  for (const s of state.services) {
    const k = s.category || 'Servicios';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(s);
  }
  return [...map.entries()];
}

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');

function svcRow(sv) {
  return `
    <li class="svc">
      <div class="svc__name">${esc(sv.name)}</div>
      ${sv.description ? `<p class="svc__desc">${esc(sv.description)}</p>` : ''}
      <div class="svc__facts"><span>${duration(sv.duration)}</span>${sv.price ? `<span class="svc__price">${esc(sv.price)}</span>` : ''}</div>
      <button class="btn btn--ghost btn--small" type="button" data-book="${sv.id}" aria-label="Reservar ${esc(sv.name)}">Reservar</button>
    </li>`;
}

/** Reparte los servicios en las temporadas de la página (Falleras va en el capítulo de Fallas). */
function renderServices() {
  const lists = $$('[data-cats]');
  const claimed = new Set(['Falleras', ...lists.flatMap((l) => l.dataset.cats.split(','))]);
  for (const ul of lists) {
    const cats = ul.dataset.cats.split(',');
    const items = state.services.filter((sv) => cats.includes(sv.category) || (ul.hasAttribute('data-rest') && !claimed.has(sv.category)));
    ul.innerHTML = items.length ? items.map(svcRow).join('') : `<li class="services-empty">Pronto habrá servicios en esta temporada.</li>`;
  }
}

/* ---------- capítulo de Fallas: cuenta atrás y días con huecos ---------- */

const FALLAS_DAYS = { 15: 'Plantà', 16: '', 17: 'Ofrenda', 18: 'Ofrenda', 19: 'Cremà' };

function fallasServices() {
  return state.services.filter((sv) => sv.category === 'Falleras');
}

async function renderFallas() {
  const s = settings();
  const end = s.fallasEnd;
  const plantà = addDays(end, -4);
  $('[data-fallas-year]').textContent = end.slice(0, 4);
  const cd = $('[data-countdown]');
  const left = daysBetween(state.info.today, plantà);
  cd.hidden = false;
  cd.innerHTML = left > 0 ? `Faltan <b>${left}</b> ${left === 1 ? 'día' : 'días'} para la plantà` : '<b>¡Estamos en Fallas!</b>';

  const types = fallasServices();
  const picker = $('[data-fallas-picker]');
  if (!types.length) {
    picker.hidden = true;
    return;
  }
  state.fallasSvc ??= types[0].id;
  $('[data-fallas-types]').innerHTML = types
    .map((t) => `<button type="button" data-fallas-svc="${t.id}" aria-pressed="${t.id === state.fallasSvc}">${esc(t.name.replace(/^Peinado de fallera\s*/i, '') || 'Adulta')}</button>`)
    .join('');
  // "Peinado de fallera" → "Adulta"
  $$('[data-fallas-svc]').forEach((b) => {
    if (b.textContent.trim() === 'Adulta' || b.textContent.trim() === '') b.textContent = 'Adulta';
    else b.textContent = b.textContent.charAt(0).toUpperCase() + b.textContent.slice(1);
  });

  const daysEl = $('[data-fallas-days]');
  if (!s.bookingOpen) {
    daysEl.innerHTML = `<li class="fallas__closed">La reserva online abrirá muy pronto. Mientras, escribe a Miguel por Instagram.</li>`;
    return;
  }
  daysEl.innerHTML = Array.from({ length: 5 }, () => `<li><span class="skeleton fallas__sk"></span></li>`).join('');
  try {
    const { days } = await api(`/api/days?service=${state.fallasSvc}&from=${plantà}&n=5`);
    daysEl.innerHTML = days
      .map((d) => {
        const n = Number(d.date.slice(8));
        const label = FALLAS_DAYS[n] || '';
        const state_ = !d.open ? 'Cerrado' : !d.free ? 'Completo' : `${d.free} ${d.free === 1 ? 'hueco' : 'huecos'}`;
        return `<li><button type="button" class="fday" data-fallas-date="${d.date}" ${d.free ? '' : 'disabled'}
          aria-label="${longDate(d.date)}${label ? `, ${label.toLowerCase()}` : ''}: ${state_}">
          <span class="fday__dow">${dow(d.date)}</span>
          <span class="fday__num">${n}</span>
          <span class="fday__tag">${label || '&nbsp;'}</span>
          <span class="fday__free">${state_}</span>
        </button></li>`;
      })
      .join('');
  } catch {
    daysEl.innerHTML = `<li class="fallas__closed">No se han podido cargar los días. Puedes reservar con el botón.</li>`;
  }
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-fallas-svc]');
  if (t) {
    state.fallasSvc = Number(t.dataset.fallasSvc);
    renderFallas();
    return;
  }
  const d = e.target.closest('[data-fallas-date]');
  if (d) return openBooking(state.fallasSvc, { date: d.dataset.fallasDate });
  if (e.target.closest('[data-fallas-book]')) {
    const types = fallasServices();
    if (!types.length) return openBooking();
    state.extra = [];
    return openBooking(state.fallasSvc ?? types[0].id, { date: null, fallas: true });
  }
});

function hoursHtml() {
  const s = settings();
  if (!s.bookingOpen) {
    return `<p class="hours-empty">Miguel publicará aquí su horario muy pronto.</p>`;
  }
  const today = weekday(state.info.today);
  return `<ul class="hours">${DAY_NAMES.map((name, i) => {
    const r = s.hours[i] || [];
    const txt = r.length ? r.map(([a, b]) => `${prettyTime(a)}–${prettyTime(b)}`).join(', ') : 'Cerrado';
    return `<li class="${i === today ? 'is-today' : ''}"><span>${name}</span><span class="${r.length ? '' : 'closed'}">${txt}</span></li>`;
  }).join('')}</ul>`;
}

function renderHours() {
  $$('[data-hours]').forEach((el) => (el.innerHTML = hoursHtml()));
}

/** "Abierto · cierra a las 14:00" / "Cerrado · abre mañana a las 9:30" */
function openStatus() {
  const s = settings();
  if (!s.bookingOpen) return null;
  const today = state.info.today;
  const now = state.info.nowMinutes;
  const ranges = (d) => (s.hours[weekday(d)] || []).map(([a, b]) => [toMin(a), toMin(b)]);
  for (const [a, b] of ranges(today)) {
    if (now >= a && now < b) return { open: true, text: `cierra a las ${prettyMin(b)}` };
  }
  for (let i = 0; i < 8; i++) {
    const d = addDays(today, i);
    const next = ranges(d).find(([a]) => i > 0 || a > now);
    if (next) {
      const when = i === 0 ? 'hoy' : i === 1 ? 'mañana' : `el ${DAY_NAMES[weekday(d)].toLowerCase()}`;
      return { open: false, text: `abre ${when} a las ${prettyMin(next[0])}` };
    }
  }
  return null;
}

function renderStatus() {
  const st = openStatus();
  const el = $('#open-status');
  if (!el) return;
  if (!st) {
    el.hidden = false;
    el.innerHTML = `${ICON('clock')}<span>La reserva online abrirá muy pronto.</span>`;
    return;
  }
  // Cerrado no se pinta en rojo: la reserva online funciona a cualquier hora.
  const html = st.open
    ? `<span class="status-open">Abierto ahora</span>&nbsp;· ${st.text}`
    : `<span class="status-neutral">Reserva online 24 h</span>&nbsp;· ${st.text}`;
  el.hidden = false;
  el.innerHTML = `${ICON('clock')}<span>${html}</span>`;
}

function renderContact() {
  const s = settings();
  const links = [];
  if (s.phone) links.push(`<a href="${phoneHref(s.phone)}">${ICON('phone')}${esc(prettyPhone(s.phone))}</a>`);
  if (s.whatsapp) links.push(`<a href="${whatsappHref(s.whatsapp)}" target="_blank" rel="noopener">${ICON('chat')}WhatsApp</a>`);
  if (s.instagram) links.push(`<a href="https://www.instagram.com/${esc(s.instagram)}/" target="_blank" rel="noopener">${ICON('insta')}@${esc(s.instagram)}</a>`);
  if (links.length) {
    $('[data-contact]').hidden = false;
    $('[data-contact-links]').innerHTML = links.join('');
  }
}

function setupTopbar() {
  // El botón "Reservar" de la barra y el del pie en móvil aparecen al dejar atrás los de la portada.
  const bar = $('#topbar');
  const cta = $('#mobile-cta');
  const io = new IntersectionObserver(
    ([en]) => {
      bar.classList.toggle('is-scrolled', !en.isIntersecting);
      cta.classList.toggle('is-on', !en.isIntersecting);
    },
    { rootMargin: '-64px 0px 0px 0px' }
  );
  io.observe($('.fallas__actions'));
}

document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-book-cat]');
  if (c) {
    const list = state.services.filter((s) => s.category === c.dataset.bookCat);
    if (list.length === 1) return openBooking(list[0].id);
    state.step = 'service';
    state.filterCat = c.dataset.bookCat;
    openBooking();
    return;
  }
  const b = e.target.closest('[data-book]');
  if (!b || b.closest('dialog')) return;
  state.filterCat = null;
  const id = Number(b.dataset.book);
  openBooking(Number.isFinite(id) && id > 0 ? id : null);
});

/* =========================================================
   Flujo de reserva
   ========================================================= */

const dlg = $('#booking');
const content = $('#booking-content');

function openBooking(serviceId = null, { date = null, fallas = false } = {}) {
  if (!state.info) return;
  state.error = '';
  state.result = null;
  const remembered = store.get('pentinats:cliente');
  if (remembered) state.form = { ...state.form, ...remembered, notes: '' };
  if (serviceId) {
    state.serviceId = serviceId;
    state.step = 'time';
    resetTime();
    state.winStart = state.info.today;
    const s = settings();
    if (date || fallas) {
      // Abre directamente en los días de Fallas (o en el día elegido).
      const start = addDays(s.fallasEnd, -13);
      state.winStart = start > state.info.today ? start : state.info.today;
      state.date = date;
      state.pendingPrefer = date ? null : addDays(s.fallasEnd, -4);
    }
  } else {
    state.step = state.serviceId ? state.step : 'service';
    if (state.step === 'done') state.step = 'service';
  }
  if (!dlg.open) {
    dlg.showModal();
    document.documentElement.style.overflow = 'hidden';
    if (location.hash !== '#reservar') history.pushState({ booking: true }, '', '#reservar');
  }
  render();
  if (state.step === 'time' && !state.days.length && settings().bookingOpen) {
    const prefer = state.pendingPrefer;
    state.pendingPrefer = null;
    loadDays({ keep: true, prefer });
  }
}

function closeBooking() {
  if (location.hash === '#reservar') history.back();
  else hideDialog();
}

function hideDialog() {
  state.filterCat = null;
  if (dlg.open) dlg.close();
  saveFlow();
  document.documentElement.style.overflow = '';
  if (state.step === 'done') {
    state.serviceId = null;
    state.step = 'service';
    resetTime();
  }
}

window.addEventListener('popstate', () => {
  if (location.hash !== '#reservar' && dlg.open) hideDialog();
  else if (location.hash === '#reservar' && !dlg.open && state.info) openBooking();
});

dlg.addEventListener('cancel', (e) => {
  e.preventDefault();
  closeBooking();
});

$('[data-close]', dlg).addEventListener('click', closeBooking);
$('[data-back]', dlg).addEventListener('click', () => {
  const order = ['service', 'time', 'details'];
  const i = order.indexOf(state.step);
  if (i <= 0 || state.step === 'done') return closeBooking();
  go(order[i - 1]);
});

function resetTime() {
  state.winStart = state.info?.today ?? null;
  state.days = [];
  state.date = null;
  state.slots = null;
  state.time = null;
  state.allTimes = false;
}

function go(step) {
  state.step = step;
  state.error = '';
  render();
  content.focus({ preventScroll: true });
  $('.booking__body').scrollTop = 0;
  if (step === 'time' && !state.days.length) loadDays({ keep: true });
}

const TITLES = {
  service: 'Elige un servicio',
  time: 'Elige día y hora',
  details: 'Tus datos',
  done: 'Cita reservada',
  closed: 'Reserva online',
};

function render() {
  const closed = !settings().bookingOpen;
  const step = closed ? 'closed' : state.step;
  $('#booking-title').textContent = TITLES[step];
  const order = ['service', 'time', 'details'];
  const idx = order.indexOf(step);
  $$('[data-step-label]').forEach((li, i) => {
    li.classList.toggle('is-current', i === idx);
    li.classList.toggle('is-done', idx > i || step === 'done');
    if (i === idx) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  });
  $('.steps').hidden = closed || step === 'done';
  $('[data-back]', dlg).style.visibility = step === 'done' || closed ? 'hidden' : 'visible';

  if (closed) content.innerHTML = closedView();
  else if (step === 'service') content.innerHTML = serviceView();
  else if (step === 'time') content.innerHTML = timeView();
  else if (step === 'details') content.innerHTML = detailsView();
  else if (step === 'done') content.innerHTML = doneView();

  renderSummary(step);
  bindStep(step);
  $('.booking__body').classList.toggle('is-single', step === 'done' || closed);
  saveFlow();
}

/* ----- vistas ----- */

function closedView() {
  const s = settings();
  const contact = [];
  if (s.whatsapp) contact.push(`<a class="btn" href="${whatsappHref(s.whatsapp, 'Hola Miguel, me gustaría pedir cita.')}" target="_blank" rel="noopener">${ICON('chat')}Escribir por WhatsApp</a>`);
  if (s.phone) contact.push(`<a class="btn btn--ghost" href="${phoneHref(s.phone)}">${ICON('phone')}Llamar</a>`);
  contact.push(`<a class="btn ${contact.length ? 'btn--ghost' : ''}" href="https://ig.me/m/${esc(s.instagram)}" target="_blank" rel="noopener">${ICON('insta')}Escribir por Instagram</a>`);
  return `
    <div class="empty-state">
      <h3>La reserva online abrirá muy pronto</h3>
      <p>Miguel está terminando de configurar su agenda. Mientras tanto, pídele cita directamente:</p>
      <div class="done__actions">${contact.join('')}</div>
    </div>`;
}

function serviceView() {
  const all = groups();
  const gs = state.filterCat ? all.filter(([cat]) => cat === state.filterCat) : all;
  const focus = state.filterCat && gs.length
    ? `<div class="pick-focus"><p class="booking__lede">Elige el peinado de ${esc(state.filterCat.toLowerCase().replace(/s$/, ''))}:</p></div>`
    : '';
  const more = state.filterCat && gs.length ? `<button type="button" class="link-btn" data-all-services>Ver todos los servicios</button>` : '';
  return focus + (gs.length ? gs : all)
    .map(
      ([cat, list]) => `
      <div class="pick-group">
        <h3>${esc(cat)}</h3>
        <ul class="pick-list">
          ${list
            .map(
              (s) => `
            <li><button type="button" class="pick" data-service="${s.id}" aria-pressed="${s.id === state.serviceId}">
              <span class="pick__name">${esc(s.name)}</span>
              <span class="pick__meta">${duration(s.duration)}${s.price ? ` · ${esc(s.price)}` : ''}</span>
              <span class="pick__tick">${ICON('check')}</span>
            </button></li>`
            )
            .join('')}
        </ul>
      </div>`
    )
    .join('') + more;
}

function timeView() {
  const s = settings();
  const today = state.info.today;
  const lastDay = addDays(today, s.maxDaysAhead);
  const canPrev = state.winStart > today;
  const canNext = daysBetween(state.winStart, lastDay) >= WINDOW;
  const winEnd = addDays(state.winStart, WINDOW - 1);
  const fallasStart = addDays(s.fallasEnd, -13);
  const fallasFrom = addDays(s.fallasEnd, -4); // 15 de marzo: plantà
  const showFallas = s.fallasEnd <= lastDay && (state.winStart > s.fallasEnd || winEnd < fallasStart);

  let days;
  if (state.daysLoading && !state.days.length) {
    days = Array.from({ length: 7 }, () => `<div class="skeleton" style="height:82px"></div>`).join('');
  } else {
    days = state.days
      .map((d) => {
        const disabled = !d.free;
        const worksToday = d.date === today && (s.hours[weekday(d.date)] || []).length > 0;
        const isFallas = d.date >= fallasFrom && d.date <= s.fallasEnd;
        const note = !d.open ? (worksToday ? 'Ya cerrado' : 'Cerrado') : !d.free ? 'Completo' : d.date === today ? 'Hoy' : isFallas ? 'Fallas' : '';
        return `<button type="button" class="day${isFallas ? ' day--fallas' : ''}" data-date="${d.date}" aria-pressed="${d.date === state.date}" ${disabled ? 'disabled' : ''}
          aria-label="${longDate(d.date)}${disabled ? `, ${note.toLowerCase()}` : ''}">
          <span class="day__dow">${dow(d.date)}</span>
          <span class="day__num">${dayNum(d.date)}</span>
          <span class="day__note${isFallas && d.free ? ' day__note--fallas' : ''}">${note || '&nbsp;'}</span>
        </button>`;
      })
      .join('');
  }

  let slots = '';
  if (state.days.length && !state.days.some((d) => d.free)) {
    slots = `<div class="empty-state">
      <p>No quedan huecos para <strong>${esc(service().name.toLowerCase())}</strong> entre el ${shortDate(state.winStart)} y el ${shortDate(addDays(state.winStart, WINDOW - 1))}.</p>
      ${canNext ? `<button type="button" class="btn btn--ghost btn--small" data-win="next">Ver fechas siguientes</button>` : ''}
    </div>`;
  } else if (state.slotsLoading) {
    slots = `<div class="slots">${Array.from({ length: 8 }, () => `<div class="skeleton" style="height:48px"></div>`).join('')}</div>`;
  } else if (state.slots && state.date) {
    if (!state.slots.length) {
      slots = `<div class="empty-state"><p>Este día ya no tiene huecos libres. Prueba con otro.</p></div>`;
    } else {
      // Pocas horas a la vista por franja; el resto, con "Ver todas las horas".
      const LIMIT = 6;
      const bands = [
        ['Mañana', state.slots.filter((t) => toMin(t) < 12 * 60)],
        ['Mediodía', state.slots.filter((t) => toMin(t) >= 12 * 60 && toMin(t) < 16 * 60)],
        ['Tarde', state.slots.filter((t) => toMin(t) >= 16 * 60)],
      ];
      const extra = bands.reduce((n, [, l]) => n + Math.max(0, l.length - LIMIT), 0);
      const all = state.allTimes || extra <= 3 || (state.time && bands.some(([, l]) => l.indexOf(state.time) >= LIMIT));
      let hidden = 0;
      const grp = ([title, list]) => {
        if (!list.length) return '';
        const vis = all ? list : list.slice(0, LIMIT);
        hidden += list.length - vis.length;
        return `<div class="slots-group"><h3>${title}</h3><div class="slots">${vis
          .map((t) => `<button type="button" class="slot" data-time="${t}" aria-pressed="${t === state.time}">${prettyTime(t)}</button>`)
          .join('')}</div></div>`;
      };
      const html = bands.map(grp).join('');
      slots = `<div><h3 class="visually-hidden">Horas libres el ${longDate(state.date)}</h3>${html}${
        hidden ? `<button type="button" class="link-btn more-times" data-all-times>Ver todas las horas (${hidden} más)</button>` : ''
      }</div>`;
    }
  }

  const sv = service();
  const people = `
    <div class="people">
      <div class="people__head">
        <div>
          <span class="people__label" id="people-label">¿Para cuántas personas?</span>
          <span class="people__hint">${state.extra.length ? `Citas seguidas · ${duration(totalMin())} en total` : 'Si venís varias (por ejemplo, madre e hijas), se reservan seguidas'}</span>
        </div>
        <div class="stepper" role="group" aria-labelledby="people-label">
          <button type="button" class="icon-btn" data-people="-1" aria-label="Una persona menos" ${!state.extra.length ? 'disabled' : ''}>${ICON('minus')}</button>
          <output aria-live="polite">${peopleCount()}</output>
          <button type="button" class="icon-btn" data-people="1" aria-label="Una persona más" ${peopleCount() >= MAX_PEOPLE ? 'disabled' : ''}>${ICON('plus')}</button>
        </div>
      </div>
      ${
        state.extra.length
          ? `<ol class="people__list">
        <li><span>Persona 1</span><strong>${esc(sv.name)}</strong></li>
        ${state.extra
          .map(
            (e, i) => `<li><label for="x-svc-${i}">Persona ${i + 2}</label>
          <select class="select" id="x-svc-${i}" data-extra-svc="${i}">${state.services
            .map((x) => `<option value="${x.id}" ${x.id === Number(e.serviceId) ? 'selected' : ''}>${esc(x.name)} · ${duration(x.duration)}</option>`)
            .join('')}</select></li>`
          )
          .join('')}
      </ol>`
          : ''
      }
      ${peopleCount() >= MAX_PEOPLE ? `<p class="people__hint">Para más de ${MAX_PEOPLE} personas, escribe a Miguel por Instagram.</p>` : ''}
    </div>`;

  return `
    ${state.error ? `<div class="alert" role="alert">${ICON('info')}<span>${esc(state.error)}</span></div>` : ''}
    ${sv ? people : ''}
    ${state.notice ? `<p class="window-note" role="status">${ICON('info')}<span>${esc(state.notice)}</span></p>` : ''}
    <div>
      <div class="datebar">
        ${monthPicker(today, lastDay)}
        ${showFallas ? `<button type="button" class="chip chip--fallas" data-fallas>Ir a Fallas · 15–19 mar</button>` : ''}
        <div class="datebar__nav">
          <button type="button" class="icon-btn" data-win="prev" aria-label="Fechas anteriores" ${canPrev ? '' : 'disabled'}>${ICON('back')}</button>
          <button type="button" class="icon-btn" data-win="next" aria-label="Fechas siguientes" ${canNext ? '' : 'disabled'}>${ICON('next')}</button>
        </div>
      </div>
      <div class="days" role="group" aria-label="Días">${days}</div>
      ${
        !canNext && state.days.length
          ? `<p class="window-note">${ICON('info')}<span>Por ahora se puede reservar hasta el ${fullDate(lastDay).toLowerCase()}. Para una fecha posterior, escribe a Miguel por <a href="https://ig.me/m/${esc(s.instagram)}" target="_blank" rel="noopener">Instagram</a>.</span></p>`
          : ''
      }
    </div>
    <div aria-live="polite">${slots}</div>
    ${s.bookingNote ? `<p class="fineprint">${esc(s.bookingNote)}</p>` : ''}`;
}

function detailsView() {
  const f = state.form;
  return `
    <form class="form" id="details-form" novalidate>
      ${state.error ? `<div class="alert" role="alert">${ICON('info')}<span>${esc(state.error)}</span></div>` : ''}
      <div class="field">
        <label for="f-name">Nombre y apellidos</label>
        <input class="input" id="f-name" name="name" autocomplete="name" required minlength="2" maxlength="80" value="${esc(f.name)}">
      </div>
      ${state.extra
        .map(
          (e, i) => `
      <div class="field">
        <label for="f-other-${i}">Nombre de la persona ${i + 2} <span class="muted">(${esc(svcById(e.serviceId)?.name ?? '')})</span></label>
        <input class="input" id="f-other-${i}" data-other="${i}" maxlength="60" value="${esc(e.name || '')}" placeholder="Opcional">
      </div>`
        )
        .join('')}
      <div class="field">
        <label for="f-phone">Teléfono</label>
        <input class="input" id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(f.phone)}" placeholder="600 000 000">
        <span class="hint">Miguel te llamará a este número si hay algún cambio.</span>
      </div>
      <div class="field">
        <label for="f-email">Correo electrónico <span class="muted">(opcional, por si Miguel necesita escribirte)</span></label>
        <input class="input" id="f-email" name="email" type="email" autocomplete="email" maxlength="120" value="${esc(f.email)}">
      </div>
      <div class="field">
        <label for="f-notes">Notas para Miguel <span class="muted">(opcional)</span></label>
        <textarea class="textarea" id="f-notes" name="notes" maxlength="600" placeholder="Por ejemplo: la fecha de la boda, el largo del pelo o si traes tu aderezo…">${esc(f.notes)}</textarea>
      </div>
      <div class="hp" aria-hidden="true"><label>No rellenar <input name="website" tabindex="-1" autocomplete="off"></label></div>
      <p class="fineprint">Tus datos solo se usan para gestionar esta cita.</p>
    </form>`;
}

const citaUrl = (r) => `${location.origin}/cita?c=${r.code}&t=${encodeURIComponent(r.token)}`;

function shareText(r) {
  const who = r.party?.length
    ? r.party.map((p) => `${prettyTime(p.start)} ${p.name} (${p.service})`).join(', ')
    : `${prettyTime(r.start)} ${r.name} (${r.service})`;
  return `Cita con Miguel de la Cruz (Pentinats), ${fullDate(r.date).toLowerCase()}: ${who}. Calle del Cid, 12, Paterna. Código ${r.code}. Ver o cancelar: ${citaUrl(r)}`;
}

function doneView() {
  const r = state.result;
  return `
    <div class="done">
      <div>
        <h3>¡Listo, ${esc(r.name.split(' ')[0])}! Tu cita está confirmada</h3>
        <p class="booking__lede">Guárdate el enlace de tu cita: con él puedes consultarla o cancelarla cuando quieras.</p>
      </div>
      <article class="ticket" aria-label="Resguardo de la cita">
        <header class="ticket__head">
          <img src="/assets/logo-sello.png" alt="" width="150" height="150">
          <div><span class="ticket__brand">Pentinats</span><strong>Miguel de la Cruz</strong></div>
          <div class="ticket__code"><span>Código</span><strong>${r.code}</strong></div>
        </header>
        <div class="ticket__body">
          ${partyRows(r)}
          <div class="ticket__row">${ICON('cal')}<div><strong>${fullDate(r.date)}</strong><span>de ${prettyTime(r.start)} a ${prettyTime(r.end)}</span></div></div>
          <div class="ticket__row">${ICON('pin')}<div><strong>Calle del Cid, 12, bajo</strong><span>46980 Paterna</span></div></div>
        </div>
      </article>
      <div class="done__actions">
        <a class="btn btn--gold" href="https://wa.me/?text=${encodeURIComponent(shareText(r))}" target="_blank" rel="noopener">${ICON('chat')}Enviármela por WhatsApp</a>
        <button type="button" class="btn btn--ghost" data-ics>${ICON('cal')}Añadir al calendario</button>
        <button type="button" class="btn btn--ghost" data-copy>${ICON('copy')}<span>Copiar enlace</span></button>
      </div>
      <p class="done__link"><a href="${citaUrl(r)}">Ver o cancelar mi cita</a></p>
    </div>`;
}

/** Desplegable de meses reservables: salta directamente a cualquier mes. */
function monthPicker(today, lastDay) {
  const months = [];
  for (let d = `${today.slice(0, 7)}-01`; d <= lastDay; ) {
    months.push(d.slice(0, 7));
    const [y, m] = d.split('-').map(Number);
    d = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  }
  const current = state.winStart.slice(0, 7);
  return `<label class="month-picker">
      <span class="visually-hidden">Ir al mes</span>
      <select data-month>${months
        .map((m) => `<option value="${m}" ${m === current ? 'selected' : ''}>${monthLabel(`${m}-01`).replace(' de ', ' ')}</option>`)
        .join('')}</select>
      ${ICON('down')}
    </label>`;
}


/* ----- resumen ----- */

function renderSummary(step) {
  const s = service();
  const closed = step === 'closed';
  const canNext = (step === 'service' && !!s) || (step === 'time' && !!state.time) || step === 'details';
  const label = step === 'details' ? 'Confirmar cita' : 'Continuar';
  const when = state.date && state.time ? `${fullDate(state.date)}` : '';
  const end = state.time && s ? prettyMin(toMin(state.time) + totalMin()) : '';
  const svcLabel = groupLabel();

  $('#summary').innerHTML = `
    <div class="summary__salon">
      <div><strong>Miguel de la Cruz</strong><span>Calle del Cid, 12 · Paterna</span></div>
    </div>
    <dl>
      ${
        s
          ? `<div><dt>${ICON('scissors')}<span class="visually-hidden">Servicio</span></dt><dd><strong>${esc(svcLabel)}</strong><span>${duration(totalMin())}${s.price && !state.extra.length ? ` · ${esc(s.price)}` : ''}</span></dd></div>`
          : `<p class="summary__empty">Aún no has elegido servicio.</p>`
      }
      ${when ? `<div><dt>${ICON('cal')}<span class="visually-hidden">Fecha</span></dt><dd><strong>${when}</strong><span>de ${prettyTime(state.time)} a ${end}</span></dd></div>` : ''}
    </dl>
    ${step === 'done' || closed ? '' : `<button type="button" class="btn btn--gold btn--block ${state.submitting ? 'is-loading' : ''}" data-next ${canNext ? '' : 'disabled'}>${label}</button>`}`;

  $('#summary').hidden = step === 'done' || closed;
  const foot = $('#booking-foot');
  foot.classList.toggle('is-hidden', step === 'done' || closed);
  $('#foot-summary').innerHTML = s
    ? `<strong>${esc(svcLabel)}</strong><span>${when ? `${shortDate(state.date)} · ${prettyTime(state.time)}` : duration(totalMin())}</span>`
    : `<span>Elige un servicio</span>`;
  const fb = $('#foot-next');
  fb.textContent = label;
  fb.disabled = !canNext;
  fb.classList.toggle('is-loading', state.submitting);
}

/* ----- eventos por paso ----- */

function next() {
  if (state.step === 'service' && service()) {
    resetTime();
    go('time');
  } else if (state.step === 'time' && state.time) go('details');
  else if (state.step === 'details') submit();
}

$('#foot-next').addEventListener('click', next);
$('#summary').addEventListener('click', (e) => {
  if (e.target.closest('[data-next]')) next();
});

function bindStep(step) {
  if (step === 'service') {
    $('[data-all-services]', content)?.addEventListener('click', () => {
      state.filterCat = null;
      render();
    });
    $$('[data-service]', content).forEach((b) =>
      b.addEventListener('click', () => {
        state.serviceId = Number(b.dataset.service);
        state.extra = [];
        resetTime();
        go('time');
      })
    );
  }
  if (step === 'time') {
    $$('[data-date]', content).forEach((b) =>
      b.addEventListener('click', () => {
        state.notice = '';
        selectDate(b.dataset.date);
      })
    );
    $$('[data-time]', content).forEach((b) =>
      b.addEventListener('click', () => {
        state.time = b.dataset.time;
        state.error = '';
        render();
        $(`[data-time="${state.time}"]`, content)?.focus();
      })
    );
    $$('[data-people]', content).forEach((b) =>
      b.addEventListener('click', () => {
        if (Number(b.dataset.people) > 0 && peopleCount() < MAX_PEOPLE) state.extra.push({ serviceId: state.serviceId, name: '' });
        if (Number(b.dataset.people) < 0) state.extra.pop();
        state.time = null;
        loadDays({ keep: true, peopleChange: true });
      })
    );
    $$('[data-extra-svc]', content).forEach((sel) =>
      sel.addEventListener('change', () => {
        state.extra[Number(sel.dataset.extraSvc)].serviceId = Number(sel.value);
        state.time = null;
        loadDays({ keep: true, peopleChange: true });
      })
    );
    $('[data-month]', content)?.addEventListener('change', (e) => {
      const first = `${e.target.value}-01`;
      state.winStart = first > state.info.today ? first : state.info.today;
      state.date = null;
      state.slots = null;
      state.time = null;
      loadDays();
    });
    $('[data-all-times]', content)?.addEventListener('click', () => {
      state.allTimes = true;
      render();
    });
    $('[data-fallas]', content)?.addEventListener('click', () => {
      const s = settings();
      const start = addDays(s.fallasEnd, -13);
      state.winStart = start > state.info.today ? start : state.info.today;
      state.date = null;
      state.slots = null;
      state.time = null;
      loadDays({ prefer: addDays(s.fallasEnd, -4) });
    });
    $$('[data-win]', content).forEach((b) =>
      b.addEventListener('click', () => {
        state.winStart = addDays(state.winStart, b.dataset.win === 'next' ? WINDOW : -WINDOW);
        if (state.winStart < state.info.today) state.winStart = state.info.today;
        state.date = null;
        state.slots = null;
        state.time = null;
        loadDays();
      })
    );
    const sel = $('[aria-pressed="true"].day', content);
    const strip = $('.days', content);
    if (sel && strip && sel.offsetLeft + sel.offsetWidth > strip.clientWidth) strip.scrollLeft = sel.offsetLeft - 8;
  }
  if (step === 'details') {
    const form = $('#details-form');
    form.addEventListener('input', (e) => {
      if (e.target.name in state.form) state.form[e.target.name] = e.target.value;
      if (e.target.dataset.other) state.extra[Number(e.target.dataset.other)].name = e.target.value;
      e.target.removeAttribute('aria-invalid');
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit();
    });
    if (!state.form.name) $('#f-name').focus();
  }
  if (step === 'done') {
    $('[data-ics]', content).addEventListener('click', () => {
      const r = state.result;
      const url = URL.createObjectURL(icsFor({ ...r, address: ADDRESS, link: citaUrl(r) }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `cita-miguel-de-la-cruz-${r.date}.ics` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
    $('[data-copy]', content).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const label = $('span', btn);
      try {
        await navigator.clipboard.writeText(citaUrl(state.result));
        label.textContent = '¡Enlace copiado!';
      } catch {
        window.prompt('Copia este enlace:', citaUrl(state.result));
      }
      setTimeout(() => (label.textContent = 'Copiar enlace'), 2500);
    });
  }
}

async function loadDays({ keep = false, prefer = null, peopleChange = false } = {}) {
  const keepDate = keep ? state.date : null;
  const keepTime = keep ? state.time : null;
  state.daysLoading = true;
  state.days = [];
  render();
  try {
    const { days } = await api(`/api/days?service=${state.serviceId}&from=${state.winStart}&n=${WINDOW}${extraParam()}`);
    const last = addDays(state.info.today, settings().maxDaysAhead);
    state.days = days.filter((d) => d.date <= last);
    state.daysLoading = false;
    const kept = keepDate && state.days.find((d) => d.date === keepDate && d.free);
    if (kept) return selectDate(kept.date, keepTime);
    const first = (prefer && state.days.find((d) => d.free && d.date >= prefer)) || state.days.find((d) => d.free);
    state.notice =
      peopleChange && keepDate && first && first.date !== keepDate
        ? `El ${longDate(keepDate).toLowerCase()} ya no tiene hueco para ${peopleCount()} ${peopleCount() === 1 ? 'persona' : 'personas'} seguidas: te mostramos el ${longDate(first.date).toLowerCase()}.`
        : '';
    if (first) return selectDate(first.date);
  } catch (e) {
    state.error = e.message;
  }
  state.daysLoading = false;
  render();
}

async function selectDate(date, keepTime = null) {
  state.date = date;
  state.time = null;
  state.allTimes = false;
  state.slotsLoading = true;
  render();
  try {
    const { slots } = await api(`/api/slots?service=${state.serviceId}&date=${date}${extraParam()}`);
    if (state.date !== date) return;
    state.slots = slots;
    if (keepTime && slots.includes(keepTime)) state.time = keepTime;
  } catch (e) {
    state.error = e.message;
    state.slots = [];
  }
  state.slotsLoading = false;
  render();
}

async function submit() {
  if (state.submitting) return;
  const form = $('#details-form');
  const f = state.form;
  const problems = [];
  const name = $('#f-name');
  const phone = $('#f-phone');
  const email = $('#f-email');
  if (f.name.trim().length < 2) problems.push([name, 'Escribe tu nombre.']);
  if (f.phone.replace(/\D/g, '').length < 9) problems.push([phone, 'Escribe un teléfono de al menos 9 cifras.']);
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) problems.push([email, 'Revisa el correo electrónico.']);
  $$('.field .error', form).forEach((n) => n.remove());
  if (problems.length) {
    for (const [input, msg] of problems) {
      input.setAttribute('aria-invalid', 'true');
      const err = Object.assign(document.createElement('span'), { className: 'error', textContent: msg, id: `${input.id}-err` });
      input.setAttribute('aria-describedby', err.id);
      input.closest('.field').append(err);
    }
    problems[0][0].focus();
    return;
  }

  state.submitting = true;
  renderSummary('details');
  try {
    const r = await api('/api/bookings', {
      method: 'POST',
      body: {
        serviceId: state.serviceId,
        date: state.date,
        time: state.time,
        name: f.name,
        phone: f.phone,
        email: f.email,
        notes: f.notes,
        extra: state.extra.map((e) => ({ serviceId: e.serviceId, name: e.name || '' })),
        website: form.website.value,
      },
    });
    store.set('pentinats:cliente', { name: f.name, phone: f.phone, email: f.email });
    state.result = r;
    state.submitting = false;
    state.extra = [];
    state.form.notes = '';
    go('done');
  } catch (e) {
    state.submitting = false;
    if (e.status === 409) {
      state.time = null;
      state.step = 'time';
      state.error = e.message;
      selectDate(state.date);
    } else {
      state.error = e.message;
      render();
    }
  }
}

boot();
