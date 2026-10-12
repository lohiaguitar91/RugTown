// Rug Town — Phase 0 spike: the carpet-level camera, the crossing, and now
// the build verb.
//
// Week one asked whether pre-rendered sprite rotations hold up at the low,
// close, moving carpet-level follow-cam (DESIGN.md §8/§9). Week two added the
// crossing. Week three makes building real: the rails are a graph of placed
// peg-and-hole pieces, the engine runs whatever you laid, and wherever a rail
// piece crosses the rug road a gated crossing appears.
//
// Everything on the ground plane (rug, floor, track, road) is projected 3D
// geometry. Rolling stock is billboard sprites picked from N pre-rendered
// rotations — baked procedurally at load here, but consumed exactly as
// art-tool-exported frames would be. Gates and posts are thin world-space
// quads, depth-sorted with the sprites.
//
// No dependencies, no build step. Units are centimeters, y is up. The sim is
// fixed-dt and deterministic: same layout, same show, every time. The phone
// is the design baseline (DESIGN.md §7): build.js does the touch work.
//
// This file: layout model + track assembly, sim, cameras, renderer, harness.
// build.js (loaded by index.html, not by the trailer): the toy bin, drag and
// snap, pull-back, pan/zoom, sounds, the share link in the URL hash.
//
// Keys:   C = carpet/top-down · F = cycle 8/16/32/64 sprite frames
// Query:  ?s=<cm> freeze engine at rail arclength · ?frames=N · ?cam=top
//         ?bench=<frames> · ?soak=<ticks> · ?soaklayouts=<n> (random layouts)
//         ?clip=1 the deterministic clip loop · ?clip=1&t=<sec> freeze a frame
//         ?clipcheck=1 report clip periodicity/timings · #<layout> share link

'use strict';

// ---------------------------------------------------------------- config

const TRACK = { bedW: 4.0, grooveOff: 1.1, grooveW: 0.38 };
const PIECE_LEN = 15, CURVE_R = 20, CURVE_ANG = Math.PI / 4;   // the classic set: 15 cm straights, 45° curves
const ROAD = { w: 7.0, x: 8, xFar: -58, zEnd: 40, corner: 12, dashLen: 3, dashGap: 3.5, dashW: 0.55 };
const RUG = { w: 150, d: 100, corner: 12, margin: 3 };
const CAM = { height: 5.0, follow: 30, fovY: 50 * Math.PI / 180, near: 0.6, aimUp: 3.5 };
const RAIL_H = 1.2;   // the wooden pieces are blocks, not paint: bed top sits this far above the rug
const ENGINE = { speedMax: 26, drainPerCm: 1 / 700, pullFull: 24 };   // full spring ≈ 3 laps of the oval
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
const MATE_TOL = 0.6, MATE_ANG = 0.2;   // two ends connect within this distance (cm) and heading mismatch (rad)

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
  bed: '#d9b077', bedSide: '#b08a58', groove: '#8a6238', jointGap: '#b5854f', peg: '#caa36a',
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
const wrapAngle = a => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const dirOf = h => v3(Math.sin(h), 0, Math.cos(h));          // heading h=0 is +z, h=π/2 is +x
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- paths

// A path is a list of line/arc segments with cumulative arclength. The rug
// road, every rail piece, and the assembled track all use the same machinery.
function makePath(segs, closed = false) {
  let acc = 0;
  for (const s of segs) { s.s0 = acc; acc += s.len; }
  return { segs, total: acc, closed };
}
const wrapS = (path, s) => ((s % path.total) + path.total) % path.total;

// Along a closed path s wraps; along an open one (a single piece, a chain
// with buffer ends) it clamps — so the end of a piece is its end.
function pathAt(path, s) {
  s = path.closed ? wrapS(path, s) : Math.max(0, Math.min(path.total, s));
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

// Nearest point on a path to a ground point: returns { s, d }.
function nearestOnPath(path, p, step = 1.5) {
  let best = { s: 0, d: Infinity };
  for (let s = 0; s <= path.total; s += step) {
    const d = dist2(pathAt(path, s).p, p);
    if (d < best.d) best = { s, d };
  }
  for (let s = best.s - step; s <= best.s + step; s += step / 8) {
    if (s < 0 || s > path.total) continue;
    const d = dist2(pathAt(path, s).p, p);
    if (d < best.d) best = { s, d };
  }
  return best;
}

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
  ], true);
})();
const ROAD_POLY = (() => {   // tessellated once, for crossing detection
  const pts = [];
  for (let s = 0; s <= ROADPATH.total; s += 2) pts.push({ s, p: pathAt(ROADPATH, s).p });
  pts.push({ s: ROADPATH.total, p: pathAt(ROADPATH, ROADPATH.total).p });   // close the loop: the last 1.4 cm count too
  return pts;
})();

// ---------------------------------------------------------------- pieces and the layout

// A piece is a start peg (x, z), a heading, a type and (for curves) a hand:
// +1 turns the heading left as you go, -1 right. Everything else about it is
// derived: its forward path segment, both ends, its centerline samples.
function pieceGeom(pc) {
  const P = v3(pc.x, 0, pc.z), d = dirOf(pc.h);
  if (pc.t === 'S') {
    const seg = { type: 'line', len: PIECE_LEN, from: P, dir: d };
    return { seg, len: PIECE_LEN, start: { p: P, h: pc.h }, end: { p: add(P, scale3(d, PIECE_LEN)), h: pc.h } };
  }
  const n = v3(Math.cos(pc.h), 0, -Math.sin(pc.h));              // the side a left turn bends toward
  const c = add(P, scale3(n, pc.hand * CURVE_R));
  const a0 = Math.atan2(P.z - c.z, P.x - c.x), dirSign = -pc.hand;
  const len = CURVE_R * CURVE_ANG, a1 = a0 + dirSign * CURVE_ANG;
  const seg = { type: 'arc', len, c, r: CURVE_R, a0, dir: dirSign };
  return { seg, len, start: { p: P, h: pc.h }, end: { p: v3(c.x + CURVE_R * Math.cos(a1), 0, c.z + CURVE_R * Math.sin(a1)), h: pc.h + pc.hand * CURVE_ANG } };
}
// Both ends with their outward headings: snapping a new piece onto an end
// means the new piece starts there, pointing outward.
function pieceEnds(pc) {
  const g = pieceGeom(pc);
  return [{ p: g.start.p, out: g.start.h + Math.PI, which: 0 }, { p: g.end.p, out: g.end.h, which: 1 }];
}
function pieceSamples(pc, step = 2.5) {
  const g = pieceGeom(pc), path = makePath([g.seg]), out = [];
  for (let s = 0; s <= g.len + 1e-6; s += step) out.push(pathAt(path, Math.min(s, g.len)).p);
  return out;
}
// The piece that continues from an open end.
function pieceAfter(end, t, hand) { return { t, hand: t === 'C' ? hand : 0, x: end.p.x, z: end.p.z, h: wrapAngle(end.out) }; }

