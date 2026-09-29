// Rug Town — the trailer. Loads after main.js in trailer.html (?trailer=1).
//
// A shot list over the same deterministic renderer, structured on the doc's
// core loop: build it, wind it up, watch it run. Each shot sets the sim time
// (or drives the engine by hand), the build state, a camera, and timed
// overlays. Narration lines live here too, so the audio pass and the picture
// share one timeline. Every frame is a pure function of trailer time.
//
// ?trailer=1        play it live      ?trailer=1&t=<sec>   freeze one frame

'use strict';

const TR = { fps: 30, total: 42.6 };
const FONT = {
  head: '800 96px "Big Shoulders", "Arial Narrow", sans-serif',
  title: '800 210px "Big Shoulders", "Arial Narrow", sans-serif',
  lower: 'italic 40px "Source Serif 4", Georgia, serif',
  body: '34px "Source Serif 4", Georgia, serif',
  mono: '17px "IBM Plex Mono", monospace',
};
const INK = { cream: '240,225,200', muted: '184,175,149', mustard: '217,158,65' };

const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const fade = (t, at, until, fin = 0.45, fout = 0.45) => Math.min(ease((t - at) / fin), ease((until - t) / fout));

// ---------------------------------------------------------------- narration cue sheet
//
// The trailer ships captioned, not voiced: TTS reads of these came out flat.
// Record them yourself as narration/line-0.wav … line-7.wav and mix-trailer.mjs
// lays them at these cues; the captions below say the same words on screen.

const NARRATION = [
  { at: 0.6, s: 'Before any of us had a console, we had a rug.' },
  { at: 3.7, s: 'The rug had roads. And the wooden track clicked together in exactly one satisfying way.' },
  { at: 9.7, s: 'Pull the engine back to wind it.' },
  { at: 13.3, s: 'Then get down on the carpet, and watch it run.' },
  { at: 18.0, s: 'The gate drops. The car waits its turn.' },
  { at: 29.5, s: "It's a toy, not a game. No timer. No score. Nothing to lose." },
  { at: 34.7, s: "Pay once, and it's yours. No ads. Ever." },
  { at: 38.8, s: 'Rug Town. A building toy, for people who remember the floor.' },
];

// ---------------------------------------------------------------- the build (shot A) and the wind-up (shot B)

// The first three pieces are dragged out of the toy bin by a finger, slowly
// enough to read; the rest fill in fast, then the road tiles, then the gate.
const RAIL_PIECES = JOINTS.length, ROAD_TILES = Math.ceil(ROADPATH.total / ROAD_TILE);
const BUILD = { start: 2.6, dragCount: 3, railDurs: [0.95, 0.95, 0.95, ...Array(RAIL_PIECES - 3).fill(0.16)], tileDur: 0.075, gap: 0.2 };
BUILD.railEnd = BUILD.start + BUILD.railDurs.reduce((a, b) => a + b, 0);
BUILD.roadFrom = BUILD.railEnd + BUILD.gap;
BUILD.roadEnd = BUILD.roadFrom + ROAD_TILES * BUILD.tileDur;
BUILD.gateAt = BUILD.roadEnd + BUILD.gap;

function countAt(t, start, durs) {
  let acc = start;
  for (let i = 0; i < durs.length; i++) {
    if (t < acc) return i;
    if (t < acc + durs[i]) return i + (t - acc) / durs[i];
    acc += durs[i];
  }
  return durs.length;
}
const BIN = { w: 372, h: 82, slotW: 100, slotH: 54 };
const binRect = () => ({ x: W - BIN.w - 44, y: H - BIN.h - 28, w: BIN.w, h: BIN.h });
const binSlot = i => { const b = binRect(); return { x: b.x + 22 + i * 114 + BIN.slotW / 2, y: b.y + 14 + BIN.slotH / 2 }; };

// Screen pixel -> the point on the plane y = h under it (needs buildView()).
function unproject(sx, sy, h) {
  const dx = (sx - W / 2) / focal, dy = (H / 2 - sy) / focal;
  const dir = norm(add(add(scale3(view.right, dx), scale3(view.upv, dy)), view.fwd));
  const t = (h - view.pos.y) / dir.y;
  return add(view.pos, scale3(dir, t));
}

