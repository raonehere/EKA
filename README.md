# EKA Forest

Static site for **EKA Forest**, an A-frame tent stay in the eucalyptus and pine woods of Vattavada (past Top Station, about 45 km from Munnar, Kerala).

The site is served at **https://ekaforest.com/** from this repository, via GitHub Pages (branch `main`, folder `/`). There is no build step. Asset links are relative, so the same files work locally and at the domain root.

## Local preview

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080/


## Booking

The public `/book/` page currently shows a coming-soon screen. The availability calendar and booking flow below stays in the repo for when booking opens.

`/book/` is the availability calendar and booking flow: pick nights → guest
details → **advance (₹1,000 one guest, ₹2,000 two or more)** → pay by UPI and upload the screenshot →
confirmation. The form is split into four steps: guests and dates, your details,
ID proof, then stay and finish.

- Availability and bookings live in a **Notion** database.
- No payment gateway: the page shows a UPI QR for the exact advance and the guest
  uploads a screenshot, which the Worker files in the Notion row. You check the
  credit and set `Booking status = Confirmed` by hand.
- Because GitHub Pages is static, both are reached through a small
  **Cloudflare Worker** in `worker/`. Secrets stay there, never in this repo.
- Notion column names live in one `FIELDS` map at the top of `worker/index.js`.
  Rename a column in Notion and you change it in exactly one place.
- `/book/manage/` is the guest's private link: move dates or cancel, no login.
- `/owner/` is the owner dashboard (key-protected, `noindex`): occupancy,
  money, arrivals, one-tap confirm/cancel, and the daily update for the manager.

Until the Worker is configured, `assets/booking-config.js` keeps the page in
preview mode (`demo: true`) with sample availability and a simulated payment.

**Setup: [`docs/booking-setup.md`](docs/booking-setup.md)**, Notion schema, keys,
Worker deploy, UPI, dashboard, testing.

Tent count, capacity, the two advance amounts and the API URL are in
`assets/booking-config.js`. The Worker's copy of the inventory is in
`worker/wrangler.toml` (`UNITS`, `TENT_CAPACITY`, `ADVANCE_SINGLE`, `ADVANCE_GROUP`),
keep the two in step.

## Content

Page copy can be updated from the Google Sheet “EKA Forest – Website Content” through `assets/cms.js`. The HTML remains the fallback if the sheet cannot be loaded.

## DNS

Point the domain at GitHub Pages (keep the BigRock nameservers):

- A records for `@` (ekaforest.com): `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- CNAME for `www`: `raonehere.github.io`

The booking Worker uses its `*.workers.dev` URL, so no DNS change is needed for
payments.

## Files

```
index.html                home
book/                     availability calendar + booking flow
assets/book.css, book.js  booking UI
assets/booking-config.js  tents, capacity, advance, API URL, WhatsApp number
book/manage/              private move / cancel page
owner/                    owner dashboard (key-protected, noindex)
worker/                   Cloudflare Worker (Notion + UPI screenshots)
assets/vendor/            qrcode-generator (MIT), renders the UPI QR
docs/booking-setup.md     one-time setup guide
```
