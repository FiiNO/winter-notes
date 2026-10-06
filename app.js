/* Mission Dossier app (Build Plan v2, Phase 3: everything except the live map).
   Plain JS, no libraries, no network requests except this origin (app files, the two blobs, version.json).
   Crypto: WebCrypto PBKDF2-SHA256 (600,000 iterations) -> AES-256-GCM, matching build.py's encrypt_blob.
   Keys are stored as NON-extractable CryptoKeys in IndexedDB after the passphrase is typed once on a device;
   a 4-digit PIN (hashed with PBKDF2 + a device salt, never stored in clear) gates their use. Five wrong PINs wipe
   the stored key for that edition, so the passphrase is needed again. Decrypted content lives in memory only. */
'use strict';

const VERSION = document.body.dataset.version;
const BUILT = document.body.dataset.built;
const PIN_ITER = 150000, PIN_MAX_TRIES = 5, VAULT_LOCK_MS = 5 * 60 * 1000;
const TZ = { 'Vancouver': 'America/Vancouver', 'Whistler': 'America/Vancouver', 'Toronto': 'America/Toronto',
  'Montréal': 'America/Toronto', 'Montreal': 'America/Toronto', 'New York': 'America/New_York', 'Tokyo': 'Asia/Tokyo',
  'Nagoya': 'Asia/Tokyo', 'Home': 'Australia/Brisbane' };
const COUNTRY = { 'Vancouver': 'CA', 'Whistler': 'CA', 'Toronto': 'CA', 'Montréal': 'CA', 'Montreal': 'CA', 'New York': 'US', 'Tokyo': 'JP', 'Nagoya': 'JP' };
const EMERGENCY_NUMBER = { CA: '911', US: '911', JP: '119', AU: '000' };
const POLICE_NUMBER = { CA: '911', US: '911', JP: '110', AU: '000' };

const S = { family: null, vault: null, screen: 'today', vaultTimer: null, pendingPassphraseFor: null };
const settings = {
  get theme() { return localStorage.getItem('theme') || 'auto'; }, set theme(v) { localStorage.setItem('theme', v); applyTheme(); },
  get readerMode() { return localStorage.getItem('readerMode') === '1'; }, set readerMode(v) { localStorage.setItem('readerMode', v ? '1' : '0'); },
  get autoFamily() { return localStorage.getItem('autoFamily') === '1'; }, set autoFamily(v) { localStorage.setItem('autoFamily', v ? '1' : '0'); },
};

/* ------------------------------------------------------------------ tiny DOM helpers */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PHONE_RE = /(?<![\w#])(\+\d[\d\s\-]{7,}\d|(?:1[\s\-])?\(?\d{3}\)?[\s\-]\d{3}[\s\-]\d{4}|1\d{3}[\s\-]\d{3}[\s\-]\d{4}|0\d{1,4}(?:[\s\-]\d{2,4}){2,3}|911|811|311|110|119|000)(?![\w\-])/g;
function tel(text) {
  return esc(text).replace(PHONE_RE, (m) => {
    let d = m.replace(/[^\d+]/g, '');
    if (!d.startsWith('+') && (d.length === 10 || d.length === 11) && /^[1-9(]/.test(m.trim())) d = '+1' + d.slice(-10);
    return `<a href="tel:${d}">${m}</a>`;
  });
}
const nl = (s) => esc(s).replace(/\n/g, '<br>');
function kv(rows) {
  return '<div class="kv">' + rows.filter((r) => r[1] !== undefined && r[1] !== null && String(r[1]) !== '').map(([k, v, raw]) =>
    `<div class="k">${esc(k)}</div><div class="v">${raw ? v : tel(v)}</div>`).join('') + '</div>';
}
function mapsLink(lat, lon, label) {
  if (lat == null || lat === '') return '';
  const q = `${lat},${lon}`;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const links = [`<a class="btn" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Google Maps</a>`];
  if (ios) links.push(`<a class="btn" href="https://maps.apple.com/?ll=${q}&q=${encodeURIComponent(label || 'Here')}" target="_blank" rel="noopener">Apple Maps</a>`);
  else links.push(`<a class="btn" href="geo:${q}?q=${q}(${encodeURIComponent(label || 'Here')})">Maps app</a>`);
  return `<div class="row">${links.join('')}</div>`;
}
function coordLine(c) { return c && c.lat != null && c.lat !== '' ? `${(+c.lat).toFixed(5)}, ${(+c.lon).toFixed(5)}` : ''; }
function show(screen) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
  const el = $('#screen-' + screen);
  if (el) el.classList.remove('hidden');
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.screen === screen || (b.dataset.screen === 'more' && ['protocols', 'vault', 'settings'].includes(screen))));
  S.screen = screen;
  window.scrollTo(0, 0);
  if (screen === 'vault') renderVault();
  if (screen === 'settings') renderSettings();
}
function openModal(html) { $('#modal-inner').innerHTML = `<button class="btn close" id="modal-close">Close</button>${html}`; $('#modal').classList.remove('hidden'); $('#modal-close').onclick = closeModal; }
function closeModal() { $('#modal').classList.add('hidden'); $('#modal-inner').innerHTML = ''; }
function applyTheme() { const t = settings.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }

/* ------------------------------------------------------------------ dates and time zones */
function localDate(tz, d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function localTime(tz, d = new Date()) { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d); }
function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso + 'T12:00:00Z'); return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
function tzOf(city) { return TZ[city] || TZ.Home; }
function currentStay(now = new Date()) {
  for (const s of S.family.stays) {
    const ld = localDate(tzOf(s.city), now);
    if (s.checkin_date <= ld && ld < s.checkout_date) return s;
  }
  return null;
}
function currentContext(now = new Date()) {
  const stay = currentStay(now);
  if (stay) return { stay, city: stay.city, tz: tzOf(stay.city), country: COUNTRY[stay.city] || 'CA', date: localDate(tzOf(stay.city), now) };
  const first = S.family.stays[0];
  const homeDate = localDate(TZ.Home, now);
  if (homeDate < first.checkin_date) return { stay: null, city: 'Home', tz: TZ.Home, country: 'AU', date: homeDate, before: true };
  // travel day without a bed (30 Dec in the air) or after the trip
  const next = S.family.stays.find((s) => s.checkin_date >= localDate(TZ.Home, now));
  const city = next ? next.city : 'Home';
  return { stay: null, city, tz: tzOf(city), country: COUNTRY[city] || 'AU', date: localDate(tzOf(city), now), inAir: !!next };
}
function nextMove(ctx) {
  const today = ctx.date;
  const nowT = localTime(ctx.tz);
  return S.family.moves.find((m) => m.date > today || (m.date === today && (m.depart || '99:99').replace('~', '') > nowT)) || null;
}

/* ------------------------------------------------------------------ IndexedDB key store */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('dossier', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kvGet(k) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); }
async function kvSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); }
async function kvDel(k) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').delete(k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); }

/* ------------------------------------------------------------------ crypto */
const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64e = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function loadEnvelope(edition) { const r = await fetch(`./${edition}.enc`); if (!r.ok) throw new Error(`${edition}.enc not found`); return r.json(); }
async function deriveKey(passphrase, env) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(env.salt), iterations: env.iter }, base,
    { name: 'AES-GCM', length: 256 }, false, ['decrypt']);   // non-extractable: it can be stored, never read out
}
async function decryptWith(key, env) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(env.iv) }, key, b64d(env.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function pinHash(pin, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return b64e(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PIN_ITER }, base, 256));
}
async function setPin(edition, pin) { const salt = crypto.getRandomValues(new Uint8Array(16)); await kvSet('pin:' + edition, { salt, hash: await pinHash(pin, salt), tries: 0 }); }
async function checkPin(edition, pin) {
  const rec = await kvGet('pin:' + edition);
  if (!rec) return 'nopin';
  if ((await pinHash(pin, rec.salt)) === rec.hash) { rec.tries = 0; await kvSet('pin:' + edition, rec); return 'ok'; }
  rec.tries = (rec.tries || 0) + 1;
  if (rec.tries >= PIN_MAX_TRIES) { await kvDel('pin:' + edition); await kvDel('key:' + edition); return 'wiped'; }
  await kvSet('pin:' + edition, rec);
  return `wrong:${PIN_MAX_TRIES - rec.tries}`;
}
async function forgetDevice() {
  for (const k of ['key:family', 'key:vault', 'pin:family', 'pin:vault']) await kvDel(k);
  localStorage.clear();
  location.reload();
}

/* ------------------------------------------------------------------ unlock flow (family) */
const ui = { sub: $('#unlock-sub'), fpp: $('#form-passphrase'), fset: $('#form-setpin'), fpin: $('#form-pin'), err: $('#unlock-error') };
function unlockMode(mode, msg) {
  [ui.fpp, ui.fset, ui.fpin].forEach((f) => f.classList.add('hidden'));
  ui.err.classList.add('hidden');
  if (mode === 'passphrase') ui.fpp.classList.remove('hidden');
  if (mode === 'setpin') ui.fset.classList.remove('hidden');
  if (mode === 'pin') { ui.fpin.classList.remove('hidden'); setTimeout(() => $('#pin').focus(), 50); }
  ui.sub.textContent = msg || '';
}
function unlockError(msg) { ui.err.textContent = msg; ui.err.classList.remove('hidden'); }

