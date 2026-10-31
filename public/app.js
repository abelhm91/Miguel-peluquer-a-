import {
  $, $$, esc, api, addDays, daysBetween, weekday, longDate, shortDate, monthLabel, dow, dayNum,
  DAY_NAMES, toMin, prettyTime, prettyMin, duration, phoneHref, whatsappHref, prettyPhone, icsFor, store,
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
};

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
  renderHours();
  renderStatus();
  renderContact();
  setupTopbar();
  if (location.hash === '#reservar') openBooking();
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

function renderServices() {
  const gs = groups();
  if (!gs.length) {
    $('#services').innerHTML = `<p class="services-empty">Miguel está preparando la lista de servicios. Mientras, puedes escribirle por Instagram.</p>`;
    $('.cats').hidden = true;
    return;
  }
  $('#cat-tabs').innerHTML = gs
    .map(([cat], i) => `<a class="chip" role="listitem" href="#cat-${slug(cat)}" ${i === 0 ? 'aria-current="true"' : ''}>${esc(cat)}</a>`)
    .join('');
  $('#services').innerHTML = gs
    .map(
      ([cat, list]) => `
      <div class="svc-group">
        <h3 id="cat-${slug(cat)}">${esc(cat)}</h3>
        <ul class="svc-list">
          ${list
            .map(
              (s) => `
            <li class="svc">
              <div class="svc__name">${esc(s.name)}</div>
              ${s.description ? `<p class="svc__desc">${esc(s.description)}</p>` : ''}
              <div class="svc__facts"><span>${duration(s.duration)}</span>${s.price ? `<span class="svc__price">${esc(s.price)}</span>` : ''}</div>
              <button class="btn btn--ghost btn--small" type="button" data-book="${s.id}" aria-label="Reservar ${esc(s.name)}">Reservar</button>
            </li>`
            )
            .join('')}
        </ul>
      </div>`
    )
    .join('');

  // Pestaña activa según el scroll
  const tabs = $$('#cat-tabs .chip');
  const heads = $$('.svc-group h3');
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          tabs.forEach((t) => t.setAttribute('aria-current', String(t.hash === `#${en.target.id}`)));
          // Desplaza solo la fila de pestañas (en horizontal), nunca la página.
          const active = tabs.find((t) => t.hash === `#${en.target.id}`);
          const row = $('#cat-tabs');
          if (active && (active.offsetLeft < row.scrollLeft || active.offsetLeft + active.offsetWidth > row.scrollLeft + row.clientWidth)) {
            row.scrollTo({ left: active.offsetLeft - 16, behavior: 'smooth' });
          }
        }
      }
    },
    { rootMargin: '-140px 0px -60% 0px' }
  );
  heads.forEach((h) => io.observe(h));
}

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
  const side = $('[data-status-line]');
  if (!st) {
    side.hidden = false;
    side.innerHTML = `<span class="muted">La reserva online abrirá muy pronto.</span>`;
    return;
  }
  const html = `<span class="${st.open ? 'status-open' : 'status-closed'}">${st.open ? 'Abierto' : 'Cerrado'}</span>&nbsp;· ${st.text}`;
  el.hidden = false;
  el.innerHTML = `${ICON('clock')}<span>${html}</span>`;
  side.hidden = false;
  side.innerHTML = html;
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
  io.observe($('.hero__actions'));
}

document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-book-cat]');
  if (c) {
    const list = state.services.filter((s) => s.category === c.dataset.bookCat);
    if (list.length === 1) return openBooking(list[0].id);
    state.step = 'service';
    openBooking();
    if (state.step === 'service') {
      const head = $$('.pick-group h3', content).find((h) => h.textContent === c.dataset.bookCat);
      head?.scrollIntoView({ block: 'start' });
    }
    return;
  }
  const b = e.target.closest('[data-book]');
  if (!b || b.closest('dialog')) return;
  const id = Number(b.dataset.book);
  openBooking(Number.isFinite(id) && id > 0 ? id : null);
});

/* =========================================================
   Flujo de reserva
   ========================================================= */

const dlg = $('#booking');
const content = $('#booking-content');

