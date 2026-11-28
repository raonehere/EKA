# Booking system, setup

The site is static (GitHub Pages), so it cannot hold API keys. The booking page
talks to a small Cloudflare Worker, and the Worker is the only thing that knows
your Notion token.

There is **no payment gateway**. The guest pays a fixed advance (₹1,000 for one
guest, ₹2,000 for two or more) by UPI, uploads the screenshot, and the Worker
files it in your Notion row so you can check the credit yourself.

```
Guest
  → /book/  (GitHub Pages: calendar, form, UPI QR, screenshot upload)
      → Cloudflare Worker  (API + Notion token)
          → Notion database   (bookings, blocking, payment screenshots)
```

Everything below is one-time setup. Budget about half an hour.

---

## 1. The Notion database

You already have the table. The Worker is wired to **your column names**, not to
a fresh schema, so there is almost nothing to create.

These are the columns it reads and writes. Left is the exact title in Notion:

| Column in Notion | Type | What the Worker does with it |
|---|---|---|
| `Guest Name` | **Title** | the guest's name |
| `reference` | Text | the booking reference, e.g. `EKA-261214-A1B2` |
| `Phone` | Phone | |
| `Guest Email` | Email | |
| `Check-in` | Date | **time off** |
| `Check-Out` | Date | **time off** |
| `Number of people` | Number | paying guests, 10 and older |
| `Notes (special request)` | Text | arrival time, pets, dietary needs, date moves, payment notes |
| `Booking status` | **Select** | ← the one column you need to add |
| `Payment` | Files | the UPI screenshot the guest uploads |

### The one column to add

Add `Booking status` of type **Select**, with exactly these four options:

```
Pending payment
Payment review
Confirmed
Cancelled
```

It is a *Select*, deliberately, not Notion's newer *Status* type. Only a Select
lets the Worker use its own option names; your table already has two Status
properties (`Status`, `Payment Status`) whose options live in Notion's groups
and cannot be written from the API.

The Worker never touches `Status`, `Payment Status`, `Purpose of Visit`,
`Room Type`, `Aadhar Card copy` or `Sr. No.`. Use them however you like.

### Columns that add detail (optional)

Add these when you want them. The Worker fills them in if they exist and skips
them if they don't, `/health` never complains about a missing optional column,
and a booking still saves.

| Column | Type | What it buys you |
|---|---|---|
| `Tents` | Number | overrides the tent count. Without it: one tent per two guests, and a solo guest gets a whole tent |
| `Advance` | Number | the advance paid for each row (₹1,000 one guest, ₹2,000 two or more) |
| `Children under 10` | Number | declared children, kept out of `Number of people` |
| `Manage token` | Text | holds the private move/cancel key. Without it one is derived from `MANAGE_SECRET`, which works just as well |
| `Moves` | Number | how many times the guest changed dates |
| `Last change` | Date | **time off**, set when a guest moves their booking; this is what the dashboard counts |
| `Paid at` | Date | **time on**, stamped when you press Confirm |
| `Type` | Select | `Booking` / `Blocked` |
| `Source` | Select | `Website` / `WhatsApp` / `Manual` |
| `Terms accepted` | Date | **time on**, proof the guest accepted the advance terms |
| `Total amount` | Number | the full price for the stay, before any discount |
| `Discount` | Number | a **rupee amount**, typed beside the guest's name on the dashboard. It is deducted from `Total amount` and cannot be more than it |

`Discount` is the rupee amount to deduct, not a percentage. The dashboard shows
the amount, and the guest's balance is `Total amount` minus `Discount` minus the
advance. On the first save the Worker tries to add the `Discount` column itself;
if Notion does not allow that, add a number column named `Discount` by hand and
it will be used from then on.

Earlier versions of the dashboard saved a percentage in this column. If any old
rows still hold a small number such as `10`, clear it and type the rupee amount
instead, or the guest will be shown a ₹10 discount.

There is no `Nights` column: the Worker works the nights out from the two dates.

If you rename a column later, change it **once** in `FIELDS` at the top of
`worker/index.js` and redeploy. Nothing else in the Worker mentions a column by
name.

Names are matched ignoring capitals and surrounding spaces, so `Reference`,
`reference` and `reference ` (with a trailing space, Notion allows it) are all
the same column. You never have to get the capitals exactly right.

**The four statuses mean:**

