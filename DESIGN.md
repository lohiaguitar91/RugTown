# Rug Town — design doc (draft for review)

A standalone building-toy sandbox: the living-room floor of a 90s house as a
miniature world. Wooden peg-and-hole rails, the road rug with the yellow
dashes, pull-back cars, couch-cushion mountains — you build it, wind it up,
and get down on the carpet to watch it run. For the adults who remember the
floor, not for today's toddlers.

Status: draft, unbuilt. Written Aug 30 2026 for review; review round 1
decisions locked Aug 31 2026 (§ 10). Spun out of the Lunchbox Arcade parking
lot (review round 2: standalone product, not a wing game). Third product of
the shop — same stack, same rules about respecting the player's money.

---

## 1. The pitch

**The floor was the first open world.**

Before any of us had a console we had a rug, and the rug had roads, and the
roads went somewhere. The wooden track clicked together in exactly one
satisfying way, the wind-up engine went where the track said, and an
afternoon disappeared at carpet level. That toy has been remade for children
a hundred times and for the people who actually miss it approximately never:
the market's one beloved track-builder lives on PC/console in first person,
and mobile is toddler apps and gray construction sims. Nobody owns
"adult-nostalgia toy sandbox" on the platform everyone carries.

Rug Town is that product: a cozy, premium, no-fail building toy where the
pieces are the *generic* childhood toy categories — peg rails, rug roads,
alphabet blocks, peg people, pull-back cars — arranged on the floors of a
house you remember. It is a toy, not a game: no clock, no lose state, no
score. The reward is that the thing you built *runs*, and hums, and the
crossing gate cycles just as the pull-back bus arrives, and you get to lie
there and watch it.

**One-line concept:** a premium miniature-world toy — build rails and roads
across living-room floors, wind it up, watch it run — free web demo,
pay-once unlock, expansion toy boxes, no ads ever.

**Working titles** (DIY trademark/store search before committing, per shop
policy — no outside legal review): *Rug Town* (recommended — says the whole
product in two words), *The Good Rug*, *Living Room Line*.

## 2. Design pillars

1. **A toy, not a game.** No win state, no fail state, no timer, no score.
   Optional "postcard" prompts exist for structure-seekers (§ 5), but the
   core loop is build → wind → watch → tinker. Toys can *tip over* — a
   too-hard pull-back can tip a car on a sharp curve — but they never break,
   and a tap rights them. Gentle comedy, zero punishment.
2. **The floor is the world.** Every piece is a household thing at toy
   scale: books are tunnels, cushions are mountains, a blanket is a lake,
   the lamp is the sun. This is the charm engine and the legal moat in one —
   we are quoting *your floor*, not any toy company's catalog (§ 3).
3. **Touch-first building.** One finger drags pieces from the toy bin; they
   snap to the floor graph with a woody click and a haptic tap; invalid
   placements simply don't exist. Two fingers pan and zoom. Building must
   feel like play in the first ten seconds, or the spike fails (§ 9).
4. **It runs without you.** Wind-ups, automata, and little peg people with
   errands keep the world alive while you watch. The end state of a good
   session is a self-running diorama you built.
5. **Premium and quiet.** Pay once, own it. No ads of any kind, no
   currency, no energy, no subscription (§ 6). A toy with a banner on it is
   lint on the rug.

## 3. Avoiding copyright: the ground rules

Shorter list than the arcade's, because the subject matter is safer — but
the discipline is identical:

- **Generic toy categories are product categories, not protected
  expression.** Wooden peg-and-hole track, pull-back cars, road-print rugs,
  alphabet blocks, peg dolls: all made by dozens of manufacturers for
  decades. We depict the *category*, never a maker's identifiable product,
  packaging, or livery.
- **Brand names never appear** — not in the app, the ASO keywords, the
  store copy, or the screenshots. Not the famous wooden-rail brands, not
  the die-cast car brands, not any rug maker. Market on generic words
  ("wooden train set," "toy trains," "sandbox") and the feeling.
- **No faces on the engines.** A smiling face on a locomotive boiler is the
  signature of one very famous, very defended franchise. Our engines get
  personality from motion, sound, and a name painted on the tender — never
  a face. (Peg people have the classic dot-simple peg-doll look, which is
  generic.)
- **Our own rug art.** Road-print rugs are a commodity category, but any
  *specific* rug's printed artwork is someone's copyrighted illustration —
  we design our own town layout and landmark set from scratch, never
  tracing a real rug. Generic vocabulary (grey lanes, yellow dashes, a
  pond, a firehouse) is the category; a particular rug's composition is
  not.
