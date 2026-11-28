/**
 * EKA Forest, booking API (Cloudflare Worker)
 *
 *   GET  /health              → checks Notion access + database schema
 *   GET  /availability        → free tents per night
 *   POST /bookings            → validates dates and holds them in Notion (no payment gateway)
 *   POST /bookings/id         → stores the guest's ID proof (photo or PDF) in Notion
 *   POST /bookings/screenshot → stores the guest's UPI payment screenshot in Notion
 *   GET  /booking             → one booking, for the private manage link
 *   POST /booking/reschedule  → guest moves their own dates (advance carries over)
 *   POST /booking/cancel      → guest cancels; the nights free up, advance is not refunded
 *
 *   GET  /owner/summary       → numbers for the owner dashboard
 *   GET  /owner/digest        → one WhatsApp-ready message about today
 *   POST /owner/status        → confirm or cancel a booking from the dashboard
 *   POST /owner/block         → take tents out of sale for some nights (owner only)
 *
 * Money is settled by UPI: the guest scans a QR, pays the advance (a percentage
 * of their total), and uploads the screenshot. The Worker files it in Notion and
 * marks the row "Payment review" so the owner confirms it by hand.
 *
 * Secrets and settings live in Worker environment variables:
 *   NOTION_TOKEN, NOTION_DB, UPI_ID, UPI_NAME, MANAGE_SECRET, SITE_URL,
 *   ALLOWED_ORIGINS, UNITS, TENT_CAPACITY, ADVANCE_PERCENT, CHANGE_CUTOFF_HOURS,
 *   OWNER_TOKEN, WA_NOTIFY, EXPENSES_CSV_URL (the expenses sheet as CSV)
 *
 * Notion property names live in FIELDS, just below. That map is the only place
 * this file names a column.
 */

const NOTION_VERSION = '2022-06-28';
// File uploads and attaching them to a page need a much newer API version than
// the database calls, which still work on the older one.
const NOTION_FILES_VERSION = '2026-03-11';
const NOTION = 'https://api.notion.com/v1';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Price in rupees. Children 5 to 10 pay half, under 5 is free. Lunches are counted per person, at most one a night. */
function bookingPrice(env, nights, adults, fiveToTen, lunches) {
  const perNight = Number(env.PRICE_PER_NIGHT) || 1850;
  const lunchRate = Number(env.LUNCH_PRICE) || 250;
  const stay = nights * (adults * perNight + fiveToTen * Math.round(perNight / 2));
  const lunchTotal = lunches * (adults + fiveToTen) * lunchRate;
  const total = stay + lunchTotal;
  const due = advanceFor(env, total);
  return { stay, lunch: lunchTotal, total, advance: due, balance: total - due };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = ('/' + url.pathname.replace(/^\/+|\/+$/g, '')).replace(/\/$/, '') || '/';
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      let res;
      if (path === '/' || path === '/health') res = await health(env);
      else if (path === '/availability') res = await availability(url, env, ctx);
      else if (path === '/bookings') res = await createBooking(request, env);
      else if (path === '/bookings/screenshot') res = await uploadScreenshot(request, env);
      else if (path === '/bookings/id') res = await uploadIdProof(request, env);
      else if (path === '/booking' && request.method === 'GET') res = await getBooking(url, env);
      else if (path === '/booking/reschedule') res = await rescheduleBooking(request, env);
      else if (path === '/booking/cancel') res = await cancelBooking(request, env);
      else if (path === '/owner/summary' && request.method === 'GET') res = await ownerSummary(request, env);
      else if (path === '/owner/digest' && request.method === 'GET') res = await ownerDigest(request, env);
      else if (path === '/owner/status' && request.method === 'POST') res = await ownerStatus(request, env);
      else if (path === '/owner/discount' && request.method === 'POST') res = await ownerDiscount(request, env);
      else if (path === '/owner/block' && request.method === 'POST') res = await ownerBlock(request, env);
      else if (path === '/owner/month' && request.method === 'GET') res = await ownerMonth(request, env);
      else if (path === '/owner/expenses' && request.method === 'GET') res = await ownerExpenses(request, env);
      else res = json({ error: 'Not found' }, 404);

      if (!Object.keys(cors).length) return res;
      const headers = new Headers(res.headers);
      Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
      return new Response(res.body, { status: res.status, headers });
    } catch (err) {
      console.error(err);
      return json({ error: 'Something went wrong on our side. Please message us on WhatsApp.' }, 500, cors);
    }
  }
};

/* ------------------------------------------------------------------ utils */

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
  });
}

function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || 'https://ekaforest.com,https://www.ekaforest.com')
    .split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('origin') || '';
  const ok = allowed.includes('*') || allowed.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin);
  if (!ok) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin'
  };
}

