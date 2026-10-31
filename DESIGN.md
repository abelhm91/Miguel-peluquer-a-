# Design

**La temporada de Miguel** (estructura elegida por el dueño, sustituye a la ficha tipo Booksy/Fresha). La página se lee como el año del salón y no como una lista de servicios: capítulos a pantalla completa unidos por una **espina dorada vertical** con etiquetas de temporada (Marzo · Abril–septiembre · Todo el año · El salón).

1. **Fallas** (negro, primera pantalla): «Fallas 2027» enorme en Jost, Miguel de la Cruz en la entradilla, cuenta atrás a la plantà, conmutador Adulta/Infantil y los cinco días 15–19 de marzo (Plantà · Ofrenda · Cremà) con su disponibilidad en palabras (Libre · Pocas horas · Completo), que se actualiza al volver a la pestaña o al cerrar la reserva; cada día abre la reserva en ese día. Sello con anillos a la derecha en escritorio.
2. **Bodas, comuniones y celebraciones** (blanco): por momentos (La novia · Invitadas · Comuniones), cada uno con su texto y los botones de los servicios que le corresponden; se puede reservar con hasta un año de antelación.
3. **Todo el año** (piedra): Trenzas, Peluquería y cualquier categoría nueva.
4. **El salón** (negro): qué significa «Pentinats», estado de apertura, mapa, horario, contacto e Instagram.

En la reserva, «¿Para cuántas personas?» es una sola línea («Para 1 persona · Añadir otra persona») hasta que se añade alguien; lo de Fallas solo aparece en servicios de fallera. En `/cita`, «Cambiar el día o la hora» reserva la nueva cita y solo después cancela la anterior. La marca: noche y oro del logo, Jost para display, Figtree para texto.

## Tokens (`public/styles.css`)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#ffffff` | Fondo de la web pública |
| `--surface` / `--surface-2` | `#f6f5f3` / `#eeece9` | Fondo del panel, estados vacíos, esqueletos, días cerrados |
| `--ink` / `--ink-2` / `--muted` | `#161314` / `#3b3537` / `#6a6264` | Texto, botones primarios, elementos seleccionados |
| `--line` / `--line-strong` | `#e5e1de` / `#cfc9c5` | Separadores / bordes de controles |
| `--gold` / `--gold-ink` / `--gold-soft` | `#b48b3c` / `#7d5f22` / `#f6efe1` | Solo marca: anillo del logo, anillo de foco, etiqueta «Web», avisos informativos |
| `--night` / `--night-2` / `--night-line` | `#100d0c` / `#1c1715` / `#3a302b` | Bandas negras, barra superior, pie |
| `--ivory` / `--ivory-2` | `#f4eee5` / `#c9bfb2` | Texto sobre negro |
| `--gold-bright` | `#d4b06a` | Oro sobre negro: segunda línea del nombre, botones dorados, anillos del sello, iconos |
| `--ok` / `--danger` (+ `-soft`) | `#1f7a4d` / `#b3261e` | Abierto/confirmada · cerrado/cancelar/errores |
| Radios | 8 / 12 / 20 px, píldora 999px | Controles 12, tarjetas 20, botones y chips en píldora |
| Sombras | `--shadow-1`, `--shadow-2` | Siempre con desplazamiento y desenfoque suave |
| Movimiento | `--ease-out: cubic-bezier(0.16,1,0.3,1)`, 140–320 ms | Entrada del flujo, aparición del botón superior y confirmación con un pequeño «pop» |

Tipografía: **Jost** (se cargan 400–600; los títulos usan 600), sans-serif geométrica de la familia de Futura, para display —nombre, títulos de sección, especialidades, cita de «Sobre Miguel», categorías y la marca «PENTINATS» en mayúsculas espaciadas— (elegida por el dueño: quería títulos en sans geométrica); **Figtree** (400–700) para texto, controles y cifras tabulares.

## Componentes

- **Botón**: píldora negra de 48 px, dorada (`--gold`: la acción principal en toda la web y en la reserva), línea marfil (`--line`, sobre negro), contorno (`--ghost`), `--danger`, `--small`, estado `is-loading` con spinner.
- **Chip** de categoría: píldora con borde, negra cuando está activa (`aria-current`).
- **Fila de servicio**: nombre, descripción, duración y precio opcional, con «Reservar» de contorno a la derecha y separadores finos.
- **Flujo de reserva**: `<dialog>` a pantalla completa con pasos (Servicio — Hora — Datos), resumen fijo a la derecha en escritorio y barra inferior en móvil. Días en píldoras de 64 px (los cerrados o completos, tachados sobre `--surface`), horas en rejilla de botones de 48 px agrupadas en Mañana y Tarde.
- **Resguardo** (ticket): cabecera negra con el sello, «PENTINATS» en dorado y el código; borde troquelado; cuerpo blanco con servicio, fecha y dirección. Se usa en la confirmación y en `/cita`. Acciones: «Enviármela por WhatsApp» (dorado), calendario (.ics con el enlace de cancelar) y copiar enlace.
- **Sello** (`public/assets/logo-sello.png`): el medallón del logo recortado sin el rótulo caligráfico (que en la captura sale cortado). Se usa en todos los tamaños pequeños y en la portada; el logo completo solo queda para la imagen al compartir.
- **Personas y meses**: en el paso de la hora, un contador «¿Para cuántas personas?» (1–4) reserva citas seguidas como una sola cita con la duración total («· 2 personas»); el mes es un desplegable en píldora para saltar a cualquier mes reservable.
- **Horas**: cada 30 min por defecto, agrupadas en Mañana / Mediodía / Tarde, 6 por franja y «Ver todas las horas». Atajo «Ir a Fallas · 15–19 mar» en la barra de fechas (en móvil, en su propia línea; elige el primer día libre desde el 15 y los días 15–19 llevan nota dorada «Fallas») y aviso dorado al llegar al final del calendario (que siempre llega hasta el 19 de marzo siguiente).
- **Panel**: barra con pestañas en píldora, tarjetas de cita (hora | persona | acción) y bloqueos con rayado diagonal (convención de calendario para el tiempo no disponible).

- **Sello de portada**: medallón del logo dentro de dos anillos dorados finos con el texto «PEINADOS · FALLERAS · TRENZAS · RECOGIDOS · PATERNA» en círculo. Único momento de movimiento: el sello gira hasta su sitio y el titular sube al cargar.

## Reglas

- Contraste por bandas: el negro es la marca y el blanco es donde se trabaja (servicios, reserva, panel). El flujo de reserva y el panel siguen en claro.
- El dorado claro solo va sobre negro; sobre blanco se usa `--gold-ink`. El `--gold` medio nunca va en texto pequeño (no llega al contraste necesario); el texto va siempre en tinta.
- Nada inventado: no hay precios, reseñas ni fotos de ejemplo en la interfaz.
