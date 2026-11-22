/* World Adventure: Tickets (22 Nov 2026). Andy: "we need to load the tickets into the app."
   Every code a gate, a conductor or a border officer will scan, in date order, one tap from Home on Mum's and Dad's phones.
   The pictures come from tickets.enc, which the build seals under the Vault key: a scannable code is a bearer ticket, so
   it must not sit in the family blob that the kids' tablet and the grandparents' phone can open. The Vault PIN opens it,
   it locks with the Vault (5 minutes, or when the app is hidden), and nothing decrypted stays in the page once it locks.
   Written in the same dialect as app.js (no optional chaining), and it never names a venue: every word shown comes out of
   the sealed pack. */
window.Tickets = (() => {
  let T = null;            // the decrypted pack: { tickets: [...], pics: { name: base64 } }, memory only
  let wake = null;         // screen wake lock while a code is on show
  const el = () => $('#screen-tickets');
  const visible = () => !settings.readerMode && !Quests.isGrandDevice() && (!Quests.role() || Quests.isParentDevice());
  const viewer = () => document.querySelector('#modal-inner .tix-view');
  const src = (name) => (T && T.pics[name] ? 'data:image/png;base64,' + T.pics[name] : '');

  function releaseWake() { if (wake) { try { wake.release(); } catch (e) { /* already gone */ } wake = null; } }
  function holdWake() {
    if (wake || !navigator.wakeLock) return;
    try { navigator.wakeLock.request('screen').then((w) => { wake = w; if (!viewer()) releaseWake(); }, () => {}); } catch (e) { /* not offered here */ }
  }
  window.addEventListener('popstate', () => setTimeout(() => { if (!viewer()) releaseWake(); }, 0));

  /* Called by lockVault(): forget the pack, close a code that is on show, put the lock back on the screen. */
  function lock() {
    T = null; releaseWake();
    if (viewer()) closeModal();
    const e = el(); if (!e) return;
    e.innerHTML = '';
    if (S.screen === 'tickets') render();
  }

  async function render() {
    const e = el(); if (!e) return;
    if (!visible()) { e.innerHTML = `<h1 class="h1">🎟️ Tickets</h1><div class="card">Tickets open on Mum's and Dad's phones only.</div>`; return; }
    if (!S.vault) { T = null; return vaultGate(e, '🎟️ Tickets', 'Open tickets', 'The codes sit behind the Vault PIN.', render); }
    armVaultLock();
    if (!T) {
      e.innerHTML = `<h1 class="h1">🎟️ Tickets</h1><div class="card centre muted">Opening…</div>`;
      let env;
      try { env = await loadEnvelope('tickets'); }
      catch (x) { e.innerHTML = `<h1 class="h1">🎟️ Tickets <span class="chip red">locks in 5 min</span></h1><button class="btn block" id="tix-lock">Lock now</button><div class="card">No tickets are loaded in this build yet. They arrive with the next update from the computer at home.</div><div id="vault-docs"></div>`; $('#tix-lock').onclick = lockVault; own(e); return; }
      try { T = await decryptWith(await kvGet('key:vault'), env); }
      catch (x) { e.innerHTML = `<h1 class="h1">🎟️ Tickets</h1><div class="card red">This ticket pack was sealed with a different Vault passphrase from the one this phone holds. Rebuild the app on the computer, then update here.</div>`; return; }
      if (!S.vault) { T = null; return render(); }   // it locked while the pack was opening
    }
    draw(e);
  }

  /* What the family adds from the phone (vaultdocs.js: a boarding pass screenshot at check-in, a PDF) sits under the pack:
     one place for everything that gets scanned, behind the one lock. Merged in for v58. */
  function own(e) { const box = e.querySelector('#vault-docs'); if (box && window.VaultDocs) VaultDocs.render(box); }

  function card(t, next, past) {
    const codes = t.codes || [];
    const btns = codes.map((c, i) => `<button class="tix-code" data-t="${esc(t.id)}" data-i="${i}"><span class="tc-ico">▦</span><span class="tc-who">${esc(c.who)}</span>${c.sub ? `<span class="tc-sub">${esc(c.sub)}</span>` : ''}</button>`).join('');
    return `<div class="card tix${next ? ' today-now' : ''}${past ? ' past' : ''}">
      <div class="tix-head"><span class="tix-ico">${esc(t.icon || '🎟️')}</span><div class="tix-tt"><div class="tix-title">${esc(t.title)}${next ? ' <span class="chip red">next</span>' : ''}</div><div class="small"><b>${esc(fmtDate(t.date))}</b> · ${esc(t.time || '')}</div><div class="small muted">${esc(t.place || '')}</div></div></div>
      ${codes.length ? `<div class="tix-codes${codes.length === 1 ? ' one' : ''}">${btns}</div>` : `<div class="tix-none">No code to scan from here</div>`}
      <ul class="list small tix-lines">${(t.lines || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
  }

  function draw(e) {
    const today = currentContext().date || '';
    const all = (T.tickets || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const ahead = all.filter((t) => t.date >= today), past = all.filter((t) => t.date < today);
    const todays = ahead.filter((t) => t.date === today);
    let html = `<h1 class="h1">🎟️ Tickets <span class="chip red">locks in 5 min</span></h1>
      <button class="btn block" id="tix-lock">Lock now</button>
      <p class="small muted">Tap a name to show its code full screen. Screen brightness right up before you reach the gate.</p>`;
    if (todays.length) html += `<div class="h2">Today</div>` + todays.map((t) => card(t, false, false)).join('');
    const later = ahead.filter((t) => t.date !== today);
    if (later.length) html += `<div class="h2">${todays.length ? 'Coming up' : 'Next up'}</div>` + later.map((t, i) => card(t, !todays.length && i === 0, false)).join('');
    if (past.length) html += `<div class="h2">Earlier</div>` + past.reverse().map((t) => card(t, false, true)).join('');
    if (!all.length) html += `<div class="card">The pack is empty.</div>`;
    html += `<div id="vault-docs"></div>`;
    html += `<p class="tiny muted">Pack made ${esc(T.made || '')}${T.meta ? ' · sealed in ' + esc(T.meta.label || '') : ''}. A boarding pass issued at check-in goes in the phone wallet, or add a screenshot of it above.</p>`;
    e.innerHTML = html;
    own(e);
    $('#tix-lock').onclick = lockVault;
    e.querySelectorAll('.tix-code').forEach((b) => b.onclick = () => open(b.dataset.t, +b.dataset.i, false));
  }

  /* One code, as big as the screen allows, on white whatever the theme. ◀ ▶ (or a swipe) walk through the family. */
  function open(id, i, whole) {
    if (!T || !S.vault) return render();
    const t = (T.tickets || []).filter((x) => x.id === id)[0]; if (!t || !t.codes.length) return;
    const n = t.codes.length; i = ((i % n) + n) % n;
    const c = t.codes[i], showWhole = !!(whole && c.page);
    const body = `<div class="tix-view">
      <div class="tix-vh"><div class="tix-title">${esc(t.icon || '')} ${esc(t.title)}</div><div class="small muted">${esc(fmtDate(t.date))} · ${esc(t.time || '')}</div></div>
      <div class="tix-who"><b>${esc(c.who)}</b>${c.sub ? ` <span>${esc(c.sub)}</span>` : ''}</div>
      <div class="tix-panel${showWhole ? ' whole' : ''}" id="tix-panel"><img alt="${showWhole ? 'The whole ticket' : 'The code to scan'}" src="${src(showWhole ? c.page : c.code)}"></div>
      ${n > 1 ? `<div class="tix-nav"><button class="btn" id="tix-prev" aria-label="Previous">◀</button><span class="tix-count">${i + 1} of ${n}</span><button class="btn primary" id="tix-next" aria-label="Next">Next ▶</button></div>` : ''}
      ${c.page ? `<button class="btn block" id="tix-flip">${showWhole ? 'Just the code' : 'Show the whole ticket'}</button>` : ''}
      <p class="tiny muted centre">Brightness up · hold it flat and still, a hand's width from the reader</p></div>`;
    if (viewer()) { const keep = $('#modal-close'); $('#modal-inner').innerHTML = ''; $('#modal-inner').appendChild(keep); $('#modal-inner').insertAdjacentHTML('beforeend', body); }
    else openModal(body);
    $('#modal-close').onclick = () => { releaseWake(); closeModal(); };
    holdWake();
    const go = (d) => open(id, i + d, false);
    if (n > 1) { $('#tix-prev').onclick = () => go(-1); $('#tix-next').onclick = () => go(1); }
    const flip = $('#tix-flip'); if (flip) flip.onclick = () => open(id, i, !showWhole);
    const panel = $('#tix-panel'); let x0 = null;
    panel.addEventListener('touchstart', (ev) => { x0 = ev.touches[0].clientX; }, { passive: true });
    panel.addEventListener('touchend', (ev) => { if (x0 === null || n < 2 || showWhole) return; const dx = ev.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); }, { passive: true });
    window.scrollTo(0, 0); $('#modal').scrollTop = 0;
  }

  return { render, lock, visible };
})();
