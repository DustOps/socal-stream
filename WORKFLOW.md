# SoCal Stream — Zoho + n8n Workflow Spec

End-to-end pipeline for an event listings site that **automatically discovers** Southern California events from multiple sources **and** lets you add events manually. Auto-discovered events go to a **Pending Review** queue in Zoho Creator; you approve them, and approved events publish to the static site through n8n.

> **Stack: Lean build (~$8/mo).** Self-hosted n8n on a $6/mo VPS, Ticketmaster + Eventbrite + venue scrapes for discovery (Meetup skipped — its useful endpoints require Meetup Pro at $35/mo), Google Places + Claude Haiku for venue enrichment (well inside Google's $200/mo free credit, ~$1/mo Claude), GitHub + Netlify free tiers for hosting. Full breakdown in §10.

---

## TL;DR architecture

```
                           ┌──────────────────────────────┐
   Ticketmaster ────┐      │   n8n: Discovery workflows   │      ┌────────────────────────────┐
   Eventbrite   ────┼─────▶│   (cron, every 6 hours)      │─────▶│  Zoho Creator              │
   Venue scrapes────┘      │   • fetch                    │      │                            │
                           │   • dedup                    │      │  ┌──────────────────────┐  │
                           │   • enrich (venue cache)     │      │  │ Events form          │  │
                           └──────────────────────────────┘      │  │ Status:              │  │
                                                                 │  │  Pending Review ◀───┐│  │
                           Manual entry (you in Creator)         │  │  Approved          ─┼┘ │
                           ───────────────────────────────────▶  │  │  Rejected           │  │
                                                                 │  └──────────────────────┘  │
                                                                 │                            │
                                                                 │  ┌──────────────────────┐  │
                                                                 │  │ Venues form (cache)  │  │
                                                                 │  │ parking, ADA, transit│  │
                                                                 │  └──────────────────────┘  │
                                                                 └────────────┬───────────────┘
                                                                              │
                                                              webhook: on Approved or update
                                                                              ▼
                                                ┌──────────────────────────────────────┐
                                                │  n8n: Publish workflow               │
                                                │  • fetch all Approved events         │
                                                │  • transform → events.json schema    │
                                                │  • download images                   │
                                                │  • commit to GitHub repo             │
                                                │  • trigger Netlify build hook        │
                                                └──────────────────┬───────────────────┘
                                                                   ▼
                                                            Public site
```

There are **two write paths into Zoho** (auto-discovery + manual) and **one publish path out** to the site.

---

## 1. Why Zoho Creator (vs. Sheet or CRM)

| Need                                | Creator | Sheet  | CRM   |
| ----------------------------------- | ------- | ------ | ----- |
| Real REST API                       | ✅      | Limited| ✅    |
| Webhook on record create/update     | ✅      | ❌     | ✅    |
| Built-in admin form (no-code edits) | ✅      | ✅     | ✅    |
| File upload (event flyers)          | ✅      | ❌     | ✅    |
| Custom views/dashboards (review queue) | ✅   | ⚠️     | ✅    |
| Cost (within Zoho One)              | Included| Included | Included |

**Zoho Creator** wins because the review queue UI and venue enrichment cache are essentially mini-apps that Creator was built for.

---

## 2. Zoho Creator setup

### 2.1 Application

Create an application: **SoCal Stream**. Add two forms.

### 2.2 Form A — `Events`

| Field                | Type                                  | Notes                                                            |
| -------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `Event_ID`           | Single line, **unique**               | Slug like `coachella-2026-w1`. Auto-generated for discovered events as `{source}-{externalId}`. |
| `Status`             | Dropdown                              | **Pending Review** / **Approved** / **Rejected**. Default: Pending Review. |
| `Source`             | Dropdown                              | Manual / Ticketmaster / Eventbrite / RSS:{venueSlug}             |
| `External_ID`        | Single line                           | The source's ID (e.g. Ticketmaster event id). Used for dedup.    |
| `Title`              | Single line                           |                                                                  |
| `Category`           | Dropdown                              | Festival / Concert / Sports / Fair / Arts / Market / Convention  |
| `Start_Date`         | Date                                  |                                                                  |
| `End_Date`           | Date                                  |                                                                  |
| `Start_Time`         | Time                                  |                                                                  |
| `End_Time`           | Time                                  |                                                                  |
| `Venue` (Lookup)     | **Lookup → Venues form**              | Pulls parking/accessibility/transit from cache                   |
| `Venue_Name`         | Single line                           | Denormalized so we can dedup before the venue exists in cache    |
| `Address`            | Single line                           |                                                                  |
| `City`               | Single line                           |                                                                  |
| `State`              | Single line, default `CA`             |                                                                  |
| `Zip`                | Single line                           |                                                                  |
| `Latitude`           | Decimal                               | Geocoded if blank                                                |
| `Longitude`          | Decimal                               |                                                                  |
| `Flyer`              | File upload (image)                   | Landscape; auto-pulled from source if available                  |
| `Poster`             | File upload (image)                   | Portrait; auto-generated if missing                              |
| `Flyer_URL`          | URL                                   | Discovery sources usually give you a remote URL — store both     |
| `Short_Description`  | Multi-line, ≤ 200 chars               |                                                                  |
| `Description`        | Multi-line                            |                                                                  |
| `Price_From`         | Currency                              | Blank = FREE                                                     |
| `Price_Label`        | Single line                           |                                                                  |
| `Ticket_URL`         | URL                                   |                                                                  |
| `Age_Restriction`    | Single line                           |                                                                  |
| `Organizer`          | Single line                           |                                                                  |
| `Dedup_Hash`         | Single line, **unique**               | SHA1 of `lower(title) + start_date + lower(venue_name)`          |
| `Discovered_At`      | Date-time                             | Auto-stamped on insert                                           |
| `Last_Updated_At`    | Date-time                             | Auto on edit                                                     |
| `Approval_Notes`     | Multi-line                            | Optional reviewer note                                           |

### 2.3 Form B — `Venues` (enrichment cache)

The hard part of automation isn't finding events — it's enriching them with parking/accessibility/transit info, which the source APIs almost never include. Cache that work per venue.

| Field                  | Type                | Notes                                                   |
| ---------------------- | ------------------- | ------------------------------------------------------- |
| `Venue_Name`           | Single line, unique |                                                         |
| `Address`              | Single line         |                                                         |
| `City`                 | Single line         |                                                         |
| `Latitude` / `Longitude` | Decimal           |                                                         |
| `Parking_OnSite`       | Decision box        |                                                         |
| `Parking_Notes`        | Multi-line          |                                                         |
| `Parking_Accessible`   | Multi-line          |                                                         |
| `ADA_Accessible`       | Decision box        |                                                         |
| `Accessibility_Notes`  | Multi-line          |                                                         |
| `Service_Animals`      | Decision box        |                                                         |
| `Transit`              | Multi-line          |                                                         |
| `Enriched_By`          | Dropdown            | Manual / GooglePlaces / LLM:Claude                      |
| `Enriched_At`          | Date-time           |                                                         |
| `Confidence`           | Decimal 0–1         | Lower for AI-inferred, 1.0 for hand-verified            |

When the publish workflow renders an event, it joins to this Venues record for the parking/accessibility fields. **One enrichment run per venue, then it's reused forever.**

### 2.4 API access (one-time)

1. Zoho Creator → **Settings → Developer → API**.
2. Generate an **OAuth client**: save **Client ID**, **Client Secret**.
3. Generate a **refresh token** with scope `ZohoCreator.report.READ ZohoCreator.form.CREATE ZohoCreator.report.UPDATE`.
4. Note the API base: `https://creator.zoho.com/api/v2/{owner}/socal-stream`
5. Store the three values in n8n credentials as **Zoho Creator OAuth**.

---

## 3. Discovery workflow (n8n)

This is the **autonomous** half: a scheduled n8n workflow that pulls events from each source, deduplicates, enriches, and writes new records to Creator with `Status = Pending Review`.

### 3.1 Schedule

- **Schedule Trigger**: every 6 hours.
- Each run iterates through all three source branches in parallel.

> **Lean build note:** Meetup is intentionally excluded — their event search beyond your own groups requires a Meetup Pro subscription ($35/mo), which more than 4× the rest of the stack combined. Coverage gap is mostly community/social meetups, which the venue scrapes + Eventbrite cover for the higher-traffic items.

### 3.2 Branch A — Ticketmaster Discovery API

- **HTTP Request** node.
- Method: `GET`
- URL: `https://app.ticketmaster.com/discovery/v2/events.json`
- Query params:
  - `apikey={{ $credentials.ticketmasterKey }}`
  - `latlong=34.0522,-118.2437` (downtown LA)
  - `radius=120`
  - `unit=miles`
  - `size=200`
  - `startDateTime={{ new Date().toISOString().split('.')[0] + 'Z' }}`
  - `sort=date,asc`
- Free key: 5000 calls/day, 5/sec — well within budget at every-6-hours.
- Map each `_embedded.events[*]` to the canonical schema:

```javascript
// Code node — Ticketmaster transform
const tmEvents = $input.first().json._embedded?.events || [];
return tmEvents.map(e => ({
  json: {
    External_ID: e.id,
    Source: 'Ticketmaster',
    Title: e.name,
    Category: mapTmClassification(e.classifications?.[0]),
    Start_Date: e.dates.start.localDate,
    End_Date: e.dates.end?.localDate || e.dates.start.localDate,
    Start_Time: e.dates.start.localTime || null,
    Venue_Name: e._embedded?.venues?.[0]?.name,
    Address: e._embedded?.venues?.[0]?.address?.line1,
    City: e._embedded?.venues?.[0]?.city?.name,
    State: e._embedded?.venues?.[0]?.state?.stateCode || 'CA',
    Zip: e._embedded?.venues?.[0]?.postalCode,
    Latitude: parseFloat(e._embedded?.venues?.[0]?.location?.latitude),
    Longitude: parseFloat(e._embedded?.venues?.[0]?.location?.longitude),
    Flyer_URL: pickBestImage(e.images),
    Description: e.info || e.pleaseNote || '',
    Short_Description: (e.info || '').slice(0, 180),
    Price_From: e.priceRanges?.[0]?.min,
    Price_Label: e.priceRanges?.[0] ? `${e.priceRanges[0].type} (${e.priceRanges[0].currency})` : null,
    Ticket_URL: e.url,
    Age_Restriction: e.ageRestrictions?.legalAgeEnforced ? '21+' : 'All ages',
    Organizer: e.promoter?.name
  }
}));

function mapTmClassification(c) {
  const seg = c?.segment?.name?.toLowerCase() || '';
  if (seg.includes('music')) return 'Concert';
  if (seg.includes('sports')) return 'Sports';
  if (seg.includes('arts')) return 'Arts';
  if (seg.includes('film') || seg.includes('miscellaneous')) return 'Festival';
  return 'Concert';
}
function pickBestImage(images) {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (b.width * b.height) - (a.width * a.height));
  return sorted[0].url;
}
```

### 3.3 Branch B — Eventbrite

**Important caveat**: Eventbrite deprecated their public search API in 2019. Two practical workarounds:

1. **Per-organizer fetch** — list the organizer IDs of major SoCal promoters (Goldenvoice, Live Nation LA, OC Fair, Festival of Arts, etc.) in an n8n config, and call `GET https://www.eventbriteapi.com/v3/organizations/{org_id}/events/?status=live` for each.
2. **Eventbrite RSS/HTML scrape** — the public city pages (`https://www.eventbrite.com/d/ca--los-angeles/all-events/`) render server-side; use the **HTML Extract** node + `Cheerio` to pull listings.

Recommend starting with workaround #1 (cleaner JSON, no scraping). The transform mirrors Ticketmaster — see field mapping in Appendix A.

### 3.4 Branch C — Curated venue RSS / scrape

Maintain a small list of high-quality SoCal venues to scrape directly. Examples:

| Venue                     | URL pattern                                           | Strategy                          |
| ------------------------- | ----------------------------------------------------- | --------------------------------- |
| Hollywood Bowl            | `https://www.hollywoodbowl.com/events/calendar`       | HTML Extract (Cheerio)            |
| The Greek Theatre         | `https://www.lagreektheatre.com/events`               | HTML Extract                      |
| Honda Center (Anaheim)    | `https://www.hondacenter.com/events/`                 | HTML Extract                      |
| Pechanga Arena (SD)       | `https://www.pechangaarenasd.com/events`              | HTML Extract                      |
| Rose Bowl Stadium         | `https://www.rosebowlstadium.com/events/all-events`   | HTML Extract                      |
| OC Fair & Event Center    | `https://ocfair.com/events`                           | HTML Extract                      |
| Goldenvoice (festivals)   | RSS / Eventbrite organizer feed                       | HTTP                              |

In n8n: a single workflow with one **SplitInBatches** loop over the venue config, each iteration runs HTTP Request → HTML Extract → field mapping. Set Source to `RSS:hollywood-bowl` etc. Per the user's earlier choice, these still go to **Pending Review** (the trusted-bypass option wasn't selected).