function buildState(t) {
  VIS.rail = countAt(t, BUILD.start, BUILD.railDurs);
  VIS.road = Math.max(0, Math.min(ROAD_TILES, (t - BUILD.roadFrom) / BUILD.tileDur));
  VIS.gate = t >= BUILD.gateAt;
  VIS.engine = false; VIS.car = false;
  VIS.dragCount = BUILD.dragCount;
  buildView();
  const s = binSlot(0);
  VIS.dragFrom = unproject(s.x, s.y - 6, 0);
}

const WIND = { dropAt: 9.2, dropDur: 0.5, restS: 22, pullFrom: 9.9, pullTo: 10.7, pullS: 13, releaseAt: 11.05, accel: 42 };
function windState(t) {
  VIS.car = false; VIS.engine = t >= WIND.dropAt;
  const dropU = ease((t - WIND.dropAt) / WIND.dropDur);
  VIS.engineLift = (1 - dropU) * DROP_H;
  let s = WIND.restS;
  if (t >= WIND.pullFrom) s = lerp(WIND.restS, WIND.pullS, ease((t - WIND.pullFrom) / (WIND.pullTo - WIND.pullFrom)));
  if (t >= WIND.releaseAt) { const dt = t - WIND.releaseAt; s = WIND.pullS + 0.5 * WIND.accel * dt * dt; }
  S.eng.s = wrapS(RAIL, s);
  return s;
}

// ---------------------------------------------------------------- cameras

const tripod = () => ({ pos: TRIPOD.pos, target: TRIPOD.target });
const overRug = u => ({ pos: lerp3(v3(-6, 84, -102), v3(-8, 60, -80), ease(u)), target: v3(-10, 0, -6) });
const behindEngine = () => ({ pos: v3(-28, 5.2, -19.6), target: v3(-0.5, 3.4, -20) });
const bellClose = u => ({ pos: v3(21 - u * 1.5, 5.2, -39), target: v3(12.5, 3.8, -27) });
const throughGate = () => ({ pos: v3(2.5, 4.2, -6), target: v3(8, 3.2, -24) });

// ---------------------------------------------------------------- shot list

const SHOTS = [
  { t0: 0, t1: 9.2, name: 'build', setup: t => buildState(t), cam: overRug, fadeIn: 0.8, texts: [
    { s: 'Before any of us had a console, we had a rug.', at: 0.8, until: 3.1, style: 'lower' },
    { s: 'The track clicked together in exactly one satisfying way.', at: 3.9, until: 8.9, style: 'lower', stack: 1 },
    { s: 'Build it.', at: 3.7, until: 8.9, style: 'lower' },
  ] },
  { t0: 9.2, t1: 13.0, name: 'wind', setup: t => windState(t), cam: behindEngine, texts: [
    { s: 'Pull the engine back. Let go.', at: 9.9, until: 12.7, style: 'lower', stack: 1 },
    { s: 'Wind it up.', at: 9.6, until: 12.7, style: 'lower' },
  ] },
  { t0: 13.0, t1: 17.8, sim: u => u * 4.8, cam: null, texts: [
    { s: 'Then get down on the carpet.', at: 13.9, until: 17.5, style: 'lower', stack: 1 },
    { s: 'Watch it run.', at: 13.4, until: 17.5, style: 'lower' },
  ] },
  { t0: 17.8, t1: 25.6, sim: u => 5.6 + u * 7.8, cam: tripod, texts: [
    { s: 'The gate drops. The car waits its turn.', at: 18.3, until: 22.6, style: 'lower' },
  ] },
  { t0: 25.6, t1: 27.0, sim: u => 8.0 + u * 1.4, cam: bellClose },
  { t0: 27.0, t1: 29.2, sim: u => 10.25 + u * 2.2, cam: throughGate, fadeOut: 0.5 },
  { t0: 29.2, t1: 33.0, card: true, texts: [
    { s: 'A TOY, NOT A GAME.', at: 29.4, until: 32.8, style: 'head', y: -36 },
    { s: 'No timer. No score. Nothing to lose.', at: 30.2, until: 32.8, style: 'body', y: 48 },
  ] },
  { t0: 33.0, t1: 36.4, card: true, texts: [
    { s: 'PAY ONCE. OWN IT.', at: 33.2, until: 36.2, style: 'head', y: -36 },
    { s: 'No ads. No accounts. No energy meters.', at: 34.0, until: 36.2, style: 'body', y: 48 },
  ] },
  { t0: 36.4, t1: 42.6, card: true, fadeOut: 0.7, texts: [
    { s: 'RUG TOWN', at: 36.6, until: 42.4, style: 'title', y: -20, rule: true },
    { s: 'a building toy for people who remember the floor', at: 37.5, until: 42.4, style: 'body', y: 118 },
    { s: 'very early prototype  ·  everything here is placeholder art drawn in code', at: 38.4, until: 42.4, style: 'mono', y: 250 },
  ] },
];

