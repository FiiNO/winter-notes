/* Travel Dossier app (Build Plan v2, Phase 3: everything except the live map).
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
  'Nagoya': 'Asia/Tokyo', 'Calgary': 'America/Edmonton', 'Home': 'Australia/Brisbane', 'Brisbane': 'Australia/Brisbane', 'Cairns': 'Australia/Brisbane', 'Townsville': 'Australia/Brisbane' };   // Calgary: the 30 Dec stopover (globe clock, 3 Nov 2026)
const COUNTRY = { 'Vancouver': 'CA', 'Whistler': 'CA', 'Toronto': 'CA', 'Montréal': 'CA', 'Montreal': 'CA', 'New York': 'US', 'Tokyo': 'JP', 'Nagoya': 'JP', 'Calgary': 'CA', 'Brisbane': 'AU', 'Cairns': 'AU', 'Townsville': 'AU' };
const EMERGENCY_NUMBER = { CA: '911', US: '911', JP: '119', AU: '000' };
/* error log (1 Nov 2026): the last few script errors, kept across reloads, shown in Settings → Photos and journal.
   Andy saw "just a blank page" on the iPad and the Android phone; from here the pane cannot see those devices. */
function logErr(msg) { try { const log = JSON.parse(localStorage.getItem('errlog') || '[]'); log.push(new Date().toISOString().slice(5, 16).replace('T', ' ') + ' ' + String(msg).slice(0, 300)); localStorage.setItem('errlog', JSON.stringify(log.slice(-6))); } catch (e) { /* storage blocked */ } }
window.addEventListener('error', (e) => logErr((e.message || 'error') + ' @ ' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0)));
window.addEventListener('unhandledrejection', (e) => logErr('promise: ' + ((e.reason && (e.reason.message || e.reason.stack)) || e.reason)));
const POLICE_NUMBER = { CA: '911', US: '911', JP: '110', AU: '000' };

const S = { family: null, vault: null, screen: 'home', vaultTimer: null, pendingPassphraseFor: null, preview: localStorage.getItem('previewDate') || null,
  setupOpen: false };                                 // Grandma and Grandpa's phone (3 Nov 2026): Settings → Set-up (role, PIN-less opening, forget) is open after the device PIN, until Settings is left
const settings = {
  get theme() { return localStorage.getItem('theme') || 'auto'; }, set theme(v) { localStorage.setItem('theme', v); applyTheme(); },
  get readerMode() { return localStorage.getItem('readerMode') === '1'; }, set readerMode(v) { localStorage.setItem('readerMode', v ? '1' : '0'); },
  get autoFamily() { return localStorage.getItem('autoFamily') === '1'; }, set autoFamily(v) { localStorage.setItem('autoFamily', v ? '1' : '0'); },
  get bigText() { return localStorage.getItem('bigText') === '1'; }, set bigText(v) { localStorage.setItem('bigText', v ? '1' : '0'); applyBigText(); },
  get sound() { return FX.soundOn(); }, set sound(v) { FX.setSound(!!v); if (v) FX.sound('yes'); },   // 3 Nov 2026: the few synthesised sound effects (fx.js)
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
/* An Australian mobile typed as 04xx xxx xxx becomes +61 4xx xxx xxx: that is what a police officer in Tokyo or a shop in
   Whistler can dial as written (1 Nov 2026, Andy: a memorised 04 number is no use abroad). */
function intlNum(n) {
  const d = String(n || '').replace(/[^\d+]/g, '');
  if (/^04\d{8}$/.test(d)) return `+61 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (/^\+614\d{8}$/.test(d)) return `+61 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  return String(n || '');
}
function kv(rows) {
  return '<div class="kv">' + rows.filter((r) => r[1] !== undefined && r[1] !== null && String(r[1]) !== '').map(([k, v, raw]) =>
    `<div class="k">${esc(k)}</div><div class="v">${raw ? v : tel(v)}</div>`).join('') + '</div>';
}
/* Hand-off links, the same three everywhere (Andy, 10 Oct): Organic Maps for offline directions and search (every device
   carries it with the regions downloaded), Google Maps for live transit, Google Earth for a look at the building.
   Apple Maps and the Android geo: intent were dropped. Google Maps and Google Earth need data. */
function mapButtons(lat, lon, label) {
  const q = `${(+lat).toFixed(6)},${(+lon).toFixed(6)}`, n = encodeURIComponent(label || 'Here');
  return `<a class="btn" href="om://map?v=1&ll=${q}&n=${n}">Organic Maps</a>` +
    `<a class="btn" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Google Maps</a>` +
    `<a class="btn" href="https://earth.google.com/web/search/${q}" target="_blank" rel="noopener">Google Earth</a>`;
}
function mapsLink(lat, lon, label) {
  if (lat == null || lat === '') return '';
  return `<div class="row">${mapButtons(lat, lon, label)}</div>`;
}
const isMontreal = (s) => /montr[eé]al/i.test(String(s || ''));
/* One phrase card. Japanese cards carry ja + romaji, French cards (Montréal) fr + a plain pronunciation line. */
function phraseCard(p, show) {
  const lang = p.lang || 'ja', main = lang === 'fr' ? p.fr : p.ja, sub = lang === 'fr' ? p.say : p.romaji;
  return `<div class="card phrase${lang !== show ? ' hidden' : ''}" data-lang="${lang}"><div class="small muted">${esc(p.en || '')}</div><div class="${lang}">${esc(main || '')}</div><div class="tiny muted">${esc(sub || '')}</div></div>`;
}
function coordLine(c) { return c && c.lat != null && c.lat !== '' ? `${(+c.lat).toFixed(5)}, ${(+c.lon).toFixed(5)}` : ''; }
/* ------------------------------------------------------------------ the back gesture
   1 Nov 2026, Andy: "by habit I swipe backwards on the android phone all the time to go to the previous page, but this
   always crashed the app and it needs to be reloaded every time." An installed PWA with nothing in its history closes
   on Android's back gesture (it looks like a crash). Every screen change, modal and overlay now pushes a history entry
   and popstate walks back through them: overlay → modal → the screen we came from → Home. Back from Home with nothing
   open stays in the app (Android's home gesture leaves it). A modal or overlay closed with its own button leaves a
   stale entry behind; the next open reuses it when it is on top, and a pop that lands on one keeps going back. */
const Nav = {
  push(nav, screen) { try { history.pushState({ nav, screen: screen || null, t: Date.now() }, ''); } catch (e) {} },
  top() { return (history.state && history.state.nav) || ''; },
  modalOpen() { return !$('#modal').classList.contains('hidden'); },
  pushModal() { if (!Nav.modalOpen() && Nav.top() !== 'modal') Nav.push('modal'); },
  pushOverlay() { if (Nav.top() !== 'overlay') Nav.push('overlay'); },
  start() {
    try { history.replaceState({ nav: 'root' }, ''); history.pushState({ nav: 'screen', screen: 'home' }, ''); } catch (e) {}
    window.addEventListener('popstate', (e) => Nav.onPop(e.state));
  },
  onPop(st) {
    if (!st || !st.nav) { history.back(); return; }                         // not one of ours (a # link): keep going
    if (st.nav === 'root') { Nav.push('screen', 'home'); if (S.family && S.screen !== 'home') show('home', true); return; }
    if (!S.family) return;                                                  // locked: nothing to walk back through
    const overlay = window.Journal && Journal.overlayOpen();
    if (overlay) {
      if (st.nav === 'overlay') return;
      if (!Journal.overlayBack()) { Nav.push('overlay'); return; }          // kept the drawing: put the entry back
      if (st.nav === 'modal' && Nav.modalOpen()) return;                    // back to the modal underneath
    } else if (st.nav === 'overlay') { history.back(); return; }            // stale: closed with its own ✕
    if (Nav.modalOpen()) closeModal();
    if (st.nav === 'modal') { history.back(); return; }                     // stale: closed with its own button
    if (st.nav === 'screen' && st.screen !== S.screen) show(st.screen, true);
  },
};

function show(screen, fromHistory) {
  if (!fromHistory && S.screen !== screen) Nav.push('screen', screen);
  if (S.screen !== screen && window.Journal) Journal.onLeave(S.screen);
  if (S.screen === 'where' && screen !== 'where' && window.Globe) Globe.leave();   // frees the globe's WebGL map
  document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
  const el = $('#screen-' + screen);
  if (el) { el.classList.remove('hidden'); if (S.screen !== screen) { el.classList.add('enter'); clearTimeout(el._enter); el._enter = setTimeout(() => el.classList.remove('enter'), 1100); } }
  const BOOK = ['days', 'moves', 'stays', 'taxi', 'protocols', 'vault', 'settings', 'gates', 'where'], QUEST = ['quests', 'passport'];
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.screen === screen || (b.dataset.screen === 'book' && BOOK.includes(screen)) || (b.dataset.screen === 'quests' && QUEST.includes(screen))));
  S.screen = screen;
  if (screen !== 'settings') S.setupOpen = false;    // the grandparents' PIN-gated set-up closes with Settings
  window.scrollTo(0, 0);
  if (screen === 'sos') renderSOS();
  if (screen === 'home') renderHome();
  if (screen === 'quests') Quests.renderQuests();
  if (screen === 'passport') Quests.renderPassport();
  if (screen === 'book') renderBook();
  if (screen === 'gates') renderGates();
  if (screen === 'vault') renderVault();
  if (screen === 'settings') renderSettings();
  if (screen === 'story') Journal.renderStory();
  if (screen === 'map') mountMap();
  if (screen === 'where' && window.Globe) Globe.enter(currentContext(), S.family);
  if (window.DossierMap) window.DossierMap.setVisible(screen === 'map');
}
function focusOnMap(placeId) { show('map'); const go = () => window.DossierMap && window.DossierMap.focusPlace(placeId); S.mapMounted ? setTimeout(go, 400) : setTimeout(go, 1500); }
function openModal(html) { Nav.pushModal(); $('#modal-inner').innerHTML = `<button class="btn close" id="modal-close">Close</button>${html}`; $('#modal').classList.remove('hidden'); $('#modal-close').onclick = closeModal; }
function closeModal() { $('#modal').classList.add('hidden'); $('#modal-inner').innerHTML = ''; }
function applyTheme() { const t = settings.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }
function applyBigText() { document.documentElement.classList.toggle('big-text', settings.bigText); }

