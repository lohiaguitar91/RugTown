// Rug Town — Phase 0 spike: the carpet-level camera, now with the crossing.
//
// Week one asked whether pre-rendered sprite rotations hold up at the low,
// close, moving carpet-level follow-cam (DESIGN.md §8/§9). Week two adds the
// doc's "magic moment": a rug road crossing the rails, a pull-back car that
// stops at the gate, and the gate + bell cycling as the train goes by.
//
// Everything on the ground plane (rug, floor, track, road) is projected 3D
// geometry. Rolling stock is billboard sprites picked from N pre-rendered
// rotations — baked procedurally at load here, but consumed exactly as
// art-tool-exported frames would be. Gates and posts are thin world-space
// quads, depth-sorted with the sprites.
//
// No dependencies, no build step. Units are centimeters, y is up. The sim is
// fixed-dt and deterministic: same layout, same show, every time.
//
// Keys/taps: tap engine or car = rewind its spring · C = carpet/top-down
//            F = cycle 8/16/32/64 sprite frames
// Query:     ?s=<cm> freeze engine at rail arclength · ?frames=N
//            ?bench=<frames> · ?soak=<ticks>
//            ?clip=1 play the deterministic clip loop · ?clip=1&t=<sec> freeze
//            a clip frame · ?clipcheck=1 report clip periodicity/timings

'use strict';

// ---------------------------------------------------------------- config

const TRACK = { straight: 45, radius: 20, bedW: 4.0, grooveOff: 1.1, grooveW: 0.38, pieceStraight: 15, curvePieces: 4 };
const ROAD = { w: 7.0, x: 8, xFar: -58, zEnd: 40, corner: 12, dashLen: 3, dashGap: 3.5, dashW: 0.55 };
const RUG = { w: 150, d: 100, corner: 12 };
const CAM = { height: 4.2, follow: 30, fovY: 50 * Math.PI / 180, near: 0.6, aimUp: 2.4 };
const ENGINE = { speedMax: 26, drainPerCm: 1 / 700 };      // full spring ≈ 3+ laps
// The car runs a touch faster than the train so its wait at the gate locks its
// phase to the train's: once it has waited once, it arrives as the gate drops
// on every lap after — the common case, not a lucky one.
const CAR = { speedMax: 36, drainPerCm: 1 / 800, accel: 55, brake: 45 };
// The gate drops a fixed time before the train, not a fixed distance, so a
// wound-down engine still gives the car the same warning. A car only commits
// past its stop line if it can clear the rails before the train gets there.
const GATE = { approachSec: 2.4, clear: 10, dropSec: 0.9, liftSec: 1.4, stopBefore: 7.5, armLen: 8.6, pivotH: 4.4, carClear: 12.8, clearMargin: 0.4 };
const CLIP = { T: 14, carPeriod: 10.2, warmLaps: 5, s0: 118 };
const FIXED_DT = 1 / 120;

const Q = new URLSearchParams(location.search);
const FRAME_CHOICES = [8, 16, 32, 64];
const clampFrames = n => FRAME_CHOICES.includes(n) ? n : 16;
const spriteFrames = clampFrames(parseInt(Q.get('frames') || '16', 10));
const clipMode = Q.get('clip') === '1' || Q.get('clipcheck') === '1' || Q.get('trailer') === '1';

// ---------------------------------------------------------------- palette (lamp-lit, warm)