### 3.5 Dedup (after the three branches merge)

A **Merge** node combines all source outputs. Then:

```javascript
// Code node — Compute Dedup_Hash
const crypto = require('crypto');
return $input.all().map(item => {
  const e = item.json;
  const hashInput = `${(e.Title || '').toLowerCase().trim()}|${e.Start_Date}|${(e.Venue_Name || '').toLowerCase().trim()}`;
  e.Dedup_Hash = crypto.createHash('sha1').update(hashInput).digest('hex');
  return { json: e };
});
```

Then call **Zoho Creator → Search by criteria** with `Dedup_Hash == "{{$json.Dedup_Hash}}"`. If a record exists, **skip** (or update if `Last_Updated_At` is older than 24h). If not, continue.

### 3.6 Venue enrichment

For each new event:

1. **Lookup venue in Zoho `Venues` form** by `Venue_Name`.
2. If found → set the `Venue` lookup on the event record. Done.
3. If not found → trigger enrichment:
   - **HTTP Request → Google Places API**: `findplacefromtext` for `Venue_Name + ', ' + City`. Pull `wheelchair_accessible_entrance`, `formatted_address`, `geometry`.
   - **HTTP Request → Anthropic Claude API** (or OpenAI) with this prompt:

     > "You are summarizing public-knowledge venue logistics. For the venue '{Venue_Name}' at {Address}, {City}, CA, return JSON with these keys: parking_onsite (bool), parking_notes (string ≤300 chars), parking_accessible (string ≤200 chars), ada_accessible (bool), accessibility_notes (string ≤300 chars), transit (string ≤300 chars). If unknown for any key, return null. Cite no opinions, only widely published facts."

   - Combine API results, write a new record to the `Venues` form with `Confidence = 0.7`, `Enriched_By = LLM:Claude`.
   - Link the event to the new venue record.

