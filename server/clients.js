// Fichas de clientas para el panel: se agrupan las citas por teléfono
// (o por nombre, en citas apuntadas a mano sin teléfono).

const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Clave estable de una clienta: los 9 últimos dígitos del teléfono, o `n:` + nombre. */
export function clientKey(phone, name) {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (d.length >= 6) return d.length > 9 ? d.slice(-9) : d;
  return `n:${fold(name)}`;
}

const num = (v) => {
  const m = String(v ?? '').trim().replace(/\s*€$/, '').match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  return m ? Number(`${m[1]}.${m[2] || 0}`) : 0;
};

/** Resume una lista de filas de `bookings` (más recientes primero) en fichas. */
export function groupClients(rows, today) {
  const map = new Map();
  for (const r of rows) {
    const key = clientKey(r.phone, r.name);
    let c = map.get(key);
    if (!c) {
      // La primera fila es la más reciente: su nombre, teléfono y correo mandan.
      c = { key, name: r.name, phone: r.phone || '', email: r.email || '', visits: 0, upcoming: 0, cancelled: 0, spent: 0, lastVisit: '', nextDate: '', lastActivity: r.date };
      map.set(key, c);
    }
    if (!c.email && r.email) c.email = r.email;
    if (r.status !== 'confirmed') c.cancelled++;
    else if (r.date < today) {
      c.visits++;
      c.spent += num(r.price);
      if (!c.lastVisit || r.date > c.lastVisit) c.lastVisit = r.date;
    } else {
      c.upcoming++;
      if (!c.nextDate || r.date < c.nextDate) c.nextDate = r.date;
    }
  }
  return [...map.values()];
}

/** ¿Encaja la ficha con lo buscado? Nombre sin acentos o trozo de teléfono. */
export function matchesClient(c, q) {
  const t = fold(q);
  if (!t) return true;
  const digits = t.replace(/\D/g, '');
  if (digits.length >= 3 && String(c.phone).replace(/\D/g, '').includes(digits)) return true;
  return fold(c.name).includes(t);
}
