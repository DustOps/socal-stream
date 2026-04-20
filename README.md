# SoCal Stream

A community-curated guide to events across Southern California — concerts, festivals, sports, fairs, markets, conventions, and arts. Every listing includes venue info, parking guidance, accessibility notes, public transit, and ticket links where available.

Events are sourced two ways:

1. **Auto-discovery** — an n8n workflow pulls new events every 6 hours from Ticketmaster, Eventbrite (per-organizer), and curated venue pages, then queues them for review in Zoho Creator.
2. **Manual entry** — anything the APIs miss can be added by hand directly in Zoho Creator and goes live on the next publish.

Approved events publish to the static site automatically.

---

## Current status

| Area                                  | Status                            |
| ------------------------------------- | --------------------------------- |
| Static frontend (site UI)             | ✅ Built — listings, posters, calendar, map, detail pages |
| Event detail pages                    | ✅ Built                          |
| Get Directions / Tickets from cards   | ✅ Built                          |
| Seed data (`data/events.json`)        | ✅ 8 seed events for visual test  |
| Backend pipeline spec (`WORKFLOW.md`) | ✅ Fully designed                 |
| GitHub repo                           | ⏳ Not yet set up                 |
| Netlify deploy                        | ⏳ Not yet set up                 |
| Zoho Creator forms                    | ⏳ Not yet built                  |
| n8n instance                          | ⏳ Not yet deployed               |
| Ratings + login (Phase 2)             | 📋 On the roadmap, not designed  |

---

## Stack (lean build, ~$7–8/mo)

- **Frontend** — static HTML / CSS / vanilla JS. No framework, no build step. Loads data from `data/events.json`.
- **Map** — Leaflet with CARTO dark tiles (free).
- **Backend (data entry + review)** — Zoho Creator (included in existing Zoho One subscription).
- **Automation** — n8n on Railway (~$5–10/mo managed) or a DigitalOcean/Hetzner VPS ($6/mo self-managed).
- **Event discovery** — Ticketmaster Discovery API (free), Eventbrite per-organizer API (free), curated venue page scrapes via Cheerio in n8n (free).
- **Venue enrichment** — Google Places API (free under the $200/mo Maps Platform credit) + Claude Haiku 4.5 (~$1/mo) for parking/accessibility/transit, cached per venue so each venue is only enriched once.
- **Hosting** — GitHub (free) + Netlify (free tier covers bandwidth, builds, and build hooks).

Full cost breakdown: [`WORKFLOW.md` §10](WORKFLOW.md).

---

## File structure

```
Event Management/
├── index.html              Main listings page (grid / visual / calendar / map views)
├── event.html              Event detail page
├── css/
│   └── styles.css          Dark theme, coral + teal accents, all view styles
├── js/
│   ├── app.js              Main page logic: filtering, views, map, search, directions
│   └── event.js            Detail page logic: render event + embedded map
├── data/
│   └── events.json         Source data — events the site renders
├── images/                 Landscape flyers (800×500) + portrait posters (400×600) as SVG
├── README.md               This file — project overview and pointers
└── WORKFLOW.md             End-to-end n8n + Zoho Creator pipeline spec
```

---

## Running locally

No build step. Any static server will do:

```bash
# Python
python3 -m http.server 8000

# or Node
npx serve .

# or just open in a browser
open index.html
```

Then visit `http://localhost:8000`. The site reads `data/events.json` via `fetch()` — opening `index.html` directly from disk works in most browsers but some enforce CORS on `file://`, so a local server is more reliable.

---

## Data model

The site reads `data/events.json`, an array of event objects with this shape:

```json
{
  "id": "coachella-2026-w1",
  "title": "Coachella Valley Music and Arts Festival",
  "category": "Festival",
  "startDate": "2026-04-10",
  "endDate": "2026-04-12",
  "startTime": "12:00",
  "endTime": "00:00",
  "venue": "Empire Polo Club",
  "address": "81-800 Avenue 51",
  "city": "Indio",
  "state": "CA",
  "zip": "92201",
  "coords": { "lat": 33.6803, "lng": -116.2376 },
  "flyer": "images/coachella.svg",
  "poster": "images/coachella-poster.svg",
  "shortDescription": "…",
  "description": "…",
  "price": { "from": 549, "currency": "USD", "label": "GA weekend pass" },
  "ticketUrl": "https://…",
  "ageRestriction": "All ages",
  "parking":       { "onSite": true,  "notes": "…", "accessibleParking": "…" },
  "accessibility": { "ada": true,     "notes": "…", "serviceAnimals": true },
  "transit":  "…",
  "organizer": "Goldenvoice"
}
```

When the n8n Publish workflow runs, it reads approved records out of Zoho Creator (joining Events to the Venues cache for parking/accessibility/transit) and writes a new `events.json` in the same shape. See [`WORKFLOW.md` §6](WORKFLOW.md) for the transform code.

---

## Deployment plan

End-to-end pipeline design lives in [`WORKFLOW.md`](WORKFLOW.md). Build order (from WORKFLOW §9):

1. **Week 1** — Stand up n8n host, Zoho Creator schema, Publish workflow. Verify manual entry → live site.
2. **Week 2** — Add Ticketmaster discovery branch only. Tune category mapping.
3. **Week 3** — Add Eventbrite per-organizer. Add venue enrichment cache + Claude/Google Places.
4. **Week 4** — Add 3–6 venue scrapes. Build review dashboard in Zoho. Add Slack notifications.

---

## Roadmap

**Phase 2 — user accounts + ratings.** Promoters and event-goers log in, rate events they've attended, view overall event/promoter ratings. Three candidate architectures are captured in the auto-memory notes; not yet designed. Requires backend decisions that the current static-site model can't support alone (options: Zoho Creator portal users, Supabase, or a full Next.js rewrite).

**Phase 3 — beyond.** Saved events, follow-promoter notifications, push reminders, in-app ticket purchase referrals.

---

## Credits & attribution

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) via [CARTO](https://carto.com/attributions).
- Event data sourced from Ticketmaster Discovery API, Eventbrite, and official venue pages (see `Source` field on each event).