| `Booking status` | What it means | Dates blocked? |
|---|---|---|
| `Pending payment` | form submitted, no screenshot yet | **no** |
| `Payment review` | screenshot uploaded, waiting for you | yes, until you decide |
| `Confirmed` | you checked the UPI credit | yes |
| `Cancelled` | guest cancelled, or you did | no |

**Your daily job:** open Notion, look at rows in **Payment review**, open the
screenshot in `Payment`, check your bank or UPI app for the advance amount from that name or
reference, then set `Booking status = Confirmed`. If the money never arrived,
set `Cancelled` and the dates free themselves. The `/owner/` dashboard does the
same two clicks for you.

**Block dates** (maintenance, a private event, your own holiday): create a row
with `Booking status = Confirmed`, the check-in and check-out, and either
`Tents = 11` (if you added that column) or `Number of people = 22`, which works
out to all eleven tents.

---

## 2. Notion key

1. Go to **https://www.notion.so/profile/integrations** (older workspaces:
   `https://www.notion.so/my-integrations`).
2. **New integration** → name it `EKA Forest Website` → pick your workspace →
   type **Internal**.
3. Capabilities: tick **Read content**, **Insert content**, **Update content**.
4. Save, then copy the **Internal Integration Secret**. It starts with `ntn_`
   (older ones start with `secret_`).
5. Open the **Bookings** database as a full page → `•••` (top right) →
   **Connections** → **Connect to** → choose `EKA Forest Website`.
   Without this step the key can see nothing.
6. Copy the **database ID** from the browser URL. It is the 32-character code
   just before `?v=`:

   ```
   https://www.notion.so/EKA-Bookings-1a2b3c4d5e6f7890abcdef1234567890?v=...
                                      └────────── this part ──────────┘
   ```

You now have two values: `NOTION_TOKEN` and `NOTION_DB`.

> The key can read and write that one database. Treat it like a password.
> Never paste it into the website, GitHub, a screenshot, or this chat.

---

## 3. UPI

You need the UPI ID you actually receive money on, the same one you use in
GPay / PhonePe / Paytm. For example `ekaforest@okhdfcbank` or
`9876543210@ybl`.

That is the only setting. The page builds a UPI link for exactly the advance (₹1,000 or ₹2,000), renders
a QR from it, and shows the ID underneath for anyone who prefers to type it.
Nothing is charged automatically; you verify each payment by hand.

Do **not** use a personal number you don't want public: the UPI ID is shown to
every guest who reaches the payment step.

---

## 4. Deploy the Worker

### Option A, Cloudflare dashboard (no terminal)

1. **https://dash.cloudflare.com/?to=/:account/workers-and-pages** →
   **Create application** → **Workers** tab → **Start with Hello World!**
2. Name it `eka-booking` → **Deploy**.
3. **Edit code** → select all → delete the sample → paste the whole of
   `worker/index.js` → **Deploy**.
4. **Settings → Variables and Secrets** → add:

   | Name | Type | Value |
   |---|---|---|
   | `NOTION_TOKEN` | Secret | your `ntn_…` key |
   | `NOTION_DB` | Secret | the 32-character database id |
   | `UPI_ID` | Text | `eka.82200883@hdfcbank` |
   | `UPI_NAME` | Text | `EKA` |
   | `SITE_URL` | Text | `https://ekaforest.com` |
   | `MANAGE_SECRET` | Secret | any long random string |
   | `OWNER_TOKEN` | Secret | your dashboard password, e.g. 40 random characters |
   | `WA_NOTIFY` | Text | optional, no longer needed for the daily update |
   | `ALLOWED_ORIGINS` | Text | `https://ekaforest.com,https://www.ekaforest.com` |
   | `UNITS` | Text | `11` |
   | `TENT_CAPACITY` | Text | `2` |
   | `ADVANCE_SINGLE` | Text | `1000`, advance for one guest |
   | `ADVANCE_GROUP` | Text | `2000`, advance for two or more guests |
   | `CHANGE_CUTOFF_HOURS` | Text | `48` (optional) |

5. **Deploy** again after adding the variables.
6. Copy the Worker URL from the top of the Worker's page, or from
   **Settings → Domains & Routes**. It looks like
   `https://eka-booking.YOUR-SUBDOMAIN.workers.dev`, where `YOUR-SUBDOMAIN`
   is the account name Cloudflare gave you (visible in the dashboard URL,
   e.g. `dash.cloudflare.com/abc123…/workers`).
   This URL **is** the API. Every endpoint hangs off it.

Your domain's DNS is at BigRock, not Cloudflare, so **use the `workers.dev`
URL**. A custom `api.ekaforest.com` would mean moving the whole domain's
nameservers to Cloudflare, not necessary.