/* ------------------------------------------------------------------ dates and time zones */
function localDate(tz, d = new Date()) {
  if (S.preview) return S.preview;            // Settings: preview a trip day
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function localTime(tz, d = new Date()) { if (S.preview) return '12:00'; return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d); }
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
let dbOpen = null;                                  // one connection, shared with media.js
function idb() {
  if (dbOpen) return dbOpen;
  dbOpen = new Promise((res, rej) => {
    const r = indexedDB.open('dossier', 2);           // v2 (1 Nov 2026): the media store for photos and drawings
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
    };
    r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); dbOpen = null; }; res(db); };
    r.onerror = () => { dbOpen = null; rej(r.error); };
  });
  return dbOpen;
}
async function kvGet(k) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); }
async function kvSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); }
async function kvDel(k) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').delete(k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); }

/* ------------------------------------------------------------------ crypto */
const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64e = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
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
  try { await Media.wipe(); } catch (e) { /* no media store yet */ }
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

function applyRoleChrome() {                         // 2 Nov 2026: the chrome follows the device role (Grandma and Grandpa's phone hides what it cannot use)
  document.documentElement.dataset.role = Quests.role() || 'none';
  const ed = $('#top-edition'); if (ed) ed.textContent = Quests.isGrandDevice() ? ' · Grandparents' : ' · Family';
}
async function enterApp() {
  const sy = (S.family.trip || {}).sync || {};
  await Media.init(sy.media); delete sy.media;       // the raw media key leaves the plaintext family object at once
  Journal.init();
  $('#screen-unlock').classList.add('hidden');
  $('#nav').classList.remove('hidden');
  applyRoleChrome();
  renderAll();
  Quests.refreshTop();
  Journal.refreshBadge();
  show('home');
  if (!Quests.role()) { openModal(Quests.roleCard()); Quests.wireRole($('#modal-inner')); }   // 2 Nov 2026: a fresh device says whose it is first
  else if (!Quests.isGrandDevice()) { Quests.checkNewBadges(currentContext()); setTimeout(() => Quests.checkLevelUp(), 2500); }   // badges earned by the date can tip a level too (3 Nov 2026); the show waits for the map and stories to settle
  Quests.startSync();                                // no-op unless the family blob carries a sync address
  checkForUpdate();
}
/* the device PIN, re-used as the gate for making a device a parent phone (same try counter as the lock screen) */
async function verifyPin(pin) { const r = await checkPin('family', String(pin || '')); return r === 'ok' || r === 'nopin'; }

/* ------------------------------------------------------------------ rendering */
function renderAll() { rerender(); renderMap(); }
/* everything except the map (which must not be re-created once mounted) */
function rerender() { renderHome(); renderDays(); renderMoves(); renderStays(); renderTaxi(); renderSOS(); renderProtocols(); renderBook(); renderGates(); }

/* ------------------------------------------------------------------ home: the "today board" (31 Oct 2026)
   Four questions, one tile each: where do we sleep, what is next, what is on today, who do we call. Plus quests,
   passport, the taxi card for tonight, the kid's own card and SOS. The header and hero take the colour of the city. */
function cityKeyOf(city) { return Quests.CITY_KEY[city] || 'home'; }
function dayOf(date) { return S.family.days.find((d) => d.date === date); }
function eventsOn(date) { return (S.family.events || []).filter((e) => e.date === date); }
function sleepsUntil(ctx, iso) { return Math.max(0, Quests.daysBetween(ctx.date, iso)); }
function setCityColour(city) {
  const key = cityKeyOf(city);
  document.documentElement.style.setProperty('--city', `var(--c-${key})`);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = getComputedStyle(document.documentElement).getPropertyValue(`--c-${key}`).trim() || '#2A9D8F';
}
function dayStrip(ctx) {
  const days = S.family.days;
  let i = days.findIndex((d) => d.date === ctx.date);
  if (i < 0) i = ctx.before ? 0 : days.length - 1;
  const from = Math.max(0, Math.min(i - 3, days.length - 7));
  return `<div class="strip">` + days.slice(from, from + 7).map((d) => {
    const c = Quests.dayCity(d), cls = d.date === ctx.date ? ' today' : (d.date < ctx.date ? ' past' : '');
    return `<button class="day${cls}" data-day="${d.date}"><span class="de">${Quests.CITY_EMOJI[c] || '📍'}</span><span class="dn">${+d.date.slice(8, 10)}</span><span class="dw">${esc(fmtDate(d.date).slice(0, 3))}</span></button>`;
  }).join('') + `<button class="day more" data-go="days"><span class="de">📅</span><span class="dn">All</span><span class="dw">days</span></button></div>`;
}
function openDay(date) {
  const d = dayOf(date); if (!d) return;
  const c = Quests.dayCity(d), ev = eventsOn(date);
  openModal(`<div class="hero mini" style="--city:var(--c-${cityKeyOf(c)})"><div class="hero-emoji">${Quests.CITY_EMOJI[c] || '📍'}</div><div class="hero-text"><div class="hero-kicker">${esc(d.where)}</div><div class="hero-date">${esc(d.label)}</div><div class="hero-sub">Sleep: ${esc(d.sleep)}</div></div></div>
    <div class="card"><div class="h3">The plan</div><div>${nl(d.plan)}</div>${d.travel ? `<div class="small muted">${nl(d.travel)}</div>` : ''}${d.heads_up ? `<div class="small red">${nl(d.heads_up)}</div>` : ''}</div>` +
    ev.map((e) => `<div class="card"><div class="h3">🎟️ ${esc(e.time)} · ${esc(e.event)}</div><div>${esc(e.venue)}</div><div class="small muted">${esc(e.who)}${e.seats ? ' · ' + esc(e.seats) : ''}</div></div>`).join(''));
}
/* Grandma and Grandpa's phone (2 Nov 2026): a quiet Home. Where the family is, the time there, tonight's bed, the next move,
   the stories. No quests, no SOS, no day strip: everything on this phone arrives through the sync and is read only. */
