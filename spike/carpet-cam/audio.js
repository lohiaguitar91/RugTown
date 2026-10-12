// Rug Town — the sounds. Everything is synthesized on a WebAudio graph
// (DESIGN.md §3: no sampled toy sounds), on whichever BaseAudioContext you
// hand it: the toy's live AudioContext, or an OfflineAudioContext when a clip
// is rendered. The same code makes the same sound either way, so what the
// clip sounds like is what the toy sounds like.
//
// RugAudio.synth(ac)   one synth per context; every method takes an audio
//                      time to play at, so events can be scheduled ahead
// RugAudio.live()      the phone plumbing around a synth: the context is made
//                      and unlocked on the first touch (iOS), sim events are
//                      pumped onto audio time with a small lookahead so sound
//                      never blocks the fixed-dt sim, the tab going hidden
//                      suspends it, and the mute toggle is remembered
//
// The layout is a music box (§5): every curve is a pin on the barrel, pitched
// on a two-octave major pentatonic (ten degrees), so a loop plays a phrase per
// lap and a slowing spring slows the tune. Which pin each curve is comes from
// main.js (rebuild); this file only knows how a tine sounds.

'use strict';

(function () {
  const ROOT = 523.25;                                     // C5 — a music-box comb sits high
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];      // major pentatonic, two octaves
  const DEGREES = SCALE.length;
  const freqOf = d => ROOT * Math.pow(2, SCALE[Math.max(0, Math.min(DEGREES - 1, d | 0))] / 12);
  const BELL_DEGREE = 8;                                   // the crossing bell chimes on G6, in the same key
  const LEVEL = 0.75;

  function synth(ac, opts = {}) {
    let seed = opts.seed || 7;                             // deterministic timbre jitter: a render is repeatable
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    // master: a warm lowpass, then a gentle compressor to glue the clacks under the notes
    const master = ac.createGain(); master.gain.value = LEVEL;
    const warm = ac.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 9000; warm.Q.value = 0.5;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.18;
    master.connect(warm); warm.connect(comp); comp.connect(ac.destination);

    // two seconds of noise, made once, shared by every burst and the felt hush
    const noiseBuf = ac.createBuffer(1, 2 * ac.sampleRate, ac.sampleRate);
    { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }

    // voices in flight, per family, so a burst of events can never pile up
    // nodes: past the cap the extra clack just isn't played (notes last)
    const live = { clack: [], tick: [], note: [], bell: [], misc: [] };
    const CAP = { clack: 6, tick: 4, note: 10, bell: 4, misc: 8 };
    const admit = (fam, t, dur) => {
      const L = live[fam]; let w = 0;
      for (let i = 0; i < L.length; i++) if (L[i] > t) L[w++] = L[i];
      L.length = w;
      if (L.length >= CAP[fam]) return false;
      L.push(t + dur); return true;
    };

    // a filtered noise burst with an exponential tail
    const burst = (t, dur, amp, lp, { hp = 0, rate = 1, dest = master } = {}) => {
      const src = ac.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = rate;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.7;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      let tail = f;
      if (hp) { const h = ac.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; f.connect(h); tail = h; }
      src.connect(f); tail.connect(g); g.connect(dest);
      src.start(t, rnd() * (noiseBuf.duration - dur - 0.05)); src.stop(t + dur + 0.02);
      return g;
    };
    // a struck tone: sine partials, each with its own level and decay
    const ping = (t, freq, dur, amp, { partials = [[1, 1, dur]], attack = 0.002 } = {}) => {
      for (const [ratio, a, d] of partials) {
        const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = freq * ratio;
        const g = ac.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp * a, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0005, t + d);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.02);
      }
    };

    // --- the running sounds -------------------------------------------------
    // a wheel over a joint: a short wooden knock, quieter as the train slows
    const clack = (t, v = 26) => {
      if (!admit('clack', t, 0.08)) return;
      const k = 0.45 + 0.55 * Math.min(1, Math.max(0, v) / 26);
      burst(t, 0.045, 0.2 * k, 1500 + rnd() * 600, { hp: 160 });
      ping(t, 150 + rnd() * 45, 0.06, 0.1 * k);
    };
    // the spring's escapement: a tiny high tick, all but inaudible on its own
    const tick = (t, amp = 1) => {
      if (!admit('tick', t, 0.03)) return;
      burst(t, 0.012, 0.03 * amp, 3800, { hp: 1200 });
    };
    // a music-box tine: a fundamental that rings for seconds, an inharmonic
    // partial that doesn't, and the pin plucking it
    const note = (t, degree, vel = 1) => {
      if (!admit('note', t, 2.6)) return;
      const f = freqOf(degree);
      ping(t, f, 2.4, 0.15 * vel, { partials: [[1, 1, 2.4], [2.76, 0.16, 0.45], [5.4, 0.05, 0.12]], attack: 0.003 });
      burst(t, 0.015, 0.028, 6500, { hp: 2500 });
    };
    // the crossing bell: a small brass bell on G6, struck at each swing
    const bell = t => {
      if (!admit('bell', t, 0.9)) return;
      const f = freqOf(BELL_DEGREE);
      ping(t, f, 0.9, 0.085, { partials: [[1, 1, 0.9], [1.5, 0.45, 0.6], [2.0, 0.3, 0.45], [2.5, 0.15, 0.3], [0.5, 0.25, 0.8]], attack: 0.001 });
      burst(t, 0.01, 0.04, 5000, { hp: 2000 });
    };
    const gateDown = t => { if (!admit('misc', t, 0.2)) return; ping(t, 110, 0.16, 0.22); burst(t, 0.05, 0.13, 600); };
    const gateUp = t => { if (!admit('misc', t, 0.2)) return; ping(t, 150, 0.1, 0.09); burst(t, 0.03, 0.07, 900); };
    const bump = t => { if (!admit('misc', t, 0.2)) return; ping(t, 110, 0.14, 0.3); burst(t, 0.05, 0.18, 500); };

    // the felt hush of the car on the rug: low noise under a gain that follows its speed
    const hushSrc = ac.createBufferSource(); hushSrc.buffer = noiseBuf; hushSrc.loop = true;
    const hushLp = ac.createBiquadFilter(); hushLp.type = 'lowpass'; hushLp.frequency.value = 650; hushLp.Q.value = 0.4;
    const hushHp = ac.createBiquadFilter(); hushHp.type = 'highpass'; hushHp.frequency.value = 110;
    const hushG = ac.createGain(); hushG.gain.value = 0;
    hushSrc.connect(hushLp); hushLp.connect(hushHp); hushHp.connect(hushG); hushG.connect(master); hushSrc.start(0);
    const hush = (t, v) => { hushG.gain.setTargetAtTime(Math.min(1, Math.max(0, v) / 36) * 0.07, t, 0.15); };

    // --- the build sounds ---------------------------------------------------
    const snap = t => { burst(t, 0.03, 0.4, 2500); ping(t + 0.004, 820 + rnd() * 120, 0.09, 0.2); ping(t + 0.004, 240, 0.08, 0.14); };
    const ratchet = t => { burst(t, 0.012, 0.25, 4000, { hp: 800 }); ping(t, 1500 + rnd() * 200, 0.03, 0.1); };
    // the spring letting go: a fluttering whirr that runs down
    const release = t => {
      const trem = ac.createGain(); trem.gain.setValueAtTime(0.6, t); trem.connect(master);   // 0.6 ± 0.4, a flutter under the envelope
      const lfo = ac.createOscillator(); lfo.type = 'sine';
      lfo.frequency.setValueAtTime(34, t); lfo.frequency.linearRampToValueAtTime(5, t + 0.5);
      const depth = ac.createGain(); depth.gain.value = 0.4;
      lfo.connect(depth); depth.connect(trem.gain); lfo.start(t); lfo.stop(t + 0.55);
      burst(t, 0.5, 0.24, 1400, { hp: 200, dest: trem });
    };
    const nope = t => ping(t, 160, 0.08, 0.1);

    const setLevel = (x, t = ac.currentTime) => master.gain.setTargetAtTime(LEVEL * x, t, 0.03);

    // a sim event (main.js tick) at an audio time
    const event = (ev, t) => {
      switch (ev.kind) {
        case 'clack': clack(t, ev.v); break;
        case 'note': note(t, ev.degree); break;
        case 'tick': tick(t, ev.amp); break;
        case 'bell': bell(t); break;
        case 'gateDown': gateDown(t); break;
        case 'gateUp': gateUp(t); break;
        case 'bump': bump(t); break;
      }
    };

    return { ac, master, clack, tick, note, bell, gateDown, gateUp, bump, hush, snap, ratchet, release, nope, event, setLevel };
  }

  // The live wrapper: one AudioContext for the toy, made on the first touch.
  function live() {
    const LOOK = 0.08;                                     // sim events play this far ahead of "now"
    const AC = window.AudioContext || window.webkitAudioContext;
    let ac = null, syn = null, unlocked = false, force = false;
    let muted = false;
    try { muted = localStorage.getItem('rugtown.muted') === '1'; } catch {}
    const ensure = () => {
      if (!AC) return false;
      if (!ac) {
        try { ac = new AC({ latencyHint: 'interactive' }); } catch { return false; }
        syn = synth(ac);
        if (muted) syn.master.gain.value = 0;
      }
      if (ac.state !== 'running' && !document.hidden) ac.resume().catch(() => {});
      return true;
    };
    const ready = () => !!ac && !muted && (force || ac.state === 'running');
    const api = {
      get muted() { return muted; },
      setMuted(b) {
        muted = !!b;
        try { localStorage.setItem('rugtown.muted', muted ? '1' : '0'); } catch {}
        if (!muted) ensure();
        if (syn) syn.setLevel(muted ? 0 : 1);
      },
      toggle() { api.setMuted(!muted); return muted; },
      unlock() { unlocked = ensure(); return unlocked; },   // call from a user gesture
      ready,
      state: () => ac ? ac.state : 'none',
      // immediate UI sounds (snap, nope, ratchet, release)
      ui(kind) { if (!ready() || !syn[kind]) return; try { syn[kind](ac.currentTime + 0.005); } catch {} },
      // sim events carry their sim time; map onto audio time keeping their
      // spacing. Sound is never allowed to take the frame loop down with it.
      pump(events, simNow) {
        if (!events.length) return;
        if (!ready() || document.hidden) { events.length = 0; return; }
        const now = ac.currentTime;
        try { for (const ev of events) syn.event(ev, Math.max(now, now + LOOK - (simNow - ev.t))); } catch {}
        events.length = 0;
      },
      hush(v) { if (!ready()) return; try { syn.hush(ac.currentTime, v); } catch {} },
      // the harness: schedule even on a context that can't run (no gesture), to measure the cost
      forceReady(on) { force = !!on; },
    };
    document.addEventListener('visibilitychange', () => {
      if (!ac) return;
      if (document.hidden) ac.suspend().catch(() => {});
      else if (unlocked && !muted) ac.resume().catch(() => {});
    });
    return api;
  }

  window.RugAudio = { synth, live, freqOf, SCALE, ROOT, DEGREES, BELL_DEGREE };
})();