### Option B, terminal

```bash
npm install -g wrangler
cd worker
wrangler login
wrangler secret put NOTION_TOKEN
wrangler secret put NOTION_DB
wrangler secret put MANAGE_SECRET
wrangler deploy
```

`worker/wrangler.toml` holds the non-secret settings, put your `UPI_ID` there
too.

---

## 5. Check it, what "/health" actually is

`/health` is not a page in the website. It is the **last line of the Worker
URL**, so if your Worker is at

```
https://eka-booking.raonehere.workers.dev
```

then type this into any browser tab:

```
https://eka-booking.raonehere.workers.dev/health
```

You get raw JSON back, no styling. That is the point: it is a diagnostic, not
a page. Guest-facing pages are `/book/` and `/book/manage/` on the website , 
the Worker only ever answers `/health`, `/availability`, `/bookings`,
`/bookings/screenshot`, `/booking`, `/booking/reschedule`, `/booking/cancel`.

(If you see `Hello World!` or a 404, the code was not pasted, or the URL is
missing `/health`.)

You want:

```json
{ "ok": true, "notion": true, "upi": true, "units": 11, "capacity": 2,
  "blocks": ["Payment review", "Confirmed"], "manage": true,
  "owner": true, "database": "EKA Bookings", "missing": [] }
```

- `missing: []` → every column the Worker needs is there, with the right type.
- Anything listed → that column is missing or the wrong type. The message is
  literal: `Booking status (missing)`, `Payment (is rich_text, should be files)`.
- Optional columns are never listed, so a short `missing` is normal.
- `notion: false` → the token is wrong, or the database was not connected to the
  integration (step 2.5).
- `upi: false` → `UPI_ID` is not set, and bookings will be refused with a
  "payments are not set up" message.
- `owner: false` → `OWNER_TOKEN` is not set, so `/owner/` cannot load.

**When `missing` is not empty**, two more fields tell you why. `database` is the
title of the database the Worker actually opened, and `properties` lists every
column it found there, and `columns` shows which real column each Worker field
resolved to. If `database` is not the table you meant, `NOTION_DB` is
the wrong id. If the title is right but a name differs, either rename the column
or change that one line in `FIELDS` (section 1). `columns` shows the whole map
the Worker is currently using.

Then check availability:

```
https://eka-booking.….workers.dev/availability?from=2026-12-01&to=2026-12-31
```

It should return a `nights` object with a number of free tents for each date.

---

## 6. The guest's private link (move / cancel)

Reserving returns a `manageUrl`, for example
`https://ekaforest.com/book/manage/?r=EKA-261201-7F3A&k=9c1f…`. It appears on the
confirmation screen as "open your booking". The guest can keep that message or
bookmark the page.

- `GET /booking?r=&k=` → the booking plus free tents, with its *own* nights left out
- `POST /booking/reschedule` → moves the dates, keeps the advance, appends to `Notes`
- `POST /booking/cancel` → sets `Booking status = Cancelled` and frees the nights

The `k` token is `HMAC-SHA256(MANAGE_SECRET, "manage:" + reference)` cut to 32 hex
characters, so it cannot be guessed from the reference.

Rules built in:

- Moves are free and unlimited until `CHANGE_CUTOFF_HOURS` (default 48) before
  check-in. After that the page asks the guest to message you.
- Only `Confirmed` bookings can be moved or cancelled from the link. A booking
  still waiting for payment tells the guest to finish paying.
- Cancelling is always allowed once confirmed. The advance is not refunded; the
  copy says so before the guest taps the button.
- The booking's own nights are excluded when the new dates are checked, so
  shifting a stay by a night never fails with a false "full".

---

## 7. Owner dashboard

Open:

```
https://ekaforest.com/owner/
```

Paste the `OWNER_TOKEN` you set in the Worker. It is remembered in that browser;
**Sign out** forgets it. The page is not linked from the site and carries
`noindex`, but the key is the only lock, treat it like a password.

What it shows:

| Block | What it means |
|---|---|
| Tents tonight | tents blocked tonight out of 11, and how many are free |
| Guests tonight | paying guests plus under-10s currently booked in |
| Arriving / Leaving today | today's movements, each with a one-tap WhatsApp link |
| Advance received | money you have marked `Confirmed` |
| Waiting for you | money sitting in `Payment review`, plus unpaid forms |
| Occupancy | seven months, nights sold ÷ (11 tents × nights in month) |
| Next 30 days | every booking with **Confirm** and **Cancel** buttons |
| Send today's update | the message for the property manager (see section 9) |

