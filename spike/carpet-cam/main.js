// Rug Town — Phase 0 week-one spike: the carpet-level camera.
//
// The question this file exists to answer (DESIGN.md §8/§9): do pre-rendered
// sprite rotations hold up at the low, close, moving carpet-level follow-cam,
// or does rolling stock need the hybrid (real 3D for movers) fallback?
//
// Everything on the ground plane (rug, floor, track) is projected 3D geometry.
// The engine is a billboard sprite picked from N pre-rendered rotations —
// baked procedurally at load here, but consumed exactly as art-tool-exported
// frames would be, so the runtime cost model and the visual question are real.
//
// No dependencies, no build step. Units are centimeters, y is up.
//
// Keys/taps: tap = rewind the spring · C = carpet/top-down · F = cycle 8/16/32/64 frames
// Query params: ?s=<cm> freeze at arclength · ?frames=N · ?bench=<frames> · ?soak=<ticks>

'use strict';

// ---------------------------------------------------------------- config

const TRACK = { straight: 45, radius: 20, bedW: 4.0, grooveOff: 1.1, grooveW: 0.38, pieceStraight: 15, curvePieces: 4 };
const RUG = { w: 130, d: 84, corner: 10 };
const CAM = { height: 4.2, follow: 30, fovY: 50 * Math.PI / 180, near: 0.6, aimUp: 2.4 };
const ENGINE = { speedMax: 26, drainPerCm: 1 / 700 };      // full spring ≈ 3+ laps
const FIXED_DT = 1 / 120;

const Q = new URLSearchParams(location.search);
const FRAME_CHOICES = [8, 16, 32, 64];
const clampFrames = n => FRAME_CHOICES.includes(n) ? n : 16;
const spriteFrames = clampFrames(parseInt(Q.get('frames') || '16', 10));

// ---------------------------------------------------------------- palette (lamp-lit, warm)

const C = {
  wallTop: '#120b07', wallBot: '#2b1a10',
  floor: '#462c1a', floorSeam: '#382214',
  rugField: '#a34a2e', rugBorder: '#7c3722', rugStripe: '#d9a441',
  bed: '#d9b077', bedEdge: '#a97b48', groove: '#8a6238', jointGap: '#b5854f', peg: '#caa36a', pegRing: '#8a6238',
  shadow: 'rgba(20,10,5,0.35)',
};

// ---------------------------------------------------------------- tiny vec helpers