const C = {
  wallTop: '#120b07', wallBot: '#2b1a10',
  floor: '#462c1a', floorSeam: '#382214',
  rugField: '#a34a2e', rugBorder: '#7c3722', rugStripe: '#d9a441',
  bed: '#d9b077', groove: '#8a6238', jointGap: '#b5854f', peg: '#caa36a',
  road: '#625d56', roadEdge: '#8a857a', dash: '#d9a441',
  post: '#5a4632', armA: '#e6dccb', armB: '#b83a2a', bell: '#caa36a', bellRim: '#8a6238', crossbuck: '#e6dccb',
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
const lerp3 = (a, b, t) => v3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const wrapAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ---------------------------------------------------------------- paths (rail oval, road loop)

// A path is a list of line/arc segments with cumulative arclength. Both the
// rail oval and the rug road are stadiums built from the same machinery.
function makePath(segs) {
  let acc = 0;
  for (const s of segs) { s.s0 = acc; acc += s.len; }
  return { segs, total: acc };
}
const wrapS = (path, s) => ((s % path.total) + path.total) % path.total;

function pathAt(path, s) {
  s = wrapS(path, s);
  for (const seg of path.segs) {
    if (s > seg.s0 + seg.len + 1e-9) continue;
    const t = s - seg.s0;
    if (seg.type === 'line') return { p: add(seg.from, scale3(seg.dir, t)), tan: seg.dir };
    const a = seg.a0 + seg.dir * (t / seg.r);
    return {
      p: v3(seg.c.x + seg.r * Math.cos(a), 0, seg.c.z + seg.r * Math.sin(a)),
      tan: v3(-Math.sin(a) * seg.dir, 0, Math.cos(a) * seg.dir),
    };
  }
  const last = path.segs[path.segs.length - 1];
  return pathAt(path, last.s0);
}

// Two straights along x, two semicircle ends. s grows from the middle of the
// near straight (z = -radius side), heading +x.
const RAIL = (() => {
  const L = TRACK.straight, r = TRACK.radius;
  return makePath([
    { type: 'line', len: L, from: v3(-L / 2, 0, -r), dir: v3(1, 0, 0) },
    { type: 'arc', len: Math.PI * r, c: v3(L / 2, 0, 0), r, a0: -Math.PI / 2, dir: 1 },
    { type: 'line', len: L, from: v3(L / 2, 0, r), dir: v3(-1, 0, 0) },
    { type: 'arc', len: Math.PI * r, c: v3(-L / 2, 0, 0), r, a0: Math.PI / 2, dir: 1 },
  ]);
})();

// The road: a tall stadium whose right-hand side runs straight through the
// oval, so it crosses the near straight and the far straight once each.
const ROADPATH = (() => {
  const x1 = ROAD.x, x0 = ROAD.xFar, ze = ROAD.zEnd, r = ROAD.corner;
  const zs = ze - r, cxR = x1 - r, cxL = x0 + r;
  const L1 = 2 * zs, L2 = cxR - cxL, arc = Math.PI / 2 * r;
  return makePath([
    { type: 'line', len: L1, from: v3(x1, 0, -zs), dir: v3(0, 0, 1) },
    { type: 'arc', len: arc, c: v3(cxR, 0, zs), r, a0: 0, dir: 1 },
    { type: 'line', len: L2, from: v3(cxR, 0, ze), dir: v3(-1, 0, 0) },
    { type: 'arc', len: arc, c: v3(cxL, 0, zs), r, a0: Math.PI / 2, dir: 1 },
    { type: 'line', len: L1, from: v3(x0, 0, zs), dir: v3(0, 0, -1) },
    { type: 'arc', len: arc, c: v3(cxL, 0, -zs), r, a0: Math.PI, dir: 1 },
    { type: 'line', len: L2, from: v3(cxL, 0, -ze), dir: v3(1, 0, 0) },
    { type: 'arc', len: arc, c: v3(cxR, 0, -zs), r, a0: 3 * Math.PI / 2, dir: 1 },
  ]);
})();

// Where road meets rail. A closed road crosses a closed oval an even number
// of times, so the near crossing gets the gate and the bell and the far one
// is a plain crossbuck crossing — one gate is the whole show.
const CROSSINGS = (() => {
  const zs = ROAD.zEnd - ROAD.corner, r = TRACK.radius, L = TRACK.straight;
  const near = { p: v3(ROAD.x, 0, -r), roadS: -r + zs, railS: ROAD.x + L / 2, gated: true };
  const far = { p: v3(ROAD.x, 0, r), roadS: r + zs, railS: RAIL.segs[2].s0 + (L / 2 - ROAD.x), gated: false };
  for (const c of [near, far]) {
    c.stopS = c.roadS - GATE.stopBefore;
    c.roadTan = v3(0, 0, 1);         // car heads +z through both crossings
    c.across = v3(1, 0, 0);          // across the road
    c.angle = 0; c.bell = 0; c.active = false; c.trainIn = Infinity;
  }
  return [near, far];
})();

// Piece boundaries (peg-and-hole joints): straights split into 15 cm pieces,
// each semicircle into 4 curve pieces — the classic wooden-set vocabulary.
const JOINTS = (() => {
  const out = [], L = TRACK.straight, arc = Math.PI * TRACK.radius;
  const push = s => out.push(wrapS(RAIL, s));
  for (let k = 0; k <= L / TRACK.pieceStraight; k++) push(k * TRACK.pieceStraight);
  for (let k = 1; k < TRACK.curvePieces; k++) push(L + k * arc / TRACK.curvePieces);
  for (let k = 0; k <= L / TRACK.pieceStraight; k++) push(L + arc + k * TRACK.pieceStraight);
  for (let k = 1; k < TRACK.curvePieces; k++) push(2 * L + arc + k * arc / TRACK.curvePieces);
  return [...new Set(out.map(s => +s.toFixed(3)))];
})();

// ---------------------------------------------------------------- sim (fixed dt, deterministic)

const S = {
  eng: { s: 0, spring: 1, laps: 0 },
  car: { s: 0, v: 0, spring: 1, loops: 0, waitTicks: 0, maxWait: 0 },
  time: 0,
};

function engineSpeed() {
  if (clipMode) return RAIL.total / CLIP.T;
  return ENGINE.speedMax * (0.15 + 0.85 * S.eng.spring);
}
function carTargetSpeed() {
  if (clipMode) return ROADPATH.total / CLIP.carPeriod;
  return CAR.speedMax * (0.12 + 0.88 * S.car.spring);
}

function tick() {
  const dt = FIXED_DT;
  // engine
  const ds = engineSpeed() * dt;
  S.eng.s += ds;
  if (!clipMode) S.eng.spring = Math.max(0, S.eng.spring - ds * ENGINE.drainPerCm);
  if (S.eng.s >= RAIL.total) { S.eng.s -= RAIL.total; S.eng.laps++; }

  // gates: drop as the engine approaches, lift once it's clear
  const vEng = engineSpeed();
  for (const c of CROSSINGS) {
    if (!c.gated) continue;
    const ahead = wrapS(RAIL, c.railS - S.eng.s);
    const behind = wrapS(RAIL, S.eng.s - c.railS);
    c.trainIn = ahead / vEng;
    c.active = c.trainIn < GATE.approachSec || behind < GATE.clear;
    const rate = c.active ? dt / GATE.dropSec : -dt / GATE.liftSec;
    c.angle = Math.max(0, Math.min(1, c.angle + rate));
    c.bell = c.active ? c.bell + dt * 9 : c.bell * Math.max(0, 1 - dt * 3);
  }

  // car: obey the gate at the next crossing ahead
  const car = S.car;
  let vTarget = carTargetSpeed();
  let waiting = false;
  for (const c of CROSSINGS) {
    if (!c.gated) continue;
    const toStop = wrapS(ROADPATH, c.stopS - car.s);
    const past = wrapS(ROADPATH, car.s - c.stopS);
    if (toStop <= 40) {
      // would it clear the rails before the train, if it went for it now?
      const vGo = carTargetSpeed();
      const clearIn = (toStop + GATE.carClear) / vGo + Math.max(0, vGo - car.v) / (2 * CAR.accel);
      const mustStop = c.angle > 0.02 || c.active || clearIn + GATE.clearMargin > c.trainIn;
      if (mustStop) {
        const allowed = Math.sqrt(Math.max(0, 2 * CAR.brake * Math.max(0, toStop)));
        if (toStop <= 0.15) { vTarget = 0; waiting = true; }
        else vTarget = Math.min(vTarget, allowed);
      }
    } else if (past <= 2.2 && (c.angle > 0.02 || c.active)) {
      // overshot the line but the nose is still short of the bed: hold here
      vTarget = 0; waiting = true;
    }
  }
  if (car.v < vTarget) car.v = Math.min(vTarget, car.v + CAR.accel * dt);
  else car.v = Math.max(vTarget, car.v - CAR.brake * 1.6 * dt);
  const dc = car.v * dt;
  car.s += dc;
  if (!clipMode) car.spring = Math.max(0, car.spring - dc * CAR.drainPerCm);
  if (car.s >= ROADPATH.total) { car.s -= ROADPATH.total; car.loops++; }
  car.waitTicks = waiting ? car.waitTicks + 1 : 0;
  car.maxWait = Math.max(car.maxWait, car.waitTicks);

  S.time += dt;
}

const rewindEngine = () => { S.eng.spring = 1; };
const rewindCar = () => { S.car.spring = 1; };

// ---------------------------------------------------------------- camera

const cam = { pos: v3(0, CAM.height, 0), target: v3(0, 2, 0), topDown: false, init: false };

function followGoal() {
  const eng = pathAt(RAIL, S.eng.s);
  const back = pathAt(RAIL, S.eng.s - CAM.follow);
  return { pos: v3(back.p.x, CAM.height, back.p.z), target: v3(eng.p.x, CAM.aimUp, eng.p.z) };
}

function updateCamera(dt, snap) {
  const goal = followGoal();
  if (snap || !cam.init) { cam.pos = goal.pos; cam.target = goal.target; cam.init = true; return; }
  const k = 1 - Math.exp(-dt * 5), kt = 1 - Math.exp(-dt * 9);
  cam.pos = lerp3(cam.pos, goal.pos, k);
  cam.target = lerp3(cam.target, goal.target, kt);
}

// The clip: follow the engine off the far straight and round the curve, then
// settle onto a tripod at the near crossing and let the whole cycle play,
// then ease back behind the engine so the last frame meets the first.
const TRIPOD = (() => {
  const o = (Q.get('tripod') || '').split(',').map(Number);
  if (o.length === 6 && o.every(isFinite)) return { pos: v3(o[0], o[1], o[2]), target: v3(o[3], o[4], o[5]) };
  return { pos: v3(-14, 4.8, -46), target: v3(6, 2.3, -22) };
})();
const CLIPCAM = { toTripod: 5.6, blendIn: 0.9, fromTripod: 11.8, blendOut: 2.0, swingOutCtrl: v3(20, 14, -75) };

function clipCamera(t) {
  const f = followGoal();
  if (t >= CLIPCAM.fromTripod) {
    // leave the tripod on an arc that bows away from the crossing, so the
    // camera never passes through the gate on its way back behind the engine
    const u = smooth((t - CLIPCAM.fromTripod) / CLIPCAM.blendOut);
    const a = lerp3(TRIPOD.pos, CLIPCAM.swingOutCtrl, u), b = lerp3(CLIPCAM.swingOutCtrl, f.pos, u);
    cam.pos = lerp3(a, b, u);
    cam.target = lerp3(TRIPOD.target, f.target, u);
  } else {
    const w = t >= CLIPCAM.toTripod ? smooth((t - CLIPCAM.toTripod) / CLIPCAM.blendIn) : 0;
    cam.pos = lerp3(f.pos, TRIPOD.pos, w);
    cam.target = lerp3(f.target, TRIPOD.target, w);
  }
  cam.init = true;
}

// View basis + projection. Camera space: x right, y up, z forward (z > near visible).
let view = null, focal = 1, W = 0, H = 0;

function buildView() {
  let fwd, up = v3(0, 1, 0), pos;
  if (cam.topDown) {
    pos = v3(-20, 170, 0.01); fwd = norm(sub(v3(-20, 0, 0), pos)); up = v3(0, 0, -1);
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

// Clip a polygon against z = near in camera space, then project.
function clipProject(worldPts) {
  const poly = worldPts.map(toCam);
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

function fillPoly(ctx, pts, color) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); // hide hairline seams between quads
}

// ---------------------------------------------------------------- models + sprite baking

// Primitive builders shared by the engine and the car. Models head +z.
function modelBuilder() {
  const faces = [];
  const box = (cx, cy, cz, w, h, l, color) => {
    const x = w / 2, y = h / 2, z = l / 2;
    const p = (dx, dy, dz) => v3(cx + dx, cy + dy, cz + dz);
    const quads = [
      [p(-x, -y, z), p(x, -y, z), p(x, y, z), p(-x, y, z)],
      [p(x, -y, -z), p(-x, -y, -z), p(-x, y, -z), p(x, y, -z)],
      [p(-x, -y, -z), p(-x, -y, z), p(-x, y, z), p(-x, y, -z)],
      [p(x, -y, z), p(x, -y, -z), p(x, y, -z), p(x, y, z)],
      [p(-x, y, z), p(x, y, z), p(x, y, -z), p(-x, y, -z)],
      [p(-x, -y, -z), p(x, -y, -z), p(x, -y, z), p(-x, -y, z)],
    ];
    for (const q of quads) faces.push({ pts: q, color });
  };
  const cyl = (cx, cy, cz, r, len, axis, color, segs = 16, caps = true) => {
    const half = len / 2;
    const ring = i => {
      const a = (i / segs) * 2 * Math.PI, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      if (axis === 'z') return [v3(cx + ca, cy + sa, cz - half), v3(cx + ca, cy + sa, cz + half)];
      if (axis === 'x') return [v3(cx - half, cy + ca, cz + sa), v3(cx + half, cy + ca, cz + sa)];
      return [v3(cx + ca, cy - half, cz + sa), v3(cx + ca, cy + half, cz + sa)];
    };
    // winding must face outward for the bake's back-face test
    for (let i = 0; i < segs; i++) {
      const [a0, a1] = ring(i), [b0, b1] = ring(i + 1);
      faces.push({ pts: axis === 'y' ? [a0, a1, b1, b0] : [a0, b0, b1, a1], color });
    }
    if (caps) {
      for (const sign of [1, -1]) {
        const pts = [];
        const reverse = axis === 'y' ? sign > 0 : sign < 0;
        for (let i = 0; i < segs; i++) {
          const [lo, hi] = ring(reverse ? segs - i : i);
          pts.push(sign > 0 ? hi : lo);
        }
        faces.push({ pts, color });
      }
    }
  };
  return { faces, box, cyl };
}

// A chunky wooden engine. No face — personality comes from motion and paint (§3).
function engineFaces() {
  const m = modelBuilder();
  m.box(0, 1.45, -0.2, 4.2, 1.0, 8.8, '#5a4632');                 // walnut chassis
  for (const [x, z] of [[-1.65, 2.6], [1.65, 2.6], [-1.65, -2.4], [1.65, -2.4]])
    m.cyl(x, 1.15, z, 1.15, 0.6, 'x', '#332822', 12);              // wheels
  m.cyl(0, 3.35, 1.6, 1.85, 5.4, 'z', '#a63c2e', 18);             // boiler, painted red
  m.cyl(0, 3.35, 2.05, 1.95, 0.7, 'z', '#d9a441', 18, false);     // gold band
  m.cyl(0, 3.35, 4.05, 1.88, 0.7, 'z', '#3a2e28', 18);            // smokebox
  m.cyl(0, 5.3, 3.4, 0.55, 1.9, 'y', '#3a2e28', 12);              // chimney
  m.cyl(0, 6.35, 3.4, 0.75, 0.35, 'y', '#5a4632', 12);            // chimney lip
  m.box(0, 3.9, -2.55, 4.0, 4.0, 3.4, '#a63c2e');                 // cab
  m.box(0, 6.15, -2.55, 4.6, 0.5, 4.0, '#5a4632');                // roof
  m.box(0, 4.6, -0.6, 4.05, 1.2, 0.5, '#d9a441');                 // gold cab trim
  return m.faces;
}

// A pull-back car: a painted block on four fat wheels, cabin set back.
function carFaces() {
  const m = modelBuilder();
  m.box(0, 1.75, 0, 3.6, 1.5, 6.6, '#35566b');                     // body, painted blue
  m.box(0, 3.05, -0.4, 3.2, 1.1, 3.4, '#4a7391');                  // cabin
  m.box(0, 3.15, -0.4, 3.3, 0.55, 2.6, '#22323d');                 // window band
  m.box(0, 3.72, -0.4, 3.4, 0.28, 3.6, '#5a4632');                 // wooden roof
  m.box(0, 1.6, 3.35, 3.0, 0.5, 0.3, '#d9a441');                   // gold bumper
  for (const [x, z] of [[-1.55, 2.1], [1.55, 2.1], [-1.55, -2.1], [1.55, -2.1]])
    m.cyl(x, 1.0, z, 1.0, 0.7, 'x', '#332822', 12);
  return m.faces;
}

const BAKE = { px: 26, w: 340, h: 300, baseline: 262, elev: 7 * Math.PI / 180 };
const sprites = { engine: [], car: [] };

function bakeSet(faces, n) {
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
        const x = p.x * cy + p.z * sy, z = -p.x * sy + p.z * cy;
        return { x, y: p.y * ce + z * se, depth: -p.y * se + z * ce };
      });
      const a = pts[0], b = pts[1], c2 = pts[2];
      const nrm = norm(cross(
        v3(b.x - a.x, b.y - a.y, b.depth - a.depth),
        v3(c2.x - a.x, c2.y - a.y, c2.depth - a.depth)));
      if (nrm.z > 0) return null;
      const lit = 0.5 + 0.5 * Math.max(0, dot(v3(nrm.x, nrm.y, -nrm.z), light));
      return { depth: pts.reduce((s, p) => s + p.depth, 0) / pts.length, pts, color: shade(f.color, lit) };
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
  return out;
}

