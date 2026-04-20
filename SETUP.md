# SoCal Stream — Setup Guide

Complete setup sequence for the lean stack (~$7–8/mo). Follow in order — each phase builds on the previous one.

---

## Phase 0 — Prerequisites (do this first)

Gather all API keys and accounts before touching infrastructure. Everything here is free.

### 0.1 Accounts to have ready

- [ ] **Zoho One** account (you already have this — Creator is included)
- [ ] **GitHub** account (free)
- [ ] **Netlify** account (free) — sign up at netlify.com
- [ ] **DigitalOcean** or **Hetzner** account (for the VPS)
- [ ] **Slack** workspace (for n8n notifications — already have this)

### 0.2 API keys to obtain

| Service | Where to get it | Cost |
|---|---|---|
| **Ticketmaster Discovery API** | [developer.ticketmaster.com](https://developer.ticketmaster.com) → My Apps → Add New App | Free (5k req/day) |
| **Google Maps Platform** | [console.cloud.google.com](https://console.cloud.google.com) → Enable Maps API + Places API → Create API key | Free under $200/mo credit |
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) → API Keys | ~$1/mo at expected volume |
| **Eventbrite API token** | [eventbrite.com/platform](https://www.eventbrite.com/platform) → Create API Key → get Private Token | Free |
| **Zoho Creator OAuth** | Zoho Creator → Settings → Developer → API → OAuth Client | Free (see §2.4) |
| **GitHub fine-grained PAT** | GitHub → Settings → Developer settings → Personal access tokens → Fine-grained | Free |
| **Slack incoming webhook** | Slack app directory → Incoming Webhooks → Add to Slack → pick channel | Free |

Store all of these somewhere safe (a local password manager) — you'll paste them into n8n in Phase 3.

---

## Phase 1 — GitHub Repository

### 1.1 Create the repo

1. Go to GitHub → **New repository**.
2. Name it `socal-stream` (or similar). Set to **Public** or **Private** — either works with Netlify free.
3. Initialize with a `README`.

### 1.2 Push the existing site files

The site frontend is already built. Copy the following into the repo root:

```
index.html
event.html
css/styles.css
js/app.js
js/event.js
data/events.json
images/          (all SVG flyers and posters)
README.md
WORKFLOW.md
```

```bash
git init
git remote add origin git@github.com:YOUR_USERNAME/socal-stream.git
git add .
git commit -m "Initial site commit"
git push -u origin main
```

### 1.3 Create a fine-grained PAT for n8n

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Scope to the `socal-stream` repo only.
3. Permissions: **Contents → Read and Write**.
4. Save the token — you'll add it to n8n in Phase 3.

---

## Phase 2 — Netlify Hosting

### 2.1 Connect repo to Netlify

1. Log in to Netlify → **Add new site → Import an existing project → GitHub**.
2. Authorize Netlify to access your GitHub account.
3. Select the `socal-stream` repo.
4. Build settings:
   - **Build command**: *(leave blank — no build step, pure static)*
   - **Publish directory**: `.` (repo root)
5. Click **Deploy site**.

### 2.2 Get the build hook URL

1. Netlify → Site → **Site configuration → Build & deploy → Build hooks**.
2. Click **Add build hook** → name it `n8n-publish` → select branch `main`.
3. Copy the hook URL — it will look like `https://api.netlify.com/build_hooks/XXXXXXXXXXX`.
4. Save this URL — n8n will POST to it to trigger deploys.

### 2.3 (Optional) Set a custom domain

Netlify → Site → **Domain management → Add domain**. Free SSL is included.

---

## Phase 3 — VPS + n8n

### 3.1 Provision the VPS

**DigitalOcean:**
1. Create Droplet → Ubuntu 22.04 → **Basic → $6/mo** (1 vCPU / 1 GB RAM).
2. Add your SSH key during setup.
3. Note the public IP address.

**Hetzner (cheaper alternative):**
1. New server → Ubuntu 22.04 → **CX11** (~€4/mo).
2. Same SSH key setup.

### 3.2 Install n8n on the VPS

SSH into the server, then run:

```bash
# Install Node (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20

# Install n8n globally
npm install -g n8n

# Install PM2 to keep n8n running
npm install -g pm2

# Start n8n
pm2 start n8n
pm2 save
pm2 startup   # follow the printed command to enable on reboot
```

### 3.3 Expose n8n with a reverse proxy (nginx + HTTPS)

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

# Replace example.com with your actual domain or subdomain
sudo nano /etc/nginx/sites-available/n8n
```

Paste this nginx config:

```nginx
server {
    listen 80;
    server_name n8n.yourdomain.com;

    location / {
        proxy_pass http://localhost:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Free SSL via Let's Encrypt
sudo certbot --nginx -d n8n.yourdomain.com
```

n8n is now accessible at `https://n8n.yourdomain.com`.

### 3.4 Initial n8n configuration

1. Open n8n in your browser → complete the owner setup (email + password).
2. Go to **Settings → n8n API** → enable if you want external access to n8n itself (optional).

### 3.5 Add all credentials in n8n

Go to **Credentials → New** for each:

| Credential name | Type | Fields |
|---|---|---|
| `Zoho Creator OAuth` | OAuth2 | Client ID, Client Secret, Refresh Token (see §2.4 of WORKFLOW.md) |
| `Ticketmaster` | Generic (HTTP Header) | `apikey` = your key |
| `Eventbrite` | Generic (HTTP Header) | `Authorization: Bearer YOUR_TOKEN` |
| `Google Places` | Generic (query param) | `key` = your API key |
| `Anthropic Claude` | HTTP Header | `x-api-key` = your Anthropic key |
| `GitHub PAT` | Generic | Bearer token = your fine-grained PAT |
| `Netlify Build Hook` | Stored URL | The Netlify hook URL from §2.2 |
| `Slack Webhook` | Generic | Incoming webhook URL |

---

## Phase 4 — Zoho Creator Schema

### 4.1 Create the application

1. Log in to Zoho Creator → **Create Application** → name it **SoCal Stream**.

### 4.2 Build the `Events` form

Add a form named `Events` with these fields (see WORKFLOW.md §2.2 for full field list):

**Key fields to configure carefully:**
- `Event_ID` — Single line, mark as **Unique**
- `Status` — Dropdown: `Pending Review` / `Approved` / `Rejected`. Default: **Pending Review**
- `Source` — Dropdown: `Manual` / `Ticketmaster` / `Eventbrite` / `RSS:{venueSlug}`
- `Venue` — **Lookup field** → points to the Venues form
- `Dedup_Hash` — Single line, mark as **Unique** (SHA1 of title + date + venue name)
- `Flyer` — File upload (image)
- `Poster` — File upload (image)

### 4.3 Build the `Venues` form

Add a form named `Venues` with these fields (see WORKFLOW.md §2.3):

- `Venue_Name` — Single line, **Unique**
- `Parking_OnSite` — Decision box (checkbox)
- `ADA_Accessible` — Decision box
- `Enriched_By` — Dropdown: `Manual` / `GooglePlaces` / `LLM:Claude`
- `Confidence` — Decimal 0–1

### 4.4 Set up Zoho API access (OAuth)

1. Zoho Creator → **Settings → Developer → API**.
2. Click **Add Client** → OAuth → Web application.
3. Note the **Client ID** and **Client Secret**.
4. Generate a **Refresh Token** with these scopes:
   ```
   ZohoCreator.report.READ ZohoCreator.form.CREATE ZohoCreator.report.UPDATE
   ```
5. Your API base URL: `https://creator.zoho.com/api/v2/{your-owner-name}/socal-stream`
6. Add all three values to n8n as the `Zoho Creator OAuth` credential.

### 4.5 Add the publish webhook trigger

In Zoho Creator → **Events (form) → Workflow → Add Workflow**:
- Trigger: **On Edit**
- Condition: `Status == "Approved"`
- Action: **Call a URL** → POST to `https://n8n.yourdomain.com/webhook/socal-stream-publish`

This fires the n8n Publish workflow every time you approve an event.

---

## Phase 5 — n8n Publish Workflow

Build this workflow first — it's what makes the site live. Once it works, manual entry → approval → live site is the full loop.

### Workflow nodes (in order):

1. **Webhook** — path: `socal-stream-publish`, method: POST
2. **HTTP Request** — Zoho OAuth token refresh
3. **HTTP Request** — Fetch all Approved events from Creator (`Status=="Approved"`)
4. **HTTP Request** — Fetch all Venues from Creator (for parking/accessibility join)
5. **Code node** — Transform to `events.json` shape (full transform code in WORKFLOW.md §6.2)
6. **Loop over images** — For each event with a `Flyer_URL` but no local image:
   - Download the image
   - Upload to the GitHub repo at `images/{Event_ID}-flyer.jpg`
7. **GitHub node** — Commit `data/events.json` to the repo (overwrite)
8. **HTTP Request** — POST to Netlify build hook URL (triggers deploy)
9. **Slack node** — Post success/failure notification

**Verification test:**
1. Add a test event manually in Zoho Creator with `Status = Approved`.
2. Trigger the webhook manually from n8n.
3. Confirm `data/events.json` updates in GitHub and Netlify redeploys (~30 seconds).
4. Check the live site shows the new event.

---

## Phase 6 — n8n Discovery Workflow (Ticketmaster first)

### 6.1 Create the workflow

- **Schedule Trigger** — every 6 hours

### 6.2 Ticketmaster branch

1. **HTTP Request** — GET `https://app.ticketmaster.com/discovery/v2/events.json`
   - Params: `apikey`, `latlong=34.0522,-118.2437`, `radius=120`, `unit=miles`, `size=200`, `sort=date,asc`
2. **Code node** — Transform to canonical schema (code in WORKFLOW.md §3.2)

### 6.3 Dedup check

3. **Code node** — Compute `Dedup_Hash` (SHA1 of `title|startDate|venueName`)
4. **HTTP Request** → Zoho Creator search by `Dedup_Hash`
5. **IF node** — If record exists: stop. If not: continue.

### 6.4 Venue enrichment

6. **HTTP Request** → Zoho Venues search by `Venue_Name`
7. **IF node** — Venue found: link it. Venue not found: enrich it.
   - **If not found:**
     - **HTTP Request** → Google Places `findplacefromtext`
     - **HTTP Request** → Anthropic Claude API (parking/accessibility/transit prompt — see WORKFLOW.md §3.6)
     - **HTTP Request** → Create new Venues record in Zoho

### 6.5 Geocoding fallback

8. **IF node** — If `Latitude` still blank:
   - **HTTP Request** → Nominatim `https://nominatim.openstreetmap.org/search?q={address}&format=json`
   - Set `User-Agent: socal-stream/1.0`

### 6.6 Insert event

9. **HTTP Request** → Zoho Creator create record in `Events` form
   - `Status = Pending Review`
   - `Discovered_At = now`

### 6.7 Completion notification

10. **Slack node** — Post discovery summary:
    > 🔍 Discovery run complete · N new events queued · N duplicates skipped · N venue enrichments

**Test:** Run the workflow manually. Check the Pending Review queue in Zoho Creator for new events.

---

## Phase 7 — Add Remaining Discovery Sources

Once Ticketmaster is stable, add these as parallel branches in the same Discovery workflow.

### 7.1 Eventbrite (per-organizer)

1. Build a list of major SoCal organizer IDs (Goldenvoice, Live Nation LA, OC Fair, Festival of Arts, etc.).
2. **SplitInBatches** → for each org ID: `GET https://www.eventbriteapi.com/v3/organizations/{org_id}/events/?status=live`
3. Transform fields to canonical schema (same approach as Ticketmaster).
4. Feed into the same Dedup → Enrich → Insert chain.

### 7.2 Venue scrapes (Cheerio)

Start with 3–6 high-value venues:

| Venue | URL |
|---|---|
| Hollywood Bowl | `https://www.hollywoodbowl.com/events/calendar` |
| The Greek Theatre | `https://www.lagreektheatre.com/events` |
| Honda Center | `https://www.hondacenter.com/events/` |
| Rose Bowl | `https://www.rosebowlstadium.com/events/all-events` |
| OC Fair & Event Center | `https://ocfair.com/events` |
| Pechanga Arena (SD) | `https://www.pechangaarenasd.com/events` |

For each:
1. **HTTP Request** → fetch the page HTML
2. **HTML Extract node** → use CSS selectors to pull event title, date, and URL
3. Feed into Dedup → Enrich → Insert chain
4. Set `Source = RSS:{venue-slug}` (e.g. `RSS:hollywood-bowl`)

---

## Phase 8 — Zoho Creator Review Dashboard

Build the review UI so approving events takes ~30 seconds each.

### 8.1 Create a Review Page

1. Zoho Creator → **Pages → Add Page** → name it `Review Queue`.

### 8.2 Pending events report

1. **Reports → Add Report** → list report on `Events` form.
2. Filter: `Status == "Pending Review"`, sort: `Discovered_At desc`.
3. Columns: Title, Category, Start_Date, Venue_Name, Source, Flyer_URL (thumbnail).

### 8.3 Action buttons

Add two buttons per row:
- ✅ **Approve** → Deluge script: `input.Events.Status = "Approved"; input.Events.submit();`
- ❌ **Reject** → same but `Status = "Rejected"`

Add a **Bulk Approve** button at the top of the report for trusted batches.

### 8.4 Add the page to the app navigation

Drag the Review Queue page to the top of the sidebar so it's the default view.

---

## Phase 9 — Go-Live Verification

Run through this checklist before calling it live:

- [ ] Add a manual event in Zoho Creator → Status = Approved → site updates within 60 seconds
- [ ] Trigger a Ticketmaster discovery run → new events appear in Pending Review queue
- [ ] Approve one discovered event → confirm it appears on the site
- [ ] Check `data/events.json` in GitHub reflects the correct event data
- [ ] Confirm event detail page loads with correct parking, accessibility, and transit info
- [ ] Confirm ticket link works on at least one event
- [ ] Confirm Slack notifications fire on both discovery and publish runs
- [ ] Check Netlify deploy logs — no build errors
- [ ] Browse the site on mobile (Netlify URL) — confirm layout is responsive

---

## Quick Reference: What's Already Done

| Component | Status |
|---|---|
| Static site (HTML/CSS/JS) | ✅ Built |
| `data/events.json` schema | ✅ Defined and seed data loaded |
| Event detail pages | ✅ Built |
| Map, filtering, calendar views | ✅ Built |
| WORKFLOW.md spec | ✅ Complete |
| GitHub repo | ⏳ Phase 1 |
| Netlify deploy | ⏳ Phase 2 |
| VPS + n8n | ⏳ Phase 3 |
| Zoho Creator forms | ⏳ Phase 4 |
| Publish workflow | ⏳ Phase 5 |
| Discovery workflow (Ticketmaster) | ⏳ Phase 6 |
| Discovery (Eventbrite + scrapes) | ⏳ Phase 7 |
| Review dashboard | ⏳ Phase 8 |
| Phase 2: ratings + login | 📋 Roadmap — not yet designed |

---

## Estimated Effort

| Phase | Time estimate |
|---|---|
| Phase 0 — API keys | 1–2 hours |
| Phase 1 — GitHub | 30 minutes |
| Phase 2 — Netlify | 20 minutes |
| Phase 3 — VPS + n8n | 1–2 hours |
| Phase 4 — Zoho Creator | 1–2 hours |
| Phase 5 — Publish workflow | 2–3 hours |
| Phase 6 — Ticketmaster discovery | 2–3 hours |
| Phase 7 — Eventbrite + scrapes | 3–4 hours |
| Phase 8 — Review dashboard | 1 hour |
| Phase 9 — Go-live check | 30 minutes |
| **Total** | **~12–18 hours across 4 weeks** |
