#!/usr/bin/env node
/* World Adventure: the trip-file tool. Plain Node (16 or newer), nothing to install.

   The app reads two sealed files next to index.html: family.enc (the trip) and vault.enc (the sensitive things).
   Each is a JSON document sealed with a passphrase: PBKDF2-SHA256 (600,000 rounds) -> AES-256-GCM, written as
   { v, kdf, iter, salt, iv, ct } with base64 fields; ct ends with the 16-byte GCM tag. app.js opens them with
   WebCrypto (deriveKey / decryptWith). A guest copy made in the app (Settings -> "Show the app to a friend") is the
   same envelope, so this tool opens those too.

     node tools/trip.js unpack <file> [passphrase] [out.json]   open a sealed file (family.enc, vault.enc, a guest copy)
     node tools/trip.js pack   <in.json> [passphrase] <out.enc> seal a JSON document (checks it first)
     node tools/trip.js check  <in.json>                        say what the app would trip over, without sealing
     node tools/trip.js newkey                                  a fresh picture key for trip.sync.media

   Leave the passphrase out and it is read from the environment variable TRIP_PASSPHRASE (keeps it out of the shell
   history). */
'use strict';
const fs = require('fs'), crypto = require('crypto');
const ITER = 600000;
const SAMPLE_MEDIA_KEY = 'c3RhcnRlci1zYW1wbGUta2V5LW5vdC1yZWFsLTAwMDE=';   // the one in tools/sample-trip.json: fine to try things with, not to keep