function whereLine(ctx, fallback) {                    // the Where tile's subtitle from the globe's clock (3 Nov 2026): on a leg, or the last arrival city
  try {
    const w = window.Globe && Globe.whereNow ? Globe.whereNow(ctx, S.family) : null;
    if (w && w.riding) { const g = w.riding; return `${g.word} ${g.glyph} · ${g.from} → ${g.to} · ${Math.round(g.f * 100)}% of the way`; }
    if (w && w.here && !ctx.before) return `Spin the globe to ${w.here}`;
  } catch (e) { /* the globe is optional */ }
  return fallback;
}
function renderGrandHome() {
  const F = S.family, ctx = currentContext(), nm = nextMove(ctx);
  const city = ctx.inAir ? 'Air' : ctx.city;
  setCityColour(city);
  const total = Quests.daysBetween(F.trip.start, F.trip.end) + 1, dayN = Quests.daysBetween(F.trip.start, ctx.date) + 1;
  let html = '';
  if (ctx.before) {
    const sleeps = sleepsUntil(ctx, F.trip.start);
    html += `<div class="hero"><div class="hero-emoji">🛫</div><div class="hero-text"><div class="hero-kicker">Getting ready · ${esc(fmtDate(ctx.date))}</div><div class="hero-date">${sleeps} sleep${sleeps === 1 ? '' : 's'} to go</div><div class="hero-sub">They fly on ${esc(fmtDate(F.trip.start))}</div></div></div>`;
  } else if (dayN > total) {
    html += `<div class="hero"><div class="hero-emoji">🏡</div><div class="hero-text"><div class="hero-kicker">Home again</div><div class="hero-date">${esc(fmtDate(ctx.date))}</div><div class="hero-sub">${total} days of adventure live on in the stories</div></div></div>`;
  } else {
    html += `<div class="hero"><div class="hero-emoji">${Quests.CITY_EMOJI[city] || '📍'}</div><div class="hero-text"><div class="hero-kicker">Day ${dayN} of ${total} · ${esc(ctx.inAir ? 'In the air' : ctx.city)}${S.preview ? ' · preview' : ''}</div><div class="hero-date">${esc(fmtDate(ctx.date))}</div><div class="hero-sub">${esc(localTime(ctx.tz))} there · ${esc(localTime(TZ.Home))} at home</div></div></div>`;
  }
  html += `<div class="tiles">`;
  html += `<button class="tile ht wide t1" data-go="where"><span class="ico">🌏</span><span class="tt">Where are they?</span><span class="ts">${esc(ctx.before ? 'The whole route on the globe' : whereLine(ctx, ctx.inAir ? 'In the air right now' : 'Spin the globe to ' + ctx.city))}</span></button>`;
  html += Journal.storiesTileHtml(ctx);
  if (!ctx.before && ctx.stay) html += `<div class="tile wide t3"><span class="ico">🛏️</span><span class="tt">Tonight</span><span class="ts">${esc(ctx.stay.property || '')}${ctx.stay.city ? ', ' + esc(ctx.stay.city) : ''}</span></div>`;
  if (nm) html += `<div class="tile wide t2"><span class="ico">${/train/i.test(nm.mode || '') ? '🚆' : /coach|bus/i.test(nm.mode || '') ? '🚌' : '✈️'}</span><span class="tt">Next move</span><span class="ts">${esc(nm.frm || '')} → ${esc(nm.to || '')} · ${esc(fmtDate(nm.date))}${nm.depart ? ' · ' + esc(nm.depart) : ''}</span></div>`;
  html += `</div>`;
  html += `<p class="tiny muted">Everything here arrives from the family's phones when this one syncs. Built ${esc(BUILT)} · ${esc(VERSION)}</p>`;
  const el = $('#screen-home'); el.innerHTML = html;
  wireGo(el);
}
function renderHome() {
  if (Quests.isGrandDevice()) return renderGrandHome();
  const F = S.family, ctx = currentContext(), nm = nextMove(ctx);
  const city = ctx.inAir ? 'Air' : ctx.city;
  setCityColour(city);
  const total = Quests.daysBetween(F.trip.start, F.trip.end) + 1, dayN = Quests.daysBetween(F.trip.start, ctx.date) + 1;
  const q = Quests.summary(ctx);
  const photoKey = 'photo:' + ctx.date;
  let html = '';
  if (ctx.before) {
    const sleeps = sleepsUntil(ctx, F.trip.start), m0 = F.moves[0] || {};
    html += `<div class="hero"><div class="hero-emoji">🛫</div><div class="hero-text"><div class="hero-kicker">Getting ready · ${esc(fmtDate(ctx.date))}</div><div class="hero-date">${sleeps} sleep${sleeps === 1 ? '' : 's'} to go</div><div class="hero-sub">Wheels up ${esc(fmtDate(F.trip.start))} · ${esc(m0.depart || '')} from ${esc(m0.frm || 'home')}</div></div></div>`;
  } else {
    html += `<div class="hero"><div class="hero-emoji">${Quests.CITY_EMOJI[city] || '📍'}</div><div class="hero-text"><div class="hero-kicker">Day ${dayN} of ${total} · ${esc(ctx.inAir ? 'In the air' : ctx.city)}${S.preview ? ' · preview' : ''}</div><div class="hero-date">${esc(fmtDate(ctx.date))}</div><div class="hero-sub">${esc(localTime(ctx.tz))} here · ${esc(localTime(TZ.Home))} at home</div></div></div>`;
  }
  html += dayStrip(ctx);
  html += `<div class="tiles">`;
  const landed = Quests.stampsReady(ctx);        // we have landed somewhere and nobody has stamped the passport yet
  if (landed.length) html += `<button class="tile ht wide stampt" data-go="passport"><span class="ico">${Quests.CITY_EMOJI[landed[0]] || '🛬'}</span><span class="tt">We made it to ${esc(landed.join(' and '))}!</span><span class="ts">Tap to stamp the passport${Quests.isParentDevice() ? '' : ' (Mum or Dad say yes)'}</span></button>`;
  if (ctx.stay) {
    html += `<button class="tile ht t1" data-go="stays"><span class="ico">🛏️</span><span class="tt">Tonight</span><span class="ts">${esc(ctx.stay.property)}</span><span class="ts small">${esc(ctx.stay.address)}</span></button>`;
  } else if (!ctx.before) {
    html += `<button class="tile ht t1" data-go="moves"><span class="ico">✈️</span><span class="tt">Tonight</span><span class="ts">In the air or between beds · see Moves</span></button>`;
  }
  if (nm) {
    const sl = sleepsUntil(ctx, nm.date), ico = /train/i.test(nm.mode || '') ? '🚆' : /coach|bus/i.test(nm.mode || '') ? '🚌' : '✈️';
    html += `<button class="tile ht t2" data-go="moves"><span class="ico">${ico}</span><span class="tt">Next move</span><span class="ts">${esc(nm.carrier.split('·')[0].trim())} · ${esc(nm.frm)} → ${esc(nm.to)}</span><span class="ts small">${esc(fmtDate(nm.date))} ${esc(nm.depart)}${sl === 0 ? ' · today!' : sl === 1 ? ' · tomorrow' : ` · in ${sl} sleeps`}</span></button>`;
  }
  const day = dayOf(ctx.date), ev = eventsOn(ctx.date);
  if (day) html += `<button class="tile ht wide t3" data-day="${day.date}"><span class="ico">${ev.length ? '🎟️' : '📅'}</span><span class="tt">Today${ev.length ? ' · ' + esc(ev[0].time) + ' ' + esc(ev[0].event) : ''}</span><span class="ts">${esc(day.plan)}</span>${day.heads_up ? `<span class="ts small">⚠️ ${esc(day.heads_up)}</span>` : ''}</button>`;
  html += `<button class="tile ht t7" data-go="quests"><span class="ico">🏆</span><span class="tt">Quests</span><span class="ts">${Quests.face(q.player)} ${esc(q.name)} · ${q.points} pts · ${q.level.emoji} ${esc(q.level.name)}</span><span class="ts small">${q.pending && q.role === 'parent' ? `⏳ ${q.pending} to approve` : `${q.todayLeft} to do today`}</span></button>`;
  html += `<button class="tile ht t8" data-go="passport"><span class="ico">📘</span><span class="tt">Passport</span><span class="ts">${q.stamps} of ${q.stampsTotal} stamps</span><span class="ts small">Badges and levels</span></button>`;
  html += `<button class="tile ht t4" data-taxi="${esc(ctx.stay ? (ctx.stay.ja_id || 'stay-' + ctx.stay.n) : '')}"><span class="ico">🚕</span><span class="tt">Taxi card</span><span class="ts">${ctx.stay ? "Show the driver tonight's bed" : 'All cards and phrases'}</span></button>`;
  const mob = ((F.trip || {}).family || {}).mobiles || {};
  const calls = [['Mum', intlNum(mob.sarah)], ['Dad', intlNum(mob.andy)], ctx.stay && ctx.stay.phone ? ['Host', ctx.stay.phone] : null, ['Emergency', EMERGENCY_NUMBER[ctx.country]]].filter((c) => c && c[1]);
  html += `<button class="tile ht t5" data-call="1"><span class="ico">📞</span><span class="tt">Call</span><span class="ts">${calls.map((c) => esc(c[0])).join(' · ') || 'Numbers'}</span></button>`;
  html += `<button class="tile ht wide t6" data-kid="1"><span class="ico">🙋</span><span class="tt">I'm lost</span><span class="ts">Your own card: big words, Mum and Dad's numbers, what to say</span></button>`;
  html += Journal.storiesTileHtml(ctx);
  html += `<button class="tile ht wide t2" data-go="where"><span class="ico">🌏</span><span class="tt">Where are we</span><span class="ts">${esc(ctx.before ? "The globe, the route and today's dot" : whereLine(ctx, "The globe, the route and today's dot"))}</span></button>`;
  html += `</div>`;
  const morning = Media.enabled ? Journal.index().filter((m) => m.k === 'photo' && m.tag === 'morning' && m.d === ctx.date).length : 0;
  if (!ctx.before && (!Quests.role() || Quests.isParentDevice())) {
    const snap = Media.enabled ? `<button id="photo-snap">📷 Snap</button>` : '';
    if (morning || localStorage.getItem(photoKey)) html += `<div class="photo-reminder done"><div><b>📸 ${morning ? `${morning} morning photo${morning === 1 ? '' : 's'} in the app` : 'Morning photo done'}</b><br><span class="small">${morning ? 'Ready on the lost-kid card, on every parent phone.' : 'Add one here for the lost-kid card?'}</span></div>${snap}</div>`;
    else html += `<div class="photo-reminder"><div><b>📸 Morning photo</b><br><span class="small">Snap each kid in today's clothes: it goes on the lost-kid card.</span></div>${snap}<button id="photo-done">Done</button></div>`;
  }
  html += `<button class="btn danger block sos" id="home-sos">🆘 SOS · lost kid · sick · disasters</button>`;
  html += `<p class="tiny muted">Built ${esc(BUILT)} · ${esc(VERSION)}${S.preview ? ' · previewing ' + esc(S.preview) + ' (clear it in Settings)' : ''}</p>`;
  const el = $('#screen-home'); el.innerHTML = html;
  const pd = $('#photo-done'); if (pd) pd.onclick = () => { localStorage.setItem(photoKey, '1'); Quests.complete(Quests.state().active, 'photo', ctx.date); renderHome(); };
  const ps = $('#photo-snap'); if (ps) ps.onclick = () => Journal.addPhoto(Quests.state().active, ctx.date, 'morning', true).then((id) => { if (!id) return; localStorage.setItem(photoKey, '1'); if (Quests.isParentDevice()) Quests.complete(Quests.state().active, 'photo', ctx.date); renderHome(); });
  $('#home-sos').onclick = () => show('sos');
  el.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => openDay(b.dataset.day));
  el.querySelectorAll('[data-taxi]').forEach((b) => b.onclick = () => { if (b.dataset.taxi) openTaxiById(b.dataset.taxi); else show('taxi'); });
  el.querySelectorAll('[data-kid]').forEach((b) => b.onclick = () => openKidCard());
  el.querySelectorAll('[data-call]').forEach((b) => b.onclick = () => openCalls(calls));
  wireGo(el);
}
function openCalls(calls) {
  let html = `<h1 class="h1">📞 Call</h1>`;
  if (!calls.some((c) => c[0] === 'Mum' || c[0] === 'Dad')) html += `<div class="card red">Mum and Dad's numbers appear here once they are in extra.yaml (family.mobiles).</div>`;
  html += calls.map((c) => `<a class="btn block sos" href="tel:${String(c[1]).replace(/[^\d+]/g, '')}">${esc(c[0])} · ${esc(c[1])}</a>`).join('');
  html += `<div class="row" style="margin-top:14px"><a class="btn" href="#" data-go="sos">All emergency numbers</a></div>`;
  openModal(html);
  $('#modal-inner').querySelectorAll('[data-go]').forEach((a) => a.onclick = (e) => { e.preventDefault(); closeModal(); show(a.dataset.go); });
}
function renderBook() {
  const items = [['days', '📅', 'Days', 'The plan, day by day'], ['moves', '✈️', 'Moves', 'Flights, trains, buses, taxis'], ['stays', '🛏️', 'Stays', 'Every bed, check-in times'],
    ['taxi', '🚕', 'Taxi cards', 'Japanese and French, phrases'], ['map', '🗺️', 'Map', 'Offline maps, places, GPS'], ['where', '🌏', 'Where are we', 'The globe and the route'], ['protocols', '📋', 'Protocols', 'Lost kid, PACE, phone stolen'],
    ['gates', '✅', 'Before we go', "Mum and Dad's to-do list"], ['quests', '🏆', 'Quests', 'Points, levels, new foods'], ['passport', '📘', 'Passport', 'Stamps and badges'],
    ['vault', '🔒', 'Vault', 'PINs and document numbers'], ['settings', '⚙️', 'Settings', 'Theme, text size, players']];
  $('#screen-book').innerHTML = `<h1 class="h1">📖 Book</h1><div class="book">` + items.filter((i) => !(i[0] === 'vault' && settings.readerMode)).map((i, k) => `<button class="bk c${k % 8}" data-go="${i[0]}"><span class="ico">${i[1]}</span><span class="tt">${esc(i[2])}</span><span class="ts">${esc(i[3])}</span></button>`).join('') + `</div>`;
  wireGo($('#screen-book'));
}
function renderGates() {
  const g = S.family.gates || [];
  $('#screen-gates').innerHTML = `<h1 class="h1">✅ Before we go</h1><p class="small muted">Open gates from the planner's Next Steps tab (Done ones drop off at the next build). Tick them off in the planner.</p>` +
    (g.length ? `<ul class="list gates">` + g.map((x) => `<li><div><b>${esc(x.what)}</b> <span class="chip${/critical|high/i.test(x.priority) ? ' red' : ''}">${esc(x.priority || x.status)}</span></div><div class="small muted">${esc(x.label)}${x.when ? ' · ' + esc(x.when) : ''}${x.where ? ' · ' + esc(x.where) : ''}</div>${x.need ? `<div class="tiny muted">Need: ${esc(x.need)}</div>` : ''}</li>`).join('') + `</ul>` : `<div class="card">Nothing open. 🎉</div>`);
}
function wireGo(root) {
  root.querySelectorAll('[data-go]').forEach((a) => a.onclick = (e) => { e.preventDefault(); show(a.dataset.go); });
  root.querySelectorAll('[data-focus]').forEach((a) => a.onclick = (e) => { e.preventDefault(); closeModal(); focusOnMap(a.dataset.focus); });
}