const v3 = (x, y, z) => ({ x, y, z });
const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const scale3 = (a, s) => v3(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const norm = a => { const l = Math.hypot(a.x, a.y, a.z) || 1; return scale3(a, 1 / l); };
const lerp = (a, b, t) => a + (b - a) * t;
const wrapAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ---------------------------------------------------------------- the oval (a stadium of snapped pieces)

// Two straights along x, two semicircle ends. s grows counter-clockwise from
// the middle of the near straight (z = -radius side), heading +x.
const PATH = (() => {
  const L = TRACK.straight, r = TRACK.radius;
  const segs = [
    { type: 'line', len: L, from: v3(-L / 2, 0, -r), dir: v3(1, 0, 0) },
    { type: 'arc', len: Math.PI * r, c: v3(L / 2, 0, 0), a0: -Math.PI / 2, dir: 1 },
    { type: 'line', len: L, from: v3(L / 2, 0, r), dir: v3(-1, 0, 0) },
    { type: 'arc', len: Math.PI * r, c: v3(-L / 2, 0, 0), a0: Math.PI / 2, dir: 1 },
  ];
  let acc = 0;
  for (const s of segs) { s.s0 = acc; acc += s.len; }
  return { segs, total: acc };
})();

function pathAt(s) {
  s = ((s % PATH.total) + PATH.total) % PATH.total;
  const r = TRACK.radius;
  for (const seg of PATH.segs) {
    if (s > seg.s0 + seg.len + 1e-9) continue;
    const t = s - seg.s0;
    if (seg.type === 'line') {
      return { p: add(seg.from, scale3(seg.dir, t)), tan: seg.dir };
    }
    const a = seg.a0 + seg.dir * (t / r);
    return {
      p: v3(seg.c.x + r * Math.cos(a), 0, seg.c.z + r * Math.sin(a)),
      tan: v3(-Math.sin(a) * seg.dir, 0, Math.cos(a) * seg.dir),
    };
  }
  return { p: v3(0, 0, 0), tan: v3(1, 0, 0) };
}

// Piece boundaries (peg-and-hole joints): straights split into 15 cm pieces,
// each semicircle into 4 curve pieces — the classic wooden-set vocabulary.
const JOINTS = (() => {
  const out = [], L = TRACK.straight, arc = Math.PI * TRACK.radius;
  const push = s => out.push(((s % PATH.total) + PATH.total) % PATH.total);
  for (let k = 0; k <= L / TRACK.pieceStraight; k++) push(k * TRACK.pieceStraight);
  for (let k = 1; k < TRACK.curvePieces; k++) push(L + k * arc / TRACK.curvePieces);
  for (let k = 0; k <= L / TRACK.pieceStraight; k++) push(L + arc + k * TRACK.pieceStraight);
  for (let k = 1; k < TRACK.curvePieces; k++) push(2 * L + arc + k * arc / TRACK.curvePieces);
  return [...new Set(out.map(s => +s.toFixed(3)))];
})();

// ---------------------------------------------------------------- sim (fixed dt, deterministic)

const sim = {
  s: 0, spring: 1, laps: 0, dist: 0,
  tick() {
    const speed = ENGINE.speedMax * (0.15 + 0.85 * this.spring);
    const ds = speed * FIXED_DT;
    this.s += ds; this.dist += ds;
    this.spring = Math.max(0, this.spring - ds * ENGINE.drainPerCm);
    if (this.s >= PATH.total) { this.s -= PATH.total; this.laps++; }
  },
  rewind() { this.spring = 1; },
};

// ---------------------------------------------------------------- camera

const cam = { pos: v3(0, CAM.height, 0), target: v3(0, 2, 0), topDown: false, init: false };

function followGoal() {
  const eng = pathAt(sim.s);
  const back = pathAt(sim.s - CAM.follow);
  return {
    pos: v3(back.p.x, CAM.height, back.p.z),
    target: v3(eng.p.x, CAM.aimUp, eng.p.z),
  };
}

function updateCamera(dt, snap) {
  const goal = followGoal();
  if (snap || !cam.init) { cam.pos = goal.pos; cam.target = goal.target; cam.init = true; return; }
  const k = 1 - Math.exp(-dt * 5), kt = 1 - Math.exp(-dt * 9);
  cam.pos = v3(lerp(cam.pos.x, goal.pos.x, k), lerp(cam.pos.y, goal.pos.y, k), lerp(cam.pos.z, goal.pos.z, k));
  cam.target = v3(lerp(cam.target.x, goal.target.x, kt), lerp(cam.target.y, goal.target.y, kt), lerp(cam.target.z, goal.target.z, kt));
}

// View basis + projection. Camera space: x right, y up, z forward (z > near visible).
let view = null, focal = 1, W = 0, H = 0;

function buildView() {
  let fwd, up = v3(0, 1, 0), pos;
  if (cam.topDown) {
    pos = v3(0, 150, 0.01); fwd = norm(sub(v3(0, 0, 0), pos)); up = v3(0, 0, -1);
  } else {
    pos = cam.pos; fwd = norm(sub(cam.target, cam.pos));
  }
  const right = norm(cross(fwd, up));
  const upv = cross(right, fwd);
  view = { pos, right, upv, fwd };
  focal = (H / 2) / Math.tan(CAM.fovY / 2);
}

const toCam = p => {
  const d = sub(p, view.pos);
  return v3(dot(d, view.right), dot(d, view.upv), dot(d, view.fwd));
};
const toScreen = c => ({ x: W / 2 + focal * c.x / c.z, y: H / 2 - focal * c.y / c.z });

// Clip a polygon (camera space) against z = near, then project. Returns screen pts or null.
function clipProject(worldPts) {
  let poly = worldPts.map(toCam);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ain = a.z > CAM.near, bin = b.z > CAM.near;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (CAM.near - a.z) / (b.z - a.z);
      out.push(v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, CAM.near));
    }
  }
  if (out.length < 3) return null;
  return out.map(toScreen);
}