// Off the rug, or overlapping another piece (except at a shared joint): not a
// placement. The builder's ghost just doesn't snap there.
function pieceFits(pc, layout, ignoreIdx = -1) {
  const hw = RUG.w / 2 - RUG.margin, hd = RUG.d / 2 - RUG.margin;
  const samples = pieceSamples(pc);
  for (const q of samples) if (Math.abs(q.x) > hw || Math.abs(q.z) > hd) return false;
  const myEnds = pieceEnds(pc);
  for (let i = 0; i < layout.length; i++) {
    if (i === ignoreIdx) continue;
    const other = layout[i];
    const mates = pieceEnds(other).filter(e => myEnds.some(m => dist2(m.p, e.p) < MATE_TOL)).map(e => e.p);
    for (const q of samples) {
      if (mates.some(m => dist2(m, q) < 5.0)) continue;   // wider than the sample spacing, so a shared joint never trips it
      for (const r of pieceSamples(other)) if (dist2(q, r) < 3.8) return false;
    }
  }
  return true;
}

// The layout: the list of placed pieces, plus connectivity derived by
// proximity so that moving one piece can never leave a stale link behind.
let LAYOUT = [];
let CONN = [];   // CONN[i][which] = { piece, which } or null

function rebuildConnections() {
  CONN = LAYOUT.map(() => [null, null]);
  const ends = [];
  LAYOUT.forEach((pc, i) => pieceEnds(pc).forEach(e => ends.push({ ...e, piece: i })));
  for (let a = 0; a < ends.length; a++) for (let b = a + 1; b < ends.length; b++) {
    const A = ends[a], B = ends[b];
    if (A.piece === B.piece) continue;
    if (dist2(A.p, B.p) > MATE_TOL) continue;
    if (Math.abs(wrapAngle(A.out - B.out + Math.PI)) > MATE_ANG) continue;
    if (CONN[A.piece][A.which] || CONN[B.piece][B.which]) continue;
    CONN[A.piece][A.which] = { piece: B.piece, which: B.which };
    CONN[B.piece][B.which] = { piece: A.piece, which: A.which };
  }
}
const openEnds = () => {
  const out = [];
  LAYOUT.forEach((pc, i) => pieceEnds(pc).forEach(e => { if (!CONN[i][e.which]) out.push({ ...e, piece: i }); }));
  return out;
};

// Walk the chain a piece belongs to. Pieces have degree ≤ 2, so a chain is a
// loop or a line with two buffer ends. A closed loop starts at its lowest
// piece index, traversed forward; an open one starts at an open end.
function chainOf(pieceIdx) {
  const step = (piece, forward) => {   // the piece we exit into, and how we traverse it
    const exitWhich = forward ? 1 : 0, c = CONN[piece][exitWhich];
    if (!c) return null;
    return { piece: c.piece, forward: c.which === 0 };
  };
  const back = (piece, forward) => {
    const entryWhich = forward ? 0 : 1, c = CONN[piece][entryWhich];
    if (!c) return null;
    return { piece: c.piece, forward: c.which === 1 };
  };
  let head = { piece: pieceIdx, forward: true }, closed = false;
  const seen = new Set([pieceIdx]);
  for (;;) {
    const prev = back(head.piece, head.forward);
    if (!prev) break;
    if (seen.has(prev.piece)) { closed = true; break; }
    seen.add(prev.piece); head = prev;
  }
  if (closed) {
    let lowest = pieceIdx;
    for (const i of seen) if (i < lowest) lowest = i;
    head = { piece: lowest, forward: true };
  }
  const order = [];
  let cur = head;
  const seen2 = new Set();
  while (cur && !seen2.has(cur.piece)) { order.push(cur); seen2.add(cur.piece); cur = step(cur.piece, cur.forward); }
  return { order, closed };
}

// Assemble a chain into a path the engine can run on. The default oval
// assembles to exactly the stadium the clip, the trailer and the harness
// were tuned against.
function assembleTrack(pieceIdx) {
  const chain = chainOf(pieceIdx), segs = [], pieces = [];
  let s0 = 0;
  for (const { piece, forward } of chain.order) {
    const g = pieceGeom(LAYOUT[piece]);
    let seg;
    if (forward) seg = { ...g.seg };
    else if (g.seg.type === 'line') seg = { type: 'line', len: g.len, from: g.end.p, dir: scale3(g.seg.dir, -1) };
    else seg = { type: 'arc', len: g.len, c: g.seg.c, r: g.seg.r, a0: g.seg.a0 + g.seg.dir * CURVE_ANG, dir: -g.seg.dir };
    segs.push(seg);
    pieces.push({ idx: piece, forward, s0, len: g.len });
    s0 += g.len;
  }
  return { path: makePath(segs, chain.closed), closed: chain.closed, pieces };
}

// ---------------------------------------------------------------- the track, crossings, geometry (rebuilt on change)

let RAIL = makePath([{ type: 'line', len: 1, from: v3(0, 0, 0), dir: v3(1, 0, 0) }]);
let TRACKINFO = { path: RAIL, closed: false, pieces: [] };
let JOINTS = [];
let CROSSINGS = [];
let PIECE_CENTER = [], TILE_CENTER = [];

function trackPieceOf(idx) { return TRACKINFO.pieces.find(p => p.idx === idx) || null; }

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

// Quads along a path. `tag` attaches build-order metadata (which piece or road
// tile a quad belongs to) so the trailer can snap the layout in piece by piece.
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

const ROAD_TILE = 13.57;
const roadTile = s => Math.floor(wrapS(ROADPATH, s) / ROAD_TILE);