// ---------------------------------------------------------------- drawing

function card() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#120b07'); g.addColorStop(1, '#241710');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const pool = ctx.createRadialGradient(W * 0.5, H * 0.45, 10, W * 0.5, H * 0.45, H * 0.9);
  pool.addColorStop(0, 'rgba(255,205,130,0.10)'); pool.addColorStop(1, 'rgba(255,205,130,0)');
  ctx.fillStyle = pool; ctx.fillRect(0, 0, W, H);
}

function dashRule(x, y, w, alpha) {
  ctx.fillStyle = `rgba(${INK.mustard},${alpha})`;
  for (let dx = 0; dx < w; dx += 40) ctx.fillRect(x + dx, y, 22, 4);
}

function drawText(tx, t) {
  const a = fade(t, tx.at, tx.until);
  if (a <= 0) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textBaseline = 'middle';
  ctx.font = FONT[tx.style];
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 2;
  ctx.globalAlpha = a;
  if (tx.style === 'lower') {
    // lower-third: a road dash, then the line, bottom-left
    const x = 78, y = H - 96 - (tx.stack || 0) * 52;
    const rise = (1 - ease((t - tx.at) / 0.45)) * 10;
    ctx.fillStyle = `rgba(${INK.mustard},1)`; ctx.fillRect(x, y + rise - 2, 26, 5);
    ctx.fillStyle = `rgba(${INK.cream},1)`; ctx.textAlign = 'left';
    ctx.fillText(tx.s, x + 42, y + rise);
  } else {
    const y = H / 2 + (tx.y || 0);
    const rise = (1 - ease((t - tx.at) / 0.5)) * 8;
    ctx.textAlign = 'center';
    ctx.fillStyle = tx.style === 'head' || tx.style === 'title' ? `rgba(${INK.cream},1)` : `rgba(${INK.muted},${tx.style === 'mono' ? 0.85 : 1})`;
    ctx.fillText(tx.s, W / 2, y + rise);
    if (tx.rule) {
      const w = ctx.measureText(tx.s).width;
      dashRule(W / 2 - w / 2, y - 118, w, a);
      dashRule(W / 2 - w / 2, y + 86, w, a);
    }
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
}

function drawFinger(p, alpha, pressed) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = alpha;
  const r = pressed ? 21 : 27;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.29); ctx.fillStyle = 'rgba(255,240,215,0.26)'; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,240,215,0.9)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 6.29); ctx.fillStyle = 'rgba(255,240,215,0.95)'; ctx.fill();
  ctx.globalAlpha = 1;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// The toy bin: a wooden tray at the bottom of the screen with three slots —