function units(env) { return Math.max(1, parseInt(env.UNITS || '11', 10)); }
function capacity(env) { return Math.max(1, parseInt(env.TENT_CAPACITY || '2', 10)); }
function advancePercent(env) { return Math.min(100, Math.max(1, parseInt(env.ADVANCE_PERCENT || '20', 10))); }
function advanceFor(env, total) { return Math.round(total * advancePercent(env) / 100); }
function cutoffHours(env) { return Math.max(0, parseInt(env.CHANGE_CUTOFF_HOURS || '48', 10)); }

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isDate(s) { return typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')); }
function addDays(s, n) {
  const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function nightsBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
function eachNight(a, b) {
  const out = []; let d = a;
  while (d < b) { out.push(d); d = addDays(d, 1); }
  return out;
}
function clean(v, max = 500) { return String(v == null ? '' : v).trim().slice(0, max); }

/* ----------------------------------------------------------------- notion */

async function notion(env, path, init = {}, version) {
  const res = await fetch(NOTION + path, {
    ...init,
    headers: {
      authorization: `Bearer ${env.NOTION_TOKEN}`,
      'notion-version': version || NOTION_VERSION,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const e = new Error(`Notion ${res.status}: ${data.message || 'request failed'}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

/* ---------------------------------------------------------------- the schema */

/* The columns this Worker needs, and the names they have in the Notion
   database. If you rename a column in Notion, change the title on the right , 
   nothing else in this file mentions a Notion property by name.

   optional: true means the Worker works without it. /health will not complain,
   and a booking still saves; you just lose that bit of detail. */
const FIELDS = {
  reference:  { prop: 'reference',                   type: 'rich_text' },  // EKA-261214-A1B2
  name:       { prop: 'Guest Name',                  type: 'title' },
  phone:      { prop: 'Phone',                       type: 'phone_number' },
  email:      { prop: 'Guest Email',                 type: 'email' },
  checkIn:    { prop: 'Check-in',                    type: 'date' },
  checkOut:   { prop: 'Check-Out',                   type: 'date' },
  guests:     { prop: 'Number of people',            type: 'number' },
  notes:      { prop: 'Notes (special request)',     type: 'rich_text' },
  status:     { prop: 'Booking status',              type: 'select' },
  screenshot: { prop: 'Payment',                     type: 'files' },
  idProof:    { prop: 'ID proof',                   type: 'files', optional: true },

  /* Optional. */
  tents:      { prop: 'Tents',                       type: 'number', optional: true },
  advance:    { prop: 'Advance',                     type: 'number', optional: true },
  children:   { prop: 'Children under 10',           type: 'number', optional: true },
  token:      { prop: 'Manage token',                type: 'rich_text', optional: true },
  moves:      { prop: 'Moves',                       type: 'number', optional: true },
  lastChange: { prop: 'Last change',                 type: 'date', optional: true },
  paidAt:     { prop: 'Paid at',                     type: 'date', optional: true },
  type:       { prop: 'Type',                        type: 'select', optional: true },
  source:     { prop: 'Source',                      type: 'select', optional: true },
  terms:      { prop: 'Terms accepted',              type: 'date', optional: true },
  total:      { prop: 'Total amount',                type: 'number', optional: true },
  /* Stored as a percentage (0 to 100). The rupee amount is worked out from
     Total amount whenever a booking is read, so the two cannot drift apart. */
  discount:   { prop: 'Discount',                    type: 'number', optional: true }
};

/** Internal name → Notion property title. */
const P = key => FIELDS[key].prop;

/** Property titles the Worker can live without, as Notion sees them. */
const OPTIONAL = new Set(
  Object.values(FIELDS).filter(f => f.optional).map(f => f.prop)
);

/** Notion lets a column be called "reference " or "Reference". Compare names
 *  with the spaces and capitals taken out, so a stray space cannot break a
 *  booking, which is exactly what happened once. */
const norm = s => String(s || '').trim().toLowerCase();

function resolveColumns(propertyKeys) {
  const keys = propertyKeys || [];
  const map = {};
  for (const key of Object.keys(FIELDS)) {
    const want = FIELDS[key].prop;
    map[key] = keys.find(k => norm(k) === norm(want)) || want;
  }
  return map;
}

/** The database's real property titles, resolved once and kept for five minutes
 *  so a booking does not pay for an extra Notion request. */
let COLUMNS = { db: '', at: 0, map: null };

/* Columns this isolate has already checked or added, so the schema is not
   fetched again for every discount. */
let ENSURED = { db: '', keys: new Set() };

/** Add an optional column to the Notion database if it is not there yet.
 *  The integration needs permission to edit the database for this to work;
 *  if it does not, the caller reports a clear error. */
async function ensureColumn(env, key) {
  if (ENSURED.db !== env.NOTION_DB) ENSURED = { db: env.NOTION_DB, keys: new Set() };
  if (ENSURED.keys.has(key)) return;
  const want = FIELDS[key].prop;
  const db = await notion(env, `/databases/${env.NOTION_DB}`);
  const exists = Object.keys(db.properties || {}).some(n => norm(n) === norm(want));
  if (!exists) {
    await notion(env, `/databases/${env.NOTION_DB}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: { [want]: { number: { format: 'number' } } } })
    });
    COLUMNS = { db: '', at: 0, map: null };
  }
  ENSURED.keys.add(key);
}

async function columns(env) {
  const now = Date.now();
  if (COLUMNS.map && COLUMNS.db === env.NOTION_DB && now - COLUMNS.at < 300000) return COLUMNS.map;
  try {
    const db = await notion(env, `/databases/${env.NOTION_DB}`);
    const map = resolveColumns(Object.keys(db.properties || {}));
    COLUMNS = { db: env.NOTION_DB, at: now, map };
    return map;
  } catch (err) {
    // Let the real request report the failure instead of failing here.
    return resolveColumns([]);
  }
}

/** Read one property from a page, forgiving the same name differences. */
function pick(properties, name) {
  const pr = properties || {};
  if (pr[name]) return pr[name];
  const key = Object.keys(pr).find(k => norm(k) === norm(name));
  return key ? pr[key] : undefined;
}

/** All bookings + blocks that could overlap [from, to).
 *  Pass excludePageId when a guest is moving an existing booking, so their own
 *  nights do not count against them. */
async function loadStays(env, from, to, excludePageId) {
  const C = await columns(env);
  const filter = {
    and: [
      {
        or: [
          { property: C.status, select: { equals: 'Confirmed' } },
          { property: C.status, select: { equals: 'Payment review' } }
        ]
      },
      { property: C.checkOut, date: { on_or_after: from } }
    ]
  };

  const pages = [];
  let cursor;
  do {
    const body = { filter, page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notion(env, `/databases/${env.NOTION_DB}/query`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  const stays = [];
  const cap = capacity(env);
  for (const page of pages) {
    if (excludePageId && page.id === excludePageId) continue;
    const pr = page.properties || {};
    const checkIn = pr[C.checkIn]?.date?.start?.slice(0, 10);
    const checkOut = pr[C.checkOut]?.date?.start?.slice(0, 10);
    if (!checkIn || !checkOut) continue;

    const guests = Number(pr[C.guests]?.number) || 0;
    const type = pr[C.type]?.select?.name || 'Booking';
    // No Tents column? Fall back to two paying guests a tent, solo guests get one.
    const tents = Math.max(1, Number(pr[C.tents]?.number) || Math.ceil(guests / cap) || 1);
    const reference = (pr[C.reference]?.rich_text || [])
      .map(t => t.plain_text || t.text?.content || '').join('').trim();

    // Only a screenshot ("Payment review") or a confirmation blocks a night.
    // A "Pending payment" row is just an enquiry and never holds the calendar.
    stays.push({ checkIn, checkOut, tents, type, reference });
  }

  return stays;
}

function computeNights(stays, from, to, totalUnits) {
  const nights = {};
  for (let d = from; d < to; d = addDays(d, 1)) {
    let used = 0;
    for (const s of stays) {
      if (s.checkIn <= d && d < s.checkOut) used += s.tents;
    }
    nights[d] = Math.max(0, totalUnits - used);
  }
  return nights;
}

/* ------------------------------------------------------------- availability */

async function availability(url, env, ctx) {
  const today = todayIST();
  let from = isDate(url.searchParams.get('from')) ? url.searchParams.get('from') : today;
  let to = isDate(url.searchParams.get('to')) ? url.searchParams.get('to') : addDays(today, 60);

  // A calendar asks for the whole month it is showing, which includes the first
  // few days of the current month. Clamp rather than refuse.
  if (from < today) from = today;
  if (nightsBetween(from, to) > 400) to = addDays(from, 400);
  if (to <= from) return json({ error: 'to must be after from' }, 400);

  const total = units(env);
  const cache = caches.default;
  const cacheKey = new Request(`https://eka-cache.internal/availability?f=${from}&t=${to}&u=${total}`);

  try {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  } catch { /* cache is best-effort */ }

  const stays = await loadStays(env, from, to);
  const nights = computeNights(stays, from, to, total);

  const res = json({
    from, to,
    units: total,
    capacity: capacity(env),
    advancePercent: advancePercent(env),
    currency: 'INR',
    nights
  }, 200, { 'cache-control': 'public, max-age=30' });

  if (ctx && ctx.waitUntil) {
    try { ctx.waitUntil(cache.put(cacheKey, res.clone())); } catch { /* ignore */ }
  }
  return res;
}

/* ------------------------------------------------------------------ orders */

function referenceFor(checkIn) {
  const ymd = checkIn.slice(2).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X');
  return `EKA-${ymd}-${suffix}`;
}

/* ------------------------------------------------------------- upi details */

function upi(env, amount) {
  const id = clean(env.UPI_ID, 60);
  const name = clean(env.UPI_NAME || 'EKA Forest', 40);
  return { id, name, amount };
}

function upiLink(env, reference, amount) {
  const u = upi(env, amount);
  const params = new URLSearchParams({
    pa: u.id,
    pn: u.name,
    am: String(u.amount),
    cu: 'INR',
    tn: `EKA Forest advance ${reference}`
  });
  return `upi://pay?${params.toString()}`;
}

async function createBooking(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, corsHeaders(request, env)); }

  const checkIn = clean(body.checkIn, 10);
  const checkOut = clean(body.checkOut, 10);
  const name = clean(body.name, 80);
  const phone = clean(body.phone, 20).replace(/[\s-]/g, '');
  const email = clean(body.email, 120);
  const notes = clean(body.notes, 900);
  const arrival = clean(body.arrival, 40);
  const pets = clean(body.pets, 40);
  const guests = parseInt(body.guests, 10);
  const adults = parseInt(body.adults, 10) || guests;
  const childrenUnder10 = Math.max(0, parseInt(body.childrenUnder10, 10) || 0);
  const childrenUnder5 = Math.max(0, parseInt(body.childrenUnder5, 10) || 0);
  const childrenFiveToTen = Math.max(0, parseInt(body.childrenFiveToTen, 10) || 0);

  if (!isDate(checkIn) || !isDate(checkOut)) return json({ error: 'Please pick valid dates.' }, 400);
  if (checkIn < todayIST()) return json({ error: 'Those dates are in the past.' }, 400);
  if (!clean(env.UPI_ID, 60)) {
    return json({ error: 'Payments are not set up yet. Please message us on WhatsApp and we will book you in.' }, 503);
  }

  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) return json({ error: 'Check-out must be after check-in.' }, 400);
  if (nights > 10) return json({ error: 'Stays are limited to 10 nights. Message us for longer.' }, 400);

  const lunches = Math.min(nights, Math.min(10, Math.max(0, parseInt(body.lunches, 10) || 0)));
  const cap = capacity(env);
  const total = units(env);
  if (!guests || guests < 1) return json({ error: 'Tell us how many guests are coming.' }, 400);
  // Bigger than the A-frame tents can sleep: taken as a request, priced and checked by hand on WhatsApp.
  const large = adults > total * cap;

  const price = bookingPrice(env, nights, adults, childrenFiveToTen, lunches);
  const advanceDue = large ? 0 : price.advance;
  const tents = Math.max(1, Math.ceil(guests / cap));

  if (name.length < 2) return json({ error: 'Please share your name.' }, 400);
  if (!/^\+91\d{10}$/.test(phone)) return json({ error: 'Enter a 10-digit Indian mobile number.' }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
  if (body.termsAccepted !== true) return json({ error: 'Please accept the advance terms.' }, 400);

  // Live availability check, so a stale calendar cannot double-book a tent.
  if (!large) {
    const stays = await loadStays(env, checkIn, checkOut);
    const free = computeNights(stays, checkIn, checkOut, total);
    for (const night of eachNight(checkIn, checkOut)) {
      if ((free[night] ?? 0) < tents) {
        return json({ error: 'Those dates were just taken. Please choose another night.' }, 409);
      }
    }
  }

  const reference = referenceFor(checkIn);
  const token = await manageToken(env, reference);
  const C = await columns(env);
  const notesText = [notes, arrival && `Arrival: ${arrival}`, pets && pets !== 'No' && `Pets: ${pets}`,
    childrenFiveToTen > 0 && `Children 5 to 10: ${childrenFiveToTen}`,
    childrenUnder5 > 0 && `Children under 5: ${childrenUnder5}`,
    `Lunches: ${lunches} each`,
    large ? 'LARGE GROUP: check availability and price on WhatsApp before confirming.' : `Total: ₹${price.total}, balance at check-in: ₹${price.balance}`]
    .filter(Boolean).join(' · ').slice(0, 900);
  const now = new Date();

  // The Notion row is what blocks the calendar. No payment gateway involved:
  // the guest pays by UPI and uploads a screenshot, and we file it here.
  try {
    await createPage(env, {
      [C.name]: { title: [{ text: { content: name } }] },
      [C.reference]: { rich_text: [{ text: { content: reference } }] },
      [C.phone]: { phone_number: phone },
      [C.email]: { email: email || null },
      [C.checkIn]: { date: { start: checkIn } },
      [C.checkOut]: { date: { start: checkOut } },
      [C.guests]: { number: guests },
      [C.children]: { number: childrenUnder10 },
      [C.tents]: { number: tents },
      [C.status]: { select: { name: 'Pending payment' } },
      [C.type]: { select: { name: 'Booking' } },
      [C.advance]: { number: advanceDue },
      [C.total]: { number: large ? null : price.total },
      [C.notes]: { rich_text: notesText ? [{ text: { content: notesText } }] : [] },
      [C.source]: { select: { name: 'Website' } },
      [C.terms]: { date: { start: now.toISOString() } },
      [C.token]: { rich_text: [{ text: { content: token } }] }
    });
  } catch (err) {
    console.error('Notion page failed', err);
    return json({ error: 'We could not hold those dates. Please try again, or message us on WhatsApp.' }, 502);
  }

  return json({
    reference,
    token,
    manageUrl: token ? manageUrl(env, reference, token) : '',
    large,
    amount: advanceDue,
    total: large ? null : price.total,
    balance: large ? null : price.balance,
    currency: 'INR',
    upi: {
      ...upi(env, advanceDue),
      link: env.UPI_ID ? upiLink(env, reference, advanceDue) : ''
    }
  });
}

/* ------------------------------------------------------------------ verify */

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/* ------------------------------------------------------- notion page helpers */

/** Create a page, silently dropping optional properties your database lacks.
 *  That way an older Notion setup never blocks a real booking. */
async function createPage(env, properties) {
  let props = { ...properties };
  // One retry per missing column: a fresh database can lack almost all of the
  // optional ones, and Notion only complains about the first bad key each time.
  for (let i = 0; i < 64; i++) {
    try {
      return await notion(env, '/pages', {
        method: 'POST',
        body: JSON.stringify({ parent: { database_id: env.NOTION_DB }, properties: props })
      });
    } catch (err) {
      const msg = String(err.message || '');
      const bad = Object.keys(props).find(k => msg.includes(`${k} is not a property`));
      if (!bad) throw err;
      if (!OPTIONAL.has(bad)) throw err;
      delete props[bad];
    }
  }
  throw new Error('Notion rejected the page properties');
}

async function patchPage(env, pageId, properties, version) {
  let props = { ...properties };
  for (let i = 0; i < 64; i++) {
    try {
      return await notion(env, `/pages/${pageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: props })
      }, version);
    } catch (err) {
      const msg = String(err.message || '');
      const bad = Object.keys(props).find(k => msg.includes(`${k} is not a property`));
      if (!bad || !OPTIONAL.has(bad)) throw err;
      delete props[bad];
    }
  }
  throw new Error('Notion rejected the update');
}

/* --------------------------------------------------------------- manage links */

/** Private token for a booking. Derived from a server secret, so it can never be
 *  guessed from the reference, and it does not need to be stored to be valid. */
async function manageToken(env, reference) {
  const secret = env.MANAGE_SECRET || env.NOTION_TOKEN || '';
  if (!secret) return '';
  const hex = await hmacHex(secret, `manage:${reference}`);
  return hex.slice(0, 32);
}

async function tokenMatches(env, reference, token, stored) {
  const given = String(token || '');
  if (!given) return false;
  if (stored) return safeEqual(stored, given);
  const expected = await manageToken(env, reference);
  return !!expected && safeEqual(expected, given);
}

function manageUrl(env, reference, token) {
  const base = String(env.SITE_URL || 'https://ekaforest.com').replace(/\/+$/, '');
  return `${base}/book/manage/?r=${encodeURIComponent(reference)}&k=${token}`;
}

async function findPageByReference(env, reference) {
  const C = await columns(env);
  const data = await notion(env, `/databases/${env.NOTION_DB}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: C.reference, rich_text: { equals: reference } },
      page_size: 1
    })
  });
  return data.results?.[0] || null;
}

