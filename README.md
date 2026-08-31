# Rug Town

A standalone building-toy sandbox: the living-room floor of a 90s house as
a miniature world. Wooden rails, the road rug with the yellow dashes,
pull-back cars, couch-cushion mountains — build it, wind it up, get down on
the carpet and watch it run. **The floor was the first open world.**

- **[DESIGN.md](DESIGN.md)** — the full design doc: pitch, toy-not-game
  pillars, copyright ground rules, the toybox, toy systems (wind-ups, the
  carpet-level camera, the layout-as-music-box), pay-once monetization
  with no ads, the app-first + web-demo platform plan, tech plan, roadmap.
- Status: design locked for Phase 0; the week-one spike is in
  [`spike/carpet-cam/`](spike/carpet-cam/) (see below).
- **Phase 0 spike — the carpet-level camera.** Open
  `spike/carpet-cam/index.html` from any static server (no build step,
  no dependencies) — e.g. `python3 -m http.server` from the repo root.
  One snapped oval of wooden track on the rug, a wind-up engine billboarded
  from pre-rendered sprite rotations, and the cheek-on-the-rug follow-cam.
  Tap to rewind the spring; `C` toggles the top-down debug camera; `F`
  cycles the sprite set through 8/16/32/64 rotation frames — the live
  comparison behind the sprites-vs-hybrid decision in DESIGN.md §8.
  Harness (DESIGN.md §8 verification discipline): `?s=<cm>` freezes the
  engine at an arclength for deterministic screenshots, `?soak=<n>` runs
  n headless ticks and reports laps/NaN checks, `?bench=<n>` reports
  ms/frame over n rendered frames, and `window.__rug` exposes the same
  from the console.
- Sibling products: [Echolume](https://github.com/lohiaguitar91/echolume)
  (shipped; the stack this plan reuses) and
  [Lunchbox Arcade](https://github.com/lohiaguitar91/LunchboxArcade)
  (design phase).
