# World Adventure: starter and handover guide

This branch (`starter`) is the family-trip app with a made-up template trip in place of the family's own, plus a tool for
making your own trip files. It is meant to be forked and taken over. Nothing on it is deployed from this repository:
GitHub Pages here publishes `main`, which is the family's live app.

The app is a static, offline-first web app: plain JavaScript, no framework, no build step, no server of its own. It runs
from any static host and installs to a phone's home screen.

## 1. Get it running

1. **Fork the repository.** On the fork dialog, untick "Copy the `main` branch only", or you will not get `starter`.
2. **Publish it.** In your fork: Settings → Pages → Deploy from a branch → `starter`, folder `/ (root)`. The `.nojekyll`
   file is already there. (Or make `starter` your default branch and delete `main` in your fork; `main` carries the
   family's encrypted files, which stay locked without their passphrases.)
3. **Open it.** The template trip opens with the passphrase `starter-family`, then asks for a 4-digit PIN for that
   device. The Vault has its own passphrase, `starter-vault`.

To run it on your own machine instead, serve the folder with any static server (for example `python3 -m http.server`)
and open `http://localhost:8000/`. The service worker and the crypto calls need `localhost` or HTTPS; opening
`index.html` from the file system does not work.

Change both passphrases before anything real goes in (section 3).

## 2. What is in here

| File | What it is |
|---|---|
| `index.html`, `styles.css` | The one page and its stylesheet. `<body data-version>` is the build stamp (section 6). |
| `app.js` | Unlock flow, crypto, every trip screen (Home, Days, Moves, Stays, Taxi, SOS, Protocols, Book, Vault, Settings), the update banner, guest copies. |
| `quests.js` | Quests, points, badges, levels, device roles, and the "facts" store that everything syncs through. |
| `journal.js`, `postcard.js` | The Postcards board, the composer, and the card itself (per-place designs, stamp, print export). |
| `media.js` | Pictures: shrinking, sealing, local storage, upload and download. |
| `sync.js` | The sync client (section 5). |
| `map.js`, `globe.js`, `vendor/`, `style/`, `tiles/`, `world.tiles` | Offline map (MapLibre + PMTiles) and the globe. |
| `fx.js`, `compat.js`, `check.html` | Confetti and sounds; the old-device shim; a page that tests whether a device can run the app. |
| `sw.js`, `version.json`, `manifest.json`, `icons/`, `fonts/` | Offline cache, build label, install metadata, icons, postcard fonts (SIL OFL, see `fonts/LICENSE.txt`). |
| `family.enc`, `vault.enc` | The two sealed data files. On this branch they are built from the templates in `tools/`. |
| `tools/trip.js` | Opens and seals those files, and checks a trip file before sealing it. |
| `tools/sample-trip.json`, `tools/sample-vault.json` | The template trip and vault: every section the app reads, with made-up values. |

There is no licence file in the repository. The bundled libraries and fonts carry their own (`vendor/LICENSE-maplibre-gl.txt`,
`fonts/LICENSE.txt`); for the app itself, agree terms with its author.

## 3. Your own trip data

The app reads two sealed files next to `index.html`:

- **`family.enc`**: the trip. Opened once per device with the family passphrase; after that a 4-digit device PIN.
- **`vault.enc`**: the sensitive things (stay PINs, door codes, entry documents, insurance). Its own passphrase and PIN;
  it locks itself after five minutes and whenever the app goes to the background.

Each is a JSON document sealed with PBKDF2-SHA256 (600,000 rounds) and AES-256-GCM. The family's own files were made by
a planner and build script that are not in this repository. `tools/trip.js` replaces that step. It needs Node 16 or
newer and nothing else.

```
node tools/trip.js check  tools/sample-trip.json                   # what would the app trip over?
node tools/trip.js pack   my-trip.json  "my passphrase"  family.enc
node tools/trip.js pack   my-vault.json "vault passphrase" vault.enc
node tools/trip.js unpack family.enc    "my passphrase"  my-trip.json
node tools/trip.js newkey                                           # a picture key for trip.sync.media
```

Leave the passphrase out and it is read from the environment variable `TRIP_PASSPHRASE`, which keeps it out of your
shell history. Keep `my-trip.json` and `my-vault.json` out of the repository: they are the unsealed data.

A sensible start:

1. Copy `tools/sample-trip.json` and `tools/sample-vault.json` somewhere outside the repository and edit them.
2. Run `newkey` and put the result in `trip.sync.media`. This key seals every postcard and picture. Never change it
   once real pictures exist: nothing sealed with the old key can be read with a new one.
3. `pack` both files with your own passphrases, commit `family.enc` and `vault.enc`, bump the build stamp (section 6).

**Starting from the family's trip instead.** The family can make you a guest copy in their app (Settings → "Show the
app to a friend"). It is the same sealed format, so `node tools/trip.js unpack world-adventure-guest.txt "<the code>" trip.json`
gives you their whole trip as an editable example. A guest copy carries no sync address, no token, a picture key of its
own, and no booking references or confirmation numbers. You can also just open it in the app: "Looking around as a
guest?" on the first screen.

### The shape of a trip file

`check` enforces the parts the app uses without a guard. In outline (the template shows every field):

- **`trip`**: `start`, `end` (ISO dates); `people` (optional list of first names, see section 4); `family.mobiles`
  (`sarah`, `andy`: those two key names are fixed in `app.js`); `sync` (`media`, and optionally `url` and `token`).
- **`days[]`**: `date`, `label`, `where`, `sleep`, `plan`, and optional `travel`, `heads_up`. Plain text; `\n` makes a
  line break. The city of a day is worked out from `where` (and `sleep`): see "Names the app recognises" below.
- **`stays[]`** (at least one, in date order): `n`, `city`, `property`, `address`, `checkin_date`, `checkout_date`,
  `checkin_from`, `checkout_by`, `nights`, and optional `address_ja`, `arrive`, `leave`, `phone`, `notes`, `conf`,
  `coord {lat, lon}`, `ja_id` (the id of this stay's taxi card).
- **`moves[]`** (in order): `date`, `label`, `carrier` (required; text before `·` is the airline), `frm`, `to`,
  `depart`, `arrive` (`"15:40 +1"` means next day), `mode` (anything with train/rail/shinkansen is a train, coach/bus is
  a bus, everything else a flight), `status`, and optional `ref`, `seats`, `check`, `notes`, `bags {checked, cabin, who}`,
  `checkin {opens, closes}`.
- **`transfers[]`**: `label`, `time`, `route`, `how`, `status`. **`events[]`**: `date`, `time`, `event`, `venue`, `who`.
  **`gates[]`** (the "Before we go" list): `what`, `priority` or `status`, `label`, optional `when`, `where`, `need`.
- **`taxi_cards[]`**: `id`, `base` (lower-case city), `title_en`, `address_en`, optional `name_ja`, `address_ja`,
  `name_fr`, `coord`, `notes`. **`phrases[]`**: `id`, `lang` (`ja` or `fr`), `en`, then `ja` + `romaji` or `fr` + `say`.
  The ids `take-us-here` and `fr-take-us-here` are used on the taxi cards. **`koban[]`**: `venue_id` (a taxi card id), `note`.
- **`emergency{}`**: keyed by country code (`CA`, `US`, `JP`), each with `name`, `numbers[]`, `hospitals[]`,
  `pharmacies[]`, `health_lines[]`, `consulates[]`, `insurers[]`, `medicine[]`. Hospitals and pharmacies carry a `base`
  (lower-case city, no spaces: `newyork`, `montreal`).
- **`protocols{}`**: `lost_kid`, `kid_card`, `sick`, `call`, `disasters[]`, `pace`, `phone_stolen`. In `steps`, `{em}`
  and `{pol}` become that country's emergency and police numbers. Phone numbers in text become tap-to-call links.
- **`overlay.features[]`**: GeoJSON points for the map. `properties` needs `id`, `layer` (`stays`, `moves`, `venues`,
  `emergency`, `rally`), `name_en`, `address_en`, and `lat` and `lon` again as numbers.
- **`journal.prompts{}`**: postcard prompts by place key (`vancouver`, `tokyo`, `air`, …) plus `any`.

Two fields are put into the page as HTML without escaping, so keep them plain: `stays[].conf` and
`protocols.disasters[].icon`.

A vault file has `stay_pins[]` (`conf` matches a stay's `conf`, which shows the PIN next to that stay), `door_codes[]`,
`entry {eta[], esta[], passports}`, `policies[]`, `surprise[]`, and optional `card_lock[]`, `card_lock_note`, `overlay`.

### Names the app recognises

City names are matched as text, and only these are known: Vancouver, Whistler, Toronto, New York, Montréal (with the
accent), Tokyo, Nagoya, Brisbane, Cairns, Townsville, plus "Home" and "In the air". A day whose `where` names none of
them counts as Home; `check` tells you. `"A → B"` means the day ends in B. A `sleep` of "In the air" makes it a flight
night. In `moves`, airports are read from codes in brackets, such as `Vancouver (YVR)`.

## 4. What is written for this family and route

A different family or route means editing code as well as data. By file:

- **`quests.js`**
  - `DISPLAY` names the parents and what they are called ("Dad", "Mum"); everyone else in `trip.people` is a kid.
    `DEFAULT_AVATAR` and the fallback list in `people()` use the same first names. `GRAND` and `GRANDS` are the
    grandparents' phone.
  - `CITY_EMOJI`, `CITY_KEY`, `CITIES`, `CHAMPION_CITIES`, `AIRPORTS` and `dayCity()` are the route.
  - `QUESTS` is the full list: `{ id, e, t, pts, where, kind, daily?, auto?, write? }`, `where` being a city, `'any'` or
    `'home'`. `badges()` has several keyed to this trip's dates and cities (Christmas, New Year, border crossings).
  - `LEVELS` and `FOOD_PTS` set the scoring.
- **`app.js`**
  - `TZ`, `COUNTRY`, `EMERGENCY_NUMBER`, `POLICE_NUMBER`, `BASE_OF_CITY`, `REGION_BASES`: clocks, countries and which
    emergency entries belong to which city. Home is assumed to be in Australia (`intlNum` writes `+61`).
  - `trip.family.mobiles.sarah` / `.andy`, and the "iPhone (Sarah)" / "Android (Andy)" headings in `renderProtocols`.
  - The Vault card headed "5 January: the plan" in `renderVault`, and the city pills in `renderTaxi`.
- **`postcard.js`**: `TH` (one card design per place key), `ART` (the drawn scenes and stamps), `TO` (the default
  "Dear …" greeting), `kmFromHome`.
- **`globe.js`**: `CITY_LL` (coordinates), `AIRPORT` (codes), `HOME`.
- **`tiles/`**: the offline map packs are for this route (about 93 MB). `tiles/manifest.json` lists them: `name`,
  `title`, `file`, `bbox`, `maxzoom`, `dates` (when that pack is "today's"), `size`, `sha256`. The packs are PMTiles
  archives; the `planet` field suggests they were cut from a Protomaps build of that date (`pmtiles extract` with a
  bounding box and a maximum zoom does that). They were not made on this branch, so check a new pack against the
  style in `style/`.
  The dates in this manifest are public and unencrypted.
- **`manifest.json`, `index.html`, `icons/`**: the app's name and icon.

`tools/trip.js` mirrors the city tables for its `check`; change them there when you change them in the app.

## 5. Devices, sync and guest copies

- **Three kinds of device**, chosen on first unlock and in Settings: a parent phone (ticks for everyone, approves the
  kids' ticks), the kids' device (every tick waits for a parent), and the grandparents' phone (reads postcards, reacts,
  writes back). Becoming a parent phone asks for the device PIN.
- **Everything shared is a "fact"**: a key, a value, a timestamp and the device that wrote it. Newest per key wins.
  Keys look like `tick|<player>|<quest>|<date>`, `food|…`, `ok|<key>` (a parent's answer), `post|<id>`, `cmt|<post>|<id>`,
  `media|<id>`, `avatar|<player>`. Postcards, replies and picture records are sealed with the picture key before they
  become facts.
- **Sync is optional.** With no `trip.sync.url` and `token` in the trip file, everything stays on the device. With
  both, `sync.js` talks to a small server that is **not in this repository**. What the client expects of it:
  - `PUT {url}/r/{room}/{device}` with JSON `{ facts, role, name }`: store that device's facts.
  - `GET {url}/r/{room}?v={stamp}`: reply `{ same: true }` when nothing changed since `stamp`, otherwise
    `{ v: <new stamp>, devices: { <device>: { facts, role, name, at } } }`.
  - `PUT` and `GET {url}/m/{room}/{id}`: one sealed picture, as bytes.
  - `room` is the SHA-256 of the token, in hex. The server only ever sees sealed postcards and pictures, but quest
    ticks (names, quest ids, dates) are readable to it. Allow cross-origin requests from your site.
- **Guest copies** (Settings → "Show the app to a friend" on a parent phone): the trip without sync, sealed with a code
  of its own, handed over as a file. A guest phone has no PIN and never syncs.

## 6. Rules that will bite if ignored

- **The build stamp lives in three places and they must agree**: `<body data-version>` in `index.html`, `VERSION` in
  `sw.js`, and `version` / `label` in `version.json`. Bump all three on every change you publish. If one lags, phones
  offer the update for ever. Phones only fetch files again when `VERSION` changes.
- **Every file the app needs offline is listed in `SHELL` in `sw.js`.** A new file that is not listed will not work in
  airplane mode; a listed file that is missing makes the whole update fail.
- **Old devices are supported on purpose** (a 2019 tablet browser, a low-memory Android Go phone). In the scripts: no
  `?.`, `??`, `replaceAll`, `.at()` or look-behind regex. In the stylesheet: no flex `gap`, `inset`, `aspect-ratio`,
  `min()`/`clamp()` or `:is()` without a fallback. `compat.js` marks `<html>` with `old`, `no-gap` and `lite`, and the
  stylesheet has fallbacks under those classes.
- **Nothing the kids must not read goes in `family.enc`**, the code or the quests: it all runs on their tablet. That
  is what the Vault is for.
- **The site is public.** Anything not inside `family.enc` or `vault.enc` can be read by anyone with the address:
  the code, the quest list, the map pack list.
- **Settings → "Preview a trip day"** shows the app as it will be on any day of the trip. Use it to test.

## 7. What has and has not been tested on this branch

Checked in desktop Chrome: the template trip opens; every screen draws before the trip, on each of its days and
after it; the SOS cards and the Vault open; a postcard can be written; a guest copy from the family's build opens;
`tools/trip.js` round-trips its own files and opens a guest copy.

Not checked: real phones, the map and globe with this template (the packs are for the family's route), and sync
against a server.
