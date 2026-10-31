---
target: portada y flujo de reserva
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/Miguel-peluquer-a-/public/index.html"
target_fingerprint: "sha256:f38b42c76eaafa96cd8819e405d4c9b9737c3843eb941a29c57da15c29225233"
target_path: /home/user/Miguel-peluquer-a-/public/index.html
timestamp: 2026-10-31T17-54-44Z
slug: public-index-html
---
Method: dual-agent (A: design review · B: detector + browser)

Design Health 28/40 (Good, low edge). H1 3 · H2 3 · H3 3 · H4 3 · H5 3 · H6 3 · H7 2 · H8 3 · H9 3 · H10 2.

Specificity: hero + Falleras card + Fallas shortcut + black/gold ticket authored; services/side card/map standard (owner's choice). Taxonomy repeated three times (specials, chips, group headings).
Detector: CLI cramped-padding x2 on .hero/.about-band (false positives, unchanged). Overlay clean on home, dialog and ticket at 1440 and 390. No console errors, no overflow, fonts load. Small targets at 390: .datebar__nav .icon-btn 19x44, .btn--small 38px, chips 40px. html scroll-behavior smooth (no jank).

Priority issues:
- [P1] Mobile date arrows crushed to 19px by two-line month label + Fallas chip. Fix: fixed 44px arrows, short label, chip on own row on mobile. (adapt)
- [P1] "Fallas · marzo" lands on 6 March, auto-selects it; 15–19 March off-screen. Fix: show/select from 15 March, mark Fallas days, scroll affordance on .days. (clarify, layout)
- [P2] Today shown "Cerrado" in strip while hours table says "Sábado · hoy 8:00–14:00". Fix: "Hoy · ya cerrado". (harden)
- [P2] Dates without year on ticket, /cita, share text, window note. Fix: add year when not current year; client name on ticket. (clarify)
- [P2] Taxonomy repeated; topbar + mobile-cta both visible on mobile. Fix: hide topbar CTA when mobile-cta shows; make small specials cards earn space or merge. (distill)

Personas: Jordan (Pentinats unexplained, no prices note, optional email purpose unclear), Riley (no month picker, "Ver todas (2 más)", native confirm on cancel), Casey (19px arrows, 38px buttons, no strip affordance), Amparo (lands on 6 March, no back-to-back booking for two daughters, ticket without year/name, no aderezo guidance).

Minor: pale gold confirm vs grey disabled; desktop dialog empty space, service step lacks descriptions; notes placeholder mentions fallera infantil; sparse about band; muddy 36px seal; /cita lacks WhatsApp/calendar/directions.
