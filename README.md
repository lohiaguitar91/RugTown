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
- **Phase 0 spike — the carpet-level camera and the crossing.** Open
  `spike/carpet-cam/index.html` from any static server (no build step,
  no dependencies) — e.g. `python3 -m http.server` from the repo root.
  One snapped oval of wooden track on the rug, a rug road looping through
  it, a wind-up engine and a pull-back car billboarded from pre-rendered
  sprite rotations, the crossing gate + bell where road meets rail, and the
  cheek-on-the-rug follow-cam. Tap the engine or the car to rewind its
  spring; `C` toggles the top-down debug camera; `F` cycles the sprite sets
  through 8/16/32/64 rotation frames — the live comparison behind the
  sprites-vs-hybrid decision in DESIGN.md §8.
  Harness (DESIGN.md §8 verification discipline): `?s=<cm>` freezes the
  engine at an arclength for deterministic screenshots, `?soak=<n>` runs
  n headless ticks and asserts the car never deadlocks at the gate,
  `?bench=<n>` reports ms/frame, and `window.__rug` exposes the same from
  the console.
- **The clip.** `?clip=1` plays a deterministic 14-second loop: follow the
  engine off the far straight and round the curve, settle on the crossing
  as the gate drops and the car waits, then swing back behind the engine so
  the last frame meets the first. `?clip=1&t=<sec>` freezes any frame of
  it; `?clipcheck=1` prints the event timeline and the loop error.
  `media/rugtown-crossing.mp4` and `.gif` are rendered from it, frame by
  frame, through headless Chromium.
- **The trailer.** `spike/carpet-cam/trailer.html?trailer=1` plays a 45-second
  cut over the same renderer, structured on the toy's loop — build it (the
  pieces snap onto the empty rug one by one), wind it up (pull the engine
  back, let go), watch it run (the carpet-level cam and the crossing) — then
  three cards and the title. `&t=<sec>` freezes a frame. The narration and
  every toy sound come from the page's own timeline: `render-clip.mjs` with
  `TRAILER=1` captures the frames, `mix-trailer.mjs` synthesizes the clacks,
  snaps, hush, ratchet and bell from `__trailer.events()` and lays the
  narration (Piper TTS, voices from the rhasspy/piper GitHub releases) at
  its cues — no sampled sounds, per DESIGN.md §3. Output:
  `media/rugtown-trailer.mp4`.
- Sibling products: [Echolume](https://github.com/lohiaguitar91/echolume)
  (shipped; the stack this plan reuses) and
  [Lunchbox Arcade](https://github.com/lohiaguitar91/LunchboxArcade)
  (design phase).