/* ------------------------------------------------------------------ SOS: one screen for everything urgent (Andy, 10 Oct)
   Big call button, then tiles: Lost kid, I'm lost (the kid's own card), Sick or hurt, Disasters (most likely first for
   the country we are in), Say it (the local-language lines, full screen to hold up), Numbers (the old Emergency page).
   Text comes from extra.yaml protocols: short lines, {em}/{pol} filled with today's numbers. */
const SOS_ICON = { lost: '🧒', kid: '🙋', sick: '🤕', disasters: '⚠️', say: '🗣️', numbers: '📒' };
const COUNTRY_LABEL = { CA: 'Canada', US: 'USA', JP: 'Japan', AU: 'Australia' };
function emNum(ctx) { return EMERGENCY_NUMBER[ctx.country] || '112'; }
function fill(s, ctx) { return String(s || '').replace(/\{em\}/g, emNum(ctx)).replace(/\{pol\}/g, POLICE_NUMBER[ctx.country] || emNum(ctx)); }
function sayLang(ctx) { return ctx.country === 'JP' ? 'ja' : (isMontreal(ctx.city) ? 'fr' : null); }
/* The "say it" lines of a card for where we are: Japanese in Japan, French in Montréal, both before the trip, else English. */
function sayLines(card, ctx) {
  const lang = sayLang(ctx), out = [];
  if ((!lang || lang === 'ja') && card.say_ja) out.push({ lang: 'ja', local: card.say_ja, sub: card.say_romaji || '', en: card.say_en || '' });
  if ((!lang || lang === 'fr') && card.say_fr) out.push({ lang: 'fr', local: card.say_fr, sub: '', en: card.say_en || '' });
  if (!out.length && card.say_en) out.push({ lang: 'en', local: card.say_en, sub: '', en: '' });
  return out;
}
function sayBlock(card, ctx) {
  return sayLines(card, ctx).map((l) => `<div class="say"><div class="${l.lang === 'en' ? 'big' : l.lang}">${esc(l.local)}</div>${l.sub ? `<div class="tiny muted">${esc(l.sub)}</div>` : ''}${l.en && l.lang !== 'en' ? `<div class="small muted">${esc(l.en)}</div>` : ''}<button class="btn small-btn" data-say="${esc(l.local)}" data-say-en="${esc(l.en)}" data-say-sub="${esc(l.sub)}" data-say-lang="${l.lang}">Show big</button></div>`).join('');
}
function wireSay(root) { root.querySelectorAll('[data-say]').forEach((b) => b.onclick = () => openSayCard(b.dataset.say, b.dataset.sayEn, b.dataset.saySub, b.dataset.sayLang)); }
function openSayCard(local, en, sub, lang) {
  openModal(`<div class="say-full"><div class="local ${lang === 'en' ? '' : esc(lang || '')}">${esc(local)}</div>${sub ? `<div class="sub muted">${esc(sub)}</div>` : ''}${en ? `<div class="en">${esc(en)}</div>` : ''}</div>`);
}
function stepsList(steps, ctx) { return `<ol class="steps kid">${(steps || []).map((s) => `<li>${tel(fill(s, ctx))}</li>`).join('')}</ol>`; }
function linesBlock(lines) { return (lines || []).length ? `<div class="row">${lines.map((l) => `<a class="btn" href="tel:${String(l.number).replace(/[^\d+]/g, '')}">📞 ${esc(l.who)} ${esc(l.number)}</a>`).join('')}</div>` : ''; }
function callButtons(ctx) {
  const em = emNum(ctx), pol = POLICE_NUMBER[ctx.country];
  return `<a class="btn danger block sos" href="tel:${em}">📞 Call ${em}</a>` + (pol && pol !== em ? `<a class="btn block sos" href="tel:${pol}">👮 Police ${pol}</a>` : '');
}