function readBooking(page, env) {
  const pr = page.properties || {};
  const text = p => (p?.rich_text || p?.title || []).map(t => t.plain_text || t.text?.content || '').join('').trim();
  const num = key => Number(pick(pr, P(key))?.number) || 0;
  const checkIn = pick(pr, P('checkIn'))?.date?.start?.slice(0, 10) || '';
  const checkOut = pick(pr, P('checkOut'))?.date?.start?.slice(0, 10) || '';
  const guests = num('guests');
  const cap = env ? capacity(env) : 2;
  const total = num('total');
  const discountPercent = Math.min(100, Math.max(0, num('discount')));

  return {
    pageId: page.id,
    reference: text(pick(pr, P('reference'))),
    name: text(pick(pr, P('name'))),
    phone: pick(pr, P('phone'))?.phone_number || '',
    email: pick(pr, P('email'))?.email || '',
    checkIn,
    checkOut,
    // Computed, so there is no Nights column to keep in sync.
    nights: checkIn && checkOut ? Math.max(0, nightsBetween(checkIn, checkOut)) : 0,
    guests,
    childrenUnder10: num('children'),
    tents: Math.max(1, num('tents') || Math.ceil(guests / cap) || 1),
    status: pick(pr, P('status'))?.select?.name || '',
    type: pick(pr, P('type'))?.select?.name || 'Booking',
    advance: num('advance'),
    total,
    discountPercent,
    discount: Math.round(total * discountPercent / 100),
    notes: text(pick(pr, P('notes'))),
    token: text(pick(pr, P('token'))),
    moves: num('moves'),
    lastChange: pick(pr, P('lastChange'))?.date?.start?.slice(0, 10) || '',
    created: page.created_time || ''
  };
}

