# EKA Forest

Static site for **EKA Forest**, a tent stay in the eucalyptus and pine woods of Vattavada (past Top Station, about 45 km from Munnar, Kerala).

The site is served at **https://ekaforest.com/** from this repository, via GitHub Pages (branch `main`, folder `/`). There is no build step. Asset links are relative, so the same files work locally and at the domain root.

## Local preview

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080

## Content

Page copy can be updated from the Google Sheet “EKA Forest – Website Content” through `assets/cms.js`. The HTML remains the fallback if the sheet cannot be loaded.

## DNS

Point the domain at GitHub Pages (keep the BigRock nameservers):

- A records for `@` (ekaforest.com): `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- CNAME for `www`: `raonehere.github.io`