function bakeAll(n) {
  sprites.engine = bakeSet(engineFaces(), n);
  sprites.car = bakeSet(carFaces(), n);
}

function shade(hex, lit) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
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

// Quads along a path. `tag(s)` attaches build-order metadata (which piece or
// road tile a quad belongs to) so the trailer can snap the layout in piece by piece.
function ribbon(path, offA, offB, step, y, from = 0, to = path.total, tag = null) {
  const at = (s, off) => {
    const { p, tan } = pathAt(path, s);
    return v3(p.x - tan.z * off, y, p.z + tan.x * off);
  };
  const quads = [];
  for (let s = from; s < to; s += step) {
    const s2 = Math.min(s + step, to);
    const q = [at(s, offA), at(s, offB), at(s2, offB), at(s2, offA)];
    if (tag) Object.assign(q, tag(s + (s2 - s) / 2));
    quads.push(q);
  }
  return quads;
}

const railPiece = s => { let k = -1; for (const j of JOINTS) if (j <= s + 1e-6) k++; return Math.max(0, k); };
const ROAD_TILE = 13.57;
const roadTile = s => Math.floor(wrapS(ROADPATH, s) / ROAD_TILE);

// Build state, for the trailer: how many rail pieces / road tiles exist (a
// fraction means that one is still dropping in), and whether the gate and
// the vehicles are on the rug yet. Live play never touches this.
const VIS = { rail: Infinity, road: Infinity, gate: true, engine: true, car: true, engineLift: 0 };
const DROP_H = 7;
function builtQuad(q, built) {
  const idx = q.piece !== undefined ? q.piece : q.tile;
  if (idx === undefined || idx + 1 <= built) return q;
  if (idx >= built) return null;
  const lift = Math.pow(1 - (built - idx), 2) * DROP_H;
  return q.map(p => v3(p.x, p.y + lift, p.z));
}

