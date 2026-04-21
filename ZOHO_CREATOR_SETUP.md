# Zoho Creator Setup — SoCal Stream

Complete walkthrough for building the **SoCal Stream** application in Zoho Creator. Follow sections in order — the Deluge scripts in §4 depend on the forms you build in §2–3.

---

## §1 · Create the Application

1. Go to [creator.zoho.com](https://creator.zoho.com) and sign in with your Zoho One account.
2. Click **Create Application** → **From scratch**.
3. Name: `SoCal Stream`
4. Application link name (auto-fills): `socal-stream` ← note this, it appears in every API URL.
5. Click **Create**.

You'll land in the application builder. You need two forms: **Events** and **Venues**.

---

## §2 · Form A — `Events`

In the left panel click **+** next to **Forms** → name it `Events`.

Add each field below. Use **Add Field** → pick the type → set the field name exactly as shown (Creator uses the display name you type as the API field name, replacing spaces with underscores).

### Field-by-field spec

| # | Display name | Field type | Key settings |
|---|---|---|---|
| 1 | `Event ID` | Single Line | ✅ Mark as **Unique**; ✅ **Mandatory** |
| 2 | `Status` | Dropdown | Values: `Pending Review`, `Approved`, `Rejected` · Default: `Pending Review` |
| 3 | `Source` | Dropdown | Values: `Manual`, `Ticketmaster`, `Eventbrite`, `RSS` |
| 4 | `External ID` | Single Line | — |
| 5 | `Title` | Single Line | ✅ Mandatory |
| 6 | `Category` | Dropdown | Values: `Festival`, `Concert`, `Sports`, `Fair`, `Arts`, `Market`, `Convention` |
| 7 | `Start Date` | Date | ✅ Mandatory |
| 8 | `End Date` | Date | — |
| 9 | `Start Time` | Time | — |
| 10 | `End Time` | Time | — |
| 11 | `Venue` | **Lookup** | Lookup form: **Venues** · Display field: `Venue Name` |
| 12 | `Venue Name` | Single Line | — |
| 13 | `Address` | Single Line | — |
| 14 | `City` | Single Line | — |
| 15 | `State` | Single Line | Default value: `CA` |
| 16 | `Zip` | Single Line | — |
| 17 | `Latitude` | Decimal | — |
| 18 | `Longitude` | Decimal | — |
| 19 | `Flyer` | File Upload | Allowed types: `jpg, jpeg, png, webp` |
| 20 | `Poster` | File Upload | Allowed types: `jpg, jpeg, png, webp` |
| 21 | `Flyer URL` | URL | — |
| 22 | `Short Description` | Multi Line | Max length: `200` |
| 23 | `Description` | Multi Line | — |
| 24 | `Price From` | Currency | Currency symbol: `$` |
| 25 | `Price Label` | Single Line | — |
| 26 | `Ticket URL` | URL | — |
| 27 | `Age Restriction` | Single Line | — |
| 28 | `Organizer` | Single Line | — |
| 29 | `Dedup Hash` | Single Line | ✅ Mark as **Unique** |
| 30 | `Discovered At` | Date-Time | — |
| 31 | `Last Updated At` | Date-Time | — |
| 32 | `Approval Notes` | Multi Line | — |

> **Tip**: Creator auto-generates the API field name from the display name (e.g. `Start Date` → `Start_Date`). You can verify by hovering the field and checking **Properties → Field link name**.

Click **Save Form** when done.

---

## §3 · Form B — `Venues`

Click **+** next to **Forms** → name it `Venues`.

| # | Display name | Field type | Key settings |
|---|---|---|---|
| 1 | `Venue Name` | Single Line | ✅ Unique · ✅ Mandatory |
| 2 | `Address` | Single Line | — |
| 3 | `City` | Single Line | — |
| 4 | `Latitude` | Decimal | — |
| 5 | `Longitude` | Decimal | — |
| 6 | `Parking On Site` | Decision Box (checkbox) | — |
| 7 | `Parking Notes` | Multi Line | — |
| 8 | `Parking Accessible` | Multi Line | — |
| 9 | `ADA Accessible` | Decision Box | — |
| 10 | `Accessibility Notes` | Multi Line | — |
| 11 | `Service Animals` | Decision Box | — |
| 12 | `Transit` | Multi Line | — |
| 13 | `Enriched By` | Dropdown | Values: `Manual`, `GooglePlaces`, `LLM:Claude` |
| 14 | `Enriched At` | Date-Time | — |
| 15 | `Confidence` | Decimal | Min: `0` · Max: `1` |

Click **Save Form**.

---

## §4 · Deluge Scripts (Workflows)

Open each form → **Workflow** tab → **+ Add workflow**.

### 4.1 Events — On Insert: stamp timestamps + generate Event_ID

**Form**: Events  
**Trigger**: Record Creation  
**Workflow name**: `on_insert_stamp`

```deluge
// Auto-stamp Discovered_At
input.Discovered_At = zoho.currenttime;
input.Last_Updated_At = zoho.currenttime;

// Auto-generate Event_ID from Source + External_ID (for non-manual entries)
if(input.Source != "Manual" && input.External_ID != "" && input.Event_ID == "")
{
    sourceSlug = input.Source.toLowerCase().replaceAll(" ", "-");
    input.Event_ID = sourceSlug + "-" + input.External_ID;
}

// Compute Dedup_Hash = SHA1 of "lowertitle|start_date|lowervenuename"
titlePart  = input.Title.toLowerCase().trim();
datePart   = input.Start_Date.toString("yyyy-MM-dd");
venuePart  = input.Venue_Name.toLowerCase().trim();
hashInput  = titlePart + "|" + datePart + "|" + venuePart;
input.Dedup_Hash = hashInput.toDigest("SHA1");
```

### 4.2 Events — On Edit: update Last_Updated_At

**Form**: Events  
**Trigger**: Record Edit  
**Workflow name**: `on_edit_stamp`

```deluge
input.Last_Updated_At = zoho.currenttime;
```

### 4.3 Events — On Edit: webhook when Status → Approved

This fires the n8n Publish workflow whenever you approve an event.

**Form**: Events  
**Trigger**: Record Edit  
**Condition**: `Status == "Approved"`  
**Workflow name**: `on_approve_publish_webhook`

```deluge
// Replace the URL below with your n8n webhook URL after you stand up the VPS
webhookURL = "https://YOUR_N8N_VPS/webhook/socal-stream-publish";

payload = Map();
payload.put("event_id", input.Event_ID);
payload.put("status",   "Approved");
payload.put("triggered_at", zoho.currenttime.toString());

response = invokeurl
[
    url     : webhookURL
    type    : POST
    parameters : payload.toString()
    headers : {"Content-Type": "application/json"}
];

info response;
```

> **Placeholder**: Leave the webhook URL as-is for now. Come back to update it in Week 1 Step 2 after your n8n VPS is running.

### 4.4 Venues — On Insert: stamp Enriched_At

**Form**: Venues  
**Trigger**: Record Creation  
**Workflow name**: `on_insert_venue_stamp`

```deluge
if(input.Enriched_At == null || input.Enriched_At == "")
{
    input.Enriched_At = zoho.currenttime;
}
```

---

## §5 · Review Queue Page

Build a no-code dashboard for your daily review session (~5 min/day).

### 5.1 Create the Page

In the left panel: **Pages** → **+** → name it `Review Queue`.

### 5.2 Add a Report component (Pending list)

1. Drag a **Report** widget onto the page.
2. Select report source: **Events** form.
3. Add a filter: `Status == "Pending Review"`.
4. Sort: `Discovered At` → **Descending**.
5. Columns to display: `Title`, `Category`, `Start Date`, `Venue Name`, `Source`, `Flyer URL`.
6. For `Flyer URL` — click the column → **Display as** → **Link** (this makes it clickable, or use **Image** if you want inline thumbnails).

### 5.3 Add Approve / Reject buttons

For each row, add two **Button** components:

**Approve button**:
- Label: `✅ Approve`
- Action: **Execute Deluge**

```deluge
recordID = input.ID;
eventMap = Map();
eventMap.put("Status", "Approved");
zoho.creator.update("dustin-chavistec", "socal-stream", "Events", "ID==" + recordID, eventMap);
```

**Reject button**:
- Label: `❌ Reject`
- Action: **Execute Deluge**

```deluge
recordID = input.ID;
eventMap = Map();
eventMap.put("Status", "Rejected");
zoho.creator.update("dustin-chavistec", "socal-stream", "Events", "ID==" + recordID, eventMap);
```

> **Note**: Replace `dustin-chavistec` with your actual Zoho Creator account owner name (the slug shown in your Creator URL).

### 5.4 Add a Bulk Approve button (optional, Week 4)

- Label: `Bulk Approve All Pending`
- Action: **Execute Deluge**

```deluge
pendingEvents = zoho.creator.getRecords("dustin-chavistec", "socal-stream", "Events", "Status==\"Pending Review\"");
for each ev in pendingEvents
{
    eventMap = Map();
    eventMap.put("Status", "Approved");
    zoho.creator.update("dustin-chavistec", "socal-stream", "Events", "ID==" + ev.get("ID"), eventMap);
}
```

---

## §6 · API Access (OAuth Setup)

This is the one-time step that lets n8n read/write your Creator data.

### 6.1 Create an OAuth Client

1. Go to [api-console.zoho.com](https://api-console.zoho.com).
2. Click **Add Client** → choose **Server-based Applications**.
3. Fill in:
   - Client Name: `SoCal Stream n8n`
   - Homepage URL: `http://localhost` (placeholder)
   - Authorized Redirect URI: `http://localhost/callback`
4. Click **Create** → copy the **Client ID** and **Client Secret** somewhere safe.

### 6.2 Generate a Refresh Token

Open this URL in your browser (replace `{CLIENT_ID}` with your actual value):

```
https://accounts.zoho.com/oauth/v2/auth?response_type=code&client_id={CLIENT_ID}&scope=ZohoCreator.report.READ,ZohoCreator.form.CREATE,ZohoCreator.report.UPDATE&redirect_uri=http://localhost/callback&access_type=offline&prompt=consent
```

1. Authorize → you'll be redirected to `http://localhost/callback?code=XXXXXXX`.
2. Copy the `code` value from the URL.
3. Exchange it for a refresh token via `curl` (or any REST client):

```bash
curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d "grant_type=authorization_code" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=http://localhost/callback" \
  -d "code=YOUR_CODE"
```

The response contains `"refresh_token": "1000.xxxx..."` — **save this permanently**. It doesn't expire unless you revoke it.

### 6.3 Note Your API Base URL

```
https://creator.zoho.com/api/v2/{owner-account-name}/socal-stream
```

Replace `{owner-account-name}` with the same slug used in §5 Deluge scripts (e.g. `dustin-chavistec`). Verify it at: **Creator → Settings → API**.

### 6.4 Store in n8n

In n8n: **Credentials** → **New** → search for **Zoho Creator OAuth2 API**.

| Field | Value |
|---|---|
| Client ID | from §6.1 |
| Client Secret | from §6.1 |
| Region | `US` (or whichever matches your Zoho account) |

n8n will handle token refresh automatically from this point on.

---

## §7 · Verify the Setup

Before building n8n flows, confirm everything works with a manual end-to-end test:

1. **Add a test event manually**: Creator → Events form → `+ Add Record`.
   - Fill: Title = `Test Event`, Start Date = today, Venue Name = `Test Venue`, Source = `Manual`, Status = `Approved`.
   - Save → confirm `Discovered_At`, `Last_Updated_At`, and `Dedup_Hash` are auto-populated.

2. **Add a test venue**: Creator → Venues form → `+ Add Record`.
   - Fill: Venue Name = `Test Venue`, City = `Los Angeles`, Parking On Site = ✅, ADA Accessible = ✅.
   - Save → confirm `Enriched_At` is auto-stamped.

3. **Check the Review Queue page**: navigate to **Pages → Review Queue** — the test event won't appear there (it's Approved, not Pending), so also add a second test record with `Status = Pending Review` and confirm it shows up.

4. **Test the API**: run this `curl` in your terminal (get a fresh access token first via the refresh token grant, or use Postman):

```bash
curl "https://creator.zoho.com/api/v2/{owner}/socal-stream/report/All_Events" \
  -H "Authorization: Zoho-oauthtoken YOUR_ACCESS_TOKEN"
```

You should get back your test record as JSON. If you do, n8n can connect.

---

## §8 · What's Next

With Creator set up, the Week 1 build order from WORKFLOW.md:

1. **Spin up the n8n VPS** (DigitalOcean / Hetzner $6/mo droplet).
2. **Build the Publish workflow** in n8n (§6 of WORKFLOW.md) — this is the path from Approved → events.json → GitHub → Netlify.
3. **Update the webhook URL** in Deluge script §4.3 above with your real n8n URL.
4. Add 2–3 manually-approved events in Creator and confirm they appear on the live site.

Discovery workflows (Ticketmaster, Eventbrite, venue scrapes) come in Weeks 2–4.

---

*Schema last updated: 2026-04-19. Matches events.json shape in WORKFLOW.md §Appendix C.*
