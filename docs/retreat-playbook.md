# Groups & retreats — the 30-day money plan

_For EKA Forest, Vattavada. Built 19 November 2026._

---

## The idea in one page

You already own the hard part: eleven tents, a kitchen, a manager, a live booking system, a 9.5/10 rating and 12,000 people following the camp.

The fastest money is not a new side hustle. It is **selling the camp to groups** — companies, retreat facilitators, photographers, colleges, families — who bring 15–22 people at once. One group booking is worth 15–25 couple bookings, and your manager already knows how to host.

The page at **ekaforest.com/retreats/** is built for that buyer. It is an enquiry machine, not a brochure: capacity, inclusions, sample run-sheet, indicative rates, organiser FAQ and a form that opens WhatsApp with the brief already written.

The work from here is a **20-minute day**: ten personalised messages, five follow-ups, one reply block. No ads, no new software, no capital.

**Honest limit:** I can build the page, the pitch and the tracking. I cannot create accounts, send messages as you, accept payments, or guarantee income. The first booking needs a human to press send and then reply.

---

## What is already built

| Asset | Where | What it does |
|---|---|---|
| Group & retreats page | `retreats/index.html` → `/retreats/` | The offer, the proof, the quote logic and the enquiry form |
| Page styles | `assets/retreats.css` | Matches the site; responsive; print styles for a PDF venue sheet |
| Enquiry form | `assets/retreats.js` | Validates, composes a WhatsApp message and an email fallback. No backend, no new keys |
| Navigation | every page | “Events” is now “Retreats” and points to the new page |
| Old sample events | `/events/` | Redirects to `/retreats/`; sample pages are `noindex` |
| Sitemap | `sitemap.xml` | Removed the sample URLs, added `/retreats/` |
| Schema | `index.html` | Fixed the placeholder phone, added `numberOfRooms`, Facebook and Booking.com profiles |
| Pipeline tracker | `docs/retreat-pipeline.csv` | One row per target, so follow-ups don’t fall through |

The page uses **indicative** rates. They are a starting point, not a promise. Change them the moment your real costs say something different.

---

## The honest maths

### One group, two nights

| Package | What is in it | Per person / night | 16 guests × 2 nights |
|---|---|---:|---:|
| Essential | Tent, breakfast, campfire | ₹2,800 | ₹89,600 |
| Gather | Tent, all meals, campfire, one guided walk | ₹4,200 | ₹1,34,400 |
| Retreat | Exclusive camp, all meals, two guided experiences, workshop space | ₹5,800 | ₹1,85,600 |

At 22 guests the same packages are roughly ₹1.23 lakh, ₹1.85 lakh and ₹2.55 lakh.

### A planning estimate, not your accounts

Assume ₹800–1,200 per guest per night in variable costs (food, staff/guide, fire, utilities, laundry). At the **Gather** rate with 18 guests for two nights:

- Revenue: ₹1,51,200
- Variable costs: ~₹36,000
- Contribution before fixed costs: **~₹1,15,000**

Replace those cost numbers with your real kitchen and staff numbers before you rely on them.

### Why groups beat couple bookings

A couple booking one tent for two nights at ₹4,000 is ₹4,000. The same two people inside an 18-person group at ₹4,200 per person per night are ₹16,800 — and nine tents are full instead of one.

### Why direct matters

Booking.com and Agoda take a commission (typically 15–18%). On a ₹1.5 lakh group booking, that is ₹22,000–27,000. Direct enquiries keep it.

### The realistic target

- **2 group bookings a month** at ₹1.3–1.8 lakh each
- **8–12 direct couple bookings** as the baseline
- A 30-day sprint of 50 targets usually produces 1–2 group bookings, not ten. One pays for the whole sprint many times over.

---

## The offer

### The one sentence

> “Take the whole camp — eleven tents, twenty-two people, two hours from Munnar — for a company offsite, a facilitator-led retreat, a shoot or a family gathering. We handle the tents, food and fire; you bring the group and the programme.”

### What is included

- Eleven canvas tents, two guests each; single occupancy on request
- Bedding, blankets, towels
- Shared washrooms with hot water
- Home-style breakfast, lunch and dinner; veg and non-veg; dietary needs on request
- Campfire and stargazing, weather permitting
- Farm, village and shola walks with a local guide
- Parking, Wi-Fi, terrace and garden
- Check-in 1 PM, check-out 11 AM
- Exclusive use when all eleven tents are booked

### What is not included (say it before they ask)

- Travel to Vattavada
- Alcohol (confirm the camp policy first)
- Guided experiences beyond the package
- Shoot location fees, props, crew meals outside the plan
- Anything promised verbally that is not in the written quote

### The three packages

| Package | Best for | Positioning |
|---|---|---|
| Essential | Budget-conscious college and club trips | “The camp, the beds and the fire.” |
| Gather | Companies, families, friend reunions | “The full weekend, meals and a guided walk.” |
| Retreat | Facilitators and premium offsites | “The whole camp, two experiences and a room to work.” |

Do not discount the package. Adjust what is inside it (one fewer meal, no guided walk, fewer tents) and keep the price honest.

---

## Who to sell to

### 1. Retreat facilitators — the best first call

Yoga, breathwork, women’s circles, writing, photography, dance, wellness, leadership. They already sell paid retreats and usually do not own a venue. They bring 12–20 people, book 4–12 weeks ahead, and care about: a quiet setting, good food, beds, a space to hold a session, and a venue partner who does not compete with them.

**Where to find them:** Instagram search — “yoga retreat Kochi”, “breathwork Bangalore”, “women’s circle Kerala”, “photography workshop India”, “wellness retreat Tamil Nadu”. Look for 2k–50k followers, a retreat page, and a date announcement. Google — “yoga studio Kochi”, “retreat facilitator Kerala”. Ask past guests who run workshops.

**The pitch:** “You bring the group and the programme. We handle the venue, food and local logistics. You keep your ticket revenue; you pay us a per-person rate.”

### 2. Companies — the biggest cheque

20–200 person companies in Kochi (Infopark), Trivandrum (Technopark), Coimbatore, Bangalore and Chennai. The buyer is a founder, HR lead or office manager. They care about: a clear all-inclusive price, an invoice, travel time, food, a space for a session, and something that does not feel like a hotel conference room.

**Where to find them:** LinkedIn — “HR manager” + “Kochi” / “Infopark” / “Technopark”; “founder” + “Bangalore” + 11–50 employees. Ask your own network for introductions. Local startup groups and co-working spaces.

**The pitch:** “An offsite for 22, two hours from Munnar, where the camp is exclusively yours. One price, meals and stays included.”

### 3. Photographers and production — the midweek fill

Pre-wedding, fashion, film, documentary, music videos. They need forest, ridge, farm and night-sky backdrops, a place to base the crew, and meals. They book midweek and pay for location use.

**Where to find them:** Instagram — “pre-wedding photographer Kochi”, “wedding photographer Coimbatore”, “production house Kerala”. Wedding planners. Photo collectives.

**The pitch:** “Forest, ridge, farm and night sky within a few minutes of camp. Crew stays and meals can be included.”

### 4. Families and friend reunions — the easiest yes

People who already know the camp or have seen it on Instagram. 12–22 people, one long table, a birthday or anniversary. Highest margin, shortest sales cycle, no invoice needed.

**Where to find them:** your past guests, Instagram DMs, the WhatsApp list, comments on your posts.

**The pitch:** “Take the whole camp for your people. No strangers, one fire, one long table.”

### 5. Colleges and clubs — the weekday fill

Trekking clubs, photography clubs, NSS/NCC units, college departments. 20–22 students, budget ₹1,500–2,500 per head, travel by bus. Lower margin, but they fill Sundays–Thursdays and bring future guests.

**Where to find them:** college trekking clubs on Instagram, Kerala/Karnataka travel groups on Facebook, alumni groups.

**The pitch:** “Twenty-two beds, farm and shola walks, a campfire, and a price that works for a student group.”

---

## Build the list

Aim for **50 named targets** in two hours. Not “yoga studios” — actual people and accounts.

| Segment | Target | Where | What to note |
|---|---:|---|---|
| Retreat facilitators | 20 | Instagram, Google | Name, city, audience size, next retreat date, one real detail |
| Companies | 15 | LinkedIn, network | Name, role, company size, city, recent post |
| Photographers / production | 10 | Instagram, wedding planners | Name, city, style, crew size |
| Colleges / clubs | 5 | Instagram, Facebook | Club name, college, city, event history |

Use `docs/retreat-pipeline.csv`. One row per target. Log the first touch, the follow-up date and the next action. If it is not in the sheet, it will be forgotten.

### The personalisation rule

Every first message must contain one sentence that proves you looked:

- “I saw your December women’s circle at Fort Kochi.”
- “Your team’s offsite photos from last year came up on my feed.”
- “The pre-wedding shoot you did in Munnar last month is beautiful.”

No personalisation, no send. A generic blast burns the list and looks like spam.

---

## The 20-minute day

| Minutes | Action |
|---:|---|
| 8 | Send 10 new, personalised messages (5 Instagram, 3 email, 2 LinkedIn) |
| 3 | Follow up with 5 people from 3–5 days ago |
| 4 | Reply to everyone who answered; book calls; send quotes |
| 3 | Log the day in the tracker; set tomorrow’s follow-ups |
| 2 | One story or reel: a group photo, the fire, an open weekend |

That is it. No ads, no cold-calling marathon, no new tool.

### The weekly scoreboard

| Metric | Weekly target | Why |
|---|---:|---|
| New messages | 50 | Volume is the input you control |
| Replies | 5–10 | 10–20% is a healthy cold reply rate |
| Calls | 2–3 | A call is the real buying signal |
| Quotes sent | 1–2 | A quote is a live opportunity |
| Bookings | 1 every 2 weeks | One booking pays for the month |

If 50 messages produce **zero** replies, the list or the first line is wrong — not the volume. Fix the personalisation before sending 50 more.

---

## The 14-day launch

### Day 1 — decide the three numbers

- Per-person rates: Essential / Gather / Retreat
- Advance percentage and cancellation terms
- Who replies to enquiries, and within how long

Update the three rates in `retreats/index.html` (search for `₹2,800`, `₹4,200`, `₹5,800`) if they change. Update the advance/cancellation answer in the FAQ.

### Day 2 — build the list

30 targets minimum: 10 facilitators, 10 companies, 5 photographers, 5 colleges. Put them in the tracker.

### Day 3 — facilitators first

Send 10 personalised Instagram DMs or emails to facilitators. Attach nothing on the first message. Ask for a 15-minute call or permission to send the venue sheet.

### Day 4 — companies

Send 10 corporate emails. Subject lines that work: “An offsite for 22, two hours from Munnar” or “A private camp for your team offsite”.

### Day 5 — content and follow-up

Post one reel or carousel: group photo, fire, the ridge, “three weekends open for retreats this winter”. Follow up with day-3 sends.

### Day 6 — calls and quotes

Take the calls. Use the discovery script. Send a written quote the same day. Offer to hold dates for 48 hours.

### Day 7 — review

Count messages, replies, calls, quotes. Double down on the segment with the most replies. Drop the segment with none.

### Days 8–14 — repeat

Ten new messages a day. Five follow-ups. One quote a week. Ask every warm contact for one referral: “Who else do you know who runs retreats?”

---

## Scripts

Replace `{Name}`, `{detail}`, `{month}` and `{dates}`. Keep them short. No attachments on the first touch.

### 1. Facilitator — email

**Subject:** A Vattavada venue for your next retreat (11 tents, 22 guests)

```
Hi {Name},

I came across {detail} — {one specific thing about their work}.

I’m writing from EKA Forest, a small tent camp in Vattavada, about two hours past Munnar. We host facilitator-led retreats for up to 22 people: eleven tents, home-style meals, a campfire, farm and shola walks, and a private camp. You bring the programme and your group; we handle the venue, beds, food and local logistics.

We have a few open long weekends in {month}. If you’re planning a retreat, I can send a venue sheet and a quote for your dates. Would a 15-minute call this week be useful?

Warmly,
{Your name}
EKA Forest, Vattavada
+91 70122 93538 · ekaforest.com/retreats
```

### 2. Facilitator — Instagram DM

```
Hi {Name} — I loved {detail}. I’m from EKA Forest, a private tent camp in Vattavada (Munnar) for up to 22. We host facilitator-led retreats: tents, all meals, campfire, forest walks, your programme. If you’re planning dates for {month}, I’d love to send a venue sheet and a quote. — {Your name}, +91 70122 93538
```

### 3. Company — email

**Subject:** An offsite for 22, two hours from Munnar

```
Hi {Name},

Most offsites end up in a hotel conference room. We offer the opposite: a private tent camp for up to 22 people in the eucalyptus woods above Vattavada, two hours from Munnar.

Your team gets eleven tents, all meals, a campfire, farm and shola walks, and a camp that is exclusively yours. We can hold a workshop session on the terrace or in the garden and build the run-sheet around your agenda. One all-inclusive price; no conference-room hire, no per-head surprises.

If you’re planning a {quarter} offsite, I can send a venue sheet and a quote for your dates. Would that be useful?

{Your name}
EKA Forest
+91 70122 93538 · ekaforest.com/retreats
```

If they need a GST invoice, say: “Tell me your invoice requirements and I’ll confirm.” Do not claim a GST registration you have not confirmed.

### 4. Company — LinkedIn

```
Hi {Name} — I run EKA Forest, a private tent camp in Vattavada (Munnar) for up to 22. We’re hosting company offsites this {quarter}: the whole camp, all meals, campfire, forest walks, one price. If your team is planning an offsite, I can send a venue sheet. Would that be useful?
```

### 5. Follow-up — day 4

```
Hi {Name}, floating this back up. We have {dates} open and I can hold one for a few days while you decide. Happy to send photos or do a quick video walkthrough. — {Your name}
```

### 6. Past guest — WhatsApp

```
Hi {Name}, it’s {Your name} from EKA Forest. Thank you for staying with us in {month}. We’re opening the winter calendar and keeping a few tents for direct guests. If you’d like to come back, reply with your dates and I’ll hold one for you.
```

Only add an offer if the owner has approved it. Do not invent a discount.

### 7. Review request — after checkout

```
Hi {Name}, thank you for staying at EKA Forest. If you have two minutes, a Google review helps a small camp like ours more than anything else: {Google review link}. And if you’d like to come back, message me here — booking direct is the best way to support us.
```

### 8. Discovery call — five questions

1. How many people, and what is the occasion?
2. Which dates are you considering?
3. What would make this a yes — budget, food, travel, programme or privacy?
4. Does anyone need an invoice or a purchase order?
5. Who else is involved in the decision?

Then: “Here is what I’d suggest for your group. I’ll send a written quote today. If the dates work, we can hold them with an advance.”

### 9. Referral ask — after a good call

```
Thanks for the call, {Name}. One small ask: who else do you know who runs retreats or plans team offsites? A one-line introduction is enough.
```

---

## Quotes, deposits and terms

Send a written quote the same day as the call. A WhatsApp voice note is not a quote.

### Quote template

```
EKA Forest — group stay quote

Group: {name}
Dates: {check-in} to {check-out} ({n} nights)
Guests: {n} paying guests
Package: {Essential / Gather / Retreat}

Included: {tents, meals, campfire, walks, workshop space}
Not included: {travel, alcohol, extra experiences, shoot fees}
Total: ₹{amount}
Advance to hold: ₹{amount} ({n}%)
Balance: due {at check-in / before arrival}
Cancellation: {terms}
Quote valid until: {date}

To hold: pay the advance to {UPI ID} and send the screenshot.
```

### Rules that protect the camp

- No dates held without an advance.
- No group above 22 paying guests without a written plan for extra beds and staff.
- No verbal promise of an activity, menu or discount that is not in the quote.
- No group booking through the standard ₹2,000 couple flow — use a group quote and a group advance.
- Keep the cancellation terms simple and in writing.

---

## Delivery run-sheet

The owner should not be chasing the manager. Send one message with everything.

### Two weeks before

- Final headcount, children, dietary needs
- Arrival time and whether they will cross the check-post before 6 PM
- Programme and any facilitator requirements
- Tents: couples, singles, families
- Add-ons: guided walk, Top Station drive, shoot, celebration set-up
- Balance payment status

### One week before

- Exact pin and driving notes
- Check-post timing and what to do if late
- Packing list (warm layers, torch, shoes, medicines)
- Manager’s name and number
- Weather and what to expect

### Two days before

- Final numbers to the kitchen
- Confirm the fire, guide and any outside facilitator
- Confirm the balance
- Send the manager the final run-sheet

### After checkout

- Ask for the review (script 7)
- Ask if they want the same dates next year
- Log the group and the source in the tracker

---

## Quick wins that need no new traffic

These are small, but they compound while the group pipeline runs.

1. **Review engine.** Every guest gets script 7 at checkout. Eleven Booking.com reviews is thin; Google reviews are what local search shows. Get the Google review link from the Business Profile and put it in the manager’s WhatsApp quick replies.
2. **Past-guest campaign.** Once a month, message past guests with the open dates. Direct, no commission.
3. **OTA conversion.** Put a small card in each tent: “Book direct next time — message us on WhatsApp and we’ll look after you.” OTA guests are already sold on the place.
4. **Instagram bio.** Point the link to `ekaforest.com/retreats/` for the season, not just the home page. Add “Retreats & offsites” to the bio.
5. **Google Business Profile.** Add “Retreat venue”, “Corporate offsite venue” and “Event venue” to the services. Post the group photos. Answer the Q&A.
6. **Booking.com / Agoda copy.** Add one line to the property description: “The whole camp can be booked for groups of up to 22 — retreats, offsites and celebrations.” Add group photos.
7. **One referral ask a week.** Every happy guest, every facilitator, every vendor: “Who else do you know who runs retreats?”
8. **Local partners.** Munnar taxi/jeep operators, wedding planners, photographers, homestays that are full. Offer a referral fee or a reciprocal booking.
9. **Midweek shoots.** Photographers fill Sunday–Thursday. One shoot day can pay for a quiet week.
10. **A single open-weekend post.** “Three weekends open for retreats this winter — tag a facilitator.” Pin it. Repeat monthly.

---

## Metrics

Track these in the pipeline sheet, not in your head.

| Stage | What to count | Healthy sign |
|---|---|---|
| Messages | New first touches | 50/week |
| Replies | Any human reply | 10–20% |
| Calls | Booked and held | 20–30% of replies |
| Quotes | Written and sent | 1–2/week |
| Holds | Advance paid | 1–2/month |
| Bookings | Confirmed group | 1–2/month |
| Revenue | Group + direct | ₹2–4 lakh/month |

Do not judge the plan on week one. Cold pipeline takes 2–6 weeks. Judge it on **replies and calls** in weeks 1–2, and on **quotes and holds** in weeks 3–4.

---

## What not to do

- Do not buy a lead list and blast it.
- Do not send the same DM to 50 people. Instagram will restrict the account and the list will go cold.
- Do not promise an activity, amenity or view that you have not confirmed for those dates.
- Do not take a group larger than the camp and staff can hold.
- Do not accept a group without a written quote and an advance.
- Do not discount below the cost floor to win a booking. Remove a meal or an add-on instead.
- Do not rely on Booking.com or Agoda for group business. They are for couples and rooms.
- Do not leave the sample `/events/` page live. It is now redirected; keep it that way until there are real dated events.

---

## Three decisions only you can make

1. **Rates.** Approve the three indicative rates, or send the real ones. The page is easy to change.
2. **Terms.** Confirm the advance percentage and the cancellation policy for groups.
3. **Owner of the inbox.** Who replies to a group enquiry, and within how long? A 24-hour reply is the promise on the page. If that is not real, change the promise.

Optional but useful: GST/invoice status, alcohol policy, shoot location fee, and whether day-use programmes are possible.

---

## The first message to send today

Pick one facilitator you already follow. Send this, with one real detail:

```
Hi {Name} — I loved {detail}. I’m from EKA Forest, a private tent camp in Vattavada (Munnar) for up to 22. We host facilitator-led retreats: tents, all meals, campfire, forest walks, your programme. If you’re planning dates for {month}, I’d love to send a venue sheet and a quote. — {Your name}, +91 70122 93538
```

Then log it in `docs/retreat-pipeline.csv` and send nine more.

The page is the easy part. The money is in the ten messages.