function renderSOS() {
  const F = S.family, ctx = currentContext();
  const where = ctx.before ? 'Before the trip: every country is shown' : `${ctx.city} · ${COUNTRY_LABEL[ctx.country] || ''}`;
  let html = `<h1 class="h1 red">🆘 SOS</h1><div class="small muted">${esc(where)}</div>` + callButtons(ctx);
  html += `<div class="tiles">` + [['lost', 'Lost kid'], ['kid', "I'm lost"], ['sick', 'Sick or hurt'], ['disasters', 'Disasters'], ['say', 'Say it'], ['numbers', 'Numbers']]
    .map(([k, label]) => `<button class="tile${k === 'lost' ? ' red' : ''}" data-sos="${k}"><span class="ico">${SOS_ICON[k]}</span>${label}</button>`).join('') + `</div>`;
  html += `<div class="card small muted">Photo of each kid every morning, in today's clothes. Insurance, consulate and pharmacy numbers are under Numbers.</div>`;
  $('#screen-sos').innerHTML = html;
  const open = { lost: openLostKid, kid: openKidCard, sick: openSick, disasters: openDisasters, say: openSayList, numbers: openNumbers };
  $('#screen-sos').querySelectorAll('[data-sos]').forEach((b) => b.onclick = () => open[b.dataset.sos]());
}
function openLostKid() {
  const F = S.family, ctx = currentContext(), lk = (F.protocols || {}).lost_kid || {};
  const base = ctx.city.toLowerCase();
  const cardIds = new Set(F.taxi_cards.filter((c) => (c.base || '').toLowerCase() === base).map((c) => c.id));
  const kobans = (F.koban || []).filter((k) => cardIds.has(k.venue_id));
  const stayKoban = ctx.stay ? kobans.find((k) => k.venue_id === (ctx.stay.ja_id || '')) : null;
  let html = `<h1 class="h1 red">🧒 Lost kid</h1>` + callButtons(ctx);
  html += `<div class="card">${stepsList(lk.steps, ctx)}</div>`;
  html += `<div class="card"><div class="h3">Say</div>${sayBlock(lk, ctx)}</div>`;
  if (stayKoban || kobans.length) {
    const onMap = (k) => (F.overlay.features || []).some((f) => f.properties.id === 'koban-' + k.venue_id) ? ` <a class="btn small-btn" href="#" data-focus="koban-${esc(k.venue_id)}">Map</a>` : '';
    html += `<div class="card"><div class="h3">Nearest police box</div>${stayKoban ? `<div>${tel(stayKoban.note)}${onMap(stayKoban)}</div>` : ''}${kobans.filter((k) => k !== stayKoban).slice(0, 4).map((k) => `<div class="small muted" style="margin-top:6px">${esc(k.venue_id)}: ${tel(k.note)}${onMap(k)}</div>`).join('')}</div>`;
  }
  html += Journal.morningHtml(ctx.date) || `<div class="card red"><b>This morning's photo</b>: open Photos now and have it ready to show.</div>`;
  openModal(html); wireGo($('#modal-inner')); wireSay($('#modal-inner')); Journal.fill($('#modal-inner'));
}
function openKidCard() {
  const F = S.family, ctx = currentContext(), kc = (F.protocols || {}).kid_card || {}, mob = ((F.trip || {}).family || {}).mobiles || {};
  const nums = [['Mum', intlNum(mob.sarah)], ['Dad', intlNum(mob.andy)]].filter((x) => x[1]);
  let html = `<div class="kid-card"><h1 class="h1">🙋 ${esc(kc.title || "I'm lost")}</h1>${stepsList(kc.steps, ctx)}`;
  html += sayLines(kc, ctx).map((l) => `<div class="say-full"><div class="local ${l.lang === 'en' ? '' : l.lang}">${esc(l.local)}</div>${l.sub ? `<div class="sub muted">${esc(l.sub)}</div>` : ''}${l.en && l.lang !== 'en' ? `<div class="en">${esc(l.en)}</div>` : ''}</div>`).join('');
  html += nums.length ? nums.map(([who, n]) => `<a class="btn danger block sos" href="tel:${esc(String(n).replace(/[^\d+]/g, ''))}">📞 ${esc(who)} ${esc(n)}</a>`).join('')
    : `<div class="card red">Mum and dad's numbers go here once they are in extra.yaml (family.mobiles).</div>`;
  html += `</div>`;
  openModal(html);
}
function openSick() {
  const F = S.family, ctx = currentContext(), sk = (F.protocols || {}).sick || {}, E = cityEmergency(hereCity(ctx)) || F.emergency[ctx.country === 'AU' ? 'JP' : ctx.country] || {};
  let html = `<h1 class="h1 red">🤕 Sick or hurt</h1>` + callButtons(ctx);
  html += `<div class="card">${stepsList(sk.steps, ctx)}</div>`;
  if (E.hospitals && E.hospitals.length) html += `<div class="card"><div class="h3">Children's hospital</div>${E.hospitals.slice(0, 2).map((h) => `<div class="hosp"><b>${esc(h.name)}</b><div>${tel(h.address_en + ' · ' + h.phone)}</div>${h.address_ja ? `<div class="ja">${esc(h.address_ja)}</div>` : ''}${h.coord && h.coord.lat != null ? mapsLink(h.coord.lat, h.coord.lon, h.name) : ''}</div>`).join('<hr>')}</div>`;
  html += `<div class="card"><div class="h3">Say</div>${sayBlock(sk, ctx)}</div>`;
  if (E.health_lines && E.health_lines.length) html += `<div class="card"><div class="h3">Nurse / health line</div>${kv(E.health_lines.map((h) => [h.name, `${h.number} · ${h.hours}`]))}</div>`;
  html += `<div class="small muted">Pharmacies, insurance and more: SOS → Numbers.</div>`;
  openModal(html); wireSay($('#modal-inner'));
}
function disasterOrder(ctx) {
  const all = ((S.family.protocols || {}).disasters || []), cc = ctx.country;
  const rk = (d, c) => ((d.rank || {})[c] || 99), minRank = (d) => Math.min(...Object.values(d.rank || {}), 99);
  const here = all.filter((d) => (d.where || []).includes(cc)).sort((a, b) => rk(a, cc) - rk(b, cc));
  const rest = all.filter((d) => !here.includes(d)).sort((a, b) => minRank(a) - minRank(b));
  return { here, rest };
}
function openDisasters() {
  const ctx = currentContext(), { here, rest } = disasterOrder(ctx);
  const btn = (d) => `<button class="tile wide" data-dis="${esc(d.id)}"><span class="ico">${d.icon || '⚠️'}</span><span class="label">${esc(d.title)}</span><span class="tiny muted">${esc((d.where || []).map((c) => COUNTRY_LABEL[c] || c).join(' · '))}</span></button>`;
  let html = `<h1 class="h1 red">⚠️ Disasters</h1>`;
  if (here.length) html += `<div class="small muted">Most likely first, here in ${esc(ctx.city)}.</div><div class="tiles">${here.map(btn).join('')}</div>`;
  if (rest.length) html += `<div class="small muted" style="margin-top:12px">${here.length ? 'Elsewhere on the trip' : 'Most likely first'}</div><div class="tiles">${rest.map(btn).join('')}</div>`;
  openModal(html);
  $('#modal-inner').querySelectorAll('[data-dis]').forEach((b) => b.onclick = () => openDisasterCard(b.dataset.dis));
}
function openDisasterCard(id) {
  const F = S.family, ctx = currentContext(), d = ((F.protocols || {}).disasters || []).find((x) => x.id === id);
  if (!d) return;
  let html = `<h1 class="h1 red">${d.icon || '⚠️'} ${esc(d.title)}</h1><div class="small muted">${esc((d.where || []).map((c) => COUNTRY_LABEL[c] || c).join(' · '))}</div>` + linesBlock(d.lines);
  html += `<div class="card">${stepsList(d.steps, ctx)}</div>`;
  if (d.say_ja || d.say_fr || d.say_en) html += `<div class="card"><div class="h3">Say</div>${sayBlock(d, ctx)}</div>`;
  if ((d.notes || []).length) html += `<div class="card small">${d.notes.map((n) => `<div>${tel(n)}</div>`).join('')}</div>`;
  html += `<button class="btn block" id="dis-back">← All disasters</button>`;
  openModal(html); wireSay($('#modal-inner')); $('#dis-back').onclick = openDisasters;
}
function openSayList() {
  const F = S.family, ctx = currentContext(), P = F.protocols || {};
  const cards = [['🧒 Lost kid', P.lost_kid], ["🙋 I'm lost", P.kid_card], ['🤕 Sick or hurt', P.sick], ['📞 Calling for help', P.call]].concat((P.disasters || []).map((d) => [`${d.icon || '⚠️'} ${d.title}`, d]));
  let html = `<h1 class="h1">🗣️ Say it</h1><div class="small muted">Tap Show big, then hold the screen up.</div>`;
  for (const [label, c] of cards) {
    if (!c || !sayLines(c, ctx).some((l) => l.lang !== 'en')) continue;
    html += `<div class="card"><div class="h3">${esc(label)}</div>${sayBlock(c, ctx)}</div>`;
  }
  openModal(html); wireSay($('#modal-inner'));
}
/* Numbers by city (1 Nov 2026). Andy: "on a date when we are in Montreal we go to Numbers and have to scroll through
   all the Canada numbers from Vancouver, Toronto before we get to any Montreal numbers." The blob groups the emergency
   data by country (F.emergency[cc]); every hospital, pharmacy and consulate carries its base and every health line a
   region, so the app regroups it per city here, at render time. The Sick card uses the same view. */