/** Guests can move their dates until this moment. Check-in is 1 PM IST. */
function changeClosesAt(checkIn, env) {
  const checkInMidnight = Date.parse(checkIn + 'T00:00:00+05:30');
  return checkInMidnight - cutoffHours(env) * 3600000;
}

/* ------------------------------------------------------ payment screenshot */

/** Store the guest's UPI screenshot in Notion and move the row to review. */
async function uploadScreenshot(request, env) {
  const cors = corsHeaders(request, env);

  let form;
  try { form = await request.formData(); }
  catch { return json({ error: 'We could not read that upload. Please try a photo or a screenshot.' }, 400, cors); }

  const reference = clean(form.get('reference'), 40).toUpperCase();
  const token = clean(form.get('token'), 64);
  const file = form.get('file');

  if (!reference || !token) return json({ error: 'This upload is missing its booking reference.' }, 400, cors);
  if (!file || typeof file === 'string' || !file.size) {
    return json({ error: 'Please attach your payment screenshot.' }, 400, cors);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ error: 'That file is too large. Please send a screenshot under 8 MB.' }, 413, cors);
  }

  const type = clean(file.type, 100).toLowerCase();
  const isImage = type.startsWith('image/');
  const isPdf = type === 'application/pdf';
  if (!isImage && !isPdf) {
    return json({ error: 'Please upload a photo, a screenshot or a PDF of the payment.' }, 415, cors);
  }

  const page = await findPageByReference(env, reference);
  if (!page) return json({ error: 'We could not find that booking.' }, 404, cors);

  const booking = readBooking(page);
  if (!(await tokenMatches(env, booking.reference, token, booking.token))) {
    return json({ error: 'That link is not valid for this booking.' }, 403, cors);
  }
  if (booking.status === 'Cancelled') {
    return json({ error: 'This booking was cancelled, so there is nothing to pay.' }, 409, cors);
  }
  const C0 = await columns(env);
  if (!((page.properties || {})[C0.idProof]?.files || []).length) {
    return json({ error: 'Please upload your ID proof first.' }, 409, cors);
  }

  const ext = isPdf ? 'pdf' : (type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
  const filename = `eka-${reference}.${ext || 'jpg'}`;

  let upload;
  try {
    upload = await notion(env, '/file_uploads', {
      method: 'POST',
      body: JSON.stringify({ mode: 'single_part', filename, content_type: type })
    }, NOTION_FILES_VERSION);

    const fd = new FormData();
    fd.append('file', file, filename);
    const sent = await fetch(upload.upload_url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.NOTION_TOKEN}`,
        'notion-version': NOTION_FILES_VERSION
      },
      body: fd
    });
    if (!sent.ok) {
      const detail = await sent.text();
      throw new Error(`file upload ${sent.status}: ${detail.slice(0, 200)}`);
    }
  } catch (err) {
    console.error('Notion file upload failed', err);
    return json({
      error: 'We could not store the screenshot. Please send it to us on WhatsApp instead.',
      detail: String(err && err.message || err).slice(0, 200)
    }, 502, cors);
  }

  const note = [booking.notes,
    `Payment screenshot uploaded ${todayIST()}, please check the ₹${booking.advance} UPI credit.`]
    .filter(Boolean).join(' · ').slice(0, 1800);

  const C = await columns(env);
  try {
    await patchPage(env, page.id, {
      [C.status]: { select: { name: 'Payment review' } },
      [C.screenshot]: {
        files: [{ type: 'file_upload', file_upload: { id: upload.id }, name: filename }]
      },
      [C.notes]: { rich_text: [{ text: { content: note } }] }
    }, NOTION_FILES_VERSION);
  } catch (err) {
    console.error('Screenshot attach failed', err);
    return json({
      error: 'The screenshot uploaded but we could not attach it to your booking. Please send it to us on WhatsApp.',
      detail: String(err && err.message || err).slice(0, 200)
    }, 502, cors);
  }

  return json({
    ok: true,
    reference,
    status: 'Payment review',
    manageUrl: manageUrl(env, reference, booking.token || token)
  }, 200, cors);
}

/** Store the guest's ID proof (photo or PDF) in Notion. The row status does not change. */
async function uploadIdProof(request, env) {
  const cors = corsHeaders(request, env);

  let form;
  try { form = await request.formData(); }
  catch { return json({ error: 'We could not read that upload. Please try a photo or a screenshot.' }, 400, cors); }

  const reference = clean(form.get('reference'), 40).toUpperCase();
  const token = clean(form.get('token'), 64);
  const file = form.get('file');

  if (!reference || !token) return json({ error: 'This upload is missing its booking reference.' }, 400, cors);
  if (!file || typeof file === 'string' || !file.size) {
    return json({ error: 'Please attach a photo or PDF of your ID.' }, 400, cors);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ error: 'That file is too large. Please send a screenshot under 8 MB.' }, 413, cors);
  }

  const type = clean(file.type, 100).toLowerCase();
  const isImage = type.startsWith('image/');
  const isPdf = type === 'application/pdf';
  if (!isImage && !isPdf) {
    return json({ error: 'Please upload a photo or a PDF of your ID.' }, 415, cors);
  }

  const page = await findPageByReference(env, reference);
  if (!page) return json({ error: 'We could not find that booking.' }, 404, cors);

  const booking = readBooking(page);
  if (!(await tokenMatches(env, booking.reference, token, booking.token))) {
    return json({ error: 'That link is not valid for this booking.' }, 403, cors);
  }
  if (booking.status === 'Cancelled') {
    return json({ error: 'This booking was cancelled, so there is nothing to pay.' }, 409, cors);
  }

  const ext = isPdf ? 'pdf' : (type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
  const filename = `eka-id-${reference}.${ext || 'jpg'}`;

  let upload;
  try {
    upload = await notion(env, '/file_uploads', {
      method: 'POST',
      body: JSON.stringify({ mode: 'single_part', filename, content_type: type })
    }, NOTION_FILES_VERSION);

    const fd = new FormData();
    fd.append('file', file, filename);
    const sent = await fetch(upload.upload_url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.NOTION_TOKEN}`,
        'notion-version': NOTION_FILES_VERSION
      },
      body: fd
    });
    if (!sent.ok) {
      const detail = await sent.text();
      throw new Error(`file upload ${sent.status}: ${detail.slice(0, 200)}`);
    }
  } catch (err) {
    console.error('Notion file upload failed', err);
    return json({
      error: 'We could not store your ID proof. Please try again, or send it to us on WhatsApp.',
      detail: String(err && err.message || err).slice(0, 200)
    }, 502, cors);
  }

  const C = await columns(env);
  try {
    await patchPage(env, page.id, {
      [C.idProof]: {
        files: [{ type: 'file_upload', file_upload: { id: upload.id }, name: filename }]
      }
    }, NOTION_FILES_VERSION);
  } catch (err) {
    console.error('ID proof save failed', err);
    return json({ error: 'We could not save your ID proof. Please try again.' }, 502, cors);
  }
  return json({ ok: true, reference });
}

