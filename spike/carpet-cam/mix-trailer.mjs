// Build the trailer soundtrack from the page's own timeline: narration WAVs
// (Piper) placed at their cue times, plus synthesized toy sounds for every
// event trailer.js reports — wooden clacks at rail joints, pieces snapping
// in, the felt hush of the car, the wind-up ratchet, the crossing bell.
// Everything here is synthesized (DESIGN.md §3: no sampled toy sounds).
//
//   node spike/carpet-cam/mix-trailer.mjs timeline.json narration/ mix.wav
//
// timeline.json = { seconds, narration:[{at,s}], events:[{t,kind,...}] }
// narration/ holds line-0.wav … line-N.wav (16-bit PCM mono, any rate).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [tlPath, narrDir, outPath] = process.argv.slice(2);
const tl = JSON.parse(readFileSync(tlPath, 'utf8'));
const SR = 22050;
const N = Math.ceil((tl.seconds + 0.5) * SR);
const sfx = new Float32Array(N), voice = new Float32Array(N);

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const idx = t => Math.floor(t * SR);

// --- tiny synth kit ----------------------------------------------------------
function addTone(buf, t0, freq, dur, amp, decay, curve = 1) {
  const i0 = idx(t0), n = Math.floor(dur * SR);
  for (let i = 0; i < n && i0 + i < buf.length; i++) {
    const tt = i / SR;
    buf[i0 + i] += Math.sin(2 * Math.PI * freq * tt) * amp * Math.exp(-tt * decay) * Math.pow(1 - i / n, curve);
  }
}
function addNoise(buf, t0, dur, amp, decay, lp = 0.3, hp = 0) {
  const i0 = idx(t0), n = Math.floor(dur * SR);
  let y = 0, h = 0, prev = 0;
  for (let i = 0; i < n && i0 + i < buf.length; i++) {
    const x = rnd() * 2 - 1;
    y += lp * (x - y);                // one-pole low-pass
    let v = y;
    if (hp) { h = hp * (h + v - prev); prev = v; v = h; }
    buf[i0 + i] += v * amp * Math.exp(-(i / SR) * decay);
  }
}

const clack = t => { addNoise(sfx, t, 0.07, 0.35, 60, 0.35); addTone(sfx, t, 170 + rnd() * 30, 0.06, 0.18, 45); };
const snap = t => { addNoise(sfx, t, 0.03, 0.4, 90, 0.5); addTone(sfx, t + 0.004, 820 + rnd() * 120, 0.09, 0.22, 40); addTone(sfx, t + 0.004, 240, 0.08, 0.15, 40); };
const lay = t => addNoise(sfx, t, 0.09, 0.16, 35, 0.12);
const ratchet = t => { addNoise(sfx, t, 0.012, 0.22, 200, 0.6); addTone(sfx, t, 1500 + rnd() * 200, 0.03, 0.12, 120); };
const release = t => {
  // the spring letting go: a fluttering whirr that runs down
  const i0 = idx(t), n = Math.floor(0.55 * SR);
  let y = 0;
  for (let i = 0; i < n && i0 + i < sfx.length; i++) {
    const tt = i / SR, x = rnd() * 2 - 1;
    y += 0.25 * (x - y);
    const flutter = 0.5 + 0.5 * Math.sin(2 * Math.PI * (34 - tt * 30) * tt);
    sfx[i0 + i] += y * flutter * 0.28 * Math.exp(-tt * 4);
  }
};
const bellRing = t => { for (const [f, a] of [[1040, 0.11], [1580, 0.07], [2460, 0.04]]) addTone(sfx, t, f, 0.7, a, 6); };
const gateThunk = t => { addTone(sfx, t, 110, 0.14, 0.25, 22); addNoise(sfx, t, 0.05, 0.15, 70, 0.2); };

// --- lay the events down ----------------------------------------------------
const hushEnv = new Float32Array(N);
let bellOn = null;
for (const e of tl.events) {
  switch (e.kind) {
    case 'clack': clack(e.t); break;
    case 'snap': snap(e.t); break;
    case 'lay': lay(e.t); break;
    case 'ratchet': ratchet(e.t); break;
    case 'release': release(e.t); break;
    case 'gateDown': gateThunk(e.t); break;
    case 'bellStart': bellOn = e.t; break;
    case 'bellStop': if (bellOn !== null) { for (let tb = bellOn; tb < e.t; tb += 0.5) bellRing(tb); bellOn = null; } break;
    case 'hush': { const i = idx(e.t); if (i < N) hushEnv[i] = Math.max(hushEnv[i], e.v / 30); break; }
  }
}
if (bellOn !== null) for (let tb = bellOn; tb < tl.seconds; tb += 0.5) bellRing(tb);
// felt hush: low noise under a smoothed envelope of the car's speed
{
  let env = 0, y = 0;
  for (let i = 0; i < N; i++) {
    env += (hushEnv[i] - env) * (hushEnv[i] > env ? 0.002 : 0.0004);
    const x = rnd() * 2 - 1; y += 0.06 * (x - y);
    sfx[i] += y * env * 0.5;
  }
}

// --- narration ----------------------------------------------------------------
function readWav(path) {
  const b = readFileSync(path);
  let p = 12, fmt = null, data = null;
  while (p < b.length) {
    const id = b.toString('ascii', p, p + 4), len = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') { data = b.subarray(p + 8, p + 8 + len); break; }
    p += 8 + len + (len & 1);
  }
  const n = data.length / 2 / fmt.ch, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * 2 * fmt.ch) / 32768;
  return { sr: fmt.sr, samples: out };
}
const speaking = new Uint8Array(N);
tl.narration.forEach((line, k) => {
  const path = `${narrDir}/line-${k}.wav`;
  if (!existsSync(path)) { console.warn('missing', path); return; }
  const w = readWav(path), i0 = idx(line.at), ratio = w.sr / SR;
  const n = Math.floor(w.samples.length / ratio);
  for (let i = 0; i < n && i0 + i < N; i++) {
    const src = i * ratio, j = Math.floor(src), f = src - j;
    voice[i0 + i] += (w.samples[j] * (1 - f) + (w.samples[j + 1] || 0) * f) * 0.9;
    if (Math.abs(w.samples[j]) > 0.02) speaking[i0 + i] = 1;
  }
  console.log(`line ${k} at ${line.at}s, ${(w.samples.length / w.sr).toFixed(2)}s: ${line.s}`);
});

// --- mix: duck the toys under the voice, soft-limit, write --------------------
const out = new Int16Array(N);
let duck = 0;
for (let i = 0; i < N; i++) {
  duck += ((speaking[i] ? 0.45 : 1) - duck) * (speaking[i] ? 0.003 : 0.0008);
  let v = sfx[i] * duck * 0.8 + voice[i];
  v = Math.tanh(v * 1.1) * 0.95;
  out[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + N * 2, 4); hdr.write('WAVE', 8);
hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(N * 2, 40);
writeFileSync(outPath, Buffer.concat([hdr, Buffer.from(out.buffer)]));
console.log(`wrote ${outPath}: ${(N / SR).toFixed(1)}s`);
