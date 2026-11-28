#!/usr/bin/env node
/* World Adventure: the checks that run on every pull request (.github/workflows/check.yml), and by hand:

     node tools/check.js

   Plain Node, nothing to install. It reads the files as they are and fails (exit 1) on the mistakes that have bitten:
   - the build's number written differently in its three places (v51 did that, and every phone offered the update for ever);
   - a file the app needs that is missing from the offline list in sw.js, or a listed file that does not exist
     (the first breaks airplane mode, the second makes every update fail);
   - a script that does not parse, or uses something the old tablet's browser does not have;
   - dates back in the public map-pack list. */
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const errors = [], notes = [];
const fail = (m) => errors.push(m), ok = (m) => notes.push(m);

/* ---- 1. one build number, three places */
const html = read('index.html'), sw = read('sw.js');
const inPage = (html.match(/<body[^>]*data-version="([^"]+)"/) || [])[1];
const inWorker = (sw.match(/^const VERSION = '([^']+)';/m) || [])[1];
let ver = {};
try { ver = JSON.parse(read('version.json')); } catch (e) { fail('version.json does not parse: ' + e.message); }
if (!inPage || !inWorker || !ver.label) fail(`could not read the build number (index.html: ${inPage}, sw.js: ${inWorker}, version.json: ${ver.label})`);
else if (inPage !== inWorker || inPage !== ver.label || 'v' + ver.version !== ver.label) fail(`the build number differs: index.html says ${inPage}, sw.js says ${inWorker}, version.json says ${ver.label} (version ${ver.version}). All three must agree.`);
else ok(`build ${inPage} in all three places`);

/* ---- 2. the offline list in sw.js against the files that are there */
const m = sw.match(/const SHELL = \['\.\/'\]\.concat\((\[[\s\S]*?\])\);/);
let shell = [];
if (!m) fail('could not find the SHELL list in sw.js');
else { try { shell = JSON.parse(m[1]); } catch (e) { fail('the SHELL list in sw.js is not a plain list of quoted paths: ' + e.message); } }
/* not part of the offline shell on purpose: the worker itself, map packs (fetched on demand), and everything that is
   about the repository and not the app */
const SKIP = [/^sw\.js$/, /^vendor\/LICENSE/, /\.apk$/, /^tiles\/.*\.pmtiles$/, /^tools\//, /^README/i, /^HANDOVER/i, /^\.github\//, /^\.git\//, /^\.nojekyll$/, /^\.gitignore$/, /^node_modules\//];
const walk = (dir, out) => { for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const rel = (dir ? dir + '/' : '') + e.name; if (e.name === '.git' || e.name === 'node_modules') continue; if (e.isDirectory()) walk(rel, out); else out.push(rel); } return out; };
const files = walk('', []).filter((f) => !SKIP.some((re) => re.test(f)));
const listed = new Set(shell.map((s) => s.replace(/^\.\//, '')));
for (const f of files) if (!listed.has(f)) fail(`${f} is in the repository but not in the SHELL list in sw.js: it would not work offline. Add "./${f}" to the list, or to SKIP in tools/check.js if it is not part of the app.`);
for (const s of listed) if (!fs.existsSync(path.join(root, s))) fail(`sw.js lists ./${s} for offline use, but there is no such file: every update would fail to install.`);
if (shell.length && !errors.some((e) => /SHELL|offline/.test(e))) ok(`${shell.length} files in the offline list, all present, none left out`);

/* ---- 3. every script the page loads is there, parses, and stays inside what the old tablet's browser knows */
const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((x) => x[1]);
for (const s of scripts) if (!fs.existsSync(path.join(root, s))) fail(`index.html loads ${s}, which does not exist`);
const own = fs.readdirSync(root).filter((f) => /\.js$/.test(f));
for (const f of own) {
  let r = spawnSync(process.execPath, ['--check', path.join(root, f)], { encoding: 'utf8' });
  if (r.status !== 0 && /import statement|Unexpected token 'export'|await is only valid/.test(r.stderr)) r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: read(f), encoding: 'utf8' });
  if (r.status !== 0) fail(`${f} does not parse:\n${String(r.stderr).split('\n').slice(0, 6).join('\n')}`);
}
ok(`${own.length} scripts parse`);
/* The kids' tablet runs a 2019 browser and the grandparents' phone an old one too. These are the newer bits of JavaScript
   that have no place in the scripts those devices run. map.js and globe.js never run there (compat.js: "lite"). A line
   that really needs one can end with the comment  old-ok  to be let through. */
const OLD = [[/\?\.(?=[A-Za-z_$[(])/, 'optional chaining (?.)'], [/\?\?/, 'the ?? operator'], [/\.replaceAll\(/, '.replaceAll()'], [/\.at\(/, '.at()'], [/\(\?<[=!]/, 'a look-behind in a regular expression'], [/\bstructuredClone\(/, 'structuredClone()']];
const stripped = (line) => line.replace(/\/\/.*$/, '').replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');   // comments and plain strings out of the way (template strings stay: they hold code)
for (const f of own.filter((x) => !/^(map|globe|sw)\.js$/.test(x))) {
  let inBlock = false;
  read(f).split('\n').forEach((line, i) => {
    if (/old-ok/.test(line)) return;
    let l = line;
    if (inBlock) { const e = l.indexOf('*/'); if (e < 0) return; l = l.slice(e + 2); inBlock = false; }
    l = l.replace(/\/\*.*?\*\//g, '');
    const b = l.indexOf('/*'); if (b >= 0) { l = l.slice(0, b); inBlock = true; }
    l = stripped(l);
    for (const [re, what] of OLD) if (re.test(l)) fail(`${f}:${i + 1} uses ${what}, which the old tablet's browser does not have:\n    ${line.trim().slice(0, 140)}`);
  });
}
if (!errors.some((e) => /old tablet/.test(e))) ok('nothing the old tablet lacks');

/* ---- 4. the data files and the public lists */
for (const f of ['manifest.json', 'tiles/manifest.json']) { try { JSON.parse(read(f)); } catch (e) { fail(`${f} does not parse: ${e.message}`); } }
for (const f of ['family.enc', 'vault.enc']) {
  if (!fs.existsSync(path.join(root, f))) { fail(`${f} is missing: the app cannot open without it`); continue; }
  try { const e = JSON.parse(read(f)); if (!e.salt || !e.iv || !e.ct || !(e.iter > 0)) fail(`${f} is not a sealed file (salt, iv, ct, iter expected)`); } catch (e) { fail(`${f} does not parse: ${e.message}`); }
}
try {
  const packs = JSON.parse(read('tiles/manifest.json')).packs || [];
  const dated = packs.filter((p) => (p.dates || []).length);
  if (dated.length) fail(`tiles/manifest.json is public and names dates again for: ${dated.map((p) => p.name).join(', ')}. Leave "dates" empty: the app works the days out from the unlocked plan (map.js packDates).`);
  else ok('no dates in the public map-pack list');
  for (const p of packs) if (!fs.existsSync(path.join(root, p.file))) fail(`tiles/manifest.json lists ${p.file}, which does not exist`);
} catch (e) { /* reported above */ }

for (const n of notes) console.log('  ok    ' + n);
for (const e of errors) console.error('  FAIL  ' + e);
if (errors.length) { console.error(`\n${errors.length} problem${errors.length === 1 ? '' : 's'}: fix before merging.`); process.exit(1); }
console.log('\nAll checks passed.');
