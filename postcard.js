/* World Adventure postcards (1 Nov 2026 night; the board of 17 Nov 2026).
   17 Nov 2026 (Andy: "lets actually call it postcards… go crazy with the postcard idea and completely revamp the stories
   board… a postcard with up to 6 images glued on it… a distinct high quality style from each location, with a little
   stamp from the current city… the diary entry goes on the card as well"): what the family posts IS a postcard. This
   file is the card itself: the look of every place (paper, colours, lettering, how the pictures are stuck on), a drawn
   picture of each place for its stamp, the postmark, the layouts that glue one to six pictures on, and the card as HTML
   (cardHtml) for the board in journal.js. Every picture on a card is its own button, so a tap opens that one full screen.
   The same card can still leave the app as a picture (render: a 2400 × 1600 JPEG, a 6 × 4 inch print) through the phone's
   share sheet, so Mail or WhatsApp carries it and nothing leaves the device any other way. On a parent phone "Share" is
   direct; on the kids' device "Ask Mum and Dad to send it" writes a `card|<postId>` fact that waits in the parents'
   approvals card, and the parent's ✓ opens the share sheet on the parent's phone (quests.js hands that ✓ to
   sendApproved). Sending pays no points: the `postcard` quest is ticked when the card is written (journal.js addPost).
   Loaded after journal.js and before app.js; uses Journal.post/cityOf/media/timeOf, Media.url/ensure, Quests.*, and app.js
   helpers at call time only. Nothing here may name a venue the kids must not read about: the pictures are of skylines,
   mountains and towers only. The lettering comes from fonts/ (open licences, fonts/LICENSE.txt), never from the network. */