const GROUND = (() => {
  const bw = TRACK.bedW / 2, go = TRACK.grooveOff, gw = TRACK.grooveW / 2;
  const rtag = s => ({ piece: railPiece(s) }), ttag = s => ({ tile: roadTile(s) });
  const bedQuads = ribbon(RAIL, -bw, bw, 2.5, 0.02, 0, RAIL.total, rtag);
  const grooves = [ribbon(RAIL, -go - gw, -go + gw, 2.5, 0.03, 0, RAIL.total, rtag), ribbon(RAIL, go - gw, go + gw, 2.5, 0.03, 0, RAIL.total, rtag)];
  const jointBands = [], pegs = [];
  for (const js of JOINTS) {
    jointBands.push(...ribbon(RAIL, -bw, bw, 0.7, 0.035, js - 0.35, js + 0.35, () => ({ piece: railPiece(js + 0.01) })));
    const c = pathAt(RAIL, js).p, pr = 0.55, ring = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * 2 * Math.PI;
      ring.push(v3(c.x + pr * Math.cos(a), 0.04, c.z + pr * Math.sin(a)));
    }
    pegs.push(Object.assign(ring, { piece: railPiece(js + 0.01) }));
  }
  const rw = ROAD.w / 2;
  const roadQuads = ribbon(ROADPATH, -rw, rw, 3, 0.012, 0, ROADPATH.total, ttag);
  const roadEdges = [ribbon(ROADPATH, -rw, -rw + 0.5, 3, 0.014, 0, ROADPATH.total, ttag), ribbon(ROADPATH, rw - 0.5, rw, 3, 0.014, 0, ROADPATH.total, ttag)];
  const dashes = [];
  for (let s = 0; s < ROADPATH.total; s += ROAD.dashLen + ROAD.dashGap) {
    // no dashes across the rails — the bed sits on top there anyway
    if (CROSSINGS.some(c => Math.abs(s + ROAD.dashLen / 2 - c.roadS) < 4)) continue;
    dashes.push(...ribbon(ROADPATH, -ROAD.dashW / 2, ROAD.dashW / 2, ROAD.dashLen, 0.016, s, Math.min(s + ROAD.dashLen, ROADPATH.total), ttag));
  }
  const rugOuter = roundedRect(RUG.w, RUG.d, RUG.corner);
  const rugStripeOut = roundedRect(RUG.w - 8, RUG.d - 8, RUG.corner - 3);
  const rugField = roundedRect(RUG.w - 11, RUG.d - 11, RUG.corner - 4);
  const seams = [];
  for (let z = -280; z <= 280; z += 9) seams.push([v3(-300, 0.005, z), v3(300, 0.005, z)]);
  return { bedQuads, grooves, jointBands, pegs, roadQuads, roadEdges, dashes, rugOuter, rugStripeOut, rugField, seams };
})();