const BASE_OF_CITY = { Vancouver: 'vancouver', Whistler: 'whistler', Toronto: 'toronto', 'New York': 'newyork', 'Montréal': 'montreal', Montreal: 'montreal', Tokyo: 'tokyo', Nagoya: 'nagoya' };
const REGION_BASES = [['aichi', ['nagoya']], ['nagoya', ['nagoya']], ['tokyo', ['tokyo']], ['japan', ['tokyo', 'nagoya']],
  ['nyc', ['newyork']], ['new york', ['newyork']], ['usa', ['newyork']], ['united states', ['newyork']],
  ['québec', ['montreal']], ['quebec', ['montreal']], ['ontario', ['toronto']], ['british columbia', ['vancouver', 'whistler']], ['bc', ['vancouver', 'whistler']],
  ['canada', ['vancouver', 'whistler', 'toronto', 'montreal']]];
const CONSULATE_BASE = { whistler: 'vancouver', nagoya: 'tokyo' };   // bases without an Australian post of their own
function regionBases(region) { const r = String(region || '').toLowerCase(); const hit = REGION_BASES.find(([k]) => r.includes(k)); return hit ? hit[1] : []; }
function hereCity(ctx) {
  const day = S.family.days.find((d) => d.date === ctx.date), c = day ? Quests.dayCity(day) : '';
  return BASE_OF_CITY[c] ? c : ctx.city;             // a Nagoya day trip counts as Nagoya, not the Tokyo bed
}
function tripCities() {
  const out = [];
  for (const d of S.family.days) { const c = Quests.dayCity(d); if (BASE_OF_CITY[c] && !out.includes(c)) out.push(c); }
  for (const s of S.family.stays) if (BASE_OF_CITY[s.city] && !out.includes(s.city)) out.push(s.city);
  return out;
}
function cityEmergency(city) {
  const F = S.family, base = BASE_OF_CITY[city], cc = COUNTRY[city], E = (F.emergency || {})[cc];
  if (!base || !E) return null;
  const mine = (list, b = base) => (list || []).filter((x) => x.base === b);
  let consulates = mine(E.consulates_verified);
  if (!consulates.length && CONSULATE_BASE[base]) consulates = mine(E.consulates_verified, CONSULATE_BASE[base]);
  if (!consulates.length) consulates = E.consulates || [];
  return { city, base, cc, country: E.name, numbers: E.numbers || [], hospitals: mine(E.hospitals), pharmacies: mine(E.pharmacies),
    health_lines: (E.health_lines || []).filter((h) => regionBases(h.region).includes(base)),
    consulates, insurers: E.insurers || [], medicine: E.medicine || [] };
}
function openNumbers() {
  const ctx = currentContext(), here = hereCity(ctx), cities = tripCities();
  const order = cities.includes(here) ? [here].concat(cities.filter((c) => c !== here)) : cities;
  let html = `<h1 class="h1">📒 Numbers</h1><p class="small muted">${order.includes(here) ? `${esc(here)} is open. Tap another city for its numbers.` : 'Tap a city for its numbers.'}</p>`;
  for (const city of order) {
    const E = cityEmergency(city);
    if (!E) continue;
    const isHere = city === here, key = Quests.CITY_KEY[city] || 'home';
    html += `<details class="numbers-city" style="border-left-color: var(--c-${esc(key)})"${isHere ? ' open' : ''}><summary>${Quests.CITY_EMOJI[city] || '📍'} ${esc(city)} <span class="muted">· ${esc(E.country)}</span>${isHere ? '<span class="chip red">here</span>' : ''}</summary>`;
    html += kv(E.numbers.map((c) => [c.who, c.phone + (c.ref ? ' · ' + c.ref : '')]));
    if (E.hospitals.length) html += `<div class="h3">Hospital for a sick child</div>` + E.hospitals.map((h) => `<div class="card"><b>${esc(h.name)}</b><div>${tel(h.address_en + ' · ' + h.phone + (h.open_24h ? ' · 24 h' : ''))}</div>${h.address_ja ? `<div class="ja">${esc(h.address_ja)}</div>` : ''}${coordLine(h.coord) ? `<div class="mono small">${coordLine(h.coord)}</div>` : ''}<div class="small muted">${esc(h.notes)}</div>${h.coord && h.coord.lat != null ? mapsLink(h.coord.lat, h.coord.lon, h.name) : ''}</div>`).join('');
    if (E.pharmacies.length) html += `<div class="h3">Pharmacy at night</div>` + E.pharmacies.map((p) => `<div class="card"><b>${esc(p.name)}</b><div>${tel(p.address_en + ' · ' + p.phone + ' · ' + p.hours)}</div>${p.address_ja ? `<div class="ja">${esc(p.address_ja)}</div>` : ''}<div class="small muted">${tel(p.notes)}</div></div>`).join('');
    if (E.medicine.length) html += E.medicine.map((m) => `<div class="small muted">${esc(m)}</div>`).join('');
    if (E.health_lines.length) html += `<div class="h3">Health lines</div>` + kv(E.health_lines.map((h) => [h.name, `${h.number} · ${h.hours}`]));
    if (E.consulates.length) html += `<div class="h3">Australian consulate</div>` + E.consulates.map((c) => `<div class="card">${c.who ? tel(`${c.who} — ${c.phone} · ${c.ref}`) : tel(`${c.name} — ${c.address_en} · ${c.phone} · ${c.hours}`)}${c.after_hours ? `<div class="small muted">${tel(c.after_hours)}</div>` : ''}</div>`).join('');
    if (E.insurers.length) html += `<div class="h3">Insurance</div>` + kv(E.insurers.map((c) => [c.who, c.phone + (c.ref ? ' · ' + c.ref : '')]));
    html += `</details>`;
  }
  openModal(html);
}
function openTaxiCard(c) {
  const F = S.family;
  const take = (F.phrases || []).find((p) => p.id === 'take-us-here'), takeFr = (F.phrases || []).find((p) => p.id === 'fr-take-us-here'), kb = (F.koban || []).find((k) => k.venue_id === c.id);
  openModal(`<div class="taxi-full"><div class="muted">${esc(c.title_en)}</div>${c.name_ja ? `<div class="ja">${esc(c.name_ja)}</div>` : ''}${c.name_fr ? `<div class="fr">${esc(c.name_fr)}</div>` : ''}${c.address_ja ? `<div class="addr-ja">${esc(c.address_ja)}</div>${take ? `<div class="ja">${esc(take.ja)}</div>` : ''}` : ''}<div class="big">${esc(c.address_en)}</div>${isMontreal(c.base) && takeFr ? `<div class="fr">${esc(takeFr.fr)}</div>` : ''}${coordLine(c.coord) ? `<div class="mono">${coordLine(c.coord)}</div>` : ''}${c.notes ? `<div class="small muted" style="margin-top:8px">${tel(c.notes)}</div>` : ''}${kb ? `<div class="small" style="margin-top:8px"><b>Police box:</b> ${tel(kb.note)}</div>` : ''}${c.coord && c.coord.lat != null ? mapsLink(c.coord.lat, c.coord.lon, c.title_en) : ''}${c.coord && c.coord.lat != null ? `<div class="row"><a class="btn" href="#" data-focus="${esc(c.id)}">Show on our map</a></div>` : ''}</div>`);
  wireGo($('#modal-inner'));
}
function openTaxiById(id) { const c = (S.family.taxi_cards || []).find((x) => x.id === id); if (c) openTaxiCard(c); }
$('#btn-sos').onclick = () => { if (S.family) show('sos'); };

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
  if (!F) return;                                    // hidden before unlock: lockVault() calls this with nothing to draw
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