// straight, curve, road tile. Purely the trailer's picture of the real thing.
function drawBin(alpha, activeSlot) {
  if (alpha <= 0) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = alpha;
  const b = binRect();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
  roundRect(b.x, b.y, b.w, b.h, 12); ctx.fillStyle = '#4a3626'; ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.lineWidth = 2; ctx.strokeStyle = '#2e2017'; ctx.stroke();
  ctx.font = '11px "IBM Plex Mono", monospace'; ctx.fillStyle = 'rgba(240,225,200,0.5)'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('TOY BIN', b.x + 14, b.y - 8);
  for (let i = 0; i < 3; i++) {
    const s = binSlot(i), x = s.x - BIN.slotW / 2, y = s.y - BIN.slotH / 2;
    roundRect(x, y, BIN.slotW, BIN.slotH, 8); ctx.fillStyle = i === activeSlot ? '#6f5540' : '#5c4534'; ctx.fill();
    if (i === 0) {           // straight: a beige plank with two grooves
      roundRect(s.x - 36, s.y - 8, 72, 16, 3); ctx.fillStyle = C.bed; ctx.fill();
      ctx.fillStyle = C.groove; ctx.fillRect(s.x - 36, s.y - 4, 72, 2.2); ctx.fillRect(s.x - 36, s.y + 2, 72, 2.2);
    } else if (i === 1) {    // curve: the same plank, bent
      ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(s.x - 6, s.y + 26, 34, -Math.PI * 0.92, -Math.PI * 0.32); ctx.lineWidth = 16; ctx.strokeStyle = C.bed; ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x - 6, s.y + 26, 37.5, -Math.PI * 0.92, -Math.PI * 0.32); ctx.lineWidth = 2.2; ctx.strokeStyle = C.groove; ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x - 6, s.y + 26, 30.5, -Math.PI * 0.92, -Math.PI * 0.32); ctx.stroke();
    } else {                 // road tile: grey with a yellow dash
      roundRect(s.x - 26, s.y - 18, 52, 36, 4); ctx.fillStyle = C.road; ctx.fill();
      ctx.fillStyle = C.dash; ctx.fillRect(s.x - 8, s.y - 1.5, 16, 3);
    }
  }
  ctx.globalAlpha = 1;
}

// Put the sim, build state and camera where trailer time t says. Returns the shot.
// Every shot starts from the clip snapshot, so a shot that drives the engine
// by hand (the wind-up) can't leak its position into the next one.
let lastShot = null;
function setup(t) {
  const shot = SHOTS.find(s => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1];
  const u = (t - shot.t0) / (shot.t1 - shot.t0);
  VIS.rail = Infinity; VIS.road = Infinity; VIS.gate = true; VIS.engine = true; VIS.car = true; VIS.engineLift = 0;
  if (shot !== lastShot) { clipRestore(); lastShot = shot; }
  if (shot.card) return shot;
  if (shot.sim) clipSeek(shot.sim(u));      // also sets the clip's own camera for that time
  if (shot.cam) { const c = shot.cam(u); cam.pos = c.pos; cam.target = c.target; }
  if (shot.setup) shot.setup(t);            // after the camera: the build unprojects the bin through it
  return shot;
}

function overlays(shot, t) {
  if (shot.name === 'build') {
    const a = fade(t, 1.6, BUILD.gateAt + 0.5, 0.5, 0.5);
    const dragging = VIS.rail > 0 && VIS.rail < BUILD.dragCount;
    drawBin(a, dragging ? 0 : -1);
    const p = dragPos();
    if (p) { const c = toCam(p); if (c.z > CAM.near) drawFinger(toScreen(c), a, true); }
    else if (t >= BUILD.start - 0.4 && VIS.rail <= 0) drawFinger(binSlot(0), a * ease((t - (BUILD.start - 0.4)) / 0.3), false);
  }
  if (shot.name === 'wind') {
    // the finger on the engine, pulling it back, then letting go
    if (t >= WIND.pullFrom - 0.25 && t < WIND.releaseAt + 0.45) {
      const eng = pathAt(RAIL, S.eng.s).p;
      const c = toCam(v3(eng.x, RAIL_H + 3.2, eng.z));
      if (c.z > CAM.near) {
        const s = toScreen(c), gone = Math.max(0, (t - WIND.releaseAt) / 0.45);
        drawFinger({ x: s.x, y: s.y - gone * 40 }, Math.min(1, (t - (WIND.pullFrom - 0.25)) / 0.25) * (1 - gone), t < WIND.releaseAt);
      }
    }
  }
}

