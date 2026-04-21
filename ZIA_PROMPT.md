# Zia Prompt — SoCal Stream App

Paste the block below verbatim into Zoho Creator's **"Create app with AI / Zia"** prompt box.

---

## Prompt (copy everything between the lines)

---

Create an application called **SoCal Stream** for managing Southern California event listings. The app has two forms: Events and Venues.

**Form 1: Events**

This form tracks events discovered from multiple sources and goes through an approval workflow before publishing to a website.

Fields:
- Event ID — single line, unique, mandatory
- Status — dropdown with values: Pending Review, Approved, Rejected. Default: Pending Review
- Source — dropdown with values: Manual, Ticketmaster, Eventbrite, RSS
- External ID — single line
- Title — single line, mandatory
- Category — dropdown with values: Festival, Concert, Sports, Fair, Arts, Market, Convention
- Start Date — date, mandatory
- End Date — date
- Start Time — time
- End Time — time
- Venue — lookup field pointing to the Venues form, display field: Venue Name
- Venue Name — single line
- Address — single line
- City — single line
- State — single line, default value: CA
- Zip — single line
- Latitude — decimal number
- Longitude — decimal number
- Flyer — file upload, images only
- Poster — file upload, images only
- Flyer URL — URL field
- Short Description — multi-line text, max 200 characters
- Description — multi-line text
- Price From — currency field
- Price Label — single line
- Ticket URL — URL field
- Age Restriction — single line
- Organizer — single line
- Dedup Hash — single line, unique
- Discovered At — date-time
- Last Updated At — date-time
- Approval Notes — multi-line text

**Form 2: Venues**

This form is an enrichment cache — stores parking, accessibility, and transit info per venue so it only needs to be looked up once.

Fields:
- Venue Name — single line, unique, mandatory
- Address — single line
- City — single line
- Latitude — decimal number
- Longitude — decimal number
- Parking On Site — checkbox (yes/no)
- Parking Notes — multi-line text
- Parking Accessible — multi-line text
- ADA Accessible — checkbox (yes/no)
- Accessibility Notes — multi-line text
- Service Animals — checkbox (yes/no)
- Transit — multi-line text
- Enriched By — dropdown with values: Manual, GooglePlaces, LLM:Claude
- Enriched At — date-time
- Confidence — decimal number between 0 and 1

---

## After Zia generates the app — checklist

Zia will likely get the structure right but miss some details. Run through this quickly:

- [ ] **Events → Event ID**: confirm it is marked Unique in field properties
- [ ] **Events → Dedup Hash**: confirm it is marked Unique
- [ ] **Events → Status**: confirm default value is set to `Pending Review`
- [ ] **Events → State**: confirm default value is set to `CA`
- [ ] **Events → Venue**: confirm it is a Lookup type pointing to the Venues form (Zia sometimes creates it as plain text)
- [ ] **Venues → Venue Name**: confirm it is marked Unique
- [ ] **Venues → Confidence**: confirm min/max is 0–1 if Zia supports it
- [ ] All dropdown values are spelled exactly as listed (case-sensitive in API calls)

Once the forms look right, go to **ZOHO_CREATOR_SETUP.md §4** to add the four Deluge workflow scripts — Zia won't generate those.