function currentTheme() { const t = settings.theme; if (t !== 'auto') return t; return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
function mountMap() {
  if (S.mapMounted || !window.DossierMap) return;
  S.mapMounted = true;
  window.DossierMap.mount({ container: $('#screen-map'), family: S.family, theme: currentTheme(), today: currentContext().date, onTaxi: openTaxiById })
    .then(() => { if (S.vault) window.DossierMap.setVaultFeatures(((S.vault.overlay || {}).features) || []); })
    .catch((e) => { const b = $('#map-packbar'); if (b) b.textContent = 'Map failed: ' + (e.message || e); });
}
function renderMap() {
  const F = S.family;
  const layers = {};
  for (const f of (F.overlay && F.overlay.features) || []) (layers[f.properties.layer] = layers[f.properties.layer] || []).push(f.properties);
  const titles = { stays: 'Stays', moves: 'Airports, stations, pickups', venues: 'Venues', emergency: 'Hospitals, police, pharmacies, consulates, evacuation', rally: 'Rally points (proposed)' };
  let html = `<h1 class="h1">Map</h1>
    <div id="map-wrap"><div id="map"></div><div id="map-packbar">Loading map…</div>
      <button class="btn primary" id="map-me" title="Centre on me">◉ Me</button>
      <div id="map-outside" class="hidden">Outside the offline packs here. <a class="btn" href="#" target="_blank" rel="noopener">Open in Google Maps</a></div>
      <div id="map-card" class="hidden"></div></div>
    <div class="row" id="map-filter"><button class="pill active" data-filter="today">Today + tomorrow</button><button class="pill" data-filter="all">Everything</button><button class="pill" id="map-packs-toggle">Offline maps</button></div>
    <div id="map-packs" class="card hidden"></div>
    <p class="tiny muted">Directions and search: use the Organic Maps or Google Maps buttons on a place. Location is used only on this screen and never stored.</p>
    <h2 class="h2">All places as a list</h2>`;
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
  html += `<ul class="list" id="taxi-list">` + F.taxi_cards.map((c, i) => `<li data-base="${esc(c.base)}"><a href="#" data-card="${i}"><b>${esc(c.title_en)}</b></a>${c.name_ja ? `<div class="ja">${esc(c.name_ja)}</div>` : ''}${c.name_fr ? `<div class="fr">${esc(c.name_fr)}</div>` : ''}<div class="small muted">${esc(c.address_en)}</div></li>`).join('') + `</ul>`;
  const lang0 = isMontreal(currentContext().city) ? 'fr' : 'ja';
  html += `<h2 class="h2">Phrases</h2><div class="pill-row" id="phrase-pills"><button class="pill${lang0 === 'ja' ? ' active' : ''}" data-lang="ja">Japanese</button><button class="pill${lang0 === 'fr' ? ' active' : ''}" data-lang="fr">French · Montréal</button></div>`;
  html += (F.phrases || []).map((p) => phraseCard(p, lang0)).join('');
  $('#screen-taxi').innerHTML = html;
  $('#phrase-pills').onclick = (e) => { const b = e.target.closest('.pill'); if (!b) return; document.querySelectorAll('#phrase-pills .pill').forEach((p) => p.classList.toggle('active', p === b)); document.querySelectorAll('#screen-taxi .phrase').forEach((c) => c.classList.toggle('hidden', c.dataset.lang !== b.dataset.lang)); };
  $('#taxi-pills').onclick = (e) => { const b = e.target.closest('.pill'); if (!b) return; document.querySelectorAll('#taxi-pills .pill').forEach((p) => p.classList.toggle('active', p === b)); document.querySelectorAll('#taxi-list li').forEach((li) => li.classList.toggle('hidden', b.dataset.base !== 'all' && li.dataset.base !== b.dataset.base)); };
  $('#taxi-list').onclick = (e) => {
    const a = e.target.closest('[data-card]'); if (!a) return; e.preventDefault();
    openTaxiCard(F.taxi_cards[+a.dataset.card]);
  };
}

function renderProtocols() {
  const P = S.family.protocols || {}, lk = P.lost_kid || {}, pace = P.pace || {}, ps = P.phone_stolen || {};
  let html = `<h1 class="h1">Protocols</h1>`;
  html += `<div class="card"><div class="h2">Lost kid</div>${stepsList(lk.steps, currentContext())}<div><b>Say:</b> ${esc(lk.say_en || '')}</div>${lk.say_ja ? `<div class="ja">${esc(lk.say_ja)}</div>` : ''}${lk.say_romaji ? `<div class="tiny muted">${esc(lk.say_romaji)}</div>` : ''}${lk.say_fr ? `<div class="fr">${esc(lk.say_fr)} <span class="tiny muted">Montréal</span></div>` : ''}<div class="red">${esc(lk.morning_photo || '')}</div></div>`;
  html += `<div class="card small muted">Sick or hurt, the kids' own "I'm lost" card, disasters and the say-it lines are under SOS.</div>`;
  html += `<div class="card"><div class="h2">PACE</div>${kv([['Primary', pace.primary], ['Alternate', pace.alternate], ['Contingency', pace.contingency], ['Emergency', pace.emergency]])}</div>`;
  html += `<div class="card"><div class="h2">Phone stolen</div><div class="h3">iPhone (Sarah)</div><ol class="steps">${(ps.ios || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol><div class="h3">Android (Andy)</div><ol class="steps">${(ps.android || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>${kv([['SIM / eSIM', ps.sim], ['Wallet cards', ps.wallet_lock], ['Sign out everywhere', ps.sign_out_everywhere]])}${(ps.carriers || []).some((c) => c && (c.carrier || c.lost_sim)) ? `<div class="h3">Carriers: suspend the SIM or eSIM</div>${kv((ps.carriers || []).filter((c) => c && (c.carrier || c.lost_sim)).map((c) => [c.who || 'Carrier', [c.carrier, c.lost_sim].filter(Boolean).join(' · ') + (c.note ? ' — ' + c.note : '')]))}` : ''}<div class="small muted">Card-lock list: in the vault.</div></div>`;
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
  if (window.DossierMap) window.DossierMap.setVaultFeatures([]);
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
      <div class="card"><div class="h2">Card-lock list</div>${(V.card_lock || []).length ? kv(V.card_lock.map((r) => [r.label || '·', r.text + (r.note ? ' — ' + r.note : '')])) : `<div class="small">${esc(V.card_lock_note || '')}</div>`}</div>`;
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
      if (window.DossierMap) window.DossierMap.setVaultFeatures(((S.vault.overlay || {}).features) || []);
    } catch (ex) { err.textContent = 'That did not open the vault.'; err.classList.remove('hidden'); }
  };
}

/* ------------------------------------------------------------------ settings and updates */
/* Settings controls are all buttons (31 Oct): on Andy's phone the checkboxes and the native date input did not take
   taps, so each option is a big switch and the preview day is picked from a strip of day chips. */
function switchRow(opt, text) {
  const on = !!settings[opt];
  return `<button class="switch${on ? ' on' : ''}" data-switch="${opt}" role="switch" aria-checked="${on}"><span class="sw-track"><span class="sw-knob"></span></span><span class="sw-text">${text}</span><span class="sw-state">${on ? 'On' : 'Off'}</span></button>`;
}
function previewPicker() {
  const days = S.family.days, cur = S.preview || '', i = days.findIndex((d) => d.date === cur);
  const chip = (d) => { const c = Quests.dayCity(d); return `<button class="day${d.date === cur ? ' today' : ''}" data-pv="${d.date}"><span class="de">${Quests.CITY_EMOJI[c] || '📍'}</span><span class="dn">${+d.date.slice(8, 10)}</span><span class="dw">${esc(fmtDate(d.date).slice(-3))}</span></button>`; };
  const status = cur && i >= 0 ? `Previewing <b>${esc(fmtDate(cur))}</b> · ${esc(Quests.dayCity(days[i]))} · day ${i + 1} of ${days.length}` : 'Showing the real date.';
  return `<div class="small" id="pv-status">${status}</div>
    <div class="strip pv-strip" id="pv-strip"><button class="day more${cur ? '' : ' today'}" data-pv=""><span class="de">⏰</span><span class="dn">Now</span><span class="dw">real</span></button>${days.map(chip).join('')}</div>
    <div class="row"><button class="btn" id="pv-prev">◀ Day before</button><button class="btn" id="pv-next">Day after ▶</button><button class="btn" id="opt-preview-clear"${cur ? '' : ' disabled'}>Back to today</button></div>`;
}
function renderSettings() {
  /* Grandma and Grandpa's phone (3 Nov 2026) keeps Settings foolproof: no confetti/sound card (nothing there plays), no reader
     mode, and whose phone this is, PIN-less opening and Forget this device sit behind the device PIN (Set-up). */
  const grand = Quests.isGrandDevice(), setup = grand && S.setupOpen;
  $('#screen-settings').innerHTML = `<h1 class="h1">⚙️ Settings</h1>
    <div class="card"><div class="h3">Theme</div><div class="row">${['auto', 'light', 'dark'].map((t) => `<button class="pill${settings.theme === t ? ' active' : ''}" data-theme="${t}">${t}</button>`).join('')}</div></div>
    <div class="card"><div class="h3">Text size</div>${switchRow('bigText', grand ? 'Big text' : 'Big text (for the kids and tired eyes)')}</div>
    ${grand ? '' : `<div class="card"><div class="h3">Confetti, animations and sounds</div><p class="small muted">Auto follows the phone's reduce-motion setting.</p><div class="row">${['auto', 'on', 'off'].map((t) => `<button class="pill${FX.pref() === t ? ' active' : ''}" data-fx="${t}">${t}</button>`).join('')}<button class="btn small-btn" id="opt-fx-demo">Show me a level-up</button></div>${switchRow('sound', 'Sound effects: ticks, badges and level-ups')}<p class="tiny muted">Sounds start after the first tap on the phone; the ring/silent switch still wins.</p></div>`}
    ${Quests.settingsCard()}
    <div class="card"><div class="h3">Photos and journal</div><div class="small" id="media-msg">…</div>${Media.canSaveOriginals() ? `<div class="small" id="orig-msg"></div>` : ''}<div class="row"><button class="btn" id="opt-media-dl">Download all pictures (Wi-Fi)</button>${Quests.isParentDevice() || Quests.isGrandDevice() ? `<button class="btn" id="opt-media-clear">Clear downloaded pictures here</button>` : ''}${Media.canSaveOriginals() ? `<button class="btn" id="opt-orig-save">Save originals to Photos</button><button class="btn" id="opt-orig-clear">Clear saved originals</button>` : ''}</div>${Media.origHint() ? `<p class="tiny muted">${esc(Media.origHint())}</p>` : ''}${Quests.isParentDevice() ? `<div class="row"><button class="btn danger" id="opt-stories-wipe">🗑️ Delete all stories and photos (everyone)</button></div>` : ''}<div class="tiny mono" id="diag" style="margin-top:8px;white-space:pre-wrap"></div><div class="row"><button class="btn" id="opt-errlog-clear">Clear error log</button></div><p class="tiny muted">Pictures and pages are encrypted on this device and in the cloud; only an unlocked device can open them, so the PIN and the phone's own lock are the gate.</p></div>
    ${Quests.isGrandDevice() ? '' : `<div class="card"><div class="h3">Preview a trip day</div><p class="small muted">Shows the app as it will look on that day: for testing and the dry run. Tap a day; tap Now to come back.</p>${previewPicker()}</div>`}
    ${grand && !setup ? `<div class="card"><div class="h3">Set-up</div><p class="small muted">Whose phone this is, opening without a PIN, and forgetting the device sit behind the device PIN, so nothing changes by accident.</p><div class="row"><button class="btn" id="opt-setup">Open set-up (asks for the PIN)</button></div></div>` : ''}
    ${setup ? Quests.roleCard() : ''}
    ${grand && !setup ? '' : `<div class="card"><div class="h3">This device</div>
      ${grand ? '' : switchRow('readerMode', 'Reader mode: hide the Vault (for the iPad)')}
      ${switchRow('autoFamily', 'Open the family view without a PIN on this device')}
      <button class="btn block" id="opt-forget">Forget this device (wipe stored keys, PINs and quest scores)</button></div>`}
    <div class="card"><div class="h3">Build</div><div>${esc(VERSION)} · built ${esc(BUILT)}</div><button class="btn block" id="opt-update">Check for a newer build</button><div class="small muted" id="update-msg"></div></div>
    <div class="card small muted">Storage: <span id="storage-msg">…</span></div>`;
  document.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => { settings.theme = b.dataset.theme; renderSettings(); if (window.DossierMap) window.DossierMap.setTheme(currentTheme()); });
  document.querySelectorAll('[data-fx]').forEach((b) => b.onclick = () => { FX.setPref(b.dataset.fx); const y = window.scrollY; renderSettings(); window.scrollTo(0, y); });
  const fd = $('#opt-fx-demo'); if (fd) fd.onclick = () => FX.demo();          // absent on Grandma and Grandpa's phone
  document.querySelectorAll('[data-switch]').forEach((b) => b.onclick = () => {
    const opt = b.dataset.switch; settings[opt] = !settings[opt];
    if (opt === 'readerMode') { renderBook(); if (settings.readerMode) lockVault(); }
    const y = window.scrollY; renderSettings(); window.scrollTo(0, y);
  });
  const fg = $('#opt-forget'); if (fg) fg.onclick = () => { if (confirm('Forget this device? You will need the passphrase again.')) forgetDevice(); };
  const su = $('#opt-setup');
  if (su) su.onclick = async () => {                   // the grandparents' gate: the device PIN opens the role, PIN-less opening and Forget until Settings is left
    const pin = prompt('Device PIN to open set-up:'); if (pin === null) return;
    if (!(await verifyPin(pin))) { alert('That is not the PIN.'); return; }
    S.setupOpen = true; const y = window.scrollY; renderSettings(); window.scrollTo(0, y);
  };
  $('#opt-update').onclick = () => checkForUpdate(true);
  const setPreview = (v) => { S.preview = v || null; if (v) localStorage.setItem('previewDate', v); else localStorage.removeItem('previewDate'); rerender(); Quests.refreshTop(); const y = window.scrollY; renderSettings(); window.scrollTo(0, y); Quests.checkNewBadges(currentContext()); };
  const dates = S.family.days.map((d) => d.date), pi = dates.indexOf(S.preview || '');
  document.querySelectorAll('[data-pv]').forEach((b) => b.onclick = () => setPreview(b.dataset.pv));
  const pvp = $('#pv-prev'), pvn = $('#pv-next'), pvc = $('#opt-preview-clear');          // absent on Grandma and Grandpa's phone
  if (pvp) pvp.onclick = () => setPreview(pi < 0 ? dates[dates.length - 1] : pi === 0 ? '' : dates[pi - 1]);
  if (pvn) pvn.onclick = () => setPreview(pi < 0 ? dates[0] : pi >= dates.length - 1 ? '' : dates[pi + 1]);
  if (pvc) pvc.onclick = () => setPreview('');
  const cur = $('#pv-strip .day.today'); if (cur) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
  Quests.wireSettings($('#screen-settings'));
  const mm = $('#media-msg');
  if (!Media.enabled) mm.textContent = 'This build has no picture key: pages and photos need a full rebuild of the app.';
  else Media.usage().then((u) => { mm.textContent = `${u.count} picture${u.count === 1 ? '' : 's'} on this device · ${u.bytes < 1048576 ? Math.round(u.bytes / 1024) + ' KB' : (u.bytes / 1048576).toFixed(1) + ' MB'}${u.pending ? ` · ${u.pending} waiting to upload` : ''}`; });
  const dl = $('#opt-media-dl'); if (dl) dl.onclick = () => { dl.disabled = true; Journal.downloadAll((done, total) => { mm.textContent = `Downloading ${done} of ${total}…`; }).then(() => { dl.disabled = false; renderSettings(); }); };
  const om = $('#orig-msg');
  if (om) { const o = Media.originalsSummary(), mb = (n) => (n / 1048576).toFixed(1) + ' MB'; om.textContent = `${o.waiting} full-size original${o.waiting === 1 ? '' : 's'} not yet in Photos (${mb(o.waitingBytes)})${o.saved ? ` · ${o.saved} already saved (${mb(o.savedBytes)}) can be cleared` : ''}`; }
  const osv = $('#opt-orig-save'); if (osv) osv.onclick = () => { osv.disabled = true; Media.saveOriginals().then(() => renderSettings()).catch((e) => { osv.disabled = false; if (e && e.name !== 'AbortError') alert(e.message || 'Could not hand the photos over.'); }); };
  const ocl = $('#opt-orig-clear'); if (ocl) ocl.onclick = () => { if (confirm('Remove the full-size originals that are already in Photos from the app?')) Media.clearSavedOriginals().then(() => renderSettings()); };
  const sw = $('#opt-stories-wipe');
  if (sw) sw.onclick = () => {
    if (!confirm('Delete every story, reply, page and picture for the whole family, on every device? This cannot be undone.')) return;
    sw.disabled = true; Quests.wipeStories();
    Media.wipe().then(() => { try { localStorage.removeItem('storyDraft'); } catch (e) { /* blocked */ } Journal.warm(); renderSettings(); });
  };
  const mc = $('#opt-media-clear'); if (mc) mc.onclick = () => { if (confirm("Remove downloaded pictures from this device? Cloud copies stay, and so do this device's own pictures that are still waiting to upload.")) Media.clearDownloaded().then(() => renderSettings()); };
  const dg = $('#diag');
  if (dg) {
    const sy = Sync.status ? Sync.status() : {}, md = Media.diag ? Media.diag() : {};
    let log = []; try { log = JSON.parse(localStorage.getItem('errlog') || '[]'); } catch (e) { /* none */ }
    const when = (t) => (t ? new Date(t).toTimeString().slice(0, 8) : 'never');
    Media.usage().catch(() => null).then((u) => {
      dg.textContent = [
        `${VERSION} · built ${BUILT} · ${navigator.onLine ? 'online' : 'offline'} · ${navigator.serviceWorker && navigator.serviceWorker.controller ? 'sw on' : 'no sw'} · ${Quests.role() || 'no role'}`,
        `picture key: ${Media.enabled ? 'yes' : 'NO'} · mode ${md.mode || '?'} · pictures here ${u ? u.count : '?'} · waiting to upload ${u ? u.pending : '?'}`,
        `sync: ${sy.enabled ? 'on' : 'OFF'} · last ${when(sy.last)} · ${sy.error ? 'error ' + sy.error : 'ok'}${sy.busy ? ' · busy' : ''}${sy.dirty ? ' · unsent' : ''}`,
        `last add: ${md.add || '-'} · last upload: ${md.up || '-'} · last download: ${md.down || '-'} · last open: ${md.open || '-'}`,
        `journal: ${Journal.diag ? Journal.diag() : '-'}`,
        `share: ${window.Postcard && Postcard.diag ? Postcard.diag() : '-'}`,
        `sound: ${(() => { const s = FX.sfxState(); return `${s.on ? 'on' : 'off'} · audio ${s.ctx} · ${s.played} notes played`; })()}`,
        log.length ? 'errors:\n' + log.join('\n') : 'errors: none',
      ].join('\n');
    });
  }
  const ec = $('#opt-errlog-clear'); if (ec) ec.onclick = () => { localStorage.removeItem('errlog'); renderSettings(); };
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
document.querySelectorAll('#nav button').forEach((b) => b.onclick = () => show(b.dataset.screen));
Nav.start();
$('#btn-points').onclick = () => { if (S.family) show('quests'); };
$('#btn-settings').onclick = () => { if (S.family) show('settings'); };
applyTheme();
applyBigText();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => { const nw = reg.installing; nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) checkForUpdate(); }); });
  }).catch(() => {});
}
startFamily().catch((e) => { ui.sub.textContent = 'Could not load the dossier data.'; unlockError(String(e.message || e)); });
