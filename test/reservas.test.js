import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeAdapter, saveSettings } from '../server/db.js';
import { createApi } from '../server/app.js';
import { freeSlots, daySummary, effectiveMaxDays } from '../server/availability.js';
import { addDays, nowInMadrid } from '../server/time.js';
import { sendDailySummary } from '../server/summary.js';

// Lunes fijo para que los tests no dependan del día en que se ejecutan.
const MONDAY = '2030-03-04';
const NOW = { date: '2030-03-01', minutes: 600 };
const HOURS = [[['09:00', '14:00'], ['16:00', '20:00']], [], [], [], [], [], []];

async function setup() {
  const db = await nodeAdapter(':memory:');
  await saveSettings(db, { hours: HOURS, slotStep: 30 });
  const api = createApi({ db, adminPassword: 'secreto', now: () => NOW });
  const call = async (path, { method = 'GET', body, cookie } = {}) => {
    const res = await api(
      new Request(`http://local${path}`, {
        method,
        headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
    );
    return { status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
  };
  return { db, call, api };
}

test('los huecos respetan horario, duración y citas', async () => {
  const { db } = await setup();
  const settings = { hours: HOURS, slotStep: 30, minNoticeMinutes: 120, maxDaysAhead: 120 };
  let slots = await freeSlots(db, settings, MONDAY, 90, NOW);
  assert.equal(slots[0], 9 * 60);
  assert.equal(slots.at(-1), 20 * 60 - 90);
  assert.ok(!slots.includes(13 * 60), '13:00 + 90 min se pasa del cierre');
  await db.run("INSERT INTO bookings (code, token, service_name, date, start_min, end_min, name, phone) VALUES ('AAAAAA','t','x',?,600,660,'a','1')", MONDAY);
  slots = await freeSlots(db, settings, MONDAY, 60, NOW);
  assert.ok(!slots.includes(570) && !slots.includes(600) && !slots.includes(630));
  assert.ok(slots.includes(540) && slots.includes(660));
  assert.deepEqual(await freeSlots(db, settings, addDays(MONDAY, 1), 60, NOW), [], 'martes cerrado');
});

test('antelación mínima y límite de días', async () => {
  const { db } = await setup();
  const settings = { hours: Array(7).fill(HOURS[0]), slotStep: 30, minNoticeMinutes: 120, maxDaysAhead: 10 };
  const now = { date: MONDAY, minutes: 600 };
  assert.equal((await freeSlots(db, settings, MONDAY, 30, now))[0], 720);
  // El límite (10 días) se amplía siempre hasta el final de las próximas Fallas (19 de marzo).
  assert.ok((await freeSlots(db, settings, '2030-03-19', 30, now)).length > 0, 'se puede reservar en Fallas');
  assert.deepEqual(await freeSlots(db, settings, '2030-03-20', 30, now), [], 'después de Fallas y del límite, no');
  assert.deepEqual(await freeSlots(db, settings, addDays(MONDAY, -1), 30, now), []);
  // a las 23:00 con 2 h de antelación, mañana no se puede antes de la 1:00 (irrelevante aquí) pero sí a las 9:00
  assert.equal((await freeSlots(db, settings, addDays(MONDAY, 1), 30, { date: MONDAY, minutes: 1380 }))[0], 540);
});

test('flujo completo: reservar, no duplicar, cancelar', async () => {
  const { call } = await setup();
  const info = await call('/api/info');
  assert.equal(info.data.settings.bookingOpen, true);
  const svc = info.data.services.find((s) => s.name === 'Trenzas');

  const slots = await call(`/api/slots?service=${svc.id}&date=${MONDAY}`);
  assert.ok(slots.data.slots.includes('09:00'));

  const body = { serviceId: svc.id, date: MONDAY, time: '09:00', name: 'Ana', phone: '600 11 22 33' };
  const r1 = await call('/api/bookings', { method: 'POST', body });
  assert.equal(r1.status, 201);
  assert.match(r1.data.code, /^[A-Z0-9]{6}$/);

  const r2 = await call('/api/bookings', { method: 'POST', body: { ...body, time: '09:30' } });
  assert.equal(r2.status, 409, 'se solapa con la anterior');

  const after = await call(`/api/slots?service=${svc.id}&date=${MONDAY}`);
  assert.ok(!after.data.slots.includes('09:00'));

  const view = await call(`/api/bookings/${r1.data.code}?t=${r1.data.token}`);
  assert.equal(view.data.status, 'confirmed');
  const bad = await call(`/api/bookings/${r1.data.code}/cancel`, { method: 'POST', body: { token: 'x' } });
  assert.equal(bad.status, 404);
  const ok = await call(`/api/bookings/${r1.data.code}/cancel`, { method: 'POST', body: { token: r1.data.token } });
  assert.equal(ok.data.status, 'cancelled');
  const again = await call(`/api/slots?service=${svc.id}&date=${MONDAY}`);
  assert.ok(again.data.slots.includes('09:00'), 'el hueco vuelve a quedar libre');

  const noPhone = await call('/api/bookings', { method: 'POST', body: { ...body, phone: '12' } });
  assert.equal(noPhone.status, 400);
});

test('dos reservas simultáneas a la misma hora: solo entra una', async () => {
  const { call } = await setup();
  const svc = (await call('/api/info')).data.services[0];
  const body = { serviceId: svc.id, date: MONDAY, time: '16:00', name: 'Ana', phone: '600112233' };
  const rs = await Promise.all([1, 2, 3].map(() => call('/api/bookings', { method: 'POST', body })));
  assert.equal(rs.filter((r) => r.status === 201).length, 1);
  assert.equal(rs.filter((r) => r.status === 409).length, 2);
});

test('panel: requiere sesión, citas manuales, bloqueos y horario', async () => {
  const { call } = await setup();
  assert.equal((await call('/api/admin/overview')).status, 401);
  assert.equal((await call('/api/admin/login', { method: 'POST', body: { password: 'mal' } })).status, 401);
  const login = await call('/api/admin/login', { method: 'POST', body: { password: 'secreto' } });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/admin/overview', { cookie })).status, 200);
  assert.equal((await call('/api/admin/overview', { cookie: 'pentinats_admin=admin.9999999999.falso' })).status, 401);

  const svc = (await call('/api/info')).data.services[0];
  const manual = await call('/api/admin/bookings', { method: 'POST', cookie, body: { serviceId: svc.id, date: MONDAY, time: '10:00', name: 'Por teléfono' } });
  assert.equal(manual.status, 201);
  const clash = await call('/api/admin/bookings', { method: 'POST', cookie, body: { serviceId: svc.id, date: MONDAY, time: '10:30', name: 'Otra' } });
  assert.equal(clash.status, 409);
  const forced = await call('/api/admin/bookings', { method: 'POST', cookie, body: { serviceId: svc.id, date: MONDAY, time: '10:30', name: 'Otra', force: true } });
  assert.equal(forced.status, 201);

  await call('/api/admin/blocks', { method: 'POST', cookie, body: { date: MONDAY, allDay: true, days: 2 } });
  const slots = await call(`/api/slots?service=${svc.id}&date=${MONDAY}`);
  assert.deepEqual(slots.data.slots, []);
  const day = await call(`/api/admin/day?date=${addDays(MONDAY, 1)}`, { cookie });
  assert.equal(day.data.blocks.length, 1);

  const newSvc = await call('/api/admin/services', { method: 'POST', cookie, body: { name: 'Corte', duration: 30 } });
  assert.equal(newSvc.status, 201);
  assert.equal((await call(`/api/admin/services/${newSvc.data.id}`, { method: 'DELETE', cookie })).status, 200);

  const badHours = await call('/api/admin/settings', { method: 'PUT', cookie, body: { hours: [[['14:00', '09:00']], [], [], [], [], [], []] } });
  assert.equal(badHours.status, 400);
  const closed = await call('/api/admin/settings', { method: 'PUT', cookie, body: { hours: [[], [], [], [], [], [], []] } });
  assert.equal(closed.status, 200);
  assert.equal((await call('/api/info')).data.settings.bookingOpen, false);
});

test('ventana de Fallas y día ya cerrado', async () => {
  const { db } = await setup();
  const settings = { hours: Array(7).fill(HOURS[0]), slotStep: 30, minNoticeMinutes: 120, maxDaysAhead: 120 };
  // En octubre, 120 días no llegan a marzo: la ventana se estira hasta el 19 de marzo.
  assert.equal(effectiveMaxDays(settings, '2026-10-31'), 139);
  // A las 21:00 ya no queda nada hoy: el día cuenta como cerrado, no como completo.
  const [today] = await daySummary(db, settings, '2030-03-04', 1, 60, { date: '2030-03-04', minutes: 1260 });
  assert.deepEqual(today, { date: '2030-03-04', open: false, free: 0 });
});

test('reserva seguida para varias personas', async () => {
  const { call } = await setup();
  const svc = (await call('/api/info')).data.services.find((x) => x.name === 'Trenzas'); // 60 min
  // De 9:00 a 14:00 caben 2 personas (120 min) empezando como muy tarde a las 12:00.
  const two = (await call(`/api/slots?service=${svc.id}&date=${MONDAY}&people=2`)).data.slots;
  assert.ok(two.includes('12:00') && !two.includes('12:30') && !two.includes('13:00'));
  const r = await call('/api/bookings', {
    method: 'POST',
    body: { serviceId: svc.id, date: MONDAY, time: '09:00', name: 'Amparo', phone: '600112233', people: 2, others: ['Lucía'] },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.service, 'Trenzas · 2 personas');
  assert.deepEqual([r.data.start, r.data.end], ['09:00', '11:00']);
  const one = (await call(`/api/slots?service=${svc.id}&date=${MONDAY}`)).data.slots;
  assert.ok(!one.includes('10:00') && one.includes('11:00'), 'ocupa las dos horas seguidas');
});

test('grupo con servicios distintos: orden, horas y nombres', async () => {
  const { call } = await setup();
  const svcs = (await call('/api/info')).data.services;
  const adult = svcs.find((x) => x.name === 'Peinado de fallera'); // 90
  const kid = svcs.find((x) => x.name === 'Peinado de fallera infantil'); // 60
  const slots = (await call(`/api/slots?service=${adult.id}&date=${MONDAY}&extra=${kid.id}`)).data.slots;
  assert.ok(slots.includes('11:30') && !slots.includes('12:00'), '150 min caben hasta las 11:30');
  const r = await call('/api/bookings', {
    method: 'POST',
    body: { serviceId: adult.id, date: MONDAY, time: '09:00', name: 'Amparo', phone: '600112233', extra: [{ serviceId: kid.id, name: 'Lucía' }] },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.service, 'Peinado de fallera + Peinado de fallera infantil');
  assert.deepEqual(r.data.party.map(({ serviceId, price, ...p }) => p), [
    { name: 'Amparo', service: 'Peinado de fallera', start: '09:00', end: '10:30' },
    { name: 'Lucía', service: 'Peinado de fallera infantil', start: '10:30', end: '11:30' },
  ]);
  assert.deepEqual(r.data.party.map((p) => p.serviceId), [adult.id, kid.id]);
  const view = await call(`/api/bookings/${r.data.code}?t=${r.data.token}`);
  assert.equal(view.data.party[1].name, 'Lucía');
  assert.equal(view.data.serviceId, adult.id);
});

test('cambiar la hora: reutiliza el teléfono y cancela la anterior después', async () => {
  const { call } = await setup();
  const svc = (await call('/api/info')).data.services.find((x) => x.name === 'Trenzas');
  const a = await call('/api/bookings', { method: 'POST', body: { serviceId: svc.id, date: MONDAY, time: '09:00', name: 'Amparo', phone: '600112233' } });
  const bad = await call('/api/bookings', { method: 'POST', body: { serviceId: svc.id, date: MONDAY, time: '16:00', name: 'Amparo', replaces: { code: a.data.code, token: 'x' } } });
  assert.equal(bad.status, 404);
  const b = await call('/api/bookings', { method: 'POST', body: { serviceId: svc.id, date: MONDAY, time: '16:00', name: 'Amparo', replaces: { code: a.data.code, token: a.data.token } } });
  assert.equal(b.status, 201, 'sin teléfono: usa el de la cita anterior');
  assert.deepEqual(b.data.replaced, { ok: true, code: a.data.code });
  const old = await call(`/api/bookings/${a.data.code}?t=${a.data.token}`);
  assert.equal(old.data.status, 'cancelled');
  // Mover 30 minutos una cita que se solapa consigo misma también funciona.
  const c = b.data;
  const slots = (await call(`/api/slots?service=${svc.id}&date=${MONDAY}&except=${c.code}&t=${c.token}`)).data.slots;
  assert.ok(slots.includes('16:30'), 'sus propias horas aparecen libres');
  const d = await call('/api/bookings', { method: 'POST', body: { serviceId: svc.id, date: MONDAY, time: '16:30', name: 'Amparo', replaces: { code: c.code, token: c.token } } });
  assert.equal(d.status, 201);
});

test('precio total guardado en la cita', async () => {
  const { db, call } = await setup();
  await db.run("UPDATE services SET price = '50' WHERE name = 'Peinado de fallera'");
  await db.run("UPDATE services SET price = '35,5' WHERE name = 'Peinado de fallera infantil'");
  const svcs = (await call('/api/info')).data.services;
  const adult = svcs.find((x) => x.name === 'Peinado de fallera');
  const kid = svcs.find((x) => x.name === 'Peinado de fallera infantil');
  const r = await call('/api/bookings', { method: 'POST', body: { serviceId: adult.id, date: MONDAY, time: '09:00', name: 'Amparo', phone: '600112233', extra: [{ serviceId: kid.id, name: 'Lucía' }] } });
  assert.equal(r.data.price, '85,50');
  assert.deepEqual(r.data.party.map((p) => p.price), ['50', '35,50']);
  const sinPrecio = svcs.find((x) => x.name === 'Trenzas');
  const r2 = await call('/api/bookings', { method: 'POST', body: { serviceId: sinPrecio.id, date: MONDAY, time: '16:00', name: 'Ana', phone: '600112233' } });
  assert.equal(r2.data.price, '', 'sin precio no se inventa');
});

test('avisos a Miguel por Telegram y WhatsApp', async () => {
  const { nodeAdapter: _n, saveSettings: _s } = { nodeAdapter, saveSettings };
  const db = await nodeAdapter(':memory:');
  await saveSettings(db, { hours: HOURS, slotStep: 30 });
  const sent = [];
  const fakeFetch = async (u, o) => (sent.push([String(u), o?.body || '']), { ok: true });
  const api = createApi({ db, adminPassword: 'x', now: () => NOW, notifyEnv: { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '42', CALLMEBOT_PHONE: '+34600', CALLMEBOT_APIKEY: 'K' }, fetchImpl: fakeFetch });
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  const post = (path, body) => api(new Request(`http://local${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), ctx);
  const svc = (await (await api(new Request('http://local/api/info'), ctx)).json()).services[2];
  const r = await (await post('/api/bookings', { serviceId: svc.id, date: MONDAY, time: '09:00', name: 'Ana', phone: '600112233' })).json();
  await Promise.all(pending);
  assert.equal(sent.length, 2);
  assert.ok(sent[0][0].includes('api.telegram.org/botT/sendMessage') && JSON.parse(sent[0][1]).text.includes('Nueva cita'));
  assert.ok(sent[1][0].includes('callmebot') && decodeURIComponent(sent[1][0]).includes('Ana'));
  await post(`/api/bookings/${r.code}/cancel`, { token: r.token });
  await Promise.all(pending);
  assert.ok(JSON.parse(sent[2][1]).text.includes('Cita cancelada'));
});

test('próximas: incluye citas a más de 90 días (Fallas)', async () => {
  const { call } = await setup();
  const login = await call('/api/admin/login', { method: 'POST', body: { password: 'secreto' } });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const svc = (await call('/api/info')).data.services[0];
  const far = addDays(NOW.date, 200);
  await call('/api/admin/bookings', { method: 'POST', cookie, body: { serviceId: svc.id, date: far, time: '10:00', name: 'Lejana', force: true } });
  const up = await call('/api/admin/upcoming', { cookie });
  assert.ok(up.data.bookings.some((b) => b.date === far));
});

test('hora de Madrid', () => {
  assert.deepEqual(nowInMadrid(new Date('2030-07-01T22:30:00Z')), { date: '2030-07-02', minutes: 30 });
});

test('fichas de clientas: agrupar por teléfono, buscar e historial', async () => {
  const { call } = await setup();
  const login = await call('/api/admin/login', { method: 'POST', body: { password: 'secreto' } });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const svc = (await call('/api/info')).data.services[0];
  const book = (date, time, name, phone) => call('/api/admin/bookings', { method: 'POST', cookie, body: { serviceId: svc.id, date, time, name, phone, force: true } });
  await book(addDays(NOW.date, -30), '10:00', 'María José', '600 11 22 33');
  await book(addDays(NOW.date, -3), '10:00', 'Mª José Pérez', '+34600112233');
  await book(MONDAY, '10:00', 'Mª José Pérez', '600112233');
  await book(MONDAY, '12:00', 'Lucía', '');
  const all = await call('/api/admin/clients', { cookie });
  assert.equal(all.status, 200);
  assert.equal(all.data.total, 2, 'mismo teléfono con distinto formato = la misma clienta');
  const mj = all.data.clients.find((c) => c.phone);
  assert.equal(mj.name, 'Mª José Pérez', 'manda el nombre de la cita más reciente');
  assert.equal(mj.visits, 2);
  assert.equal(mj.nextDate, MONDAY);
  assert.equal((await call('/api/admin/clients?q=lucia', { cookie })).data.clients[0].name, 'Lucía', 'sin acentos');
  assert.equal((await call('/api/admin/clients?q=22%2033', { cookie })).data.total, 1, 'por trozo de teléfono');
  const det = await call(`/api/admin/clients/${encodeURIComponent(mj.key)}`, { cookie });
  assert.equal(det.data.bookings.length, 3);
  assert.equal((await call('/api/admin/clients/nadie', { cookie })).status, 404);
  assert.equal((await call('/api/admin/clients')).status, 401, 'solo con sesión');
});

test('resumen diario de las citas de mañana', async () => {
  const { db, call } = await setup();
  const env = { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '42' };
  const sent = [];
  const fakeFetch = async (u, o) => (sent.push(JSON.parse(o.body).text), { ok: true });
  const eve = { date: addDays(MONDAY, -1), minutes: 1140 };
  // Sin citas mañana: no se envía nada (salvo si se fuerza desde el panel).
  assert.equal((await sendDailySummary({ db, env, now: eve, fetchImpl: fakeFetch })).reason, 'sin-citas');
  const svcs = (await call('/api/info')).data.services;
  await call('/api/bookings', { method: 'POST', body: { serviceId: svcs[0].id, date: MONDAY, time: '16:00', name: 'Bea', phone: '600000002' } });
  await call('/api/bookings', { method: 'POST', body: { serviceId: svcs[0].id, date: MONDAY, time: '09:00', name: 'Ana', phone: '600000001', extra: [{ serviceId: svcs[1].id, name: 'Lucía' }] } });
  const r = await sendDailySummary({ db, env, now: eve, fetchImpl: fakeFetch, siteUrl: 'https://x.dev' });
  assert.equal(r.sent, true);
  const text = sent.at(-1);
  assert.match(text, /Mañana lunes 4 de marzo: 3 personas/);
  assert.ok(text.indexOf('09:00 Ana') < text.indexOf('Lucía') && text.indexOf('Lucía') < text.indexOf('16:00 Bea'), 'en orden');
  assert.ok(text.includes('Tel. 600000001') && text.includes('https://x.dev/admin'));
  // Desactivado en Ajustes: no se envía.
  await saveSettings(db, { dailySummary: false });
  assert.equal((await sendDailySummary({ db, env, now: eve, fetchImpl: fakeFetch })).reason, 'desactivado');
  assert.equal((await sendDailySummary({ db, env: {}, now: eve, fetchImpl: fakeFetch })).reason, 'sin-canales');
});

test('exportar CSV y borrar citas de hace más de un año', async () => {
  const { db, call, api } = await setup();
  const login = await call('/api/admin/login', { method: 'POST', body: { password: 'secreto' } });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const svcs = (await call('/api/info')).data.services;
  await call('/api/bookings', { method: 'POST', body: { serviceId: svcs[0].id, date: MONDAY, time: '09:00', name: 'Ana; "la del 3º"', phone: '600000001', notes: '=HYPERLINK("x")', extra: [{ serviceId: svcs[1].id, name: 'Lucía' }] } });
  await db.run("INSERT INTO bookings (code, token, service_name, date, start_min, end_min, name, phone) VALUES ('VIEJA1','t','Peinado',?,600,660,'=SUMA(1)','1')", addDays(NOW.date, -400));
  const r = await api(new Request('http://local/api/admin/export.csv', { headers: { cookie } }));
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  const bytes = new Uint8Array(await r.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'BOM para que Excel lea los acentos');
  const csv = new TextDecoder().decode(bytes);
  const lines = csv.trim().split('\r\n');
  assert.ok(lines[0].replace(/^\uFEFF/, '').startsWith('Fecha;Hora'));
  assert.equal(lines.length, 4, 'cabecera + vieja + 2 personas del grupo');
  assert.ok(csv.includes('"Ana; ""la del 3º"""'), 'escapa ; y comillas');
  assert.ok(csv.includes(";'=SUMA(1);"), 'un nombre que empieza por = no se abre como fórmula');
  assert.ok(lines.some((l) => l.includes(';Lucía;')));
  const { purgeOldBookings } = await import('../server/maintenance.js');
  assert.equal(await purgeOldBookings(db, NOW.date), 1);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM bookings WHERE code = 'VIEJA1'")).n, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM bookings')).n, 1, 'las recientes se quedan');
  assert.equal((await call('/api/admin/export.csv')).status, 401);
});

test('recordatorio por WhatsApp: texto, enlace y botones del resumen', async () => {
  const { reminderText, waLink } = await import('../public/reminder.js');
  const b = { name: 'Ana García', date: MONDAY, start: '09:30', code: 'ABC123', token: 't k' };
  const text = reminderText(b, { today: addDays(MONDAY, -1), siteUrl: 'https://x.dev/', address: 'Calle del Cid, 12, Paterna' });
  assert.match(text, /^Hola Ana, soy Miguel de la Cruz\. Te recuerdo tu cita mañana lunes 4 a las 9:30 en Calle del Cid, 12, Paterna\./);
  assert.ok(text.includes('https://x.dev/cita?c=ABC123&t=t%20k'));
  assert.match(reminderText(b, { today: '2030-01-01' }), /cita el lunes 4 a las 9:30/);
  assert.equal(waLink('600 11 22 33', 'hola'), 'https://wa.me/34600112233?text=hola');

  const { db, call } = await setup();
  const svcs = (await call('/api/info')).data.services;
  await call('/api/bookings', { method: 'POST', body: { serviceId: svcs[0].id, date: MONDAY, time: '09:00', name: 'Bea López', phone: '600000002' } });
  const bodies = [];
  const fakeFetch = async (u, o) => (bodies.push(JSON.parse(o.body)), { ok: true });
  await sendDailySummary({ db, env: { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '42' }, now: { date: addDays(MONDAY, -1), minutes: 1140 }, fetchImpl: fakeFetch, siteUrl: 'https://x.dev' });
  const [btn] = bodies[0].reply_markup.inline_keyboard.flat();
  assert.equal(btn.text, '📲 Recordar a Bea (09:00)');
  assert.ok(btn.url.startsWith('https://wa.me/34600000002?text='));
  assert.match(decodeURIComponent(btn.url), /Hola Bea.*mañana lunes 4 a las 9:00 en Calle del Cid, 12, bajo, Paterna.*\/cita\?c=/s);
});
