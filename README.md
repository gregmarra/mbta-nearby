# MBTA Nearby

A web app that shows live arrival predictions for the three nearest MBTA stops. Built for [Meta Ray-Ban Display glasses](https://wearables.developer.meta.com/docs/develop/webapps) (600×600 additive display, directional input) and runs equally well in any modern browser.

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
- Browser-managed directional navigation over native `<button>` rows, with a cyan focus ring
- Station detail screen: activate any route row to see every route at that stop with full alert text; the back gesture returns home with focus and scroll restored (history-backed, one level deep)

## Controls

| Input | Action |
|---|---|
| Directional input, ↑ / ↓, Tab | Move between prediction rows and buttons |
| Enter / Space | Open the focused station's detail screen, or activate a button (e.g. refresh) |
| Back gesture | Return from the detail screen to the station list. The shell calls `history.back()` itself |
| ‹ button | The same, by hand, on the detail screen |

On the detail screen the list is read-only, so the scroll region itself takes focus and directional input scrolls it.

On the glasses the browser moves focus; the app has no say in it. Plain desktop Chrome has no spatial navigation, so a fallback in `app.js` covers arrow keys there — it watches the first arrow press to see whether the browser moved focus on its own, and unbinds itself for the session if it did. Tab works everywhere regardless. For a closer desktop approximation, the [Display Simulator](https://chromewebstore.google.com/detail/meta-ray-ban-display-simu/jpjlmmodokemlepklkdbimceggpbjcll) extension adds the 600×600 viewport and the additive-display treatment.

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
├── app.js                  Navigation, API layer, focus restore, refresh logic
├── manifest.webmanifest    Web App Manifest
├── sw.js                   Service worker: app-shell precache for offline mode
└── favicon.png             MBTA T logo (128×128, geometry from the official SVG)
```

## Built against the Web Apps build guide

Follows the [current build guide](https://wearables.developer.meta.com/docs/develop/webapps/build/overview/) and the four-file scaffold from [`facebook/meta-wearables-webapp`](https://github.com/facebook/meta-wearables-webapp): the `data-action` dispatch, the design tokens (`--bg-primary`, `--accent-primary`, `--focus-ring`), and the typography / spacing scale (28/22/16/14/12 px, 88 px primary buttons, 8 px safe margin, cyan focus glow).

Two of those conventions have since changed, and this app follows the newer guidance:

- **The browser owns input.** Interactive rows are native `<button>` elements, and the browser spatially navigates and activates them. Per [Input and navigation](https://wearables.developer.meta.com/docs/develop/webapps/build/input-and-navigation/), wearable directional input "is not a page-level `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, or `Enter` key-event contract", and a global arrow-key listener with a manual focus index plus a synthesized click "compete with browser navigation … and can activate a control twice". So activation is left entirely native, Back belongs to the shell, and the arrow-key fallback exists only for browsers that don't spatially navigate: it never calls `preventDefault()` until it has established that nothing else handles the key, never synthesizes a click, and removes itself once it sees the browser move focus.
- **Responsive layout.** 600×600 is a validation target, not a layout size. Per [Display and layout](https://wearables.developer.meta.com/docs/develop/webapps/build/display-and-layout/), the page uses `width=device-width`, derives its height from the viewport, and keeps one scroll owner per axis rather than pinning `600px` and hiding overflow.

An earlier version of this app followed <https://wearables.developer.meta.com/docs/develop/webapps/build/>, a still-live older single-page guide that teaches the fixed-viewport and custom-focus-manager patterns the pages above now contradict.

`.mcp.json` registers Meta's Wearables MCP endpoint (`https://mcp.developer.meta.com/wearables`, tools `search_webapps_docs` and `search_dat_docs`) so Claude Code sessions in this repo can look up current platform docs.

## Deploy to glasses

Bump `CACHE_NAME` in `sw.js` when you deploy so stale shell caches are purged (shell files are also served stale-while-revalidate, so the load after next picks up changes regardless).

Host these files at any public HTTPS endpoint (Vercel, Netlify, Cloudflare Pages, GitHub Pages...). Then in the Meta AI app: **Devices → Display Glasses → App connections → Web apps → Add a web app**.

## Data sources

- [MBTA v3 API](https://api-v3.mbta.com/) for stops and predictions (no key required)
- [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) for reverse geocoding
