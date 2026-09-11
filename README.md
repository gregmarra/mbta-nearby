# MBTA Nearby

A web app that shows live arrival predictions for the three nearest MBTA stops. Built for [Meta Ray-Ban Display glasses](https://wearables.developer.meta.com/docs/develop/webapps) (600×600 dark display, D-pad navigation) and runs equally well in any modern browser.

**Live:** <https://www.grgmrr.com/mbta-nearby/>

## Features

- Top three nearest stops by geolocation, deduplicated by name, sorted by haversine distance
- Predictions grouped by route + direction with **Next** / **Then** columns
- Time-bucket coloring: imminent (≤1 min) in red, soon (≤5 min) in amber, otherwise cyan
- Official MBTA route badge colors, with text color picked per-badge by WCAG luminance (so the yellow bus routes get black numbers instead of illegible white)
- Reverse-geocoded header (`MBTA · Neighborhood, City`) via OpenStreetMap Nominatim
- 30-second auto-refresh, paused while the tab is hidden; re-fetches stops if you've moved more than 0.03 mi
- Header pill says how old the numbers are: `LIVE` within 3 minutes of a successful refresh, `UPDATED 4m AGO` (ticking) once older than that, `OFFLINE` when there is no connection
- Offline mode: a service worker (`sw.js`) precaches the app shell, and the last successful result is snapshotted to `localStorage` so a cold or offline start renders real stops immediately instead of a spinner. Departed predictions are pruned from the snapshot.
- D-pad navigation with wrap-around focus and a cyan focus ring per the glasses design system
- Station detail screen: activate any route row to see every route at that stop with full alert text; the back gesture returns home with focus and scroll restored (history-backed, one level deep, within the shell's five-entry `pushState` limit)

## Controls

| Key | Action |
|---|---|
| ↑ / ↓ | Move focus between prediction rows (wraps around) |
| Enter | Open the focused station's detail screen, or activate a button (e.g. refresh) |
| Back gesture / Esc | Return from the detail screen to the station list |

## Run locally

Open `index.html` in any browser. No build step.

To preview without granting browser geolocation, pass a position via query string:

```
index.html?lat=42.3936414&lon=-71.1223896
```

| Param | Description |
|---|---|
| `lat` | Latitude override (skips the geolocation prompt) |
| `lon` | Longitude override |

Without `lat`/`lon`, the app requests geolocation. If permission is denied, it shows a message with a Try Again button. If the fix times out, the phone is offline, or you're outside the MBTA service area, it falls back to a Brookline demo location.

## Project structure

```
.
├── index.html              Home + station detail screens (plus loading/error containers)
├── styles.css              Design tokens, focus states, MBTA route styling
├── app.js                  Navigation, API layer, focus management, refresh logic
├── manifest.webmanifest    Web App Manifest
├── sw.js                   Service worker: app-shell precache for offline mode
└── favicon.png             MBTA T logo (128×128, geometry from the official SVG)
```

## Built with the Meta Wearables Web App Skills

Follows the conventions from [`facebook/meta-wearables-webapp`](https://github.com/facebook/meta-wearables-webapp) and the [Web Apps build guide](https://wearables.developer.meta.com/docs/develop/webapps/build): the four-file scaffold, the `.focusable[tabindex="0"]` + `data-action` input model, the standard design tokens (`--bg-primary`, `--accent-primary`, `--focus-ring`), and the typography / spacing rules from `display-guidelines.md` (28/22/16/14/12 dp font scale, 64 dp header, 88 dp primary buttons, 8 dp safe margin, cyan focus glow).

`.mcp.json` registers Meta's Wearables MCP endpoint (`https://mcp.developer.meta.com/wearables`, tool `search_webapps_docs`) so Claude Code sessions in this repo can look up current platform docs.

## Deploy to glasses

Bump `CACHE_NAME` in `sw.js` when you deploy so stale shell caches are purged (shell files are also served stale-while-revalidate, so the load after next picks up changes regardless).

Host these files at any public HTTPS endpoint (Vercel, Netlify, Cloudflare Pages, GitHub Pages...). Then in the Meta AI app: **Devices → Display Glasses → App connections → Web apps → Add a web app**.

## Data sources

- [MBTA v3 API](https://api-v3.mbta.com/) for stops and predictions (no key required)
- [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) for reverse geocoding