// ---------------------------------------------------------------- dust motes

const motes = [];
{
  let seed = 12; // deterministic — same show every time
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    motes.push({ x: (rnd() - 0.5) * 170, y: 0.5 + rnd() * 10, z: (rnd() - 0.5) * 120, ph: rnd() * 6.28, sp: 0.2 + rnd() * 0.5 });
  }
}

// ---------------------------------------------------------------- render

let canvas, ctx, dpr = 1;

function render() {
  buildView();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const wall = ctx.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, C.wallTop); wall.addColorStop(1, C.wallBot);
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, H);

  const floorPts = clipProject([v3(-300, 0, -300), v3(300, 0, -300), v3(300, 0, 300), v3(-300, 0, 300)]);
  if (floorPts) fillPoly(ctx, floorPts, C.floor);
  ctx.strokeStyle = C.floorSeam; ctx.lineWidth = 1;
  for (const seam of GROUND.seams) {
    const pts = clipProject([seam[0], seam[1], add(seam[1], v3(0, 0.001, 0)), add(seam[0], v3(0, 0.001, 0))]);
    if (!pts) continue;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
  }

  const layers = [
    [[GROUND.rugOuter], C.rugBorder, Infinity], [[GROUND.rugStripeOut], C.rugStripe, Infinity], [[GROUND.rugField], C.rugField, Infinity],
    [GROUND.roadQuads, C.road, VIS.road], [GROUND.roadEdges[0], C.roadEdge, VIS.road], [GROUND.roadEdges[1], C.roadEdge, VIS.road], [GROUND.dashes, C.dash, VIS.road],
    [GROUND.bedQuads, C.bed, VIS.rail], [GROUND.grooves[0], C.groove, VIS.rail], [GROUND.grooves[1], C.groove, VIS.rail],
    [GROUND.jointBands, C.jointGap, VIS.rail], [GROUND.pegs, C.peg, VIS.rail],
  ];
  for (const [quads, color, built] of layers) {
    for (const q0 of quads) {
      const q = builtQuad(q0, built);
      if (!q) continue;
      const p = clipProject(q); if (p) fillPoly(ctx, p, color);
    }
  }

  // things that stand up get depth-sorted together
  const items = [];
  const eng = pathAt(RAIL, S.eng.s), car = pathAt(ROADPATH, S.car.s);
  const engAt = VIS.engineLift ? { p: v3(eng.p.x, VIS.engineLift, eng.p.z), tan: eng.tan } : eng;
  if (VIS.engine) items.push({ z: toCam(eng.p).z, draw: () => drawSprite(sprites.engine, engAt, [[5.2, 3.4, 0.16], [3.6, 2.4, 0.22]]) });
  if (VIS.car) items.push({ z: toCam(car.p).z, draw: () => drawSprite(sprites.car, car, [[4.2, 2.6, 0.16], [3.0, 1.9, 0.22]]) });
  if (VIS.gate) for (const c of CROSSINGS) for (const g of gateGeometry(c)) items.push(g);
  items.sort((a, b) => b.z - a.z);
  for (const it of items) it.draw();

  drawMotes();
  drawLamp();
  drawHud();
}

