---
target: portada y flujo de reserva
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/Miguel-peluquer-a-/public/index.html"
target_fingerprint: "sha256:1ccf1a8672b61dd09bd86f60dc9ae75fe93ebeb8ca6603d4c737cb7f7571ef7c"
target_path: /home/user/Miguel-peluquer-a-/public/index.html
timestamp: 2026-10-31T17-10-11Z
slug: public-index-html
---
Method: dual-agent (A: design review · B: detector + browser)

Design Health 27/40 (Acceptable). H1 3 · H2 3 · H3 3 · H4 3 · H5 2 · H6 3 · H7 2 · H8 3 · H9 3 · H10 2.

Specificity: hero + Falleras card authored (seal, black/gold, Jost); Servicios and booking dialog are a Fresha template; brand vanishes at commitment.
Detector: cramped-padding x2 on .hero/.about-band (false positives, inner .wrap carries padding); radial-spotlight-glow on .special--lead (real). cita/404 clean. No console errors, no overflow. Unused font weights Jost 700, Figtree 800.

Priority issues:
- [P1] Fallas unbookable: maxDaysAhead 120 ends 28 Feb, next arrow disables silently. Fix: window through next 19 March, end-of-window message, jump to March/Fallas. (harden)
- [P1] Confirmation recovery depends on saving a link; email optional. Fix: WhatsApp-to-self/copy/share, cancel link in .ics, email nudge. (clarify)
- [P2] Logo crop reads "Miguel de la Cru"; mobile seal ~45% of first viewport; Instagram proof buried. Fix: mask medallion, smaller mobile seal, Instagram in hero. (layout)
- [P2] 15-min slot step → 19+ morning buttons on mobile. Fix: 30-min default or limited list + "Ver más horas". (distill)
- [P3] Brand drop in dialog/confirmation, duplicate quote and hours, red "Cerrado", spotlight glow. Fix: night/gold ticket, remove duplicates, neutral status. (polish, delight)

Personas: Jordan (red Cerrado, no photos/prices, similar service names), Riley (reload loses flow state, "Completo" mislabel on closed day, duplicate summary on done), Casey (date nav out of thumb zone, 12px day notes), Amparo (cannot reach March, no service details, only Instagram fallback).

Minor: hidden topbar CTA leaves empty corner; .cats border bleeds into gutter; month label follows selected date; mobile done actions not full width; 15px small text.