- **Invented railway heraldry.** Real railroads' names, marks, and
  paint schemes (past and present) are trademarks — our engines carry
  made-up lines with made-up liveries.
- **Original everything else:** art, synthesized audio, music. No sampled
  toy sounds, no licensed songs — the score is ours by construction (§ 5).

## 4. The toybox

The content catalog. Everything below is v1 unless marked as a later box.

| Bin | Pieces | Notes |
|-----|--------|-------|
| Rails | straights, curves, Y-switches, crossings, risers, buffer stops, a clackety drawbridge | peg-and-hole snap; a riser only snaps where a book, cushion, or another riser is already there to climb onto — the furniture is the brace, so there's no separate support piece and nothing to engineer |
| Trains | wind-up engines; boxcar, tanker, caboose; couple/uncouple by dragging | pull back to wind — the pull-back toy is the core verb |
| Roads | rug-road tiles: straight, corner, intersection, roundabout | the road rug pattern: grey lanes, yellow dashes |
| Cars | pull-back cars, a bus, a fire truck | obey rug roads; stop at crossings |
| Crossings | gates + bell where road meets rail | the magic moment of the whole toy; tuned like a boss fight |
| Blocks | alphabet blocks, plank houses, a firehouse, a farm set | stackable; knock-over-able; never breakable |
| Scenery | felt trees, blanket lake with a wind-up ferry, book tunnels, couch-cushion mountain | terrain comes from furniture |
| Peg people | conductor, mail carrier, farmer, station master | each has an ambient errand (§ 5) |
| The cat | naps on the rug; tail flicks; trains route around her | optional toggle; purely cozy; harms nothing |

**Floors** are the save slots, and each is a place in the house: the
**Living Room** (v1 starter — the good rug, the lamp, the CRT murmuring),
the **Basement** (later box — concrete floor, chalk-drawn roads), and
**Grandma's Hallway** (later box — one long runner rug, a point-to-point
line between two doorways). A floor sets the size, the light, and the props.

**Later toy boxes** (post-launch, one-time purchases, § 6): the **Marble
Run box** (cushion slopes, chutes, and bells — real physics), the **Night
Lights box** (lights-out mode: glow strips, lamp pools, firefly jar), and
new floors. Each box is a real toy with a real idea, never a piece-dump.

**Parked idea — the Toy-a-fy box.** A step past "trace your floor" above:
send the photo to a vision model and get back a starter floor with pieces
already placed — a real couch becomes a cushion mountain, a real bookshelf
becomes book tunnels, your actual rug's edge becomes road tiles — abstracted
into our generic toy vocabulary, never a photo-textured reproduction of
your room (which is also what keeps it inside § 3's discipline: nothing a
vision pass sees, including someone else's branded stuff sitting in the
room, survives past the abstraction). Genuinely on-pitch, but it is the
one feature in this doc that isn't free to build: it needs a server call
and a real per-use inference cost, which doesn't fit "pay once, nothing
consumable" (§ 6) without its own pricing answer (most likely a one-time
unlock like the other boxes, not a metered add-on), and it needs an
explicit answer on photo privacy (processed and discarded, never stored,
never trains anything) before it's more than an idea. Not scoped into any
phase in § 9 — it needs its own small spike on cost and privacy first.

## 5. The toy systems

**Building.** Pieces live in a toy bin at the screen edge; drag out, they
ghost-snap to the nearest valid spot, click in with sound + haptic. Rails
form a graph; roads form a second graph; crossings join them. Rotation by a
twist handle or a tap. Deleting flicks the piece back into the bin. There
is no build menu, no grid overlay, no error toast — the toy itself is the
interface. Elevation works the same way: no structural physics, no bracing
to place or fail — a riser simply won't ghost-snap unless there's already
a book, cushion, or riser underneath it to climb onto. Height is graph
validity, not a simulated load, so a shipped layout can't teeter or fall
over on its own; it stays deterministic per pillar 1's no-fail promise.

**Trace your floor.** Snap one photo of your actual floor and it drops in
as a translucent underlay behind the builder — eyeball where your real
doorway, couch, and rug edge are and build the graph right over them. No
AI, no upload: the photo is decoded and drawn on-device only, is never
part of a saved layout or a share link, and can be cleared at any time.
This is the whole "the floor is the world" pillar (§ 2) made literal, at
the cost of a camera permission and nothing else — no server call, no
per-use cost, fits the existing stack (§ 8) as-is.