// One wooden block: bed top, two grooves, both side faces, end caps, a joint
// band and a peg at each end. Everything tagged with the piece's index.
function pieceQuads(pc, idx, into) {
  const g = pieceGeom(pc), path = makePath([g.seg]), top = RAIL_H;
  const bw = TRACK.bedW / 2, go = TRACK.grooveOff, gw = TRACK.grooveW / 2;
  const tag = () => ({ piece: idx });
  into.bedQuads.push(...ribbon(path, -bw, bw, 2.5, top + 0.02, 0, g.len, tag));
  into.grooves[0].push(...ribbon(path, -go - gw, -go + gw, 2.5, top + 0.03, 0, g.len, tag));
  into.grooves[1].push(...ribbon(path, go - gw, go + gw, 2.5, top + 0.03, 0, g.len, tag));
  const at = (s, off, y) => { const { p, tan } = pathAt(path, s); return v3(p.x - tan.z * off, y, p.z + tan.x * off); };
  for (let s = 0; s < g.len; s += 2.5) {
    const s2 = Math.min(s + 2.5, g.len);
    into.sides.push(Object.assign([at(s, -bw, 0), at(s, -bw, top), at(s2, -bw, top), at(s2, -bw, 0)], { piece: idx }));
    into.sides.push(Object.assign([at(s, bw, 0), at(s, bw, top), at(s2, bw, top), at(s2, bw, 0)], { piece: idx }));
  }
  for (const s of [0, g.len]) {
    into.sides.push(Object.assign([at(s, -bw, 0), at(s, bw, 0), at(s, bw, top), at(s, -bw, top)], { piece: idx }));
    const b0 = s === 0 ? 0 : g.len - 0.35, b1 = s === 0 ? 0.35 : g.len;
    into.jointBands.push(...ribbon(path, -bw, bw, 0.7, top + 0.035, b0, b1, tag));
    const c = pathAt(path, s).p, pr = 0.55, ring = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * 2 * Math.PI;
      ring.push(v3(c.x + pr * Math.cos(a), top + 0.04, c.z + pr * Math.sin(a)));
    }
    into.pegs.push(Object.assign(ring, { piece: idx }));
  }
}

const GROUND = (() => {
  const rw = ROAD.w / 2, ttag = s => ({ tile: roadTile(s) });
  const roadQuads = ribbon(ROADPATH, -rw, rw, 3, 0.012, 0, ROADPATH.total, ttag);
  const roadEdges = [ribbon(ROADPATH, -rw, -rw + 0.5, 3, 0.014, 0, ROADPATH.total, ttag), ribbon(ROADPATH, rw - 0.5, rw, 3, 0.014, 0, ROADPATH.total, ttag)];
  const rugOuter = roundedRect(RUG.w, RUG.d, RUG.corner);
  const rugStripeOut = roundedRect(RUG.w - 8, RUG.d - 8, RUG.corner - 3);
  const rugField = roundedRect(RUG.w - 11, RUG.d - 11, RUG.corner - 4);
  const seams = [];
  for (let z = -280; z <= 280; z += 9) seams.push([v3(-300, 0.005, z), v3(300, 0.005, z)]);
  return { bedQuads: [], grooves: [[], []], jointBands: [], pegs: [], sides: [], dashes: [], roadQuads, roadEdges, rugOuter, rugStripeOut, rugField, seams };
})();
TILE_CENTER = Array.from({ length: Math.ceil(ROADPATH.total / ROAD_TILE) }, (_, k) => pathAt(ROADPATH, (k + 0.5) * ROAD_TILE).p);

// Where road meets rail: every intersection of a piece's centerline with the
// road's. The ones on the engine's track get a gate; the rest a crossbuck.
function findCrossings() {
  const out = [];
  LAYOUT.forEach((pc, idx) => {
    const g = pieceGeom(pc), path = makePath([g.seg]);
    const pts = [];
    const n = pc.t === 'S' ? 2 : 9;
    for (let i = 0; i < n; i++) { const s = g.len * i / (n - 1); pts.push({ s, p: pathAt(path, s).p }); }
    for (let i = 0; i + 1 < pts.length; i++) for (let j = 0; j + 1 < ROAD_POLY.length; j++) {
      const a = pts[i].p, b = pts[i + 1].p, c = ROAD_POLY[j].p, d = ROAD_POLY[j + 1].p;
      const den = (b.x - a.x) * (d.z - c.z) - (b.z - a.z) * (d.x - c.x);
      if (Math.abs(den) < 1e-9) continue;
      const u = ((c.x - a.x) * (d.z - c.z) - (c.z - a.z) * (d.x - c.x)) / den;
      const v = ((c.x - a.x) * (b.z - a.z) - (c.z - a.z) * (b.x - a.x)) / den;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const p = v3(a.x + (b.x - a.x) * u, 0, a.z + (b.z - a.z) * u);
      const roadS = ROAD_POLY[j].s + (ROAD_POLY[j + 1].s - ROAD_POLY[j].s) * v;
      const localS = pts[i].s + (pts[i + 1].s - pts[i].s) * u;
      if (out.some(x => dist2(x.p, p) < 3)) continue;
      const roadTan = pathAt(ROADPATH, roadS).tan;
      out.push({ p, roadS, piece: idx, localS, roadTan, right: v3(roadTan.z, 0, -roadTan.x), gated: false, trackS: null, stopS: wrapS(ROADPATH, roadS - GATE.stopBefore), angle: 0, bell: 0, active: false, trainIn: Infinity });
    }
  });
  out.sort((a, b) => a.roadS - b.roadS);
  return out;
}

// The engine's whereabouts, in terms that survive a rebuild: which piece it's
// on, how far along it (in the piece's own direction), and which way it faces.
function engineAnchor() {
  const e = S.eng;
  if (!e.placed) return null;
  const tp = TRACKINFO.pieces.find(p => e.s >= p.s0 - 1e-6 && e.s <= p.s0 + p.len + 1e-6) || TRACKINFO.pieces[0];
  if (!tp) return null;
  const along = e.s - tp.s0;
  return { piece: tp.idx, local: tp.forward ? along : tp.len - along, facing: tp.forward ? e.dir : -e.dir };
}

