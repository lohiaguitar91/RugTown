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

const TR = { fps: 30, total: 45.0 };
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

// ---------------------------------------------------------------- narration (Piper reads these)

const NARRATION = [
  { at: 0.6, s: 'Before any of us had a console, we had a rug.' },
  { at: 3.7, s: 'The rug had roads. And the wooden track clicked together in exactly one satisfying way.' },
  { at: 9.7, s: 'Pull the engine back to wind it.' },
  { at: 13.3, s: 'Then get down on the carpet, and watch it run.' },
  { at: 19.3, s: 'The gate drops. The car waits its turn.' },
  { at: 29.5, s: "It's a toy, not a game. No timer. No score. Nothing to lose." },
  { at: 34.7, s: "Pay once, and it's yours. No ads. Ever." },
  { at: 38.8, s: 'Rug Town. A building toy, for people who remember the floor.' },
];

// ---------------------------------------------------------------- the build (shot A) and the wind-up (shot B)

const BUILD = { railFrom: 3.4, railDur: 3.3, roadFrom: 6.7, roadDur: 1.7, gateAt: 8.5 };
const RAIL_PIECES = JOINTS.length, ROAD_TILES = Math.ceil(ROADPATH.total / ROAD_TILE);

function buildState(t) {
  VIS.rail = t < BUILD.railFrom ? 0 : Math.min(RAIL_PIECES, (t - BUILD.railFrom) / BUILD.railDur * RAIL_PIECES);
  VIS.road = t < BUILD.roadFrom ? 0 : Math.min(ROAD_TILES, (t - BUILD.roadFrom) / BUILD.roadDur * ROAD_TILES);
  VIS.gate = t >= BUILD.gateAt;
  VIS.engine = false; VIS.car = false;
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
const behindEngine = () => ({ pos: v3(-28, 4.3, -19.6), target: v3(-0.5, 2.4, -20) });
const bellClose = u => ({ pos: v3(21 - u * 1.5, 5.2, -39), target: v3(12.5, 3.8, -27) });
const throughGate = () => ({ pos: v3(2.5, 3.4, -6), target: v3(8, 2.3, -24) });

// ---------------------------------------------------------------- shot list

const SHOTS = [
  { t0: 0, t1: 9.2, setup: t => buildState(t), cam: overRug, fadeIn: 0.8, texts: [
    { s: 'Build it.', at: 3.7, until: 8.9, style: 'lower' },
  ] },
  { t0: 9.2, t1: 13.0, setup: t => windState(t), cam: behindEngine, texts: [
    { s: 'Wind it up.', at: 9.6, until: 12.7, style: 'lower' },
  ] },
  { t0: 13.0, t1: 17.8, sim: u => u * 4.8, cam: null, texts: [
    { s: 'Watch it run.', at: 13.4, until: 17.5, style: 'lower' },
  ] },
  { t0: 17.8, t1: 25.6, sim: u => 5.6 + u * 7.8, cam: tripod },
  { t0: 25.6, t1: 27.0, sim: u => 8.0 + u * 1.4, cam: bellClose },
  { t0: 27.0, t1: 29.2, sim: u => 10.25 + u * 2.2, cam: throughGate, fadeOut: 0.5 },
  { t0: 29.2, t1: 34.4, card: true, texts: [
    { s: 'A TOY, NOT A GAME.', at: 29.4, until: 34.2, style: 'head', y: -36 },
    { s: 'No timer. No score. Nothing to lose.', at: 30.6, until: 34.2, style: 'body', y: 48 },
  ] },
  { t0: 34.4, t1: 38.4, card: true, texts: [
    { s: 'PAY ONCE. OWN IT.', at: 34.6, until: 38.2, style: 'head', y: -36 },
    { s: 'No ads. No accounts. No energy meters.', at: 35.6, until: 38.2, style: 'body', y: 48 },
  ] },
  { t0: 38.4, t1: 45.0, card: true, fadeOut: 0.7, texts: [
    { s: 'RUG TOWN', at: 38.6, until: 44.8, style: 'title', y: -20, rule: true },
    { s: 'a building toy for people who remember the floor', at: 39.6, until: 44.8, style: 'body', y: 118 },
    { s: 'very early prototype  ·  everything here is placeholder art drawn in code', at: 40.6, until: 44.8, style: 'mono', y: 250 },
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

// Put the sim, build state and camera where trailer time t says. Returns the shot.
function setup(t) {
  const shot = SHOTS.find(s => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1];
  const u = (t - shot.t0) / (shot.t1 - shot.t0);
  VIS.rail = Infinity; VIS.road = Infinity; VIS.gate = true; VIS.engine = true; VIS.car = true; VIS.engineLift = 0;
  if (shot.card) return shot;
  if (shot.sim) clipSeek(shot.sim(u));      // also sets the clip's own camera for that time
  if (shot.setup) shot.setup(t);
  if (shot.cam) { const c = shot.cam(u); cam.pos = c.pos; cam.target = c.target; }
  return shot;
}

function renderAt(t) {
  const shot = setup(t);
  if (shot.card) card(); else render();
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
  let prevEng = null, prevRail = 0, prevRoad = 0, prevGate = false, prevActive = false, prevAngle = 0, prevPull = null;
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
