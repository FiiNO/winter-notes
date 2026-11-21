/* World Adventure: the trip book (21 Nov 2026).
   One file to keep when the trip is over: every postcard with its pictures and replies, day by day, then everyone's
   scores, badges, quests and new foods. It is made on the phone from what the app already holds, opens in any browser
   with nothing else needed, and prints as a book (Print, then Save as PDF). Nothing is uploaded anywhere.
   Pictures go in as they are kept for the board (already shrunk), each handed to the browser as its own piece so a
   long trip does not have to sit in memory as one enormous string. */
'use strict';
window.TripBook = (() => {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl = (s) => esc(s).replace(/\n/g, '<br>');
  const dateLong = (iso) => { try { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return iso; } };
  const isEmojiOnly = (t) => { const s = String(t || '').trim(); return !!s && s.length <= 8 && !/[A-Za-z0-9]/.test(s); };
  async function picture(id, kind) {                  // a data: address for one picture, or null when it is not to be had
    try {
      const u = await Media.url(id, kind); if (!u) return null;
      const b = await (await fetch(u)).blob();
      return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); });
    } catch (e) { return null; }
  }
  const CSS = `
  :root { --ink: #1B1B2F; --muted: #5F6B7A; --line: #E6DCCD; --paper: #FFFDF8; --accent: #0A6159; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #F3EBDD; color: var(--ink); font: 16px/1.5 Georgia, "Times New Roman", serif; }
  main { max-width: 820px; margin: 0 auto; padding: 24px 16px 60px; }
  h1, h2, h3 { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.2; margin: 0; }
  .cover { text-align: center; padding: 70px 20px; background: var(--paper); border: 1px solid var(--line); border-radius: 18px; margin-bottom: 28px; }
  .cover .globe { font-size: 72px; line-height: 1; }
  .cover h1 { font-size: 44px; margin: 14px 0 6px; }
  .cover .sub { color: var(--muted); font-size: 18px; }
  .cover .faces { font-size: 40px; margin-top: 22px; letter-spacing: 8px; }
  .cover .totals { margin-top: 18px; color: var(--muted); font: 14px system-ui, sans-serif; }
  .day { margin: 34px 0 0; }
  .day > h2 { font-size: 22px; padding-bottom: 6px; border-bottom: 3px solid var(--accent); }
  .day > h2 small { display: block; font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
  .day .plan { color: var(--muted); font-size: 14px; margin: 6px 0 0; font-style: italic; }
  .card { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; margin: 14px 0; break-inside: avoid; page-break-inside: avoid; }
  .card .who { font: 700 14px system-ui, sans-serif; color: var(--muted); }
  .card .who .face { font-size: 22px; vertical-align: -3px; margin-right: 6px; }
  .card .q { font: italic 14px Georgia, serif; color: var(--accent); margin-top: 8px; }
  .card .words { font: 19px/1.55 "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive; margin: 8px 0 0; overflow-wrap: anywhere; }
  .pics { display: flex; flex-wrap: wrap; margin: 12px -5px 0; }
  .pics img { flex: 1 1 220px; max-width: 100%; min-width: 0; max-height: 420px; object-fit: contain; margin: 5px; border-radius: 8px; background: #fff; border: 6px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.18); }
  .pics .gone { flex: 1 1 220px; margin: 5px; padding: 30px 10px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 8px; font: 13px system-ui, sans-serif; }
  .replies { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--line); font: 14px/1.45 system-ui, sans-serif; }
  .replies .r { margin: 4px 0; } .replies .r b { margin-right: 4px; }
  .replies img { display: block; max-width: 260px; max-height: 260px; margin: 6px 0; border-radius: 8px; }
  .hearts { font-size: 18px; }
  .scores { margin-top: 44px; break-before: page; page-break-before: always; }
  .scores > h2 { font-size: 26px; margin-bottom: 10px; }
  .player { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 16px 20px; margin: 14px 0; font: 15px/1.45 system-ui, sans-serif; break-inside: avoid; page-break-inside: avoid; }
  .player h3 { font-size: 20px; } .player h3 .face { font-size: 30px; vertical-align: -5px; margin-right: 8px; }
  .player .lv { color: var(--muted); margin: 2px 0 10px; }
  .player h4 { margin: 12px 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); }
  .chips span { display: inline-block; margin: 0 6px 6px 0; padding: 3px 10px; border-radius: 999px; background: #F3EBDD; }
  .player ul { margin: 0; padding-left: 20px; columns: 2; column-gap: 26px; } .player li { break-inside: avoid; }
  footer { margin-top: 40px; text-align: center; color: var(--muted); font: 12px system-ui, sans-serif; }
  @media (max-width: 600px) { .cover h1 { font-size: 32px; } .player ul { columns: 1; } }
  @media print { body { background: #fff; } main { max-width: none; padding: 0; } .cover { border: 0; padding-top: 120px; break-after: page; page-break-after: always; } .card, .player { border-color: #ccc; } @page { margin: 14mm; } }
  `;
  async function make(onProgress) {
    const F = S.family, T = F.trip || {}, data = Journal.book(), posts = data.posts, cmts = data.cmts;
    const st = Quests.state(), players = ((T.people && T.people.length ? T.people : Quests.visiblePlayers()) || []).filter((p) => p !== 'Grandparents');
    const views = players.map((p) => Quests.view(st, p));
    const face = (p) => { const i = players.indexOf(p); return i >= 0 ? views[i].avatar : p === 'Grandparents' ? '👵👴' : '🙂'; };
    const allPics = posts.reduce((n, po) => n + (po.media || []).length + (cmts[po.id] || []).filter((c) => c.media).length, 0);
    let done = 0; const tick = () => { done++; if (onProgress) onProgress(done, allPics); };
    const parts = [], put = (html) => parts.push(html);
    const title = `World Adventure ${String(T.start || '').slice(0, 4)}`;
    put(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}: the trip book</title><style>${CSS}</style></head><body><main>`);
    put(`<section class="cover"><div class="globe">🌏</div><h1>${esc(title)}</h1><div class="sub">${esc(dateLong(T.start))} to ${esc(dateLong(T.end))}</div><div class="faces">${views.map((v) => esc(v.avatar)).join('')}</div><div class="totals">${F.days.length} days · ${posts.length} postcard${posts.length === 1 ? '' : 's'} · ${allPics} picture${allPics === 1 ? '' : 's'}</div></section>`);
    const byDay = {}; for (const po of posts) (byDay[po.d] = byDay[po.d] || []).push(po);
    const dates = F.days.map((d) => d.date);
    for (const d of Object.keys(byDay).sort()) if (dates.indexOf(d) < 0) dates.push(d);   // a postcard for a day outside the plan still goes in
    dates.sort();
    for (const date of dates) {
      const day = F.days.find((x) => x.date === date), cards = byDay[date] || [];
      if (!cards.length) continue;                       // the book is the days that were written about
      const n = day ? F.days.indexOf(day) + 1 : 0, city = day ? Quests.dayCity(day) : '';
      put(`<section class="day"><h2><small>${n ? `Day ${n} of ${F.days.length}` : 'Before or after the trip'}${city ? ' · ' + esc(city === 'Air' ? 'In the air' : city) : ''}</small>${esc(dateLong(date))}</h2>${day && day.plan ? `<p class="plan">${esc(String(day.plan).split('\n')[0])}</p>` : ''}`);
      for (const po of cards) {
        put(`<article class="card"><div class="who"><span class="face">${esc(face(po.p))}</span>${esc(Quests.label(po.p))}${po.mood ? ' · ' + esc(po.mood) : ''}</div>${po.q ? `<div class="q">${esc(po.q)}</div>` : ''}<div class="words">Dear ${esc(window.Postcard ? Postcard.toOf(po) : 'Grandma and Grandpa')},<br>${nl(po.text || '')}</div>`);
        if ((po.media || []).length) {
          put('<div class="pics">');
          for (const m of po.media) { const u = await picture(m.id, m.k === 'drawing' ? 'drawing' : 'photo'); put(u ? new Blob([`<img alt="" src="`, u, `">`]) : '<div class="gone">a picture that is not on this phone</div>'); tick(); }
          put('</div>');
        }
        const cm = (cmts[po.id] || []).filter((c) => !c.seen).slice().sort((a, b) => (a.t || 0) - (b.t || 0));
        const hearts = cm.filter((c) => !c.media && isEmojiOnly(c.text)), said = cm.filter((c) => hearts.indexOf(c) < 0);
        if (cm.length) {
          put('<div class="replies">');
          if (hearts.length) put(`<div class="r hearts">${hearts.map((c) => esc(c.text.trim())).join(' ')} <span style="font-size:13px;color:#5F6B7A">${esc([...new Set(hearts.map((c) => Quests.label(c.p)))].join(', '))}</span></div>`);
          for (const c of said) {
            put(`<div class="r"><b>${esc(Quests.label(c.p))}:</b>${nl(c.text || '')}`);
            if (c.media) { const u = await picture(c.media.id, c.media.k === 'drawing' ? 'drawing' : 'photo'); if (u) put(new Blob([`<img alt="" src="`, u, `">`])); tick(); }
            put('</div>');
          }
          put('</div>');
        }
        put('</article>');
      }
      put('</section>');
    }
    if (!posts.length) put('<section class="day"><p class="plan">No postcards were written on this trip (yet).</p></section>');
    /* the scores */
    const ctx = currentContext(), byId = {}; for (const q of Quests.QUESTS) byId[q.id] = q;
    put(`<section class="scores"><h2>🏆 Quests and scores</h2>`);
    views.forEach((pl, i) => {
      const pts = Quests.points(pl), lv = Quests.level(pts), bd = Quests.badges(pl, ctx).filter((b) => b.earned);
      const done2 = Object.keys(pl.done).filter((id) => byId[id]).map((id) => ({ q: byId[id], n: pl.done[id].length, first: pl.done[id].slice().sort()[0] })).sort((a, b) => (a.first < b.first ? -1 : 1));
      put(`<div class="player"><h3><span class="face">${esc(pl.avatar)}</span>${esc(Quests.label(players[i]))}</h3><div class="lv">${esc(lv.emoji)} ${esc(lv.name)} · ${pts} points</div>` +
        (bd.length ? `<h4>Badges (${bd.length})</h4><div class="chips">${bd.map((b) => `<span>${esc(b.e)} ${esc(b.t)}</span>`).join('')}</div>` : '') +
        (done2.length ? `<h4>Quests done (${done2.length})</h4><ul>${done2.map((x) => `<li>${esc(x.q.e)} ${esc(x.q.t)}${x.n > 1 ? ` × ${x.n}` : ''}</li>`).join('')}</ul>` : '') +
        (pl.foods.length ? `<h4>New foods tried (${pl.foods.length})</h4><div class="chips">${pl.foods.map((f) => `<span>${esc(f.what || 'Something new')}</span>`).join('')}</div>` : '') + `</div>`);
    });
    put(`</section><footer>Made on ${esc(dateLong(new Date().toISOString().slice(0, 10)))} by World Adventure ${esc(document.body.dataset.version || '')}. To print it as a book: Print, then Save as PDF.</footer></main></body></html>`);
    return new File(parts, `world-adventure-trip-book-${String(T.start || '').slice(0, 4) || 'trip'}.html`, { type: 'text/html' });
  }
  return { make };
})();
