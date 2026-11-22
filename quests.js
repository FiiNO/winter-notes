/* Travel Dossier quests: badges, points and levels for the kids (and the grown-ups), 31 Oct 2026.
   Scores are a set of facts (quest ticks, food notes, parent approvals, avatars), each stamped with a time and the
   device that wrote it, so any number of devices merge without conflicts: the newest fact per key wins. With a sync
   address in the family blob (see ../sync/README.md) the facts travel through the Worker; without one they stay here.
   Roles: a device is Dad's phone, Mum's phone or the kids' device. On the kids' device every tick (and every
   "tried a new food") waits for a parent's ✓ before it counts; a quest marked auto: true is the one exception.
   Nothing here is secret and nothing names the 5 January plan beyond the family wording.
   Loaded after sync.js and before app.js; it only touches app.js helpers ($, esc, fmtDate, currentContext, show,
   openModal, closeModal, verifyPin, renderHome, renderSettings) at call time. */
'use strict';
window.Quests = (() => {
  const KEY = 'quests:v2', OLD_KEY = 'quests:v1';
  const CITY_EMOJI = { Home: '🏡', Townsville: '🏡', Brisbane: '🐨', Cairns: '🐊', Vancouver: '🌲', Whistler: '⛄', Toronto: '🍁', 'New York': '🗽', 'Montréal': '🏒', Montreal: '🏒', Tokyo: '🗼', Nagoya: '🧱', Air: '✈️' };
  const CITY_KEY = { Home: 'home', Townsville: 'townsville', Brisbane: 'brisbane', Cairns: 'cairns', Vancouver: 'vancouver', Whistler: 'whistler', Toronto: 'toronto', 'New York': 'newyork', 'Montréal': 'montreal', Montreal: 'montreal', Tokyo: 'tokyo', Nagoya: 'nagoya', Air: 'air' };
  const CITIES = ['Brisbane', 'Vancouver', 'Whistler', 'Toronto', 'New York', 'Montréal', 'Tokyo', 'Nagoya', 'Cairns', 'Townsville'];
  const CHAMPION_CITIES = ['Vancouver', 'Whistler', 'Toronto', 'New York', 'Montréal', 'Tokyo', 'Nagoya'];
  const AIRPORTS = { BNE: 'Brisbane', CNS: 'Cairns', TSV: 'Townsville' };   // the Australian stops live in the moves, not the days
  /* avatars in themed groups (1 Nov 2026, Andy: "many more icons/emojis"); Emoji 13 or older so the iPad, the
     iPhone and Andy's Android all draw them. Nothing here hints at the 5 January plan. */
  const AVATAR_GROUPS = [
    ['Animals', ['🦖', '🦕', '🦄', '🐼', '🦊', '🐨', '🐯', '🦁', '🐸', '🦋', '🐙', '🐧', '🦈', '🐬', '🐳', '🦉', '🐺', '🐻‍❄️', '🦅', '🐉', '🦩', '🐢', '🦜', '🐝', '🦔', '🐵', '🐶', '🐱', '🐰', '🐮', '🐷', '🦒', '🦓', '🦘', '🐊', '🦎', '🐍', '🦀', '🐞', '🦚', '🦭', '🦦', '🦥', '🐿️', '🦇', '🐲']],
    ['Snow and travel', ['⛷️', '🏂', '⛸️', '🛷', '🏔️', '⛄', '☃️', '❄️', '🧊', '🎿', '🚀', '✈️', '🛩️', '🚂', '🚅', '🚁', '🛸', '🚲', '🛶', '⛵', '🎈', '🧭', '🎒', '🚠', '🏕️', '🗼', '🗽', '🎌', '🍁']],
    ['Sky and nature', ['🌟', '⭐', '🌙', '☀️', '🌈', '🌋', '🌊', '🔥', '⚡', '🌪️', '🪐', '🌍', '☄️', '🌸', '🌵', '🍄', '🌺', '🌻', '🍀', '🌴', '🎋', '🪨']],
    ['Food', ['🍣', '🍜', '🍙', '🍡', '🍩', '🍕', '🍔', '🌮', '🍦', '🍓', '🍉', '🍒', '🥐', '🧁', '🍪', '🥞', '🧇', '🍫', '🍭', '🍿', '🥨', '🍱', '🍤', '🍧', '🥟', '🍋']],
    ['Heroes and friends', ['🧙', '🦸', '🦹', '🕵️', '🧚', '🧜', '🧝', '🧞', '🧛', '🧟', '🥷', '🧑‍🚀', '🧑‍🚒', '🧑‍✈️', '🧑‍🎤', '🧑‍🔬', '🧑‍🍳', '🤖', '👻', '👽', '🤠', '🎅', '🤶', '👑', '🎃', '👾', '🧸', '🦺']],
    ['People', ['👶', '🧒', '👦', '👧', '🧑', '👨', '👩', '🧔', '👱', '👱‍♀️', '👨‍🦰', '👩‍🦰', '👨‍🦱', '👩‍🦱', '👨‍🦳', '👩‍🦳', '👨‍🦲', '👩‍🦲', '🧓', '👴', '👵', '🤴', '👸', '👮', '👷', '💂', '👩‍⚕️', '👨‍⚕️', '🧑‍🎓', '👩‍🏫', '👨‍🏫', '👩‍🌾', '👨‍🌾', '👩‍🍳', '👨‍🍳', '👩‍🔧', '👨‍🔧', '👩‍🔬', '👨‍🔬', '👩‍💻', '👨‍💻', '👩‍🎤', '👨‍🎤', '👩‍🎨', '👨‍🎨', '👩‍✈️', '👨‍✈️', '👩‍🚀', '👨‍🚀', '👩‍🚒', '👨‍🚒', '🤵', '👰', '👼', '🙋', '🙆', '💁', '🤷', '🙇', '🤦', '💆', '💇', '🚶', '🏃', '💃', '🕺', '🕴️', '👯', '🧖', '🧗', '🏇', '🏌️', '🏄', '🚣', '🏊', '⛹️', '🏋️', '🚴', '🚵', '🤸', '🤼', '🤽', '🤾', '🤹', '🧘', '🛀', '👫', '👬', '👭']],
    ['Kids and grown-ups', ['👶🏻', '👶🏼', '👶🏽', '👶🏾', '👶🏿', '🧒🏻', '🧒🏼', '🧒🏽', '🧒🏾', '🧒🏿', '👦🏻', '👦🏼', '👦🏽', '👦🏾', '👦🏿', '👧🏻', '👧🏼', '👧🏽', '👧🏾', '👧🏿', '👨🏻', '👨🏼', '👨🏽', '👨🏾', '👨🏿', '👩🏻', '👩🏼', '👩🏽', '👩🏾', '👩🏿', '🧑🏻', '🧑🏼', '🧑🏽', '🧑🏾', '🧑🏿']],
    ['Sport and play', ['⚽', '🏀', '🏈', '⚾', '🎾', '🏒', '🏓', '🎳', '🎯', '🎮', '🎸', '🥁', '🎺', '🎨', '🎭', '🎪', '🎲', '🏆', '🥇', '🎁', '🧩', '🪁', '🛹', '🛼', '🏹', '🥊', '🎤', '🎧']],
    ['Faces', ['😀', '😎', '🤓', '🥳', '🤩', '😜', '🤪', '😇', '🥸', '🤗', '😺', '🙃', '🥶', '🤭', '😴', '🤔', '😈', '🤑', '🥰', '😤', '😊', '😁', '🤣', '😍', '😋', '😏', '🥺', '😡', '🤯', '😱', '🥵', '🤒', '😷', '🥱', '🤫', '🧐', '😬', '🙄', '😵', '🤤', '😻', '🙀', '🤡', '👹', '👺', '💩', '💀']],
  ];
  const AVATARS = AVATAR_GROUPS.flatMap((g) => g[1]);
  /* 1 Nov 2026: an emoji this device cannot draw as one glyph (a ZWJ profession or a skin tone on an older font)
     comes out as two or three symbols and breaks the grid, so the picker hides it. A canvas measures each one once
     against a plain face: more than 1.35× that width means it fell apart. */
  let emojiW = null;
  function emojiOk(e) {
    if (!emojiW) {
      emojiW = { cache: {} };
      try { const g = document.createElement('canvas').getContext('2d'); g.font = '32px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; emojiW.g = g; emojiW.ref = g.measureText('🙂').width; } catch (err) { emojiW.g = null; }
    }
    if (!emojiW.g || !emojiW.ref) return drawable(e);
    if (!(e in emojiW.cache)) emojiW.cache[e] = emojiW.g.measureText(e).width <= emojiW.ref * 1.35 && drawable(e);
    return emojiW.cache[e];
  }
  /* 15 Nov 2026: an emoji newer than the device's font (the kids' tablet has Android 8's, from 2017) is drawn as an empty box,
     which the width test cannot see: a box is as wide as a face. A colour emoji ignores the ink it is drawn with and a box
     does not, so a newer glyph is drawn once in pure red and looked at: ink that is all red means there is no picture.
     Only glyphs from the newer blocks are tested; the older ones are on every device the family has. */
  const newer = (e) => { const cp = String(e).codePointAt(0); return cp >= 0x1F900 || (cp >= 0x1F6D0 && cp <= 0x1F6FF) || (cp >= 0x1F7E0 && cp <= 0x1F7FF); };
  const drawn = {}; let probe = null;
  function drawable(e) {
    if (!newer(e)) return true;
    if (e in drawn) return drawn[e];
    let ok = true;
    try {
      if (!probe) { const c = document.createElement('canvas'); c.width = c.height = 24; probe = c.getContext('2d'); probe.font = '18px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; probe.textBaseline = 'top'; probe.fillStyle = '#f00'; }
      probe.clearRect(0, 0, 24, 24); probe.fillText(e, 0, 2);
      const px = probe.getImageData(0, 0, 24, 24).data; let ink = 0, colour = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 40) { ink++; if (px[i + 1] > 60 || px[i + 2] > 60) colour++; }
      ok = ink === 0 || colour > 0;                              // nothing drawn at all: cannot tell, so leave it be
    } catch (err) { ok = true; }
    return (drawn[e] = ok);
  }
  const STAND_IN = { '🧳': '💼', '🪟': '🏠', '🫣': '🙈', '🦝': '🐻', '🦫': '🐹', '🥯': '🍩', '🥿': '👟', '🧱': '🏯', '🫕': '🧀', '🪧': '📣', '🛝': '🎠', '🧮': '🔢', '🥭': '🍍', '🪜': '⛰️', '🥾': '👟', '🧭': '⚓', '🦸': '💪' };
  const glyph = (e) => (drawable(e) ? e : (STAND_IN[e] || '⭐'));   // the quest, level, badge and stamp pictures go through this once, at load
  const avatarsOk = () => AVATARS.filter(emojiOk);
  const DEFAULT_AVATAR = { Andrew: '🕵️', Sarah: '🌟', Vince: '🦖', Drew: '🦄', Grandma: '👵', Grandpa: '👴' };
  const GRAND = ['Grandma', 'Grandpa'];                       // the two faces on Grandma and Grandpa's phone (2 Nov 2026); never points
  const GRANDS = 'Grandparents';                              // the one author on that phone (3 Nov 2026): a ❤️ or a reply is from "Grandma and Grandpa", both faces, no "I'm Grandma" to tap first
  const DISPLAY = { Andrew: 'Dad', Sarah: 'Mum' };          // the parents; everyone else is a kid
  // [points, name, glyph, colour]: the glyph is also the mini badge in the corner of every face (3 Nov 2026), so each level has its own
  const LEVELS = [[0, 'Rookie', '🥾', '#8D99AE'], [100, 'Explorer', '🗺️', '#2A9D8F'], [250, 'Adventurer', '🎒', '#FF7A00'], [500, 'Navigator', '🧭', '#3A86FF'], [900, 'Globetrotter', '🌏', '#06D6A0'], [1500, 'Legend', '👑', '#FFB703']];
  const FOOD_PTS = 10;

  /* kind: food · explore · helper · words · travel · daily. where: a city, 'any' (whole trip), 'home' (before we go).
     A kid's tick on any quest waits for a parent's ✓ (Andy, 1 Nov: "parent approval for most of the kids' challenges");
     auto: true lets a quest count at once on the kids' device (the diary and the postcard: a post never waits). Parent ticks never wait.
     write: true marks a quest that is ticked by writing a postcard (journal.js addPost): its row offers "Write" in place of "Done!". */
  const QUESTS = [
    // before we go
    { id: 'pack-case', e: '🧳', t: 'Help pack your own suitcase', pts: 20, where: 'home', kind: 'helper' },
    { id: 'flu-shot', e: '💉', t: 'Brave the flu shot', pts: 30, where: 'home', kind: 'helper', retired: true },   // taken off the list (22 Nov 2026, Andy). retired: no longer offered anywhere, but a tick made before still counts, so nobody loses points
    { id: 'learn-ja', e: '🇯🇵', t: 'Learn three Japanese words', pts: 20, where: 'home', kind: 'words' },
    { id: 'learn-fr', e: '🇫🇷', t: 'Learn three French words', pts: 20, where: 'home', kind: 'words' },
    { id: 'know-numbers', e: '📱', t: "Know Mum and Dad's numbers by heart, and that we are from Australia", pts: 50, where: 'any', kind: 'helper' },
    { id: 'thermals', e: '🧤', t: 'Try on your thermals and gloves', pts: 10, where: 'home', kind: 'helper' },
    // every day, anywhere
    { id: 'photo', e: '📸', t: 'Morning photo taken (grown-ups)', pts: 5, where: 'any', kind: 'daily', daily: true, parents: true },
    { id: 'daypack', e: '🎒', t: 'Pack your own daypack', pts: 5, where: 'any', kind: 'daily', daily: true },
    { id: 'hands', e: '🤝', t: 'Hold hands at every crossing and station', pts: 5, where: 'any', kind: 'daily', daily: true },
    { id: 'thanks', e: '🙏', t: 'Say thank you in the local language', pts: 5, where: 'any', kind: 'daily', daily: true },
    { id: 'water', e: '💧', t: 'Drink water before bed', pts: 5, where: 'any', kind: 'daily', daily: true },
    { id: 'diary', e: '📓', t: 'Draw or write one line about today', pts: 5, where: 'any', kind: 'daily', daily: true, auto: true },   // 1 Nov: story posts never wait for a parent (Andy)
    // travel days
    { id: 'first-flight', e: '🛫', t: 'Take off on the first flight', pts: 30, where: 'any', kind: 'travel' },
    { id: 'window', e: '🪟', t: 'Spot mountains or clouds from the window seat', pts: 10, where: 'any', kind: 'travel' },
    { id: 'carousel', e: '🧳', t: 'Spot our bags on the carousel first', pts: 10, where: 'any', kind: 'travel' },
    { id: 'passport', e: '🛂', t: 'Carry your own passport through immigration', pts: 20, where: 'any', kind: 'travel' },
    { id: 'sleep-plane', e: '😴', t: 'Sleep on a plane', pts: 20, where: 'any', kind: 'travel' },
    { id: 'taxi-card', e: '🚕', t: 'Show a taxi card to a driver', pts: 15, where: 'any', kind: 'helper' },
    { id: 'rally', e: '📍', t: 'Find the meeting point at a big venue', pts: 15, where: 'any', kind: 'helper' },
    // Vancouver
    { id: 'seawall', e: '🌊', t: 'Walk the seawall', pts: 20, where: 'Vancouver', kind: 'explore' },
    { id: 'totem', e: '🗿', t: 'Spot a totem pole', pts: 15, where: 'Vancouver', kind: 'explore' },
    { id: 'science-world', e: '🔬', t: 'See the Science World dome', pts: 15, where: 'Vancouver', kind: 'explore' },
    { id: 'canada-line', e: '🚆', t: 'Ride the Canada Line', pts: 15, where: 'Vancouver', kind: 'explore' },
    { id: 'nanaimo', e: '🍫', t: 'Eat a Nanaimo bar', pts: 15, where: 'Vancouver', kind: 'food' },
    { id: 'seaplane', e: '🛩️', t: 'Watch a sea plane take off', pts: 10, where: 'Vancouver', kind: 'explore' },
    { id: 'aquarium', e: '🐙', t: 'Find an octopus at the aquarium', pts: 15, where: 'Vancouver', kind: 'explore' },
    { id: 'capilano', e: '🌉', t: 'Cross the Capilano bridge', pts: 25, where: 'Vancouver', kind: 'explore' },
    // Whistler
    { id: 'gondola', e: '🚡', t: 'Ride the Peak 2 Peak gondola', pts: 25, where: 'Whistler', kind: 'explore' },
    { id: 'tubing', e: '🛷', t: 'Go snow tubing', pts: 25, where: 'Whistler', kind: 'explore' },
    { id: 'snowman', e: '⛄', t: 'Build a snowman', pts: 20, where: 'Whistler', kind: 'explore' },
    { id: 'snowflake', e: '❄️', t: 'Catch a snowflake on your tongue', pts: 10, where: 'Whistler', kind: 'explore' },
    { id: 'cocoa', e: '☕', t: 'Hot chocolate by a fire', pts: 10, where: 'Whistler', kind: 'food' },
    { id: 'snow-angel', e: '👼', t: 'Make a snow angel', pts: 10, where: 'Whistler', kind: 'explore' },
    { id: 'lumina', e: '✨', t: 'Walk the Vallea Lumina lights', pts: 20, where: 'Whistler', kind: 'explore' },
    // Toronto
    { id: 'cn-tower', e: '🗼', t: 'Go up the CN Tower', pts: 25, where: 'Toronto', kind: 'explore' },
    { id: 'glass-floor', e: '🫣', t: 'Stand on the glass floor', pts: 20, where: 'Toronto', kind: 'explore' },
    { id: 'dino', e: '🦕', t: 'Find the biggest dinosaur at the ROM', pts: 15, where: 'Toronto', kind: 'explore' },
    { id: 'raccoon', e: '🦝', t: 'Spot a raccoon (Toronto\'s unofficial mascot)', pts: 15, where: 'Toronto', kind: 'explore' },
    { id: 'streetcar', e: '🚋', t: 'Ride a streetcar', pts: 10, where: 'Toronto', kind: 'explore' },
    { id: 'peameal', e: '🥪', t: 'Eat a peameal bacon sandwich', pts: 15, where: 'Toronto', kind: 'food' },
    { id: 'raptors', e: '🏀', t: 'Cheer at a Raptors game', pts: 25, where: 'Toronto', kind: 'explore' },
    { id: 'niagara', e: '🌈', t: 'See Niagara Falls lit up', pts: 30, where: 'Toronto', kind: 'explore' },
    { id: 'eh', e: '🍁', t: 'Say "eh" to a Canadian', pts: 10, where: 'Toronto', kind: 'words' },
    { id: 'zoo', e: '🐧', t: 'Find the penguins at the zoo', pts: 15, where: 'Toronto', kind: 'explore' },
    { id: 'beavertail', e: '🦫', t: 'Eat a BeaverTail pastry', pts: 15, where: 'Toronto', kind: 'food' },
    // New York
    { id: 'rink', e: '⛸️', t: 'Skate at Rockefeller Center', pts: 30, where: 'New York', kind: 'explore' },
    { id: 'big-tree', e: '🎄', t: 'See the giant Christmas tree', pts: 15, where: 'New York', kind: 'explore' },
    { id: 'central-park', e: '🌳', t: 'Walk through Central Park', pts: 15, where: 'New York', kind: 'explore' },
    { id: 'pizza', e: '🍕', t: 'Fold a New York pizza slice', pts: 15, where: 'New York', kind: 'food' },
    { id: 'subway', e: '🚇', t: 'Ride the subway', pts: 15, where: 'New York', kind: 'explore' },
    { id: 'yellow-cab', e: '🚖', t: 'Ride in a yellow cab', pts: 10, where: 'New York', kind: 'explore' },
    { id: 'pretzel', e: '🥨', t: 'Hot pretzel from a street cart', pts: 10, where: 'New York', kind: 'food' },
    { id: 'times-square', e: '🌃', t: 'Count ten screens in Times Square', pts: 10, where: 'New York', kind: 'explore' },
    { id: 'nintendo', e: '🎮', t: 'Visit Nintendo New York', pts: 15, where: 'New York', kind: 'explore' },
    // Montréal
    { id: 'bonjour', e: '👋', t: 'Say bonjour to someone', pts: 10, where: 'Montréal', kind: 'words' },
    { id: 'order-fr', e: '🗣️', t: 'Order something in French', pts: 25, where: 'Montréal', kind: 'words' },
    { id: 'poutine', e: '🍟', t: 'Eat poutine', pts: 15, where: 'Montréal', kind: 'food' },
    { id: 'bagel', e: '🥯', t: 'Try a Montréal bagel', pts: 15, where: 'Montréal', kind: 'food' },
    { id: 'biodome', e: '🐧', t: 'See the penguins at the Biodôme', pts: 20, where: 'Montréal', kind: 'explore' },
    { id: 'habs', e: '🏒', t: 'Cheer at the hockey', pts: 25, where: 'Montréal', kind: 'explore' },
    { id: 'old-montreal', e: '🏰', t: 'Walk Old Montréal in the snow', pts: 15, where: 'Montréal', kind: 'explore' },
    { id: 'taffy', e: '🍁', t: 'Maple taffy on snow', pts: 15, where: 'Montréal', kind: 'food' },
    { id: 'merci', e: '🙏', t: 'Say merci ten times in a day', pts: 10, where: 'Montréal', kind: 'words' },
    // Tokyo
    { id: 'arigato', e: '🙇', t: 'Say arigatō and bow back', pts: 10, where: 'Tokyo', kind: 'words' },
    { id: 'suica', e: '💳', t: 'Tap through a ticket gate with a Suica', pts: 15, where: 'Tokyo', kind: 'explore' },
    { id: 'vending', e: '🥤', t: 'Buy a drink from a vending machine', pts: 10, where: 'Tokyo', kind: 'food' },
    { id: 'sushi-train', e: '🍣', t: 'Eat at a conveyor-belt sushi place', pts: 20, where: 'Tokyo', kind: 'food' },
    { id: 'shrine', e: '⛩️', t: 'Visit a shrine for hatsumōde', pts: 20, where: 'Tokyo', kind: 'explore' },
    { id: 'skytree', e: '🗼', t: 'Go up Tokyo Skytree', pts: 25, where: 'Tokyo', kind: 'explore' },
    { id: 'fukubukuro', e: '🎁', t: 'Open a fukubukuro lucky bag', pts: 20, where: 'Tokyo', kind: 'explore' },
    { id: 'koban', e: '👮', t: 'Find a kōban (police box)', pts: 15, where: 'Tokyo', kind: 'helper' },
    { id: 'onigiri', e: '🍙', t: 'Onigiri from a konbini', pts: 10, where: 'Tokyo', kind: 'food' },
    { id: 'soba', e: '🍜', t: 'Toshikoshi soba on New Year\'s Eve', pts: 20, where: 'Tokyo', kind: 'food' },
    { id: 'taiyaki', e: '🐟', t: 'Eat a taiyaki', pts: 10, where: 'Tokyo', kind: 'food' },
    { id: 'slurp', e: '🍥', t: 'Slurp ramen (loudly is polite)', pts: 15, where: 'Tokyo', kind: 'food' },
    { id: 'shoes', e: '🥿', t: 'Shoes off at the door, every time', pts: 10, where: 'Tokyo', kind: 'helper' },
    { id: 'arcade', e: '🕹️', t: 'One go in an Akihabara arcade', pts: 15, where: 'Tokyo', kind: 'explore' },
    { id: 'teamlab', e: '🌌', t: 'Walk through the water at teamLab', pts: 25, where: 'Tokyo', kind: 'explore' },
    { id: 'shinkansen', e: '🚅', t: 'Ride the Shinkansen', pts: 30, where: 'Tokyo', kind: 'travel' },
    { id: 'kitkat', e: '🍵', t: 'Try a weird KitKat flavour', pts: 10, where: 'Tokyo', kind: 'food' },
    { id: 'sensoji', e: '🏮', t: 'Walk under the big lantern at Sensō-ji', pts: 15, where: 'Tokyo', kind: 'explore' },
    // Nagoya day trip
    { id: 'legoland', e: '🧱', t: 'Build something at LEGOLAND', pts: 25, where: 'Nagoya', kind: 'explore' },
    { id: 'ekiben', e: '🍱', t: 'Eat an ekiben on the train', pts: 15, where: 'Nagoya', kind: 'food' },
    // 31 Oct additions: the Australian stops, more per city, and a few for any day
    { id: 'plane-clothes', e: '🧦', t: 'Lay out your plane clothes the night before', pts: 10, where: 'home', kind: 'helper' },
    { id: 'weigh-cases', e: '⚖️', t: 'Help weigh the suitcases', pts: 10, where: 'home', kind: 'helper' },
    { id: 'time-vancouver', e: '🕰️', t: 'Work out what time it is in Vancouver right now', pts: 15, where: 'home', kind: 'explore' },
    { id: 'house-check', e: '🔑', t: 'Check the house: lights off, doors locked', pts: 10, where: 'home', kind: 'helper' },
    { id: 'bne-gate', e: '🛫', t: 'Find our gate on the big departures board', pts: 15, where: 'Brisbane', kind: 'explore' },
    { id: 'bne-river', e: '🌊', t: 'Spot the Brisbane River from the plane', pts: 10, where: 'Brisbane', kind: 'explore' },
    { id: 'bne-walk', e: '🚶', t: 'Walk the whole international terminal', pts: 10, where: 'Brisbane', kind: 'explore' },
    { id: 'bne-water', e: '💧', t: 'Fill your water bottle after security', pts: 10, where: 'Brisbane', kind: 'helper' },
    { id: 'seat-map', e: '🗺️', t: 'Watch our plane on the seat-back map', pts: 10, where: 'any', kind: 'travel' },
    { id: 'plane-meal', e: '🍽️', t: 'Eat a whole plane meal', pts: 10, where: 'any', kind: 'food' },
    { id: 'aisle-stretch', e: '🧘', t: 'Walk the aisle and stretch on the long flight', pts: 10, where: 'any', kind: 'travel' },
    { id: 'new-film', e: '🎬', t: 'Watch a film you have never seen', pts: 10, where: 'any', kind: 'travel' },
    { id: 'flyover', e: '🎢', t: 'FlyOver Canada', pts: 20, where: 'Vancouver', kind: 'explore' },
    { id: 'robson-rink', e: '⛸️', t: 'Skate at Robson Square', pts: 20, where: 'Vancouver', kind: 'explore' },
    { id: 'eagle', e: '🦅', t: 'Spot a bald eagle', pts: 15, where: 'Vancouver', kind: 'explore' },
    { id: 'granville', e: '🛝', t: 'Granville Island Kids Market', pts: 15, where: 'Vancouver', kind: 'explore' },
    { id: 'maple-cookie', e: '🍪', t: 'Try a maple cookie', pts: 10, where: 'Vancouver', kind: 'food' },
    { id: 'toboggan', e: '🛷', t: 'Toboggan run', pts: 15, where: 'Whistler', kind: 'explore' },
    { id: 'magic-castle', e: '🏰', t: 'Magic Castle play area', pts: 10, where: 'Whistler', kind: 'explore' },
    { id: 'bear-sign', e: '🐻', t: 'Find a bear warning sign (the bears are asleep for winter)', pts: 10, where: 'Whistler', kind: 'explore' },
    { id: 'fondue', e: '🫕', t: 'Fondue or raclette dinner', pts: 15, where: 'Whistler', kind: 'food' },
    { id: 'sharks', e: '🦈', t: "Ripley's shark tunnel", pts: 15, where: 'Toronto', kind: 'explore' },
    { id: 'xmas-market', e: '🎄', t: 'Christmas market', pts: 15, where: 'Toronto', kind: 'explore' },
    { id: 'casa-loma', e: '🏰', t: 'Casa Loma lights', pts: 15, where: 'Toronto', kind: 'explore' },
    { id: 'toronto-sign', e: '🪧', t: 'Photo at the TORONTO sign', pts: 10, where: 'Toronto', kind: 'explore' },
    { id: 'timbits', e: '🍩', t: 'Timbits from Tim Hortons', pts: 10, where: 'Toronto', kind: 'food' },
    { id: 'sorry', e: '🙏', t: 'Say "sorry" like a Canadian', pts: 10, where: 'Toronto', kind: 'words' },
    { id: 'liberty', e: '🗽', t: 'Spot the Statue of Liberty', pts: 15, where: 'New York', kind: 'explore' },
    { id: 'empire', e: '🏙️', t: 'Empire State Building lit up', pts: 15, where: 'New York', kind: 'explore' },
    { id: 'saks', e: '✨', t: 'Saks light show', pts: 10, where: 'New York', kind: 'explore' },
    { id: 'busker', e: '🎷', t: 'Hear a street musician', pts: 10, where: 'New York', kind: 'explore' },
    { id: 'cheesecake', e: '🍰', t: 'New York cheesecake', pts: 10, where: 'New York', kind: 'food' },
    { id: 'metro', e: '🚇', t: 'Ride the métro', pts: 10, where: 'Montréal', kind: 'explore' },
    { id: 'snowplough', e: '❄️', t: 'Spot a snowplough', pts: 10, where: 'Montréal', kind: 'explore' },
    { id: 'croissant', e: '🥐', t: 'Croissant from a boulangerie', pts: 10, where: 'Montréal', kind: 'food' },
    { id: 'au-revoir', e: '👋', t: 'Say "au revoir" when we leave', pts: 10, where: 'Montréal', kind: 'words' },
    { id: 'panda', e: '🐼', t: 'Panda at Ueno Zoo', pts: 20, where: 'Tokyo', kind: 'explore' },
    { id: 'toilet', e: '🚽', t: 'Press the buttons on a Japanese toilet', pts: 10, where: 'Tokyo', kind: 'explore' },
    { id: 'vending-ten', e: '🧮', t: 'Count ten vending machines in one street', pts: 10, where: 'Tokyo', kind: 'explore' },
    { id: 'chopsticks', e: '🥢', t: 'Use chopsticks for a whole meal', pts: 15, where: 'Tokyo', kind: 'helper' },
    { id: 'shibuya', e: '🚶', t: 'Cross the Shibuya scramble', pts: 15, where: 'Tokyo', kind: 'explore' },
    { id: 'hachiko', e: '🐕', t: 'Find the Hachikō statue', pts: 15, where: 'Tokyo', kind: 'explore' },
    { id: 'melon-pan', e: '🍈', t: 'Melon pan', pts: 10, where: 'Tokyo', kind: 'food' },
    { id: 'dango', e: '🍡', t: 'Dango', pts: 10, where: 'Tokyo', kind: 'food' },
    { id: 'count-ja', e: '🔢', t: 'Count to ten in Japanese', pts: 20, where: 'Tokyo', kind: 'words' },
    { id: 'fuji', e: '🗻', t: 'Spot Mount Fuji from the Shinkansen', pts: 20, where: 'Nagoya', kind: 'explore' },
    { id: 'cns-sunrise', e: '🌄', t: 'Watch the sun come up over Cairns', pts: 15, where: 'Cairns', kind: 'explore' },
    { id: 'cns-hot', e: '🌴', t: 'First to say "it\'s hot!"', pts: 10, where: 'Cairns', kind: 'explore' },
    { id: 'cns-tropical', e: '🥭', t: 'Something tropical at the airport', pts: 10, where: 'Cairns', kind: 'food' },
    { id: 'unpack', e: '🧳', t: 'Unpack your own suitcase', pts: 20, where: 'Townsville', kind: 'helper' },
    { id: 'own-bed', e: '🛏️', t: 'Sleep in your own bed again', pts: 10, where: 'Townsville', kind: 'explore' },
    { id: 'tell-grandparents', e: '📖', t: 'Tell Grandma or Grandpa three things about the trip', pts: 20, where: 'Townsville', kind: 'words' },
    { id: 'postcard', e: '💌', t: 'Write a postcard to the grandparents', pts: 15, where: 'any', kind: 'helper', daily: true, auto: true, write: true },   // 17 Nov 2026 (Andy: "ticked by writing it not sending it"): ticked when its author posts a postcard that day; before that, when a parent sent one out
    { id: 'flags', e: '🏳️', t: 'Spot five different flags in one day', pts: 10, where: 'any', kind: 'explore' },
    { id: 'carry-bag', e: '🪜', t: 'Carry a bag up the stairs for someone', pts: 10, where: 'any', kind: 'helper' },
    { id: 'new-friend', e: '🤝', t: 'Make a friend who speaks another language', pts: 25, where: 'any', kind: 'words' },
  ];
  for (const q of QUESTS) q.e = glyph(q.e);
  for (const l of LEVELS) l[2] = glyph(l[2]);
  for (const k of Object.keys(CITY_EMOJI)) CITY_EMOJI[k] = glyph(CITY_EMOJI[k]);
  const byId = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
  const needsVerify = (q) => !!(q && !q.auto);               // a kid's tick waits for a parent unless the quest is auto

  /* ---------------------------------------------------------------- people and roles */
  function people() { return ((typeof S !== 'undefined' && S.family && S.family.trip && S.family.trip.people) || ['Andrew', 'Sarah', 'Vince', 'Drew']).slice(); }
  const label = (p) => DISPLAY[p] || (p === GRANDS ? 'Grandma and Grandpa' : p);
  const isParent = (p) => !!DISPLAY[p];
  const parents = () => people().filter(isParent);
  const kids = () => people().filter((p) => !isParent(p));
  const role = () => localStorage.getItem('deviceRole') || '';            // 'parent' | 'kids' | 'grand' (Grandma and Grandpa's phone, reads only; 2 Nov 2026) | '' (not chosen yet)
  const owner = () => localStorage.getItem('deviceOwner') || '';          // the parent a parent phone belongs to
  const isParentDevice = () => role() === 'parent';
  const isGrandDevice = () => role() === 'grand';
  const visiblePlayers = () => (isParentDevice() ? people() : isGrandDevice() ? [GRANDS] : kids());
  function setRole(r, who) {
    localStorage.setItem('deviceRole', r); localStorage.setItem('deviceOwner', who || '');
    if (typeof applyRoleChrome === 'function') applyRoleChrome();
    const st = state(); if (!visiblePlayers().includes(st.active)) { st.active = visiblePlayers()[0]; save(st); }
    Sync.touch();
  }
  function deviceName() { return isParentDevice() ? `${parentName()}'s phone` : isGrandDevice() ? "Grandma and Grandpa's phone" : "Kids' device"; }

  /* ---------------------------------------------------------------- state: facts, newest per key wins
     The parsed state is kept in memory (15 Nov 2026). It used to be read and parsed from localStorage on every call, some
     25 times for one tick on a parent phone, and the blob grows with every story and picture: on the kids' tablet that
     was the wait after each tap. Every change still goes to localStorage at once (save), so nothing is held back, and a
     second tab of the app writing the same store drops the copy here. `rev` counts changes, for the memos further down
     (effective, view, points): they are rebuilt on the first read after any change. */
  let cached = null, rev = 0, saveFailed = false;
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); return JSON.parse(raw || '') || null; }
    catch (e) { if (raw) { try { localStorage.setItem(KEY + ':bad', raw); } catch (err) { /* no room for the copy */ } } return null; }   // unreadable: kept aside, never silently replaced
  }
  function save(st) {
    cached = st; rev++; faceMemo = {};
    try { localStorage.setItem(KEY, JSON.stringify(st)); saveFailed = false; }
    catch (e) { if (!saveFailed && window.logErr) logErr('scores not saved on this device: ' + ((e && e.message) || e)); saveFailed = true; }   // storage full or blocked: the session carries on from memory, and sync still sends
  }
  window.addEventListener('storage', (e) => { if (!e.key || e.key === KEY) { cached = null; rev++; } });
  const reload = () => { cached = null; rev++; faceMemo = {}; };            // for a test page that edits localStorage itself
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function state() {
    let st = cached || load();
    if (!st) { st = migrate(); save(st); }
    st.facts = st.facts || {}; st.seen = st.seen || {}; st.okSeen = st.okSeen || {}; st.devices = st.devices || {};
    if (!st.device) { st.device = newId(); save(st); }
    const vis = visiblePlayers();
    if (!st.active || !vis.includes(st.active)) st.active = vis[0] || people()[0];
    cached = st;
    return st;
  }
  function migrate() {
    /* the 31 Oct v1 layout (done dates per player) becomes facts written by this device; old ticks count as parent ticks */
    const st = { device: newId(), active: null, facts: {}, seen: {}, okSeen: {}, devices: {} };
    let old = null; try { old = JSON.parse(localStorage.getItem(OLD_KEY) || ''); } catch (e) { old = null; }
    if (old && old.players) {
      const t = Date.now();
      for (const [p, pl] of Object.entries(old.players)) {
        for (const [id, dates] of Object.entries(pl.done || {})) {
          const q = byId[id]; if (!q || !dates.length) continue;
          if (q.daily) dates.forEach((d) => { st.facts[tickKey(p, id, d)] = { v: { on: true, by: 'parent', date: d }, t, d: st.device }; });
          else st.facts[tickKey(p, id, null)] = { v: { on: true, by: 'parent', date: dates[0] }, t, d: st.device };
        }
        (pl.foods || []).forEach((f) => { st.facts['food|' + p + '|' + newId()] = { v: { on: true, by: 'parent', date: f.date, what: f.what }, t, d: st.device }; });
        if (pl.avatar) st.facts['avatar|' + p] = { v: pl.avatar, t, d: st.device };
        for (const [b, d] of Object.entries(pl.seen || {})) st.seen[p + '|' + b] = d;
      }
      st.active = old.active || null;
      localStorage.removeItem(OLD_KEY);
    }
    return st;
  }
  const tickKey = (p, id, date) => `tick|${p}|${id}|${date || '-'}`;
  /* A fact's time is this device's clock, but never earlier than what it answers (15 Nov 2026). "Newest wins" and "a ✓
     counts if it is not older than the tick" both compare clocks of different devices: with the kids' tablet three minutes
     fast, Dad's ✓ was older than the tick it approved and the row came straight back; with it slow, an Undo lost to the
     fact it undid. So a new fact is stamped after the one it replaces, after the tick or the answer it belongs to, and
     after the last reset. */
  function stampAfter(st, key) {
    let t = Date.now();
    const story = STORY_KEY.test(key);
    const older = [st.facts[key], st.facts['ok|' + key], key.startsWith('ok|') ? st.facts[key.slice(3)] : null, story ? st.facts.swipe : st.facts.wipe];
    for (const f of older) if (f && f.t >= t) t = f.t + 1;
    return t;
  }
  function put(st, key, v) { st.facts[key] = { v, t: stampAfter(st, key), d: st.device }; rev++; }
  function putWipe(st, name, covers) {  // a reset is stamped after every fact it resets, whichever clock wrote them
    let t = Date.now();
    for (const [k, f] of Object.entries(st.facts)) if (f && f.t >= t && covers(k)) t = f.t + 1;
    st.facts[name] = { v: 1, t, d: st.device }; rev++;
  }
  function commit(st) { save(st); Sync.touch(); }   // every change: kept on this device, then sent
  /* facts for the other modules (journal.js, media.js): write one, read one, read a prefix, hear about changes */
  const factsListeners = [];
  function onFacts(fn) { factsListeners.push(fn); }
  function notifyFacts(why) { for (const fn of factsListeners) { try { fn(why); } catch (e) { /* a listener's own problem */ } } }
  function setFact(key, v) { const st = state(); put(st, key, v); commit(st); notifyFacts('local'); }
  function getFact(key) { const f = effective(state())[key]; return f ? f.v : null; }
  function factsByPrefix(prefix) { const out = {}; for (const [k, f] of Object.entries(effective(state()))) if (k.startsWith(prefix)) out[k] = f; return out; }
  const wipeT = (st) => (st.facts.wipe ? st.facts.wipe.t : 0);
  const swipeT = (st) => (st.facts.swipe ? st.facts.swipe.t : 0);   // the stories wipe (1 Nov 2026): stories, replies, pages and pictures older than it are gone everywhere
  const STORY_KEY = /^(page|media|post|cmt|card|ok\|card)\|/;       // a sent postcard's mark belongs to its story (15 Nov 2026: a quest reset used to put sent cards back to "waiting for a parent")
  let effMemo = null;
  function effective(st) {               // facts that survive the last quest reset and the last stories wipe; read-only, shared until the next change
    if (effMemo && effMemo.st === st && effMemo.rev === rev) return effMemo.out;
    const w = wipeT(st), sw = swipeT(st), out = {};
    for (const [k, f] of Object.entries(st.facts)) {
      if (k === 'wipe' || k === 'swipe') continue;
      /* stories outlive a quest reset (only the stories wipe takes them), and so do the faces people chose (15 Nov 2026) */
      if (STORY_KEY.test(k) ? f.t >= sw : (f.t >= w || k.startsWith('avatar|') || k.startsWith('vdoc|'))) out[k] = f;   // nor does a quest reset touch the Vault's tickets (vaultdocs.js)
    }
    effMemo = { st, rev, out };
    return out;
  }
  function gcStories(st) {               // drop the story facts a wipe made invisible, so this device's blob shrinks (a device that has not seen the wipe re-sends them; the others ignore and drop them again)
    const sw = swipeT(st); if (!sw) return;
    for (const k of Object.keys(st.facts)) if (STORY_KEY.test(k) && st.facts[k].t < sw) delete st.facts[k];
  }
  function wipeStories() {               // a parent: every story, reply, page and picture, for the whole family, on every device
    if (!isParentDevice()) return;
    const st = state();
    putWipe(st, 'swipe', (k) => STORY_KEY.test(k));
    gcStories(st);
    commit(st); notifyFacts('local'); afterChange();
  }
  function liveOn(st, key) { const f = effective(st)[key]; return !!(f && f.v && f.v.on); }

  /* a parent's answer to a fact (a tick, a food, a stamp, a postcard request): it counts if it is not older than the fact,
     so a re-tick after a ✗ asks again; a postcard a parent shared directly has an answer and no request */
  function answer(eff, key, f) {
    const ok = eff['ok|' + key];
    return ok && ok.v && (!f || ok.t >= f.t) ? { a: ok.v.a, who: ok.v.who || '', t: ok.t } : { a: null, who: '', t: 0 };
  }
  /* every tick and food note of one player, with its approval state */
  function items(st, p, eff) {
    eff = eff || effective(st);
    const out = [];
    for (const [k, f] of Object.entries(eff)) {
      const parts = k.split('|');
      if (parts[0] !== 'tick' && parts[0] !== 'food') continue;
      if (parts[1] !== p || !f.v || !f.v.on) continue;
      let it = null;
      if (parts[0] === 'tick') { const q = byId[parts[2]]; if (!q) continue; it = { kind: 'tick', q, id: q.id, date: f.v.date || parts[3], pts: q.pts, title: q.t, e: q.e, verify: needsVerify(q) }; }
      else if (parts[0] === 'food') it = { kind: 'food', date: f.v.date, what: f.v.what || '', pts: FOOD_PTS, title: f.v.what ? 'Tried: ' + f.v.what : 'Tried something new', e: '🍽️', verify: true };
      if (!it) continue;
      it.key = k; it.player = p; it.by = f.v.by || 'kid'; it.t = f.t;
      it.needs = it.verify && it.by !== 'parent';
      const ans = answer(eff, k, f);
      it.ok = ans.a; it.okBy = ans.who; it.okT = ans.t;
      it.pending = it.needs && !it.ok;
      it.rejected = it.needs && it.ok === 'no';
      it.counted = !it.needs || it.ok === 'yes';
      out.push(it);
    }
    return out.sort((a, b) => b.t - a.t);
  }
  /* a player as the views see them: counted ticks by quest, counted foods, avatar, pending and rejected items */
  let viewMemo = { rev: -1, by: {} };   // one walk of the facts per player per change; the result is shared and read-only
  function view(st, p, eff) {
    eff = eff || effective(st);
    const keep = !!effMemo && eff === effMemo.out;
    if (keep) { if (viewMemo.rev !== rev) viewMemo = { rev, by: {} }; if (viewMemo.by[p]) return viewMemo.by[p]; }
    const its = items(st, p, eff), done = {}, foods = [];
    for (const it of its) {
      if (!it.counted) continue;
      if (it.kind === 'tick') (done[it.id] = done[it.id] || []).push(it.date); else foods.push({ date: it.date, what: it.what, key: it.key });
    }
    const av = eff['avatar|' + p];
    const out = { name: p, avatar: av ? av.v : (DEFAULT_AVATAR[p] || '🙂'), done, foods, items: its, pending: its.filter((i) => i.pending), rejected: its.filter((i) => i.rejected) };
    if (keep) viewMemo.by[p] = out;
    return out;
  }
  function pendingAll(st) { const eff = effective(st); return people().flatMap((p) => items(st, p, eff).filter((i) => i.pending)).concat(pendingStamps(st, eff), pendingCards(st, eff)); }

  const doneCount = (pl, id) => (pl.done[id] || []).length;
  const doneToday = (pl, id, date) => (pl.done[id] || []).includes(date);
  function rawPoints(pl) {              // quests and foods only, no badges (the Thousand club counts these)
    let pts = 0;
    for (const [id, dates] of Object.entries(pl.done)) pts += (byId[id] ? byId[id].pts : 0) * dates.length;
    return pts + (pl.foods || []).length * FOOD_PTS;
  }
  const ptsMemo = new WeakMap();        // a player's view → its points on a given day (a view lives until the next change, so this cannot go stale)
  function points(pl) {
    const ctx = currentContext(), m = ptsMemo.get(pl);
    if (m && m.date === ctx.date && m.rev === rev) return m.pts;
    let pts = rawPoints(pl);
    for (const b of badges(pl, ctx)) if (b.earned) pts += b.pts;
    ptsMemo.set(pl, { date: ctx.date, rev, pts });
    return pts;
  }
  function level(pts) {
    let cur = LEVELS[0], next = null, idx = 0;
    for (let i = 0; i < LEVELS.length; i++) { const l = LEVELS[i]; if (pts >= l[0]) { cur = l; idx = i; } else { next = l; break; } }
    return { name: cur[1], emoji: cur[2], colour: cur[3], idx, from: cur[0], next: next ? next[0] : null, nextName: next ? next[1] : null,
      pct: next ? Math.round(((pts - cur[0]) / (next[0] - cur[0])) * 100) : 100 };
  }
  /* a face (3 Nov 2026): the avatar in a .face span, so every draw site sizes it the same way. The mini level badge that sat
     in its corner lasted a day (too busy, and it covered the face; Andy): the level now shows only in the level cards and
     the level-up show. The grandparents' joint author shows both their faces. Memoised per player until the next state
     write (save) or refreshTop, because view() walks every fact. */
  let faceMemo = {};
  function face(p, cls) {
    const k = p + '|' + (cls || '');
    if (faceMemo[k]) return faceMemo[k];
    const st = state(), av = p === GRANDS ? GRAND.map((g) => view(st, g).avatar).join('') : view(st, p).avatar;
    return (faceMemo[k] = `<span class="face${cls ? ' ' + cls : ''}">${av}</span>`);
  }

  /* ---------------------------------------------------------------- changes (every one is a fact) */
  const by = () => (isParentDevice() ? 'parent' : 'kid');
  let fx = null;                        // the card to animate after the next render: { key, cls, float, fcls }
  function complete(player, id, date, quiet) {   // true if this call ticked it. quiet: no party of its own (17 Nov 2026: a postcard ticks two quests and shows one party for both)
    const st = state(), q = byId[id]; if (!q) return false;
    const key = tickKey(player, id, q.daily ? date : null);
    if (liveOn(st, key)) return false;
    const who = by();
    put(st, key, { on: true, by: who, date });
    commit(st);
    const waits = needsVerify(q) && who !== 'parent';
    fx = waits ? { key, cls: 'just-sent', float: '📨 sent', fcls: 'send' } : { key, cls: 'just-done', float: `+${q.pts}` };
    if (quiet) { /* the caller celebrates */ }
    else if (waits) celebrate('⏳', 'Sent to Mum and Dad', `${q.t} · ${q.pts} points when they say yes`, player, 'wait');
    else celebrate(q.e, `+${q.pts} points`, q.t, player, 'quest', q.pts);
    afterChange();
    return true;
  }
  function undo(player, id, date) {
    const st = state(), q = byId[id]; if (!q) return;
    const key = tickKey(player, id, q.daily ? date : null);
    if (!liveOn(st, key)) return;
    put(st, key, { on: false, by: by(), date });
    fx = { key, cls: 'just-undone', float: `−${q.pts}`, fcls: 'minus' };
    commit(st); afterChange();
  }
  function addFood(player, what, date) {
    const st = state(), who = by();
    put(st, 'food|' + player + '|' + newId(), { on: true, by: who, date, what: String(what || '').slice(0, 60) });
    commit(st);
    const waits = who !== 'parent';
    fx = waits ? { key: 'food', cls: 'just-done', float: '📨 sent', fcls: 'send' } : { key: 'food', cls: 'just-done', float: `+${FOOD_PTS}` };
    const small = (what ? `Tried: ${what}` : 'Tried something new') + (waits ? ` · ${FOOD_PTS} points when they say yes` : '');
    if (waits) celebrate('⏳', 'Sent to Mum and Dad', small, player, 'wait');
    else celebrate('🍽️', `+${FOOD_PTS} points`, small, player, 'food', FOOD_PTS);
    afterChange();
  }
  function applyFx(root) {              // after a re-render: pop the card that just changed and float its points
    if (!fx || !root) return;
    const card = root.querySelector(`[data-key="${CSS.escape(fx.key)}"]`);
    if (card) { FX.pulse(card, fx.cls, 1000); FX.floatText(card.querySelector('.qbtn') || card, fx.float, fx.fcls); }
    fx = null;
  }
  function checkLevelUp(st) {           // a visible player crossed a level line (own tick, a parent's ✓, a sync merge, a date-earned badge): the show
    if (isGrandDevice()) return;        // Grandma and Grandpa collect stamp points too, but never level up
    st = st || state();
    st.lastLevel = st.lastLevel || {}; st.lastPts = st.lastPts || {};
    const eff = effective(st);
    let changed = false;
    for (const p of visiblePlayers()) {   // every player this device shows, not just the active one: the kids share a device
      const pl = view(st, p, eff), pts = points(pl), lv = level(pts), prev = st.lastLevel[p], prevPts = st.lastPts[p];
      if (prev !== lv.from || prevPts !== pts) { st.lastLevel[p] = lv.from; st.lastPts[p] = pts; changed = true; }
      if (prev == null || lv.from <= prev) continue;    // first sighting is silent; dropping a level (an undo) too
      const from = prevPts == null ? prev : prevPts;
      FX.levelUp({ who: label(p), avatar: pl.avatar, from: level(prev), to: lv, ptsFrom: from, ptsTo: pts, pctTo: lv.pct, ladder: LEVELS,
        next: lv.next ? { name: lv.nextName, pts: lv.next } : null });
    }
    if (changed) save(st);
  }
  function removeFood(player, key) {
    const st = state(), f = st.facts[key]; if (!f) return;
    put(st, key, Object.assign({}, f.v, { on: false, by: by() }));
    commit(st); afterChange();
  }
  const parentName = () => label(owner() || 'Dad');   // whose ✓ this phone's is
  function approve(key, yes) {
    if (!isParentDevice()) return;
    const st = state();
    put(st, 'ok|' + key, { a: yes ? 'yes' : 'no', who: parentName() });
    commit(st); afterChange();
  }
  function approveAll() {               // every pending item, one fact each, one sync
    if (!isParentDevice()) return;
    const st = state(), who = parentName();
    for (const it of pendingAll(st)) if (it.kind !== 'card') put(st, 'ok|' + it.key, { a: 'yes', who });   // a postcard needs the share sheet: one at a time
    commit(st); afterChange();
  }
  function setActive(p) { const st = state(); st.active = p; save(st); }
  function setAvatar(p, a) { const st = state(); put(st, 'avatar|' + p, a); commit(st); }
  const forgetSeen = (st) => { st.seen = {}; st.okSeen = {}; st.revealed = {}; st.lastLevel = {}; st.lastPts = {}; };   // after a reset every badge, ✓ and level is new again, on every device
  function reset() {                     // every device: quest facts older than this moment stop counting (stories and faces stay)
    const st = state();
    putWipe(st, 'wipe', (k) => !STORY_KEY.test(k) && k !== 'swipe');
    forgetSeen(st);
    commit(st);
  }
  function afterChange() {
    refreshTop();
    if (S.screen === 'quests') renderQuests();
    if (S.screen === 'passport') renderPassport();
    if (S.screen === 'home') renderHome();
    if (S.screen === 'settings') renderSettings();
    if (S.screen === 'story' && window.Journal) Journal.renderStory();
    fx = null;
    checkNewBadges(currentContext());   // a badge earned by this very tick or ✓ (15 Nov 2026: it used to wait for the next unlock)
    checkLevelUp(state());
  }

  /* ---------------------------------------------------------------- sync: what we send, how we merge */
  function mine() { const st = state(), out = {}; for (const [k, f] of Object.entries(st.facts)) if (f.d === st.device) out[k] = f; return out; }
  /* Every fact this device already holds stays unless a newer one for the same key arrives (15 Nov 2026). The merge used
     to keep only this device's own facts plus whatever the answer contained, so a device missing from one answer (it was
     mid-write on the Worker) took its points, ✓s and stories off the screen until the next pull, and a level-up played
     twice. And an answer that changes nothing is now recognised: no save, no redraw (the pull that follows every push used
     to redraw the screen three seconds after each tick, shutting any open list). */
  function mergeRemote(devices) {
    const st = state(), sw0 = swipeT(st), w0 = wipeT(st);
    const merged = Object.assign({}, st.facts);
    let changed = false;
    for (const [id, blob] of Object.entries(devices || {})) {
      if (id === st.device) continue;
      for (const [k, f] of Object.entries((blob && blob.facts) || {})) {
        if (!f || typeof f.t !== 'number' || !/^(tick|food|ok|avatar|wipe|swipe|page|media|stamp|post|cmt|card|vdoc)\|?/.test(k)) continue;
        const cur = merged[k];
        if (!cur || f.t > cur.t || (f.t === cur.t && String(f.d || id) > String(cur.d))) { merged[k] = Object.assign({}, f, { d: f.d || id }); changed = true; }
      }
    }
    const seenDevices = Object.fromEntries(Object.entries(devices || {}).map(([id, b]) => [id, { role: b && b.role, name: b && b.name, at: b && b.at }]));
    if (!changed) {
      if (JSON.stringify(seenDevices) !== JSON.stringify(st.devices || {})) { st.devices = seenDevices; save(st); }
      return;
    }
    st.facts = merged;
    gcStories(st);
    st.devices = seenDevices;
    if (wipeT(st) > w0) forgetSeen(st);                                       // a reset made on another device
    save(st);
    celebrateApprovals(st);
    notifyFacts('remote');
    afterChange();
    if (swipeT(st) > sw0 && window.Media) {                                  // a stories wipe arrived: the pictures of the wiped stories go; anything newer, and every full-size original, stays
      Media.wipe(swipeT(st)).then(() => { try { localStorage.removeItem('storyDraft'); localStorage.removeItem('replyDraft'); } catch (e) { /* blocked */ } notifyFacts('remote'); });
    }
  }
  function celebrateApprovals(st) {      // on a kids' device: a ✓ arriving from a parent pops the points
    if (isParentDevice()) return;
    const eff = effective(st), fresh = [];
    let marked = false;
    for (const p of visiblePlayers()) for (const it of items(st, p, eff)) {
      if (!it.needs || !it.ok) continue;
      const seen = st.okSeen[it.key];
      if (seen === it.okT || seen === it.ok) continue;                        // this very answer (by its time; an entry from before 15 Nov 2026 holds the answer itself)
      st.okSeen[it.key] = it.okT; marked = true;                              // a later ✓ after a ✗ and a re-tick is a new answer, and gets its party
      if (it.ok === 'yes') fresh.push(it);
    }
    if (marked) save(st);
    if (!fresh.length) return;
    const it = fresh[0], total = fresh.reduce((n, i) => n + i.pts, 0);
    celebrate(it.e, `+${total} points`, `${it.okBy || 'A parent'} said yes${fresh.length > 1 ? ' to ' + fresh.length + ' things' : ': ' + it.title}`, it.player, 'ok', total);
  }
  function startSync() {
    const sy = (S.family && S.family.trip && S.family.trip.sync) || {};
    const st = state();
    Sync.onStatus(() => { const el = $('#sync-line'); if (el) el.textContent = syncText(); });   // the line only: the header and the screens are redrawn by afterChange when facts actually change
    Sync.start({ url: sy.url, token: sy.token, device: st.device, mine, apply: mergeRemote, meta: () => ({ role: role() || 'kids', name: deviceName() }), work: () => Promise.resolve(window.Media ? Media.flush() : null).then(() => (window.VaultDocs ? VaultDocs.sync() : null)) });
  }
  function syncText() {
    const s = Sync.status();
    const pend = () => { const n = window.Media ? Media.pendingCount() : 0; return n ? ` · ${n} picture${n === 1 ? '' : 's'} to upload` : ''; };
    if (!s.enabled) return 'Scores stay on this device: no sync address in this build.';
    if (s.error === 'offline') return 'Offline: scores sync when back online.' + (s.dirty ? ' Changes waiting.' : '') + pend();
    if (s.error) return 'Sync problem: ' + s.error;
    if (s.busy) return 'Syncing…';
    if (!s.last) return 'Not synced yet.';
    const m = Math.round((Date.now() - s.last) / 60000);
    return `Synced ${m < 1 ? 'just now' : m + ' min ago'} · ${s.devices} device${s.devices === 1 ? '' : 's'}${s.dirty ? ' · changes waiting' : ''}` + pend();
  }

  /* ---------------------------------------------------------------- trip helpers */
  function dayCity(d) {
    const w = String(d.where || '');
    if (/in the air/i.test(String(d.sleep || ''))) return 'Air';    // 30 Dec and 6 Jan: nights on a plane, the stamp waits for the landing
    if (/in the air|calgary/i.test(w) && !/→\s*(Tokyo|Toronto|Vancouver)/.test(w)) return 'Air';
    if (/nagoya/i.test(w)) return 'Nagoya';                       // the LEGOLAND day trip gets its own stamp
    const tail = w.includes('→') ? w.split('→').pop() : w;
    for (const c of CITIES) if (tail.toLowerCase().includes(c.toLowerCase())) return c;
    if (/home/i.test(tail)) return 'Home';
    for (const c of CITIES) if (w.toLowerCase().includes(c.toLowerCase())) return c;
    return 'Home';
  }
  function dateInt(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }
  function daysBetween(a, b) { return Math.round((dateInt(b) - dateInt(a)) / 86400000); }
  function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function airportCode(s) { return (String(s || '').match(/\(([A-Z]{3})\)/) || [])[1]; }
  function arrivalsOn() {               // date → cities we land in that day, from the moves (Brisbane, Cairns, Townsville)
    const out = {};
    for (const m of S.family.moves || []) { const c = AIRPORTS[airportCode(m.to)]; if (!c) continue; const date = addDays(m.date, /\+1/.test(String(m.arrive || '')) ? 1 : 0); (out[date] = out[date] || []).push(c); }
    return out;
  }
  const wallFmt = {};                    // one formatter per time zone: building one is the slow part, and the old tablet builds them slowly
  function wallToEpoch(iso, hhmm, tz) {   // a wall-clock time in a city → epoch ms (no DST change touches the trip)
    const [y, mo, d] = iso.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number);
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    const fmt = wallFmt[tz] || (wallFmt[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }));
    const parts = fmt.formatToParts(new Date(guess));
    const g = (t) => +parts.find((x) => x.type === t).value;
    return guess - (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - guess);
  }
  function nowEpoch(ctx) { return S.preview ? wallToEpoch(S.preview, '12:00', ctx.tz || TZ.Home) : Date.now(); }   // a preview day is noon there
  let arrMemo = null;                   // the arrivals come from the itinerary alone: worked out once per unlock, read-only
  function arrivals() {
    /* city → { date, time, at } of the scheduled arrival: the first move that ends there (airport code for the
       Australian stops, the city name otherwise); a city with no move into it opens at noon on its first day */
    if (arrMemo && arrMemo.F === S.family) return arrMemo.out;
    const out = {};
    for (const m of S.family.moves || []) {
      const to = String(m.to || ''), c = AIRPORTS[airportCode(to)] || CITIES.find((x) => to.toLowerCase().includes(x.toLowerCase()));
      if (!c || out[c]) continue;
      const raw = String(m.arrive || ''), time = (raw.match(/\d{1,2}:\d{2}/) || ['12:00'])[0].padStart(5, '0'), date = addDays(m.date, /\+1/.test(raw) ? 1 : 0);
      out[c] = { date, time, at: wallToEpoch(date, time, TZ[c] || TZ.Home) };
    }
    for (const d of S.family.days) { const c = dayCity(d); if (c === 'Home' || c === 'Air' || out[c]) continue; out[c] = { date: d.date, time: '12:00', at: wallToEpoch(d.date, '12:00', TZ[c] || TZ.Home) }; }
    arrMemo = { F: S.family, out: Object.fromEntries(Object.entries(out).sort((a, b) => a[1].at - b[1].at)) };
    return arrMemo.out;
  }
  function stampItem(st, eff, c) {     // the family's tap for a city stamp, with its approval state (like items())
    const key = 'stamp|' + CITY_KEY[c], f = eff[key];
    if (!f || !f.v || !f.v.on) return null;
    const by = f.v.by || 'kid', needs = by !== 'parent', ans = answer(eff, key, f), a = ans.a;
    return { kind: 'stamp', key, id: 'stamp-' + CITY_KEY[c], city: c, title: `${c} stamp (everyone)`, e: CITY_EMOJI[c], pts: 25, date: f.v.date, by, t: f.t,
      player: f.v.player || st.active, verify: needs, needs, ok: a, okBy: ans.who, okT: ans.t, pending: needs && !a, rejected: needs && a === 'no', counted: !needs || a === 'yes' };
  }
  function pendingStamps(st, eff) { return Object.keys(arrivals()).map((c) => stampItem(st, eff, c)).filter((it) => it && it.pending); }
  /* postcards (1 Nov 2026): the kids' "ask Mum and Dad to send it" is the fact card|<postId>; the parent's ✓ shares
     from the parent's phone (postcard.js sendApproved) and then writes ok|card|<postId>; a parent's direct Share writes
     the ok alone. Sending pays no points (17 Nov 2026): the postcard quest is ticked when the card is written. */
  function cardItem(st, eff, postId) {
    const key = 'card|' + postId, f = eff[key], ans = answer(eff, key, f), a = ans.a, okValid = ans.t > 0;
    if (!(f && f.v && f.v.on) && !okValid) return null;
    const po = window.Journal && Journal.post ? Journal.post(postId) : null;
    const line = po && window.Postcard ? Postcard.firstLine(po) : '';
    const by = f ? (f.v.by || 'kid') : 'parent', needs = by !== 'parent';
    return { kind: 'card', key, id: postId, pic: (f && f.v && f.v.pic) || null, title: `Send this postcard${po && window.Postcard && Postcard.toOf ? ' to ' + Postcard.toOf(po) : ''}${line ? ': “' + line + '”' : ''}`, e: '📮', pts: 0, date: (f && f.v.date) || (po && po.d) || '', by, t: f ? f.t : 0,
      player: (f && f.v.p) || (po && po.p) || st.active, verify: needs, needs, ok: a, okBy: ans.who, okT: ans.t, pending: !!f && needs && !a, rejected: !!f && needs && a === 'no', counted: a === 'yes' || (!!f && !needs) };
  }
  function pendingCards(st, eff) { const out = []; for (const k of Object.keys(eff)) if (k.startsWith('card|')) { const it = cardItem(st, eff, k.slice(5)); if (it && it.pending) out.push(it); } return out; }
  function cardStatuses(st) {            // postId → {pending, rejected, sent} for every story that has a request or a sent mark
    const eff = effective(st), out = {};
    for (const k of Object.keys(eff)) { const m = k.match(/^(?:ok\|)?card\|(.+)$/); if (m && !out[m[1]]) { const it = cardItem(st, eff, m[1]); if (it) out[m[1]] = { pending: it.pending, rejected: it.rejected, sent: it.counted, who: it.okBy, pic: it.pic }; } }
    return out;
  }
  function cardStatus(postId) { return cardStatuses(state())[postId] || { pending: false, rejected: false, sent: false, who: '', pic: null }; }
  function requestCard(postId, pickId) { // the kids' iPad: ask Mum and Dad to send this story as a postcard, with the picture they chose
    const po = window.Journal && Journal.post ? Journal.post(postId) : null; if (!po) return;
    const st = state(), key = 'card|' + postId, cur = cardItem(st, effective(st), postId);
    if (cur && cur.pending) return;
    if (cur && cur.counted) { celebrate('📮', 'Already sent', 'That postcard has gone to the grandparents', po.p, 'ok'); return; }
    put(st, key, { on: true, by: by(), p: po.p, date: po.d, pic: pickId || null });
    commit(st);
    if (by() !== 'parent') celebrate('⏳', 'Sent to Mum and Dad', 'They send the postcard from their phone', po.p, 'wait');
    afterChange();
  }
  function approveCard(postId) {         // a parent's phone, after the share sheet closed: mark it sent (the points came when it was written)
    const st = state(), po = window.Journal && Journal.post ? Journal.post(postId) : null;
    put(st, 'ok|card|' + postId, { a: 'yes', who: parentName() });
    commit(st);
    if (po) celebrate('📮', 'Sent!', 'The postcard is on its way', po.p, 'ok');
    afterChange();
  }
  function stampCity(c) {              // the tap on a ready stamp (Passport) or the Home prompt
    const st = state(), key = 'stamp|' + CITY_KEY[c], cur = stampItem(st, effective(st), c);
    if (cur && !cur.rejected) return;
    const who = by(), ctx = currentContext();
    put(st, key, { on: true, by: who, date: ctx.date, player: st.active, city: c });
    if (who === 'parent') { st.seen = st.seen || {}; for (const p of people()) st.seen[p + '|stamp-' + CITY_KEY[c]] = ctx.date; }   // the party is here, not a second "New stamp!"
    commit(st);
    if (who !== 'parent') celebrate('⏳', 'Sent to Mum and Dad', `${c} stamp · 25 points for everyone when they say yes`, st.active, 'wait');
    else celebrate(CITY_EMOJI[c], 'Stamped!', `${c} · +25 points for everyone`, st.active, 'stamp', 25, { winter: WINTER.test(c) });
    afterChange();
  }
  function stampsReady(ctx) {          // cities we have landed in whose stamp nobody has tapped yet
    const st = state();
    return badges(view(st, st.active), ctx).filter((b) => b.kind === 'stamp' && b.ready).map((b) => b.t);
  }
  function citiesForDay(ctx) {          // every place the day touches, in order: airports landed at, the bed, the plan's destination
    const set = new Set();
    if (ctx.before) set.add('home');
    for (const c of arrivalsOn()[ctx.date] || []) set.add(c);
    if (!ctx.before && ctx.city && ctx.city !== 'Home') set.add(ctx.city);
    const day = S.family.days.find((d) => d.date === ctx.date);
    if (day) { const c = dayCity(day); if (c !== 'Air' && c !== 'Home') set.add(c); }
    if (ctx.date >= S.family.trip.end) set.add('Townsville');
    return set;
  }

  /* ---------------------------------------------------------------- badges (stamps are automatic by date) */
  function badges(pl, ctx) {
    ctx = ctx || currentContext();
    const F = S.family, today = ctx.date, out = [];
    /* stamps (1 Nov 2026): open at the scheduled arrival in each city, stamped by a tap (a kids'-device tap waits for a
       parent), and stamp themselves the morning after if nobody tapped. Before this they unlocked at midnight on the
       date, so on the morning of 30 Nov, still at home, Brisbane and Vancouver were already stamped. */
    const arr = arrivals(), now = nowEpoch(ctx), st = state(), eff = effective(st);
    for (const c of Object.keys(arr)) {
      const a = arr[c], it = stampItem(st, eff, c), ready = now >= a.at, late = today > a.date;
      const earned = !!(it && it.counted) || late, pending = !earned && !!(it && it.pending);
      out.push({ id: 'stamp-' + CITY_KEY[c], e: CITY_EMOJI[c], t: c, kind: 'stamp', pts: 25, earned, opens: a.date, lands: a.time,
        on: it && it.counted ? it.date : late ? addDays(a.date, 1) : null, ready: ready && !earned && !pending, pending,
        hint: earned ? '' : pending ? '⏳ waiting for Mum or Dad' : it && it.rejected ? `✗ ${it.okBy || 'a parent'} said not yet · tap again` : ready ? 'Tap to stamp!' : `Lands ${fmtDate(a.date)} ${a.time}` });
    }
    const start = F.trip.start, end = F.trip.end, total = daysBetween(start, end) + 1;
    const dayN = daysBetween(start, today) + 1;
    const nyd = F.days.find((d) => d.date >= '2027-01-01');
    const bday = F.days.find((d) => /birthday/i.test(d.plan || ''));
    const dateLine = F.days.find((d) => dayCity(d) === 'Air');
    out.push({ id: 'first-flight', e: '🛫', t: 'Wheels up', kind: 'milestone', pts: 50, on: start, earned: today >= start, hint: `Opens ${fmtDate(start)}` });
    out.push({ id: 'halfway', e: '🏁', t: 'Halfway there', kind: 'milestone', pts: 50, on: addDays(start, Math.ceil(total / 2) - 1), earned: dayN >= Math.ceil(total / 2), hint: `Day ${Math.ceil(total / 2)} of ${total}` });
    if (dateLine) out.push({ id: 'date-line', e: '🌐', t: 'Date-line crosser', kind: 'milestone', pts: 50, on: addDays(dateLine.date, 1), earned: today > dateLine.date, hint: 'Lose a day in the air' });
    if (nyd) out.push({ id: 'new-year', e: '🎆', t: 'New Year in Tokyo', kind: 'milestone', pts: 50, on: nyd.date, earned: today >= nyd.date, hint: `Opens ${fmtDate(nyd.date)}` });
    if (bday) out.push({ id: 'birthday', e: '🎂', t: 'Birthday on tour', kind: 'milestone', pts: 50, on: bday.date, earned: today >= bday.date, hint: `Opens ${fmtDate(bday.date)}` });
    out.push({ id: 'home-again', e: '🏡', t: 'Home again', kind: 'milestone', pts: 50, on: end, earned: today >= end, hint: `Opens ${fmtDate(end)}` });
    const foods = (pl.foods || []).length;
    for (const [n, t, e] of [[5, 'Taste tester', '🍴'], [10, 'Food explorer', '🍜'], [20, 'Snack legend', '🍣']])
      out.push({ id: 'food-' + n, e, t, kind: 'skill', pts: 30, earned: foods >= n, hint: `${Math.min(foods, n)} of ${n} new foods` });
    const kindCount = (k) => Object.keys(pl.done).filter((id) => byId[id] && byId[id].kind === k).length;
    for (const [k, n, t, e] of [['words', 5, 'Chatterbox', '🗣️'], ['explore', 10, 'Explorer', '🧭'], ['helper', 5, 'Helper', '🦸'], ['travel', 4, 'Frequent flyer', '✈️']])
      out.push({ id: 'skill-' + k, e: glyph(e), t, kind: 'skill', pts: 30, earned: kindCount(k) >= n, hint: `${Math.min(kindCount(k), n)} of ${n} ${k} quests` });
    const photos = (pl.done.photo || []).length;
    out.push({ id: 'photo-7', e: '📸', t: 'Photo streak', kind: 'skill', pts: 30, earned: photos >= 7, hint: `${Math.min(photos, 7)} of 7 morning photos` });
    // 31 Oct additions: three more milestones, dailies badges, a champion per city, and two big counters
    const firstUS = F.days.find((d) => dayCity(d) === 'New York'), firstJP = F.days.find((d) => dayCity(d) === 'Tokyo'), xmas = F.days.find((d) => d.date === '2026-12-25');
    if (firstUS) out.push({ id: 'border-hopper', e: '🛂', t: 'Border hopper', kind: 'milestone', pts: 50, on: firstUS.date, earned: today >= firstUS.date, hint: `Opens ${fmtDate(firstUS.date)}` });
    if (xmas) out.push({ id: 'christmas', e: '🎄', t: 'Christmas away', kind: 'milestone', pts: 50, on: xmas.date, earned: today >= xmas.date, hint: `Opens ${fmtDate(xmas.date)}` });
    if (firstJP) out.push({ id: 'four-countries', e: '🌍', t: 'Four countries', kind: 'milestone', pts: 50, on: firstJP.date, earned: today >= firstJP.date, hint: `Opens ${fmtDate(firstJP.date)}` });
    const dailyIds = QUESTS.filter((q) => q.daily && !q.parents).map((q) => q.id);
    const dailyDates = new Set(); for (const id of dailyIds) for (const d of (pl.done[id] || [])) dailyDates.add(d);
    const perfect = [...dailyDates].some((d) => dailyIds.every((id) => (pl.done[id] || []).includes(d)));
    out.push({ id: 'perfect-day', e: '⭐', t: 'Perfect day', kind: 'skill', pts: 30, earned: perfect, hint: `All ${dailyIds.length} dailies in one day` });
    const sorted = [...dailyDates].sort(); let run = 0, best = 0;
    for (let i = 0; i < sorted.length; i++) { run = i > 0 && daysBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1; best = Math.max(best, run); }
    out.push({ id: 'streak-7', e: '🔥', t: 'Seven-day streak', kind: 'skill', pts: 30, earned: best >= 7, hint: `${Math.min(best, 7)} of 7 days running` });
    for (const [id, n, t, e] of [['water', 10, 'Hydration hero', '💧'], ['hands', 20, 'Hand holder', '🤝'], ['daypack', 10, 'Packer', '🎒'], ['thanks', 10, 'Polite traveller', '🙏'], ['diary', 7, 'Storyteller', '📓']]) {
      const c = (pl.done[id] || []).length;
      out.push({ id: 'daily-' + id, e, t, kind: 'skill', pts: 30, earned: c >= n, hint: `${Math.min(c, n)} of ${n} days` });
    }
    const diaryDays = (pl.done.diary || []).length;
    out.push({ id: 'story-master', e: '📚', t: 'Story master', kind: 'skill', pts: 40, earned: diaryDays >= 20, hint: `${Math.min(diaryDays, 20)} of 20 pages` });
    for (const c of CHAMPION_CITIES) {
      const qs = QUESTS.filter((q) => q.where === c && !q.retired), done = qs.filter((q) => doneCount(pl, q.id)).length;
      out.push({ id: 'champ-' + CITY_KEY[c], e: '🏆', t: `${c} champion`, kind: 'skill', pts: 40, earned: qs.length > 0 && done === qs.length, hint: `${done} of ${qs.length} ${c} quests` });
    }
    const distinct = Object.keys(pl.done).filter((id) => byId[id] && !byId[id].daily).length;
    out.push({ id: 'quest-master', e: '🎯', t: 'Quest master', kind: 'skill', pts: 30, earned: distinct >= 50, hint: `${Math.min(distinct, 50)} of 50 quests` });
    const raw = rawPoints(pl);
    out.push({ id: 'thousand', e: '💰', t: 'Thousand club', kind: 'skill', pts: 30, earned: raw >= 1000, hint: `${Math.min(raw, 1000)} of 1,000 quest points` });
    return out;
  }
  /* Celebrate the badges earned since this device last looked. It runs at unlock and, since 15 Nov 2026, after every change
     (a badge earned by a tick or a ✓ used to wait for the next unlock) and for every player the device shows, not just the
     active one. A stamp or a milestone comes with the date and is everyone's, so it gets one card; a badge someone earned by
     doing things gets a card with their name. While another day is being previewed the "seen" marks stay in memory, so
     stepping through the trip does not use up the real parties. */
  const WINTER = /Whistler|Vancouver|Montréal|Toronto/;
  const previewSeen = {};
  function checkNewBadges(ctx) {
    if (!S.family) return;
    const st = state(), seen = S.preview ? previewSeen : st.seen, grand = isGrandDevice();
    const players = grand ? [st.active] : visiblePlayers();
    const first = !grand && !st.seenAll;  // the first run of this rule on a device: what the other players already have is not news
    const shared = [], own = {};
    let marked = false;
    for (const p of players) {
      const quiet = first && p !== st.active;
      for (const b of badges(view(st, p), ctx)) {
        if (!b.earned || seen[p + '|' + b.id]) continue;
        seen[p + '|' + b.id] = ctx.date; marked = true;
        if (quiet) continue;
        if (b.kind === 'skill') (own[p] = own[p] || []).push(b);
        else if (!shared.some((x) => x.id === b.id)) shared.push(b);
      }
    }
    if (!S.preview && (marked || first)) { if (!grand) st.seenAll = 1; save(st); }
    const party = (list, p, extra) => {
      const b = list[0], total = list.reduce((n, x) => n + x.pts, 0);
      celebrate(b.e, list.length > 1 ? `${list.length} new badges` : (b.kind === 'stamp' ? 'New stamp!' : 'New badge!'), b.t + (list.length > 1 ? ' and more' : '') + ` · +${total} points`, p, b.kind === 'stamp' ? 'stamp' : 'badge', 0, Object.assign({ winter: WINTER.test(b.t) }, extra || {}));
    };
    if (shared.length) party(shared, st.active, players.length > 1 ? { who: 'Everyone' } : null);
    for (const p of Object.keys(own)) party(own[p], p);
  }

  /* ---------------------------------------------------------------- views */
  function available(ctx, pl) {
    const here = citiesForDay(ctx);
    return QUESTS.filter((q) => !q.retired && (q.where === 'any' || here.has(q.where) || (ctx.before && q.where === 'home')) && !(q.parents && !isParentDevice()))
      .map((q) => ({ ...q, done: q.daily ? doneToday(pl, q.id, ctx.date) : doneCount(pl, q.id) > 0 }));
  }
  function playerChips(st, ctx) {
    const eff = effective(st);
    return `<div class="players">` + visiblePlayers().map((p) => { const pl = view(st, p, eff), pts = points(pl); return `<button class="player${p === st.active ? ' active' : ''}" data-player="${esc(p)}">${face(p, 'av')}<span class="nm">${esc(label(p))}</span><span class="pt">${pts} pts</span></button>`; }).join('') + `</div>`;
  }
  function itemState(pl, q, date) {    // the live tick for a quest card, if any
    return pl.items.find((it) => it.kind === 'tick' && it.id === q.id && (!q.daily || it.date === date)) || null;
  }
  function questCard(q, ctx, player, pl) {
    const it = itemState(pl, q, ctx.date);
    const cls = 'quest' + (it ? (it.counted ? ' done' : it.rejected ? ' rejected' : ' pending') : '');
    const status = !it ? '' : it.counted ? ' · ✓ done' : it.rejected ? ` · ✗ ${esc(it.okBy || 'a parent')} said not this time` : ' · ⏳ waiting for Mum or Dad';
    const btn = it ? `<button class="qbtn undo" data-undo="${q.id}">Undo</button>` : q.write ? `<button class="qbtn go" data-write="${q.id}">✏️ Write</button>` : `<button class="qbtn go" data-do="${q.id}">Done!</button>`;   // a quest ticked by writing a postcard opens the composer
    return `<div class="${cls}" data-key="${esc(tickKey(player, q.id, q.daily ? ctx.date : null))}"><span class="qe">${q.e}</span><div class="qt"><div class="qn">${esc(q.t)}</div><div class="qp">${q.daily ? 'every day · ' : ''}${q.pts} pts${status}</div></div>${btn}</div>`;
  }
  function roleCard() {
    const cur = role();
    const pill = (r, who, text) => `<button class="pill${cur === r && (r !== 'parent' || owner() === who) ? ' active' : ''}" data-role="${r}" data-who="${who}">${text}</button>`;
    return `<div class="card rolecard"><div class="h3">Whose device is this?</div><p class="small muted">A parent phone can tick for everyone and approves what the kids tick on their device. The kids' device shows only the kids, and every tick there waits for a parent's ✓. Becoming a parent phone asks for the device PIN. Grandma and Grandpa's phone only reads the postcards and shows where we are.</p><div class="row">${parents().map((p) => pill('parent', p, `📱 ${esc(label(p))}'s phone`)).join('')}${pill('kids', '', "🧒 Kids' device")}${pill('grand', '', "👵👴 Grandma and Grandpa's phone")}</div></div>`;
  }
  function grandPhoneCard() {   // Grandma and Grandpa's phone (3 Nov 2026): whose phone this is cannot change by accident; Settings → Set-up asks for the device PIN first (app.js)
    return `<div class="card rolecard"><div class="h3">👵👴 Grandma and Grandpa's phone</div><p class="small muted">This phone shows the family's postcards and where they are. Tap ❤️ under a postcard, or Write back, and the family sees it from Grandma and Grandpa.</p></div>`;
  }
  function approvalsCard(st) {
    const pend = pendingAll(st);
    if (!isParentDevice() || !pend.length) return '';
    for (const it of pend) if (it.kind === 'card' && window.Postcard) Postcard.prepare(it.id, it.pic || null);   // drawn now with their pick, so the ✓ can share inside its own tap
    const eff = effective(st);
    return `<div class="card approvals"><div class="h3 approvals-head"><span>⏳ Waiting for a parent (${pend.length})</span>${pend.length > 1 ? `<button class="qbtn yes all" data-ok-all aria-label="Approve all">✓ All ${pend.length}</button>` : ''}</div>` + pend.map((it) => `<div class="approve-row"><span class="qe">${it.e}</span><div class="qt"><div class="qn">${face(it.player)} ${esc(label(it.player))}: ${esc(it.title)}</div><div class="qp">${it.kind === 'card' ? 'to send from this phone' : it.pts + ' pts'} · ${esc(fmtDate(it.date))}</div></div><button class="qbtn yes" data-ok="${esc(it.key)}" aria-label="Approve">✓</button><button class="qbtn no" data-no="${esc(it.key)}" aria-label="Not this time">✗</button></div>`).join('') + `</div>`;
  }
  function renderQuests() {
    const ctx = currentContext(), st = state(), player = st.active, eff = effective(st), pl = view(st, player, eff);
    const pts = points(pl), lv = level(pts);
    const places = [...citiesForDay(ctx)].filter((c) => c !== 'home');
    const here = ctx.before ? 'Before we go' : `Here in ${places.join(' and ') || ctx.city}`;
    const avail = available(ctx, pl);
    const todays = avail.filter((q) => q.where !== 'any').concat(avail.filter((q) => q.where === 'any' && q.kind === 'travel'));
    const dailies = avail.filter((q) => q.daily);
    const helpers = avail.filter((q) => q.where === 'any' && !q.daily && q.kind !== 'travel');
    let html = `<h1 class="h1">🏆 Quests</h1>`;
    if (!role()) html += roleCard();
    html += approvalsCard(st);
    html += playerChips(st, ctx);
    html += levelCard(player, lv, `${pts} points${lv.next ? ` · ${lv.next - pts} to ${esc(lv.nextName)}` : ' · top level!'}${pl.pending.length ? ` · ⏳ ${pl.pending.length} waiting` : ''}`);
    if (!isParentDevice()) html += `<p class="small muted kidnote">📨 Every tick on this device goes to Mum and Dad for a ✓ before the points count.</p>`;
    html += `<div class="row"><button class="btn block" data-go-passport>📘 Passport and badges</button></div>`;
    html += `<div class="foodcard" data-key="food"><span class="qe">🍽️</span><div class="qt"><div class="qn">Tried a new food?</div><div class="qp">${FOOD_PTS} pts each · ${pl.foods.length} so far</div></div><button class="qbtn go" id="food-add">+1</button></div>`;
    /* 22 Nov 2026 (Andy: "completed quests take up a lot of page space... only outstanding challenges show at the top"): a
       quest that is done and counted leaves its list and sits in one fold at the bottom, "Completed", with its Undo. One
       still waiting for Mum or Dad stays where it is. The quest ticked a moment ago stays put for this one drawing, so its
       pop and its points are seen where the finger was. */
    const just = fx ? fx.key : null;
    const finished = (q) => { const it = itemState(pl, q, ctx.date); return !!(it && it.counted) && tickKey(player, q.id, q.daily ? ctx.date : null) !== just; };
    const cards = (list) => list.map((q) => questCard(q, ctx, player, pl)).join('');
    const section = (title, list, allDone) => { const left = list.filter((q) => !finished(q)); return list.length ? `<h2 class="h2">${esc(title)}</h2>` + (left.length ? cards(left) : `<p class="small muted alldone">✓ ${esc(allDone)}</p>`) : ''; };
    html += section(here, todays, 'Everything here is done');
    html += section('Every day', dailies, 'All done for today');
    html += section('Any time', helpers, 'All done');
    const others = CITIES.filter((c) => !citiesForDay(ctx).has(c));
    html += `<h2 class="h2">Coming up</h2>` + others.map((c) => { const qs = QUESTS.filter((q) => q.where === c && !q.retired), left = qs.filter((q) => !finished(q)); return qs.length ? `<details data-d="${CITY_KEY[c]}"><summary>${CITY_EMOJI[c]} ${esc(c)} <span class="chip">${qs.length - left.length} / ${qs.length}</span></summary>${left.length ? cards(left) : '<p class="small muted alldone">✓ Everything here is done</p>'}</details>` : ''; }).join('');
    const done = QUESTS.filter((q) => finished(q) && !(q.parents && !isParentDevice()));
    if (done.length) {
      const where = (q) => (q.where === 'any' ? (q.daily ? 'Every day (today)' : 'Any time') : q.where === 'home' ? 'Before we go' : q.where);
      const groups = []; for (const q of done) { const w = where(q); let g = groups.find((x) => x[0] === w); if (!g) groups.push(g = [w, []]); g[1].push(q); }
      html += `<details data-d="done" class="donebox"><summary>✅ Completed <span class="chip">${done.length}</span></summary>${groups.map((g) => `<div class="h3">${CITY_EMOJI[g[0]] ? CITY_EMOJI[g[0]] + ' ' : ''}${esc(g[0])}</div>${cards(g[1])}`).join('')}</details>`;
    }
    const foodItems = pl.items.filter((it) => it.kind === 'food');
    if (foodItems.length) html += `<details data-d="foods"><summary>🍽️ New foods tried <span class="chip">${pl.foods.length}</span></summary><ul class="list">${foodItems.map((it) => `<li>${esc(it.what || 'Something new')} <span class="muted small">· ${esc(fmtDate(it.date))}${it.pending ? ' · ⏳ waiting' : it.rejected ? ' · ✗ not this time' : ''}</span> <button class="qbtn undo small-undo" data-food-undo="${esc(it.key)}">Undo</button></li>`).join('')}</ul></details>`;
    html += `<p class="tiny muted" id="sync-line">${esc(syncText())}</p>`;
    const el = $('#screen-quests');
    const open = [...el.querySelectorAll('details[open]')].map((d) => d.dataset.d);   // a list the reader opened stays open across the redraw (a tick inside "Coming up" used to shut it)
    el.innerHTML = html;
    if (open.length) el.querySelectorAll('details').forEach((d) => { if (open.includes(d.dataset.d)) d.open = true; });
    wire(el, ctx, player);
    applyFx(el);
  }
  function levelCard(player, lv, line) {   // the face, the level and a line of numbers over the progress bar (Quests and Passport)
    return `<div class="levelcard"><div class="lv-top">${face(player, 'lv-av')}<div><div class="lv-name">${esc(label(player))} · ${lv.emoji} ${esc(lv.name)}</div><div class="lv-pts">${line}</div></div></div><div class="bar"><i style="width:${lv.pct}%"></i></div></div>`;
  }
  function wire(el, ctx, player) {
    el.querySelectorAll('[data-player]').forEach((b) => b.onclick = () => { setActive(b.dataset.player); afterChange(); FX.pulse(el.querySelector('.player.active'), 'just', 700); FX.pulse(el.querySelector('.lv-av'), 'bump', 700); });
    el.querySelectorAll('[data-do]').forEach((b) => b.onclick = () => complete(player, b.dataset.do, ctx.date));
    el.querySelectorAll('[data-write]').forEach((b) => b.onclick = () => { if (!window.Journal) return; show('story'); Journal.openComposer({ mode: 'post', p: player }); });
    el.querySelectorAll('[data-undo]').forEach((b) => b.onclick = () => undo(player, b.dataset.undo, ctx.date));
    el.querySelectorAll('[data-food-undo]').forEach((b) => b.onclick = () => removeFood(player, b.dataset.foodUndo));
    const decide = (b, yes) => { const row = b.closest('.approve-row'), key = yes ? b.dataset.ok : b.dataset.no; FX.haptic(20); if (yes) FX.sound('pop'); if (yes && key.startsWith('card|')) { if (window.Postcard) Postcard.sendApproved(key); return; } if (row && !FX.reduce()) { row.classList.add(yes ? 'yes-out' : 'no-out'); setTimeout(() => approve(key, yes), 360); } else approve(key, yes); };
    el.querySelectorAll('[data-ok]').forEach((b) => b.onclick = () => decide(b, true));
    el.querySelectorAll('[data-no]').forEach((b) => b.onclick = () => decide(b, false));
    const all = el.querySelector('[data-ok-all]');
    if (all) all.onclick = () => {
      all.disabled = true; FX.haptic([20, 30, 40]);
      const rows = [...el.querySelectorAll('.approve-row')];
      if (rows.length && !FX.reduce()) {
        const [cx, cy] = FX.centreOf(all); FX.burst(cx, cy, FX.PAL.ok, 70);
        rows.forEach((r, i) => { r.style.animationDelay = (i * 45) + 'ms'; r.classList.add('yes-out'); });
        setTimeout(approveAll, 380 + rows.length * 45);
      } else approveAll();
    };
    el.querySelectorAll('[data-role]').forEach((b) => b.onclick = () => chooseRole(b.dataset.role, b.dataset.who));
    const fa = el.querySelector('#food-add'); if (fa) fa.onclick = () => askText('What did you try?', { placeholder: 'Sushi, poutine, a new fruit…', ok: 'Add it' }).then((what) => { if (what !== null) addFood(player, what.trim(), ctx.date); });   // app.js: asked in the app's own modal (some app views show no prompt)
    const gp = el.querySelector('[data-go-passport]'); if (gp) gp.onclick = () => show('passport');
  }
  function wireRole(root) { root.querySelectorAll('[data-role]').forEach((b) => b.onclick = () => chooseRole(b.dataset.role, b.dataset.who)); }
  async function chooseRole(r, who) {
    if (r === 'parent' && !(await askPin(`Device PIN to make this ${label(who)}'s phone`))) {   // app.js: asked in the app's own modal; it only compares, and shuts for five minutes after five wrong tries
      if (!role()) { openModal(roleCard()); wireRole($('#modal-inner')); }                          // the first-unlock question comes back
      return;
    }
    setRole(r, who);
    if (typeof closeModal === 'function' && document.querySelector('#modal:not(.hidden) .rolecard')) closeModal();   // the first-unlock question
    if (typeof rerender === 'function') rerender();                                                                 // Home, Book and the chrome differ by role
    if (typeof renderSettings === 'function' && document.querySelector('#screen-settings:not(.hidden)')) renderSettings();   // Settings differ by role too (3 Nov 2026)
    if (window.Journal) Journal.refreshBadge();
    afterChange();
  }
  function renderPassport() {
    const ctx = currentContext(), st = state(), player = st.active, pl = view(st, player);
    const all = badges(pl, ctx), pts = points(pl), lv = level(pts);
    const stamps = all.filter((b) => b.kind === 'stamp'), rest = all.filter((b) => b.kind !== 'stamp');
    let html = `<h1 class="h1">📘 Passport</h1>` + playerChips(st, ctx);
    html += levelCard(player, lv, `${pts} points · ${stamps.filter((b) => b.earned).length} of ${stamps.length} stamps · ${rest.filter((b) => b.earned).length} of ${rest.length} badges`);
    const stampCard = (b, k, extraCls, sub, attr) => `<div class="stampc${extraCls}${b.earned ? ' earned' : ''}" style="--i:${k}" data-badge="${esc(b.id)}"${attr || ''}><span class="se">${b.e}</span><span class="st">${esc(b.t)}</span><span class="sh">${sub}</span>${b.earned ? '<i class="glint"></i>' : ''}</div>`;
    html += `<h2 class="h2">Stamps</h2><p class="small muted">A stamp opens when we land. Tap it to stamp the passport${isParentDevice() ? '' : ' (Mum or Dad say yes)'}; if nobody does, it stamps itself the next morning.</p><div class="stamps">` + stamps.map((b, k) => stampCard(b, k, ' ' + (CITY_KEY[b.t] || '') + (b.ready ? ' ready' : b.pending ? ' pending' : ''), b.earned ? '✓ ' + esc(fmtDate(b.on || b.opens)) : esc(b.hint), b.ready ? ` data-stamp="${esc(b.t)}" role="button" tabindex="0"` : '')).join('') + `</div>`;
    html += `<h2 class="h2">Badges</h2><div class="stamps">` + rest.map((b, k) => stampCard(b, k, ' badge', b.earned ? '✓ earned · ' + b.pts + ' pts' : esc(b.hint))).join('') + `</div>`;
    html += `<h2 class="h2">Levels</h2><div class="card">${LEVELS.map((l) => `<div class="lvrow${pts >= l[0] ? ' got' : ''}"><span>${l[2]} ${esc(l[1])}</span><span class="muted">${l[0]} pts</span></div>`).join('')}</div>`;
    const el = $('#screen-passport'); el.innerHTML = html;
    wire(el, ctx, player);
    el.querySelectorAll('[data-stamp]').forEach((d) => d.onclick = () => stampCity(d.dataset.stamp));
    // stamps and badges earned since this device last showed them slam in one by one, with sparkles
    st.revealed = st.revealed || {};
    const fresh = all.filter((b) => b.earned && !st.revealed[player + '|' + b.id]);
    if (fresh.length) {
      const els = fresh.map((b) => el.querySelector(`[data-badge="${CSS.escape(b.id)}"]`)).filter(Boolean).slice(0, 14);
      FX.revealAll(els);
      for (const b of fresh) st.revealed[player + '|' + b.id] = ctx.date;
      save(st);
    }
  }
  function settingsCard() {
    const st = state(), eff = effective(st);
    const devices = Object.values(st.devices || {}).filter((d) => d && d.name).map((d) => d.name);
    if (isGrandDevice()) return grandPhoneCard() + `<div class="card"><div class="h3">Your faces</div><p class="small muted">Tap a face to change it. The family sees both next to your ❤️ and replies.</p>${GRAND.map((p) => { const pl = view(st, p, eff); return `<button class="avrow" data-avatar="${esc(p)}" aria-label="Change ${esc(label(p))}'s avatar"><span class="av big-av">${pl.avatar}</span><b>${esc(label(p))}</b><span class="muted small avgo">Change ›</span></button>`; }).join('')}</div>` + `<div class="card"><div class="h3">Sync</div><div class="syncline" id="sync-line">${esc(syncText())}</div>${devices.length ? `<div class="tiny muted">Other devices seen: ${esc(devices.join(', '))}</div>` : ''}<div class="row"><button class="btn" id="opt-sync-now">Sync now</button></div></div>`;
    return roleCard() +
      `<div class="card"><div class="h3">Quest players</div><p class="small muted">Tap a face to change it.</p>` +
      visiblePlayers().map((p) => { const pl = view(st, p, eff); return `<button class="avrow" data-avatar="${esc(p)}" aria-label="Change ${esc(label(p))}'s avatar">${face(p, 'av big-av')}<b>${esc(label(p))}</b><span class="muted small">${points(pl)} pts</span><span class="muted small avgo">Change ›</span></button>`; }).join('') +
      `<div class="syncline" id="sync-line">${esc(syncText())}</div>${devices.length ? `<div class="tiny muted">Other devices seen: ${esc(devices.join(', '))}</div>` : ''}` +
      `<div class="row"><button class="btn" id="opt-sync-now">Sync now</button>${isParentDevice() ? `<button class="btn" id="opt-quests-reset">Reset all quest progress</button>` : ''}</div></div>`;
  }
  function wireSettings(root) {
    root.querySelectorAll('[data-avatar]').forEach((b) => b.onclick = () => openAvatarPicker(b.dataset.avatar));
    root.querySelectorAll('[data-role]').forEach((b) => b.onclick = () => chooseRole(b.dataset.role, b.dataset.who));
    const sn = root.querySelector('#opt-sync-now'); if (sn) sn.onclick = () => Sync.sync();
    const r = root.querySelector('#opt-quests-reset'); if (r) r.onclick = () => { if (confirm('Reset every player\'s points, quests and badges on every device?')) { reset(); renderSettings(); refreshTop(); } };
  }
  function openAvatarPicker(p) {
    const st = state(), cur = view(st, p).avatar;
    const pick = (a) => `<button class="avpick${a === cur ? ' active' : ''}" data-pick="${a}" aria-label="${a}">${a}</button>`;
    openModal(`<h2 class="h2">${esc(label(p))}: pick a face</h2><div class="row avtop"><span class="avnow">${cur}</span><button class="btn" id="av-random">🎲 Surprise me</button><span class="muted small">${avatarsOk().length} to choose from</span></div>` +
      AVATAR_GROUPS.map(([name, list]) => [name, list.filter(emojiOk)]).filter((g) => g[1].length).map(([name, list]) => `<h3 class="h3 avhead">${esc(name)}</h3><div class="avgrid">${list.map(pick).join('')}</div>`).join(''));
    let spin = null;                      // the "Surprise me" shuffle: stopped by a pick or by closing the picker (it used to finish anyway, replace the face just picked and close whatever was open)
    const choose = (a) => { clearInterval(spin); spin = null; setAvatar(p, a); closeModal(); refreshTop(); renderSettings(); FX.haptic(15); };
    const inner = $('#modal-inner');
    inner.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => choose(b.dataset.pick));
    inner.querySelector('#av-random').onclick = () => {   // a short shuffle on the big face, then that one sticks
      if (spin) return;
      const now = inner.querySelector('.avnow'), ok = avatarsOk(), rnd = () => ok[Math.floor(Math.random() * ok.length)];
      let n = 0;
      spin = setInterval(() => {
        if (!document.body.contains(now)) { clearInterval(spin); spin = null; return; }   // the picker was closed mid-shuffle
        now.textContent = rnd(); if (++n >= 12) choose(now.textContent);
      }, 70);
    };
  }
  let lastTop = null;                   // [player, points] the header pill last showed, for the count-up
  function refreshTop() {
    faceMemo = {};
    const el = $('#top-points'), fe = $('#top-face'); if (!el || !S.family) return;
    const st = state(), pl = view(st, st.active), n = points(pl);
    if (fe) fe.innerHTML = face(st.active);                       // the face; the number counts up on its own
    if (lastTop && lastTop[0] === st.active && lastTop[1] !== n) { FX.countUp(el, lastTop[1], n, 700); FX.pulse($('#btn-points'), 'bump', 700); }
    else el.textContent = String(n);
    lastTop = [st.active, n];
    const badge = $('#nav-quests-badge');
    if (badge) { const n = isParentDevice() ? pendingAll(st).length : 0; badge.textContent = n ? String(n) : ''; badge.classList.toggle('hidden', !n); }
  }

  /* ---------------------------------------------------------------- party (fx.js draws it; kinds: quest food wait badge stamp ok level) */
  function celebrate(emoji, big, small, player, kind, points, extra) {
    FX.celebrate(Object.assign({ emoji, big, small, who: label(player), kind: kind || 'quest', points: points || 0 }, extra || {}));
  }

  return { QUESTS, CITY_EMOJI, CITY_KEY, CITIES, dayCity, daysBetween, state, reload, label, setActive, complete, undo, addFood, approve, approveAll, badges,
    checkNewBadges, checkLevelUp, renderQuests, renderPassport, settingsCard, wireSettings, refreshTop, celebrate, reset, startSync, mergeRemote, mine,
    role, setRole, isParentDevice, isGrandDevice, roleCard, wireRole, pendingAll, view, points, LEVELS, level, face, glyph, setFact, getFact, factsByPrefix, onFacts, visiblePlayers, addDays, syncText,
    arrivals, stampCity, stampsReady, wipeStories, storiesWipedAt: () => swipeT(state()), cardStatus, cardStatuses, requestCard, approveCard };
})();