/* ------------------------------------------------------------------ manage */

/** Shared guard for all three manage endpoints. */
async function loadManagedBooking(env, reference, token) {
  if (!reference || !token) return { error: json({ error: 'This link is incomplete.' }, 400) };
  if (!(env.MANAGE_SECRET || env.NOTION_TOKEN)) {
    return { error: json({ error: 'Manage links are not configured yet.' }, 503) };
  }
  const page = await findPageByReference(env, reference);
  if (!page) return { error: json({ error: 'We could not find that booking.' }, 404) };
  const booking = readBooking(page);
  const ok = await tokenMatches(env, booking.reference, token, booking.token);
  if (!ok) return { error: json({ error: 'That link is not valid for this booking.' }, 403) };
  return { page, booking };
}

async function getBooking(url, env) {
  const reference = clean(url.searchParams.get('r'), 40).toUpperCase();
  const token = clean(url.searchParams.get('k'), 64);
  const found = await loadManagedBooking(env, reference, token);
  if (found.error) return found.error;

  const { booking } = found;
  const today = todayIST();
  const from = isDate(url.searchParams.get('from')) ? url.searchParams.get('from') : today;
  let to = isDate(url.searchParams.get('to')) ? url.searchParams.get('to') : addDays(from, 90);
  if (to <= from) to = addDays(from, 90);
  if (nightsBetween(from, to) > 400) to = addDays(from, 400);

  const stays = await loadStays(env, from, to, booking.pageId);
  const nights = computeNights(stays, from, to, units(env));

  const closesAt = changeClosesAt(booking.checkIn, env);
  return json({
    booking: {
      reference: booking.reference,
      name: booking.name,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      nights: booking.nights,
      guests: booking.guests,
      childrenUnder10: booking.childrenUnder10,
      tents: booking.tents,
      status: booking.status,
      advance: booking.advance,
      notes: booking.notes
    },
    units: units(env),
    capacity: capacity(env),
    cutoffHours: cutoffHours(env),
    changeClosesAt: new Date(closesAt).toISOString(),
    canChange: booking.status === 'Confirmed' && Date.now() < closesAt,
    canCancel: booking.status === 'Confirmed',
    from, to, nights
  });
}

async function rescheduleBooking(request, env) {
  const cors = corsHeaders(request, env);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, cors); }

  const reference = clean(body.reference, 40).toUpperCase();
  const token = clean(body.token, 64);
  const found = await loadManagedBooking(env, reference, token);
  if (found.error) return found.error;
  const { page, booking } = found;

  if (booking.status === 'Cancelled') return json({ error: 'This booking has already been cancelled.' }, 409, cors);
  if (booking.status !== 'Confirmed') return json({ error: 'This booking is not confirmed yet.' }, 409, cors);
  if (Date.now() >= changeClosesAt(booking.checkIn, env)) {
    return json({ error: `Dates can only be changed up to ${cutoffHours(env)} hours before check-in. Please message us on WhatsApp.` }, 409, cors);
  }

  const checkIn = clean(body.checkIn, 10);
  const checkOut = clean(body.checkOut, 10);
  if (!isDate(checkIn) || !isDate(checkOut)) return json({ error: 'Please pick valid dates.' }, 400, cors);
  if (checkIn < todayIST()) return json({ error: 'Those dates are in the past.' }, 400, cors);

  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) return json({ error: 'Check-out must be after check-in.' }, 400, cors);
  if (nights > 10) return json({ error: 'Stays are limited to 10 nights. Message us for longer.' }, 400, cors);

  const total = units(env);
  const stays = await loadStays(env, checkIn, checkOut, booking.pageId);
  const free = computeNights(stays, checkIn, checkOut, total);
  for (const night of eachNight(checkIn, checkOut)) {
    if ((free[night] ?? 0) < booking.tents) {
      return json({ error: 'One of those nights is full. Please pick another date.' }, 409, cors);
    }
  }

  const movedFrom = booking.checkIn;
  const note = [booking.notes, `Moved ${booking.checkIn} → ${checkIn} by guest on ${todayIST()}. Advance of ₹${booking.advance} carried over.`]
    .filter(Boolean).join(' · ').slice(0, 1800);

  try {
    const C = await columns(env);
    await patchPage(env, page.id, {
      [C.checkIn]: { date: { start: checkIn } },
      [C.checkOut]: { date: { start: checkOut } },
      [C.notes]: { rich_text: [{ text: { content: note } }] },
      [C.moves]: { number: (booking.moves || 0) + 1 },
      [C.lastChange]: { date: { start: todayIST() } }
    });
  } catch (err) {
    console.error('reschedule failed', err);
    return json({ error: 'We could not move this booking. Please message us on WhatsApp.' }, 502, cors);
  }

  return json({
    ok: true,
    reference: booking.reference,
    checkIn, checkOut, nights,
    previousCheckIn: movedFrom,
    advance: booking.advance
  }, 200, cors);
}

