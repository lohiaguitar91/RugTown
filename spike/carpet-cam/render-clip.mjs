// Render the clip (?clip=1) — or, with TRAILER=1, the trailer — frame by frame
// through headless Chromium over CDP, then encode with ffmpeg. Deterministic:
// every frame is __rug.clipSeek(t) or __trailer.frame(i).
//
//   python3 -m http.server 8741            # from the repo root, in another shell
//   node spike/carpet-cam/render-clip.mjs /tmp/frames 30 14 1280 720
//   TRAILER=1 node spike/carpet-cam/render-clip.mjs /tmp/trailer 30 0 1280 720
//   (the trailer needs Google Fonts; behind a proxy set CHROME_PROXY=host:port)
//   ffmpeg -framerate 30 -i /tmp/frames/f%04d.png -c:v libx264 -pix_fmt yuv420p \
//          -crf 20 -movflags +faststart media/rugtown-crossing.mp4
//   ffmpeg -framerate 30 -i /tmp/frames/f%04d.png \
//          -vf "fps=20,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
//          -loop 0 media/rugtown-crossing.gif
//
// Needs Node 22+ (global fetch/WebSocket), a Chromium binary (CHROME env or the
// Playwright default below), and any ffmpeg with libx264 — `pip install
// imageio-ffmpeg` ships one if the system build lacks it.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [outDir = 'frames', fpsArg, TArg, wArg, hArg] = process.argv.slice(2);
const fps = +fpsArg || 30, T = +TArg || 14, W = +wArg || 1280, H = +hArg || 720;
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const TRAILER = process.env.TRAILER === '1';
const URL = process.env.CLIP_URL || (TRAILER
  ? 'http://127.0.0.1:8741/spike/carpet-cam/trailer.html?trailer=1&t=0'
  : 'http://127.0.0.1:8741/spike/carpet-cam/index.html?clip=1&t=0&hud=0');
mkdirSync(outDir, { recursive: true });

const port = 9333;
const flags = [
  '--headless', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`,
  '--remote-allow-origins=*', '--hide-scrollbars', `--window-size=${W},${H + 100}`,
];
if (process.env.CHROME_PROXY) flags.push(`--proxy-server=${process.env.CHROME_PROXY}`, '--ignore-certificate-errors');
const chrome = spawn(CHROME, [...flags, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {}
  if (!target) await sleep(200);
}
if (!target) { chrome.kill(); throw new Error('no page target'); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
};

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
const ready = TRAILER ? '!!window.__trailer' : '!!window.__rug';
for (let i = 0; i < 100; i++) { if (await evaluate(ready)) break; await sleep(100); }
if (TRAILER) await evaluate('document.fonts.ready.then(() => true)');

const n = TRAILER ? await evaluate('window.__trailer.total') : Math.round(T * fps), t0 = Date.now();
for (let i = 0; i < n; i++) {
  await evaluate(TRAILER ? `window.__trailer.frame(${i})` : `window.__rug.clipSeek(${i / fps})`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/f${String(i).padStart(4, '0')}.png`, Buffer.from(shot.result.data, 'base64'));
}
console.log(`captured ${n} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
ws.close(); chrome.kill();