async function startFamily() {
  const env = await loadEnvelope('family');
  S.familyEnv = env;
  const key = await kvGet('key:family');
  const pinRec = await kvGet('pin:family');
  if (key && (settings.autoFamily || !pinRec)) {
    try { S.family = await decryptWith(key, env); return enterApp(); } catch (e) { await kvDel('key:family'); }
  }
  if (key && pinRec) { unlockMode('pin', 'Family view'); $('#pin-hint').textContent = ''; return; }
  unlockMode('passphrase', 'First unlock on this device');
}
ui.fpp.onsubmit = async (e) => {
  e.preventDefault();
  const pp = $('#pp').value;
  ui.sub.textContent = 'Checking… (a few seconds)';
  try {
    const key = await deriveKey(pp, S.familyEnv);
    S.family = await decryptWith(key, S.familyEnv);
    await kvSet('key:family', key);
    $('#pp').value = '';
    unlockMode('setpin', 'Passphrase accepted. Now a PIN for everyday use.');
  } catch (err) { unlockMode('passphrase', 'First unlock on this device'); unlockError('That passphrase did not open the family data.'); }
};
ui.fset.onsubmit = async (e) => {
  e.preventDefault();
  const a = $('#pin1').value, b = $('#pin2').value;
  if (!/^\d{4}$/.test(a)) return unlockError('Four digits, please.');
  if (a !== b) return unlockError('The two PINs differ.');
  await setPin('family', a);
  $('#pin1').value = $('#pin2').value = '';
  enterApp();
};
ui.fpin.onsubmit = async (e) => {
  e.preventDefault();
  const pin = $('#pin').value; $('#pin').value = '';
  const r = await checkPin('family', pin);
  if (r === 'ok') {
    const key = await kvGet('key:family');
    try { S.family = await decryptWith(key, S.familyEnv); return enterApp(); } catch (err) { await kvDel('key:family'); return unlockMode('passphrase', 'Stored key no longer matches this build. Passphrase again, please.'); }
  }
  if (r === 'wiped') return unlockMode('passphrase', 'Too many wrong PINs. The passphrase is needed again.');
  unlockError(r === 'nopin' ? 'No PIN set.' : `Wrong PIN. ${r.split(':')[1]} tries left before the passphrase is needed again.`);
};

function enterApp() {
  $('#screen-unlock').classList.add('hidden');
  $('#nav').classList.remove('hidden');
  $('#sheet-vault').classList.toggle('hidden', settings.readerMode);
  renderAll();
  show('today');
  checkForUpdate();
}

/* ------------------------------------------------------------------ rendering */
function renderAll() { renderToday(); renderDays(); renderMoves(); renderStays(); renderMap(); renderTaxi(); renderEmergency(); renderProtocols(); }