async function cancelBooking(request, env) {
  const cors = corsHeaders(request, env);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, cors); }

  const reference = clean(body.reference, 40).toUpperCase();
  const token = clean(body.token, 64);
  const found = await loadManagedBooking(env, reference, token);
  if (found.error) return found.error;
  const { page, booking } = found;

  if (booking.status === 'Cancelled') {
    return json({ ok: true, reference: booking.reference, status: 'Cancelled', already: true }, 200, cors);
  }
  if (booking.status !== 'Confirmed') return json({ error: 'This booking is not confirmed yet.' }, 409, cors);

  const note = [booking.notes, `Cancelled by guest on ${todayIST()}. Advance of ₹${booking.advance} is not refunded.`]
    .filter(Boolean).join(' · ').slice(0, 1800);

  try {
    const C = await columns(env);
    await patchPage(env, page.id, {
      [C.status]: { select: { name: 'Cancelled' } },
      [C.notes]: { rich_text: [{ text: { content: note } }] }
    });
  } catch (err) {
    console.error('cancel failed', err);
    return json({ error: 'We could not cancel this booking. Please message us on WhatsApp.' }, 502, cors);
  }

  return json({ ok: true, reference: booking.reference, status: 'Cancelled' }, 200, cors);
}


/* --------------------------------------------------------------- owner data */

function ownerOk(request, env) {
  if (!env.OWNER_TOKEN) return false;
  const url = new URL(request.url);
  const given = clean(url.searchParams.get('k') || request.headers.get('x-owner-token') || '', 200);
  return safeEqual(given, clean(env.OWNER_TOKEN, 200)) && given.length > 0;
}

async function allBookings(env, fromISO) {
  // Notion property names are case-sensitive: the real column is "Check-Out",
  // and asking for "Check-out" fails the whole dashboard query.
  const C = await columns(env);
  const filter = { property: C.checkOut, date: { on_or_after: fromISO } };
  const pages = [];
  let cursor;
  do {
    const body = { filter, page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notion(env, `/databases/${env.NOTION_DB}/query`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages.map(p => readBooking(p, env)).filter(b => b.checkIn && b.checkOut);
}

function monthKey(dateStr) { return String(dateStr).slice(0, 7); }

function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1))
    .toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }) + ' ' + String(y).slice(2);
}

function overlapNights(a, b, from, to) {
  const s = a > from ? a : from;
  const e = b < to ? b : to;
  return e > s ? nightsBetween(s, e) : 0;
}

const BLOCKS = ['Confirmed', 'Payment review'];

async function buildSummary(env) {
  const today = todayIST();
  const total = units(env);
  const bookings = await allBookings(env, addDays(today, -200));

  const blocks = b => BLOCKS.includes(b.status);
  const stayOf = b => b.type !== 'Blocked';

  const months = [];
  const base = new Date(today + 'T00:00:00Z');
  for (let i = -3; i <= 3; i++) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1));
    months.push(d.toISOString().slice(0, 7));
  }

  const monthRows = months.map(key => {
    const first = key + '-01';
    const last = addDays(key + '-' + String(daysInMonth(key)).padStart(2, '0'), 1);
    const days = daysInMonth(key);

    let sold = 0, guests = 0, confirmedAdvance = 0, reviewAdvance = 0, pendingAdvance = 0;
    let count = 0, cancelled = 0;

    bookings.forEach(b => {
      if (monthKey(b.checkIn) === key) {
        if (b.status === 'Cancelled') { cancelled++; return; }
        count++;
        if (b.status === 'Confirmed') { confirmedAdvance += b.advance; if (stayOf(b)) guests += b.guests + b.childrenUnder10; }
        else if (b.status === 'Payment review') reviewAdvance += b.advance;
        else if (b.status === 'Pending payment') pendingAdvance += b.advance;
      }
      if (blocks(b)) sold += overlapNights(b.checkIn, b.checkOut, first, last) * b.tents;
    });

    const capacity = total * days;
    return {
      key, label: monthLabel(key), days,
      sold, capacity,
      occupancy: capacity ? Math.round((sold / capacity) * 100) : 0,
      bookings: count, cancelled, guests,
      confirmedAdvance, reviewAdvance, pendingAdvance
    };
  });

  const tonight = bookings.filter(b => blocks(b) && b.checkIn <= today && today < b.checkOut);
  const tentsTonight = tonight.reduce((n, b) => n + b.tents, 0);
  const guestsTonight = tonight.reduce((n, b) => n + (stayOf(b) ? b.guests + b.childrenUnder10 : 0), 0);

  const todayArrivals = bookings
    .filter(b => b.checkIn === today && stayOf(b) && b.status !== 'Cancelled')
    .sort((a, b) => a.name.localeCompare(b.name));
  const todayDepartures = bookings
    .filter(b => b.checkOut === today && stayOf(b) && b.status !== 'Cancelled');

  const inWindow = (d, days) => d > today && d <= addDays(today, days);
  const next7Arrivals = bookings.filter(b => inWindow(b.checkIn, 7) && stayOf(b) && b.status !== 'Cancelled').length;
  const next7Departures = bookings.filter(b => inWindow(b.checkOut, 7) && stayOf(b) && b.status !== 'Cancelled').length;

  const money = bookings.reduce((m, b) => {
    if (b.status === 'Confirmed') m.confirmed += b.advance;
    else if (b.status === 'Payment review') m.review += b.advance;
    else if (b.status === 'Pending payment') m.pending += b.advance;
    return m;
  }, { confirmed: 0, review: 0, pending: 0 });

  const changedToday = bookings.filter(b => b.lastChange === today).length;
  const changed7 = bookings.filter(b => b.lastChange && b.lastChange >= addDays(today, -7)).length;
  const cancelledUpcoming = bookings.filter(b => b.status === 'Cancelled' && b.checkOut >= today).length;

  const upcoming = bookings
    .filter(b => b.checkOut >= today && b.status !== 'Cancelled' && stayOf(b))
    .sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : a.name.localeCompare(b.name)))
    .slice(0, 30)
    .map(b => ({
      reference: b.reference, name: b.name, phone: b.phone,
      checkIn: b.checkIn, checkOut: b.checkOut, nights: b.nights,
      guests: b.guests, children: b.childrenUnder10, tents: b.tents,
      status: b.status, advance: b.advance, total: b.total,
      discount: b.discount, discountPercent: b.discountPercent, moves: b.moves, notes: b.notes
    }));

  return {
    today,
    units: total,
    capacity: capacity(env),
    advancePercent: advancePercent(env),
    tonight: { tents: tentsTonight, free: Math.max(0, total - tentsTonight), guests: guestsTonight },
    todayArrivals: todayArrivals.map(slim),
    todayDepartures: todayDepartures.map(slim),
    next7: { arrivals: next7Arrivals, departures: next7Departures },
    months: monthRows,
    money,
    changes: { today: changedToday, last7: changed7 },
    cancellations: { upcoming: cancelledUpcoming },
    upcoming
  };
}

function slim(b) {
  return {
    reference: b.reference, name: b.name, phone: b.phone,
    checkIn: b.checkIn, checkOut: b.checkOut,
    guests: b.guests, children: b.childrenUnder10, tents: b.tents,
    status: b.status, advance: b.advance, total: b.total,
    discount: b.discount, discountPercent: b.discountPercent
  };
}

function money(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }

function prettyDate(d) {
  return new Date(d + 'T00:00:00+05:30')
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/* ------------------------------------------------------- expenses data */

let EXPENSES = { url: '', at: 0, data: null };

/** Lowercase letters only, so "Running Expenses", "running_expenses" and
 *  "Running expenses" all match the same key. */
const keyOf = k => String(k).toLowerCase().replace(/[^a-z]/g, '');

const numOf = v => {
  if (typeof v === 'number') return v;
  const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : null;
};

/** Turns a Google Drive share link (.../file/d/ID/view) into the file's direct
 *  address. Other links are used as they are. */
function directLink(url) {
  const m = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/) || url.match(/drive\.google\.com\/open\?id=([^&#]+)/);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  return url;
}

/** Finds the record for one month. Accepts a list of records (each with a
 *  month/period field) or an object keyed by month, e.g. { "2026-11": {...} }. */
function monthRecord(data, month) {
  if (!data) return null;
  const monthly = Array.isArray(data) ? data : (Array.isArray(data.monthly) ? data.monthly : null);
  if (monthly) {
    return monthly.find(r => {
      const m = r && (r.month || r.period || r.date || r.Month);
      return m && String(m).slice(0, 7) === month;
    }) || null;
  }
  if (typeof data === 'object') {
    const hit = data[month] || Object.keys(data).find(k => k.slice(0, 7) === month);
    return hit ? (typeof hit === 'object' ? hit : data[hit]) : null;
  }
  return null;
}

/** Food and groceries for one month, added up from the entries list (every
 *  expense line with its date and category). */
function foodFromEntries(data, month) {
  if (!data || !Array.isArray(data.entries) || !Array.isArray(data.entries_columns)) return null;
  const cols = data.entries_columns;
  const iDate = cols.indexOf('date'), iCat = cols.indexOf('category'), iAmt = cols.indexOf('amount_odoo');
  if (iDate < 0 || iCat < 0 || iAmt < 0) return null;
  let sum = 0;
  for (const e of data.entries) {
    if (String(e[iDate] || '').slice(0, 7) !== month) continue;
    if (/food\s*&\s*grocer/i.test(String(e[iCat] || ''))) sum += Number(e[iAmt]) || 0;
  }
  return sum;
}

/** Reads one month's expense figures from the expenses data (JSON). Sales in the
 *  file are ignored: sales come from the bookings. */
async function ownerExpenses(request, env) {
  if (!ownerOk(request, env)) return json({ error: 'Not found' }, 404);
  const url = clean(env.EXPENSES_CSV_URL, 500);
  if (!url) return json({ error: 'The expenses data is not connected yet.' }, 503);

  const month = clean(new URL(request.url).searchParams.get('month'), 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return json({ error: 'Pick a month like 2026-11.' }, 400);

  let data;
  try {
    const now = Date.now();
    if (!EXPENSES.data || now - EXPENSES.at > 300000 || EXPENSES.url !== url) {
      const res = await fetch(directLink(url), { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (EKA Forest owner accounts)', accept: 'application/json,*/*' } });
      if (!res.ok) throw new Error('expenses link answered ' + res.status);
      const text = await res.text();
      if (/^\s*<!doctype html|^\s*<html/i.test(text)) throw new Error('expenses link returned a web page, not the JSON file (check the sharing settings)');
      EXPENSES = { url, at: now, data: JSON.parse(text) };
    }
    data = EXPENSES.data;
  } catch (err) {
    console.error('expenses data failed', err);
    return json({ error: 'Could not read the expenses data. ' + String(err.message || err).slice(0, 200) }, 502);
  }

  const rec = monthRecord(data, month);
  const fig = name => {
    if (!rec) return null;
    const hit = Object.keys(rec).find(k => keyOf(k) === name);
    /* Expenses may be stored as negatives (display signs), so use the size. */
    return hit ? Math.abs(numOf(rec[hit]) ?? 0) : null;
  };
  /* running_expenses is the other running costs only, without salaries. Sales
     and net in the file are ignored. */
  const running = fig('otherexpenses') ?? fig('runningexpenses');
  const salaries = fig('salarieswages') ?? fig('salariesandwages') ?? fig('salaries');
  const assets = fig('assets');
  /* Food and groceries is its own line, separate from running expenses. */
  const food = fig('foodgroceries') ?? fig('foodandgroceries') ?? fig('food') ?? foodFromEntries(data, month);

  const complete = running !== null;
  const r0 = v => Math.round(v || 0);
  return json({
    month,
    sales: fig('sales') === null ? null : r0(fig('sales')),
    runningExpenses: r0(running),
    netCosts: r0((running || 0) + (salaries || 0) + (food || 0)),
    salaries: r0(salaries),
    assets: r0(assets),
    food: food === null ? null : r0(food),
    total: r0((running || 0) + (assets || 0) + (salaries || 0) + (food || 0)),
    upToDate: complete,
    note: complete ? '' : `These dates are not updated. The expenses data has no running expenses for ${month} yet.`
  });
}

/** Every booking that checks in during one calendar month, for the monthly accounts. */
async function ownerMonth(request, env) {
  if (!ownerOk(request, env)) return json({ error: 'Not found' }, 404);
  const key = clean(new URL(request.url).searchParams.get('month'), 7);
  if (!/^\d{4}-\d{2}$/.test(key)) return json({ error: 'Pick a month like 2026-11.' }, 400);
  const first = `${key}-01`;
  const last = `${key}-${String(daysInMonth(key)).padStart(2, '0')}`;
  try {
    const all = await allBookings(env, first);
    const rows = all
      .filter(b => b.type !== 'Blocked' && b.checkIn >= first && b.checkIn <= last)
      .sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : a.name.localeCompare(b.name)))
      .map(b => ({
        reference: b.reference, name: b.name, phone: b.phone, email: b.email,
        checkIn: b.checkIn, checkOut: b.checkOut, nights: b.nights,
        guests: b.guests, children: b.childrenUnder10, tents: b.tents,
        status: b.status, total: b.total, discount: b.discount,
        discountPercent: b.discountPercent, advance: b.advance
      }));
    return json({ month: key, days: daysInMonth(key), first, last, rows });
  } catch (err) {
    console.error('owner month failed', err);
    return json({ error: 'Could not read Notion. Check NOTION_TOKEN and NOTION_DB.' }, 502);
  }
}

async function ownerSummary(request, env) {
  if (!ownerOk(request, env)) return json({ error: 'Not found' }, 404);
  try {
    return json(await buildSummary(env));
  } catch (err) {
    console.error('owner summary failed', err);
    return json({ error: 'Could not read Notion. Check NOTION_TOKEN and NOTION_DB.' }, 502);
  }
}

/** One message the property manager can read on a phone, no jargon. */
function digestText(s) {
  const lines = [];
  lines.push(`EKA Forest, ${prettyDate(s.today)}`);
  lines.push('');
  lines.push(`Tonight: ${s.tonight.tents} of ${s.units} A-frame tents, ${s.tonight.guests} guests, ${s.tonight.free} free`);
  lines.push(`Today: ${s.todayArrivals.length} arriving, ${s.todayDepartures.length} leaving`);
  lines.push(`Next 7 days: ${s.next7.arrivals} arriving, ${s.next7.departures} leaving`);
  lines.push('');

  if (s.todayArrivals.length) {
    lines.push('Arriving today:');
    s.todayArrivals.forEach(b => {
      const kids = b.children ? `, ${b.children} children` : '';
      lines.push(`• ${b.name}, ${b.guests} guests${kids}, ${b.tents} A-frame tent${b.tents === 1 ? '' : 's'} (${b.reference})`);
    });
    lines.push('');
  }
  if (s.todayDepartures.length) {
    lines.push('Leaving today:');
    s.todayDepartures.forEach(b => {
      lines.push(`• ${b.name}, ${b.tents} A-frame tent${b.tents === 1 ? '' : 's'} (${b.reference})`);
    });
    lines.push('');
  }

  lines.push('Money:');
  lines.push(`• ${money(s.money.confirmed)} advance received`);
  lines.push(`• ${money(s.money.review)} waiting for your check`);
  lines.push(`• ${money(s.money.pending)} not paid yet`);
  lines.push('');
  lines.push('Changes:');
  lines.push(`• ${s.changes.today} date change${s.changes.today === 1 ? '' : 's'} today`);
  lines.push(`• ${s.cancellations.upcoming} cancellation${s.cancellations.upcoming === 1 ? '' : 's'} ahead`);
  return lines.join('\n');
}

async function ownerDigest(request, env) {
  if (!ownerOk(request, env)) return json({ error: 'Not found' }, 404);
  try {
    const summary = await buildSummary(env);
    const text = digestText(summary);
    const to = clean(env.WA_NOTIFY, 20).replace(/\D/g, '');
    return json({
      today: summary.today,
      text,
      waLink: to ? 'https://wa.me/' + to + '?text=' + encodeURIComponent(text) : ''
    });
  } catch (err) {
    console.error('digest failed', err);
    return json({ error: 'Could not read Notion.' }, 502);
  }
}

async function ownerStatus(request, env) {
  if (!ownerOk(request, env)) return json({ error: 'Not found' }, 404);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const reference = clean(body.reference, 40).toUpperCase();
  const status = clean(body.status, 30);
  if (!reference) return json({ error: 'Missing booking reference.' }, 400);
  if (!['Confirmed', 'Payment review', 'Cancelled'].includes(status)) {
    return json({ error: 'Unknown status.' }, 400);
  }

  const page = await findPageByReference(env, reference);
  if (!page) return json({ error: 'No booking with that reference.' }, 404);

  const C = await columns(env);
  const props = { [C.status]: { select: { name: status } } };
  if (status === 'Confirmed') props[C.paidAt] = { date: { start: new Date().toISOString() } };

  try { await patchPage(env, page.id, props); }
  catch (err) {
    console.error('owner status failed', err);
    return json({ error: 'Notion rejected that change.' }, 502);
  }
  return json({ ok: true, reference, status });
}

/** Owner sets a discount percentage on one booking. Notion keeps the
 *  percentage; the dashboard and accounts show the rupee amount, which is
 *  total × percent ÷ 100. */
async function ownerDiscount(request, env) {
  if (!ownerOk(request, env)) return json({ error: 'Not found' }, 404);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const reference = clean(body.reference, 40).toUpperCase();
  if (!reference) return json({ error: 'Missing booking reference.' }, 400);

  const raw = body.percent;
  const percent = raw === '' || raw == null ? 0 : Number(raw);
  if (!isFinite(percent) || percent < 0 || percent > 100) {
    return json({ error: 'Discount must be between 0 and 100.' }, 400);
  }
  const rounded = Math.round(percent * 100) / 100;

  const page = await findPageByReference(env, reference);
  if (!page) return json({ error: 'No booking with that reference.' }, 404);

  try {
    await ensureColumn(env, 'discount');
    const C = await columns(env);
    await patchPage(env, page.id, { [C.discount]: { number: rounded } });
  } catch (err) {
    console.error('owner discount failed', err);
    return json({
      error: 'Notion would not accept the discount. Add a Number column named Discount, or let the integration edit the database.'
    }, 502);
  }

  const total = Number(pick(page.properties, P('total'))?.number) || 0;
  return json({
    ok: true,
    reference,
    discountPercent: rounded,
    discount: Math.round(total * rounded / 100),
    total
  });
}

/** Owner takes some A-frame tents out of sale for a run of nights (e.g. booked elsewhere).
 *  It is stored as a "Blocked" row, which the public calendar counts like a stay.
 *  Cancel the row from the dashboard to give the A-frame tents back. */
async function ownerBlock(request, env) {
  if (!ownerOk(request, env)) return json({ error: 'Not found' }, 404);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const checkIn = clean(body.checkIn, 10);
  const checkOut = clean(body.checkOut, 10);
  const tents = Math.floor(Number(body.tents));
  const note = clean(body.note, 80);

  if (!isDate(checkIn) || !isDate(checkOut) || checkOut <= checkIn) {
    return json({ error: 'Pick a start date and an end date after it.' }, 400);
  }
  if (!(tents >= 1 && tents <= units(env))) {
    return json({ error: `A-frame tents must be between 1 and ${units(env)}.` }, 400);
  }

  const reference = `BLK-${checkIn.slice(2).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X')}`;
  const C = await columns(env);
  try {
    await createPage(env, {
      [C.name]: { title: [{ text: { content: 'Blocked' + (note ? ': ' + note : '') } }] },
      [C.reference]: { rich_text: [{ text: { content: reference } }] },
      [C.checkIn]: { date: { start: checkIn } },
      [C.checkOut]: { date: { start: checkOut } },
      [C.guests]: { number: 0 },
      [C.tents]: { number: tents },
      [C.status]: { select: { name: 'Confirmed' } },
      [C.type]: { select: { name: 'Blocked' } },
      [C.advance]: { number: 0 },
      [C.notes]: { rich_text: note ? [{ text: { content: note } }] : [] },
      [C.source]: { select: { name: 'Owner' } }
    });
  } catch (err) {
    console.error('owner block failed', err);
    return json({ error: 'Notion rejected that block.' }, 502);
  }
  return json({ ok: true, reference, checkIn, checkOut, tents });
}

/* ------------------------------------------------------------------ health */

async function health(env) {
  const missing = [];
  let reachable = false;
  let dbTitle = '';
  let found = [];
  try {
    const db = await notion(env, `/databases/${env.NOTION_DB}`);
    reachable = true;
    const props = db.properties || {};
    dbTitle = (db.title || []).map(t => t.plain_text).join('').trim();
    found = Object.keys(props).sort();

    // Resolve against the real titles: a column called "reference " is the same
    // column as "reference", so it is not reported as missing.
    const resolved = resolveColumns(found);
    COLUMNS = { db: env.NOTION_DB, at: Date.now(), map: resolved };

    for (const key of Object.keys(FIELDS)) {
      const field = FIELDS[key];
      const got = props[resolved[key]];
      if (!got) {
        if (!field.optional) missing.push(`${field.prop} (missing)`);
      } else if (got.type !== field.type) {
        missing.push(`${resolved[key]} (is ${got.type}, should be ${field.type})`);
      }
    }
  } catch (err) {
    return json({ ok: false, notion: false, error: String(err.message || err) }, 500);
  }

  return json({
    ok: missing.length === 0,
    notion: reachable,
    units: units(env),
    capacity: capacity(env),
    advancePercent: advancePercent(env),
    blocks: ['Payment review', 'Confirmed'],
    owner: !!env.OWNER_TOKEN,
    notify: clean(env.WA_NOTIFY, 20),
    cutoffHours: cutoffHours(env),
    upi: !!clean(env.UPI_ID, 60),
    manage: !!(env.MANAGE_SECRET || env.NOTION_TOKEN),
    siteUrl: env.SITE_URL || 'https://ekaforest.com',
    // If "missing" is not empty, these two tell you which database the Worker
    // actually reached and what its properties are really called.
    database: dbTitle,
    databaseId: String(env.NOTION_DB || '').slice(0, 8) + '…',
    columns: resolveColumns(found),
    properties: found,
    missing
  });
}