function open(env, pass) {
  if (!env || !env.salt || !env.iv || !env.ct || !env.iter) throw new Error('not a sealed file from this app (salt, iv, ct, iter expected)');
  const key = crypto.pbkdf2Sync(pass, Buffer.from(env.salt, 'base64'), env.iter, 32, 'sha256'), ct = Buffer.from(env.ct, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
  d.setAuthTag(ct.subarray(ct.length - 16));
  try { return JSON.parse(Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8')); }
  catch (e) { throw new Error('that passphrase does not open this file'); }
}
function seal(obj, pass) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.pbkdf2Sync(pass, salt, ITER, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final(), c.getAuthTag()]);
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') };
}

/* ---- check: the fields the app uses without a guard, and the names it only recognises when spelt its way.
   The tables below mirror app.js (TZ, COUNTRY, BASE_OF_CITY), quests.js (CITIES, dayCity) and globe.js (AIRPORT): when
   you change the cities in the app, change them here too. */
const KNOWN = ['Vancouver', 'Whistler', 'Toronto', 'Montréal', 'Montreal', 'New York', 'Tokyo', 'Nagoya', 'Calgary', 'Home', 'Brisbane', 'Cairns', 'Townsville'];
const CITIES = ['Brisbane', 'Vancouver', 'Whistler', 'Toronto', 'New York', 'Montréal', 'Tokyo', 'Nagoya', 'Cairns', 'Townsville'];
const COUNTRY = { Vancouver: 'CA', Whistler: 'CA', Toronto: 'CA', 'Montréal': 'CA', Montreal: 'CA', 'New York': 'US', Tokyo: 'JP', Nagoya: 'JP', Calgary: 'CA' };
const TAXI_BASES = ['vancouver', 'whistler', 'toronto', 'new york', 'newyork', 'montréal', 'montreal', 'tokyo', 'nagoya'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
function dayCity(d) {                                 // quests.js dayCity, with null where the app would quietly say 'Home'
  const w = String(d.where || '');
  if (/in the air/i.test(String(d.sleep || ''))) return 'Air';
  if (/in the air|calgary/i.test(w) && !/→\s*(Tokyo|Toronto|Vancouver)/.test(w)) return 'Air';
  if (/nagoya/i.test(w)) return 'Nagoya';
  const tail = w.includes('→') ? w.split('→').pop() : w;
  for (const c of CITIES) if (tail.toLowerCase().includes(c.toLowerCase())) return c;
  if (/home/i.test(tail)) return 'Home';
  for (const c of CITIES) if (w.toLowerCase().includes(c.toLowerCase())) return c;
  return null;
}
function check(o) {
  const err = [], warn = [], arr = (x) => Array.isArray(x), str = (x) => typeof x === 'string' && x.length > 0;
  if (o && arr(o.stay_pins)) {                        // a vault
    for (const k of ['stay_pins', 'door_codes', 'policies', 'surprise']) if (!arr(o[k])) err.push(`vault.${k} must be a list (it may be empty)`);
    if (!o.entry || !arr(o.entry.eta) || !arr(o.entry.esta)) err.push('vault.entry.eta and vault.entry.esta must be lists (they may be empty)');
    return { kind: 'vault', err, warn };
  }
  if (!o || !arr(o.days)) { err.push('neither a trip (days[] expected) nor a vault (stay_pins[] expected)'); return { kind: 'unknown', err, warn }; }
  const t = o.trip || {};
  if (!ISO.test(t.start || '') || !ISO.test(t.end || '')) err.push('trip.start and trip.end must be YYYY-MM-DD');
  if (!o.days.length) err.push('days[] is empty');
  o.days.forEach((d, i) => {
    if (!ISO.test(d.date || '')) err.push(`days[${i}].date must be YYYY-MM-DD`);
    for (const k of ['label', 'where', 'sleep', 'plan']) if (typeof d[k] !== 'string') err.push(`days[${i}].${k} must be text`);
    if (i && o.days[i - 1].date >= d.date) err.push(`days[${i}].date is not after the day before it`);
    if (dayCity(d) === null) warn.push(`days[${i}] (${d.date}): "${d.where}" names no city the app knows, so it counts as Home. Known: ${CITIES.join(', ')} (Montréal needs its accent)`);
  });
  if (o.days.length && (o.days[0].date !== t.start || o.days[o.days.length - 1].date !== t.end)) warn.push('trip.start / trip.end are not the first and last day in days[]');
  if (!arr(o.stays) || !o.stays.length) err.push('stays[] needs at least one stay (the app reads stays[0].checkin_date)');
  (o.stays || []).forEach((s, i) => {
    for (const k of ['city', 'property', 'address', 'checkin_date', 'checkout_date']) if (!str(s[k])) err.push(`stays[${i}].${k} is missing`);
    if (str(s.city) && !KNOWN.includes(s.city)) warn.push(`stays[${i}].city "${s.city}" is not a city the app knows: clock, country and emergency numbers fall back to defaults`);
    if (s.checkin_date >= s.checkout_date) err.push(`stays[${i}] checks out on or before it checks in`);
    if (i && o.stays[i - 1].checkin_date > s.checkin_date) err.push(`stays[${i}] is out of date order`);
    if (s.coord && (typeof s.coord.lat !== 'number' || typeof s.coord.lon !== 'number') && (s.coord.lat !== null || s.coord.lon !== null)) err.push(`stays[${i}].coord needs numbers for lat and lon (or leave coord out)`);
  });
  if (!arr(o.moves)) err.push('moves[] must be a list');
  (o.moves || []).forEach((m, i) => {
    if (!str(m.carrier)) err.push(`moves[${i}].carrier is missing (the app splits it at "·")`);
    if (!ISO.test(m.date || '')) err.push(`moves[${i}].date must be YYYY-MM-DD`);
    if (m.bags && typeof m.bags.checked !== 'string') err.push(`moves[${i}].bags.checked must be text when bags is given`);
    if (i && o.moves[i - 1].date > m.date) err.push(`moves[${i}] is out of date order`);
    if (!KNOWN.some((c) => String(m.frm || '').includes(c)) || !KNOWN.some((c) => String(m.to || '').includes(c))) warn.push(`moves[${i}]: "${m.frm}" → "${m.to}": a place the app does not know, so the globe will not draw this leg`);
  });
  for (const k of ['transfers', 'taxi_cards']) if (!arr(o[k])) err.push(`${k}[] must be a list (it may be empty)`);
  (o.taxi_cards || []).forEach((c, i) => {
    for (const k of ['id', 'title_en', 'address_en']) if (!str(c[k])) err.push(`taxi_cards[${i}].${k} is missing`);
    if (!TAXI_BASES.includes(String(c.base || ''))) warn.push(`taxi_cards[${i}].base "${c.base}" is not one of: ${TAXI_BASES.join(', ')} (lower case), so it shows under no city`);
  });
  if (!o.emergency || typeof o.emergency !== 'object') err.push('emergency{} must be there, keyed by country: CA, US, JP');
  else {
    const need = new Set(['JP']);                     // before the trip the app shows the JP numbers
    for (const s of o.stays || []) if (COUNTRY[s.city]) need.add(COUNTRY[s.city]);
    for (const cc of need) if (!o.emergency[cc]) warn.push(`emergency.${cc} is missing: the "sick or hurt" card will be empty there`);
    for (const [cc, E] of Object.entries(o.emergency)) for (const h of (E.hospitals || []).concat(E.pharmacies || [])) if (!str(h.address_en) || !str(h.phone)) warn.push(`emergency.${cc}: "${h.name}" needs address_en and phone (they are shown joined together)`);
  }
  if (!o.overlay || !arr(o.overlay.features)) err.push('overlay.features[] must be a list (it may be empty)');
  else o.overlay.features.forEach((f, i) => { const p = f.properties || {}; if (typeof p.lat !== 'number' || typeof p.lon !== 'number') err.push(`overlay.features[${i}].properties needs lat and lon as numbers (as well as geometry.coordinates [lon, lat])`); });
  const sy = t.sync || {};
  if (!sy.media) warn.push('trip.sync.media is missing: photos and postcards stay switched off. `node tools/trip.js newkey` makes one');
  else if (Buffer.from(sy.media, 'base64').length !== 32) err.push('trip.sync.media must be 32 random bytes in base64 (`node tools/trip.js newkey`)');
  else if (sy.media === SAMPLE_MEDIA_KEY) warn.push('trip.sync.media is still the sample key: make your own with `node tools/trip.js newkey` before real pictures go in, and never change it afterwards');
  if (!!sy.url !== !!sy.token) warn.push('trip.sync needs both url and token for the devices to sync; with one of them sync stays off');
  return { kind: 'trip', err, warn };
}
function report(r) {
  for (const w of r.warn) console.error('  note:  ' + w);
  for (const e of r.err) console.error('  ERROR: ' + e);
  if (!r.err.length) console.error(`  ${r.kind}: nothing the app would trip over${r.warn.length ? ' (' + r.warn.length + ' note' + (r.warn.length === 1 ? '' : 's') + ' above)' : ''}`);
  return !r.err.length;
}

const [cmd, ...a] = process.argv.slice(2);
const pass = (given) => { const p = given || process.env.TRIP_PASSPHRASE; if (!p) throw new Error('no passphrase: give it after the file name, or set TRIP_PASSPHRASE'); return p; };
try {
  if (cmd === 'unpack' && a[0]) {
    const out = a.length >= 3 ? a[2] : (a[1] && /\.json$/i.test(a[1]) ? a[1] : null), given = out === a[1] ? null : a[1];
    const text = JSON.stringify(open(JSON.parse(fs.readFileSync(a[0], 'utf8')), pass(given)), null, 1);
    if (out) { fs.writeFileSync(out, text + '\n'); console.error('opened ' + a[0] + ' -> ' + out); } else process.stdout.write(text + '\n');
  } else if (cmd === 'pack' && a.length >= 2) {
    const out = a[a.length - 1], given = a.length >= 3 ? a[1] : null, obj = JSON.parse(fs.readFileSync(a[0], 'utf8'));
    if (!report(check(obj))) throw new Error('not sealed: fix the errors above first');
    fs.writeFileSync(out, JSON.stringify(seal(obj, pass(given))));
    console.error('sealed ' + a[0] + ' -> ' + out + ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
  } else if (cmd === 'check' && a[0]) {
    if (!report(check(JSON.parse(fs.readFileSync(a[0], 'utf8'))))) process.exit(1);
  } else if (cmd === 'newkey') {
    console.log(crypto.randomBytes(32).toString('base64'));
  } else {
    console.error('usage:\n  node tools/trip.js unpack <file> [passphrase] [out.json]\n  node tools/trip.js pack <in.json> [passphrase] <out.enc>\n  node tools/trip.js check <in.json>\n  node tools/trip.js newkey\n(no passphrase given: it is read from TRIP_PASSPHRASE)');
    process.exit(2);
  }
} catch (e) { console.error('trip.js: ' + (e && e.message || e)); process.exit(1); }