**The cache wins on volume**: the Hollywood Bowl appears in dozens of events, but you only enrich it once.

### 3.7 Geocoding (fallback)

If `Latitude/Longitude` are still blank after source + venue lookup, hit Nominatim (`https://nominatim.openstreetmap.org/search?...`) — 1 req/sec, requires a `User-Agent` header. Free, fits the lean budget. Upgrade to Mapbox/Google Geocoding only if volume ever forces it.

### 3.8 Insert into Zoho

- **Zoho Creator** node → Operation: Create Record → Form: `Events`.
- Field defaults:
  - `Status` = `Pending Review`
  - `Discovered_At` = `{{ $now.toISO() }}`

### 3.9 Image handling for discovered events

Discovery sources give you image URLs, not files. Two-stage approach:

- **Now**: store the URL in `Flyer_URL`. Site loads it directly. Cheap, fast, no download step.
- **On approval** (in the Publish workflow): download the image, upload to Zoho `Flyer` field, commit to GitHub `images/{Event_ID}-flyer.jpg`. This protects you from third-party image links breaking.

For posters (portrait 2:3): generate one on the fly from the flyer using a simple "blur background + centered title" technique. n8n can call an image-generation service (Bannerbear, Cloudinary transformation, or a custom small Node service) — or skip it entirely and just use the flyer everywhere.

