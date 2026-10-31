# Miguel de la Cruz · Pentinats — web y reservas

Web de la peluquería de Miguel de la Cruz (Calle del Cid, 12, bajo · Paterna), con **reserva online sobre una agenda real** y un **panel privado** para Miguel.

- **Web pública (`/`)**: perfil, servicios (falleras, trenzas, peinados y recogidos, novias, mechas), horario, mapa e Instagram.
- **Reserva**: servicio → día → hora libre → datos → confirmación con código, enlace para cancelar y botón *Añadir al calendario*. Solo se ofrecen huecos que de verdad están libres según el horario, la duración del servicio, las citas existentes y los bloqueos; dos personas no pueden coger la misma hora.
- **Consultar o cancelar (`/cita`)**: cada clienta recibe su enlace privado.
- **Panel (`/admin`)**: agenda por día, próximas citas, añadir citas a mano (las de teléfono o WhatsApp), cancelar o recuperar citas, bloquear horas o días (vacaciones, festivos), editar el horario semanal, los servicios (duración, precio opcional, visible o no) y los datos de contacto.

Se publica en **Cloudflare Workers + D1** (gratis para este volumen). El mismo código funciona también con Node 22 y SQLite en local.

## Publicar en Cloudflare (recomendado, plan gratuito)

La web se publica como un **Cloudflare Worker**: las páginas de `public/` se sirven como archivos estáticos y la agenda vive en una base de datos **D1**. Configuración en `wrangler.jsonc`, código del Worker en `worker.js`.

Desde un ordenador con Node 22 instalado, dentro de la carpeta del proyecto:

```bash
npm install
npx wrangler login                                   # abre el navegador para entrar en tu cuenta de Cloudflare
npx wrangler d1 create pentinats-reservas            # crea la base de datos y muestra su "database_id"
#   → copia ese id en wrangler.jsonc, en "database_id"
npm run cf:migrate                                   # crea las tablas y los servicios iniciales
npx wrangler secret put ADMIN_PASSWORD               # contraseña del panel de Miguel
npx wrangler secret put SESSION_SECRET               # cualquier texto largo y aleatorio
npm run deploy                                       # publica: https://pentinats-reservas.<tu-subdominio>.workers.dev
```

Para usar un dominio propio (por ejemplo `migueldelacruz.es`): en el panel de Cloudflare → *Workers & Pages* → `pentinats-reservas` → *Settings* → *Domains & Routes* → *Add custom domain*.

Para publicar solo con cada `git push`: *Workers & Pages* → *Create* → *Import a repository* → este repositorio (comando de despliegue `npx wrangler deploy`). La base de datos, las migraciones y los dos secretos se crean una vez, como arriba.

Copia de seguridad de la agenda: `npx wrangler d1 export pentinats-reservas --remote --output copia.sql`.

## Desarrollo en local

```bash
npm test                                             # pruebas de disponibilidad, reservas y panel
npm run cf:dev                                       # simula Cloudflare (Worker + D1) en http://localhost:8787
                                                     #   necesita un fichero .dev.vars con ADMIN_PASSWORD=... y SESSION_SECRET=...
```

También funciona con Node solo, sin Cloudflare, con SQLite en un fichero:

```bash
ADMIN_PASSWORD='una-contraseña' npm start            # http://localhost:3000   (panel: /admin)
npm run demo                                         # crea data/demo.db con un horario y citas de EJEMPLO
DATABASE_FILE=data/demo.db ADMIN_PASSWORD=demo npm start
```

| Variable | Para qué sirve |
|---|---|
| `ADMIN_PASSWORD` | Contraseña del panel. Sin ella el panel está desactivado. |
| `SESSION_SECRET` | Texto aleatorio largo para firmar la sesión del panel. |
| `DATABASE_FILE` | (Solo Node) ruta de la base de datos, por defecto `data/reservas.db`. |
| `PORT` | (Solo Node) puerto, por defecto 3000. |

### Primer paso para Miguel

La web arranca **sin horario**: hasta que Miguel lo pone, la reserva online aparece como «abrirá muy pronto» y se invita a escribirle por Instagram. Entrar en `/admin` → **Horario**, marcar los días y tramos y guardar. En **Ajustes** se añaden teléfono y WhatsApp, y en **Servicios** se revisan las duraciones (los valores iniciales son orientativos) y, si se quiere, los precios.

## Pendiente de datos reales

- Teléfono / WhatsApp, horario y precios: se rellenan desde el panel.
- El logo (`public/assets/logo-pentinats.png`) está recortado de una captura de Instagram en baja resolución: conviene sustituirlo por el archivo original.
- No hay fotos de trabajos en la web; la sección «Sobre Miguel» enlaza a Instagram.