'use strict';
window.Postcard = (() => {
  const W = 2400, H = 1600;                                           // the picture that leaves the app: a 3:2 postcard, 6×4 inches at 400 dpi
  const SANS = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const MOOD = { amazing: '🤩', good: '😊', ok: '😐', tired: '😴', sad: '😢' };
  const P = { files: new Map(), urls: [], sprite: false, art: {} };   // prepared files by post id; preview URLs to revoke; the stamp pictures are in the page; the stamps as images for the canvas

  /* ---------------------------------------------------------------- the look of each place
     name and hello: the lettering at the top of the card. font: which display face (styles.css .f-<font>), size in em of
     the header. paper, acc, acc2, ink, tape: the card's colours (handed to the stylesheet as --paper … on the card, and
     used as they are by the canvas). attach: how its pictures are stuck on (tape, corners or pin). ll: where it is, for
     "km from home". value: what the stamp cost. nameCol: the name's colour where it is not acc. The frame, the faint
     pattern on the paper and the small flourishes are in styles.css under .th-<key>. */
  const TH = {
    tokyo: { name: 'Tokyo', hello: 'Konnichiwa from', land: 'Japan', seal: '東京', value: '¥100', font: 'bebas', size: 3.4, nameCol: '#27264A', paper: '#FFF8F4', acc: '#D7263D', acc2: '#F0447F', ink: '#27264A', tape: 'rgba(255,150,184,0.82)', attach: 'tape', ll: [35.68, 139.77] },
    nagoya: { name: 'Nagoya', hello: 'Konnichiwa from', land: 'Japan', seal: '名古屋', value: '¥100', font: 'abril', size: 2.6, paper: '#FFF8EA', acc: '#D9480F', acc2: '#B8860B', ink: '#3A2A1A', tape: 'rgba(240,186,72,0.85)', attach: 'tape', ll: [35.17, 136.91] },
    vancouver: { name: 'Vancouver', hello: 'Hello from', land: 'Canada', value: '$1.40', font: 'amatic', size: 3.0, paper: '#F3FAF6', acc: '#0B5D57', acc2: '#0C8F9C', ink: '#17363A', tape: 'rgba(120,200,190,0.8)', attach: 'pin', ll: [49.28, -123.12] },
    whistler: { name: 'Whistler', hello: 'Hello from snowy', land: 'Canada', value: '$1.40', font: 'alfa', size: 1.7, paper: '#F4F9FF', acc: '#1B5FA6', acc2: '#1E88C7', ink: '#1C2F4F', tape: 'rgba(150,205,242,0.85)', attach: 'tape', ll: [50.12, -122.95] },
    toronto: { name: 'Toronto', hello: 'Hello from', land: 'Canada', value: '$1.40', font: 'bebas', size: 2.7, paper: '#FFFCFA', acc: '#D52B1E', acc2: '#9C1F16', ink: '#2B2230', tape: 'rgba(230,90,80,0.8)', attach: 'pin', ll: [43.65, -79.38] },
    newyork: { name: 'New York', hello: 'Greetings from', land: 'USA', value: 'FOREVER', font: 'lime', size: 1.8, paper: '#FFFAEA', acc: '#17161C', acc2: '#B07D00', ink: '#23222B', tape: 'rgba(247,190,40,0.88)', attach: 'corners', ll: [40.71, -74.01] },
    montreal: { name: 'Montréal', hello: 'Bonjour de', land: 'Canada', value: '$1.40', font: 'playfair', size: 2.4, paper: '#FBF8FF', acc: '#5B2A9D', acc2: '#A47B12', ink: '#2E2247', tape: 'rgba(190,160,240,0.85)', attach: 'corners', ll: [45.5, -73.57] },
    brisbane: { name: 'Brisbane', hello: "G'day from", land: 'Australia', value: '$1.50', font: 'pacifico', size: 2.6, paper: '#FFFDF0', acc: '#4F8A10', acc2: '#C97B00', ink: '#2B3320', tape: 'rgba(250,205,70,0.85)', attach: 'tape', ll: [-27.47, 153.03] },
    cairns: { name: 'Cairns', hello: "G'day from", land: 'Australia', value: '$1.50', font: 'pacifico', size: 3.0, paper: '#F2FFFB', acc: '#06957B', acc2: '#E8503C', ink: '#143A3A', tape: 'rgba(255,150,130,0.82)', attach: 'tape', ll: [-16.92, 145.77] },
    townsville: { name: 'Townsville', hello: "G'day from", land: 'Australia', value: '$1.50', font: 'pacifico', size: 2.3, paper: '#FFF9EF', acc: '#1B7F78', acc2: '#D96A14', ink: '#243636', tape: 'rgba(250,170,90,0.85)', attach: 'pin', ll: null },
    home: { name: 'Home', hello: 'Hello from', land: 'Australia', value: '$1.50', font: 'pacifico', size: 3.0, paper: '#FFF9EF', acc: '#1B7F78', acc2: '#D96A14', ink: '#243636', tape: 'rgba(250,170,90,0.85)', attach: 'tape', ll: null },
    air: { name: 'The Sky', hello: 'Hello from', land: 'Up in the air', value: 'AIR MAIL', font: 'bebas', size: 3.4, paper: '#F7FBFF', acc: '#1D4ED8', acc2: '#D62839', ink: '#1B2A4F', tape: 'rgba(140,180,250,0.85)', attach: 'tape', ll: null },
    world: { name: 'Our Adventure', hello: 'Hello from', land: 'On the road', value: 'POST', font: 'pacifico', size: 1.65, paper: '#FFF8EE', acc: '#1F8377', acc2: '#D9603B', ink: '#27324A', tape: 'rgba(140,210,200,0.85)', attach: 'tape', ll: null },
  };
  for (const k of Object.keys(TH)) TH[k].key = k;
  const HOME_LL = [-19.26, 146.82];
  const keyOf = (city) => (window.Quests && Quests.CITY_KEY[city]) || '';
  const themeOf = (city) => TH[keyOf(city)] || TH.world;
  const placeOf = (city) => (city === 'Home' ? 'At home' : city === 'Air' ? 'In the air' : city);
  function kmFromHome(th) {                                            // great-circle distance, rounded: a figure for the card, not for navigation
    if (!th.ll) return 0;
    const r = Math.PI / 180, a = HOME_LL, b = th.ll, s1 = Math.sin((b[0] - a[0]) * r / 2), s2 = Math.sin((b[1] - a[1]) * r / 2);
    const km = 2 * 6371 * Math.asin(Math.sqrt(s1 * s1 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * s2 * s2));
    return km < 100 ? 0 : Math.round(km / 10) * 10;
  }
  /* whose handwriting (fonts/): Mum and Dad write in the two grown-up hands, the kids in the two kids' hands, by their place in the family list */
  function handOf(p) {
    let people = []; try { people = (S.family.trip.people || []).slice(); } catch (e) { people = []; }
    const grown = (q) => Quests.label(q) !== q, same = people.filter((q) => grown(q) === grown(p)), i = Math.max(0, same.indexOf(p));
    return grown(p) ? 1 + (i % 2) : 3 + (i % 2);
  }
  /* who a card is to. "Grandma and Grandpa" unless its writer put another name after "Dear" (17 Nov 2026, Andy: "leave it as default
     but give us the ability to overwrite it… the option to send to someone else"): the post then carries `to`. A name typed
     with its own "Dear" or comma is tidied, and an empty one means the default. */
  const TO = 'Grandma and Grandpa';
  const cleanTo = (s) => String(s || '').replace(/\s+/g, ' ').replace(/^\s*dear\s+/i, '').replace(/[\s,]+$/, '').trim().slice(0, 40);
  const toOf = (po) => cleanTo(po && po.to) || TO;
  const firstLine = (po) => (po.text || '').split('\n')[0].slice(0, 60) || (po.media && po.media.length ? 'A picture from our adventure' : 'Thinking of you');
  function seeded(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; }; }
  function words(po) { return `Dear ${toOf(po)},\n\n${po.q ? po.q + '\n' : ''}${po.text || ''}\n\nLove, ${Quests.label(po.p)}`; }
  function picOf(po) { const media = po.media || []; return media.find((m) => m.k === 'photo') || media.find((m) => m.k === 'drawing') || null; }

  /* ---------------------------------------------------------------- a small drawn picture of each place (80 × 60), for its stamp
     Flat shapes only, so they stay sharp at stamp size and on the print. Each is {defs, body}: the sky gradient and the
     scene. They sit once in the page as <symbol>s (ensureSprite) and every stamp points at one with <use>. */
  const n2 = (v) => Math.round(v * 100) / 100;
  const sky = (key, a, b, c) => `<linearGradient id="pcg-${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/>${c ? `<stop offset="0.55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>` : `<stop offset="1" stop-color="${b}"/>`}</linearGradient>`;
  const bg = (key) => `<rect width="80" height="60" fill="url(#pcg-${key})"/>`;
  const pine = (x, y, s, c) => `<path d="M${x} ${n2(y - 9 * s)}l${n2(3.2 * s)} ${n2(4 * s)}h${n2(-1.4 * s)}l${n2(2.8 * s)} ${n2(3.6 * s)}h${n2(-1.6 * s)}l${n2(3 * s)} ${n2(3.8 * s)}h${n2(-12 * s)}l${n2(3 * s)} ${n2(-3.8 * s)}h${n2(-1.6 * s)}l${n2(2.8 * s)} ${n2(-3.6 * s)}h${n2(-1.4 * s)}Z" fill="${c}"/><rect x="${n2(x - 0.6 * s)}" y="${n2(y + 2.4 * s)}" width="${n2(1.2 * s)}" height="${n2(2 * s)}" fill="#6B4A2B"/>`;
  const cloud = (x, y, s) => `<g fill="#fff"><ellipse cx="${x}" cy="${y}" rx="${n2(6 * s)}" ry="${n2(2.6 * s)}"/><circle cx="${n2(x - 2 * s)}" cy="${n2(y - 1.6 * s)}" r="${n2(2.6 * s)}"/><circle cx="${n2(x + 1.8 * s)}" cy="${n2(y - 2.4 * s)}" r="${n2(3.2 * s)}"/></g>`;
  const waves = (c, list) => `<path d="${list.map(([x, y, n]) => `M${x} ${y}q2 -1.2 4 0${'t4 0'.repeat(n - 1)}`).join('')}" stroke="${c}" stroke-width="0.7" fill="none" stroke-linecap="round"/>`;
  const palm = (x, y, h) => `<path d="M${x} ${y}q2.4 ${n2(-h * 0.55)} -1 ${-h}" stroke="#8A5A2B" stroke-width="1.6" fill="none" stroke-linecap="round"/><g fill="none" stroke="#1E8E4E" stroke-width="2" stroke-linecap="round" transform="translate(${x - 1} ${y - h})"><path d="M0 0q-6 -3 -10 1"/><path d="M0 0q-3 -6 -8 -6"/><path d="M0 0q2 -6 8 -6"/><path d="M0 0q6 -3 10 1"/><path d="M0 0q5 1 7 6"/><path d="M0 0q-5 1 -7 6"/></g>`;
  const LEAF = 'M12 1l2 5 3-1.5-1 5.5 4.5-1.5-1 3L23 13l-5 3 1 3-6-1v5h-2v-5l-6 1 1-3-5-3 3.500-1.500-1-3L8 10 7 4.500 10 6Z';
  const ART = {
    tokyo: { defs: sky('tokyo', '#FFE7C7', '#FFC2C7', '#FF9DB8'), body: bg('tokyo') +
      '<circle cx="24" cy="21" r="10.5" fill="#EE3350"/>' +
      '<path d="M-10 60Q12 50 22 36q1.500-2 3.500-2h5q2 0 3.500 2Q44 50 66 60Z" fill="#8187CC"/>' +
      '<path d="M22 36q1.500-2 3.500-2h5q2 0 3.500 2l3.600 5.400-3-1-2.400 2.800-2.600-3.200-2.900 3.400-2.700-3.400-2.600 3-2.200-2.600-1.800 0.800Z" fill="#fff"/>' +
      '<path d="M0 60V51h4v-3h4v5h3v-7h5v6h3v-3h5v4h4v-6h4v5h4v-2h5v3h39v7Z" fill="#4B4680" opacity="0.5"/>' +
      '<path d="M60 9.500V4" stroke="#F04A23" stroke-width="0.7"/>' +
      '<path d="M59.400 9h1.200l0.900 12.500q0.900 16 7.500 38.500h-3.600q-3.400-11-5.400-11t-5.400 11h-3.600q6.600-22.500 7.500-38.500Z" fill="#F04A23"/>' +
      '<path d="M59.100 13h1.800v3h-1.800ZM57.900 21.300h4.200v2.600h-4.200ZM56.900 32.500h6.200v2h-6.200Z" fill="#fff"/>' },
    nagoya: { defs: sky('nagoya', '#FFF1C9', '#FFD08A'), body: bg('nagoya') +
      '<circle cx="64" cy="14" r="7" fill="#FFF8E3"/>' +
      '<path d="M0 60V50Q14 44 28 48T56 47T80 49V60Z" fill="#7DB56A"/>' +
      '<g fill="#2F6F4A"><ellipse cx="12" cy="41" rx="7" ry="3"/><ellipse cx="15" cy="37" rx="5" ry="2.400"/><ellipse cx="9" cy="45" rx="5" ry="2.200"/><ellipse cx="68" cy="42" rx="7" ry="3"/><ellipse cx="65" cy="38" rx="5" ry="2.400"/><ellipse cx="71" cy="46" rx="5" ry="2.200"/></g>' +
      '<path d="M12 43q1 5-1 9M68 44q-1 5 1 8" stroke="#6B4A2B" stroke-width="1.200" fill="none"/>' +
      '<path d="M24 56l4.500-12h23L56 56Z" fill="#9A9CA6"/><path d="M26 52h28M27.500 48h25" stroke="#7E808A" stroke-width="0.600"/>' +
      '<rect x="29.500" y="38" width="21" height="6" fill="#FBF7EE"/><path d="M24.500 39q3.400-0.600 5-4h21q1.600 3.400 5 4l-1 1h-29Z" fill="#2E8B6F"/>' +
      '<rect x="32.500" y="29.500" width="15" height="5.600" fill="#FBF7EE"/><path d="M28 30.500q3-0.600 4.400-3.600h15.200q1.400 3 4.400 3.600l-1 1h-22Z" fill="#2E8B6F"/>' +
      '<rect x="35.500" y="21.500" width="9" height="5.400" fill="#FBF7EE"/><path d="M31.500 22.500q4-1 4.500-5.500h8q0.500 4.500 4.500 5.500l-1 1h-15Z" fill="#2E8B6F"/>' +
      '<rect x="36" y="16" width="8" height="1.200" fill="#236B55"/><path d="M36.200 16.200q-1.600-2.600 0.600-3.800q-0.400 2 1 3.800ZM43.800 16.200q1.600-2.600-0.600-3.800q0.400 2-1 3.800Z" fill="#E5B700"/>' +
      '<path d="M33 40h1.600v2.400h-1.600ZM39.200 40h1.600v2.400h-1.600ZM45.400 40h1.600v2.400h-1.600ZM36 31h1.400v2h-1.400ZM42.600 31h1.400v2h-1.400ZM39.300 23h1.400v2h-1.400Z" fill="#3B3B46"/>' },
    vancouver: { defs: sky('vancouver', '#C6EEF5', '#F1FBF4'), body: bg('vancouver') +
      '<circle cx="15" cy="12" r="6" fill="#FFE9A8"/>' +
      '<path d="M0 40l10-13 5 5 8-12 7 9 6-6 9 11 8-9 8 8 7-7 12 12v6H0Z" fill="#6D9DB8"/>' +
      '<path d="M23 20l-3.400 5.100 2.200-0.900 1.600 1.600 1.600-1.800 2.200 1.200ZM53 24l-3 3.400 2.200-0.400 1.200 1.200 1.600-1.400 1.600 0.600ZM10 27l-2.400 3.100 2-0.600 1.400 1 1.200-1.300Z" fill="#fff"/>' +
      '<path d="M0 44Q10 36 22 41T46 39T66 41T80 37V48H0Z" fill="#2E7C86"/>' +
      '<rect y="46" width="80" height="14" fill="#1B9AAA"/>' + waves('#BFF0F2', [[26, 51, 2], [34, 55.500, 3], [52, 50.500, 2]]) +
      '<path d="M39 49.500h9l-1.500 2.200h-6Z" fill="#fff"/><path d="M43.200 40v8.600h-4.600Z" fill="#fff"/><path d="M44 42.400v6.200h3.600Z" fill="#FFD166"/>' +
      '<path d="M0 60V55q10-2 22 5ZM80 60V55q-10-2-24 5Z" fill="#0A3F3B"/>' +
      pine(7, 50, 1.5, '#0E4F4A') + pine(16.5, 53, 1.1, '#11605A') + pine(73, 50, 1.6, '#0E4F4A') + pine(63.5, 53.5, 1.05, '#11605A') },
    whistler: { defs: sky('whistler', '#1F5FA8', '#7EC0EE'), body: bg('whistler') +
      '<g fill="#fff"><circle cx="8" cy="8" r="0.700"/><circle cx="20" cy="15" r="0.500"/><circle cx="33" cy="6" r="0.600"/><circle cx="47" cy="11" r="0.500"/><circle cx="61" cy="5" r="0.700"/><circle cx="73" cy="13" r="0.600"/><circle cx="55" cy="20" r="0.450"/><circle cx="12" cy="25" r="0.500"/><circle cx="40" cy="17" r="0.450"/></g>' +
      '<path d="M34 60l24-32 26 32Z" fill="#F4FAFF"/><path d="M58 28l26 32H63l-2-12 4-6Z" fill="#B5D4EF"/>' +
      '<path d="M-4 60l28-42 28 42Z" fill="#F4FAFF"/><path d="M24 18l28 42H31l-3-16 5-6Z" fill="#B5D4EF"/>' +
      '<path d="M0 60V52Q20 46 40 51T80 50V60Z" fill="#fff"/>' +
      '<path d="M-2 31L82 15" stroke="#28344A" stroke-width="0.500"/><path d="M46 21.900v3" stroke="#28344A" stroke-width="0.600"/>' +
      '<rect x="41.500" y="24.600" width="9" height="7" rx="1.600" fill="#E63946"/><rect x="42.800" y="25.800" width="6.400" height="2.800" rx="0.500" fill="#CDE9FB"/>' +
      pine(9, 49, 1.5, '#14532D') + pine(19, 52, 1.1, '#1B6B3A') + pine(70, 49, 1.5, '#14532D') + pine(61, 52.5, 1, '#1B6B3A') +
      '<path d="M9 35.500l2.100 2.700h-4.200ZM70 35.500l2.100 2.700h-4.200Z" fill="#fff"/>' },
    toronto: { defs: sky('toronto', '#BFE3FF', '#F5FBFF'), body: bg('toronto') + cloud(15, 15, 0.9) + cloud(64, 24, 0.7) +
      '<path d="M0 50V40h5v-6h5v8h3v-12h6v10h4v-5h5v7h20v-9h5v-7h5v10h4v-14h6v12h4v6h8v10Z" fill="#9DBDE0"/>' +
      '<path d="M2 50v-6h6v6ZM14 50v-10h5v10ZM24 50v-7h7v7ZM48 50v-13h6v13ZM58 50v-8h5v8ZM66 50v-16h6v16Z" fill="#3F6699"/>' +
      '<path d="M40 20V5" stroke="#4A5568" stroke-width="0.800"/><circle cx="40" cy="5" r="0.900" fill="#E63946"/>' +
      '<path d="M38.600 50l1-24h0.800l1 24Z" fill="#4A5568"/><rect x="38.300" y="19.600" width="3.400" height="4.400" rx="0.600" fill="#4A5568"/><path d="M37 24.200q3-1.700 6 0l-0.600 2.700h-4.800Z" fill="#4A5568"/><rect x="37.300" y="24.700" width="5.400" height="0.700" fill="#CFE6FA"/>' +
      '<rect y="50" width="80" height="10" fill="#2F7FC1"/><path d="M5 54h9M22 56.500h12M46 53.500h10M62 57h11" stroke="#9CCBF0" stroke-width="0.700" stroke-linecap="round"/>' +
      `<path d="${LEAF}" fill="#D52B1E" transform="translate(62 4) scale(0.44)"/>` },
    newyork: { defs: sky('newyork', '#3B2A6E', '#D85C7B', '#FFC46B'), body: bg('newyork') +
      '<circle cx="54" cy="48" r="12" fill="#FFE08A" opacity="0.850"/>' +
      '<path d="M0 60V40h6v-6h5v10h4v-14h6v12h30v-10h5v-7h5v12h4v-9h6v14h9V60Z" fill="#5A3F7E" opacity="0.800"/>' +
      '<path d="M39 60V34h1.600v-6h1.600v-5h1v-4h0.600V10h0.400V19h0.600v4h1v5h1.600v6H49V60Z" fill="#221A3D"/>' +
      '<path d="M58.500 60V36l1.200-4 0.800-5 0.600-6 0.600 6 0.800 5 1.200 4V60Z" fill="#221A3D"/>' +
      '<path d="M0 60V46h7v-5h6v8h5v-12h7v10h4V60ZM50 60V44h6V60ZM65 60V42h6v-6h6v10h3V60Z" fill="#221A3D"/>' +
      '<g fill="#FFD76A"><rect x="41" y="37" width="0.900" height="1.200"/><rect x="43.600" y="40" width="0.900" height="1.200"/><rect x="46" y="36.500" width="0.900" height="1.200"/><rect x="41.200" y="44" width="0.900" height="1.200"/><rect x="45.600" y="47" width="0.900" height="1.200"/><rect x="60.400" y="40" width="0.900" height="1.200"/><rect x="61.800" y="46" width="0.900" height="1.200"/><rect x="67" y="45" width="0.900" height="1.200"/><rect x="73" y="40" width="0.900" height="1.200"/><rect x="69.500" y="50" width="0.900" height="1.200"/><rect x="26" y="43" width="0.900" height="1.200"/><rect x="21" y="48" width="0.900" height="1.200"/><rect x="52" y="48" width="0.900" height="1.200"/></g>' +
      '<path d="M11.500 60l1.200-9h8.600l1.200 9Z" fill="#CDB89A"/><rect x="12" y="49.600" width="10" height="1.600" fill="#B9A382"/>' +
      '<path d="M14 49.600l1.600-15q1.400-2.600 2.800 0l1.600 15Z" fill="#62B6A3"/><circle cx="17" cy="31.600" r="1.900" fill="#62B6A3"/>' +
      '<path d="M15 30.600l-0.900-2.400 1.700 1.300 0.500-2.600 0.700 2.400 0.700-2.400 0.500 2.600 1.700-1.300-0.900 2.400Z" fill="#62B6A3"/>' +
      '<path d="M18.300 35L21.400 25.400" stroke="#62B6A3" stroke-width="1.500" stroke-linecap="round"/><rect x="20.600" y="23.200" width="1.800" height="2.200" fill="#62B6A3"/><path d="M21.500 19.600q1.800 2 0.900 3.600h-1.800q-0.900-1.600 0.900-3.600Z" fill="#FFD23F"/>' },
    montreal: { defs: sky('montreal', '#CDB8FF', '#FFE6F2'), body: bg('montreal') +
      '<g fill="#fff"><circle cx="10" cy="9" r="0.600"/><circle cx="36" cy="7" r="0.500"/><circle cx="50" cy="15" r="0.600"/><circle cx="71" cy="8" r="0.500"/><circle cx="44" cy="24" r="0.450"/><circle cx="6" cy="22" r="0.450"/></g>' +
      '<path d="M-2 46Q14 22 34 30Q50 34 60 46Z" fill="#6E5AA8"/><path d="M-2 46Q10 30 22 28Q16 36 14 46Z" fill="#8571BE"/>' +
      '<path d="M21.400 16h1.200v3h2.600v1.200h-2.600v7.800h-1.200v-7.800h-2.600v-1.200h2.600Z" fill="#fff"/>' +
      '<path d="M30 46V37h4v-5h4v7h3v-10h5v9h4v-4h4v6h4V46Z" fill="#473380"/>' +
      '<circle cx="66" cy="36" r="10" fill="#fff" opacity="0.600"/><g stroke="#5B2A9D" stroke-width="0.500" fill="none"><circle cx="66" cy="36" r="10"/><ellipse cx="66" cy="36" rx="5" ry="10"/><ellipse cx="66" cy="36" rx="10" ry="5"/><path d="M56 36h20M66 26v20M58.900 28.900l14.200 14.200M73.100 28.900l-14.200 14.200"/></g>' +
      '<rect y="46" width="80" height="14" fill="#5D7BD5"/>' + waves('#C9D6FF', [[6, 51, 3], [30, 55, 3], [56, 51.500, 3]]) },
    brisbane: { defs: sky('brisbane', '#9FDCFF', '#FFF4C2'), body: bg('brisbane') +
      '<circle cx="65" cy="12" r="7" fill="#FFD23F"/>' +
      '<path d="M0 44V34h5v-5h5v7h4v-10h5v9h36v-8h5v-6h5v9h4v-4h6V44Z" fill="#A9C7DE"/>' +
      '<path d="M0 46Q20 40 40 44T80 42V48H0Z" fill="#6FB54A"/><rect y="46" width="80" height="14" fill="#2B94C9"/>' + waves('#BFE6FA', [[6, 53, 3], [34, 56, 3], [58, 52.500, 3]]) +
      '<g fill="#51677F"><rect y="39.200" width="80" height="1.600"/><rect x="24.200" y="20" width="1.600" height="31"/><rect x="54.200" y="20" width="1.600" height="31"/></g>' +
      '<path d="M2 39.600L25 20L40 32L55 20L78 39.600" stroke="#51677F" stroke-width="1.400" fill="none" stroke-linejoin="round"/>' +
      '<path d="M9 39.600V33.700M16 39.600V27.700M32.500 39.600V26M40 39.600V32M47.500 39.600V26M64 39.600V27.700M71 39.600V33.700M9 33.700L16 39.600M16 27.700L25 39.600L32.500 26M32.500 39.600L40 32L47.500 39.600M47.500 26L55 39.600L64 27.700M64 39.600L71 33.700" stroke="#51677F" stroke-width="0.700" fill="none"/>' },
    cairns: { defs: sky('cairns', '#8FE3F0', '#EFFFF4'), body: bg('cairns') +
      '<circle cx="60" cy="13" r="7" fill="#FFD23F"/><rect y="34" width="80" height="26" fill="#18B5B0"/>' +
      '<path d="M4 36Q18 27 34 36Z" fill="#F4D58D"/>' + palm(19, 33, 17) +
      '<path d="M0 44q5-2.400 10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0V60H0Z" fill="#0E8F9B"/>' +
      '<path d="M8 60v-6q0-2 1.400-2t1.400 2v2q0-3 1.500-3t1.500 3v4Z" fill="#FF7A6B"/><g fill="#FFB347"><circle cx="70" cy="58" r="3.400"/><circle cx="74.500" cy="56.500" r="2.400"/></g>' +
      '<path d="M52 52l4.400-3.200v6.400Z" fill="#FF8A1E"/><ellipse cx="46" cy="52" rx="6.200" ry="3.700" fill="#FF8A1E"/><path d="M43.600 48.700q1.200 3.300 0 6.600M48 48.600q1.200 3.400 0 6.800" stroke="#fff" stroke-width="1.300" fill="none"/><circle cx="41.600" cy="51.300" r="0.700" fill="#1B1B2F"/>' +
      '<g fill="none" stroke="#DFFBFF" stroke-width="0.500"><circle cx="36.500" cy="48.500" r="1"/><circle cx="34.500" cy="46" r="0.700"/></g>' },
    townsville: { defs: sky('townsville', '#A8E6F0', '#FFF1D0'), body: bg('townsville') +
      '<circle cx="13" cy="13" r="7" fill="#FFC93C"/>' + cloud(60, 12, 0.7) +
      '<path d="M12 46Q16 30 28 24Q36 19 46 21Q58 23 64 34Q68 40 70 46Z" fill="#D98A5F"/><path d="M28 24Q36 19 46 21L42 30L33 31Z" fill="#EBAA80"/><path d="M46 21Q58 23 64 34L55 36L42 30Z" fill="#C67546"/>' +
      '<path d="M6 47Q14 40 22 43T38 42T54 43T76 42V48H6Z" fill="#5E9E57"/>' +
      '<rect y="46" width="80" height="14" fill="#1FA2A6"/>' + waves('#C6F3F0', [[6, 51, 3], [28, 55, 3]]) +
      '<path d="M46 60Q62 51 80 53V60Z" fill="#F4D58D"/>' + palm(68, 58, 19) },
    home: { defs: sky('home', '#BDE6FF', '#F3FBFF'), body: bg('home') +
      '<circle cx="65" cy="12" r="6" fill="#FFD23F"/>' + cloud(18, 13, 0.8) +
      '<path d="M0 60V46Q20 41 40 44T80 43V60Z" fill="#7CC36A"/>' +
      '<rect x="11.100" y="38" width="1.800" height="9" fill="#6B4A2B"/><circle cx="12" cy="33" r="7" fill="#3E9B4F"/>' +
      '<rect x="46.500" y="21.500" width="3" height="6" fill="#B8433F"/><rect x="26" y="32" width="26" height="17" fill="#FFF4E0"/><path d="M22.500 33L39 20L55.500 33Z" fill="#D9534F"/>' +
      '<rect x="36.600" y="39" width="4.800" height="10" rx="0.600" fill="#2A9D8F"/><circle cx="40.300" cy="44.300" r="0.450" fill="#FFD23F"/>' +
      '<g fill="#BFE3FF" stroke="#fff" stroke-width="0.800"><rect x="29" y="37" width="5" height="5"/><rect x="44" y="37" width="5" height="5"/></g>' +
      '<path d="M36.600 49Q36 55 31 60H45Q41.500 55 41.400 49Z" fill="#E8D5B0"/>' +
      '<rect x="62.400" y="45" width="1.200" height="9" fill="#6B4A2B"/><path d="M59 45v-3q0-2.600 2.600-2.600h3.400q2.600 0 2.600 2.600v3Z" fill="#E63946"/><path d="M67.600 41.500v-4.500h2.600v2h-2.600" stroke="#FFB703" stroke-width="0.900" fill="#FFD23F"/>' },
    air: { defs: sky('air', '#2F7BF0', '#BFE0FF'), body: bg('air') + cloud(14, 41, 1.3) + cloud(61, 49, 1.5) + cloud(67, 14, 0.8) + cloud(22, 14, 0.7) +
      '<path d="M6 53Q30 50 45.500 31" stroke="#fff" stroke-width="0.900" stroke-dasharray="2 2.200" fill="none" stroke-linecap="round"/>' +
      '<g transform="translate(55 23) rotate(-38)"><path d="M-1-1.600l-5-8h3.200l7.600 8ZM-1 1.600l-5 8h3.200l7.600-8Z" fill="#DCE6F5"/><path d="M-9.500-1.600l-2.600-5h2.400l3.400 5Z" fill="#E63946"/>' +
      '<path d="M-11 0q0-2.200 3-2.200h13q5 0.400 6 2.200q-1 1.800-6 2.200h-13q-3 0-3-2.200Z" fill="#fff"/><g fill="#3A86FF"><circle cx="0" cy="-0.400" r="0.500"/><circle cx="2" cy="-0.400" r="0.500"/><circle cx="4" cy="-0.400" r="0.500"/><circle cx="6" cy="-0.400" r="0.500"/></g></g>' },
    world: { defs: sky('world', '#FFE9B8', '#FFD3C2'), body: bg('world') +
      '<circle cx="40" cy="31" r="18" fill="#2F8FD8"/>' +
      '<path d="M30 20q4-3 8-1q2 3-1 5q-3 1-3 4q-3 2-5-1q-2-4 1-7ZM44 26q5-2 8 2q2 5-2 9q-4 3-6-1q1-3-1-5q-1-3 1-5ZM33 38q3-1 5 2q0 4-3 6q-3-2-2-8Z" fill="#59B56A"/>' +
      '<ellipse cx="40" cy="31" rx="27" ry="8" fill="none" stroke="#E63946" stroke-width="0.900" stroke-dasharray="2.400 2" transform="rotate(-18 40 31)"/>' +
      '<g transform="translate(65.500 22.500) rotate(-58) scale(0.5)"><path d="M-1-1.600l-5-8h3.200l7.600 8ZM-1 1.600l-5 8h3.200l7.600-8Z" fill="#fff"/><path d="M-11 0q0-2.200 3-2.200h13q5 0.400 6 2.200q-1 1.800-6 2.200h-13q-3 0-3-2.200Z" fill="#fff"/></g>' },
  };
  function ensureSprite() {                                           // once: every place's picture as a <symbol>, in the page (not display:none, or its gradients would not paint)
    if (P.sprite || !document.body) return;
    P.sprite = true;
    const d = document.createElement('div');
    d.innerHTML = `<svg id="pc-sprite" aria-hidden="true" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${Object.values(ART).map((a) => a.defs).join('')}</defs>${Object.entries(ART).map(([k, a]) => `<symbol id="pcs-${k}" viewBox="0 0 80 60">${a.body}</symbol>`).join('')}</svg>`;
    document.body.appendChild(d.firstChild);
  }

  /* ---------------------------------------------------------------- the stamp and the postmark (SVG) */
  function perf(w, h, n, m, r) {                                       // a stamp's outline: the little half-holes along each edge
    const sx = w / n, sy = h / m, a = `A${r} ${r} 0 0 0 `; let d = `M${r} 0`;
    for (let i = 1; i < n; i++) d += `H${n2(i * sx - r)}${a}${n2(i * sx + r)} 0`;
    d += `H${w - r}${a}${w} ${r}`;
    for (let j = 1; j < m; j++) d += `V${n2(j * sy - r)}${a}${w} ${n2(j * sy + r)}`;
    d += `V${h - r}${a}${w - r} ${h}`;
    for (let i = n - 1; i > 0; i--) d += `H${n2(i * sx + r)}${a}${n2(i * sx - r)} ${h}`;
    d += `H${r}${a}0 ${h - r}`;
    for (let j = m - 1; j > 0; j--) d += `V${n2(j * sy + r)}${a}0 ${n2(j * sy - r)}`;
    return d + `V${r}${a}${r} 0Z`;
  }
  const STAMP_EDGE = perf(100, 122, 13, 16, 2.5);
  /* the stamp of a place. alone: a complete SVG file (for the canvas and the print), with its picture inside instead of
     pointing at the page's sprite. The lettering is squeezed to a set width, so it fits whichever font draws it. */
  function stampSvg(key, alone) {
    const th = TH[key] || TH.world, art = ART[th.key] || ART.world, nm = th.name.toUpperCase(), nl = Math.min(80, nm.length * 10.5), sub = `${th.land.toUpperCase()} · ${th.value}`;
    const pic = alone ? `<svg x="9" y="9" width="82" height="61.5" viewBox="0 0 80 60"><defs>${art.defs}</defs>${art.body}</svg>` : `<use href="#pcs-${th.key}" x="9" y="9" width="82" height="61.5"/>`;
    return `<svg ${alone ? 'xmlns="http://www.w3.org/2000/svg" width="400" height="488"' : 'class="pc-stamp" aria-hidden="true"'} viewBox="0 0 100 122"><path d="${STAMP_EDGE}" fill="#fff"/>${pic}<rect x="9" y="9" width="82" height="61.5" fill="none" stroke="#000" stroke-opacity="0.2" stroke-width="0.6"/>` +
      `<text x="50" y="88" text-anchor="middle" font-family="'Bebas Neue','Arial Narrow',Arial,sans-serif" font-weight="700" font-size="16" textLength="${nl}" lengthAdjust="spacingAndGlyphs" fill="${th.acc}">${esc(nm)}</text>` +
      `<text x="50" y="101" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="7.4" textLength="${Math.min(78, sub.length * 4.6)}" lengthAdjust="spacingAndGlyphs" fill="#555">${esc(sub)}</text>` +
      `<text x="50" y="113" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="5.2" textLength="62" lengthAdjust="spacingAndGlyphs" fill="#999">WORLD ADVENTURE</text></svg>`;
  }
  function postmarkSvg(th, date, dayLine, key) {                      // the round cancel with the place round the top, the date in the middle, and the wavy lines that run over the stamp
    const id = 'pcm-' + String(key || 'x').replace(/[^\w-]/g, '_'), d = new Date(date + 'T12:00:00Z');   // the id of its two lettering paths: the card's own, so the same card always gives the same HTML
    const dm = isNaN(d) ? '' : `${d.getUTCDate()} ${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()]}`, yr = isNaN(d) ? '' : String(d.getUTCFullYear());
    const top = th.key === 'air' ? 'IN THE AIR' : th.key === 'home' ? 'HOME · AUSTRALIA' : th.key === 'world' ? 'WORLD ADVENTURE' : `${th.name.toUpperCase()} · ${th.land.toUpperCase()}`;
    const fs = top.length > 15 ? 8.2 : 9.6, squeeze = top.length * (fs * 0.68 + 1) > 112 ? ' textLength="112" lengthAdjust="spacingAndGlyphs"' : '';   // a long name is squeezed to fit round the top of the ring
    return `<svg class="pc-mark" aria-hidden="true" viewBox="0 0 190 110"><defs><path id="${id}a" d="M16.500 55A38.500 38.500 0 0 1 93.500 55"/><path id="${id}b" d="M9 55A46 46 0 0 0 101 55"/></defs>` +
      `<g fill="none" stroke="currentColor"><circle cx="55" cy="55" r="51" stroke-width="2.400"/><circle cx="55" cy="55" r="34" stroke-width="1.200"/>` +
      `<path d="M110 31q10-6 20 0t20 0t20 0t20 0M112 44q10-6 20 0t20 0t20 0t20 0M112 57q10-6 20 0t20 0t20 0t20 0M110 70q10-6 20 0t20 0t20 0t20 0" stroke-width="2" stroke-linecap="round"/></g>` +
      `<g fill="currentColor" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle"><text font-size="${fs}" letter-spacing="1"${squeeze}><textPath href="#${id}a" startOffset="50%"${squeeze}>${esc(top)}</textPath></text>` +
      `<text font-size="8" letter-spacing="1.200"><textPath href="#${id}b" startOffset="50%">${esc(dayLine || 'WORLD ADVENTURE')}</textPath></text>` +
      `<text x="55" y="57" font-size="15">${dm}</text><text x="55" y="69" font-size="9">${yr}</text></g></svg>`;
  }

  /* ---------------------------------------------------------------- gluing one to six pictures on
     A layout is a list of places [left, top, width, height, tilt] on a sheet 100 wide and `h` high (so every figure is a
     share of the card's width): each picture is cropped to fill its place, a drawing is shown whole. One picture keeps
     its own shape. A landscape first picture goes across the top, a portrait one down the left. */
  function layoutOf(media) {
    const n = Math.min(6, media.length), shape = (m) => (m && m.w && m.h ? m.w / m.h : 4 / 3), a0 = shape(media[0]);
    if (n === 1) { const a = Math.max(0.78, Math.min(1.6, a0)), w = a < 1 ? 70 : 88, h = w / a; return { h: h + 9, s: [[(100 - w) / 2, 4.5, w, h, -1.6]] }; }
    if (n === 2) return a0 > 1.15 && shape(media[1]) > 1.15 ? { h: 110, s: [[3, 3.5, 72, 54, -2.4], [25, 52, 72, 54, 2]] } : { h: 78, s: [[2.5, 4, 49, 67, -2.5], [48.5, 7, 49, 67, 2.2]] };
    if (n === 3) return a0 > 1.15 ? { h: 104, s: [[5, 3.5, 90, 60, -1.4], [2.5, 62, 49, 38, 2.2], [48.5, 64, 49, 37, -2]] } : { h: 85, s: [[2.5, 3.5, 57, 77, -1.8], [57, 3, 41, 40, 2.6], [56, 42.5, 42, 39, -2.2]] };
    if (n === 4) return { h: 101, s: [[2.5, 3.5, 49, 47, -2.4], [48.5, 5.5, 49, 46, 1.9], [3.5, 50, 48, 46, 1.6], [48, 51, 49.5, 46.5, -2]] };
    if (n === 5) return { h: 92, s: [[2.5, 3.5, 50, 48, -2], [48, 5, 49.5, 47, 2.4], [1.5, 52, 34, 36, 2], [33, 54, 34, 35, -1.6], [64.5, 52, 34, 36, 2.6]] };
    return { h: 94, s: [[2.5, 3.5, 58, 50, -1.8], [58, 3, 40, 26.5, 2.4], [57.5, 28, 40.5, 27, -2], [1.5, 55, 34, 35, 1.8], [33, 57, 34, 34, -1.4], [64.5, 55, 34, 35, 2.4]] };
  }
  const info = (m) => Object.assign({}, (window.Journal && Journal.media && Journal.media(m.id)) || {}, m);   // a picture's size and kind from the journal's index, where it has one
  /* the pictures of a card. o.edit: each has a ✕ instead of opening (the composer); o.group: what the viewer pages through */
  function photosHtml(media, th, seed, o) {
    o = o || {};
    const list = media.slice(0, 6).map(info);
    if (!list.length) {                                                // no pictures: the card carries a drawn view of the place, stuck on like a print
      const r0 = seeded(seed + '|art');
      return `<div class="pc-photos art" style="padding-top:60%"><div class="pc-ph art" style="left:9%;top:6%;width:82%;height:88%;transform:rotate(${n2(-1.6 + r0() * 3.2)}deg)"><svg viewBox="0 3 80 54" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><use href="#pcs-${th.key}"/></svg><i class="pc-tp" style="left:${n2(30 + r0() * 30)}%;transform:rotate(${n2((r0() - 0.5) * 12)}deg)"></i></div></div>`;
    }
    const L = layoutOf(list), rnd = seeded(seed + '|ph'), pct = (v) => n2(v) + '%';
    const one = (m, i) => {
      const [x, y, w, h, r] = L.s[i], draw = m.k === 'drawing', tilt = n2(r + (rnd() - 0.5) * 1.4), how = draw ? 'tape' : th.attach;
      const big = !draw && (list.length === 1 || w >= 55);            // the large picture of a card sharpens to the full photo once its small copy is up
      const fix = how === 'corners' ? '<i class="pc-cn c1"></i><i class="pc-cn c2"></i><i class="pc-cn c3"></i><i class="pc-cn c4"></i>' : how === 'pin' ? '<i class="pc-pin"></i>' : `<i class="pc-tp" style="left:${n2(28 + rnd() * 30)}%;transform:rotate(${n2((rnd() - 0.5) * 12)}deg)"></i>`;
      const img = `<img data-oid="${esc(draw ? m.id : m.id + 't')}" data-kind="${draw ? 'drawing' : 'thumb'}"${big ? ` data-full="${esc(m.id)}"` : ''} alt="">`;
      const box = `class="pc-ph${draw ? ' dr' : ''}" style="left:${pct(x)};top:${pct(y / L.h * 100)};width:${pct(w)};height:${pct(h / L.h * 100)};transform:rotate(${tilt}deg)"`;
      return o.edit ? `<div ${box}>${img}${fix}<button type="button" class="pc-rm" data-rm="${esc(m.id)}" aria-label="Take this picture off">✕</button></div>`
        : `<button type="button" ${box} data-view="${esc(m.id)}"${o.group ? ` data-group="${esc(o.group)}"` : ''} aria-label="${draw ? 'Drawing' : 'Photo'} ${i + 1} of ${list.length}: open it full screen">${img}${fix}</button>`;
    };
    return `<div class="pc-photos n${list.length}" style="padding-top:${pct(L.h)}">${list.map(one).join('')}</div>`;
  }

  /* ---------------------------------------------------------------- the card as HTML
     po: a postcard {id, p, d, t, text, mood, q, media, to}. o.media: the pictures to show (the caller has dropped the ones
     that are gone), o.isNew: the NEW flag, o.edit: the composer's card (a text box for the words, ✕ on the pictures). */
  function headHtml(th, date, id) {
    let dayLine = '';
    try { const F = S.family, n = Quests.daysBetween(F.trip.start, date) + 1, total = Quests.daysBetween(F.trip.start, F.trip.end) + 1; dayLine = n >= 1 && n <= total ? `DAY ${n} OF ${total}` : ''; } catch (e) { dayLine = ''; }
    const seal = th.seal ? `<span class="pc-seal" aria-hidden="true">${[...th.seal].map((ch) => `<i>${esc(ch)}</i>`).join('')}</span>` : '';   // the red seal: one character under the other
    return `<div class="pc-top"><div class="pc-title"><span class="pc-hello">${esc(th.hello)}</span><span class="pc-name f-${th.font}" style="font-size:${th.size}em">${esc(th.name)}</span>${seal}</div><div class="pc-post">${stampSvg(th.key)}${postmarkSvg(th, date, dayLine, id)}</div></div>`;
  }
  function signHtml(po) { return `Love, ${esc(Quests.label(po.p))} ${Quests.face(po.p)}${MOOD[po.mood] ? `<span class="pc-mood">${MOOD[po.mood]}</span>` : ''}`; }
  function footHtml(po, th, city, ctx) {
    const km = kmFromHome(th), when = po.legacy || !po.t ? '' : Journal.timeOf(po, ctx);   // the place is on the card twice already (the name, the postmark): the foot says when, and how far from home; near home it says where
    return `<div class="pc-foot">${km ? '' : `<span>${esc(th.key === 'home' || th.key === 'air' || th.key === 'world' ? placeOf(city) : th.name + ', ' + th.land)}</span>`}<span>${esc(fmtDate(po.d))}${when ? ' · ' + esc(when) : ''}</span>${km ? `<span>${km.toLocaleString('en-AU')} km from home</span>` : ''}</div>`;
  }
  function styleOf(th, p) { return `--paper:${th.paper};--acc:${th.acc};--acc2:${th.acc2};--ink:${th.ink};--tape:${th.tape};--hand:var(--hand-${handOf(p)})`; }
  function cardHtml(po, o) {
    o = o || {};
    ensureSprite();
    const ctx = o.ctx || currentContext(), city = Journal.cityOf(po.d, ctx), th = themeOf(city);
    const media = o.media || po.media || [];
    const to = toOf(po);                                              // in the composer the name is a box to type in: the dashed line and the pencil say so
    let msg = o.edit ? `<div class="pc-dear">Dear <label class="pc-to"><span class="sz" id="c-to-sz">${esc(to)}</span><input id="c-to" type="text" size="1" maxlength="40" value="${esc(to)}" placeholder="${esc(TO)}" autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="Who the postcard is to"><i class="pc-to-pen" aria-hidden="true">✏️</i></label>,</div>`
      : `<div class="pc-dear">Dear ${esc(to)},</div>`;
    if (o.edit) msg += `<div class="pc-q${po.q ? '' : ' hidden'}" id="c-q">${esc(po.q || '')}</div><textarea class="pc-text pc-ta" id="c-text" maxlength="${o.max || 500}" rows="3" placeholder="What happened today?">${esc(po.text || '')}</textarea>`;
    else msg += `${po.q ? `<div class="pc-q">${esc(po.q)}</div>` : ''}${po.text ? `<div class="pc-text">${esc(po.text)}</div>` : ''}`;
    msg += `<div class="pc-sign" id="${o.edit ? 'c-sign' : ''}">${signHtml(po)}</div>`;
    return `<div class="pc-paper th-${th.key} hw${handOf(po.p)}${o.edit ? ' edit' : ''}" style="${styleOf(th, po.p)}">${o.isNew ? '<span class="pc-new">New!</span>' : ''}<div class="pc-in">${headHtml(th, po.d, po.id)}` +
      `${o.edit ? `<div id="c-photos">${photosHtml(media, th, po.id || 'draft', { edit: true })}</div>` : photosHtml(media, th, po.id, { group: 'post:' + po.id })}<div class="pc-msg">${msg}</div>${footHtml(po, th, city, ctx)}</div></div>`;
  }
  /* The header of a card is drawn in units of its own width (--u), so the lettering, the stamp and the postmark keep
     their proportions from a small phone to a tablet. Called after cards are put on the page and when the page changes size. */
  function fit(root) {
    if (!root) return;
    const c = root.querySelector('.pcard, .pc-edit .pc-paper'); if (!c) return;
    const w = c.clientWidth; if (!w) return;
    const wide = w >= 640;                                             // room for the classic layout: pictures on the left, the words on the right (styles.css .pc-wide)
    root.classList.toggle('pc-wide', wide);
    root.style.setProperty('--u', n2((wide ? (w - 14) * 0.46 : w - 14) / 100) + 'px');
  }
  const stampHtml = (city) => { ensureSprite(); return stampSvg(themeOf(city).key); };

  /* ---------------------------------------------------------------- the card as a picture (canvas): the same paper, lettering,
     stamp and glued pictures, laid out landscape for a 6 × 4 print. Pictures on the left, the words on the right. */
  function loadImg(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('picture')); i.src = url; }); }
  function svgImage(memo, svg) {                                       // an SVG of ours as an image for the canvas, made once
    if (!P.art[memo]) P.art[memo] = loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)).catch(() => { delete P.art[memo]; return null; });
    return P.art[memo];
  }
  const stampImage = (key) => svgImage('stamp|' + key, stampSvg(key, true));
  const viewImage = (key) => { const a = ART[key] || ART.world; return svgImage('view|' + key, `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="810" viewBox="0 3 80 54"><defs>${a.defs}</defs>${a.body}</svg>`); };   // the drawn view of the place, for a card with no pictures
  const CANVAS_FONT = { bebas: '"Bebas Neue"', abril: '"Abril Fatface"', amatic: '700 1px "Amatic SC"', alfa: '"Alfa Slab One"', lime: '"Limelight"', playfair: 'italic 900 1px "Playfair Display"', pacifico: '"Pacifico"' };
  const HAND = { 1: '"Kalam"', 2: '"Handlee"', 3: '"Patrick Hand"', 4: '"Gochi Hand"' };
  const fontOf = (th, px) => { const f = CANVAS_FONT[th.font] || '"Bebas Neue"'; return /1px/.test(f) ? f.replace('1px', px + 'px') + `, ${SANS}` : `${px}px ${f}, ${SANS}`; };
  async function fontsReady(th, hand) {                                // the lettering has to be in memory before the canvas asks for it; a font that will not load falls back to the phone's own
    if (!document.fonts || !document.fonts.load) return;
    const want = [fontOf(th, 40), `40px ${HAND[hand]}`];
    try { await Promise.race([Promise.all(want.map((f) => document.fonts.load(f, 'Hello'))), new Promise((res) => setTimeout(res, 2500))]); } catch (e) { /* the fallback font draws it */ }
  }
  function wrap(g, text, maxW) {                                       // word-wrap for the canvas; keeps the words' own line breaks
    const lines = [];
    for (const para of String(text || '').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        if (!word) continue;
        const test = line ? line + ' ' + word : word;
        if (!line || g.measureText(test).width <= maxW) line = test; else { lines.push(line); line = word; }
      }
      lines.push(line);
    }
    return lines;
  }
  function drawFit(g, img, x, y, w, h, whole) {                        // a picture into a box: cropped to fill it, or (a drawing) whole on white
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, s = whole ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); if (whole) { g.fillStyle = '#fff'; g.fillRect(x, y, w, h); } g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); g.restore();
  }
  function drawEdge(g, th) {                                           // the frame: airmail stripes in the air, the place's two colours elsewhere
    const b = 44;
    if (th.key === 'air') {
      g.save(); g.beginPath(); g.rect(0, 0, W, H); g.rect(b, b, W - 2 * b, H - 2 * b); g.clip('evenodd');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      for (let x = -H, i = 0; x < W + H; x += 70, i++) { g.fillStyle = i % 2 ? th.acc : th.acc2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 35, 0); g.lineTo(x + 35 + H, H); g.lineTo(x + H, H); g.closePath(); g.fill(); }
      g.restore();
    } else {
      g.fillStyle = th.acc; g.fillRect(0, 0, W, H);
      g.fillStyle = th.paper; g.fillRect(b, b, W - 2 * b, H - 2 * b);
      g.strokeStyle = th.acc2; g.lineWidth = 5; g.strokeRect(b + 14, b + 14, W - 2 * b - 28, H - 2 * b - 28);
      return;
    }
    g.fillStyle = th.paper; g.fillRect(b, b, W - 2 * b, H - 2 * b);
  }
  function drawMark(g, th, date, cx, cy, r) {                          // the postmark: rings, the date, the place, wavy lines to the right
    const d = new Date(date + 'T12:00:00Z'), dm = isNaN(d) ? '' : `${d.getUTCDate()} ${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()]}`;
    g.save(); g.translate(cx, cy); g.rotate(-0.16); g.strokeStyle = g.fillStyle = 'rgba(40,40,84,0.62)';
    g.lineWidth = 6; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r * 0.67, 0, 7); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${Math.round(r * 0.3)}px Arial, sans-serif`; g.fillText(dm, 0, -r * 0.04);
    g.font = `bold ${Math.round(r * 0.18)}px Arial, sans-serif`; g.fillText(isNaN(d) ? '' : String(d.getUTCFullYear()), 0, r * 0.26);
    const top = (th.key === 'air' ? 'IN THE AIR' : th.key === 'home' ? 'HOME' : th.key === 'world' ? 'WORLD ADVENTURE' : th.name.toUpperCase()).split('');
    g.font = `bold ${Math.round(r * 0.19)}px Arial, sans-serif`;
    const step = Math.min(0.24, 2.4 / top.length);
    top.forEach((ch, i) => { const a = (i - (top.length - 1) / 2) * step; g.save(); g.rotate(a); g.fillText(ch, 0, -r * 0.83); g.restore(); });
    g.lineWidth = 5; g.lineCap = 'round'; g.beginPath();
    for (let i = 0; i < 4; i++) { const y = -r * 0.45 + i * r * 0.3; g.moveTo(r * 1.08, y); for (let k = 0; k < 4; k++) g.quadraticCurveTo(r * (1.2 + k * 0.38), y - r * 0.14 * (k % 2 ? -1 : 1), r * (1.46 + k * 0.38), y); }
    g.stroke(); g.restore();
  }
  async function render(po, pickId, opts) {
    const ctx = currentContext(), city = Journal.cityOf(po.d, ctx), th = themeOf(city), hand = handOf(po.p);
    const list = (po.media || []).filter((m) => !Journal.media || Journal.media(m.id)).slice(0, 6).map(info), imgs = [];
    let missing = false;
    for (const m of list) {
      const kind = m.k === 'drawing' ? 'drawing' : 'photo';
      try { await Media.ensure(m.id, kind); const u = await Media.url(m.id, kind); if (!u) throw new Error('none'); const im = await loadImg(u); imgs.push({ m: Object.assign({}, m, { w: im.naturalWidth, h: im.naturalHeight }), im }); } catch (e) { missing = true; }
    }
    await fontsReady(th, hand);
    const stamp = await stampImage(th.key);
    if (!imgs.length) { const view = await viewImage(th.key); if (view) imgs.push({ m: { k: 'view', w: 1200, h: 810 }, im: view }); }   // no pictures: the drawn view of the place, as on the board
    const sc = (opts && opts.scale) || 1;
    const cv = document.createElement('canvas'); cv.width = Math.round(W * sc); cv.height = Math.round(H * sc);
    const g = cv.getContext('2d'); if (sc !== 1) g.scale(sc, sc);
    drawEdge(g, th);
    const pad = 110, has = imgs.length > 0, colX = has ? 1330 : pad + 40, colW = W - colX - pad;   // (has is false only if the drawn view itself would not load)
    if (has) {                                                         // the pictures, glued on the left the same way as on the board
      const L = layoutOf(imgs.map((x) => x.m)), boxW = 1160, boxH = 1340, k = Math.min(boxW / 100, boxH / L.h), ox = pad - 10 + (boxW - 100 * k) / 2, oy = (H - L.h * k) / 2, rnd = seeded((po.id || 'x') + '|ph');
      imgs.forEach((x, i) => {
        const [sx, sy, sw, sh, r] = L.s[i], w = sw * k, h = sh * k, draw = x.m.k === 'drawing', tilt = (r + (rnd() - 0.5) * 1.4) * Math.PI / 180, tx = 28 + rnd() * 30, tr = (rnd() - 0.5) * 12 * Math.PI / 180, bd = 16;
        g.save(); g.translate(ox + sx * k + w / 2, oy + sy * k + h / 2); g.rotate(tilt);
        g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 34; g.shadowOffsetY = 14; g.fillStyle = '#fff'; g.fillRect(-w / 2, -h / 2, w, h); g.shadowColor = 'transparent';
        drawFit(g, x.im, -w / 2 + bd, -h / 2 + bd, w - 2 * bd, h - 2 * bd, draw);
        const how = draw || x.m.k === 'view' ? 'tape' : th.attach;       // stuck on the way the place does it: tape, a pin, or corners
        if (how === 'pin') { g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 8; g.shadowOffsetY = 6; g.fillStyle = th.acc; g.beginPath(); g.arc(0, -h / 2 + 4, 24, 0, 7); g.fill(); g.shadowColor = 'transparent'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(-8, -h / 2 - 4, 7, 0, 7); g.fill(); }
        else if (how === 'corners') { g.fillStyle = th.key === 'montreal' ? '#B8901E' : th.acc; const c = 46; for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.moveTo(cx * (w / 2 + 6), cy * (h / 2 + 6)); g.lineTo(cx * (w / 2 + 6 - c), cy * (h / 2 + 6)); g.lineTo(cx * (w / 2 + 6), cy * (h / 2 + 6 - c)); g.closePath(); g.fill(); } }
        else { g.save(); g.translate(-w / 2 + w * tx / 100, -h / 2); g.rotate(tr); g.fillStyle = th.tape; g.fillRect(-90, -26, 180, 52); g.restore(); }
        g.restore();
      });
    }
    /* the right-hand side: the lettering and the stamp, then the words in the author's hand, sized to fit */
    const ss = 250, sx = W - pad - ss + 10, sy = pad - 10;
    if (stamp) { g.save(); g.translate(sx + ss / 2, sy + ss * 0.61); g.rotate(0.05); g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 16; g.shadowOffsetY = 6; g.drawImage(stamp, -ss / 2, -ss * 0.61, ss, ss * 1.22); g.restore(); }
    drawMark(g, th, po.d, sx - 60, sy + 170, 118);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const titleW = sx - colX - 200;
    g.fillStyle = th.acc2; g.font = `bold 46px ${SANS}`; g.fillText(th.hello.toUpperCase(), colX, pad + 62);
    let ts = 150; const nm = /bebas|alfa|amatic|lime/.test(th.font) ? th.name.toUpperCase() : th.name;
    for (; ts > 60; ts -= 6) { g.font = fontOf(th, ts); if (g.measureText(nm).width <= Math.max(360, titleW)) break; }
    g.fillStyle = th.nameCol || th.acc; g.fillText(nm, colX, pad + 80 + ts * 0.92);
    const top = Math.max(pad + 120 + ts, sy + ss * 1.22 + 70), bottom = H - pad - 150, boxH = bottom - top;
    const text = po.text || (list.length ? 'Here is a picture from our adventure!' : 'Thinking of you from our adventure!');
    let fs = 78, lines = [], qLines = [], dear = [];
    for (; fs >= 40; fs -= 4) {
      g.font = `${fs}px ${HAND[hand]}, ${SANS}`; lines = wrap(g, text, colW); qLines = po.q ? wrap(g, po.q, colW) : []; dear = wrap(g, `Dear ${toOf(po)},`, colW);
      if ((lines.length + qLines.length + dear.length + 0.4) * fs * 1.32 <= boxH) break;
    }
    const lh = fs * 1.32, maxLines = Math.max(2, Math.floor(boxH / lh - qLines.length - dear.length - 0.4));
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + ' …'; }
    let y = top + fs;
    g.fillStyle = th.ink; g.font = `${fs}px ${HAND[hand]}, ${SANS}`; for (const l of dear) { g.fillText(l, colX, y); y += lh; } y += lh * 0.2;
    g.fillStyle = th.acc2; for (const l of qLines) { g.fillText(l, colX, y); y += lh; }
    g.fillStyle = th.ink; for (const l of lines) { g.fillText(l, colX, y); y += lh; }
    g.font = `${Math.round(fs * 1.08)}px ${HAND[hand]}, ${SANS}`; g.fillStyle = th.acc;
    g.fillText(`Love, ${Quests.label(po.p)}${MOOD[po.mood] ? ' ' + MOOD[po.mood] : ''}`, colX, Math.min(Math.max(y + lh * 0.5, top + fs * 3), H - pad - 96));
    const km = kmFromHome(th);
    g.font = `bold 38px ${SANS}`; g.fillStyle = th.acc2;
    g.fillText(`${(th.key === 'home' || th.key === 'air' || th.key === 'world' ? placeOf(city) : th.name + ', ' + th.land).toUpperCase()}  ·  ${fmtDate(po.d).toUpperCase()}${km ? '  ·  ' + km.toLocaleString('en-AU') + ' KM FROM HOME' : ''}`, colX, H - pad - 24, colW);
    const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the postcard.'))), 'image/jpeg', sc < 1 ? 0.82 : 0.9));
    cv.width = cv.height = 0;
    return { blob, missing };
  }
  function fileName(po) { return `Postcard_${Quests.label(po.p).replace(/[^\w]+/g, '')}_${po.d}.jpg`; }
  /* the drawn cards kept ready hold the newest few (15 Nov 2026; they grew for as long as the app stayed open): a failed
     draw is forgotten */
  function keep(map, key, p, max) {
    map.set(key, p);
    p.catch(() => map.delete(key));
    while (map.size > max) map.delete(map.keys().next().value);
    return p;
  }
  function prepare(id) {                                               // the file ahead of the tap: iOS keeps share inside the tap only briefly
    if (P.files.has(id)) return P.files.get(id);
    const po = Journal.post(id); if (!po) return Promise.resolve(null);
    return keep(P.files, id, render(po).then((r) => { if (r.missing) P.files.delete(id); return new File([r.blob], fileName(po), { type: 'image/jpeg', lastModified: Date.now() }); }), 3);
  }
  /* which browser the app runs in, and whether its share sheet takes a picture (2 Nov 2026: Andy's phone showed
     Download instead of Share, so the preview and the Settings readout now say which browser and why) */
  const UA = navigator.userAgent || '';
  function browser() {
    const names = [[/SamsungBrowser\/[\d.]+/, 'Samsung Internet '], [/FxiOS\/[\d.]+/, 'Firefox iOS '], [/Firefox\/[\d.]+/, 'Firefox '], [/EdgA\/[\d.]+/, 'Edge '], [/Edg\/[\d.]+/, 'Edge '],
      [/OPR\/[\d.]+/, 'Opera '], [/CriOS\/[\d.]+/, 'Chrome iOS '], [/DuckDuckGo\/[\d.]+/, 'DuckDuckGo '], [/Chrome\/[\d.]+/, 'Chrome '], [/Version\/[\d.]+/, 'Safari ']];
    let name = 'unknown browser';
    for (const [re, label] of names) { const m = UA.match(re); if (m) { name = label + m[0].split('/')[1].split('.')[0]; break; } }
    let installed = false; try { installed = !!navigator.standalone || matchMedia('(display-mode: standalone)').matches; } catch (e) { /* none */ }
    return `${name}${/; wv\)/.test(UA) ? ' app view' : ''}${installed ? ', installed' : ', tab'}${/Android/i.test(UA) ? ', Android' : Media.ios ? ', iOS' : ''}`;
  }
  function shareInfo(file) {                                         // has: a share sheet at all; files: does it take this picture (null = cannot tell)
    const has = typeof navigator.share === 'function', can = typeof navigator.canShare === 'function';
    let files = null;
    if (file && has && can) { try { files = !!navigator.canShare({ files: [file] }); } catch (e) { files = false; } }
    return { has, can, files, browser: browser() };
  }
  function canShareFile(file) { const i = shareInfo(file); return i.files === true || (i.has && i.files === null); }   // no canShare at all: try, the sheet decides
  function diag() {
    let probe = null; try { probe = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'probe.jpg', { type: 'image/jpeg' }); } catch (e) { /* no File */ }
    const i = shareInfo(probe);
    return `sheet ${i.has ? 'yes' : 'NO'} · canShare ${i.can ? 'yes' : 'no'} · picture ${i.files === null ? '?' : i.files ? 'yes' : 'NO'} · ${i.browser}`;
  }
  function noShare(i) { const e = new Error(`${i.browser} cannot hand the picture to Mail from the app. Save the picture, then attach it to the email.`); e.name = 'NoShare'; return e; }
  async function share(file, po) {
    const i = shareInfo(file);
    if (!canShareFile(file)) throw noShare(i);
    try { await navigator.share({ files: [file], title: `Postcard from ${Quests.label(po.p)}`, text: `${firstLine(po)} · World Adventure` }); }
    catch (e) { if (e && e.name === 'TypeError') throw noShare(i); throw e; }        // TypeError: this sheet takes no pictures; AbortError: cancelled
  }
  function releaseUrls() { for (const u of P.urls) URL.revokeObjectURL(u); P.urls.length = 0; }

  /* ---------------------------------------------------------------- sending a card out of the app as a picture (a modal) */
  async function openPreview(id) {
    if (Quests.isGrandDevice()) return;                                               // Grandma and Grandpa never send cards or ask Mum and Dad (3 Nov 2026)
    const po = Journal.post(id); if (!po) return;
    releaseUrls();
    openModal(`<h2 class="h2">📤 Send this postcard</h2><p class="small muted">The postcard as a picture, for Mail or WhatsApp, or to print (6 × 4 inches).</p><div class="pc-preview" id="pc-preview"><p class="muted">Drawing the postcard…</p></div>`);
    let file = null;
    try { file = await prepare(id); } catch (e) { const el = $('#pc-preview'); if (el) el.innerHTML = `<div class="card red">${esc((e && e.message) || 'Could not draw the postcard.')}</div>`; return; }
    const el = $('#pc-preview'); if (!el || !file) return;                            // the modal closed meanwhile
    const url = URL.createObjectURL(file); P.urls.push(url);
    const st = Quests.cardStatus(id), parent = Quests.isParentDevice(), si = shareInfo(file);
    el.innerHTML = `<img id="pc-img" src="${url}" alt="Postcard"><div id="pc-actions"></div>`;
    const mailto = () => `mailto:?subject=${encodeURIComponent('Postcard from ' + Quests.label(po.p))}&body=${encodeURIComponent(words(po))}`;
    const extra = `${st.sent ? ' Sent before; sending again is fine.' : ''}${st.rejected && !parent ? ' Last time they said not this time; you can ask again.' : ''}`;
    const actions = (why) => {                                                       // why: the NoShare error after a Share that the sheet refused, else null
      const box = $('#pc-actions'); if (!box) return;
      const can = !why && canShareFile(file);
      let html = '<div class="row">';
      if (parent) html += can ? `<button class="btn primary" id="pc-share">📤 Share</button><a class="btn" href="${url}" download="${esc(file.name)}">⬇️ Save the picture</a>` : `<a class="btn primary" href="${url}" download="${esc(file.name)}">⬇️ Save the picture</a><a class="btn" href="${mailto()}">✉️ Email the words</a>`;
      else html += st.sent ? `<span class="chip">✓ Sent</span>` : st.pending ? `<span class="chip">⏳ Mum and Dad have it</span>` : `<button class="btn primary" id="pc-ask">📮 Ask Mum and Dad to send it</button>`;
      html += `<button class="btn" id="pc-copy">📋 Copy the words</button></div>`;
      const fallback = `${why ? why.message : noShare(si).message} Chrome on Android and Safari on iPhone usually share it in one tap.`;
      html += `<p class="tiny muted">${parent ? (can ? 'Share opens Mail or WhatsApp with the postcard attached: pick who gets it and send.' : esc(fallback)) : 'Mum or Dad send it from their phone when they say yes.'}${extra}</p>`;
      box.innerHTML = html;
      const sh = $('#pc-share');
      if (sh) sh.onclick = async () => { sh.disabled = true; try { await share(file, po); Quests.approveCard(id); closeModal(); } catch (e) { sh.disabled = false; if (e && e.name === 'NoShare') actions(e); else if (e && e.name !== 'AbortError') alert((e && e.message) || 'Could not share.'); } };
      const ask = $('#pc-ask'); if (ask) ask.onclick = () => { Quests.requestCard(id, null); closeModal(); };
      const cp = $('#pc-copy'); if (cp) cp.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(words(po)).then(() => { cp.textContent = '✓ Copied'; }, () => {}); };
    };
    actions(null);
  }
  /* the parent's ✓ on a waiting postcard: share from this phone, then mark it sent and tick the quest for the author */
  async function sendApproved(key) {
    const id = String(key || '').replace(/^card\|/, ''), po = Journal.post(id);
    if (!po) { alert('That postcard is gone.'); return false; }
    let file = null;
    try { file = await prepare(id); } catch (e) { alert((e && e.message) || 'Could not draw the postcard.'); return false; }
    if (!file) return false;
    try { await share(file, po); Quests.approveCard(id); return true; }
    catch (e) { if (e && e.name !== 'AbortError') alert((e && e.message) || 'Could not share.'); return false; }
  }

  return { TO, cleanTo, toOf, cardHtml, photosHtml, signHtml, stampHtml, fit, themeOf, handOf, layoutOf, render, prepare, picOf, words, share, openPreview, sendApproved, firstLine, canShareFile, shareInfo, diag, releaseUrls,
    lookOf: themeOf, themes: () => TH };
})();
