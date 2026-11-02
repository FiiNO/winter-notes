/* Travel Dossier effects (31 Oct 2026): the celebration layer for quests, stamps, badges, approvals and level-ups.
   One full-screen canvas for particles (confetti cannons, fireworks, star bursts, sparkles, emoji rain) and a party card
   with rays, a shine sweep, a counting score and a short haptic. 3 Nov 2026: a level-up is a show of its own (levelUp:
   the face drops in, the old level badge flies off and the new one slams on, a LEVEL UP ribbon, the name letter by
   letter, the ladder lighting up, the points counting, a rain of the level's glyph, then the face flies up to the
   header pill) and a few short synthesised sounds (no audio files; Settings → Sound effects). Everything respects
   prefers-reduced-motion (no particles, no motion, the cards still appear). No library, no network. Loaded before
   quests.js; nothing here reads trip data. */
'use strict';
window.FX = (() => {
  /* Settings → Animations: 'on' forces the full show, 'off' keeps every screen still; otherwise the phone's own
     reduce-motion setting decides. The CSS side reads the same choice from html[data-fx]. */
  const reduce = () => { const f = localStorage.getItem('fx'); if (f === 'on') return false; if (f === 'off') return true; return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); };
  function applyPref() { const f = localStorage.getItem('fx'); if (f === 'on' || f === 'off') document.documentElement.setAttribute('data-fx', f); else document.documentElement.removeAttribute('data-fx'); }
  applyPref();
  const PAL = {
    quest: ['#2A9D8F', '#FFB703', '#4CC9F0', '#FF4D8D', '#7B2CBF', '#E63946'],
    food: ['#FF7A00', '#FFB703', '#E63946', '#FFFFFF', '#6BCB77'],
    badge: ['#FFD700', '#FFB703', '#FFF1A8', '#FF8C00', '#FFFFFF'],
    stamp: ['#FFD700', '#FFB703', '#FFFFFF', '#4CC9F0', '#FF4D8D'],
    level: ['#FF4D8D', '#FFB703', '#4CC9F0', '#7B2CBF', '#2A9D8F', '#FFFFFF', '#E63946'],
    ok: ['#2A9D8F', '#6BCB77', '#FFFFFF', '#FFB703'],
    wait: ['#4CC9F0', '#FFFFFF', '#3A86FF'],
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------------------------------------------------------- particles */
  let canvas = null, ctx = null, parts = [], raf = null, last = 0;
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas'); canvas.className = 'fx-canvas'; canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas); ctx = canvas.getContext('2d'); resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function spawn(n, x, y, o) {
    if (reduce()) return;
    const colors = o.colors || PAL.quest, shapes = o.shapes || ['rect', 'strip', 'circle'];
    for (let i = 0; i < n; i++) {
      const a = (o.angle == null ? -Math.PI / 2 : o.angle) + (Math.random() - 0.5) * (o.spread == null ? Math.PI : o.spread);
      const sp = (o.speed == null ? 9 : o.speed) * (0.45 + Math.random());
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.gravity == null ? 0.25 : o.gravity, drag: o.drag == null ? 0.985 : o.drag,
        life: (o.life || 110) * (0.7 + Math.random() * 0.5), t: 0, size: (o.size || 9) * (0.6 + Math.random() * 0.8), rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * (o.text ? 0.08 : 0.35), color: colors[i % colors.length], shape: shapes[i % shapes.length], text: o.text || null, wob: Math.random() * 6.28, flip: 0.6 + Math.random() * 0.8 });
    }
    start();
  }
  function start() { ensureCanvas(); canvas.classList.add('on'); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function tick(now) {
    const dt = Math.min(2.5, (now - last) / 16.7); last = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.t += dt; p.vy += p.g * dt; p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt + Math.sin(p.wob + p.t * 0.12) * 0.7; p.y += p.vy * dt; p.rot += p.vr * dt;
      const fade = p.t > p.life * 0.65 ? Math.max(0, 1 - (p.t - p.life * 0.65) / (p.life * 0.35)) : 1;
      ctx.globalAlpha = fade; ctx.fillStyle = p.color;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if (p.shape !== 'circle' && p.shape !== 'star' && p.shape !== 'text') ctx.scale(1, Math.abs(Math.cos(p.t * 0.1 * p.flip)) * 0.8 + 0.2);   // tumbling paper
      draw(p); ctx.restore();
    }
    ctx.globalAlpha = 1;
    parts = parts.filter((p) => p.t < p.life && p.y < innerHeight + 60);
    if (parts.length) raf = requestAnimationFrame(tick);
    else { raf = null; ctx.clearRect(0, 0, innerWidth, innerHeight); canvas.classList.remove('on'); }
  }
  function draw(p) {
    const s = p.size;
    if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, 6.2832); ctx.fill(); }
    else if (p.shape === 'star') { star(s / 2); }
    else if (p.shape === 'text') { ctx.font = Math.round(s) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.text || '★', 0, 0); }
    else if (p.shape === 'strip') ctx.fillRect(-s / 2, -s / 6, s * 1.4, s / 3);
    else ctx.fillRect(-s / 2, -s / 2, s, s * 0.6);
  }
  function star(r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }
  /* named effects */
  function burst(x, y, colors, n = 90) { spawn(n, x, y, { colors, angle: -Math.PI / 2, spread: Math.PI * 1.1, speed: 11, gravity: 0.28, life: 120 }); }
  function cannons(colors, n = 60) {
    spawn(n, -10, innerHeight * 0.75, { colors, angle: -Math.PI / 3.2, spread: 0.55, speed: 17, gravity: 0.3, life: 160 });
    spawn(n, innerWidth + 10, innerHeight * 0.75, { colors, angle: -Math.PI + Math.PI / 3.2, spread: 0.55, speed: 17, gravity: 0.3, life: 160 });
  }
  function fireworks(colors, rounds = 5) {
    for (let i = 0; i < rounds; i++) setTimeout(() => {
      const x = innerWidth * (0.15 + Math.random() * 0.7), y = innerHeight * (0.12 + Math.random() * 0.35);
      spawn(70, x, y, { colors: [colors[i % colors.length], '#FFFFFF', colors[(i + 2) % colors.length]], angle: 0, spread: Math.PI * 2, speed: 7.5, gravity: 0.07, drag: 0.955, shapes: ['circle', 'star', 'circle'], size: 6, life: 95 });
    }, i * 320);
  }
  function stars(x, y, colors, n = 36) { spawn(n, x, y, { colors, angle: 0, spread: Math.PI * 2, speed: 6.5, gravity: 0.06, drag: 0.965, shapes: ['star', 'circle'], size: 11, life: 85 }); }
  function sparkle(x, y, colors) { spawn(18, x, y, { colors: colors || PAL.badge, angle: 0, spread: Math.PI * 2, speed: 4, gravity: 0.04, drag: 0.95, shapes: ['star'], size: 9, life: 60 }); }
  function snow(n = 70) { for (let i = 0; i < n; i++) spawn(1, Math.random() * innerWidth, -10, { colors: ['#FFFFFF', '#DFF6FF'], angle: Math.PI / 2, spread: 0.4, speed: 1.6, gravity: 0.012, drag: 0.995, shapes: ['circle'], size: 7, life: 260 }); }
  function rain(text, n = 40) {          // the level's glyph (🌏, 👑…) falling across the screen for a couple of seconds
    if (reduce()) return;
    for (let i = 0; i < n; i++) setTimeout(() => spawn(1, Math.random() * innerWidth, -30, { text, shapes: ['text'], size: 30, angle: Math.PI / 2, spread: 0.5, speed: 2.2, gravity: 0.03, drag: 0.995, life: 220 }), i * 45);
  }
  function haptic(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not supported */ } }

  /* ---------------------------------------------------------------- sounds (3 Nov 2026): a few short synthesised notes, no files
     Browsers only open audio inside a tap, so the first tap anywhere creates the context; nothing plays while the switch is
     off, the tab is hidden, or before that first tap (a ✓ that syncs in before anyone has touched the phone stays quiet). */
  let ac = null, acTried = false, master = null, lp = null, played = 0;
  const soundOn = () => localStorage.getItem('sfx') !== '0';
  function setSound(on) { if (on) localStorage.removeItem('sfx'); else localStorage.setItem('sfx', '0'); }
  function unlock() {
    if (ac || acTried) return; acTried = true;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.35; master.connect(ac.destination);
      lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900; lp.connect(master);
    } catch (e) { ac = null; }
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, { once: true, passive: true, capture: true }));
  function tone(t0, f0, f1, dur, type, vol, o) {
    const osc = ac.createOscillator(), g = ac.createGain(); osc.type = type || 'sine';
    osc.frequency.setValueAtTime(f0, t0); if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + ((o && o.attack) || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(o && o.lp ? lp : master); osc.start(t0); osc.stop(t0 + dur + 0.05); played++;
  }
  function noise(t0, dur, vol, f0, f1) {   // filtered white noise: the whoosh, the boom's thud, the cymbal
    const n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = b; f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(master); s.start(t0); s.stop(t0 + dur + 0.05); played++;
  }
  const SOUNDS = {
    pop: (t) => tone(t, 520, 880, 0.09, 'sine', 0.5),                                           // a tick on a parent phone, a parent's ✓
    send: (t) => noise(t, 0.22, 0.25, 500, 2200),                                                 // a kids' tick on its way to Mum and Dad
    yes: (t) => { [523.25, 659.25, 783.99].forEach((f, i) => tone(t + i * 0.09, f, f, 0.16, 'triangle', 0.4)); tone(t + 0.3, 1046.5, 1046.5, 0.3, 'triangle', 0.3); },   // the ✓ arrives
    badge: (t) => { [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(t + i * 0.07, f, f * 1.01, 0.18, 'sine', 0.35)); },                              // a new badge
    stamp: (t) => { tone(t, 180, 70, 0.12, 'sine', 0.7); SOUNDS.badge(t + 0.15); },                                                                           // thunk, then the sparkle
    boom: (t) => { tone(t, 70, 40, 0.35, 'sine', 0.8); noise(t, 0.3, 0.3, 120, 60); },                                                                        // the level-up's first beat
    fanfare: (t, legend) => {
      const seq = legend ? [[392, 0.12], [523.25, 0.12], [659.25, 0.12], [783.99, 0.12], [1046.5, 0.14], [1318.5, 0.6]] : [[392, 0.14], [523.25, 0.14], [659.25, 0.14], [783.99, 0.28], [1046.5, 0.55]];
      let at = t;
      for (const [f, d] of seq) { tone(at, f, f, d + 0.05, 'sawtooth', 0.22, { attack: 0.02, lp: true }); tone(at, f * 1.006, f * 1.006, d + 0.05, 'square', 0.07, { attack: 0.02, lp: true }); at += d; }
      noise(at - 0.3, 0.6, 0.16, 3000, 6000);
    },
  };
  function sound(name, arg) {
    if (!soundOn() || document.hidden || !ac || !SOUNDS[name]) return false;
    try { if (ac.state !== 'running') ac.resume(); SOUNDS[name](ac.currentTime + 0.01, arg); return true; } catch (e) { return false; }
  }
  const sfxState = () => ({ on: soundOn(), ctx: ac ? ac.state : (acTried ? 'failed' : 'not yet (needs a tap)'), played });
  const KIND_SOUND = { quest: 'pop', food: 'pop', wait: 'send', ok: 'yes', badge: 'badge', stamp: 'stamp', level: 'fanfare' };

  /* ---------------------------------------------------------------- numbers and floaters */
  function countUp(el, from, to, ms, fmt) {
    if (!el) return;
    if (reduce() || from === to) { el.textContent = fmt ? fmt(to) : String(to); return; }
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3), v = Math.round(from + (to - from) * e);
      el.textContent = fmt ? fmt(v) : String(v);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function floatText(fromEl, text, cls) {
    if (reduce() || !fromEl) return;
    const r = fromEl.getBoundingClientRect(), f = document.createElement('div');
    f.className = 'fx-float ' + (cls || ''); f.textContent = text;
    f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.top + 4) + 'px';
    document.body.appendChild(f); setTimeout(() => f.remove(), 1400);
  }
  function centreOf(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }

  /* ---------------------------------------------------------------- the party card (queued, one at a time) */
  const queue = []; let showing = false, showingKind = null;
  const big = (kind) => /^(level|badge|stamp)$/.test(kind || 'quest');
  function celebrate(o) {
    if (showing && !big(showingKind)) {    // a quick tick on screen gives way to the newcomer; badges, stamps and the level-up show finish first
      const p = document.getElementById('party'); if (p) clearTimeout(p._t);
      queue.unshift(o); showing = false; next(); return;
    }
    queue.push(o); if (!showing && !luOn) next();
  }
  function next() {
    if (luOn) return;                      // the level-up show has the screen; it calls next() again when it ends
    if (luPending.length) { startLevelUp(luPending.shift()); return; }
    const o = queue.shift(); if (!o) { showing = false; showingKind = null; return; }
    showing = true;
    const p = document.getElementById('party'); if (!p) { showing = false; return; }
    const kind = o.kind || 'quest'; showingKind = kind;
    p.innerHTML = `<div class="party-card k-${kind}"><div class="rays"></div><div class="party-e">${o.emoji || '🎉'}</div><div class="party-big">${esc(o.big || '')}</div><div class="party-small">${esc(o.small || '')}</div><div class="party-who">${esc(o.who || '')}</div><div class="shine"></div></div>`;
    p.classList.remove('hidden', 'out'); p.classList.add('show');
    const cx = innerWidth / 2, cy = innerHeight * 0.42;
    if (kind === 'level') { fireworks(PAL.level, 6); cannons(PAL.level, 70); haptic([40, 60, 40, 60, 140]); }
    else if (kind === 'badge' || kind === 'stamp') { stars(cx, cy, PAL[kind], 44); cannons(PAL[kind], 50); if (kind === 'stamp' && o.winter) snow(); haptic([30, 40, 70]); }
    else if (kind === 'ok') { burst(cx, cy, PAL.ok, 80); stars(cx, cy, PAL.badge, 20); haptic([20, 30, 40]); }
    else if (kind === 'wait') { spawn(26, cx, cy, { colors: PAL.wait, angle: -Math.PI / 2, spread: 1.2, speed: 6, gravity: 0.1, shapes: ['circle'], size: 7, life: 70 }); haptic(15); }
    else { burst(cx, cy, PAL[kind] || PAL.quest, 100); haptic(20); }
    if (o.sound !== false) sound(KIND_SOUND[kind] || 'pop');
    if (o.points) countUp(p.querySelector('.party-big'), 0, o.points, 650, (v) => `+${v} points`);
    clearTimeout(p._t);
    p._t = setTimeout(() => hide(p), o.ms || (kind === 'level' ? 4200 : 2700));
    p.onclick = () => hide(p);
  }
  function hide(p) {
    clearTimeout(p._t);
    p.classList.add('out');
    setTimeout(() => { p.classList.add('hidden'); p.classList.remove('out', 'show'); p.innerHTML = ''; showing = false; showingKind = null; next(); }, 220);
  }

  /* ---------------------------------------------------------------- the level-up show (3 Nov 2026)
     o = { who, avatar, from: {idx,name,emoji,colour}, to: {…}, ptsFrom, ptsTo, pctTo, ladder: [[pts,name,emoji,colour]…], next: {name,pts}|null }
     Stages are classes s1…s5 on .lu-card (styles.css animates each); with reduced motion every stage is on at once and
     the show is a still card for 3.5 s. A tap anywhere ends it. Party cards that arrive meanwhile wait their turn. */
  let luOn = false, luTimers = [], luPending = [], luEl = null;
  function levelUp(o) {
    luPending.push(o);
    if (showing && !big(showingKind)) { const p = document.getElementById('party'); if (p) { clearTimeout(p._t); p._t = setTimeout(() => hide(p), 700); } }   // the "+20 points" card flashes, then the show
    else if (!showing && !luOn) next();
  }
  function startLevelUp(o) {
    const el = document.getElementById('levelup'); if (!el || !o || !o.to) { next(); return; }
    luOn = true; luEl = el;
    const still = reduce(), top = o.ladder.length - 1, to = o.to, from = o.from || to, legend = to.idx === top;
    const badge = (lv, cls) => `<i class="lvb ${cls}${lv.idx === top ? ' gold' : ''}" style="--lv:${lv.colour}">${lv.emoji}</i>`;
    const letters = [...String(to.name)].map((ch, i) => `<span style="--r:${i}">${esc(ch)}</span>`).join('');
    const steps = o.ladder.map((l, i) => `<span class="lu-step${i <= to.idx ? ' lit' : ''}${i === to.idx ? ' now' : ''}" style="--r:${i};--lv:${l[3]}" title="${esc(l[1])}"><i>${l[2]}</i><b>${l[0]}</b></span>`).join('');
    el.style.setProperty('--lv', to.colour);
    el.classList.toggle('legend', legend); el.classList.toggle('still', still);
    el.innerHTML = `<div class="lu-card${still ? ' s1 s2 s3 s4 s5' : ''}"><div class="rays"></div><div class="lu-stars"></div>` +
      `<div class="lu-ribbon">LEVEL UP!</div>` +
      `<div class="lu-av"><span class="face"><span class="fe">${o.avatar || '🙂'}</span>${badge(from, 'old')}${badge(to, 'new')}</span><i class="lu-ring"></i></div>` +
      `<div class="lu-who">${esc(o.who || '')}</div><div class="lu-name">${letters}</div>` +
      `<div class="lu-ladder"><i class="lu-line"><b style="width:${still ? Math.round((to.idx / top) * 100) : 0}%"></b></i>${steps}</div>` +
      `<div class="lu-next">${o.next ? `Next: ${esc(o.next.name)} at ${o.next.pts} pts` : 'Top level!'}</div><div class="bar lu-bar"><i style="width:${still ? o.pctTo : 100}%"></i></div>` +
      `<div class="lu-pts">${still ? o.ptsTo : o.ptsFrom} points</div><div class="shine"></div></div>`;
    el.classList.remove('hidden', 'out'); el.classList.add('show');
    el.onclick = () => endLevelUp();
    const card = el.querySelector('.lu-card'), cols = [to.colour, '#FFFFFF', '#FFD24D', PAL.level[0], PAL.level[2], PAL.level[3]];
    const at = (ms, fn) => luTimers.push(setTimeout(fn, ms));
    sound('boom'); haptic([60, 40, 120]);
    if (still) { sound('fanfare', legend); at(3500, endLevelUp); return; }
    const shake = (sel) => { const n = document.querySelector(sel); if (n) { n.classList.add('quake'); setTimeout(() => n.classList.remove('quake'), 600); } };
    shake('#main'); shake('#top');
    at(150, () => card.classList.add('s1'));
    at(800, () => {
      card.classList.add('s2');
      const av = el.querySelector('.lu-av'); if (av) { const [x, y] = centreOf(av); stars(x, y, cols, 40); sparkle(x, y, PAL.badge); }
      sound('fanfare', legend);
    });
    at(1300, () => { card.classList.add('s3'); fireworks(cols, legend ? 10 : 8); cannons(cols, 80); haptic([30, 40, 30, 40, 160]); });
    at(2200, () => { card.classList.add('s4'); const line = el.querySelector('.lu-line b'); if (line) line.style.width = Math.round((to.idx / top) * 100) + '%'; });
    at(2600, () => {
      card.classList.add('s5');
      const bar = el.querySelector('.lu-bar i'); if (bar) bar.style.width = o.pctTo + '%';
      countUp(el.querySelector('.lu-pts'), o.ptsFrom, o.ptsTo, 900, (v) => `${v} points`);
      rain(to.emoji, legend ? 60 : 40);
    });
    at(legend ? 8500 : 7000, endLevelUp);
  }
  function endLevelUp() {
    if (!luOn) return;
    luTimers.forEach(clearTimeout); luTimers = [];
    const el = luEl, av = el && el.querySelector('.lu-av .face'), pill = document.getElementById('btn-points');
    if (av && pill && !reduce() && pill.offsetParent) {     // the face flies up to the header pill, which bumps and pops its badge
      const [x0, y0] = centreOf(av), [x1, y1] = centreOf(pill), fly = document.createElement('div');
      fly.className = 'lu-fly'; fly.innerHTML = av.outerHTML; fly.querySelectorAll('.lvb.old').forEach((n) => n.remove());
      fly.style.left = x0 + 'px'; fly.style.top = y0 + 'px'; document.body.appendChild(fly); void fly.offsetWidth;
      fly.style.left = x1 + 'px'; fly.style.top = y1 + 'px'; fly.style.fontSize = '1em';
      setTimeout(() => { fly.remove(); pulse(pill, 'bump', 700); const b = document.querySelector('#top-face .lvb'); if (b) { b.classList.add('new'); setTimeout(() => b.classList.remove('new'), 2000); } }, 470);
    }
    el.classList.add('out');
    setTimeout(() => { el.classList.add('hidden'); el.classList.remove('out', 'show', 'legend', 'still'); el.innerHTML = ''; luOn = false; luEl = null; next(); }, 300);
  }

  /* ---------------------------------------------------------------- element animations (class helpers) */
  function pulse(el, cls, ms) { if (!el || reduce()) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms || 900); }
  function revealAll(els, fn) {       // stagger: slam each element in, sparkles at its centre
    els.forEach((el, i) => {
      el.style.setProperty('--r', i); el.classList.add('reveal');
      if (!reduce()) setTimeout(() => { const [x, y] = centreOf(el); sparkle(x, y); if (fn) fn(el, i); }, 160 + i * 180);
    });
  }

  function setPref(v) { if (v === 'on' || v === 'off') localStorage.setItem('fx', v); else localStorage.removeItem('fx'); applyPref(); }
  const pref = () => localStorage.getItem('fx') || 'auto';
  function demo() {                    // Settings → Show me: the level-up show for the active player's face (Navigator → Globetrotter)
    const L = (window.Quests && Quests.LEVELS) || [[0, 'Rookie', '🥾', '#8D99AE'], [100, 'Explorer', '🗺️', '#2A9D8F'], [250, 'Adventurer', '🎒', '#FF7A00'], [500, 'Navigator', '🧭', '#3A86FF'], [900, 'Globetrotter', '🌏', '#06D6A0'], [1500, 'Legend', '👑', '#FFB703']];
    const lv = (i) => ({ idx: i, name: L[i][1], emoji: L[i][2], colour: L[i][3] });
    let avatar = '🙂', who = 'Everyone';
    try { const st = Quests.state(); avatar = Quests.view(st, st.active).avatar; who = Quests.label(st.active); } catch (e) { /* before unlock */ }
    levelUp({ who, avatar, from: lv(3), to: lv(4), ptsFrom: 880, ptsTo: 920, pctTo: 3, ladder: L, next: { name: L[5][1], pts: L[5][0] } });
  }

  return { celebrate, levelUp, burst, cannons, fireworks, stars, sparkle, snow, rain, haptic, countUp, floatText, pulse, revealAll, reduce, centreOf, PAL, setPref, pref, demo,
    sound, soundOn, setSound, sfxState };
})();
