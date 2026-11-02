# Tareas y reparto

Tablero compartido entre Codex y Claude Code. Cada tarea tiene un dueño; nadie toca
una tarea de otro sin cambiar antes aquí el dueño.

Estados: `pendiente` · `en curso` · `en revisión (PR #…)` · `hecha`

## Codex: web pública (`public/index.html`, `public/app.js`, `public/home.css`, `public/site.css`)

| # | Tarea | Estado |
|---|---|---|
| C1 | SEO local: `robots.txt`, `sitemap.xml` y datos estructurados JSON-LD (`HairSalon`) en la portada | hecha |
| C2 | Imagen para compartir en WhatsApp/redes (1200×630, negro y dorado) y metas `og:`/`twitter:` | hecha |
| C3 | Galería de trabajos preparada para fotos (huecos marcados como pendientes hasta que Miguel las pase) | pendiente |
| C4 | Revisión de accesibilidad de la portada y del diálogo de reserva (teclado, foco, contraste) | pendiente |

## Claude Code: servidor y panel (`server/`, `worker.js`, `migrations/`, `public/admin.*`, `test/`)

| # | Tarea | Estado |
|---|---|---|
| A1 | Resumen diario a Miguel por Telegram con las citas de mañana (Cron Trigger de Cloudflare) | hecha |
| A2 | Ficha de clientas en el panel: buscar por nombre o teléfono y ver su historial de citas | hecha |
| A3 | Exportar citas a CSV desde el panel | hecha |
| A4 | Borrado automático de citas con más de un año (lo promete la política de privacidad) | hecha |
| A5 | Recordatorio por WhatsApp a la clienta el día antes (botones en el resumen de Telegram y en el panel) | hecha |
| A6 | Pasar las skills de Emil Kowalski a toda la web (movimiento, tacto en móvil, datos extremos). Toca CSS de la zona de Codex: avisado | en revisión |

## Pendiente de Miguel (nadie lo programa)

- Precios reales, horario definitivo, nombre y NIF en Ajustes → Datos legales.
- Fotos de sus trabajos.
- Dominio.
