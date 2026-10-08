# EKA Forest

Static one-page site for **EKA Forest**, a tent stay in the eucalyptus and pine woods of Vattavada (past Top Station, about 45 km from Munnar, Kerala). Visitors book on WhatsApp. There is no build step and no framework: the browser loads `index.html` and the files next to it.

This copy is the preview for [https://raonehere.github.io/EKA/](https://raonehere.github.io/EKA/). That address stays a GitHub “site not found” page until Pages is turned on once (see Deployment). The real domain (`ekaforest.in`) is still a placeholder. The page sends `noindex, nofollow`, so search engines that honour that tag should leave the preview alone.

## File structure

```
index.html          the page
assets/styles.css   layout and design tokens
assets/main.js      year in the footer, one-open FAQ, map loads on click
book.html           booking page (see Bookings)
assets/book.js      availability check, price summary, UPI payment and screenshot upload
worker/             Cloudflare Worker that reads and writes bookings in Notion
assets/fonts/       Oswald, Inter, Sankofa Display (woff2, self-hosted)
assets/img/         logo, wordmark, grain texture, icons, social image
robots.txt          Disallow: / (see Deployment — crawlers will not read this file here)
sitemap.xml         lists the placeholder domain only
.nojekyll           tells GitHub Pages to skip Jekyll and serve the files as they are
.github/workflows/pages.yml   publishes this folder to GitHub Pages
```

Asset links are relative (`assets/...`, and inside the CSS `fonts/` and `img/`). That is what makes the same files work on your laptop and under `/EKA/` on GitHub Pages. Do not switch them to root-absolute paths such as `/assets/...`; those would look for files on `raonehere.github.io` itself and miss this folder.

## Design tokens

Defined on `:root` in `assets/styles.css`.

| Token | Value | Where it shows up |
| --- | --- | --- |
| Paper / background | `#C5B8A5` | Page background, with a tiled grain |
| EKA brown | `#654330` | Headings, nav, buttons, rules |
| Body text | `#5C3C2B` | Paragraphs. Same brown, darkened so it stays readable on the paper |
| EKA green | `#405E3D` | Brand accent (reserved in the tokens) |
| Headings | Oswald Light | Section titles and the nav |
| Body | Inter | Paragraphs, FAQ, footer |
| Buttons | Sankofa Display | Book and map buttons |

Also in the file, if you need them: EKA black `#242524`, EKA white `#E9EDEF`.

The nav gaps are the visible space between the words, not the CSS boxes. Letter-spacing and each letter’s side bearing are subtracted so Contact–Book, Book–logo, logo–Gallery, and Gallery–Instagram look even. That adjustment lives in the header block of `styles.css`.

## Run it locally

Any static file server works. From this folder:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080 . Opening `index.html` as a file (`file://`) is enough for a glance, but a local server matches how the fonts and the map click behave once the site is published.

## Deployment

The live preview is a GitHub Pages project site:

**https://raonehere.github.io/EKA/**

`.github/workflows/pages.yml` publishes the repository root on every push to `main`. It uses GitHub’s Pages actions (`configure-pages`, `upload-pages-artifact`, `deploy-pages`). `.nojekyll` is included so Pages serves the files as they are and does not run them through Jekyll.

Pages could not be switched on from the import (the token cannot change repository settings). Once, in this repo: **Settings → Pages → Source → GitHub Actions**. After that, the workflow publishes the site. The other option on that screen is **Deploy from a branch**, branch `main`, folder `/` (root); that serves these files directly and does not need the workflow.

`robots.txt` in this repo is not what crawlers consult. On a project site they request `https://raonehere.github.io/robots.txt` (the user site’s root), not `https://raonehere.github.io/EKA/robots.txt`. The tag that actually keeps this preview out of search results is in `index.html`:

```html
<meta name="robots" content="noindex, nofollow">
```

Leave that tag in place until the site moves to its real domain and you want it indexed. When `ekaforest.in` is confirmed, update the canonical URL, Open Graph URL, JSON-LD `url`, and `sitemap.xml`, then remove `noindex`.

## Bookings

`book.html` is the booking page. Guests check availability, fill in their details, pay by UPI (QR code or UPI ID) and upload the payment screenshot. Each booking becomes a row in the Notion bookings database with status **Payment submitted**. Check the screenshot in Notion, then set the status to **Confirmed**, or to **Cancelled** to free the tents.

The browser cannot talk to Notion directly, so `worker/` holds a small Cloudflare Worker that does it:

| Endpoint | What it does |
| --- | --- |
| `GET /api/availability?checkin=&checkout=&guests=` | Free tents per night and the price |
| `POST /api/bookings` | Re-checks availability, uploads the screenshot, creates the Notion row |

Rules live at the top of `worker/src/index.js`: ₹1,850 per person per night (dinner and breakfast), lunch ₹250 per person per day, 10 tents, 2 people per tent (a solo guest takes a whole tent), stays of up to 14 nights. Every row that is not Cancelled holds its tents, including rows added by hand in Notion. If a row has no Tents value, it uses Guests ÷ 2, rounded up. The Notion column names are mapped in the `P` object in the same file. The display prices in `assets/book.js` must match.

Notion setup: create an internal integration, connect it to the bookings database (••• → Connections), then copy `worker/.dev.vars.example` to `worker/.dev.vars` and fill in the token and database id. `node scripts/notion-schema.mjs` (run from `worker/`) lists the database columns.

Run locally: `npx wrangler dev` in `worker/` (API on port 8787) alongside the static server on 8080. The booking page uses `localhost:8787` automatically when opened from localhost.

Deploy: `npx wrangler deploy` in `worker/`, then `npx wrangler secret put NOTION_TOKEN` and `npx wrangler secret put NOTION_DB_ID`. Put the deployed URL in `data-api` on the form in `book.html`.

## Open placeholders

Nothing below is final. Search the repo for the marker before replacing it.

| What | Current stand-in | Where |
| --- | --- | --- |
| WhatsApp number | `910000000000`, shown as +91 00000 00000 | Search `910000000000` (nav Book, about button, footer, floating button, schema `telephone`) |
| Email | `hello@ekaforest.in` | Footer |
| Domain | `ekaforest.in` | Canonical link, Open Graph tags, JSON-LD, `sitemap.xml` |
| Map pin | Vattavada village area, not the property | “How to reach” map and the View on map button. Comment in the HTML is marked A5 |
| UPI ID and QR | `ekaforest@upi`, grey QR panel | `data-upi` and the QR block in `book.html` |
| Booking API URL | `https://eka-booking.REPLACE.workers.dev` | `data-api` in `book.html` |
| Cancellation policy | Not written yet | Stay rules in `book.html` (A7) |
| Photos | Empty brown panels with a caption | About, stays, and the gallery strip. Every photo is a placeholder until real ones are supplied |

Instagram `@eka_forest_` is a real link and is not a placeholder.
