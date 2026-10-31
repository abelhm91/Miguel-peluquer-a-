---
target: portada (La temporada) y flujo de reserva
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/Miguel-peluquer-a-/public/index.html"
target_fingerprint: "sha256:083b7a0777985cfdcfe8ce25538de015448f48d70bb669dd350146540c1ff157"
target_path: /home/user/Miguel-peluquer-a-/public/index.html
timestamp: 2026-10-31T20-22-17Z
slug: public-index-html
---
Method: dual-agent (A: design review · B: detector + browser)

Design Health 27/40 (Acceptable, near Good). H1 3 · H2 2 · H3 3 · H4 3 · H5 3 · H6 3 · H7 2 · H8 3 · H9 3 · H10 2.
Context: first run after the structural redesign "La temporada de Miguel" (not like-for-like with 27→28→29 on the profile structure).

Specificity: now product-specific (Fallas 2027, countdown, Plantà/Ofrenda/Cremà live tiles, seal, season spine, ticket). Light chapters (#celebraciones, #todo-el-ano) fall back to a generic service list.
Detector: CLI cramped-padding x3 on section.season (false positives: .wrap carries padding). Overlay clean on home, dialog, ticket at 1440/390. No errors, no overflow, scroll 0 deviations. Contrast season marks 5.46–9.42, .fday__free 10.67. 390: no targets <44 except ticket "Ver o cancelar" 147x18. 1440: nav 39px, .btn--small 38px, footer links 18px. .fday text 12px.

Priority issues:
- [P1] "Abril – septiembre" chapter vs booking window ending 19 Mar. Fix: longer window (Miguel's setting) or honest copy + route for later dates. (clarify)
- [P1] Mobile Hora step overloaded; slots below fold with 2 people. Fix: collapse people row, move window note to strip end, hide Fallas UI for non-fallera, centre selected day. (distill, layout)
- [P2] Homepage .fday counts stale and read as places. Fix: refetch on visibility/close, qualitative states, tag for 16th. (clarify)
- [P2] boot() failure writes to missing #services → endless skeletons; /cita lacks reschedule. (harden)
- [P3] Light chapters read as a menu. (bolder)

Personas: Jordan ("11 huecos", April–Sept vs March, mother's name on child's service), Riley (skeleton on API failure, stale counts, stale service on generic CTA, no reschedule), Casey (slots below fold, 3-line foot summary, copy link below fold), Amparo (fixed order, no arrival/aderezo guidance).