function fillPoly(ctx, pts, color, strokeToo) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (strokeToo) { ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); } // hide hairline seams
}

// ---------------------------------------------------------------- engine model + sprite baking

// A chunky wooden engine, heading +z when unrotated. No face — personality
// comes from motion and paint (§3). Built from boxes/cylinders, flat-shaded.
function engineFaces() {
  const faces = [];
  const box = (cx, cy, cz, w, h, l, color) => {
    const x = w / 2, y = h / 2, z = l / 2;
    const p = (dx, dy, dz) => v3(cx + dx, cy + dy, cz + dz);
    const quads = [
      [p(-x, -y, z), p(x, -y, z), p(x, y, z), p(-x, y, z)],      // front
      [p(x, -y, -z), p(-x, -y, -z), p(-x, y, -z), p(x, y, -z)],  // back
      [p(-x, -y, -z), p(-x, -y, z), p(-x, y, z), p(-x, y, -z)],  // left
      [p(x, -y, z), p(x, -y, -z), p(x, y, -z), p(x, y, z)],      // right
      [p(-x, y, z), p(x, y, z), p(x, y, -z), p(-x, y, -z)],      // top
      [p(-x, -y, -z), p(x, -y, -z), p(x, -y, z), p(-x, -y, z)],  // bottom
    ];
    for (const q of quads) faces.push({ pts: q, color });
  };
  // Cylinder along `axis` ('z' = boiler, 'x' = wheels, 'y' = chimney).
  const cyl = (cx, cy, cz, r, len, axis, color, segs = 16, caps = true) => {
    const half = len / 2;
    const ring = i => {
      const a = (i / segs) * 2 * Math.PI, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      if (axis === 'z') return [v3(cx + ca, cy + sa, cz - half), v3(cx + ca, cy + sa, cz + half)];
      if (axis === 'x') return [v3(cx - half, cy + ca, cz + sa), v3(cx + half, cy + ca, cz + sa)];
      return [v3(cx + ca, cy - half, cz + sa), v3(cx + ca, cy + half, cz + sa)];
    };
    for (let i = 0; i < segs; i++) {
      const [a0, a1] = ring(i), [b0, b1] = ring(i + 1);
      faces.push({ pts: [a0, b0, b1, a1], color });
    }
    if (caps) {
      const cap = (sign) => {
        const pts = [];
        for (let i = 0; i < segs; i++) {
          const [lo, hi] = ring(sign > 0 ? segs - i : i);
          pts.push(sign > 0 ? hi : lo);
        }
        faces.push({ pts, color });
      };
      cap(1); cap(-1);
    }
  };

  box(0, 1.45, -0.2, 4.2, 1.0, 8.8, '#5a4632');                 // walnut chassis
  cyl(-1.65, 1.15, 2.6, 1.15, 0.6, 'x', '#332822', 12);         // wheels
  cyl(1.65, 1.15, 2.6, 1.15, 0.6, 'x', '#332822', 12);
  cyl(-1.65, 1.15, -2.4, 1.15, 0.6, 'x', '#332822', 12);
  cyl(1.65, 1.15, -2.4, 1.15, 0.6, 'x', '#332822', 12);
  cyl(0, 3.35, 1.6, 1.85, 5.4, 'z', '#a63c2e', 18);             // boiler, painted red
  cyl(0, 3.35, 2.05, 1.95, 0.7, 'z', '#d9a441', 18, false);     // gold band
  cyl(0, 3.35, 4.05, 1.88, 0.7, 'z', '#3a2e28', 18);            // smokebox
  cyl(0, 5.3, 3.4, 0.55, 1.9, 'y', '#3a2e28', 12);              // chimney (no face on this engine, ever)
  cyl(0, 6.35, 3.4, 0.75, 0.35, 'y', '#5a4632', 12);            // chimney lip
  box(0, 3.9, -2.55, 4.0, 4.0, 3.4, '#a63c2e');                 // cab
  box(0, 6.15, -2.55, 4.6, 0.5, 4.0, '#5a4632');                // roof
  box(0, 4.6, -0.6, 4.05, 1.2, 0.5, '#d9a441');                 // gold cab trim
  return faces;
}