function renderToday() {
  const F = S.family, ctx = currentContext();
  const nm = nextMove(ctx);
  const photoKey = 'photo:' + ctx.date;
  let html = `<h1 class="h1">Today</h1>`;
  html += `<div class="card today-now"><div class="muted small">${esc(ctx.city)} · ${esc(ctx.date)} · local ${localTime(ctx.tz)}</div>`;
  if (ctx.before) {
    const start = new Date('2026-11-29T20:05:00Z'); // 30 Nov 06:05 Townsville (UTC+10)
    const days = Math.ceil((start - Date.now()) / 86400000);
    html += `<div class="countdown">${days} days</div><div>until wheels-up: AC2756 Townsville 06:05, Mon 30 Nov</div>`;
  } else if (ctx.stay) {
    html += `<div class="h3">Tonight</div><div class="big">${esc(ctx.stay.property)}</div><div>${esc(ctx.stay.address)}</div>${ctx.stay.address_ja ? `<div class="ja">${esc(ctx.stay.address_ja)}</div>` : ''}`;
    html += `<div class="row"><a class="btn" href="#" data-go="stays">Stay details</a>${ctx.stay.coord && ctx.stay.coord.lat ? `<a class="btn" href="#" data-go="map">Show on map</a>` : ''}</div>`;
  } else {
    html += `<div class="h3">Travel day</div><div>No bed tonight: you are in the air or between stays. Check Moves.</div>`;
  }
  html += `</div>`;
  if (nm) {
    html += `<div class="card"><div class="h3">Next move</div><div class="big">${esc(nm.carrier.split('·')[0].trim())} · ${esc(nm.frm)} → ${esc(nm.to)}</div>`;
    html += `<div>${esc(fmtDate(nm.date))} · departs ${esc(nm.depart)} · arrives ${esc(nm.arrive)}</div>`;
    if (nm.checkin) { const o = String(nm.checkin.opens || ''), c = String(nm.checkin.closes || ''); const first = (s) => s.split(/[.;(]/)[0].trim(); html += `<div class="small muted">Check-in: ${esc(first(o))}; closes ${esc(first(c))}. Details in Moves.</div>`; }
    if (nm.ref) html += `<div class="mono">${esc(nm.ref)}</div>`;
    html += `<div class="row"><a class="btn" href="#" data-go="moves">All moves</a></div></div>`;
  }
  const day = F.days.find((d) => d.date === ctx.date);
  if (day) html += `<div class="card"><div class="h3">The plan</div><div>${nl(day.plan)}</div>${day.travel ? `<div class="small muted">${nl(day.travel)}</div>` : ''}${day.heads_up ? `<div class="small red">${nl(day.heads_up)}</div>` : ''}</div>`;
  if (!localStorage.getItem(photoKey) && !ctx.before) {
    html += `<div class="photo-reminder"><div><b>Morning photo</b><br><span class="small">Snap each kid in today's clothes.</span></div><button id="photo-done">Done</button></div>`;
  }
  html += `<button class="btn danger block sos" id="today-sos">Lost kid / emergency</button>`;
  html += `<p class="tiny muted">Built ${esc(BUILT)} · ${esc(VERSION)}</p>`;
  $('#screen-today').innerHTML = html;
  const pd = $('#photo-done'); if (pd) pd.onclick = () => { localStorage.setItem(photoKey, '1'); renderToday(); };
  $('#today-sos').onclick = openSOS;
  wireGo($('#screen-today'));
}
function wireGo(root) { root.querySelectorAll('[data-go]').forEach((a) => a.onclick = (e) => { e.preventDefault(); show(a.dataset.go); }); }

function openSOS() {
  const F = S.family, ctx = currentContext();
  const cc = ctx.country, em = EMERGENCY_NUMBER[cc], pol = POLICE_NUMBER[cc];
  const lk = (F.protocols && F.protocols.lost_kid) || {};
  const base = ctx.city.toLowerCase();
  const cardIds = new Set(F.taxi_cards.filter((c) => (c.base || '').toLowerCase() === base).map((c) => c.id));
  const kobans = (F.koban || []).filter((k) => cardIds.has(k.venue_id));
  const stayKoban = ctx.stay ? kobans.find((k) => k.venue_id === (ctx.stay.ja_id || '')) : null;
  let html = `<h1 class="h1 red">Lost kid</h1>`;
  html += `<a class="btn danger block sos" href="tel:${em}">Call ${em}${pol !== em ? ` (police ${pol})` : ''}</a>`;
  if (pol !== em) html += `<a class="btn block" href="tel:${pol}">Police ${pol}</a>`;
  html += `<div class="card"><div class="h3">Do now</div><ol class="steps">${(lk.steps || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>`;
  html += `<div class="card"><div class="h3">Say</div><div>${esc(lk.say_en || '')}</div>${lk.say_ja ? `<div class="ja">${esc(lk.say_ja)}</div>` : ''}</div>`;
  if (stayKoban || kobans.length) {
    html += `<div class="card"><div class="h3">Nearest police box</div>${stayKoban ? `<div>${tel(stayKoban.note)}</div>` : ''}${kobans.filter((k) => k !== stayKoban).slice(0, 4).map((k) => `<div class="small muted" style="margin-top:6px">${esc(k.venue_id)}: ${tel(k.note)}</div>`).join('')}</div>`;
  } else {
    html += `<div class="card"><div class="h3">Police</div><div>Nearest staff or security first, then ${pol}.</div></div>`;
  }
  html += `<div class="card red"><b>This morning's photo</b>: open Photos now and have it ready to show.</div>`;
  const E = F.emergency[cc === 'AU' ? 'JP' : cc];
  if (E && E.hospitals && E.hospitals.length) html += `<div class="card"><div class="h3">Hospital for a sick child</div>${E.hospitals.slice(0, 2).map((h) => `<div><b>${esc(h.name)}</b><br>${tel(h.address_en + ' · ' + h.phone)}</div>`).join('<hr>')}</div>`;
  openModal(html);
}
$('#btn-sos').onclick = openSOS;

function renderDays() {
  const ctx = currentContext();
  $('#screen-days').innerHTML = `<h1 class="h1">Days</h1>` + S.family.days.map((d) => `
    <div class="card${d.date === ctx.date ? ' today-now' : ''}" id="day-${d.date}">
      <div><b>${esc(d.label)}</b> <span class="muted">· ${esc(d.where)}</span>${d.date === ctx.date ? '<span class="chip red">today</span>' : ''}</div>
      <div class="small muted">Sleep: ${esc(d.sleep)}</div>
      <div>${nl(d.plan)}</div>
      ${d.travel ? `<div class="small">${nl(d.travel)}</div>` : ''}
      ${d.heads_up ? `<div class="small red">${nl(d.heads_up)}</div>` : ''}
    </div>`).join('');
}

function renderMoves() {
  const F = S.family;
  let html = `<h1 class="h1">Moves</h1><p class="small muted">All times local. Clock times only; check the boarding pass where it says "check".</p>`;
  html += F.moves.map((m) => `<div class="card">
    <div><b>${esc(m.label)} · ${esc(m.carrier.split('·')[0].trim())}</b> <span class="chip">${esc(m.status)}</span></div>
    <div class="big">${esc(m.frm)} → ${esc(m.to)}</div>
    <div class="big">${esc(m.depart)} → ${esc(m.arrive)}</div>
    ${kv([['Carrier', m.carrier], ['Booking', m.ref], ['Seats', m.seats],
      ['Bags', m.bags ? (m.bags.checked.startsWith('None') || m.bags.checked.startsWith('—') ? 'No checked bags. Cabin: ' + m.bags.cabin : `Checked: ${m.bags.checked} (${m.bags.who}). Cabin: ${m.bags.cabin}`) : ''],
      ['Check-in', m.checkin ? `Opens ${m.checkin.opens}. Closes ${m.checkin.closes}.${m.checkin.bag_drop_closes ? ' Bag drop closes ' + m.checkin.bag_drop_closes + '.' : ''}` : ''],
      ['Check', m.check], ['Notes', m.notes]])}
  </div>`).join('');
  html += `<h2 class="h2">Getting between airports, stations and beds</h2><div class="card"><table class="t"><tr><th>When</th><th>From → to</th><th>How</th></tr>${F.transfers.map((t) => `<tr><td>${esc(t.label)}<br>${esc(t.time)}</td><td>${esc(t.route)}</td><td>${esc(t.how)}<br><span class="chip">${esc(t.status)}</span></td></tr>`).join('')}</table></div>`;
  $('#screen-moves').innerHTML = html;
}

function renderStays() {
  const F = S.family;
  const pins = {};
  if (S.vault) for (const p of S.vault.stay_pins) pins[p.conf] = p.pin;
  $('#screen-stays').innerHTML = `<h1 class="h1">Stays</h1>` + F.stays.map((s) => `<div class="card">
    <div><b>${esc(s.city)}</b> · ${esc(s.property)} <span class="chip">${esc(s.nights)} nights</span></div>
    <div>${esc(s.address)}</div>${s.address_ja ? `<div class="ja">${esc(s.address_ja)}</div>` : ''}
    ${kv([['Check-in', `${fmtDate(s.checkin_date)}, ${s.checkin_from}`], ['Check-out', `${fmtDate(s.checkout_date)} by ${s.checkout_by}`],
      ['You arrive', s.arrive], ['You leave', s.leave], ['Phone', s.phone],
      ['Confirmation', s.conf + (pins[s.conf] ? ` · PIN <b>${esc(pins[s.conf])}</b>` : ' · PIN in the vault'), true],
      ['Where', coordLine(s.coord) ? coordLine(s.coord) : ''], ['Notes', s.notes]])}
    ${s.coord && s.coord.lat != null ? mapsLink(s.coord.lat, s.coord.lon, s.property) : ''}
  </div>`).join('');
}

function renderMap() {
  const F = S.family;
  const layers = {};
  for (const f of (F.overlay && F.overlay.features) || []) (layers[f.properties.layer] = layers[f.properties.layer] || []).push(f.properties);
  const titles = { stays: 'Stays', moves: 'Airports, stations, pickups', venues: 'Venues', emergency: 'Hospitals, police, pharmacies, consulates', rally: 'Rally points (proposed)' };
  let html = `<h1 class="h1">Map</h1><div class="card"><b>Offline map arrives in the next build (Phase 4).</b><div class="small muted">Until then every place is listed here with its coordinates and Plus Code, and a button that opens it in a maps app (needs data).</div></div>`;
  for (const layer of ['stays', 'moves', 'venues', 'emergency', 'rally']) {
    if (!layers[layer]) continue;
    html += `<details><summary>${esc(titles[layer])} <span class="chip">${layers[layer].length}</span></summary>` + layers[layer].map((p) => `
      <div style="padding:8px 0;border-top:1px solid var(--border)"><b>${esc(p.name_en)}</b>${p.name_ja ? ` <span class="ja small">${esc(p.name_ja)}</span>` : ''}
      <div class="small">${esc(p.address_en)}</div>${p.address_ja ? `<div class="small">${esc(p.address_ja)}</div>` : ''}
      <div class="mono small">${(+p.lat).toFixed(5)}, ${(+p.lon).toFixed(5)} · ${esc(p.plus_code)}</div>${p.notes ? `<div class="tiny muted">${esc(p.notes)}</div>` : ''}
      ${mapsLink(p.lat, p.lon, p.name_en)}</div>`).join('') + `</details>`;
  }
  $('#screen-map').innerHTML = html;
}

function renderTaxi() {
  const F = S.family;
  const phrases = Object.fromEntries((F.phrases || []).map((p) => [p.id, p]));
  const kobans = Object.fromEntries((F.koban || []).map((k) => [k.venue_id, k]));
  const BASE_LABEL = { vancouver: 'Vancouver', whistler: 'Whistler', toronto: 'Toronto', 'new york': 'New York', newyork: 'New York', 'montréal': 'Montréal', montreal: 'Montréal', tokyo: 'Tokyo', nagoya: 'Nagoya' };
  const bases = [...new Set(F.taxi_cards.map((c) => c.base))].filter((b) => BASE_LABEL[b]);
  let html = `<h1 class="h1">Taxi cards</h1><div class="pill-row" id="taxi-pills"><button class="pill active" data-base="all">All</button>${bases.map((b) => `<button class="pill" data-base="${esc(b)}">${esc(BASE_LABEL[b])}</button>`).join('')}</div>`;
  html += `<ul class="list" id="taxi-list">` + F.taxi_cards.map((c, i) => `<li data-base="${esc(c.base)}"><a href="#" data-card="${i}"><b>${esc(c.title_en)}</b></a>${c.name_ja ? `<div class="ja">${esc(c.name_ja)}</div>` : ''}<div class="small muted">${esc(c.address_en)}</div></li>`).join('') + `</ul>`;
  html += `<h2 class="h2">Phrases</h2>` + (F.phrases || []).map((p) => `<div class="card"><div class="small muted">${esc(p.en)}</div><div class="ja">${esc(p.ja)}</div><div class="tiny muted">${esc(p.romaji)}</div></div>`).join('');
  $('#screen-taxi').innerHTML = html;
  $('#taxi-pills').onclick = (e) => { const b = e.target.closest('.pill'); if (!b) return; document.querySelectorAll('#taxi-pills .pill').forEach((p) => p.classList.toggle('active', p === b)); document.querySelectorAll('#taxi-list li').forEach((li) => li.classList.toggle('hidden', b.dataset.base !== 'all' && li.dataset.base !== b.dataset.base)); };
  $('#taxi-list').onclick = (e) => {
    const a = e.target.closest('[data-card]'); if (!a) return; e.preventDefault();
    const c = F.taxi_cards[+a.dataset.card], take = phrases['take-us-here'], kb = kobans[c.id];
    openModal(`<div class="taxi-full"><div class="muted">${esc(c.title_en)}</div>${c.name_ja ? `<div class="ja">${esc(c.name_ja)}</div>` : ''}${c.address_ja ? `<div class="addr-ja">${esc(c.address_ja)}</div>${take ? `<div class="ja">${esc(take.ja)}</div>` : ''}` : ''}<div class="big">${esc(c.address_en)}</div>${coordLine(c.coord) ? `<div class="mono">${coordLine(c.coord)}</div>` : ''}${c.notes ? `<div class="small muted" style="margin-top:8px">${tel(c.notes)}</div>` : ''}${kb ? `<div class="small" style="margin-top:8px"><b>Police box:</b> ${tel(kb.note)}</div>` : ''}${c.coord && c.coord.lat != null ? mapsLink(c.coord.lat, c.coord.lon, c.title_en) : ''}</div>`);
  };
}

function renderEmergency() {
  const F = S.family, ctx = currentContext();
  const order = ['CA', 'US', 'JP'].sort((a, b) => (a === ctx.country ? -1 : b === ctx.country ? 1 : 0));
  let html = `<h1 class="h1">Emergency</h1>`;
  for (const cc of order) {
    const E = F.emergency[cc];
    html += `<details ${cc === ctx.country ? 'open' : ''}><summary>${esc(E.name)}${cc === ctx.country ? '<span class="chip red">here</span>' : ''}</summary>`;
    html += kv(E.numbers.map((c) => [c.who, c.phone + (c.ref ? ' · ' + c.ref : '')]));
    if (E.hospitals.length) html += `<div class="h3">Hospital for a sick child</div>` + E.hospitals.map((h) => `<div class="card"><b>${esc(h.name)}</b><div>${tel(h.address_en + ' · ' + h.phone + (h.open_24h ? ' · 24 h' : ''))}</div>${h.address_ja ? `<div class="ja">${esc(h.address_ja)}</div>` : ''}${coordLine(h.coord) ? `<div class="mono small">${coordLine(h.coord)}</div>` : ''}<div class="small muted">${esc(h.notes)}</div>${h.coord && h.coord.lat != null ? mapsLink(h.coord.lat, h.coord.lon, h.name) : ''}</div>`).join('');
    if (E.pharmacies && E.pharmacies.length) html += `<div class="h3">Pharmacy at night</div>` + E.pharmacies.map((p) => `<div class="card"><b>${esc(p.name)}</b><div>${tel(p.address_en + ' · ' + p.phone + ' · ' + p.hours)}</div>${p.address_ja ? `<div class="ja">${esc(p.address_ja)}</div>` : ''}<div class="small muted">${tel(p.notes)}</div></div>`).join('');
    if (E.medicine) html += E.medicine.map((m) => `<div class="small muted">${esc(m)}</div>`).join('');
    if (E.health_lines.length) html += `<div class="h3">Health lines</div>` + kv(E.health_lines.map((h) => [h.name, `${h.number} · ${h.hours}`]));
    const cons = E.consulates_verified || E.consulates;
    if (cons && cons.length) html += `<div class="h3">Australian consulate</div>` + cons.map((c) => `<div class="card">${c.who ? tel(`${c.who} — ${c.phone} · ${c.ref}`) : tel(`${c.name} — ${c.address_en} · ${c.phone} · ${c.hours}`)}${c.after_hours ? `<div class="small muted">${tel(c.after_hours)}</div>` : ''}</div>`).join('');
    if (E.insurers.length) html += `<div class="h3">Insurance</div>` + kv(E.insurers.map((c) => [c.who, c.phone + (c.ref ? ' · ' + c.ref : '')]));
    html += `</details>`;
  }
  $('#screen-emergency').innerHTML = html;
}

function renderProtocols() {
  const P = S.family.protocols || {}, lk = P.lost_kid || {}, pace = P.pace || {}, ps = P.phone_stolen || {};
  let html = `<h1 class="h1">Protocols</h1>`;
  html += `<div class="card"><div class="h2">Lost kid</div><ol class="steps">${(lk.steps || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol><div><b>Say:</b> ${esc(lk.say_en || '')}</div>${lk.say_ja ? `<div class="ja">${esc(lk.say_ja)}</div>` : ''}<div class="red">${esc(lk.morning_photo || '')}</div></div>`;
  html += `<div class="card"><div class="h2">PACE</div>${kv([['Primary', pace.primary], ['Alternate', pace.alternate], ['Contingency', pace.contingency], ['Emergency', pace.emergency]])}</div>`;
  html += `<div class="card"><div class="h2">Phone stolen</div><div class="h3">iPhone (Sarah)</div><ol class="steps">${(ps.ios || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol><div class="h3">Android (Andy)</div><ol class="steps">${(ps.android || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>${kv([['SIM / eSIM', ps.sim], ['Wallet cards', ps.wallet_lock], ['Sign out everywhere', ps.sign_out_everywhere]])}<div class="small muted">Card-lock list: in the vault.</div></div>`;
  $('#screen-protocols').innerHTML = html;
}

/* ------------------------------------------------------------------ vault */
function armVaultLock() {
  clearTimeout(S.vaultTimer);
  S.vaultTimer = setTimeout(lockVault, VAULT_LOCK_MS);
}
function lockVault() {
  S.vault = null; clearTimeout(S.vaultTimer);
  $('#screen-vault').innerHTML = '';                 // never leave decrypted vault text in the DOM, even hidden
  if (S.screen === 'vault') renderVault();
  renderStays();                                     // inline PINs disappear again
}
document.addEventListener('visibilitychange', () => { if (document.hidden) lockVault(); });
['click', 'touchstart', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (S.vault) armVaultLock(); }, { passive: true }));

