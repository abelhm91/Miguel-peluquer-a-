# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: Node.js ≥ 22 sin dependencias externas (servidor `node:http` + base de datos `node:sqlite` en un fichero). Elegido porque el cliente pidió un sistema de agenda real (huecos ocupados, panel para el peluquero, confirmación automática) y así se despliega en cualquier hosting Node con disco persistente sin cuentas de terceros.

## Users

- **Clientas y clientes de Paterna y alrededores** que reservan desde el móvil, normalmente llegando desde Instagram (@peinados.migueldelacruz). Trabajos confirmados por el dueño:
  - Falleras: peinado de fallera para Fallas y actos falleros, a menudo reservado con mucha antelación.
  - Trenzas (de chica y de chico).
  - Peinados y recogidos para bodas y eventos.
  - Peluquería del día a día (mechas, etc.).
- **Miguel de la Cruz**, el peluquero, que gestiona su agenda desde el panel privado.

## Product Purpose

Que una clienta pueda ver qué hace Miguel y reservar una cita en un hueco libre real, sin escribir mensajes de ida y vuelta, y que Miguel tenga la agenda en un solo sitio. El éxito es una reserva confirmada sin intervención y sin solapes.

## Positioning

Peluquería de autor especializada en peinados de fallera, trenzas y recogidos: el oficio del peinado valenciano tradicional (marca "Pentinats", peinados en valenciano), no una cadena de cortes.

## Operating Context

- Local: Calle del Cid nº 12, bajo, Paterna (Valencia).
- El calendario fallero (marzo) concentra la demanda de peinados de fallera.
- Instagram es el escaparate principal (2.697 publicaciones, 6.112 seguidores en la captura del perfil aportada).

## Capabilities and Constraints

- Reserva online con servicio, día y hora libre calculados según horario, duración del servicio, citas existentes y bloqueos.
- Confirmación automática con código de reserva y enlace para cancelar.
- Panel privado con contraseña: agenda, cancelar citas, bloquear días/horas, editar horario, servicios y datos de contacto.
- **Pendiente de dato real (no inventar):** teléfono/WhatsApp, horario de apertura, precios. El horario y el teléfono se rellenan desde el panel; mientras no haya horario, la reserva online muestra que aún no está abierta.
- Duraciones de servicio: valores iniciales orientativos, editables por Miguel.

## Brand Commitments

- Nombre: Miguel de la Cruz. Marca en el logo: "Pentinats". Usuario de Instagram: peinados.migueldelacruz.
- Logo existente: medallón negro con marco dorado ornamentado, retrato y rótulo caligráfico "Miguel de la Cruz" (solo disponible en baja resolución desde una captura de Instagram).
- Idioma: español.
- Preferencia de diseño (elegida por el dueño, 2026-10-31): web de salón estándar, sin tematización fallera; el listón de calidad y de flujo de reserva es Booksy / Fresha.
- Logo recortado de la captura en `public/assets/logo-pentinats.png` (204 px, baja resolución: sustituir por el original cuando exista).

## Evidence on Hand

- Captura del perfil de Instagram (nombre, dirección, especialidades, logo, destacados "FALLERAS 2027", "trenzas chico'25", "mechas").
- No hay fotos de trabajos, reseñas, precios ni horario en el repositorio: no fabricar ninguno.

## Product Principles

1. Reservar un hueco libre real en menos de un minuto desde el móvil.
2. La especialidad fallera es el orgullo del negocio: se ve primero.
3. Nada inventado: lo que no ha dado el dueño queda configurable, no rellenado.
4. Miguel controla su agenda sin depender de nadie técnico.

## Accessibility & Inclusion

Clientela de todas las edades (madres de falleras infantiles, abuelas): texto grande, alto contraste, formulario simple, objetivos táctiles amplios.