const BAKE = { px: 26, w: 340, h: 300, baseline: 262, elev: 7 * Math.PI / 180 };
let sprites = [];

function bakeSprites(n) {
  const faces = engineFaces();
  const light = norm(v3(-0.45, 0.85, -0.35)); // the lamp, up and to the left
  const out = [];
  for (let k = 0; k < n; k++) {
    const yaw = k * 2 * Math.PI / n;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const ce = Math.cos(BAKE.elev), se = Math.sin(BAKE.elev);
    const cnv = document.createElement('canvas');
    cnv.width = BAKE.w; cnv.height = BAKE.h;
    const ctx = cnv.getContext('2d');
    const drawn = faces.map(f => {
      const pts = f.pts.map(p => {
        const x = p.x * cy + p.z * sy, z = -p.x * sy + p.z * cy;   // model yaw
        return { x, y: p.y * ce + z * se, depth: -p.y * se + z * ce }; // slight look-down
      });
      const a = pts[0], b = pts[1], c2 = pts[2];
      const nrm = norm(cross(
        v3(b.x - a.x, b.y - a.y, b.depth - a.depth),
        v3(c2.x - a.x, c2.y - a.y, c2.depth - a.depth)));
      if (nrm.z > 0) return null; // backface (viewer looks along +depth)
      const lit = 0.5 + 0.5 * Math.max(0, dot(v3(nrm.x, nrm.y, -nrm.z), light));
      return {
        depth: pts.reduce((s, p) => s + p.depth, 0) / pts.length,
        pts, color: shade(f.color, lit),
      };
    }).filter(Boolean).sort((a, b2) => b2.depth - a.depth);
    for (const f of drawn) {
      ctx.beginPath();
      f.pts.forEach((p, i) => {
        const sx = BAKE.w / 2 + p.x * BAKE.px, syy = BAKE.baseline - p.y * BAKE.px;
        i ? ctx.lineTo(sx, syy) : ctx.moveTo(sx, syy);
      });
      ctx.closePath();
      ctx.fillStyle = f.color; ctx.fill();
      ctx.strokeStyle = 'rgba(30,16,9,0.30)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    out.push(cnv);
  }
  sprites = out;
}

function shade(hex, lit) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  // warm key light: lit faces pull slightly toward lamp gold
  const wr = lerp(r * lit, 255, 0.10 * lit), wg = lerp(g * lit, 214, 0.08 * lit), wb = lerp(b * lit, 160, 0.05 * lit);
  return `rgb(${wr | 0},${wg | 0},${wb | 0})`;
}

// ---------------------------------------------------------------- ground geometry (built once)

function roundedRect(w, d, corner, segs = 6) {
  const pts = [], hw = w / 2, hd = d / 2, r = corner;
  const arc = (cx, cz, a0) => {
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (i / segs) * Math.PI / 2;
      pts.push(v3(cx + r * Math.cos(a), 0, cz + r * Math.sin(a)));
    }
  };
  arc(hw - r, hd - r, 0); arc(-hw + r, hd - r, Math.PI / 2);
  arc(-hw + r, -hd + r, Math.PI); arc(hw - r, -hd + r, 3 * Math.PI / 2);
  return pts;
}