function openBooking(serviceId = null) {
  if (!state.info) return;
  state.error = '';
  state.result = null;
  const remembered = store.get('pentinats:cliente');
  if (remembered) state.form = { ...state.form, ...remembered, notes: '' };
  if (serviceId) {
    state.serviceId = serviceId;
    state.step = 'time';
    resetTime();
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
  if (state.step === 'time' && !state.days.length && settings().bookingOpen) loadDays();
}

function closeBooking() {
  if (location.hash === '#reservar') history.back();
  else hideDialog();
}

function hideDialog() {
  if (dlg.open) dlg.close();
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
}

function go(step) {
  state.step = step;
  state.error = '';
  render();
  content.focus({ preventScroll: true });
  $('.booking__body').scrollTop = 0;
  if (step === 'time' && !state.days.length) loadDays();
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
  return groups()
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
    .join('');
}

function timeView() {
  const s = settings();
  const today = state.info.today;
  const lastDay = addDays(today, s.maxDaysAhead);
  const canPrev = state.winStart > today;
  const canNext = daysBetween(state.winStart, lastDay) >= WINDOW;
  const labelDate = state.date || state.winStart;

  let days;
  if (state.daysLoading && !state.days.length) {
    days = Array.from({ length: 7 }, () => `<div class="skeleton" style="height:82px"></div>`).join('');
  } else {
    days = state.days
      .map((d) => {
        const disabled = !d.free;
        const note = !d.open ? 'Cerrado' : !d.free ? 'Completo' : d.date === today ? 'Hoy' : '';
        return `<button type="button" class="day" data-date="${d.date}" aria-pressed="${d.date === state.date}" ${disabled ? 'disabled' : ''}
          aria-label="${longDate(d.date)}${disabled ? `, ${note.toLowerCase()}` : ''}">
          <span class="day__dow">${dow(d.date)}</span>
          <span class="day__num">${dayNum(d.date)}</span>
          <span class="day__note">${note || '&nbsp;'}</span>
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
      const morning = state.slots.filter((t) => toMin(t) < 14 * 60);
      const afternoon = state.slots.filter((t) => toMin(t) >= 14 * 60);
      const grp = (title, list) =>
        list.length
          ? `<div class="slots-group"><h3>${title}</h3><div class="slots">${list
              .map((t) => `<button type="button" class="slot" data-time="${t}" aria-pressed="${t === state.time}">${prettyTime(t)}</button>`)
              .join('')}</div></div>`
          : '';
      slots = `<div><h3 class="visually-hidden">Horas libres el ${longDate(state.date)}</h3>${grp('Mañana', morning)}${grp('Tarde', afternoon)}</div>`;
    }
  }

  return `
    ${state.error ? `<div class="alert" role="alert">${ICON('info')}<span>${esc(state.error)}</span></div>` : ''}
    <div>
      <div class="datebar">
        <span class="datebar__month" aria-live="polite">${monthLabel(labelDate)}</span>
        <div class="datebar__nav">
          <button type="button" class="icon-btn" data-win="prev" aria-label="Fechas anteriores" ${canPrev ? '' : 'disabled'}>${ICON('back')}</button>
          <button type="button" class="icon-btn" data-win="next" aria-label="Fechas siguientes" ${canNext ? '' : 'disabled'}>${ICON('next')}</button>
        </div>
      </div>
      <div class="days" role="group" aria-label="Días">${days}</div>
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
      <div class="field">
        <label for="f-phone">Teléfono</label>
        <input class="input" id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(f.phone)}" placeholder="600 000 000">
        <span class="hint">Miguel te llamará a este número si hay algún cambio.</span>
      </div>
      <div class="field">
        <label for="f-email">Correo electrónico <span class="muted">(opcional)</span></label>
        <input class="input" id="f-email" name="email" type="email" autocomplete="email" maxlength="120" value="${esc(f.email)}">
      </div>
      <div class="field">
        <label for="f-notes">Notas para Miguel <span class="muted">(opcional)</span></label>
        <textarea class="textarea" id="f-notes" name="notes" maxlength="600" placeholder="Por ejemplo: fallera infantil, fecha de la boda, largo del pelo…">${esc(f.notes)}</textarea>
      </div>
      <div class="hp" aria-hidden="true"><label>No rellenar <input name="website" tabindex="-1" autocomplete="off"></label></div>
      <p class="fineprint">Tus datos solo se usan para gestionar esta cita.</p>
    </form>`;
}

function doneView() {
  const r = state.result;
  const link = `/cita?c=${r.code}&t=${encodeURIComponent(r.token)}`;
  return `
    <div class="done">
      <div class="done__badge">${ICON('check')}</div>
      <div>
        <h3>¡Listo, ${esc(r.name.split(' ')[0])}! Tu cita está confirmada</h3>
        <p class="booking__lede" style="margin-top:8px">Miguel te espera. Guarda el enlace para consultarla o cancelarla.</p>
      </div>
      <div class="ticket">
        <div class="ticket__row">${ICON('scissors')}<div><strong>${esc(r.service)}</strong><span>${duration(toMin(r.end) - toMin(r.start))}</span></div></div>
        <div class="ticket__row">${ICON('cal')}<div><strong>${longDate(r.date)}</strong><span>de ${prettyTime(r.start)} a ${prettyTime(r.end)}</span></div></div>
        <div class="ticket__row">${ICON('pin')}<div><strong>Calle del Cid, 12, bajo</strong><span>46980 Paterna</span></div></div>
        <div class="ticket__code"><span class="muted">Código de reserva</span><strong>${r.code}</strong></div>
      </div>
      <div class="done__actions">
        <button type="button" class="btn" data-ics>${ICON('cal')}Añadir al calendario</button>
        <a class="btn btn--ghost" href="${link}">Ver o cancelar mi cita</a>
      </div>
    </div>`;
}

/* ----- resumen ----- */

function renderSummary(step) {
  const s = service();
  const closed = step === 'closed';
  const canNext = (step === 'service' && !!s) || (step === 'time' && !!state.time) || step === 'details';
  const label = step === 'details' ? 'Confirmar cita' : 'Continuar';
  const when = state.date && state.time ? `${longDate(state.date)}` : '';
  const end = state.time && s ? prettyMin(toMin(state.time) + s.duration) : '';

  $('#summary').innerHTML = `
    <div class="summary__salon">
      <img src="/assets/logo-pentinats.png" alt="" width="52" height="52">
      <div><strong>Miguel de la Cruz</strong><span>Calle del Cid, 12 · Paterna</span></div>
    </div>
    <dl>
      ${
        s
          ? `<div><dt>${ICON('scissors')}<span class="visually-hidden">Servicio</span></dt><dd><strong>${esc(s.name)}</strong><span>${duration(s.duration)}${s.price ? ` · ${esc(s.price)}` : ''}</span></dd></div>`
          : `<p class="summary__empty">Aún no has elegido servicio.</p>`
      }
      ${when ? `<div><dt>${ICON('cal')}<span class="visually-hidden">Fecha</span></dt><dd><strong>${when}</strong><span>de ${prettyTime(state.time)} a ${end}</span></dd></div>` : ''}
    </dl>
    ${step === 'done' || closed ? '' : `<button type="button" class="btn btn--block ${state.submitting ? 'is-loading' : ''}" data-next ${canNext ? '' : 'disabled'}>${label}</button>`}`;

  const foot = $('#booking-foot');
  foot.classList.toggle('is-hidden', step === 'done' || closed);
  $('#foot-summary').innerHTML = s
    ? `<strong>${esc(s.name)}</strong><span>${when ? `${shortDate(state.date)} · ${prettyTime(state.time)}` : duration(s.duration)}</span>`
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
    $$('[data-service]', content).forEach((b) =>
      b.addEventListener('click', () => {
        state.serviceId = Number(b.dataset.service);
        resetTime();
        go('time');
      })
    );
  }
  if (step === 'time') {
    $$('[data-date]', content).forEach((b) => b.addEventListener('click', () => selectDate(b.dataset.date)));
    $$('[data-time]', content).forEach((b) =>
      b.addEventListener('click', () => {
        state.time = b.dataset.time;
        state.error = '';
        render();
        $(`[data-time="${state.time}"]`, content)?.focus();
      })
    );
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
      const url = URL.createObjectURL(icsFor({ ...r, address: ADDRESS }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `cita-miguel-de-la-cruz-${r.date}.ics` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  }
}

async function loadDays() {
  state.daysLoading = true;
  state.days = [];
  render();
  try {
    const { days } = await api(`/api/days?service=${state.serviceId}&from=${state.winStart}&n=${WINDOW}`);
    const last = addDays(state.info.today, settings().maxDaysAhead);
    state.days = days.filter((d) => d.date <= last);
    state.daysLoading = false;
    const first = state.days.find((d) => d.free);
    if (first) return selectDate(first.date);
  } catch (e) {
    state.error = e.message;
  }
  state.daysLoading = false;
  render();
}

async function selectDate(date) {
  state.date = date;
  state.time = null;
  state.slotsLoading = true;
  render();
  try {
    const { slots } = await api(`/api/slots?service=${state.serviceId}&date=${date}`);
    if (state.date !== date) return;
    state.slots = slots;
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
        website: form.website.value,
      },
    });
    store.set('pentinats:cliente', { name: f.name, phone: f.phone, email: f.email });
    state.result = r;
    state.submitting = false;
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