The buttons write straight back to Notion: **Confirm** sets `Booking status = Confirmed`
and stamps `Paid at`; **Cancel** sets `Cancelled` and frees the nights.

Everything is read live from Notion, so a booking made in the dashboard or by a
guest appears in the other within a refresh.

---

## 8. WhatsApp

**The property-manager update.** The dashboard builds one message with tonight's
guests, the A-frame tents still free, today's and tomorrow's arrivals and
departures, and each arriving guest's advance paid and balance to take.

- **Send on WhatsApp** opens WhatsApp's chat picker with the whole message typed
  in. Choose the team group and send. No number needs to be set.
- **Copy** puts the same text on the clipboard for pasting anywhere.

This is deliberately not an automated blast. WhatsApp only lets a business send
free-form messages inside a 24-hour reply window; outside it you need an
approved template and a Cloud API account (Meta or a reseller like Gupshup or
Interakt). If you set that up later, the same text is what you would template.

**Guest messages.** Every arrival and every row in the dashboard has a
"message" link that opens WhatsApp to that guest with a greeting already
written. Nothing is sent without you tapping.

---

## 9. Switch the website on

In `assets/booking-config.js`:

```js
apiBase: 'https://eka-booking.your-name.workers.dev',
demo: false,
```

Also fix the real WhatsApp number in the same file (`whatsapp`, digits only,
with country code). The `upi` block there is only used in preview mode, once
live, the Worker sends the UPI ID.

Then commit and push. GitHub Pages redeploys in a minute.

While `demo: true`, the calendar shows sample availability, the QR encodes a
placeholder UPI ID, and nothing is saved, useful for review.

---

## 10. Test before going live

1. Calendar shows the current month with today outlined, past dates disabled.
2. Pick a range; the summary shows nights, guests, tents and the advance.
3. Three paying guests → **two tents**. A solo guest → one whole tent.
4. Submit with an empty name / bad phone / unchecked terms → inline errors.
5. Submit properly → the payment panel opens with a QR and your UPI ID.
6. Scan the QR with your own phone: it should open your UPI app with the advance amount
   and the reference in the note.
7. Upload a screenshot → confirmation screen says "We're checking your payment".
8. In Notion: a row exists with `Booking status = Payment review`, the
   screenshot in `Payment`, and the reference in `reference`.
9. Set it to `Confirmed` → the dates stay blocked and the manage page shows the
   two action buttons.
10. Block a date in Notion (`Type = Blocked`, `Tents = 11`) → it disappears from
    the calendar within 30 seconds.
11. Reserve without uploading → the calendar does **not** change. Upload the
    screenshot → the dates disappear from the calendar.
12. Open the manage link → move to free dates, then cancel. Both update Notion.

Do one real payment from your own account and confirm the round trip
before announcing it.

---

## 11. How the money works

- Advance: **₹1,000 for one paying guest, ₹2,000 for two or more**; a bigger
  group still pays ₹2,000. Children under 5 are free and do not count, so one
  adult with an infant still pays ₹1,000. Eleven tents, two guests each; a solo
  guest still takes a whole tent, so three people book two tents.
  Under-10s are free, share your tent, and are only declared.
- The guest ticks a box that accepts the advance terms, and the time is stored in
  Notion (`Terms accepted`).
- Transferable: moving the dates from the private link carries the advance over
  (as often as they like before the 48-hour cutoff).
- It is **adjusted against the final bill**; the balance is collected at the
  property. Nothing on the site charges more than the advance shown.
- Refunds are manual and entirely your call. The site promises none.

---

## 12. Security notes

- The Notion token lives only in Cloudflare Worker secrets. It is never sent to
  the browser. `worker/.dev.vars` is git-ignored.
- Screenshot uploads need the booking reference *and* the private token, so
  nobody can attach files to someone else's row.
- Uploads are limited to 8 MB and to images or PDFs; the browser shrinks phone
  photos before sending.
- The Worker validates every field again on the server: dates, nights, group
  size, capacity, availability, phone and email.
- Unpaid forms never block the calendar. A row blocks a night only once a
  screenshot arrives (`Payment review`) or you confirm it. That means two people
  can send forms for the same night; whoever's screenshot lands first is
  holding it. Check the `Payment review` column before you confirm, and if two
  screenshots land for one night, move one guest or refund by hand.