### 3.10 Notifications

End the discovery workflow with a **Slack** node that posts:

> 🔍 Discovery run complete · 21 new events queued for review (TM:14, EB:6, RSS:1) · 4 duplicates skipped · 2 venue enrichments performed.

---

## 4. Manual entry workflow

For events you want to add by hand (e.g. a friend's gallery opening that none of the APIs know about):

1. Open Zoho Creator → SoCal Stream → **+ Add Event**.
2. Fill in the form. Set `Source = Manual`.
3. Set `Status = Approved` directly (skip the review queue).
4. Save → Creator's onUpdate webhook fires → Publish workflow rebuilds the site.

That's the entire manual path. Same form, same fields, just bypasses Pending Review.

---

## 5. Review queue (Zoho Creator dashboard)

Build a simple **Page** in Creator (Pages → Add):

- **Pending list** — Report on `Events` filtered by `Status == Pending Review`, sorted by `Discovered_At desc`.
- Columns: Title, Category, Start_Date, Venue_Name, Source, Flyer_URL (rendered as thumbnail).
- Two action buttons per row:
  - ✅ **Approve** → updates `Status = Approved`. Triggers the Publish workflow webhook.
  - ❌ **Reject** → updates `Status = Rejected`. No publish.
- A **Bulk Approve** button at the top for trusted batches.

Time-to-approve target: ~30 seconds per event once you scan the title and image.

---

## 6. Publish workflow (n8n)

This runs whenever a record's `Status` becomes `Approved` (manual or via discovery → review). It's a slim version of the v1 design.

### 6.1 Trigger

- **Webhook** at `/socal-stream-publish`.
- Zoho Creator workflow on Events form: **On Update where Status == Approved** → POST to that URL.

### 6.2 Steps

1. **HTTP Request → Get OAuth token** (Zoho refresh token grant).
2. **HTTP Request → Fetch all Approved events**:
   - `GET https://creator.zoho.com/api/v2/{owner}/socal-stream/report/All_Events?criteria=Status=="Approved"&max_records=500`
3. **HTTP Request → Fetch all Venues** (for the join):
   - `GET .../report/All_Venues?max_records=500`
4. **Code node → Transform** to `events.json` schema. Joins each event to its venue record for parking/accessibility/transit:

```javascript
const events = $node['Fetch Approved'].json.data;
const venuesById = Object.fromEntries(
  $node['Fetch Venues'].json.data.map(v => [v.ID, v])
);
const out = events.map(z => {
  const v = z.Venue ? venuesById[z.Venue] : null;
  return {
    id: z.Event_ID,
    title: z.Title,
    category: z.Category,
    startDate: z.Start_Date,
    endDate: z.End_Date,
    startTime: z.Start_Time,
    endTime: z.End_Time,
    venue: z.Venue_Name,
    address: z.Address,
    city: z.City,
    state: z.State || 'CA',
    zip: z.Zip,
    coords: (z.Latitude && z.Longitude)
      ? { lat: parseFloat(z.Latitude), lng: parseFloat(z.Longitude) }
      : null,
    flyer:  z.Flyer  ? `images/${z.Event_ID}-flyer.jpg`  : (z.Flyer_URL || null),
    poster: z.Poster ? `images/${z.Event_ID}-poster.jpg` : null,
    shortDescription: z.Short_Description,
    description: z.Description,
    price: z.Price_From ? { from: parseFloat(z.Price_From), currency: 'USD', label: z.Price_Label || '' } : null,
    ticketUrl: z.Ticket_URL,
    ageRestriction: z.Age_Restriction,
    parking: v ? {
      onSite: !!v.Parking_OnSite,
      notes: v.Parking_Notes || '',
      accessibleParking: v.Parking_Accessible || ''
    } : { onSite: false, notes: '', accessibleParking: '' },
    accessibility: v ? {
      ada: !!v.ADA_Accessible,
      notes: v.Accessibility_Notes || '',
      serviceAnimals: !!v.Service_Animals
    } : { ada: false, notes: 'Please contact the venue for accessibility details.', serviceAnimals: false },
    transit: v?.Transit || '',
    organizer: z.Organizer || ''
  };
}).sort((a, b) => a.startDate.localeCompare(b.startDate));
return [{ json: { events: out } }];
```

5. **Loop → Download images** for any event whose `Flyer` is still a remote URL (newly approved discovery events). Upload to Zoho `Flyer` field; this also gives the GitHub commit a stable filename.
6. **GitHub** node → Commit `data/events.json` and any new image files to the site repo.
7. **HTTP Request** → Netlify build hook.
8. **Slack** notification on success/failure.

---

## 7. Hosting recommendation

| Option              | Free tier     | Build hooks | Image hosting       | Best for                                           |
| ------------------- | ------------- | ----------- | ------------------- | -------------------------------------------------- |
| **Netlify**         | 100GB BW/mo   | ✅          | Native              | Recommended — easiest n8n integration              |
| **Cloudflare Pages**| Unlimited BW  | ✅          | Native              | Best perf if you expect high traffic               |
| **GitHub Pages**    | Unlimited BW  | Auto on push| Native              | Simplest if you already use GitHub                 |

**Recommended**: GitHub repo + Netlify with a build hook that n8n triggers. ~30s deploy time.

---

## 8. Day-to-day operation

**Autonomous (no action needed)**: Every 6 hours the discovery workflow pulls Ticketmaster + Eventbrite + venue scrapes, dedupes, enriches venues, and parks new events as Pending Review.

**Once a day, ~5 minutes**: Open the Zoho Creator review dashboard, scan the queue, click ✅ on the keepers and ❌ on the duplicates/junk. Approved events flow through Publish and appear on the site within ~45 seconds.

**Anytime**: Open Zoho Creator → Add Event → fill in the form with `Status = Approved`. Skips the queue, hits the site directly.

**Quarterly**: Review the Venues form. Hand-correct any AI-enriched parking/accessibility entries that you've personally been to and know better.

---

## 9. Build order (recommended sequence)

1. **Week 1** — Spin up the n8n VPS (DigitalOcean / Hetzner $6/mo). Stand up Zoho Creator schema (Events + Venues forms). Build the Publish n8n workflow first (this is what the site needs). Verify by adding 2–3 events manually and seeing them land on the site.
2. **Week 2** — Add the Ticketmaster discovery branch only. Inspect the Pending Review queue, hand-tune the Category mapping.
3. **Week 3** — Add Eventbrite (per-organizer). Add the venue enrichment cache + Claude/Places integration.
4. **Week 4** — Add the first 3–6 venue scrapes (Hollywood Bowl, Honda Center, Rose Bowl, OC Fair…). Build the review dashboard. Add Slack notifications.

Don't try to wire all three sources at once — each has its own auth quirks.

---

## Appendix A — Field mapping (consolidated)

```
Source field           → Canonical (Zoho)         → events.json
─────────────────────────────────────────────────────────────────
TM e.id                → External_ID              →  (used as id prefix)
TM e.name              → Title                    →  title
TM e.classifications   → Category (mapped)        →  category
TM e.dates.start.local → Start_Date / Start_Time  →  startDate / startTime
TM venues[0].name      → Venue_Name               →  venue
TM venues[0].address   → Address / City / State   →  address / city / state
TM venues[0].location  → Latitude / Longitude     →  coords
TM e.images[0]         → Flyer_URL                →  flyer
TM e.priceRanges[0]    → Price_From / Price_Label →  price.from / price.label
TM e.url               → Ticket_URL               →  ticketUrl
Venues form (joined)   → Parking_* / ADA_* / Transit → parking / accessibility / transit
```

Eventbrite, Meetup, and RSS sources fill the same canonical fields with the same downstream behavior.

---

## Appendix B — n8n credentials checklist

- [ ] Zoho Creator OAuth (refresh token + client id + client secret, scopes above)
- [ ] Ticketmaster Discovery API key (free)
- [ ] Eventbrite OAuth token (per-organizer mode, free)
- [ ] Google Places API key (free under $200/mo Maps Platform credit)
- [ ] Anthropic API key (Claude Haiku 4.5 — ~$1/mo at expected volume) **or** OpenAI key
- [ ] GitHub fine-grained PAT (Contents: Read & Write, scoped to site repo, free)
- [ ] Netlify build hook URL (no auth, just the URL — free tier)
- [ ] Slack incoming webhook URL (or bot token, free)

---

## 10. Stack & monthly cost (lean build)

| Component                       | Cost                            | Notes                                                    |
| ------------------------------- | ------------------------------- | -------------------------------------------------------- |
| n8n (self-hosted on VPS)        | **~$6/mo**                      | DigitalOcean or Hetzner 1 vCPU / 2 GB droplet            |
| Ticketmaster Discovery API      | $0                              | 5k req/day free tier, attribution                        |
| Eventbrite API (per-organizer)  | $0                              | Public search deprecated; curated organizer list         |
| Venue scrapes (Cheerio in n8n)  | $0                              | Time cost only                                           |
| Google Places API (enrichment)  | $0                              | Inside $200/mo Maps Platform credit                      |
| Claude Haiku 4.5 (enrichment)   | **~$1/mo**                      | ~$0.005/venue, one-time per venue (cache)                |
| Nominatim geocode fallback      | $0                              | 1 req/sec, free w/ User-Agent                            |
| GitHub (private repo + PAT)     | $0                              | Free tier fine                                           |
| Netlify (hosting + build hook)  | $0                              | 100 GB BW, 300 build min/mo free                         |
| Leaflet + CARTO dark tiles      | $0                              | Free with attribution                                    |
| Slack webhook                   | $0                              | Already have Slack                                       |
| **Total**                       | **~$7–8/mo**                    |                                                          |

**Explicitly excluded from the lean build:**
- **Meetup Pro** ($35/mo) — not worth 4× the stack cost for the marginal coverage. Revisit only if venue scrapes + Eventbrite miss something important.
- **n8n Cloud** ($24–50/mo) — self-hosted gives full control and it's cheaper.
- **Paid geocoding** (Mapbox, Google Geocoding) — Places API already returns coords for enriched venues; Nominatim handles the rest.

**Scaling trigger points** (when the lean build stops being lean):
- Traffic exceeds 100 GB/mo → upgrade to Netlify Pro ($19/mo) or move to Cloudflare Pages (unlimited BW, still free).
- Venue enrichment exceeds ~10k places/mo → Google Places starts billing beyond the free credit. Unlikely in year one.
- You start adding events manually more than ~20×/week → consider adding a mobile-friendly quick-add form in Creator (still free, just UX work).

---

## Appendix C — What the site already expects

The site has been written and tested against this exact `events.json` shape — no code changes needed when this pipeline goes live:

```json
{
  "id": "string",
  "title": "string",
  "category": "Festival | Concert | Sports | Fair | Arts | Market | Convention",
  "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD",
  "startTime": "HH:MM", "endTime": "HH:MM",
  "venue": "string", "address": "string", "city": "string", "state": "CA", "zip": "string",
  "coords": { "lat": 0, "lng": 0 },
  "flyer": "url-or-relative-path",
  "poster": "url-or-relative-path",
  "shortDescription": "string", "description": "string",
  "price": { "from": 0, "currency": "USD", "label": "string" },
  "ticketUrl": "url",
  "ageRestriction": "string",
  "parking":       { "onSite": false, "notes": "string", "accessibleParking": "string" },
  "accessibility": { "ada": false,    "notes": "string", "serviceAnimals": false },
  "transit": "string",
  "organizer": "string"
}
```
