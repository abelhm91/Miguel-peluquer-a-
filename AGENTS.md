# Guía para agentes (Codex, Claude Code…)

Web y agenda de reservas de Miguel de la Cruz · Pentinats (peluquería en Paterna, Valencia).
Producción: Cloudflare Worker `miguel-peluquer-a` + base de datos D1 `pentinats-reservas`.

## Cómo se ejecuta

- Node 22.13 o superior. Sin dependencias en tiempo de ejecución (solo `wrangler` para desplegar).
- `npm install` → `npm test` (node --test, deben pasar todos).
- `ADMIN_PASSWORD=demo npm run dev` → http://localhost:3000 (panel en `/admin`).
- `npm run demo` rellena `data/demo.db` con citas de ejemplo (`DATABASE_FILE=data/demo.db`).

## Estructura

- `server/app.js`: API compartida (`createApi` → `handleApi(req, ctx)`), pública y de administración.
- `server/availability.js`: horario, huecos libres, ventana de Fallas (`effectiveMaxDays`).
- `server/db.js`: adaptadores `d1Adapter` (Cloudflare) y `nodeAdapter` (node:sqlite) con la misma interfaz async `get/all/run/batch`; ajustes por defecto.
- `server/notify.js`: avisos a Miguel por Telegram / WhatsApp (CallMeBot).
- `worker.js`: entrada en Cloudflare. `server.js`: servidor local de Node (mapa `PAGES` de rutas → html).
- `migrations/*.sql`: esquema D1. Nunca edites una migración ya aplicada; crea `000N_*.sql` nueva.
- `public/`: web estática (index, cita, admin, aviso-legal, privacidad) sin build ni framework.
- `test/reservas.test.js`: pruebas de la API completa.

## Reglas del proyecto

- Todos los textos de la web pública van en español y en primera persona, como si hablara Miguel.
- No inventar datos reales (teléfono, horario, reseñas, fotos). Lo que falte se marca como pendiente.
- Las reservas se insertan de forma atómica (`INSERT … SELECT … WHERE NOT EXISTS`); no romper eso.
- Diseño: ver `DESIGN.md` (negro y dorado, títulos en Jost). Producto y tono: `PRODUCT.md`.
- Los secretos (`ADMIN_PASSWORD`, `SESSION_SECRET`, `TELEGRAM_*`, `CALLMEBOT_*`) viven en Cloudflare como Secret, nunca en el repositorio.
- Antes de terminar: `npm test` en verde.

## Trabajo en equipo (Codex + Claude Code)

- La rama `ccr-18341c75-w354or` es producción: Cloudflare la publica sola. Nadie hace commits directos en ella.
- Cada agente trabaja en su propia rama (`codex/<tarea>` o `claude/<tarea>`) y abre un pull request hacia `ccr-18341c75-w354or`.
- El reparto está en `TAREAS.md`. Toca solo los archivos de tu zona; si necesitas cambiar uno de la otra zona, hazlo en un PR pequeño y dilo en la descripción.
- Al empezar una tarea, márcala `en curso` en `TAREAS.md`; al abrir el PR, `en revisión (PR #…)`.
- Antes de abrir el PR: actualiza tu rama con la de producción y deja `npm test` en verde.
