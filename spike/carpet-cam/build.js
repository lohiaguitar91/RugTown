// Rug Town — the build verb. Loaded by index.html after main.js; the trailer
// doesn't load it. Everything here is touch-first and phone-sized: pointer
// events (one finger = one mouse), a toy bin strip within thumb reach, 44 px
// targets, a generous snap radius, no hover-only affordances.
//
// Gestures in the builder (top-down):
//   drag a slot out of the bin        place a straight, a curve, or the engine
//   drag a placed piece               move it; drop it on the bin to put it away
//   tap a placed curve                flip its hand (if the far end is free)
//   tap a placed straight             turn it 45° (if both ends are free)
//   drag the engine back, let go      wind it up — it runs away from the pull
//   drag the engine off the rails     carry it; drop it on any track
//   one finger on the rug             pan · two fingers: pinch to zoom
//   wheel                             zoom (the web demo)
//   the round button                  carpet level ⇄ builder
// At carpet level, tapping the engine or the car winds it (the old behaviour).

'use strict';

window.__buildInit = function buildInit() {

  // ---------------------------------------------------------------- sounds (synthesized, like everything else)

  const SFX = (() => {
    let ac = null;
    const ctxOk = () => { if (!ac && window.AudioContext) { try { ac = new AudioContext(); } catch {} } if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); return !!ac; };
    const noise = (dur, amp, decay, lp) => {
      if (!ctxOk()) return;
      const n = Math.floor(dur * ac.sampleRate), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      let y = 0;
      for (let i = 0; i < n; i++) { const x = Math.random() * 2 - 1; y += lp * (x - y); d[i] = y * amp * Math.exp(-(i / ac.sampleRate) * decay); }
      const src = ac.createBufferSource(); src.buffer = buf; src.connect(ac.destination); src.start();
    };
    const tone = (freq, dur, amp, decay) => {
      if (!ctxOk()) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(amp, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + Math.max(0.02, Math.min(dur, 4 / decay)));
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
    };
    return {
      unlock: () => ctxOk(),
      snap: () => { noise(0.03, 0.5, 90, 0.5); tone(820 + Math.random() * 120, 0.09, 0.22, 40); tone(240, 0.08, 0.15, 40); },
      bump: () => { tone(110, 0.14, 0.3, 22); noise(0.05, 0.2, 70, 0.2); },
      ratchet: () => { noise(0.012, 0.3, 200, 0.6); tone(1500 + Math.random() * 200, 0.03, 0.12, 120); },
      release: () => { noise(0.4, 0.25, 6, 0.25); },
      nope: () => { tone(160, 0.08, 0.12, 50); },
    };
  })();

  // ---------------------------------------------------------------- the bin and the buttons (screen space)

  const SLOT = 64, PAD = 10, STRIP = SLOT + PAD * 2;
  const SAFE = { bottom: 0, left: 0, right: 0, top: 0 };
  const readSafe = () => {
    try {
      const cs = getComputedStyle(document.documentElement);
      for (const k of Object.keys(SAFE)) SAFE[k] = parseFloat(cs.getPropertyValue(`--sa-${k}`)) || 0;
    } catch {}
  };
  const SLOTS = [{ kind: 'S', label: 'straight' }, { kind: 'C', label: 'curve' }, { kind: 'E', label: 'engine' }];
  let curveHand = -1;   // the hand the next curve comes out of the bin with: whatever you last used

  const binRectUI = () => portrait()
    ? { x: 0, y: H - STRIP - SAFE.bottom, w: W, h: STRIP + SAFE.bottom, side: 'bottom' }
    : { x: 0, y: 0, w: STRIP + SAFE.left, h: H, side: 'left' };
  const slotRect = i => {
    const b = binRectUI();
    if (b.side === 'bottom') {
      const total = SLOTS.length * SLOT + (SLOTS.length - 1) * 14, x0 = (W - total) / 2;
      return { x: x0 + i * (SLOT + 14), y: b.y + PAD, w: SLOT, h: SLOT };
    }
    const total = SLOTS.length * SLOT + (SLOTS.length - 1) * 14, y0 = (H - total) / 2;
    return { x: SAFE.left + PAD, y: y0 + i * (SLOT + 14), w: SLOT, h: SLOT };
  };
  const camBtn = () => ({ x: W - SAFE.right - 14 - 52, y: SAFE.top + 14, r: 26 });
  const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const buildRect = () => {   // the screen area the rug should fit into
    const b = binRectUI();
    return b.side === 'bottom' ? { x: 0, y: SAFE.top, w: W, h: b.y - SAFE.top } : { x: b.x + b.w, y: 0, w: W - b.w, h: H };
  };

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawToyBin() {
    if (!cam.topDown) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const b = binRectUI();
    ctx.fillStyle = 'rgba(46,32,23,0.92)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#5a4632';
    if (b.side === 'bottom') ctx.fillRect(b.x, b.y, b.w, 2); else ctx.fillRect(b.x + b.w - 2, b.y, 2, b.h);
    const trashing = drag && drag.kind === 'piece' && drag.from === 'placed' && drag.overBin;
    SLOTS.forEach((s, i) => {
      const r = slotRect(i);
      const active = drag && ((drag.kind === 'piece' && drag.type === s.kind && drag.from === 'bin') || (drag.kind === 'engineNew' && s.kind === 'E'));
      roundRectPath(r.x, r.y, r.w, r.h, 10);
      ctx.fillStyle = trashing ? '#7a4a3a' : active ? '#7a5c44' : '#5c4534'; ctx.fill();
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      if (s.kind === 'S') {
        roundRectPath(cx - 24, cy - 6, 48, 12, 3); ctx.fillStyle = C.bed; ctx.fill();
        ctx.fillStyle = C.groove; ctx.fillRect(cx - 24, cy - 3, 48, 1.8); ctx.fillRect(cx - 24, cy + 1.5, 48, 1.8);
      } else if (s.kind === 'C') {
        ctx.lineCap = 'butt';
        const a0 = -Math.PI * 0.9, a1 = -Math.PI * 0.35, ox = cx - 4, oy = cy + 18, rr = 24;
        ctx.beginPath(); ctx.arc(ox, oy, rr, a0, a1); ctx.lineWidth = 12; ctx.strokeStyle = C.bed; ctx.stroke();
        ctx.beginPath(); ctx.arc(ox, oy, rr + 2.6, a0, a1); ctx.lineWidth = 1.8; ctx.strokeStyle = C.groove; ctx.stroke();
        ctx.beginPath(); ctx.arc(ox, oy, rr - 2.6, a0, a1); ctx.stroke();
      } else if (sprites.engine.length) {
        const img = sprites.engine[Math.round(sprites.engine.length * 0.62) % sprites.engine.length];
        const scale = 44 / BAKE.w * 1.5;
        if (!S.eng.placed || active) ctx.drawImage(img, cx - BAKE.w * scale / 2, cy - BAKE.baseline * scale + 14, BAKE.w * scale, BAKE.h * scale);
        else { ctx.globalAlpha = 0.35; ctx.drawImage(img, cx - BAKE.w * scale / 2, cy - BAKE.baseline * scale + 14, BAKE.w * scale, BAKE.h * scale); ctx.globalAlpha = 1; }
      }
    });
    ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = 'rgba(240,225,200,0.5)'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    SLOTS.forEach((s, i) => { const r = slotRect(i); ctx.fillText(trashing ? 'put away' : s.label, r.x + r.w / 2, r.y + r.h + (b.side === 'bottom' ? -4 : 12) + (b.side === 'bottom' ? 0 : 0)); });
    ctx.textAlign = 'left';
  }

  function drawCamButton() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const b = camBtn(), cx = b.x + b.r, cy = b.y + b.r;
    ctx.beginPath(); ctx.arc(cx, cy, b.r, 0, 6.29); ctx.fillStyle = 'rgba(46,32,23,0.9)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(217,158,65,0.9)'; ctx.stroke();
    ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = 'rgba(240,225,200,0.9)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(cam.topDown ? 'carpet' : 'build', cx, cy);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ---------------------------------------------------------------- the ghost (a piece or the engine in hand)

  let drag = null;   // { kind: 'piece'|'engine'|'engineNew'|'pan'|'pinch'|'maybe', ... }

  // Where a piece in hand would go: snapped to the nearest open end within
  // reach (screen distance — a thumb, not a cm), else free on the rug under
  // the finger, else nowhere.
  function ghostFor(type, hand, sx, sy, ignoreIdx) {
    buildView();
    const reach = 64;
    let best = null;
    for (const e of openEnds()) {
      if (e.piece === ignoreIdx) continue;
      const c = toCam(v3(e.p.x, RAIL_H, e.p.z)); if (c.z <= CAM.near) continue;
      const s = toScreen(c), d = Math.hypot(s.x - sx, s.y - sy);
      if (d > reach || (best && d >= best.d)) continue;
      for (const hh of type === 'C' ? [hand, -hand] : [0]) {
        const pc = pieceAfter(e, type, hh);
        if (pieceFits(pc, LAYOUT, ignoreIdx)) { best = { d, pc, end: e, snapped: true }; break; }
      }
    }
    if (best) return { pc: best.pc, valid: true, snapped: true };
    const g = groundAt(sx, sy, RAIL_H);
    if (!g) return null;
    const pc = { t: type, hand: type === 'C' ? hand : 0, x: g.x, z: g.z, h: freeHeading };
    // centre the piece under the finger, not its start peg
    const geo = pieceGeom(pc), mid = pathAt(makePath([geo.seg]), geo.len / 2).p;
    pc.x += g.x - mid.x; pc.z += g.z - mid.z;
    return { pc, valid: pieceFits(pc, LAYOUT, ignoreIdx), snapped: false };
  }
  let freeHeading = Math.PI / 2;

  function drawGhost() {
    if (!drag) return;
    if (drag.kind === 'piece' && drag.ghost) {
      const geo = { bedQuads: [], grooves: [[], []], jointBands: [], pegs: [], sides: [] };
      pieceQuads(drag.ghost.pc, -1, geo);
      const savedRail = VIS.rail; VIS.rail = Infinity;
      drawTrackQuads(geo, () => true, drag.ghost.valid ? 0.75 : 0.35, drag.ghost.snapped ? 0.6 : HOVER_H);
      VIS.rail = savedRail;
    }
    if ((drag.kind === 'engineNew' || (drag.kind === 'engine' && drag.lifted)) && drag.ghostPos) {
      const at = { p: v3(drag.ghostPos.x, RAIL_H + (drag.snap ? 0.4 : HOVER_H), drag.ghostPos.z), tan: drag.ghostTan || v3(1, 0, 0) };
      drawSprite(sprites.engine, at, [[5.2, 3.4, 0.12], [3.6, 2.4, 0.16]], drag.snap ? 0.9 : 0.55);
    }
    if (drag.kind === 'engine' && !drag.lifted && Math.abs(drag.pulled) >= 1) {
      // a little spring meter above the engine while you pull
      buildView();
      const e = pathAt(RAIL, S.eng.s), c = toCam(v3(e.p.x, RAIL_H + 8, e.p.z));
      if (c.z > CAM.near) {
        const s = toScreen(c), w = 56, f = Math.min(1, Math.abs(drag.pulled) / ENGINE.pullFull);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = 'rgba(46,32,23,0.8)'; ctx.fillRect(s.x - w / 2 - 2, s.y - 7, w + 4, 10);
        ctx.fillStyle = C.rugStripe; ctx.fillRect(s.x - w / 2, s.y - 5, w * f, 6);
      }
    }
  }

  // ---------------------------------------------------------------- hit testing

  const screenOfWorld = p => { buildView(); const c = toCam(p); return c.z > CAM.near ? toScreen(c) : null; };
  const engineScreen = () => S.eng.placed ? screenOfWorld(add(pathAt(RAIL, S.eng.s).p, v3(0, RAIL_H + 2.5, 0))) : null;
  const carScreen = () => screenOfWorld(add(pathAt(ROADPATH, S.car.s).p, v3(0, 2, 0)));
  const pieceAtScreen = (sx, sy) => {
    let best = null;
    LAYOUT.forEach((pc, i) => {
      for (const q of pieceSamples(pc, 5)) {
        const s = screenOfWorld(v3(q.x, RAIL_H, q.z)); if (!s) continue;
        const d = Math.hypot(s.x - sx, s.y - sy);
        if (d < 30 && (!best || d < best.d)) best = { i, d };
      }
    });
    return best ? best.i : -1;
  };
  // nearest point on any chain's track to a ground point, as a piece anchor
  function trackPointNear(g, maxCm) {
    let best = null;
    LAYOUT.forEach((pc, i) => {
      const geo = pieceGeom(pc), path = makePath([geo.seg]);
      const n = nearestOnPath(path, g, 1);
      if (n.d < maxCm && (!best || n.d < best.d)) best = { piece: i, local: n.s, d: n.d, tan: pathAt(path, n.s).tan, p: pathAt(path, n.s).p };
    });
    return best;
  }

  // ---------------------------------------------------------------- gestures

  const pointers = new Map();
  let lastPinch = null;
  const px = e => ({ x: e.clientX, y: e.clientY });

  function down(id, p) {
    pointers.set(id, { ...p, start: p, t0: performance.now() });
    SFX.unlock();
    if (pointers.size === 2 && cam.topDown) {
      // second finger: whatever was in hand goes back, and we pinch
      cancelDrag();
      const [a, b] = [...pointers.values()];
      drag = { kind: 'pinch' }; lastPinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    if (pointers.size > 1) return;
    const btn = camBtn();
    if (Math.hypot(p.x - (btn.x + btn.r), p.y - (btn.y + btn.r)) <= btn.r + 8) { drag = { kind: 'button' }; return; }
    if (!cam.topDown) {
      // carpet level: a tap winds whichever toy is under it (or the engine)
      const c = carScreen(), e = engineScreen();
      const d = s => s ? Math.hypot(s.x - p.x, s.y - p.y) : Infinity;
      if (d(c) < 70 && d(c) < d(e)) rewindCar(); else rewindEngine();
      drag = { kind: 'tapped' };
      return;
    }
    for (let i = 0; i < SLOTS.length; i++) {
      if (!inRect(p, slotRect(i))) continue;
      const s = SLOTS[i];
      if (s.kind === 'E') { if (S.eng.placed) return; drag = { kind: 'engineNew', ghostPos: null, snap: null }; moveDrag(p); return; }
      drag = { kind: 'piece', type: s.kind, hand: curveHand, from: 'bin', ghost: null, overBin: false };
      clearTimeout(hashTimer);
      moveDrag(p);
      return;
    }
    const e = engineScreen();
    if (e && Math.hypot(e.x - p.x, e.y - p.y) < 36) {
      const g = groundAt(p.x, p.y, RAIL_H);
      drag = { kind: 'engine', grabS: S.eng.s, lastS: S.eng.s, pulled: 0, lifted: false, ratchetAt: 0, lastGround: g };
      engineSlideTo(S.eng.s);
      return;
    }
    const idx = pieceAtScreen(p.x, p.y);
    if (idx >= 0) { drag = { kind: 'maybe', idx, start: p }; return; }
    drag = { kind: 'pan', last: p };
  }

  function moveDrag(p) {
    if (!drag) return;
    const bin = binRectUI();
    if (drag.kind === 'maybe') {
      if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 10) return;
      // pick the piece up: it leaves the layout and becomes the ghost
      const pc = LAYOUT[drag.idx];
      const a = S.eng.placed ? engineAnchor() : null;
      const engineOnIt = a && a.piece === drag.idx ? { local: a.local, facing: a.facing } : null;
      const prevAnchor = a && !engineOnIt ? { ...a, piece: a.piece > drag.idx ? a.piece - 1 : a.piece } : null;   // indices after the removal
      LAYOUT.splice(drag.idx, 1);
      rebuild(prevAnchor);
      clearTimeout(hashTimer);   // the link never shows a piece that's in your hand
      drag = { kind: 'piece', type: pc.t, hand: pc.hand || curveHand, from: 'placed', prev: pc, prevIdx: drag.idx, engineOnIt, ghost: null, overBin: false };
    }
    if (drag.kind === 'piece') {
      drag.overBin = inRect(p, bin);
      drag.ghost = drag.overBin ? null : ghostFor(drag.type, drag.hand, p.x, p.y, -1);
      if (drag.ghost && drag.ghost.pc.t === 'C') drag.hand = drag.ghost.pc.hand;
      return;
    }
    if (drag.kind === 'engineNew' || (drag.kind === 'engine' && drag.lifted)) {
      drag.overBin = inRect(p, bin);
      const g = groundAt(p.x, p.y, RAIL_H);
      drag.ghostPos = g; drag.snap = null;
      if (g && !drag.overBin) {
        const t = trackPointNear(g, 9);
        if (t) {
          // face the way the finger is travelling, else along the piece
          const mv = drag.lastGround ? sub(g, drag.lastGround) : null;
          const facing = mv && Math.hypot(mv.x, mv.z) > 0.3 ? (dot(mv, t.tan) >= 0 ? 1 : -1) : (drag.facing || 1);
          drag.snap = { ...t, facing }; drag.facing = facing;
          drag.ghostPos = t.p; drag.ghostTan = facing > 0 ? t.tan : scale3(t.tan, -1);
        } else {
          const mv = drag.lastGround ? sub(g, drag.lastGround) : null;
          if (mv && Math.hypot(mv.x, mv.z) > 0.3) drag.ghostTan = norm(v3(mv.x, 0, mv.z));
        }
      }
      drag.lastGround = g || drag.lastGround;
      return;
    }
    if (drag.kind === 'engine') {
      const g = groundAt(p.x, p.y, RAIL_H);
      if (!g) return;
      const n = nearestOnPath(RAIL, g, 1);
      if (n.d > 12) { drag.lifted = true; drag.facing = S.eng.dir; drag.ghostTan = pathAt(RAIL, S.eng.s).tan; moveDrag(p); return; }
      let target = n.s;
      if (TRACKINFO.closed) {
        // follow the finger the short way round, so a long pull keeps counting
        let delta = target - drag.lastS;
        if (delta > RAIL.total / 2) delta -= RAIL.total; if (delta < -RAIL.total / 2) delta += RAIL.total;
        drag.pulled += delta * S.eng.dir; target = drag.lastS + delta;
      } else drag.pulled = (target - drag.grabS) * S.eng.dir;
      drag.lastS = TRACKINFO.closed ? wrapS(RAIL, target) : target;
      engineSlideTo(target);
      if (Math.floor(Math.abs(drag.pulled) / 1.2) !== drag.ratchetAt) { drag.ratchetAt = Math.floor(Math.abs(drag.pulled) / 1.2); SFX.ratchet(); }
      drag.lastGround = g;
      return;
    }
    if (drag.kind === 'pan') {
      buildView();
      const a = groundAt(drag.last.x, drag.last.y, 0), b = groundAt(p.x, p.y, 0);
      if (a && b) { TOP.cx -= b.x - a.x; TOP.cz -= b.z - a.z; clampTop(); }
      drag.last = p;
      return;
    }
    if (drag.kind === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (lastPinch && d > 1) {
        buildView();
        const before = groundAt(lastPinch.mx, lastPinch.my, 0);
        TOP.h = Math.max(TOP.hMin, Math.min(TOP.hMax, TOP.h * lastPinch.d / d));
        buildView();
        const after = groundAt(mx, my, 0);
        if (before && after) { TOP.cx += before.x - after.x; TOP.cz += before.z - after.z; }
        clampTop();
      }
      lastPinch = { d, mx, my };
    }
  }

  function up(id, p) {
    const had = pointers.get(id); pointers.delete(id);
    if (!drag) return;
    if (drag.kind === 'pinch') { if (pointers.size < 2) { drag = null; lastPinch = null; } return; }
    const tapLike = had && Math.hypot(p.x - had.start.x, p.y - had.start.y) < 10 && performance.now() - had.t0 < 450;
    if (drag.kind === 'button') { if (tapLike) toggleCamera(); drag = null; return; }
    if (drag.kind === 'maybe') { if (tapLike) tapPiece(drag.idx); drag = null; return; }
    if (drag.kind === 'piece') { dropPiece(); return; }
    if (drag.kind === 'engineNew' || (drag.kind === 'engine' && drag.lifted)) { dropEngine(); return; }
    if (drag.kind === 'engine') {
      engineRelease(drag.pulled);
      if (Math.abs(drag.pulled) >= 1) SFX.release();
      drag = null; syncHash(); return;
    }
    drag = null;
  }

  // a moved piece goes back where it was, and the engine with it if it was
  // aboard; otherwise the engine stays wherever the sim has carried it since
  function restorePiece(d) {
    const a = S.eng.placed ? engineAnchor() : null;
    LAYOUT.splice(d.prevIdx, 0, d.prev);
    let anchor = a ? { ...a, piece: a.piece >= d.prevIdx ? a.piece + 1 : a.piece } : null;
    if (d.engineOnIt) anchor = { piece: d.prevIdx, ...d.engineOnIt };
    rebuild(anchor);
  }
  function cancelDrag() {
    if (!drag) return;
    const d = drag; drag = null;   // cleared first, so the rebuild below re-syncs the link
    if (d.kind === 'piece' && d.from === 'placed') restorePiece(d);
    if (d.kind === 'engine') { engineRelease(0); }
  }

  function dropPiece() {
    const d = drag; drag = null;
    if (d.overBin) {
      // put away: a piece from the layout is gone; one from the bin never existed
      if (d.from === 'placed') { SFX.snap(); syncHash(); }
      return;
    }
    if (d.ghost && d.ghost.valid) {
      let anchor = S.eng.placed ? engineAnchor() : null;   // where the engine is now, not at pickup
      LAYOUT.push(d.ghost.pc);
      if (d.ghost.pc.t === 'C') curveHand = d.ghost.pc.hand;
      if (d.engineOnIt) anchor = { piece: LAYOUT.length - 1, ...d.engineOnIt };   // the engine rides along
      rebuild(anchor);
      SFX.snap(); syncHash();
      return;
    }
    // nowhere to put it: it springs back where it came from
    SFX.nope();
    if (d.from === 'placed') restorePiece(d);
  }

  function dropEngine() {
    const d = drag; drag = null;
    if (d.overBin) { if (d.kind === 'engine') { engineRemove(); SFX.snap(); syncHash(); } return; }
    if (d.snap) { engineDropOn(d.snap.piece, d.snap.local, d.snap.facing); SFX.snap(); syncHash(); return; }
    SFX.nope();
    if (d.kind === 'engine') { engineRelease(0); }   // back onto its rails, where it was
  }

  // tap: a curve with a free far end flips its hand; a straight with both ends
  // free turns 45°; anything else just wiggles (nothing to explain)
  function tapPiece(idx) {
    const pc = LAYOUT[idx], conn = CONN[idx];
    const anchor = S.eng.placed ? engineAnchor() : null;
    if (anchor && anchor.piece === idx) { SFX.nope(); return; }
    if (pc.t === 'C' && !(conn[0] && conn[1])) {
      let flipped;
      if (conn[1] && !conn[0]) {
        // attached at its far end: the mirror image keeps that end. A curve run
        // backwards swaps hands, so the reverse curve with the *same* hand is
        // the mirror; its far end is where the flipped piece starts.
        const E = pieceEnds(pc)[1];
        const back = pieceAfter({ p: E.p, out: E.out + Math.PI }, 'C', pc.hand);
        const b = pieceEnds(back)[1];
        flipped = { t: 'C', hand: -pc.hand, x: b.p.x, z: b.p.z, h: wrapAngle(b.out + Math.PI) };
      } else flipped = { ...pc, hand: -pc.hand };
      if (pieceFits(flipped, LAYOUT, idx)) { LAYOUT[idx] = flipped; curveHand = flipped.hand; rebuild(anchor); SFX.snap(); syncHash(); return; }
    }
    if (pc.t === 'S' && !conn[0] && !conn[1]) {
      const geo = pieceGeom(pc), mid = pathAt(makePath([geo.seg]), geo.len / 2).p;
      const turned = { ...pc, h: wrapAngle(pc.h + Math.PI / 4) };
      const geo2 = pieceGeom(turned), mid2 = pathAt(makePath([geo2.seg]), geo2.len / 2).p;
      turned.x += mid.x - mid2.x; turned.z += mid.z - mid2.z;
      if (pieceFits(turned, LAYOUT, idx)) { LAYOUT[idx] = turned; freeHeading = turned.h; rebuild(anchor); SFX.snap(); syncHash(); return; }
    }
    SFX.nope();
  }

  function clampTop() {
    TOP.cx = Math.max(-RUG.w / 2 - 20, Math.min(RUG.w / 2 + 20, TOP.cx));
    TOP.cz = Math.max(-RUG.d / 2 - 20, Math.min(RUG.d / 2 + 20, TOP.cz));
  }
  function toggleCamera() {
    cam.topDown = !cam.topDown;
    if (cam.topDown) fitTop(buildRect());
    else if (S.eng.placed) updateCamera(0, true);
  }

  // ---------------------------------------------------------------- the share link

  let hashTimer = 0;
  function syncHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => { try { history.replaceState(null, '', '#' + serializeLayout()); } catch {} }, 150);
  }
  LAYOUT_HOOKS.push(() => { if (!drag) syncHash(); });

  // ---------------------------------------------------------------- wiring

  readSafe();
  window.addEventListener('resize', () => { readSafe(); if (cam.topDown) fitTop(buildRect()); });
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture?.(e.pointerId); down(e.pointerId, px(e)); e.preventDefault(); });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const p = px(e); Object.assign(pointers.get(e.pointerId), p);
    moveDrag(p);
  });
  const endPtr = e => { if (pointers.has(e.pointerId)) up(e.pointerId, px(e)); };
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', e => { if (pointers.has(e.pointerId)) { pointers.delete(e.pointerId); cancelDrag(); } });
  canvas.addEventListener('wheel', e => {
    if (!cam.topDown) return;
    e.preventDefault();
    buildView();
    const before = groundAt(e.clientX, e.clientY, 0);
    TOP.h = Math.max(TOP.hMin, Math.min(TOP.hMax, TOP.h * Math.exp(e.deltaY * 0.0015)));
    buildView();
    const after = groundAt(e.clientX, e.clientY, 0);
    if (before && after) { TOP.cx += before.x - after.x; TOP.cz += before.z - after.z; }
    clampTop();
  }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'c') { cam.topDown = !cam.topDown; toggleCamera(); } });

  RENDER_HOOKS.push(drawGhost, drawToyBin, drawCamButton);
  const pump = () => { while (SIM_EVENTS.length) { if (SIM_EVENTS.shift() === 'bump') SFX.bump(); } requestAnimationFrame(pump); };
  requestAnimationFrame(pump);

  cam.topDown = Q.get('cam') !== 'carpet';
  if (cam.topDown) fitTop(buildRect());

  // --- a test seam: drive the same gesture code from a script
  window.__build = {
    down: (x, y, id = 1) => down(id, { x, y }),
    move: (x, y, id = 1) => { if (pointers.has(id)) Object.assign(pointers.get(id), { x, y }); moveDrag({ x, y }); },
    up: (x, y, id = 1) => up(id, { x, y }),
    drag(x0, y0, x1, y1, steps = 12, id = 1) { this.down(x0, y0, id); for (let i = 1; i <= steps; i++) this.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, id); this.up(x1, y1, id); },
    tap(x, y) { this.down(x, y); this.up(x, y); },
    slot: i => { const r = slotRect(i); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; },
    engineScreen, carScreen,
    endScreen: which => { const ends = openEnds(); const e = ends[which < 0 ? ends.length + which : which]; return e ? screenOfWorld(v3(e.p.x, RAIL_H, e.p.z)) : null; },
    pieceScreen: i => screenOfWorld(v3(PIECE_CENTER_OF(i).x, RAIL_H, PIECE_CENTER_OF(i).z)),
    ghost: () => drag && drag.kind === 'piece' ? { valid: drag.ghost?.valid, snapped: drag.ghost?.snapped, hand: drag.hand } : drag ? { kind: drag.kind, snap: !!drag.snap } : null,
    state: () => ({ pieces: LAYOUT.length, closed: TRACKINFO.closed, open: openEnds().length, engine: { placed: S.eng.placed, s: +S.eng.s.toFixed(2), dir: S.eng.dir, spring: +S.eng.spring.toFixed(2), halted: S.eng.halted }, crossings: CROSSINGS.map(c => c.gated), top: { ...TOP }, hash: serializeLayout() }),
    fit: () => fitTop(buildRect()), setTop: (cx, cz, h) => { TOP.cx = cx; TOP.cz = cz; TOP.h = h; },
    render: () => { render(); return true; },
    tickSeconds: s => { for (let i = 0; i < Math.round(s / FIXED_DT); i++) tick(); },
  };
  const PIECE_CENTER_OF = i => { const g = pieceGeom(LAYOUT[i]); return pathAt(makePath([g.seg]), g.len / 2).p; };
};
