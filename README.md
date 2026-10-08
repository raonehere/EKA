# EKA Forest

Static one-page site for **EKA Forest**, a tent stay in the eucalyptus and pine woods of Vattavada (past Top Station, about 45 km from Munnar, Kerala). Visitors book on WhatsApp. There is no build step and no framework: the browser loads `index.html` and the files next to it.

This copy is the preview that GitHub Pages serves at [https://raonehere.github.io/EKA/](https://raonehere.github.io/EKA/). The real domain (`ekaforest.in`) is still a placeholder. The page sends `noindex, nofollow`, so search engines that honour that tag should leave the preview alone.

## File structure

```
index.html          the page
assets/styles.css   layout and design tokens
assets/main.js      year in the footer, one-open FAQ, map loads on click
assets/fonts/       Oswald, Inter, Sankofa Display (woff2, self-hosted)
assets/img/         logo, wordmark, grain texture, icons, social image
robots.txt          Disallow: / (see Deployment — crawlers will not read this file here)
sitemap.xml         lists the placeholder domain only
.nojekyll           tells GitHub Pages to skip Jekyll and serve the files as they are
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

## Open placeholders

Nothing below is final. Search the repo for the marker before replacing it.

| What | Current stand-in | Where |
| --- | --- | --- |
| WhatsApp number | `910000000000`, shown as +91 00000 00000 | Search `910000000000` (nav Book, about button, footer, floating button, schema `telephone`) |
| Email | `hello@ekaforest.in` | Footer |
| Domain | `ekaforest.in` | Canonical link, Open Graph tags, JSON-LD, `sitemap.xml` |
| Map pin | Vattavada village area, not the property | “How to reach” map and the View on map button. Comment in the HTML is marked A5 |
| Photos | Empty brown panels with a caption | About, stays, and the gallery strip. Every photo is a placeholder until real ones are supplied |

Instagram `@eka_forest_` is a real link and is not a placeholder.