**The wind-up.** Drag an engine or car backward to wind it — farther is
more — and release. A small spring meter lives on the toy. Wind-ups run
down and coast to a stop wherever they are, which is half the charm; the
**Wind-Up Depot** piece (a station that rewinds anything passing through)
is the automation unlock that turns a layout into a perpetual diorama.

**Watching.** Three cameras: the builder's top-down, a tilt-shift
miniature view, and the one that matters — **carpet level**, the
cheek-on-the-rug follow-cam behind a running train, lamp flare and dust
motes and all. Photo mode and a short looping clip export for sharing.

**The layout is a music box.** All audio is synthesized (the shop's
standing craft): wooden clacks per rail joint, the felt shush of rug
roads, the crossing bell — and under it a music-box score where *running
toys add instruments*. Every switch crossed strikes a note; a busy layout
literally composes its own tune. This is the feature that makes clips
shareable and the product ours.

**Ambient life.** Peg people run errands on their own — the mail carrier
walks the rug roads between houses, the station master waves trains
through, the farmer naps against the cushion mountain at "evening." None
of it needs managing; all of it rewards watching.

**Postcards.** Optional prompt cards for people who want a nudge: *build a
loop that crosses itself twice* · *get the mail peg across town without
touching a road* · *make the crossing bell ring four times in one wind*.
Completing one earns a wooden-star sticker on the toy-chest lid. Postcards
never gate content and never expire.

**No-fail physics.** Trains cannot derail from speed alone; a tipped car
is the worst outcome, played for comedy and fixed with a tap. The sim is
deterministic per layout + seed, so a shared layout replays the exact same
show for whoever opens it.

## 6. Monetization

Same commandments as the rest of the shop — pay once, own forever, nothing
consumable — tuned for a toy:

- **Free download, everywhere.** The **Starter Bin**: the Living Room
  floor, core rails and roads, one engine, two cars, a modest piece cap.
  A real toy, not a crippled demo — it must be gift-able as-is.
- **The Whole Toy Chest — $6.99, one-time.** Everything current: all bins,
  the piece cap lifted to the performance budget, all cameras, clip
  export. The single SKU most people ever need.
- **Toy boxes — $2.99–3.99, one-time** (Marble Run, Night Lights, new
  floors). Real expansions with new systems, never piece-dumps. Toy Chest
  owners get a bundled price on each; a **Toy Chest + all future boxes**
  top tier (~$14.99) mirrors the arcade's Keyring and funds the roadmap.
- **No ads. None.** A sandbox has no win moments to cadence interstitials
  on, and a banner on a toy is unthinkable. This is also the marketing
  line: *no ads, no accounts, no nagging — just the floor.*
- **Sharing is always free, both directions.** Shared layouts open and
  play for anyone, in the web viewer or the free app, even with pieces
  the viewer doesn't own (they can watch, not edit-with-owned-pieces-only
  restrictions on remix apply). The share link is the ad.

## 7. Platform strategy: app-first, web demo alongside

Asked in review whether this is app-only or web + app. **Web + app, with
the app as the product:**

- **The app (iOS + Android, iPad/tablet first-class)** is the premium toy.
  Tablets are the natural rug — the marketing renders lead with hands on
  an iPad on an actual carpet.
- **The web build is the demo and the share viewer.** The stack is already
  web-native (§ 8), so a browser Starter Bin costs almost nothing and
  every shared layout link opens instantly for anyone, no install — the
  viral loop the app stores can't provide. The web demo's one job is
  wonder in sixty seconds, then a quiet "get the Whole Toy Chest" that
  deep-links to the stores. Web purchases: not v1 (store billing only);
  revisit if the demo converts.
- **Desktop/Steam: parked.** The existing PC track-builder owns
  first-person trains; ours is the top-down cozy miniature. A later port
  is plausible; it is not v1.

## 8. Tech plan

- **The shop stack:** pure vanilla JS, no build step, Capacitor 8 wrappers;
  one canvas, DOM for the toy bin and menus; synthesized WebAudio
  throughout. With three products, the shared library decided in the
  arcade review (renderer helpers, audio kit, save, GameConnect bridge)
  becomes real — Rug Town consumes it, never forks it. Client-only, no
  server, no exceptions in v1 — the one thing on the horizon that would
  break this is the parked Toy-a-fy box (§ 4), which is exactly why it
  stays parked until it has its own answer on cost and privacy.
