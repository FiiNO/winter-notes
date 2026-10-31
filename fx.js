/* Travel Dossier effects (31 Oct 2026): the celebration layer for quests, stamps, badges, approvals and level-ups.
   One full-screen canvas for particles (confetti cannons, fireworks, star bursts, sparkles) and a party card with
   rays, a shine sweep, a counting score and a short haptic. Everything respects prefers-reduced-motion (no particles,
   no motion, the card still appears). No library, no network. Loaded before quests.js; nothing here reads trip data. */
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
        vr: (Math.random() - 0.5) * 0.35, color: colors[i % colors.length], shape: shapes[i % shapes.length], wob: Math.random() * 6.28, flip: 0.6 + Math.random() * 0.8 });
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
      if (p.shape !== 'circle' && p.shape !== 'star') ctx.scale(1, Math.abs(Math.cos(p.t * 0.1 * p.flip)) * 0.8 + 0.2);   // tumbling paper
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
  function haptic(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not supported */ } }

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
  const queue = []; let showing = false;
  const big = (o) => /^(level|badge|stamp)$/.test(o.kind || 'quest');
  function celebrate(o) {
    if (showing && !big(o)) {           // quick ticks replace the card on screen; level-ups and badges wait their turn
      const p = document.getElementById('party'); if (p) clearTimeout(p._t);
      queue.unshift(o); showing = false; next(); return;
    }
    queue.push(o); if (!showing) next();
  }
  function next() {
    const o = queue.shift(); if (!o) { showing = false; return; }
    showing = true;
    const p = document.getElementById('party'); if (!p) { showing = false; return; }
    const kind = o.kind || 'quest';
    p.innerHTML = `<div class="party-card k-${kind}"><div class="rays"></div><div class="party-e">${o.emoji || '🎉'}</div><div class="party-big">${esc(o.big || '')}</div><div class="party-small">${esc(o.small || '')}</div><div class="party-who">${esc(o.who || '')}</div><div class="shine"></div></div>`;
    p.classList.remove('hidden', 'out'); p.classList.add('show');
    const cx = innerWidth / 2, cy = innerHeight * 0.42;
    if (kind === 'level') { fireworks(PAL.level, 6); cannons(PAL.level, 70); haptic([40, 60, 40, 60, 140]); }
    else if (kind === 'badge' || kind === 'stamp') { stars(cx, cy, PAL[kind], 44); cannons(PAL[kind], 50); if (kind === 'stamp' && o.winter) snow(); haptic([30, 40, 70]); }
    else if (kind === 'ok') { burst(cx, cy, PAL.ok, 80); stars(cx, cy, PAL.badge, 20); haptic([20, 30, 40]); }
    else if (kind === 'wait') { spawn(26, cx, cy, { colors: PAL.wait, angle: -Math.PI / 2, spread: 1.2, speed: 6, gravity: 0.1, shapes: ['circle'], size: 7, life: 70 }); haptic(15); }
    else { burst(cx, cy, PAL[kind] || PAL.quest, 100); haptic(20); }
    if (o.points) countUp(p.querySelector('.party-big'), 0, o.points, 650, (v) => `+${v} points`);
    clearTimeout(p._t);
    p._t = setTimeout(() => hide(p), o.ms || (kind === 'level' ? 4200 : 2700));
    p.onclick = () => hide(p);
  }
  function hide(p) {
    clearTimeout(p._t);
    p.classList.add('out');
    setTimeout(() => { p.classList.add('hidden'); p.classList.remove('out', 'show'); p.innerHTML = ''; next(); }, 220);
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
  function demo() { celebrate({ emoji: '🎉', big: 'Like this!', small: 'Confetti, stamps and level-ups', who: 'Everyone', kind: 'level', ms: 3200 }); }

  return { celebrate, burst, cannons, fireworks, stars, sparkle, snow, haptic, countUp, floatText, pulse, revealAll, reduce, centreOf, PAL, setPref, pref, demo };
})();
