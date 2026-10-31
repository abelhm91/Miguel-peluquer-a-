# Design

Web de salón estándar (elección del dueño) con el listón de calidad de Booksy / Fresha: perfil, servicios con duración y un flujo de reserva directo. Sin tematización; la marca vive en el medallón del logo y en el dorado como acento.

## Tokens (`public/styles.css`)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#ffffff` | Fondo de la web pública |
| `--surface` / `--surface-2` | `#f6f5f3` / `#eeece9` | Fondo del panel, estados vacíos, esqueletos, días cerrados |
| `--ink` / `--ink-2` / `--muted` | `#161314` / `#3b3537` / `#6a6264` | Texto, botones primarios, elementos seleccionados |
| `--line` / `--line-strong` | `#e5e1de` / `#cfc9c5` | Separadores / bordes de controles |
| `--gold` / `--gold-ink` / `--gold-soft` | `#b48b3c` / `#7d5f22` / `#f6efe1` | Solo marca: anillo del logo, anillo de foco, etiqueta «Web», avisos informativos |
| `--ok` / `--danger` (+ `-soft`) | `#1f7a4d` / `#b3261e` | Abierto/confirmada · cerrado/cancelar/errores |
| Radios | 8 / 12 / 20 px, píldora 999px | Controles 12, tarjetas 20, botones y chips en píldora |
| Sombras | `--shadow-1`, `--shadow-2` | Siempre con desplazamiento y desenfoque suave |
| Movimiento | `--ease-out: cubic-bezier(0.16,1,0.3,1)`, 140–320 ms | Entrada del flujo, aparición del botón superior y confirmación con un pequeño «pop» |

Tipografía: **Figtree** (400–800) para todo, con cifras tabulares. Titulares en 800 con tracking −0.02/−0.035em.

## Componentes

- **Botón**: píldora negra de 48 px (primario), contorno (`--ghost`), `--danger`, `--small`, estado `is-loading` con spinner.
- **Chip** de categoría: píldora con borde, negra cuando está activa (`aria-current`).
- **Fila de servicio**: nombre, descripción, duración y precio opcional, con «Reservar» de contorno a la derecha y separadores finos.
- **Flujo de reserva**: `<dialog>` a pantalla completa con pasos (Servicio — Hora — Datos), resumen fijo a la derecha en escritorio y barra inferior en móvil. Días en píldoras de 64 px (los cerrados o completos, tachados sobre `--surface`), horas en rejilla de botones de 48 px agrupadas en Mañana y Tarde.
- **Resguardo** (ticket): servicio, fecha, dirección y código con separador discontinuo.
- **Panel**: barra con pestañas en píldora, tarjetas de cita (hora | persona | acción) y bloqueos con rayado diagonal (convención de calendario para el tiempo no disponible).

## Reglas

- Claro siempre: se usa con el móvil a la luz del día, desde Instagram.
- El dorado nunca va en texto pequeño (no llega al contraste necesario); el texto va siempre en tinta.
- Nada inventado: no hay precios, reseñas ni fotos de ejemplo en la interfaz.
