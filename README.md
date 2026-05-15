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
- `LIVE` indicator hides automatically after 3 minutes without a successful refresh
- D-pad navigation with wrap-around focus and a cyan focus ring per the glasses design system

## Controls

| Key | Action |
|---|---|
| ↑ / ↓ | Move focus between prediction rows (wraps around) |
| Enter | Activate focused button (e.g. refresh) |

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

Without `lat`/`lon`, the app requests geolocation. If denied or you're outside the MBTA service area, it falls back to a Brookline demo location.

## Project structure

```
.
├── index.html              Single-screen scaffold (home + loading/error containers)
├── styles.css              Design tokens, focus states, MBTA route styling
├── app.js                  Navigation, API layer, focus management, refresh logic
├── manifest.webmanifest    Web App Manifest
└── favicon.png             MBTA T logo (128×128, geometry from the official SVG)
```

## Built with the Meta Wearables Web App Skills

Follows the conventions from [`facebookincubator/meta-wearables-webapp`](https://github.com/facebookincubator/meta-wearables-webapp): the four-file scaffold, the `.focusable[tabindex="0"]` + `data-action` input model, the standard design tokens (`--bg-primary`, `--accent-primary`, `--focus-ring`), and the typography / spacing rules from `display-guidelines.md` (28/22/16/14/12 dp font scale, 64 dp header, 88 dp primary buttons, 8 dp safe margin, cyan focus glow).

## Deploy to glasses

Host these files at any public HTTPS endpoint (Vercel, Netlify, Cloudflare Pages, GitHub Pages...). Then in the Meta AI app: **Devices → Display Glasses → App connections → Web apps → Add a web app**.

## Data sources

- [MBTA v3 API](https://api-v3.mbta.com/) for stops and predictions (no key required)
- [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) for reverse geocoding
