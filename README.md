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
- **Phase 0 spike — the carpet-level camera, the crossing, the build verb,
  and the sound.** Open `spike/carpet-cam/index.html` from any static server (no
  build step, no dependencies) — e.g. `python3 -m http.server` from the
  repo root, then on a phone on the same Wi-Fi open
  `http://<laptop-ip>:8000/spike/carpet-cam/`. The rails are a graph of
  placed peg-and-hole pieces: drag a straight or a curve out of the toy bin
  and it ghost-snaps to the nearest open peg (a curve tries both hands);
  the first piece lands anywhere on the rug; drag a placed piece to move
  it, or onto the bin to put it away; tap a placed curve to flip its hand,
  a free straight to turn it. The engine is a drag-out too: drop it on any
  track, pull it back and let go to wind it (it runs away from the pull;
  a tap winds it fully), carry it off the rails to turn it round. At an
  open end it coasts to a bump and stops. The rug road is fixed; wherever a
  rail piece crosses it, a gated crossing appears and the pull-back car
  waits for the train. The layout lives in the URL hash — that's the share
  link; the oval is ~250 bytes. Phone first (DESIGN.md §7): the bin is a
  thumb strip (bottom in portrait, side in landscape), the rug turns to
  fill the screen either way, pinch to zoom, one finger on the rug to pan,
  the round button swaps builder ⇄ carpet level. `main.js` is the model,
  sim and renderer; `build.js` is the touch work; `audio.js` is the synth.
  **It is audible.** Every sound is synthesized on a WebAudio graph (no
  samples, DESIGN.md §3): a wooden clack as each axle rolls over a joint,
  the felt hush of the car on the rug, the crossing bell while the gate is
  busy, the spring's soft tick as it runs down, and the first music-box
  notes (§5) — the layout is the barrel. Each curve is a pin one step up (a
  left turn) or down (a right turn) on a two-octave pentatonic, turning
  round at the ends of the scale; straights are rests; a loop plays its
  phrase every lap and slows as the spring runs down; an open line plays
  it out and bumps. Pins belong to pieces, so the same share link plays the
  same tune and a train run backwards plays it backwards. The sim never
  waits on sound: each tick only logs what happened (`SIM_EVENTS`), and the
  audio layer schedules those a few milliseconds ahead on audio time. Sound
  unlocks on the first touch; the round button under the camera button
  mutes (remembered on the device; `m` on a keyboard); a hidden tab is
  silent.
  Harness (DESIGN.md §8 verification discipline): `?s=<cm>` freezes the
  engine at an arclength for deterministic screenshots, `?soak=<n>` runs
  n headless ticks on the oval and asserts the car never deadlocks at the
  gate, `?soaklayouts=<n>&secs=<s>` grows n random valid layouts and runs
  each with an emulated player (rewinds, turns the engine round at buffer
  ends), asserting no NaN, no stuck engine and no car deadlock,
  `?bench=<n>` reports ms/frame (`&audio=1` with the synth scheduling),
  `?notes=<sec>` prints the pins the current layout strikes over the next
  seconds (deterministic, no AudioContext involved), `?notescheck=1`
  compares the oval's tune against `fixtures/oval-notes.json`,
  `?cam=top|carpet` picks the camera, and `window.__rug` / `window.__build`
  expose the same from the console or a script (`__build.drag`, `.tap`,
  `.slot(i)`, `.endScreen(i)` drive the real gesture code;
  `__rug.renderAudio(sec, loops)` renders the next seconds through an
  `OfflineAudioContext` with the same synth and returns a WAV).
- **The clip.** `?clip=1` plays a deterministic 14-second loop: follow the
  engine off the far straight and round the curve, settle on the crossing
  as the gate drops and the car waits, then swing back behind the engine so
  the last frame meets the first. `?clip=1&t=<sec>` freezes any frame of
  it; `?clipcheck=1` prints the event timeline and the loop error.
  `media/rugtown-crossing.mp4` and `.gif` are rendered from it, frame by
  frame, through headless Chromium; the mp4's sound is the toy's own synth,
  rendered offline from the same timeline by `render-clip.mjs` (two loops,
  the last one kept, so the tails ring across the seam).
- **The trailer.** `spike/carpet-cam/trailer.html?trailer=1` plays a
  43-second cut over the same renderer, structured on the toy's loop — build
  it (a finger drags the first pieces out of a toy bin and clicks them onto
  the empty rug, the rest fill in), wind it up (the finger pulls the engine
  back, lets go), watch it run (the carpet-level cam and the crossing) —
  then three cards and the title. The bin and the finger are the trailer's
  picture of the build verb, not the real toy bin yet (that's Phase 1).
  `&t=<sec>` freezes a frame. Every toy sound comes from the page's own timeline: `render-clip.mjs` with
  `TRAILER=1` captures the frames, `mix-trailer.mjs` synthesizes the clacks,
  snaps, hush, ratchet and bell from `__trailer.events()` — no sampled
  sounds, per DESIGN.md §3. It ships captioned rather than narrated (TTS
  reads came out flat); the narration cue sheet is in `trailer.js`, and
  recorded lines dropped into `narration/line-N.wav` are mixed in at their
  cues. Output: `media/rugtown-trailer.mp4`.
- Sibling products: [Echolume](https://github.com/lohiaguitar91/echolume)
  (shipped; the stack this plan reuses) and
  [Lunchbox Arcade](https://github.com/lohiaguitar91/LunchboxArcade)
  (design phase).