const GROUND = (() => {
  const bedQuads = [], grooves = [[], []], jointBands = [], pegs = [];
  const offsetAt = (s, off) => {
    const { p, tan } = pathAt(s);
    return v3(p.x - tan.z * off, 0.02, p.z + tan.x * off); // left normal on ground
  };
  const step = 2.5;
  for (let s = 0; s < PATH.total; s += step) {
    const s2 = Math.min(s + step, PATH.total);
    bedQuads.push([
      offsetAt(s, -TRACK.bedW / 2), offsetAt(s, TRACK.bedW / 2),
      offsetAt(s2, TRACK.bedW / 2), offsetAt(s2, -TRACK.bedW / 2),
    ]);
    for (const side of [0, 1]) {
      const o = (side ? 1 : -1) * TRACK.grooveOff;
      grooves[side].push([
        offsetAt(s, o - TRACK.grooveW / 2), offsetAt(s, o + TRACK.grooveW / 2),
        offsetAt(s2, o + TRACK.grooveW / 2), offsetAt(s2, o - TRACK.grooveW / 2),
      ]);
    }
  }
  for (const js of JOINTS) {
    jointBands.push([
      offsetAt(js - 0.35, -TRACK.bedW / 2), offsetAt(js - 0.35, TRACK.bedW / 2),
      offsetAt(js + 0.35, TRACK.bedW / 2), offsetAt(js + 0.35, -TRACK.bedW / 2),
    ]);
    const c = pathAt(js).p, pr = 0.55, ring = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * 2 * Math.PI;
      ring.push(v3(c.x + pr * Math.cos(a), 0.04, c.z + pr * Math.sin(a)));
    }
    pegs.push(ring);
  }
  const rugOuter = roundedRect(RUG.w, RUG.d, RUG.corner);
  const rugBorderIn = roundedRect(RUG.w - 8, RUG.d - 8, RUG.corner - 3);
  const rugStripeIn = roundedRect(RUG.w - 11, RUG.d - 11, RUG.corner - 4);
  const seams = [];
  for (let z = -280; z <= 280; z += 9) seams.push([v3(-300, 0.005, z), v3(300, 0.005, z)]);
  return { bedQuads, grooves, jointBands, pegs, rugOuter, rugBorderIn, rugStripeIn, seams };
})();

// ---------------------------------------------------------------- dust motes

const motes = [];
{
  let seed = 12; // deterministic per DESIGN.md §5 — same show every time
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    motes.push({ x: (rnd() - 0.5) * 160, y: 0.5 + rnd() * 10, z: (rnd() - 0.5) * 110, ph: rnd() * 6.28, sp: 0.2 + rnd() * 0.5 });
  }
}

// ---------------------------------------------------------------- render

let canvas, ctx, dpr = 1;
let timeSec = 0;