// Rebuild everything derived from the layout. `anchor` puts the engine back
// where it was; a removed piece sends the engine back to the bin.
function rebuild(anchor = engineAnchor()) {
  rebuildConnections();
  const old = CROSSINGS;
  let ref = anchor && LAYOUT[anchor.piece] ? anchor.piece : (LAYOUT.length ? 0 : -1);
  if (ref >= 0) {
    TRACKINFO = assembleTrack(ref);
    RAIL = TRACKINFO.path;
  } else {
    RAIL = makePath([{ type: 'line', len: 1, from: v3(0, 0, 0), dir: v3(1, 0, 0) }]);
    TRACKINFO = { path: RAIL, closed: false, pieces: [] };
  }
  JOINTS = TRACKINFO.pieces.map(p => +p.s0.toFixed(3));
  if (!TRACKINFO.closed && TRACKINFO.pieces.length) JOINTS.push(+RAIL.total.toFixed(3));
  PIECE_CENTER = TRACKINFO.pieces.map(p => pathAt(RAIL, p.s0 + p.len / 2).p);

  // engine
  if (anchor && LAYOUT[anchor.piece]) {
    const tp = trackPieceOf(anchor.piece);
    S.eng.placed = true;
    S.eng.s = tp.s0 + (tp.forward ? anchor.local : tp.len - anchor.local);
    S.eng.dir = tp.forward ? anchor.facing : -anchor.facing;
    S.eng.piece = anchor.piece;
    // stopped at a buffer end that isn't one any more (the gap was filled, or
    // track was laid in front of it): it goes again, the spring is still wound
    const atEnd = !TRACKINFO.closed && ((S.eng.dir > 0 && S.eng.s >= RAIL.total - 0.01) || (S.eng.dir < 0 && S.eng.s <= 0.01));
    if (S.eng.halted && !atEnd) S.eng.halted = false;
  } else {
    S.eng.placed = false; S.eng.s = 0; S.eng.dir = 1; S.eng.halted = false;
  }

  // crossings: gates on the engine's track; carry gate state across the rebuild.
  // The clip is the exception: it was choreographed with one gate (the oval's
  // geometry parks the car at the far one otherwise), so in clip mode only the
  // first crossing on the track is gated — the far one stays a crossbuck.
  CROSSINGS = findCrossings();
  let gates = 0;
  for (const c of CROSSINGS) {
    const tp = trackPieceOf(c.piece);
    if (tp && !(clipMode && gates > 0)) { c.gated = true; gates++; c.trackS = tp.s0 + (tp.forward ? c.localS : tp.len - c.localS); }
    const prev = old.find(o => dist2(o.p, c.p) < 1);
    if (prev) { c.angle = prev.angle; c.bell = prev.bell; c.active = prev.active; }
  }

  // geometry
  GROUND.bedQuads = []; GROUND.grooves = [[], []]; GROUND.jointBands = []; GROUND.pegs = []; GROUND.sides = [];
  LAYOUT.forEach((pc, idx) => pieceQuads(pc, idx, GROUND));
  GROUND.dashes = [];
  const ttag = s => ({ tile: roadTile(s) });
  for (let s = 0; s < ROADPATH.total; s += ROAD.dashLen + ROAD.dashGap) {
    if (CROSSINGS.some(c => Math.abs(s + ROAD.dashLen / 2 - c.roadS) < 4)) continue;   // the bed sits on top there anyway
    GROUND.dashes.push(...ribbon(ROADPATH, -ROAD.dashW / 2, ROAD.dashW / 2, ROAD.dashLen, 0.016, s, Math.min(s + ROAD.dashLen, ROADPATH.total), ttag));
  }
  for (const f of LAYOUT_HOOKS) f();
}
const LAYOUT_HOOKS = [];   // build.js listens: the share link, the bin state

// The default floor: the oval — three straights, four right-hand curves,
// three straights, four curves — starting mid near-straight, heading +x,
// which is exactly where the clip's s=0 has always been.
function defaultLayout() {
  const out = [];
  let end = { p: v3(-22.5, 0, -20), out: Math.PI / 2 };
  for (const t of 'SSSCCCCSSSCCCC') {
    const pc = pieceAfter(end, t, -1);
    out.push(pc);
    end = pieceEnds(pc)[1];
  }
  return out;
}

// --- the share link: pieces as type@x,z,heading°; the engine as piece,local,facing
function serializeLayout() {
  const parts = LAYOUT.map(pc => `${pc.t === 'C' ? (pc.hand > 0 ? 'L' : 'R') : 'S'}${pc.x.toFixed(2)},${pc.z.toFixed(2)},${Math.round(pc.h * 180 / Math.PI)}`);
  const a = engineAnchor();
  parts.push(a ? `E${a.piece},${a.local.toFixed(1)},${a.facing}` : 'E-1');   // E-1: the engine is in the bin
  return 'v1;' + parts.join(';');
}
function parseLayout(str) {
  if (!str || !str.startsWith('v1;')) return null;
  const pieces = []; let eng = null;
  for (const part of str.slice(3).split(';')) {
    const k = part[0], nums = part.slice(1).split(',').map(Number);
    if (k === 'E') {
      if (nums.length === 1 && nums[0] < 0) eng = { piece: -1 };
      else if (nums.length === 3 && nums.every(isFinite)) eng = { piece: nums[0] | 0, local: nums[1], facing: nums[2] >= 0 ? 1 : -1 };
      continue;
    }
    if (!'SLR'.includes(k) || nums.length !== 3 || !nums.every(isFinite) || Math.abs(nums[0]) > 1e4 || Math.abs(nums[1]) > 1e4) return null;
    pieces.push({ t: k === 'S' ? 'S' : 'C', hand: k === 'L' ? 1 : k === 'R' ? -1 : 0, x: nums[0], z: nums[1], h: nums[2] * Math.PI / 180 });
  }
  if (!pieces.length || pieces.length > 400) return null;
  return { pieces, eng };
}
// `eng`: an anchor to put the engine at; { piece: -1 } keeps it in the bin;
// null/undefined (an old link, or no engine entry) puts it on the first piece.
function loadLayout(pieces, eng) {
  LAYOUT = pieces.map(p => ({ ...p }));
  S.eng.spring = 1; S.eng.laps = 0; S.eng.halted = false;
  let anchor = LAYOUT.length ? { piece: 0, local: PIECE_LEN / 2, facing: 1 } : null;
  if (eng && eng.piece < 0) anchor = null;
  else if (eng && LAYOUT[eng.piece]) anchor = eng;
  rebuild(anchor);
}

// ---------------------------------------------------------------- sim (fixed dt, deterministic)

const S = {
  eng: { placed: false, piece: 0, s: 0, dir: 1, spring: 1, laps: 0, halted: false, v: 0 },
  car: { s: 0, v: 0, spring: 1, loops: 0, waitTicks: 0, maxWait: 0 },
  time: 0,
};
const SIM_EVENTS = [];   // 'bump' when the engine reaches a buffer end; build.js plays it

function engineSpeed() {
  if (clipMode) return RAIL.total / CLIP.T;
  return ENGINE.speedMax * S.eng.spring;   // wind-ups run down and coast to a stop (§5)
}
function carTargetSpeed() {
  if (clipMode) return ROADPATH.total / CLIP.carPeriod;
  return CAR.speedMax * (0.12 + 0.88 * S.car.spring);
}

// Signed track distance from the engine to a track point, in the direction
// the engine faces (negative = behind it).
function trackAhead(trackS) {
  const e = S.eng;
  if (TRACKINFO.closed) return wrapS(RAIL, e.dir > 0 ? trackS - e.s : e.s - trackS);
  return (trackS - e.s) * e.dir;
}