- **Rendering:** 2.5D isometric canvas — layered sprites with pre-rendered
  rotations, tilt-shift via blur bands. This is the right, cheap call for
  the builder's top-down and tilt-shift miniature cameras, where the
  viewing angle is fixed or narrow enough that a handful of pre-rendered
  rotations covers it — no engine, no pipeline beyond an art tool
  exporting PNGs. It's the riskiest call for **carpet level**, the one
  camera that moves — low, close, orbiting behind a train around a curve
  — which is exactly the angle where pre-rendered sprite rotations read
  as flat instead of round. If the Phase 0 spike's carpet-level test
  doesn't hold up on sprites, the fallback isn't a full 3D pivot: model
  only the handful of things that actually move through that shot (engine,
  cars, peg people) in Blender, export to glTF, render with a light
  three.js layer loaded as a plain `<script>` tag (no build step broken);
  rug tiles, scenery, and blocks stay flat 2.5D sprites either way, since
  they never need to look right from an orbiting camera.
- **Sim:** two graphs (rail, road) + automata ticked at fixed dt;
  deterministic per layout + seed so shared layouts replay identically.
  Save = the piece list + seed; a floor serializes to a few KB — that's
  the share link.
- **Verification discipline, adapted:** `__rug.soak(n)` runs a layout n
  thousand ticks headless and asserts no deadlock, no NaN, no runaway
  entity count; graph validators prove every shipped postcard is
  completable; a perf harness sets the per-floor piece cap on old
  hardware honestly instead of by vibes.
- **Store plumbing:** the arcade's generalized IAP product table pattern
  (Toy Chest, boxes, bundle) with restore-purchases from day one; no ads
  module at all in this app.

## 9. Roadmap

- **Phase 0 — the feel spike (3–4 wks).** Snap-build + wind-up + follow
  train + the crossing gate + the first music-box notes, on one small rug.
  Build and judge the carpet-level camera **first**, not last — it's the
  spike's highest-risk assumption (§ 8: sprites may not hold up at that
  angle), and it's cheaper to find out in week one than after the rest of
  the spike is built around it. Go/no-go: hand it to someone cold; if they
  don't smile at the crossing bell inside two minutes, stop and rework
  feel — nothing downstream fixes a toy that doesn't feel like a toy.
- **Phase 1 — the core toy (6–8 wks).** Full Living Room bin, floors/saves,
  the three cameras, photo + clip export, peg-people errands, postcards.
- **Phase 2 — launch (4–6 wks).** Web demo + share links, Toy Chest IAP,
  store assets (carpet-level renders), ship.
- **Phase 3 — the Marble Run box**, then Night Lights, then floors, paced
  by what the share links say people build.

**Sequencing against Lunchbox Arcade:** separate products, shared library.
Default plan: Rug Town's Phase 0 spike runs after the arcade's Phase 2
(revenue live) unless review wants it sooner — the spike is cheap and
de-risks the bigger build either way. Cross-promotion both ways via the
"from the makers of" sticker, per the arcade doc.

## 10. Review decisions (round 1, Aug 31 2026)

1. **Name — decided: *Rug Town*.** Aligned in review; DIY trademark/
   store/domain search still happens before anything ships.
2. **Price — decided: $6.99 Toy Chest.** Ship the bet as specced; $4.99
   and $8.99 stay as the sensitivity checks to run at soft launch.
3. **The music box — decided: core.** Stays in Phase 0 as the
   differentiator, not deferred to Phase 1, even as the spike's riskiest
   line item.
4. **The cat at v1 — decided: yes.** She's in the v1 bet as the
   clip-maker; the Phase-1-runs-long cut line stays on the table but she
   ships by default.
5. **Sequencing — decided: spike after Lunchbox Arcade's Phase 2**
   (the default plan). The spike is cheap enough that waiting costs
   little, and it keeps the shop's attention on getting the arcade's
   revenue live instead of running two Phase 0s at once. Revisit only if
   the arcade's Phase 2 stalls hard.
6. **Tablet-first marketing — decided: tablet-first hero.** Lead store
   and marketing renders with an iPad on an actual carpet, not phone
   screenshots — it's the truest picture of the core fantasy (get down
   on the floor with it), it reads better for two-finger pan/zoom
   building (pillar 3, § 2), and it stands out from generic phone-game
   screenshots. Phone shots stay in the listing as secondary, confirmed
   with real renders at Phase 2.
7. **Elevation: physics or hand-held? — decided: hand-held, no bracing
   piece.** A riser only ghost-snaps where a book, cushion, or another
   riser is already there to climb onto (§ 4, § 5) — the furniture is the
   brace. No structural physics, no separate support piece to place or
   fail. Keeps faith with pillar 1 (no-fail) and pillar 3 (invalid
   placements simply don't exist) without building a physics engine the
   toy doesn't need.