function drawSprite(set, at, shadowRings) {
  for (const [rx, rz, a] of shadowRings) {
    const ring = [];
    for (let i = 0; i < 14; i++) {
      const t = i / 14 * 2 * Math.PI;
      const lx = Math.cos(t) * rz, lz = Math.sin(t) * rx;
      ring.push(v3(at.p.x + lx * -at.tan.z + lz * at.tan.x, 0.05, at.p.z + lx * at.tan.x + lz * at.tan.z));
    }
    const p = clipProject(ring);
    if (p) fillPoly(ctx, p, `rgba(20,10,5,${a})`);
  }
  const cs = toCam(at.p);
  if (cs.z <= CAM.near) return;
  const g = toScreen(cs);
  const scale = (focal / cs.z) / BAKE.px;
  const psi = Math.atan2(at.tan.x, at.tan.z);
  const beta = Math.atan2(at.p.x - view.pos.x, at.p.z - view.pos.z);
  // screen-right is world -x when looking down +z (right = fwd × up), while the
  // bake draws +x to the right — so the frame index runs the other way round
  const n = set.length;
  const idx = ((Math.round(wrapAngle(beta - psi) / (2 * Math.PI / n)) % n) + n) % n;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(set[idx], g.x - (BAKE.w / 2) * scale, g.y - BAKE.baseline * scale, BAKE.w * scale, BAKE.h * scale);
}

// A thin world-space bar from a to b, drawn as a quad offset along `side`.
function bar(a, b, side, halfW, color) {
  const o = scale3(side, halfW);
  const p = clipProject([add(a, o), add(b, o), sub(b, o), sub(a, o)]);
  if (p) fillPoly(ctx, p, color);
}

// Gate arms on the car's approach side of each crossing, plus the bell post
// with its crossbuck. Returned as depth-sorted drawables.
function gateGeometry(c) {
  const items = [];
  const rw = ROAD.w / 2;
  const up = v3(0, 1, 0);
  if (!c.gated) {
    // plain crossing: a crossbuck on the car's right, nothing that moves
    const base = v3(c.p.x + rw + 1.4, 0, c.p.z - 6.5), top = add(base, v3(0, 6.6, 0));
    items.push({
      z: toCam(base).z,
      draw: () => {
        bar(base, top, c.roadTan, 0.3, C.post);
        const cb = add(base, v3(0, 5.6, 0)), d = 1.5;
        bar(add(cb, v3(-d, -d, 0)), add(cb, v3(d, d, 0)), c.roadTan, 0.28, C.crossbuck);
        bar(add(cb, v3(-d, d, 0)), add(cb, v3(d, -d, 0)), c.roadTan, 0.28, C.crossbuck);
      },
    });
    return items;
  }
  // two arms: one before the rails (the car's side), one after (for the other direction)
  const arms = [
    { base: v3(c.p.x + rw + 1.2, 0, c.p.z - GATE.stopBefore + 1.3), dir: v3(-1, 0, 0) },
    { base: v3(c.p.x - rw - 1.2, 0, c.p.z + GATE.stopBefore - 1.3), dir: v3(1, 0, 0) },
  ];
  const theta = (1 - c.angle) * (82 * Math.PI / 180);
  for (const a of arms) {
    const pivot = add(a.base, v3(0, GATE.pivotH, 0));
    const tip = add(pivot, add(scale3(a.dir, Math.cos(theta) * GATE.armLen), scale3(up, Math.sin(theta) * GATE.armLen)));
    items.push({
      z: toCam(pivot).z,
      draw: () => {
        bar(a.base, add(a.base, v3(0, GATE.pivotH + 0.7, 0)), c.roadTan, 0.45, C.post);
        const segs = 6;
        for (let i = 0; i < segs; i++) {
          const p0 = lerp3(pivot, tip, i / segs), p1 = lerp3(pivot, tip, (i + 1) / segs);
          bar(p0, p1, c.roadTan, 0.5, i % 2 ? C.armB : C.armA);
        }
        // counterweight stub behind the pivot
        const back = add(pivot, add(scale3(a.dir, -Math.cos(theta) * 1.8), scale3(up, -Math.sin(theta) * 1.8)));
        bar(pivot, back, c.roadTan, 0.6, C.armB);
      },
    });
  }
  // bell post with crossbuck, beside the first arm
  const bpBase = v3(c.p.x + rw + 2.6, 0, c.p.z - GATE.stopBefore - 1.2);
  const bpTop = add(bpBase, v3(0, 7.2, 0));
  items.push({
    z: toCam(bpBase).z,
    draw: () => {
      bar(bpBase, bpTop, c.roadTan, 0.32, C.post);
      const cb = add(bpBase, v3(0, 6.0, 0)), d = 1.7;
      bar(add(cb, v3(-d, -d, 0)), add(cb, v3(d, d, 0)), c.roadTan, 0.3, C.crossbuck);
      bar(add(cb, v3(-d, d, 0)), add(cb, v3(d, -d, 0)), c.roadTan, 0.3, C.crossbuck);
      // the bell hangs from a little arm and swings while the gate is busy
      const swing = Math.sin(c.bell) * Math.min(1, c.bell > 0 ? 0.55 : 0) * (c.active ? 1 : 0.6);
      const hang = add(bpBase, v3(0, 4.3, 0));
      const bell = add(hang, v3(0, -0.9, swing * 0.9));
      bar(add(bpBase, v3(0, 4.3, 0)), add(bpBase, v3(0, 4.3, -1.3)), up, 0.22, C.post);
      const cs = toCam(bell);
      if (cs.z > CAM.near) {
        const p = toScreen(cs), r = (focal / cs.z) * 0.7;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.29); ctx.fillStyle = C.bell; ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.25); ctx.strokeStyle = C.bellRim; ctx.stroke();
      }
    },
  });
  return items;
}

