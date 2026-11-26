# Images

All photos and brand marks the website uses live in this folder. CSS, fonts and scripts stay in `assets/`.

The high-resolution masters are not in the repo (they added about 120 MB to every publish). They are in the Google Drive kit, in [01 Originals](https://drive.google.com/drive/folders/1vQesQYrS87E3jrXdxKKdCsqD5GUSrJKP). Finished crops go in [02 Cropped – drop here](https://drive.google.com/drive/folders/1B2RHHNDhsDE_5z6DA4KgE04IzuuCRjkB). See the [crop guide](https://docs.google.com/spreadsheets/d/1fWt7iDDuVLr3Ux9A1PhUUsV4t5PRcEGwtnNVpWVkYag/edit?usp=drivesdk).

## Folders

| Folder | What’s in it | Used on |
| --- | --- | --- |
| `gallery/accommodation/` | A-frame tents, interiors, washrooms | Homepage and Gallery carousels, booking form strip, some journal photos |
| `gallery/reception/` | Campfire, garden, walkways, guests, pets | Gallery, Stays (campfire), journals, booking form |
| `gallery/views/` | Valley and forest views, sunsets, mist | Gallery, homepage intro (`eka-view-3.jpg`) |
| `gallery/farm/` | Farm gate and terrace farming | Gallery, journals |
| `gallery/village-walks/` | Village and farm walks | Gallery, Stays, booking form |
| `gallery/trekking/` | Meadow and shola treks, waterfalls | Gallery, Stays, journals, booking form |
| `events/` | Event card photos | Events page, Events share image source |
| `share/` | Open Graph images (`og-home`, `og-events`, `og-gallery`) | Link previews |
| `brand/` | Logo, wordmark, favicons, paper grain texture | Header, footer, icons, page background |
| `about/`, `stays/`, `journals/` | Empty for now | When a slot needs its own crop (1:1 intro, 4:3 cards, 16:9 headers), drop the new file here and point the page or the sheet at it. Until then those slots reuse the gallery file, so we don’t keep copies. |

## Naming

Lowercase kebab-case: `guests-at-eka-7.jpg`, `walkway-to-eka-2.jpg`.

One file per photo. If the same photo appears in Stays, the Gallery and a journal, every page points at the same path. Don’t add a second copy.

`guests-at-eka-7.jpg` used to be saved as `guestsateka-3.jpg`. The picture is Guests at EKA 7.

## Ratios and export sizes

Export as JPEG, sRGB, quality 80–90. Crop from the original, not from another crop.

| Folder or slot | Ratio | Export size |
| --- | --- | --- |
| Homepage intro (when a dedicated crop is ready, in `about/`) | **1:1** | 1600 × 1600 |
| Stays cards (`stays/`, or a 4:3 crop of a gallery photo) | **4:3** | 1600 × 1200 |
| Journal cards | **4:3** | 1600 × 1200 |
| Journal post headers | **16:9** | 1920 × 1080 |
| Event cards | **4:5** | 1280 × 1600 |
| Gallery regular tiles | **4:5** | 1200 × 1500 |
| Gallery tall tiles | **2:3** | 800 × 1200 |
| Share previews (`share/`) | **2:1** | 1200 × 600 |

The intro box on the site is already 1:1, and share tags expect 2:1, so those crops can go live as soon as they are ready. Until then the existing uncropped files are shown with `object-fit: cover`.

For Events, keep faces in the middle 60% of the height: phones use a wider crop that hides the top and bottom.

## How to swap a photo

1. Export the crop at the size above, with the **same file name** as the file you are replacing.
2. Replace the file in this folder (keep the path and name).
3. That’s it — every page that uses that photo will update on the next publish.

To use a new file name, or to give a slot its own crop (for example a 1:1 intro in `about/`), change the path in the page or in the Google Sheet “EKA Forest – Website Content” (About, Stays, Journals, Events). Paths are relative to the site root, like `images/gallery/views/eka-view-3.jpg`.

The Gallery on the site is written in the HTML, not read from the Gallery tab of the sheet.