function render() {
  buildView();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // wall / far room
  const wall = ctx.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, C.wallTop); wall.addColorStop(1, C.wallBot);
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, H);

  // wood floor (a big quad, then plank seams)
  const floorPts = clipProject([v3(-300, 0, -300), v3(300, 0, -300), v3(300, 0, 300), v3(-300, 0, 300)]);
  if (floorPts) fillPoly(ctx, floorPts, C.floor, true);
  ctx.strokeStyle = C.floorSeam; ctx.lineWidth = 1;
  for (const seam of GROUND.seams) {
    const pts = clipProject([seam[0], seam[1], add(seam[1], v3(0, 0.001, 0)), add(seam[0], v3(0, 0.001, 0))]);
    if (!pts) continue;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
  }

  // the rug: field, border band, gold stripe
  const rug = clipProject(GROUND.rugOuter);
  if (rug) fillPoly(ctx, rug, C.rugBorder, true);
  const stripe = clipProject(GROUND.rugStripeIn);
  if (stripe) fillPoly(ctx, stripe, C.rugStripe, true);
  const field = clipProject(GROUND.rugBorderIn.map(p => v3(p.x * ((RUG.w - 14) / (RUG.w - 8)), 0.01, p.z * ((RUG.d - 14) / (RUG.d - 8)))));
  if (field) fillPoly(ctx, field, C.rugField, true);

  // track bed, grooves, joints, pegs — painter order far-to-near not needed
  // on a flat ground plane; draw order = layer order.
  for (const q of GROUND.bedQuads) { const p = clipProject(q); if (p) fillPoly(ctx, p, C.bed, true); }
  for (const side of GROUND.grooves) for (const q of side) { const p = clipProject(q); if (p) fillPoly(ctx, p, C.groove, true); }
  for (const q of GROUND.jointBands) { const p = clipProject(q); if (p) fillPoly(ctx, p, C.jointGap, true); }
  for (const q of GROUND.pegs) { const p = clipProject(q); if (p) fillPoly(ctx, p, C.peg, true); }

  drawEngine();
  drawMotes();
  drawLamp();
  drawHud();
}

function drawEngine() {
  const eng = pathAt(sim.s);
  // contact shadow first (two soft ellipses on the ground)
  for (const [rx, rz, a] of [[5.2, 3.4, 0.16], [3.6, 2.4, 0.22]]) {
    const ring = [];
    for (let i = 0; i < 14; i++) {
      const t = i / 14 * 2 * Math.PI;
      const lx = Math.cos(t) * rz, lz = Math.sin(t) * rx; // long axis along heading
      ring.push(v3(
        eng.p.x + lx * -eng.tan.z + lz * eng.tan.x, 0.05,
        eng.p.z + lx * eng.tan.x + lz * eng.tan.z));
    }
    const p = clipProject(ring);
    if (p) fillPoly(ctx, p, `rgba(20,10,5,${a})`, true);
  }

  const camSpace = toCam(eng.p);
  if (camSpace.z <= CAM.near) return;
  const groundPx = toScreen(camSpace);
  const pxPerCm = focal / camSpace.z;
  const spriteScale = pxPerCm / BAKE.px;

  const psi = Math.atan2(eng.tan.x, eng.tan.z);
  const beta = Math.atan2(eng.p.x - view.pos.x, eng.p.z - view.pos.z);
  const rel = wrapAngle(psi - beta);
  const n = sprites.length;
  const idx = ((Math.round(rel / (2 * Math.PI / n)) % n) + n) % n;

  const img = sprites[idx];
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img,
    groundPx.x - (BAKE.w / 2) * spriteScale,
    groundPx.y - BAKE.baseline * spriteScale,
    BAKE.w * spriteScale, BAKE.h * spriteScale);
}

function drawMotes() {
  ctx.fillStyle = 'rgba(255,226,170,0.5)';
  for (const m of motes) {
    const y = m.y + Math.sin(timeSec * m.sp + m.ph) * 0.8;
    const c = toCam(v3(m.x, y, m.z));
    if (c.z < 2 || c.z > 70) continue;
    const p = toScreen(c);
    const r = Math.max(0.8, Math.min(2.5, 26 / c.z));
    ctx.globalAlpha = Math.min(0.7, 10 / c.z);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.29); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawLamp() {
  // warm pool from the lamp, up-left; then a soft vignette
  const pool = ctx.createRadialGradient(W * 0.3, H * 0.25, H * 0.05, W * 0.3, H * 0.25, H * 0.95);
  pool.addColorStop(0, 'rgba(255,205,130,0.22)');
  pool.addColorStop(1, 'rgba(255,205,130,0)');
  ctx.fillStyle = pool; ctx.fillRect(0, 0, W, H);
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  vig.addColorStop(0, 'rgba(10,5,2,0)');
  vig.addColorStop(1, 'rgba(10,5,2,0.42)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
}

let fpsAvg = 0;
function drawHud() {
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(240,225,200,0.75)';
  const springBar = '▓'.repeat(Math.round(sim.spring * 8)).padEnd(8, '░');
  ctx.fillText(`spring ${springBar}  lap ${sim.laps}  ${fpsAvg ? fpsAvg.toFixed(0) + 'fps' : ''}`, 12, 20);
  ctx.fillStyle = 'rgba(240,225,200,0.45)';
  ctx.fillText(`[tap] rewind   [c] camera   [f] frames: ${sprites.length}`, 12, 38);
}

// ---------------------------------------------------------------- loop, input, harness

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
}

let acc = 0, lastT = 0, frameMs = 0;

function frame(t) {
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0);
  lastT = t;
  if (dt > 0) fpsAvg = fpsAvg ? lerp(fpsAvg, 1 / dt, 0.05) : 1 / dt;
  acc += dt; timeSec += dt;
  while (acc >= FIXED_DT) { sim.tick(); acc -= FIXED_DT; }
  updateCamera(dt, false);
  const t0 = performance.now();
  render();
  frameMs = performance.now() - t0;
  requestAnimationFrame(frame);
}