function drawMotes() {
  ctx.fillStyle = 'rgba(255,226,170,0.5)';
  for (const m of motes) {
    const y = m.y + Math.sin(S.time * m.sp + m.ph) * 0.8;
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
  const pool = ctx.createRadialGradient(W * 0.3, H * 0.25, H * 0.05, W * 0.3, H * 0.25, H * 0.95);
  pool.addColorStop(0, 'rgba(255,205,130,0.22)');
  pool.addColorStop(1, 'rgba(255,205,130,0)');
  ctx.fillStyle = pool; ctx.fillRect(0, 0, W, H);
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  vig.addColorStop(0, 'rgba(10,5,2,0)');
  vig.addColorStop(1, 'rgba(10,5,2,0.42)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
}

let fpsAvg = 0, hudOn = true;
function drawHud() {
  if (!hudOn) return;
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(240,225,200,0.75)';
  const bar8 = v => '▓'.repeat(Math.round(v * 8)).padEnd(8, '░');
  ctx.fillText(`engine ${bar8(S.eng.spring)}  car ${bar8(S.car.spring)}  lap ${S.eng.laps}  ${fpsAvg ? fpsAvg.toFixed(0) + 'fps' : ''}`, 12, 20);
  ctx.fillStyle = 'rgba(240,225,200,0.45)';
  ctx.fillText(`[tap engine/car] rewind   [c] camera   [f] frames: ${sprites.engine.length}`, 12, 38);
}

// ---------------------------------------------------------------- loop, input, harness

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
}

let acc = 0, lastT = null, frameMs = 0;
let clipTick = 0;                                   // integer ticks since clip t=0 — no float drift
const CLIP_TICKS = Math.round(CLIP.T / FIXED_DT);
const clipT = () => clipTick * FIXED_DT;

function frame(t) {
  if (lastT === null) lastT = t;
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0);
  lastT = t;
  if (dt > 0) fpsAvg = fpsAvg ? lerp(fpsAvg, 1 / dt, 0.05) : 1 / dt;
  acc += dt;
  while (acc >= FIXED_DT) {
    tick(); acc -= FIXED_DT;
    if (clipMode) { clipTick++; if (clipTick >= CLIP_TICKS) clipSeek(0); }
  }
  if (clipMode) clipCamera(clipT()); else updateCamera(dt, false);
  const t0 = performance.now();
  render();
  frameMs = performance.now() - t0;
  requestAnimationFrame(frame);
}

// Deterministic placement for freeze-frame screenshots; wraps into one lap.
function advanceTo(s) {
  s = isFinite(s) ? wrapS(RAIL, s) : 0;
  while (S.eng.s < s - 1e-6 && S.eng.laps === 0) tick();
  updateCamera(0, true);
}

// --- clip mode: warm the sim up until the car has locked its phase to the
// train, then define t=0 as the engine passing CLIP.s0. Seeking restores the
// snapshot and re-ticks, so every frame is a pure function of t.
let clipSnapshot = null;
function clipWarmup() {
  let prev = S.eng.s;
  while (!(S.eng.laps >= CLIP.warmLaps && prev < CLIP.s0 && S.eng.s >= CLIP.s0)) { prev = S.eng.s; tick(); }
  clipSnapshot = JSON.stringify({ S, gates: CROSSINGS.map(c => ({ angle: c.angle, bell: c.bell, active: c.active, trainIn: c.trainIn === Infinity ? null : c.trainIn })) });
  clipTick = 0;
}
function clipRestore() {
  const snap = JSON.parse(clipSnapshot);
  Object.assign(S.eng, snap.S.eng); Object.assign(S.car, snap.S.car); S.time = snap.S.time;
  snap.gates.forEach((g, i) => Object.assign(CROSSINGS[i], g, { trainIn: g.trainIn === null ? Infinity : g.trainIn }));
  clipTick = 0;
}
// Seek to clip time t (wrapped into the loop). Pure function of t.
function clipSeek(t) {
  t = isFinite(t) ? ((t % CLIP.T) + CLIP.T) % CLIP.T : 0;
  const target = Math.min(CLIP_TICKS - 1, Math.round(t / FIXED_DT));
  if (target < clipTick) clipRestore();
  while (clipTick < target) { tick(); clipTick++; }
  clipCamera(clipT());
}