async function renderVault() {
  const el = $('#screen-vault');
  if (settings.readerMode) { el.innerHTML = `<h1 class="h1">Vault</h1><div class="card">Reader mode is on for this device, so the vault is hidden. Turn it off in Settings on a parent's phone only.</div>`; return; }
  if (S.vault) {
    const V = S.vault;
    armVaultLock();
    el.innerHTML = `<h1 class="h1">Vault <span class="chip red">locks in 5 min</span></h1>
      <button class="btn block" id="vault-lock">Lock now</button>
      <div class="card"><div class="h2">Stay PINs and door codes</div><table class="t"><tr><th>Stay</th><th>Conf</th><th>PIN</th></tr>${V.stay_pins.map((p) => `<tr><td>${esc(p.property)}<br><span class="muted small">${esc(p.city)} · ${esc(p.dates)}</span></td><td class="mono">${esc(p.conf)}</td><td class="mono big">${esc(p.pin)}</td></tr>`).join('')}</table>${V.door_codes.map((d) => `<div class="small muted" style="margin-top:6px"><b>${esc(d.stay)}:</b> ${esc(d.note)}</div>`).join('')}</div>
      <div class="card"><div class="h2">Entry documents</div><table class="t"><tr><th>Person</th><th>Document</th><th>Number</th><th>Valid to</th></tr>${V.entry.eta.map((e) => `<tr><td>${esc(e.person)}</td><td>Canada eTA</td><td class="mono">${esc(e.number)}</td><td>${esc(e.valid_to)}</td></tr>`).join('')}${V.entry.esta.map((e) => `<tr><td>${esc(e.person)}</td><td>US ESTA</td><td class="mono">${esc(e.number)}</td><td>${esc(e.valid_to)}</td></tr>`).join('')}</table>${V.entry.esta_group ? `<div class="mono small">ESTA group ${esc(V.entry.esta_group)}</div>` : ''}<div class="small muted">${esc(V.entry.passports)}</div></div>
      <div class="card"><div class="h2">Insurance policies</div>${V.policies.map((p) => `<div class="h3">${esc(p.name)}</div>${kv([['Policy', p.number], ['Covers', p.when], ['Emergency', p.emergency], ['Claims', p.claims]])}`).join('')}</div>
      <div class="card"><div class="h2">5 January: the plan</div>${kv(V.surprise.filter((r) => r.text).map((r) => [r.label || '·', r.text + (r.note ? ' — ' + r.note : '')]))}</div>
      <div class="card"><div class="h2">Card-lock list</div><div class="small">${esc(V.card_lock)}</div></div>`;
    $('#vault-lock').onclick = lockVault;
    return;
  }
  const key = await kvGet('key:vault'), pinRec = await kvGet('pin:vault');
  const mode = key && pinRec ? 'pin' : 'passphrase';
  el.innerHTML = `<h1 class="h1">Vault</h1><div class="card centre">
    <p class="muted">${mode === 'pin' ? 'Vault PIN' : 'First time on this device: the Vault passphrase, then choose a Vault PIN.'}</p>
    <form id="vault-form" autocomplete="off">
      ${mode === 'pin' ? `<input id="vpin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" class="input pin" required>`
      : `<input id="vpp" type="password" autocapitalize="none" autocorrect="off" spellcheck="false" class="input" placeholder="Vault passphrase" required>
         <input id="vpin1" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" class="input pin" placeholder="PIN" required>
         <input id="vpin2" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" class="input pin" placeholder="PIN again" required>`}
      <button class="btn primary" type="submit">Open vault</button>
    </form><p class="error hidden" id="vault-err"></p></div>`;
  $('#vault-form').onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#vault-err'); err.classList.add('hidden');
    try {
      const env = S.vaultEnv || (S.vaultEnv = await loadEnvelope('vault'));
      if (mode === 'pin') {
        const r = await checkPin('vault', $('#vpin').value); $('#vpin').value = '';
        if (r === 'wiped') return renderVault();
        if (r !== 'ok') { err.textContent = `Wrong PIN. ${r.split(':')[1] || 0} tries left.`; return err.classList.remove('hidden'); }
        try { S.vault = await decryptWith(await kvGet('key:vault'), env); }
        catch (mismatch) { await kvDel('key:vault'); await kvDel('pin:vault'); S.vaultEnv = null; renderVault(); setTimeout(() => { const p = $('#screen-vault .muted'); if (p) p.textContent = 'The stored key no longer matches this build. Vault passphrase again, then a new PIN.'; }, 0); return; }
      } else {
        const a = $('#vpin1').value, b = $('#vpin2').value;
        if (!/^\d{4}$/.test(a) || a !== b) { err.textContent = 'PIN must be four digits, typed twice the same.'; return err.classList.remove('hidden'); }
        const k = await deriveKey($('#vpp').value, env);
        S.vault = await decryptWith(k, env);
        await kvSet('key:vault', k); await setPin('vault', a);
      }
      renderVault(); renderStays();
    } catch (ex) { err.textContent = 'That did not open the vault.'; err.classList.remove('hidden'); }
  };
}

/* ------------------------------------------------------------------ settings and updates */
function renderSettings() {
  $('#screen-settings').innerHTML = `<h1 class="h1">Settings</h1>
    <div class="card"><div class="h3">Theme</div><div class="row">${['auto', 'light', 'dark'].map((t) => `<button class="pill${settings.theme === t ? ' active' : ''}" data-theme="${t}">${t}</button>`).join('')}</div></div>
    <div class="card"><div class="h3">This device</div>
      <label><input type="checkbox" id="opt-reader" ${settings.readerMode ? 'checked' : ''}> Reader mode: hide the Vault (for the iPad)</label><br>
      <label><input type="checkbox" id="opt-auto" ${settings.autoFamily ? 'checked' : ''}> Open the family view without a PIN on this device</label>
      <button class="btn block" id="opt-forget">Forget this device (wipe stored keys and PINs)</button></div>
    <div class="card"><div class="h3">Build</div><div>${esc(VERSION)} · built ${esc(BUILT)}</div><button class="btn block" id="opt-update">Check for a newer build</button><div class="small muted" id="update-msg"></div></div>
    <div class="card small muted">Storage: <span id="storage-msg">…</span></div>`;
  document.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => { settings.theme = b.dataset.theme; renderSettings(); });
  $('#opt-reader').onchange = (e) => { settings.readerMode = e.target.checked; $('#sheet-vault').classList.toggle('hidden', settings.readerMode); if (settings.readerMode) lockVault(); };
  $('#opt-auto').onchange = (e) => { settings.autoFamily = e.target.checked; };
  $('#opt-forget').onclick = () => { if (confirm('Forget this device? You will need the passphrase again.')) forgetDevice(); };
  $('#opt-update').onclick = () => checkForUpdate(true);
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((e) => { $('#storage-msg').textContent = `${Math.round((e.usage || 0) / 1024)} KB used of ${Math.round((e.quota || 0) / 1048576)} MB available`; });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
}
async function checkForUpdate(manual) {
  const msg = $('#update-msg');
  if (!navigator.onLine) { if (msg) msg.textContent = 'Offline: cannot check.'; return; }
  try {
    const r = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
    const v = await r.json();
    if (v.label !== VERSION) {
      $('#banner').innerHTML = `<span>New build ${esc(v.label)} (${esc(v.built)}) is available.</span><button id="banner-update">Update</button>`;
      $('#banner').classList.remove('hidden');
      $('#banner-update').onclick = async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) { await reg.update(); if (reg.waiting) reg.waiting.postMessage('skipWaiting'); }
        setTimeout(() => location.reload(), 600);
      };
    } else if (manual && msg) msg.textContent = 'You have the latest build.';
  } catch (e) { if (msg) msg.textContent = 'Could not reach the host.'; }
}

/* ------------------------------------------------------------------ wiring */
document.querySelectorAll('#nav button').forEach((b) => b.onclick = () => { if (b.dataset.screen === 'more') $('#sheet').classList.remove('hidden'); else show(b.dataset.screen); });
document.querySelectorAll('.sheet-item[data-screen]').forEach((b) => b.onclick = () => { $('#sheet').classList.add('hidden'); show(b.dataset.screen); });
$('#sheet-close').onclick = () => $('#sheet').classList.add('hidden');
$('#sheet').onclick = (e) => { if (e.target === $('#sheet')) $('#sheet').classList.add('hidden'); };
$('#btn-settings').onclick = () => { if (S.family) show('settings'); };
applyTheme();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => { const nw = reg.installing; nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) checkForUpdate(); }); });
  }).catch(() => {});
}
startFamily().catch((e) => { ui.sub.textContent = 'Could not load the dossier data.'; unlockError(String(e.message || e)); });