function advanceTo(s) {
  // deterministic placement for freeze-frame screenshots; wraps into one lap
  s = isFinite(s) ? ((s % PATH.total) + PATH.total) % PATH.total : 0;
  while (sim.s < s - 1e-6 && sim.laps === 0) sim.tick();
  updateCamera(0, true);
}

const __rug = {
  soak(nTicks) {
    const before = sim.laps;
    for (let i = 0; i < nTicks; i++) {
      sim.tick();
      if (sim.spring < 0.2) sim.rewind(); // keep it running like a Wind-Up Depot would
      if (!isFinite(sim.s) || !isFinite(sim.spring)) return { ok: false, failedAt: i };
    }
    const p = pathAt(sim.s);
    return {
      ok: isFinite(p.p.x) && isFinite(p.p.z),
      ticks: nTicks, laps: sim.laps - before, s: +sim.s.toFixed(2),
    };
  },
  bench(nFrames) {
    nFrames = Math.max(1, nFrames | 0);
    const t0 = performance.now();
    for (let i = 0; i < nFrames; i++) {
      sim.tick(); updateCamera(FIXED_DT, false); timeSec += FIXED_DT;
      render();
    }
    const ms = (performance.now() - t0) / nFrames;
    return { frames: nFrames, msPerFrame: +ms.toFixed(3), spriteFrames: sprites.length };
  },
  stats: () => ({ s: sim.s, laps: sim.laps, spring: sim.spring, frameMs, sprites: sprites.length }),
};
window.__rug = __rug;

function main() {
  canvas = document.getElementById('c');
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  bakeSprites(spriteFrames);

  canvas.addEventListener('pointerdown', () => sim.rewind());
  window.addEventListener('keydown', e => {
    if (e.key === 'c') cam.topDown = !cam.topDown;
    if (e.key === 'f') {
      const i = FRAME_CHOICES.indexOf(sprites.length);
      bakeSprites(FRAME_CHOICES[(i + 1) % FRAME_CHOICES.length]);
    }
  });

  const out = document.getElementById('out');
  if (Q.get('cam') === 'top') cam.topDown = true;
  const freezeS = Q.get('s'), bench = Q.get('bench'), soak = Q.get('soak');
  if (soak) {
    out.hidden = false; out.textContent = JSON.stringify(__rug.soak(parseInt(soak, 10)));
    advanceTo(0); render();
    return;
  }
  if (bench) {
    updateCamera(0, true);
    const r = __rug.bench(parseInt(bench, 10));
    out.hidden = false; out.textContent = JSON.stringify(r);
    return;
  }
  if (freezeS !== null) {
    advanceTo(parseFloat(freezeS));
    render();
    return; // frozen frame for deterministic screenshots
  }
  requestAnimationFrame(frame);
}

main();
