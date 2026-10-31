# Miguel de la Cruz · Pentinats — web y reservas

Web de la peluquería de Miguel de la Cruz (Calle del Cid, 12, bajo · Paterna), con **reserva online sobre una agenda real** y un **panel privado** para Miguel.

- **Web pública (`/`)**: perfil, servicios (falleras, trenzas, peinados y recogidos, novias, mechas), horario, mapa e Instagram.
- **Reserva**: servicio → día → hora libre → datos → confirmación con código, enlace para cancelar y botón *Añadir al calendario*. Solo se ofrecen huecos que de verdad están libres según el horario, la duración del servicio, las citas existentes y los bloqueos; dos personas no pueden coger la misma hora.
- **Consultar o cancelar (`/cita`)**: cada clienta recibe su enlace privado.
- **Panel (`/admin`)**: agenda por día, próximas citas, añadir citas a mano (las de teléfono o WhatsApp), cancelar o recuperar citas, bloquear horas o días (vacaciones, festivos), editar el horario semanal, los servicios (duración, precio opcional, visible o no) y los datos de contacto.

Sin dependencias: Node.js 22.13 o superior, con base de datos SQLite (`node:sqlite`) en un único fichero.

## Puesta en marcha

```bash
ADMIN_PASSWORD='una-contraseña-larga' npm start
# → http://localhost:3000   (panel: http://localhost:3000/admin)
```

| Variable | Para qué sirve |
|---|---|
| `ADMIN_PASSWORD` | Contraseña del panel. Sin ella el panel está desactivado. |
| `SESSION_SECRET` | Texto aleatorio largo para firmar la sesión. Si no se pone, se cierra la sesión al reiniciar el servidor. |
| `DATABASE_FILE` | Ruta de la base de datos (por defecto `data/reservas.db`). Debe estar en un **disco persistente**. |
| `PORT` | Puerto (por defecto 3000). |
| `NODE_ENV=production` | Marca la cookie de sesión como `Secure` (requiere HTTPS). |

### Primer paso para Miguel

La web arranca **sin horario**: hasta que Miguel lo pone, la reserva online aparece como «abrirá muy pronto» y se invita a escribirle por Instagram. Entrar en `/admin` → **Horario**, marcar los días y tramos y guardar. En **Ajustes** se añaden teléfono y WhatsApp, y en **Servicios** se revisan las duraciones (los valores iniciales son orientativos) y, si se quiere, los precios.

### Probar con datos de ejemplo

```bash
npm run demo                                         # crea data/demo.db con un horario y citas de EJEMPLO
DATABASE_FILE=data/demo.db ADMIN_PASSWORD=demo npm start
npm test                                             # pruebas de disponibilidad, reservas y panel
```

## Publicarla

Sirve cualquier hosting de Node con disco persistente (Railway, Render con *disk*, Fly.io con volumen, un VPS…):

1. Comando de arranque: `npm start`.
2. Variables: `ADMIN_PASSWORD`, `SESSION_SECRET`, `NODE_ENV=production` y `DATABASE_FILE` apuntando al volumen persistente (por ejemplo `/data/reservas.db`).
3. Copia de seguridad: basta con copiar el fichero de la base de datos.

> No vale un hosting solo estático (GitHub Pages, Netlify sin funciones): la agenda necesita el servidor.

## Pendiente de datos reales

- Teléfono / WhatsApp, horario y precios: se rellenan desde el panel.
- El logo (`public/assets/logo-pentinats.png`) está recortado de una captura de Instagram en baja resolución: conviene sustituirlo por el archivo original.
- No hay fotos de trabajos en la web; la sección «Sobre Miguel» enlaza a Instagram.