const __rug = {
  soak(nTicks) {
    const before = S.eng.laps, carBefore = S.car.loops;
    S.car.maxWait = 0;
    for (let i = 0; i < nTicks; i++) {
      tick();
      if (S.eng.spring < 0.2) rewindEngine();   // keep it running like a Wind-Up Depot would
      if (S.car.spring < 0.2) rewindCar();
      if (![S.eng.s, S.car.s, S.car.v].every(isFinite)) return { ok: false, failedAt: i };
    }
    const p = pathAt(RAIL, S.eng.s), q = pathAt(ROADPATH, S.car.s);
    const maxWaitSec = S.car.maxWait * FIXED_DT;
    return {
      ok: [p.p.x, p.p.z, q.p.x, q.p.z].every(isFinite) && S.car.loops > carBefore && maxWaitSec < 8,
      ticks: nTicks, laps: S.eng.laps - before, carLoops: S.car.loops - carBefore,
      carMaxWaitSec: +maxWaitSec.toFixed(2),
    };
  },
  bench(nFrames) {
    nFrames = Math.max(1, nFrames | 0);
    const t0 = performance.now();
    for (let i = 0; i < nFrames; i++) { tick(); updateCamera(FIXED_DT, false); render(); }
    return { frames: nFrames, msPerFrame: +((performance.now() - t0) / nFrames).toFixed(3), spriteFrames: sprites.engine.length };
  },
  // Clip periodicity + event timeline: when the near gate drops, when the car
  // reaches its stop line, when the engine crosses, when the gate is fully up.
  clipCheck() {
    clipSeek(0);
    const start = { engS: S.eng.s, carS: S.car.s, carV: S.car.v };
    const near = CROSSINGS[0], ev = [];
    let wasActive = near.active, wasStopped = false, wasUp = near.angle < 0.02, prevAhead = wrapS(RAIL, near.railS - S.eng.s);
    for (let i = 0; i < CLIP_TICKS; i++) {
      tick(); clipTick++;
      const now = +clipT().toFixed(2);
      const stopped = S.car.v < 0.05 && Math.abs(S.car.s - near.stopS) < 0.5;
      const ahead = wrapS(RAIL, near.railS - S.eng.s);
      if (near.active && !wasActive) ev.push(['gateDrops', now]);
      if (stopped && !wasStopped) ev.push(['carStops', now]);
      if (!stopped && wasStopped) ev.push(['carGoes', now]);
      if (ahead > prevAhead) ev.push(['engineCrosses', now]);
      if (near.angle < 0.02 && !wasUp) ev.push(['gateUp', now]);
      wasActive = near.active; wasStopped = stopped; wasUp = near.angle < 0.02; prevAhead = ahead;
    }
    const end = { engS: S.eng.s, carS: S.car.s, carV: S.car.v };
    const dEng = Math.abs(wrapAngle((end.engS - start.engS) / RAIL.total * 2 * Math.PI)) * RAIL.total / (2 * Math.PI);
    const dCar = Math.abs(wrapAngle((end.carS - start.carS) / ROADPATH.total * 2 * Math.PI)) * ROADPATH.total / (2 * Math.PI);
    clipSeek(0);
    return { T: CLIP.T, loopErrorCm: { engine: +dEng.toFixed(2), car: +dCar.toFixed(2) }, start, end, events: ev };
  },
  clipSeek(t) { clipSeek(t); render(); return { t: clipT(), engS: +S.eng.s.toFixed(2), carS: +S.car.s.toFixed(2) }; },
  hud(on) { hudOn = !!on; },
  stats: () => ({ eng: S.eng, car: S.car, frameMs, sprites: sprites.engine.length }),
};
window.__rug = __rug;

function screenOf(path, s) {
  buildView();
  const c = toCam(pathAt(path, s).p);
  return c.z > CAM.near ? toScreen(c) : null;
}

function main() {
  canvas = document.getElementById('c');
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  bakeAll(spriteFrames);

  canvas.addEventListener('pointerdown', e => {
    const carPx = screenOf(ROADPATH, S.car.s), engPx = screenOf(RAIL, S.eng.s);
    const d = p => p ? Math.hypot(p.x - e.clientX, p.y - e.clientY) : Infinity;
    if (d(carPx) < 70 && d(carPx) < d(engPx)) rewindCar(); else rewindEngine();
  });
  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key === 'c') cam.topDown = !cam.topDown;
    if (key === 'f') {
      const i = FRAME_CHOICES.indexOf(sprites.engine.length);
      bakeAll(FRAME_CHOICES[(i + 1) % FRAME_CHOICES.length]);
    }
  });

  const out = document.getElementById('out');
  if (Q.get('cam') === 'top') cam.topDown = true;
  if (Q.get('hud') === '0') hudOn = false;
  const freezeS = Q.get('s'), bench = Q.get('bench'), soak = Q.get('soak');
  if (soak) {
    out.hidden = false; out.textContent = JSON.stringify(__rug.soak(parseInt(soak, 10)));
    advanceTo(0); render();
    return;
  }
  if (bench) {
    updateCamera(0, true);
    out.hidden = false; out.textContent = JSON.stringify(__rug.bench(parseInt(bench, 10)));
    return;
  }
  if (clipMode) {
    clipWarmup();
    if (Q.get('trailer') === '1') { hudOn = false; return; }   // trailer.js drives from here
    if (Q.get('clipcheck') === '1') { out.hidden = false; out.textContent = JSON.stringify(__rug.clipCheck()); render(); return; }
    const t = Q.get('t');
    if (t !== null) { clipSeek(parseFloat(t)); render(); return; }
    clipSeek(0);
    requestAnimationFrame(frame);
    return;
  }
  if (freezeS !== null) { advanceTo(parseFloat(freezeS)); render(); return; }
  requestAnimationFrame(frame);
}

main();
