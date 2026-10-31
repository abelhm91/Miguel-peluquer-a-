import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeAdapter, saveSettings } from '../server/db.js';
import { createApi } from '../server/app.js';
import { freeSlots } from '../server/availability.js';
import { addDays, nowInMadrid } from '../server/time.js';

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
  return { db, call };
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
  assert.deepEqual(await freeSlots(db, settings, addDays(MONDAY, 11), 30, now), []);
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

test('hora de Madrid', () => {
  assert.deepEqual(nowInMadrid(new Date('2030-07-01T22:30:00Z')), { date: '2030-07-02', minutes: 30 });
});
