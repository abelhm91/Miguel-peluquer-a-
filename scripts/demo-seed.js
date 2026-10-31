// Crea una base de datos de PRUEBA (data/demo.db) con un horario de ejemplo
// y algunas citas ficticias, para ver la web funcionando en local.
// No toca la base de datos real (data/reservas.db).
//
//   npm run demo
//   DATABASE_FILE=data/demo.db ADMIN_PASSWORD=demo npm start
import { rmSync } from 'node:fs';
import { nodeAdapter, saveSettings } from '../server/db.js';
import { addDays, nowInMadrid } from '../server/time.js';

const file = process.env.DATABASE_FILE || 'data/demo.db';
if (file.endsWith('reservas.db')) {
  console.error('Este script es solo para la base de datos de prueba.');
  process.exit(1);
}
for (const f of [file, `${file}-wal`, `${file}-shm`]) rmSync(f, { force: true });

const db = await nodeAdapter(file);
// Horario de EJEMPLO, no el real de Miguel.
await saveSettings(db, {
  hours: [
    [['09:30', '13:30'], ['16:30', '20:00']],
    [['09:30', '13:30'], ['16:30', '20:00']],
    [['09:30', '13:30'], ['16:30', '20:00']],
    [['09:30', '13:30'], ['16:30', '20:00']],
    [['09:30', '20:00']],
    [['08:00', '14:00']],
    [],
  ],
});

const today = nowInMadrid().date;
const sql = `INSERT INTO bookings (code, token, service_id, service_name, date, start_min, end_min, name, phone, notes, source)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const demo = [
  [1, 'DEMO01', 1, 'Peinado de fallera', 570, 660, 'Clienta de prueba', '600000001', 'Fallera infantil, 8 años', 'web'],
  [1, 'DEMO02', 3, 'Trenzas', 1020, 1080, 'Cliente de prueba', '600000002', '', 'admin'],
  [2, 'DEMO03', 7, 'Mechas', 600, 720, 'Clienta de prueba', '600000003', '', 'web'],
];
for (const [d, code, sid, sname, a, b, name, phone, notes, src] of demo) {
  await db.run(sql, code, 'demo', sid, sname, addDays(today, d), a, b, name, phone, notes, src);
}
console.log(`Base de datos de prueba creada en ${file}`);
console.log(`Arranca con:  DATABASE_FILE=${file} ADMIN_PASSWORD=demo npm start`);