function renderAt(t) {
  const shot = setup(t);
  if (shot.card) card(); else render();
  if (!shot.card) overlays(shot, t);
  for (const tx of shot.texts || []) drawText(tx, t);
  let dip = 0;
  if (shot.fadeIn) dip = Math.max(dip, 1 - ease((t - shot.t0) / shot.fadeIn));
  if (shot.fadeOut) dip = Math.max(dip, 1 - ease((shot.t1 - t) / shot.fadeOut));
  if (dip > 0) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = `rgba(10,5,2,${dip})`; ctx.fillRect(0, 0, W, H); }
}

// Sound events for the audio pass: rail clacks at every joint the engine rolls
// over, the car's felt hush while it moves, each piece snapping in during the
// build, the ratchet of the wind-up, the bell while the gate is busy.
function events() {
  const out = [], step = 1 / 120;
  let prevEng = null, prevRail = 0, prevRoad = 0, prevGate = false, prevActive = false, prevAngle = 0, prevPull = null, prevStopped = false;
  for (let t = 0; t < TR.total; t += step) {
    const shot = setup(t);
    if (shot.card) { prevEng = null; continue; }
    const engS = S.eng.s;
    if (VIS.engine && prevEng !== null && Math.abs(engS - prevEng) < 20) {
      for (const j of JOINTS) {
        const passed = prevEng < j && engS >= j;
        if (passed) out.push({ t: +t.toFixed(3), kind: 'clack' });
      }
    }
    prevEng = VIS.engine ? engS : null;
    if (VIS.car && S.car.v > 0.5) out.push({ t: +t.toFixed(3), kind: 'hush', v: +S.car.v.toFixed(1) });
    const railN = Math.floor(Math.min(RAIL_PIECES, VIS.rail)), roadN = Math.floor(Math.min(ROAD_TILES, VIS.road));
    for (let k = prevRail; k < railN; k++) out.push({ t: +t.toFixed(3), kind: 'snap' });
    for (let k = prevRoad; k < roadN; k++) out.push({ t: +t.toFixed(3), kind: 'lay' });
    prevRail = railN; prevRoad = roadN;
    if (VIS.gate && !prevGate && shot.setup) out.push({ t: +t.toFixed(3), kind: 'snap' });
    prevGate = VIS.gate;
    if (shot.setup === undefined || shot.t0 !== 9.2) prevPull = null;
    else {
      const landAt = WIND.dropAt + WIND.dropDur;
      if (t >= landAt && t < landAt + step) out.push({ t: +t.toFixed(3), kind: 'snap' });   // the engine clicks onto the track
      const pulling = t >= WIND.pullFrom && t < WIND.pullTo, released = t >= WIND.releaseAt && t < WIND.releaseAt + step;
      if (pulling && prevPull !== null && Math.floor((t - WIND.pullFrom) / 0.07) !== Math.floor((prevPull - WIND.pullFrom) / 0.07)) out.push({ t: +t.toFixed(3), kind: 'ratchet' });
      if (released) out.push({ t: +t.toFixed(3), kind: 'release' });
      prevPull = pulling ? t : (prevPull === null ? t : prevPull);
    }
    const near = CROSSINGS[0];
    if (shot.sim) {
      const stopped = S.car.v < 0.05 && Math.abs(S.car.s - near.stopS) < 0.5;
      if (stopped && !prevStopped) out.push({ t: +t.toFixed(3), kind: 'carStop' });
      prevStopped = stopped;
      if (near.active && !prevActive) out.push({ t: +t.toFixed(3), kind: 'bellStart' });
      if (!near.active && prevActive) out.push({ t: +t.toFixed(3), kind: 'bellStop' });
      if (near.angle >= 1 && prevAngle < 1) out.push({ t: +t.toFixed(3), kind: 'gateDown' });
      prevActive = near.active; prevAngle = near.angle;
    }
  }
  return out;
}

window.__trailer = {
  fps: TR.fps,
  total: Math.round(TR.total * TR.fps),
  seconds: TR.total,
  narration: NARRATION,
  frame(i) { renderAt(i / TR.fps); return i; },
  at(t) { renderAt(t); return t; },
  events,
};

(async () => {
  try { await document.fonts.ready; } catch {}
  const t = Q.get('t');
  if (t !== null) { renderAt(parseFloat(t) || 0); return; }
  let start = null;
  const loop = now => {
    if (start === null) start = now;
    renderAt(((now - start) / 1000) % TR.total);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
