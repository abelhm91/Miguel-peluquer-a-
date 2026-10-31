import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDb, saveSettings } from '../server/db.js';
import { createApp } from '../server/app.js';
import { freeSlots } from '../server/availability.js';
import { addDays, nowInMadrid } from '../server/time.js';

// Lunes fijo para que los tests no dependan del día en que se ejecutan.
const MONDAY = '2030-03-04';
const NOW = { date: '2030-03-01', minutes: 600 };
const HOURS = [[['09:00', '14:00'], ['16:00', '20:00']], [], [], [], [], [], []];

function setup() {
  const db = openDb(':memory:');
  saveSettings(db, { hours: HOURS, slotStep: 30 });
  const handler = createApp({ db, publicDir: new URL('../public', import.meta.url).pathname, adminPassword: 'secreto', now: () => NOW });
  const server = createServer(handler).listen(0);
  const base = `http://localhost:${server.address().port}`;
  const call = async (path, { method = 'GET', body, cookie } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
  };
  return { db, server, call };
}

test('los huecos respetan horario, duración y citas', () => {
  const { db, server } = setup();
  server.close();
  const settings = { hours: HOURS, slotStep: 30, minNoticeMinutes: 120, maxDaysAhead: 120 };
  let slots = freeSlots(db, settings, MONDAY, 90, NOW);
  assert.equal(slots[0], 9 * 60);
  assert.equal(slots.at(-1), 20 * 60 - 90);
  assert.ok(!slots.includes(13 * 60), '13:00 + 90 min se pasa del cierre');
  db.prepare("INSERT INTO bookings (code, token, service_name, date, start_min, end_min, name, phone) VALUES ('AAAAAA','t','x',?,600,660,'a','1')").run(MONDAY);
  slots = freeSlots(db, settings, MONDAY, 60, NOW);
  assert.ok(!slots.includes(570) && !slots.includes(600) && !slots.includes(630));
  assert.ok(slots.includes(540) && slots.includes(660));
  assert.deepEqual(freeSlots(db, settings, addDays(MONDAY, 1), 60, NOW), [], 'martes cerrado');
});

test('antelación mínima y límite de días', () => {
  const { db, server } = setup();
  server.close();
  const settings = { hours: [HOURS[0], HOURS[0], HOURS[0], HOURS[0], HOURS[0], HOURS[0], HOURS[0]], slotStep: 30, minNoticeMinutes: 120, maxDaysAhead: 10 };
  const now = { date: MONDAY, minutes: 600 };
  assert.equal(freeSlots(db, settings, MONDAY, 30, now)[0], 720);
  assert.deepEqual(freeSlots(db, settings, addDays(MONDAY, 11), 30, now), []);
  assert.deepEqual(freeSlots(db, settings, addDays(MONDAY, -1), 30, now), []);
});

test('flujo completo: reservar, no duplicar, cancelar', async () => {
  const { server, call } = setup();
  try {
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

    const bad = await call(`/api/bookings/${r1.data.code}/cancel`, { method: 'POST', body: { token: 'x' } });
    assert.equal(bad.status, 404);
    const ok = await call(`/api/bookings/${r1.data.code}/cancel`, { method: 'POST', body: { token: r1.data.token } });
    assert.equal(ok.data.status, 'cancelled');
    const again = await call(`/api/slots?service=${svc.id}&date=${MONDAY}`);
    assert.ok(again.data.slots.includes('09:00'), 'el hueco vuelve a quedar libre');

    const noPhone = await call('/api/bookings', { method: 'POST', body: { ...body, phone: '12' } });
    assert.equal(noPhone.status, 400);
  } finally {
    server.close();
  }
});

test('panel: requiere sesión, bloquea horas y edita horario', async () => {
  const { server, call } = setup();
  try {
    assert.equal((await call('/api/admin/overview')).status, 401);
    assert.equal((await call('/api/admin/login', { method: 'POST', body: { password: 'mal' } })).status, 401);
    const login = await call('/api/admin/login', { method: 'POST', body: { password: 'secreto' } });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await call('/api/admin/overview', { cookie })).status, 200);

    await call('/api/admin/blocks', { method: 'POST', cookie, body: { date: MONDAY, allDay: true } });
    const svc = (await call('/api/info')).data.services[0];
    const slots = await call(`/api/slots?service=${svc.id}&date=${MONDAY}`);
    assert.deepEqual(slots.data.slots, []);

    const badHours = await call('/api/admin/settings', { method: 'PUT', cookie, body: { hours: [[['14:00', '09:00']], [], [], [], [], [], []] } });
    assert.equal(badHours.status, 400);
    const closed = await call('/api/admin/settings', { method: 'PUT', cookie, body: { hours: [[], [], [], [], [], [], []] } });
    assert.equal(closed.status, 200);
    assert.equal((await call('/api/info')).data.settings.bookingOpen, false);
  } finally {
    server.close();
  }
});

test('hora de Madrid', () => {
  const n = nowInMadrid(new Date('2030-07-01T22:30:00Z'));
  assert.deepEqual(n, { date: '2030-07-02', minutes: 30 });
});
