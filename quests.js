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
    ['Sport and play', ['⚽', '🏀', '🏈', '⚾', '🎾', '🏒', '🏓', '🎳', '🎯', '🎮', '🎸', '🥁', '🎺', '🎨', '🎭', '🎪', '🎲', '🏆', '🥇', '🎁', '🧩', '🪁', '🛹', '🛼', '🏹', '🥊', '🎤', '🎧']],
    ['Faces', ['😀', '😎', '🤓', '🥳', '🤩', '😜', '🤪', '😇', '🥸', '🤗', '😺', '🙃', '🥶', '🤭', '😴', '🤔', '😈', '🤑', '🥰', '😤']],
  ];
  const AVATARS = AVATAR_GROUPS.flatMap((g) => g[1]);
  const DEFAULT_AVATAR = { Andrew: '🕵️', Sarah: '🌟', Vince: '🦖', Drew: '🦄' };
  const DISPLAY = { Andrew: 'Dad', Sarah: 'Mum' };          // the parents; everyone else is a kid
  const LEVELS = [[0, 'Rookie', '🥾'], [100, 'Explorer', '🧭'], [250, 'Adventurer', '🎒'], [500, 'Navigator', '🧭'], [900, 'Globetrotter', '🌏'], [1500, 'Legend', '👑']];
  const FOOD_PTS = 10;

  /* kind: food · explore · helper · words · travel · daily. where: a city, 'any' (whole trip), 'home' (before we go).
     A kid's tick on any quest waits for a parent's ✓ (Andy, 1 Nov: "parent approval for most of the kids' challenges");
     auto: true lets a quest count at once on the kids' device (none at the moment). Parent ticks never wait. */
  const QUESTS = [
    // before we go
    { id: 'pack-case', e: '🧳', t: 'Help pack your own suitcase', pts: 20, where: 'home', kind: 'helper' },
    { id: 'flu-shot', e: '💉', t: 'Brave the flu shot', pts: 30, where: 'home', kind: 'helper' },
    { id: 'learn-ja', e: '🇯🇵', t: 'Learn three Japanese words', pts: 20, where: 'home', kind: 'words' },
    { id: 'learn-fr', e: '🇫🇷', t: 'Learn three French words', pts: 20, where: 'home', kind: 'words' },
    { id: 'know-numbers', e: '📱', t: "Know Mum and Dad's phone numbers by heart", pts: 50, where: 'any', kind: 'helper' },
    { id: 'thermals', e: '🧤', t: 'Try on your thermals and gloves', pts: 10, where: 'home', kind: 'helper' },
    // every day, anywhere
    { id: 'photo', e: '📸', t: 'Morning photo taken (grown-ups)', pts: 5, where: 'any', kind: 'daily', daily: true, parents: true },
    { id: 'daypack', e: '🎒', t: 'Pack your own daypack', pts: 5, where: 'any', kind: 'daily', daily: true },
    { id: 'hands', e: '🤝', t: 'Hold hands at every crossing and station', pts: 5, where: 'any', kind: 'daily', daily: true },
    { id: 'thanks', e: '🙏', t: 'Say thank you in the local language', pts: 5, where: 'any', kind: 'daily', daily: true },
    { id: 'water', e: '💧', t: 'Drink water before bed', pts: 5, where: 'any', kind: 'daily', daily: true },
    { id: 'diary', e: '📓', t: 'Draw or write one line about today', pts: 5, where: 'any', kind: 'daily', daily: true },
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
    { id: 'bear-sign', e: '🐻', t: 'Spot a bear sign while the bears sleep', pts: 10, where: 'Whistler', kind: 'explore' },
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
    { id: 'postcard', e: '📮', t: 'Send a postcard home', pts: 15, where: 'any', kind: 'helper' },
    { id: 'flags', e: '🏳️', t: 'Spot five different flags in one day', pts: 10, where: 'any', kind: 'explore' },
    { id: 'carry-bag', e: '🪜', t: 'Carry a bag up the stairs for someone', pts: 10, where: 'any', kind: 'helper' },
    { id: 'new-friend', e: '🤝', t: 'Make a friend who speaks another language', pts: 25, where: 'any', kind: 'words' },
  ];
  const byId = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
  const needsVerify = (q) => !!(q && !q.auto);               // a kid's tick waits for a parent unless the quest is auto

  /* ---------------------------------------------------------------- people and roles */
  function people() { return ((typeof S !== 'undefined' && S.family && S.family.trip && S.family.trip.people) || ['Andrew', 'Sarah', 'Vince', 'Drew']).slice(); }
  const label = (p) => DISPLAY[p] || p;
  const isParent = (p) => !!DISPLAY[p];
  const parents = () => people().filter(isParent);
  const kids = () => people().filter((p) => !isParent(p));
  const role = () => localStorage.getItem('deviceRole') || '';            // 'parent' | 'kids' | '' (not chosen yet)
  const owner = () => localStorage.getItem('deviceOwner') || '';          // the parent a parent phone belongs to
  const isParentDevice = () => role() === 'parent';
  const visiblePlayers = () => (isParentDevice() ? people() : kids());
  function setRole(r, who) {
    localStorage.setItem('deviceRole', r); localStorage.setItem('deviceOwner', who || '');
    const st = state(); if (!visiblePlayers().includes(st.active)) { st.active = visiblePlayers()[0]; save(st); }
    Sync.touch();
  }
  function deviceName() { return isParentDevice() ? `${label(owner() || 'Dad')}'s phone` : "Kids' device"; }

  /* ---------------------------------------------------------------- state: facts, newest per key wins */
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '') || null; } catch (e) { return null; } }
  function save(st) { localStorage.setItem(KEY, JSON.stringify(st)); }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function state() {
    let st = load();
    if (!st) { st = migrate(); save(st); }
    st.facts = st.facts || {}; st.seen = st.seen || {}; st.okSeen = st.okSeen || {}; st.devices = st.devices || {};
    if (!st.device) { st.device = newId(); save(st); }
    const vis = visiblePlayers();
    if (!st.active || !vis.includes(st.active)) st.active = vis[0] || people()[0];
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
  function put(st, key, v) { st.facts[key] = { v, t: Date.now(), d: st.device }; }
  const wipeT = (st) => (st.facts.wipe ? st.facts.wipe.t : 0);
  function effective(st) {               // facts that survive the last reset
    const w = wipeT(st), out = {};
    for (const [k, f] of Object.entries(st.facts)) if (k !== 'wipe' && f.t >= w) out[k] = f;
    return out;
  }
  function liveOn(st, key) { const f = effective(st)[key]; return !!(f && f.v && f.v.on); }

  /* every tick and food note of one player, with its approval state */
  function items(st, p, eff) {
    eff = eff || effective(st);
    const out = [];
    for (const [k, f] of Object.entries(eff)) {
      const parts = k.split('|');
      if (parts[1] !== p || !f.v || !f.v.on) continue;
      let it = null;
      if (parts[0] === 'tick') { const q = byId[parts[2]]; if (!q) continue; it = { kind: 'tick', q, id: q.id, date: f.v.date || parts[3], pts: q.pts, title: q.t, e: q.e, verify: needsVerify(q) }; }
      else if (parts[0] === 'food') it = { kind: 'food', date: f.v.date, what: f.v.what || '', pts: FOOD_PTS, title: f.v.what ? 'Tried: ' + f.v.what : 'Tried something new', e: '🍽️', verify: true };
      if (!it) continue;
      it.key = k; it.player = p; it.by = f.v.by || 'kid'; it.t = f.t;
      it.needs = it.verify && it.by !== 'parent';
      const ok = eff['ok|' + k];
      const okValid = ok && ok.t >= f.t;             // a re-tick after a ✗ asks again
      it.ok = okValid ? ok.v.a : null; it.okBy = okValid ? ok.v.who || '' : '';
      it.pending = it.needs && !it.ok;
      it.rejected = it.needs && it.ok === 'no';
      it.counted = !it.needs || it.ok === 'yes';
      out.push(it);
    }
    return out.sort((a, b) => b.t - a.t);
  }
  /* a player as the views see them: counted ticks by quest, counted foods, avatar, pending and rejected items */
  function view(st, p, eff) {
    eff = eff || effective(st);
    const its = items(st, p, eff), done = {}, foods = [];
    for (const it of its) {
      if (!it.counted) continue;
      if (it.kind === 'tick') (done[it.id] = done[it.id] || []).push(it.date); else foods.push({ date: it.date, what: it.what, key: it.key });
    }
    const av = eff['avatar|' + p];
    return { name: p, avatar: av ? av.v : (DEFAULT_AVATAR[p] || '🙂'), done, foods, items: its, pending: its.filter((i) => i.pending), rejected: its.filter((i) => i.rejected) };
  }
  function pendingAll(st) { const eff = effective(st); return people().flatMap((p) => items(st, p, eff).filter((i) => i.pending)); }

  const doneCount = (pl, id) => (pl.done[id] || []).length;
  const doneToday = (pl, id, date) => (pl.done[id] || []).includes(date);
  function rawPoints(pl) {              // quests and foods only, no badges (the Thousand club counts these)
    let pts = 0;
    for (const [id, dates] of Object.entries(pl.done)) pts += (byId[id] ? byId[id].pts : 0) * dates.length;
    return pts + (pl.foods || []).length * FOOD_PTS;
  }
  function points(pl) {
    let pts = rawPoints(pl);
    for (const b of badges(pl)) if (b.earned) pts += b.pts;
    return pts;
  }
  function level(pts) {
    let cur = LEVELS[0], next = null;
    for (const l of LEVELS) { if (pts >= l[0]) cur = l; else { next = l; break; } }
    return { name: cur[1], emoji: cur[2], from: cur[0], next: next ? next[0] : null, nextName: next ? next[1] : null,
      pct: next ? Math.round(((pts - cur[0]) / (next[0] - cur[0])) * 100) : 100 };
  }

  /* ---------------------------------------------------------------- changes (every one is a fact) */
  const by = () => (isParentDevice() ? 'parent' : 'kid');
  let fx = null;                        // the card to animate after the next render: { key, cls, float, fcls }
  function complete(player, id, date) {
    const st = state(), q = byId[id]; if (!q) return;
    const key = tickKey(player, id, q.daily ? date : null);
    if (liveOn(st, key)) return;
    const who = by();
    put(st, key, { on: true, by: who, date });
    save(st); Sync.touch();
    const waits = needsVerify(q) && who !== 'parent';
    fx = waits ? { key, cls: 'just-sent', float: '📨 sent', fcls: 'send' } : { key, cls: 'just-done', float: `+${q.pts}` };
    if (waits) celebrate('⏳', 'Sent to Mum and Dad', `${q.t} · ${q.pts} points when they say yes`, player, 'wait');
    else celebrate(q.e, `+${q.pts} points`, q.t, player, 'quest', q.pts);
    afterChange();
  }
  function undo(player, id, date) {
    const st = state(), q = byId[id]; if (!q) return;
    const key = tickKey(player, id, q.daily ? date : null);
    if (!liveOn(st, key)) return;
    put(st, key, { on: false, by: by(), date });
    fx = { key, cls: 'just-undone', float: `−${q.pts}`, fcls: 'minus' };
    save(st); Sync.touch(); afterChange();
  }
  function addFood(player, what, date) {
    const st = state(), who = by();
    put(st, 'food|' + player + '|' + newId(), { on: true, by: who, date, what: String(what || '').slice(0, 60) });
    save(st); Sync.touch();
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
  function checkLevelUp(st) {           // the active player crossed a level line (own tick or a sync merge)
    const p = st.active, lv = level(points(view(st, p)));
    st.lastLevel = st.lastLevel || {};
    const prev = st.lastLevel[p];
    if (prev !== lv.from) { st.lastLevel[p] = lv.from; save(st); }
    if (prev != null && lv.from > prev) celebrate(lv.emoji, 'Level up!', `${lv.name}`, p, 'level');
  }
  function removeFood(player, key) {
    const st = state(), f = st.facts[key]; if (!f) return;
    put(st, key, Object.assign({}, f.v, { on: false, by: by() }));
    save(st); Sync.touch(); afterChange();
  }
  function approve(key, yes) {
    if (!isParentDevice()) return;
    const st = state();
    put(st, 'ok|' + key, { a: yes ? 'yes' : 'no', who: label(owner() || 'Dad') });
    save(st); Sync.touch(); afterChange();
  }
  function approveAll() {               // every pending item, one fact each, one sync
    if (!isParentDevice()) return;
    const st = state(), who = label(owner() || 'Dad');
    for (const it of pendingAll(st)) put(st, 'ok|' + it.key, { a: 'yes', who });
    save(st); Sync.touch(); afterChange();
  }
  function setActive(p) { const st = state(); st.active = p; save(st); }
  function setAvatar(p, a) { const st = state(); put(st, 'avatar|' + p, a); save(st); Sync.touch(); }
  function reset() {                     // every device: facts older than this moment stop counting
    const st = state();
    st.facts.wipe = { v: 1, t: Date.now(), d: st.device }; st.seen = {}; st.okSeen = {};
    save(st); Sync.touch();
  }
  function afterChange() {
    refreshTop();
    if (S.screen === 'quests') renderQuests();
    if (S.screen === 'passport') renderPassport();
    if (S.screen === 'home') renderHome();
    if (S.screen === 'settings') renderSettings();
    fx = null;
    checkLevelUp(state());
  }

  /* ---------------------------------------------------------------- sync: what we send, how we merge */
  function mine() { const st = state(), out = {}; for (const [k, f] of Object.entries(st.facts)) if (f.d === st.device) out[k] = f; return out; }
  function mergeRemote(devices) {
    const st = state();
    const merged = {};
    for (const [k, f] of Object.entries(st.facts)) if (f.d === st.device) merged[k] = f;       // ours always travel with us
    for (const [id, blob] of Object.entries(devices || {})) {
      if (id === st.device) continue;
      for (const [k, f] of Object.entries((blob && blob.facts) || {})) {
        if (!f || typeof f.t !== 'number' || !/^(tick|food|ok|avatar|wipe)\|?/.test(k)) continue;
        const cur = merged[k];
        if (!cur || f.t > cur.t || (f.t === cur.t && String(f.d) > String(cur.d))) merged[k] = Object.assign({}, f, { d: f.d || id });
      }
    }
    st.facts = merged;
    st.devices = Object.fromEntries(Object.entries(devices || {}).map(([id, b]) => [id, { role: b && b.role, name: b && b.name, at: b && b.at }]));
    save(st);
    celebrateApprovals(st);
    afterChange();
  }
  function celebrateApprovals(st) {      // on a kids' device: a ✓ arriving from a parent pops the points
    if (isParentDevice()) return;
    const eff = effective(st), fresh = [];
    for (const p of visiblePlayers()) for (const it of items(st, p, eff)) if (it.needs && it.ok && !st.okSeen[it.key]) { st.okSeen[it.key] = it.ok; if (it.ok === 'yes') fresh.push(it); }
    save(st);
    if (!fresh.length) return;
    const it = fresh[0], total = fresh.reduce((n, i) => n + i.pts, 0);
    celebrate(it.e, `+${total} points`, `${it.okBy || 'A parent'} said yes${fresh.length > 1 ? ' to ' + fresh.length + ' things' : ': ' + it.title}`, it.player, 'ok', total);
  }
  function startSync() {
    const sy = (S.family && S.family.trip && S.family.trip.sync) || {};
    const st = state();
    Sync.onStatus(() => { const el = $('#sync-line'); if (el) el.textContent = syncText(); refreshTop(); });
    Sync.start({ url: sy.url, token: sy.token, device: st.device, mine, apply: mergeRemote, meta: () => ({ role: role() || 'kids', name: deviceName() }) });
  }
  function syncText() {
    const s = Sync.status();
    if (!s.enabled) return 'Scores stay on this device: no sync address in this build.';
    if (s.error === 'offline') return 'Offline: scores sync when back online.' + (s.dirty ? ' Changes waiting.' : '');
    if (s.error) return 'Sync problem: ' + s.error;
    if (s.busy) return 'Syncing…';
    if (!s.last) return 'Not synced yet.';
    const m = Math.round((Date.now() - s.last) / 60000);
    return `Synced ${m < 1 ? 'just now' : m + ' min ago'} · ${s.devices} device${s.devices === 1 ? '' : 's'}${s.dirty ? ' · changes waiting' : ''}`;
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
  function firstDates() {
    /* first date we are in each city: the days list (so Nagoya, a day trip, counts) plus the airport stops from the moves */
    const out = {};
    for (const d of S.family.days) { const c = dayCity(d); if (!(c in out) && c !== 'Home' && c !== 'Air') out[c] = d.date; }
    for (const [date, cities] of Object.entries(arrivalsOn())) for (const c of cities) if (!(c in out) || date < out[c]) out[c] = date;
    return Object.fromEntries(Object.entries(out).sort((a, b) => a[1].localeCompare(b[1])));
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
    const first = firstDates();
    for (const c of Object.keys(first)) {
      out.push({ id: 'stamp-' + CITY_KEY[c], e: CITY_EMOJI[c], t: c, kind: 'stamp', pts: 25, earned: today >= first[c], opens: first[c], hint: `Opens ${fmtDate(first[c])}` });
    }
    const start = F.trip.start, end = F.trip.end, total = daysBetween(start, end) + 1;
    const dayN = daysBetween(start, today) + 1;
    const nyd = F.days.find((d) => d.date >= '2027-01-01');
    const bday = F.days.find((d) => /birthday/i.test(d.plan || ''));
    const dateLine = F.days.find((d) => dayCity(d) === 'Air');
    out.push({ id: 'first-flight', e: '🛫', t: 'Wheels up', kind: 'milestone', pts: 50, earned: today >= start, hint: `Opens ${fmtDate(start)}` });
    out.push({ id: 'halfway', e: '🏁', t: 'Halfway there', kind: 'milestone', pts: 50, earned: dayN >= Math.ceil(total / 2), hint: `Day ${Math.ceil(total / 2)} of ${total}` });
    if (dateLine) out.push({ id: 'date-line', e: '🌐', t: 'Date-line crosser', kind: 'milestone', pts: 50, earned: today > dateLine.date, hint: 'Lose a day in the air' });
    if (nyd) out.push({ id: 'new-year', e: '🎆', t: 'New Year in Tokyo', kind: 'milestone', pts: 50, earned: today >= nyd.date, hint: `Opens ${fmtDate(nyd.date)}` });
    if (bday) out.push({ id: 'birthday', e: '🎂', t: 'Birthday on tour', kind: 'milestone', pts: 50, earned: today >= bday.date, hint: `Opens ${fmtDate(bday.date)}` });
    out.push({ id: 'home-again', e: '🏡', t: 'Home again', kind: 'milestone', pts: 50, earned: today >= end, hint: `Opens ${fmtDate(end)}` });
    const foods = (pl.foods || []).length;
    for (const [n, t, e] of [[5, 'Taste tester', '🍴'], [10, 'Food explorer', '🍜'], [20, 'Snack legend', '🍣']])
      out.push({ id: 'food-' + n, e, t, kind: 'skill', pts: 30, earned: foods >= n, hint: `${Math.min(foods, n)} of ${n} new foods` });
    const kindCount = (k) => Object.keys(pl.done).filter((id) => byId[id] && byId[id].kind === k).length;
    for (const [k, n, t, e] of [['words', 5, 'Chatterbox', '🗣️'], ['explore', 10, 'Explorer', '🧭'], ['helper', 5, 'Helper', '🦸'], ['travel', 4, 'Frequent flyer', '✈️']])
      out.push({ id: 'skill-' + k, e, t, kind: 'skill', pts: 30, earned: kindCount(k) >= n, hint: `${Math.min(kindCount(k), n)} of ${n} ${k} quests` });
    const photos = (pl.done.photo || []).length;
    out.push({ id: 'photo-7', e: '📸', t: 'Photo streak', kind: 'skill', pts: 30, earned: photos >= 7, hint: `${Math.min(photos, 7)} of 7 morning photos` });
    // 31 Oct additions: three more milestones, dailies badges, a champion per city, and two big counters
    const firstUS = F.days.find((d) => dayCity(d) === 'New York'), firstJP = F.days.find((d) => dayCity(d) === 'Tokyo'), xmas = F.days.find((d) => d.date === '2026-12-25');
    if (firstUS) out.push({ id: 'border-hopper', e: '🛂', t: 'Border hopper', kind: 'milestone', pts: 50, earned: today >= firstUS.date, hint: `Opens ${fmtDate(firstUS.date)}` });
    if (xmas) out.push({ id: 'christmas', e: '🎄', t: 'Christmas away', kind: 'milestone', pts: 50, earned: today >= xmas.date, hint: `Opens ${fmtDate(xmas.date)}` });
    if (firstJP) out.push({ id: 'four-countries', e: '🌍', t: 'Four countries', kind: 'milestone', pts: 50, earned: today >= firstJP.date, hint: `Opens ${fmtDate(firstJP.date)}` });
    const dailyIds = QUESTS.filter((q) => q.daily && !q.parents).map((q) => q.id);
    const dailyDates = new Set(); for (const id of dailyIds) for (const d of (pl.done[id] || [])) dailyDates.add(d);
    const perfect = [...dailyDates].some((d) => dailyIds.every((id) => (pl.done[id] || []).includes(d)));
    out.push({ id: 'perfect-day', e: '⭐', t: 'Perfect day', kind: 'skill', pts: 30, earned: perfect, hint: `All ${dailyIds.length} dailies in one day` });
    const sorted = [...dailyDates].sort(); let run = 0, best = 0;
    for (let i = 0; i < sorted.length; i++) { run = i > 0 && daysBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1; best = Math.max(best, run); }
    out.push({ id: 'streak-7', e: '🔥', t: 'Seven-day streak', kind: 'skill', pts: 30, earned: best >= 7, hint: `${Math.min(best, 7)} of 7 days running` });
    for (const [id, n, t, e] of [['water', 10, 'Hydration hero', '💧'], ['hands', 20, 'Hand holder', '🤝'], ['daypack', 10, 'Packer', '🎒'], ['thanks', 10, 'Polite traveller', '🙏']]) {
      const c = (pl.done[id] || []).length;
      out.push({ id: 'daily-' + id, e, t, kind: 'skill', pts: 30, earned: c >= n, hint: `${Math.min(c, n)} of ${n} days` });
    }
    for (const c of CHAMPION_CITIES) {
      const qs = QUESTS.filter((q) => q.where === c), done = qs.filter((q) => doneCount(pl, q.id)).length;
      out.push({ id: 'champ-' + CITY_KEY[c], e: '🏆', t: `${c} champion`, kind: 'skill', pts: 40, earned: qs.length > 0 && done === qs.length, hint: `${done} of ${qs.length} ${c} quests` });
    }
    const distinct = Object.keys(pl.done).filter((id) => byId[id] && !byId[id].daily).length;
    out.push({ id: 'quest-master', e: '🎯', t: 'Quest master', kind: 'skill', pts: 30, earned: distinct >= 50, hint: `${Math.min(distinct, 50)} of 50 quests` });
    const raw = rawPoints(pl);
    out.push({ id: 'thousand', e: '💰', t: 'Thousand club', kind: 'skill', pts: 30, earned: raw >= 1000, hint: `${Math.min(raw, 1000)} of 1,000 quest points` });
    return out;
  }
  function checkNewBadges(ctx) {
    /* celebrate badges the active player has earned since this device last looked */
    const st = state(), p = st.active, pl = view(st, p);
    const fresh = badges(pl, ctx).filter((b) => b.earned && !st.seen[p + '|' + b.id]);
    if (!fresh.length) return;
    for (const b of fresh) st.seen[p + '|' + b.id] = ctx.date;
    save(st);
    const b = fresh[0], total = fresh.reduce((n, x) => n + x.pts, 0);
    celebrate(b.e, fresh.length > 1 ? `${fresh.length} new badges` : (b.kind === 'stamp' ? 'New stamp!' : 'New badge!'), b.t + (fresh.length > 1 ? ' and more' : '') + ` · +${total} points`, p, b.kind === 'stamp' ? 'stamp' : 'badge', 0, { winter: /Whistler|Vancouver|Montréal|Toronto/.test(b.t) });
  }

  /* ---------------------------------------------------------------- views */
  function summary(ctx) {
    const st = state(), pl = view(st, st.active), pts = points(pl), lv = level(pts);
    const todays = available(ctx, pl).filter((q) => !q.done);
    return { player: st.active, name: label(st.active), avatar: pl.avatar, points: pts, level: lv, todayLeft: todays.length,
      stamps: badges(pl, ctx).filter((b) => b.kind === 'stamp' && b.earned).length, stampsTotal: Object.keys(firstDates()).length,
      pending: isParentDevice() ? pendingAll(st).length : pl.pending.length, role: role() };
  }
  function available(ctx, pl) {
    const here = citiesForDay(ctx);
    return QUESTS.filter((q) => (q.where === 'any' || here.has(q.where) || (ctx.before && q.where === 'home')) && !(q.parents && !isParentDevice()))
      .map((q) => ({ ...q, done: q.daily ? doneToday(pl, q.id, ctx.date) : doneCount(pl, q.id) > 0 }));
  }
  function playerChips(st, ctx) {
    const eff = effective(st);
    return `<div class="players">` + visiblePlayers().map((p) => { const pl = view(st, p, eff), pts = points(pl); return `<button class="player${p === st.active ? ' active' : ''}" data-player="${esc(p)}"><span class="av">${pl.avatar}</span><span class="nm">${esc(label(p))}</span><span class="pt">${pts} pts</span></button>`; }).join('') + `</div>`;
  }
  function itemState(pl, q, date) {    // the live tick for a quest card, if any
    return pl.items.find((it) => it.kind === 'tick' && it.id === q.id && (!q.daily || it.date === date)) || null;
  }
  function questCard(q, ctx, player, pl) {
    const it = itemState(pl, q, ctx.date);
    const cls = 'quest' + (it ? (it.counted ? ' done' : it.rejected ? ' rejected' : ' pending') : '');
    const status = !it ? '' : it.counted ? ' · ✓ done' : it.rejected ? ` · ✗ ${esc(it.okBy || 'a parent')} said not this time` : ' · ⏳ waiting for Mum or Dad';
    const btn = it ? `<button class="qbtn undo" data-undo="${q.id}">Undo</button>` : `<button class="qbtn go" data-do="${q.id}">Done!</button>`;
    return `<div class="${cls}" data-key="${esc(tickKey(player, q.id, q.daily ? ctx.date : null))}"><span class="qe">${q.e}</span><div class="qt"><div class="qn">${esc(q.t)}</div><div class="qp">${q.daily ? 'every day · ' : ''}${q.pts} pts${status}</div></div>${btn}</div>`;
  }
  function roleCard() {
    const cur = role();
    const pill = (r, who, text) => `<button class="pill${cur === r && (r !== 'parent' || owner() === who) ? ' active' : ''}" data-role="${r}" data-who="${who}">${text}</button>`;
    return `<div class="card rolecard"><div class="h3">Whose device is this?</div><p class="small muted">A parent phone can tick for everyone and approves what the kids tick on their device. The kids' device shows only the kids, and every tick there waits for a parent's ✓. Becoming a parent phone asks for the device PIN.</p><div class="row">${parents().map((p) => pill('parent', p, `📱 ${esc(label(p))}'s phone`)).join('')}${pill('kids', '', "🧒 Kids' device")}</div></div>`;
  }
  function approvalsCard(st) {
    const pend = pendingAll(st);
    if (!isParentDevice() || !pend.length) return '';
    const eff = effective(st);
    return `<div class="card approvals"><div class="h3 approvals-head"><span>⏳ Waiting for a parent (${pend.length})</span>${pend.length > 1 ? `<button class="qbtn yes all" data-ok-all aria-label="Approve all">✓ All ${pend.length}</button>` : ''}</div>` + pend.map((it) => `<div class="approve-row"><span class="qe">${it.e}</span><div class="qt"><div class="qn">${view(st, it.player, eff).avatar} ${esc(label(it.player))}: ${esc(it.title)}</div><div class="qp">${it.pts} pts · ${esc(fmtDate(it.date))}</div></div><button class="qbtn yes" data-ok="${esc(it.key)}" aria-label="Approve">✓</button><button class="qbtn no" data-no="${esc(it.key)}" aria-label="Not this time">✗</button></div>`).join('') + `</div>`;
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
    html += `<div class="levelcard"><div class="lv-top"><span class="lv-av">${pl.avatar}</span><div><div class="lv-name">${esc(label(player))} · ${lv.emoji} ${esc(lv.name)}</div><div class="lv-pts">${pts} points${lv.next ? ` · ${lv.next - pts} to ${esc(lv.nextName)}` : ' · top level!'}${pl.pending.length ? ` · ⏳ ${pl.pending.length} waiting` : ''}</div></div></div><div class="bar"><i style="width:${lv.pct}%"></i></div></div>`;
    if (!isParentDevice()) html += `<p class="small muted kidnote">📨 Every tick on this device goes to Mum and Dad for a ✓ before the points count.</p>`;
    html += `<div class="row"><button class="btn block" data-go-passport>📘 Passport and badges</button></div>`;
    html += `<div class="foodcard" data-key="food"><span class="qe">🍽️</span><div class="qt"><div class="qn">Tried a new food?</div><div class="qp">${FOOD_PTS} pts each · ${pl.foods.length} so far</div></div><button class="qbtn go" id="food-add">+1</button></div>`;
    if (todays.length) html += `<h2 class="h2">${esc(here)}</h2>` + todays.map((q) => questCard(q, ctx, player, pl)).join('');
    html += `<h2 class="h2">Every day</h2>` + dailies.map((q) => questCard(q, ctx, player, pl)).join('');
    if (helpers.length) html += `<h2 class="h2">Any time</h2>` + helpers.map((q) => questCard(q, ctx, player, pl)).join('');
    const others = CITIES.filter((c) => !citiesForDay(ctx).has(c));
    html += `<h2 class="h2">Coming up</h2>` + others.map((c) => { const qs = QUESTS.filter((q) => q.where === c); return qs.length ? `<details><summary>${CITY_EMOJI[c]} ${esc(c)} <span class="chip">${qs.filter((q) => doneCount(pl, q.id)).length} / ${qs.length}</span></summary>${qs.map((q) => questCard(q, ctx, player, pl)).join('')}</details>` : ''; }).join('');
    const foodItems = pl.items.filter((it) => it.kind === 'food');
    if (foodItems.length) html += `<details><summary>🍽️ New foods tried <span class="chip">${pl.foods.length}</span></summary><ul class="list">${foodItems.map((it) => `<li>${esc(it.what || 'Something new')} <span class="muted small">· ${esc(fmtDate(it.date))}${it.pending ? ' · ⏳ waiting' : it.rejected ? ' · ✗ not this time' : ''}</span> <button class="qbtn undo small-undo" data-food-undo="${esc(it.key)}">Undo</button></li>`).join('')}</ul></details>`;
    html += `<p class="tiny muted" id="sync-line">${esc(syncText())}</p>`;
    const el = $('#screen-quests'); el.innerHTML = html;
    wire(el, ctx, player);
    applyFx(el);
  }
  function wire(el, ctx, player) {
    el.querySelectorAll('[data-player]').forEach((b) => b.onclick = () => { setActive(b.dataset.player); afterChange(); FX.pulse(el.querySelector('.player.active'), 'just', 700); FX.pulse(el.querySelector('.lv-av'), 'bump', 700); });
    el.querySelectorAll('[data-do]').forEach((b) => b.onclick = () => complete(player, b.dataset.do, ctx.date));
    el.querySelectorAll('[data-undo]').forEach((b) => b.onclick = () => undo(player, b.dataset.undo, ctx.date));
    el.querySelectorAll('[data-food-undo]').forEach((b) => b.onclick = () => removeFood(player, b.dataset.foodUndo));
    const decide = (b, yes) => { const row = b.closest('.approve-row'), key = yes ? b.dataset.ok : b.dataset.no; FX.haptic(20); if (row && !FX.reduce()) { row.classList.add(yes ? 'yes-out' : 'no-out'); setTimeout(() => approve(key, yes), 360); } else approve(key, yes); };
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
    const fa = el.querySelector('#food-add'); if (fa) fa.onclick = () => { const what = prompt('What did you try?'); if (what !== null) addFood(player, what.trim(), ctx.date); };
    const gp = el.querySelector('[data-go-passport]'); if (gp) gp.onclick = () => show('passport');
  }
  async function chooseRole(r, who) {
    if (r === 'parent') {
      const pin = prompt(`Device PIN to make this ${label(who)}'s phone:`);
      if (pin === null) return;
      if (!(await verifyPin(pin))) { alert('That is not the PIN.'); return; }
    }
    setRole(r, who);
    afterChange();
  }
  function renderPassport() {
    const ctx = currentContext(), st = state(), player = st.active, pl = view(st, player);
    const all = badges(pl, ctx), pts = points(pl), lv = level(pts);
    const stamps = all.filter((b) => b.kind === 'stamp'), rest = all.filter((b) => b.kind !== 'stamp');
    let html = `<h1 class="h1">📘 Passport</h1>` + playerChips(st, ctx);
    html += `<div class="levelcard"><div class="lv-top"><span class="lv-av">${pl.avatar}</span><div><div class="lv-name">${esc(label(player))} · ${lv.emoji} ${esc(lv.name)}</div><div class="lv-pts">${pts} points · ${stamps.filter((b) => b.earned).length} of ${stamps.length} stamps · ${rest.filter((b) => b.earned).length} of ${rest.length} badges</div></div></div><div class="bar"><i style="width:${lv.pct}%"></i></div></div>`;
    const stampCard = (b, k, extraCls, sub) => `<div class="stampc${extraCls}${b.earned ? ' earned' : ''}" style="--i:${k}" data-badge="${esc(b.id)}"><span class="se">${b.e}</span><span class="st">${esc(b.t)}</span><span class="sh">${sub}</span>${b.earned ? '<i class="glint"></i>' : ''}</div>`;
    html += `<h2 class="h2">Stamps</h2><div class="stamps">` + stamps.map((b, k) => stampCard(b, k, ' ' + (CITY_KEY[b.t] || ''), b.earned ? '✓ ' + esc(fmtDate(b.opens)) : esc(b.hint))).join('') + `</div>`;
    html += `<h2 class="h2">Badges</h2><div class="stamps">` + rest.map((b, k) => stampCard(b, k, ' badge', b.earned ? '✓ earned · ' + b.pts + ' pts' : esc(b.hint))).join('') + `</div>`;
    html += `<h2 class="h2">Levels</h2><div class="card">${LEVELS.map((l) => `<div class="lvrow${pts >= l[0] ? ' got' : ''}"><span>${l[2]} ${esc(l[1])}</span><span class="muted">${l[0]} pts</span></div>`).join('')}</div>`;
    const el = $('#screen-passport'); el.innerHTML = html;
    wire(el, ctx, player);
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
    return roleCard() +
      `<div class="card"><div class="h3">Quest players</div><p class="small muted">Tap a face to change it.</p>` +
      visiblePlayers().map((p) => { const pl = view(st, p, eff); return `<button class="avrow" data-avatar="${esc(p)}" aria-label="Change ${esc(label(p))}'s avatar"><span class="av big-av">${pl.avatar}</span><b>${esc(label(p))}</b><span class="muted small">${points(pl)} pts</span><span class="muted small avgo">Change ›</span></button>`; }).join('') +
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
    openModal(`<h2 class="h2">${esc(label(p))}: pick a face</h2><div class="row avtop"><span class="avnow">${cur}</span><button class="btn" id="av-random">🎲 Surprise me</button><span class="muted small">${AVATARS.length} to choose from</span></div>` +
      AVATAR_GROUPS.map(([name, list]) => `<h3 class="h3 avhead">${esc(name)}</h3><div class="avgrid">${list.map(pick).join('')}</div>`).join(''));
    const choose = (a) => { setAvatar(p, a); closeModal(); refreshTop(); renderSettings(); FX.haptic(15); };
    const inner = $('#modal-inner');
    inner.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => choose(b.dataset.pick));
    inner.querySelector('#av-random').onclick = () => {   // a short shuffle on the big face, then that one sticks
      const now = inner.querySelector('.avnow'), rnd = () => AVATARS[Math.floor(Math.random() * AVATARS.length)];
      let n = 0; const spin = setInterval(() => { now.textContent = rnd(); if (++n >= 12) { clearInterval(spin); choose(now.textContent); } }, 70);
    };
  }
  let lastTop = null;                   // [player, points] the header pill last showed, for the count-up
  function refreshTop() {
    const el = $('#top-points'); if (!el || !S.family) return;
    const st = state(), pl = view(st, st.active), n = points(pl);
    if (lastTop && lastTop[0] === st.active && lastTop[1] !== n) { FX.countUp(el, lastTop[1], n, 700, (v) => `${pl.avatar} ${v}`); FX.pulse($('#btn-points'), 'bump', 700); }
    else el.textContent = `${pl.avatar} ${n}`;
    lastTop = [st.active, n];
    const badge = $('#nav-quests-badge');
    if (badge) { const n = isParentDevice() ? pendingAll(st).length : 0; badge.textContent = n ? String(n) : ''; badge.classList.toggle('hidden', !n); }
  }

  /* ---------------------------------------------------------------- party (fx.js draws it; kinds: quest food wait badge stamp ok level) */
  function celebrate(emoji, big, small, player, kind, points, extra) {
    FX.celebrate(Object.assign({ emoji, big, small, who: label(player), kind: kind || 'quest', points: points || 0 }, extra || {}));
  }

  return { QUESTS, CITY_EMOJI, CITY_KEY, CITIES, dayCity, daysBetween, state, label, setActive, complete, undo, addFood, approve, approveAll, summary, badges,
    checkNewBadges, renderQuests, renderPassport, settingsCard, wireSettings, refreshTop, celebrate, reset, startSync, mergeRemote, mine,
    role, setRole, isParentDevice, pendingAll, view, points };
})();