function tick() {
  const dt = FIXED_DT, e = S.eng;
  // engine
  let vEng = 0;
  if (e.placed && !e.halted) {
    vEng = engineSpeed();
    const ds = vEng * dt * e.dir;
    e.s += ds;
    if (!clipMode) e.spring = Math.max(0, e.spring - Math.abs(ds) * ENGINE.drainPerCm);
    if (TRACKINFO.closed) {
      if (e.s >= RAIL.total) { e.s -= RAIL.total; e.laps++; }
      if (e.s < 0) e.s += RAIL.total;
    } else if (e.s < 0 || e.s > RAIL.total) {
      e.s = Math.max(0, Math.min(RAIL.total, e.s));
      e.halted = true; vEng = 0;
      SIM_EVENTS.push('bump');
    }
  }
  e.v = vEng;
  const moving = e.placed && !e.halted && vEng > 0.01;

  // gates: drop as the engine approaches, lift once it's clear; a train
  // sitting on the crossing keeps it down
  for (const c of CROSSINGS) {
    if (!c.gated) continue;
    let ahead = Infinity, onIt = false;
    if (e.placed) {
      ahead = trackAhead(c.trackS);
      const behind = TRACKINFO.closed ? wrapS(RAIL, e.dir > 0 ? e.s - c.trackS : c.trackS - e.s) : -ahead;
      onIt = Math.min(Math.abs(ahead), Math.abs(behind)) < 6;
      c.trainIn = moving && ahead >= 0 ? ahead / vEng : Infinity;
      c.active = (moving && (c.trainIn < GATE.approachSec || (behind >= 0 && behind < GATE.clear))) || (!moving && onIt);
    } else { c.trainIn = Infinity; c.active = false; }
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

const rewindEngine = () => { S.eng.spring = 1; S.eng.halted = false; };
const rewindCar = () => { S.car.spring = 1; };

// The pull-back: build.js slides the engine along its track while the finger
// holds it, then releases it. It runs away from the pull, wound by how far.
function engineSlideTo(s) {
  const e = S.eng;
  e.s = TRACKINFO.closed ? wrapS(RAIL, s) : Math.max(0, Math.min(RAIL.total, s));
  e.halted = true; e.v = 0;
}
function engineRelease(pulled) {
  const e = S.eng;
  if (Math.abs(pulled) < 1) { rewindEngine(); return; }   // a tap: full wind, same direction
  if (pulled > 0) e.dir = -e.dir;   // dragged nose-first: it runs back the other way
  e.spring = Math.min(1, Math.abs(pulled) / ENGINE.pullFull);
  e.halted = false;
}
// Drop the engine onto a track point of any chain; it faces `facing` along
// that chain (+1/-1) and the chain becomes its track.
function engineDropOn(pieceIdx, local, facing) {
  S.eng.placed = true; S.eng.spring = Math.max(S.eng.spring, 0.4); S.eng.halted = false; S.eng.laps = 0;
  rebuild({ piece: pieceIdx, local, facing });
}
function engineRemove() { S.eng.placed = false; rebuild(null); }

// ---------------------------------------------------------------- cameras

const cam = { pos: v3(0, CAM.height, 0), target: v3(0, 2, 0), topDown: false, init: false };
// The builder's camera looks straight down; it pans and zooms, and it turns
// the rug to fill the screen whichever way the phone is held.
const TOP = { cx: -20, cz: 0, h: 170, hMin: 40, hMax: 340 };

function followGoal() {
  const eng = pathAt(RAIL, S.eng.s);
  let back = pathAt(RAIL, S.eng.s - CAM.follow * S.eng.dir).p;
  // at a buffer end the path clamps onto the engine itself; back off along the rails instead
  if (dist2(back, eng.p) < 1) back = sub(eng.p, scale3(eng.tan, CAM.follow * S.eng.dir));
  return { pos: v3(back.x, CAM.height, back.z), target: v3(eng.p.x, CAM.aimUp, eng.p.z) };
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
  return { pos: v3(-14, 5.4, -46), target: v3(6, 3.2, -22) };
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
const portrait = () => H > W;

function buildView() {
  let fwd, up = v3(0, 1, 0), pos;
  if (cam.topDown) {
    pos = v3(TOP.cx, TOP.h, TOP.cz); fwd = v3(0, -1, 0);
    up = portrait() ? v3(1, 0, 0) : v3(0, 0, -1);
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
// Screen pixel -> the point on the plane y = h under it (needs buildView()).
function groundAt(sx, sy, h = 0) {
  const dx = (sx - W / 2) / focal, dy = (H / 2 - sy) / focal;
  const dir = norm(add(add(scale3(view.right, dx), scale3(view.upv, dy)), view.fwd));
  if (Math.abs(dir.y) < 1e-6) return null;
  const t = (h - view.pos.y) / dir.y;
  return t > 0 ? add(view.pos, scale3(dir, t)) : null;
}
// Fit the whole rug into a screen rect (CSS px) with the top-down camera.
function fitTop(rect = { x: 0, y: 0, w: W, h: H }) {
  buildView();
  const tanH = Math.tan(CAM.fovY / 2);
  const vert = (portrait() ? RUG.w : RUG.d) / 2 + 6, horiz = (portrait() ? RUG.d : RUG.w) / 2 + 6;
  TOP.h = Math.max(TOP.hMin, Math.min(TOP.hMax, Math.max(vert / (tanH * rect.h / H), horiz / (tanH * rect.w / H))));
  // put the rug's centre at the rect's centre, not the canvas's
  const pxPerCm = focal / TOP.h;
  const dx = (rect.x + rect.w / 2 - W / 2) / pxPerCm, dy = (rect.y + rect.h / 2 - H / 2) / pxPerCm;
  const centre = add(scale3(view.right, -dx), scale3(view.upv, dy));
  TOP.cx = centre.x; TOP.cz = centre.z;
}

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

// ---------------------------------------------------------------- build state (trailer) and dust

// Build state, for the trailer: how many rail pieces / road tiles exist (a
// fraction means that one is still dropping in), and whether the gate and
// the vehicles are on the rug yet. Live play never touches this.
const VIS = { rail: Infinity, road: Infinity, gate: true, engine: true, car: true, engineLift: 0, dragFrom: null, dragCount: 0 };
const DROP_H = 7, HOVER_H = 2.4;

// Where an in-progress piece sits, relative to its final place: the first
// VIS.dragCount rail pieces are dragged in from VIS.dragFrom (hover, travel,
// settle — the toy-bin verb), everything else drops in from above.
function placeOffset(kind, idx, f) {
  const dragged = kind === 'piece' && VIS.dragFrom && idx < VIS.dragCount;
  if (!dragged) return v3(0, Math.pow(1 - f, 2) * DROP_H, 0);
  const c = PIECE_CENTER[idx];
  const travel = 1 - smooth(Math.min(1, f / 0.82));
  const settle = Math.min(1, (1 - f) / 0.18);
  return v3((VIS.dragFrom.x - c.x) * travel, HOVER_H * settle + 0.3 * travel, (VIS.dragFrom.z - c.z) * travel);
}
function builtQuad(q, built) {
  const kind = q.piece !== undefined ? 'piece' : 'tile';
  const idx = kind === 'piece' ? q.piece : q.tile;
  if (idx === undefined || idx + 1 <= built) return q;
  if (idx >= built) return null;
  const o = placeOffset(kind, idx, built - idx);
  return q.map(p => v3(p.x + o.x, p.y + o.y, p.z + o.z));
}
const isMoving = (q, built) => { const idx = q.piece !== undefined ? q.piece : q.tile; return idx !== undefined && idx < built && idx + 1 > built; };
// World position of the rail piece being dragged right now (for a finger overlay), or null.
function dragPos() {
  if (!VIS.dragFrom || VIS.rail >= VIS.dragCount || VIS.rail <= 0) return null;
  const idx = Math.floor(VIS.rail), f = VIS.rail - idx;
  if (f <= 0 || f >= 1) return null;
  const c = PIECE_CENTER[idx], o = placeOffset('piece', idx, f);
  return v3(c.x + o.x, RAIL_H + o.y, c.z + o.z);
}

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
const RENDER_HOOKS = [];   // build.js draws the ghost, the bin and the buttons here
// The wall and the lamp/vignette overlay are full-screen gradients that never
// change between resizes — one blit each per frame instead of three gradient fills.
let wallCanvas = null, lampCanvas = null;
function bakeScreenLayers() {
  const make = draw => { const c = document.createElement('canvas'); c.width = W * dpr; c.height = H * dpr; const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); draw(g); return c; };
  wallCanvas = make(g => { const wall = g.createLinearGradient(0, 0, 0, H); wall.addColorStop(0, C.wallTop); wall.addColorStop(1, C.wallBot); g.fillStyle = wall; g.fillRect(0, 0, W, H); });
  lampCanvas = make(g => {
    const pool = g.createRadialGradient(W * 0.3, H * 0.25, H * 0.05, W * 0.3, H * 0.25, H * 0.95);
    pool.addColorStop(0, 'rgba(255,205,130,0.22)'); pool.addColorStop(1, 'rgba(255,205,130,0)');
    g.fillStyle = pool; g.fillRect(0, 0, W, H);
    const vig = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    vig.addColorStop(0, 'rgba(10,5,2,0)'); vig.addColorStop(1, 'rgba(10,5,2,0.42)');
    g.fillStyle = vig; g.fillRect(0, 0, W, H);
  });
}

// Draw a set of tagged quads as the wooden track: sides far-to-near, then
// tops. `filter` picks which quads; `lift` raises them (the ghost).
function drawTrackQuads(geo, filter, alpha = 1, lift = 0) {
  const raise = q => lift ? q.map(p => v3(p.x, p.y + lift, p.z)) : q;
  const sideDraw = [];
  for (const q0 of geo.sides) {
    if (!filter(q0)) continue;
    const q = builtQuad(q0, VIS.rail); if (!q) continue;
    const r = raise(q);
    sideDraw.push({ z: toCam(r[0]).z + toCam(r[2]).z, q: r });
  }
  sideDraw.sort((a, b) => b.z - a.z);
  ctx.globalAlpha = alpha;
  for (const s of sideDraw) { const p = clipProject(s.q); if (p) fillPoly(ctx, p, C.bedSide); }
  const tops = [[geo.bedQuads, C.bed], [geo.grooves[0], C.groove], [geo.grooves[1], C.groove], [geo.jointBands, C.jointGap], [geo.pegs, C.peg]];
  for (const [quads, color] of tops) for (const q0 of quads) {
    if (!filter(q0)) continue;
    const q = builtQuad(q0, VIS.rail); if (!q) continue;
    const p = clipProject(raise(q)); if (p) fillPoly(ctx, p, color);
  }
  ctx.globalAlpha = 1;
}

function render() {
  buildView();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (!wallCanvas) bakeScreenLayers();
  ctx.drawImage(wallCanvas, 0, 0, W, H);

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
  ];
  for (const [quads, color, built] of layers) {
    for (const q0 of quads) {
      const q = builtQuad(q0, built);
      if (!q) continue;
      const p = clipProject(q); if (p) fillPoly(ctx, p, color);
    }
  }
  // the track is a stack of wooden blocks; the piece currently being placed
  // (the trailer's build) is drawn last so it passes over the ones already down
  drawTrackQuads(GROUND, q => !isMoving(q, VIS.rail));
  drawTrackQuads(GROUND, q => isMoving(q, VIS.rail));

  // things that stand up get depth-sorted together
  const items = [];
  const car = pathAt(ROADPATH, S.car.s);
  let bump = 0;
  for (const c of CROSSINGS) {
    const d = Math.min(wrapS(ROADPATH, S.car.s - c.roadS), wrapS(ROADPATH, c.roadS - S.car.s));
    bump = Math.max(bump, RAIL_H * smooth(1 - Math.max(0, Math.min(1, (d - 2.6) / 3.2))));
  }
  const carAt = { p: v3(car.p.x, bump, car.p.z), tan: car.tan };
  if (VIS.engine && S.eng.placed) {
    const eng = pathAt(RAIL, S.eng.s);
    const tan = S.eng.dir > 0 ? eng.tan : scale3(eng.tan, -1);
    const engAt = { p: v3(eng.p.x, RAIL_H + VIS.engineLift, eng.p.z), tan };
    items.push({ z: toCam(eng.p).z, draw: () => drawSprite(sprites.engine, engAt, [[5.2, 3.4, 0.16], [3.6, 2.4, 0.22]]) });
  }
  if (VIS.car) items.push({ z: toCam(car.p).z, draw: () => drawSprite(sprites.car, carAt, [[4.2, 2.6, 0.16], [3.0, 1.9, 0.22]]) });
  if (VIS.gate) for (const c of CROSSINGS) for (const g of gateGeometry(c)) items.push(g);
  items.sort((a, b) => b.z - a.z);
  for (const it of items) it.draw();

  drawMotes();
  drawLamp();
  for (const f of RENDER_HOOKS) f();
  drawHud();
}

function drawSprite(set, at, shadowRings, alpha = 1) {
  ctx.globalAlpha = alpha;
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
  if (cs.z <= CAM.near) { ctx.globalAlpha = 1; return; }
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
  ctx.globalAlpha = 1;
}

// A thin world-space bar from a to b, drawn as a quad offset along `side`.
function bar(a, b, side, halfW, color) {
  const o = scale3(side, halfW);
  const p = clipProject([add(a, o), add(b, o), sub(b, o), sub(a, o)]);
  if (p) fillPoly(ctx, p, color);
}

// Gate arms on the car's approach side of each crossing, plus the bell post
// with its crossbuck, laid out along the road's own direction so a crossing
// anywhere on the loop reads right. Returned as depth-sorted drawables.
function gateGeometry(c) {
  const items = [];
  const rw = ROAD.w / 2, t = c.roadTan, n = c.right;
  const up = v3(0, 1, 0);
  const along = (p, dt, dn, dy = 0) => add(add(add(p, scale3(t, dt)), scale3(n, dn)), v3(0, dy, 0));
  const crossbuck = (base, h, d) => {
    const cb = add(base, v3(0, h, 0));
    bar(along(cb, 0, -d, -d), along(cb, 0, d, d), t, 0.3, C.crossbuck);
    bar(along(cb, 0, -d, d), along(cb, 0, d, -d), t, 0.3, C.crossbuck);
  };
  if (!c.gated) {
    // plain crossing: a crossbuck on the car's right, nothing that moves
    const base = along(c.p, -6.5, rw + 1.4), top = add(base, v3(0, 6.6, 0));
    items.push({ z: toCam(base).z, draw: () => { bar(base, top, t, 0.3, C.post); crossbuck(base, 5.6, 1.5); } });
    return items;
  }
  // two arms: one before the rails (the car's side), one after (for the other direction)
  const arms = [
    { base: along(c.p, -(GATE.stopBefore - 1.3), rw + 1.2), dir: scale3(n, -1) },
    { base: along(c.p, GATE.stopBefore - 1.3, -(rw + 1.2)), dir: n },
  ];
  const theta = (1 - c.angle) * (82 * Math.PI / 180);
  for (const a of arms) {
    const pivot = add(a.base, v3(0, GATE.pivotH, 0));
    const tip = add(pivot, add(scale3(a.dir, Math.cos(theta) * GATE.armLen), scale3(up, Math.sin(theta) * GATE.armLen)));
    items.push({
      z: toCam(pivot).z,
      draw: () => {
        bar(a.base, add(a.base, v3(0, GATE.pivotH + 0.7, 0)), t, 0.45, C.post);
        const segs = 6;
        for (let i = 0; i < segs; i++) {
          const p0 = lerp3(pivot, tip, i / segs), p1 = lerp3(pivot, tip, (i + 1) / segs);
          bar(p0, p1, t, 0.5, i % 2 ? C.armB : C.armA);
        }
        // counterweight stub behind the pivot
        const back = add(pivot, add(scale3(a.dir, -Math.cos(theta) * 1.8), scale3(up, -Math.sin(theta) * 1.8)));
        bar(pivot, back, t, 0.6, C.armB);
      },
    });
  }
  // bell post with crossbuck, beside the first arm
  const bpBase = along(c.p, -(GATE.stopBefore + 1.2), rw + 2.6);
  const bpTop = add(bpBase, v3(0, 7.2, 0));
  items.push({
    z: toCam(bpBase).z,
    draw: () => {
      bar(bpBase, bpTop, t, 0.32, C.post);
      crossbuck(bpBase, 6.0, 1.7);
      // the bell hangs from a little arm and swings while the gate is busy
      const swing = Math.sin(c.bell) * Math.min(1, c.bell > 0 ? 0.55 : 0) * (c.active ? 1 : 0.6);
      const hang = add(bpBase, v3(0, 4.3, 0));
      const bell = add(along(hang, swing * 0.9, 0), v3(0, -0.9, 0));
      bar(hang, along(hang, -1.3, 0), up, 0.22, C.post);
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
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.drawImage(lampCanvas, 0, 0, W, H);
}

let fpsAvg = 0, hudOn = true;
const touchDevice = () => 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
function drawHud() {
  if (!hudOn) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(240,225,200,0.75)';
  const bar8 = v => '▓'.repeat(Math.round(v * 8)).padEnd(8, '░');
  const eng = S.eng.placed ? `engine ${bar8(S.eng.spring)}${S.eng.halted ? ' ·' : ''}` : 'engine in the bin';
  ctx.fillText(`${eng}  car ${bar8(S.car.spring)}  ${fpsAvg ? fpsAvg.toFixed(0) + 'fps' : ''}`, 12, 20);
  ctx.fillStyle = 'rgba(240,225,200,0.45)';
  const narrow = W < 640;   // keep clear of the camera button on a phone
  const hint = cam.topDown
    ? (narrow ? 'drag from the bin · tap a curve to flip' : touchDevice() ? 'drag from the bin · tap a curve to flip · pull the engine back' : 'drag from the bin · tap a curve to flip · pull the engine back · [c] carpet · [f] frames')
    : (narrow || touchDevice() ? 'tap the engine or car to wind it' : 'tap the engine or car to wind it · [c] build · [f] frames');
  ctx.fillText(hint, 12, 38);
}

// ---------------------------------------------------------------- loop, harness

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  bakeScreenLayers();
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
  if (clipMode) clipCamera(clipT()); else if (S.eng.placed) updateCamera(dt, false);
  const t0 = performance.now();
  render();
  frameMs = performance.now() - t0;
  requestAnimationFrame(frame);
}

// Deterministic placement for freeze-frame screenshots; wraps into one lap.
function advanceTo(s) {
  s = isFinite(s) ? wrapS(RAIL, s) : 0;
  for (let i = 0; i < 200000 && S.eng.s < s - 1e-6 && S.eng.laps === 0 && !S.eng.halted; i++) tick();
  updateCamera(0, true);
}

// --- clip mode: warm the sim up until the car has locked its phase to the
// train, then define t=0 as the engine passing CLIP.s0. Seeking restores the
// snapshot and re-ticks, so every frame is a pure function of t.
let clipSnapshot = null;
function clipWarmup() {
  // start the car past the far crossing: both gates are stable places for it
  // to lock its phase, and the show is at the near one
  S.car.s = 60; S.car.v = 0;
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

// --- random layouts for the soak: grow a chain from a random pose, piece by
// piece, keeping only placements the builder would accept. Deterministic.
function randomLayout(seed, n) {
  let s = seed | 0 || 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const layout = [];
  const h0 = Math.floor(rnd() * 8) * Math.PI / 4;
  layout.push({ t: rnd() < 0.5 ? 'S' : 'C', hand: rnd() < 0.5 ? 1 : -1, x: (rnd() - 0.5) * 90, z: (rnd() - 0.5) * 50, h: h0 });
  if (layout[0].t === 'S') layout[0].hand = 0;
  if (!pieceFits(layout[0], [])) return randomLayout(seed + 7919, n);
  for (let tries = 0; layout.length < n && tries < n * 12; tries++) {
    LAYOUT = layout; rebuildConnections();
    const ends = openEnds();
    if (!ends.length) break;
    const e = ends[Math.floor(rnd() * ends.length)];
    const pc = pieceAfter(e, rnd() < 0.45 ? 'S' : 'C', rnd() < 0.5 ? 1 : -1);
    if (pieceFits(pc, layout)) layout.push(pc);
  }
  return layout;
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
  // n random layouts, each run for `seconds` with a player emulated: rewind
  // when the spring runs down, turn the engine round at a buffer end.
  soakLayouts(n, seconds = 30) {
    const saved = serializeLayout(), results = { ok: true, layouts: n, failed: [], closedLoops: 0, maxPieces: 0, minPieces: 1e9, crossingsSeen: 0, carMaxWaitSec: 0, hashBytes: 0 };
    const oval = (x, z, h, seq, hand) => { const out = []; let end = { p: v3(x, 0, z), out: h }; for (const t of seq) { const pc = pieceAfter(end, t, hand); out.push(pc); end = pieceEnds(pc)[1]; } return out; };
    const canned = [defaultLayout(), oval(-22.5, 20, Math.PI / 2, 'SSSCCCCSSSCCCC', 1), oval(-37.5, -20, Math.PI / 2, 'SSSSSCCCCSSSSSCCCC', -1)];
    for (let k = 0; k < n; k++) {
      let seed = 1000 + k * 17;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const layout = k < canned.length ? canned[k] : randomLayout(seed, 4 + (k % 14));
      loadLayout(layout, { piece: 0, local: PIECE_LEN / 2, facing: 1 });
      S.car.s = 0; S.car.v = 0; S.car.spring = 1; S.car.loops = 0; S.car.maxWait = 0; S.car.waitTicks = 0;
      results.maxPieces = Math.max(results.maxPieces, LAYOUT.length); results.minPieces = Math.min(results.minPieces, LAYOUT.length);
      if (TRACKINFO.closed) results.closedLoops++;
      results.crossingsSeen += CROSSINGS.filter(c => c.gated).length;
      results.hashBytes = Math.max(results.hashBytes, serializeLayout().length);
      let moved = 0, flips = 0, prevS = S.eng.s, bad = null, pause = 0;
      const ticks = Math.round(seconds / FIXED_DT);
      for (let i = 0; i < ticks; i++) {
        tick();
        moved += Math.abs(S.eng.s - prevS) < RAIL.total / 2 ? Math.abs(S.eng.s - prevS) : 0;
        prevS = S.eng.s;
        // the emulated player: at a buffer end, a pause, then turn it round
        // and wind it some; a run-down spring gets a rewind
        if (S.eng.halted) {
          if (pause <= 0) pause = Math.round((1.5 + rnd() * 1.5) / FIXED_DT);
          else if (--pause === 0) { S.eng.dir = -S.eng.dir; S.eng.spring = 0.4 + rnd() * 0.6; S.eng.halted = false; flips++; }
        }
        if (!S.eng.halted && S.eng.spring < 0.2) rewindEngine();
        if (S.car.spring < 0.2) rewindCar();
        if (![S.eng.s, S.car.s, S.car.v].every(isFinite) || CROSSINGS.some(c => !isFinite(c.angle))) { bad = `NaN at tick ${i}`; break; }
        if (S.eng.s < -1e-6 || S.eng.s > RAIL.total + 1e-6) { bad = `engine off its track at tick ${i}`; break; }
      }
      const wait = S.car.maxWait * FIXED_DT;
      results.carMaxWaitSec = Math.max(results.carMaxWaitSec, +wait.toFixed(2));
      if (!bad && moved < 10) bad = 'engine never moved';
      if (!bad && S.car.loops < 1) bad = `car deadlocked (max wait ${wait.toFixed(1)}s)`;
      if (!bad && wait > 15) bad = `car waited ${wait.toFixed(1)}s`;
      if (bad) { results.ok = false; results.failed.push({ k, pieces: LAYOUT.length, closed: TRACKINFO.closed, bad, layout: serializeLayout() }); }
    }
    const back = parseLayout(saved); loadLayout(back.pieces, back.eng);
    return results;
  },
  bench(nFrames) {
    nFrames = Math.max(1, nFrames | 0);
    const t0 = performance.now();
    for (let i = 0; i < nFrames; i++) { tick(); if (S.eng.placed) updateCamera(FIXED_DT, false); render(); }
    return { frames: nFrames, msPerFrame: +((performance.now() - t0) / nFrames).toFixed(3), spriteFrames: sprites.engine.length, viewport: `${W}x${H}@${dpr}` };
  },
  // Clip periodicity + event timeline: when the near gate drops, when the car
  // reaches its stop line, when the engine crosses, when the gate is fully up.
  clipCheck() {
    clipSeek(0);
    const start = { engS: S.eng.s, carS: S.car.s, carV: S.car.v };
    const near = CROSSINGS[0], ev = [];
    let wasActive = near.active, wasStopped = false, wasUp = near.angle < 0.02, prevAhead = trackAhead(near.trackS);
    for (let i = 0; i < CLIP_TICKS; i++) {
      tick(); clipTick++;
      const now = +clipT().toFixed(2);
      const stopped = S.car.v < 0.05 && Math.abs(S.car.s - near.stopS) < 0.5;
      const ahead = trackAhead(near.trackS);
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
  layout: () => ({ pieces: LAYOUT.length, closed: TRACKINFO.closed, trackCm: +RAIL.total.toFixed(1), crossings: CROSSINGS.map(c => ({ gated: c.gated, roadS: +c.roadS.toFixed(1) })), hash: serializeLayout(), hashBytes: serializeLayout().length, openEnds: openEnds().length }),
  stats: () => ({ eng: S.eng, car: S.car, frameMs, sprites: sprites.engine.length }),
};
window.__rug = __rug;

function main() {
  canvas = document.getElementById('c');
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  bakeAll(spriteFrames);

  // the layout: the share link if there is one, else the oval
  let fromHash = null;
  if (!clipMode) { try { fromHash = parseLayout(decodeURIComponent(location.hash.slice(1))); } catch { fromHash = null; } }
  if (fromHash) loadLayout(fromHash.pieces, fromHash.eng);
  else loadLayout(defaultLayout(), { piece: 0, local: 0, facing: 1 });

  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key === 'c') cam.topDown = !cam.topDown;
    if (key === 'f') {
      const i = FRAME_CHOICES.indexOf(sprites.engine.length);
      bakeAll(FRAME_CHOICES[(i + 1) % FRAME_CHOICES.length]);
    }
  });

  const out = document.getElementById('out');
  if (Q.get('cam') === 'top') { cam.topDown = true; fitTop(); }
  if (Q.get('hud') === '0') hudOn = false;
  const freezeS = Q.get('s'), bench = Q.get('bench'), soak = Q.get('soak'), soakLayouts = Q.get('soaklayouts');
  if (soakLayouts) {
    out.hidden = false; out.textContent = JSON.stringify(__rug.soakLayouts(parseInt(soakLayouts, 10) || 1, parseFloat(Q.get('secs')) || 30));
    advanceTo(0); render();
    return;
  }
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
  if (window.__buildInit) window.__buildInit();   // build.js: input, bin, sounds, share link
  updateCamera(0, true);
  requestAnimationFrame(frame);
}

main();
