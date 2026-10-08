// EKA Forest booking API: a Cloudflare Worker between the website and the Notion bookings database.
// Secrets (`wrangler secret put`, or .dev.vars locally): NOTION_TOKEN, NOTION_DB_ID.
// Var (wrangler.toml): ALLOWED_ORIGINS, the sites allowed to call this API.

const PRICE_PER_HEAD = 1850; // per person per night, dinner + breakfast
const LUNCH_PER_HEAD = 250;  // per person per day, one lunch per night booked
const TENTS = 10;
const PER_TENT = 2;
const MAX_NIGHTS = 14;
const MAX_UPLOAD = 5 * 1024 * 1024; // Notion free workspaces cap uploads at 5 MB
const ID_TYPES = ['Aadhaar', 'Passport', 'Driving licence', 'Voter ID', 'PAN'];

// Notion column names. If the database uses different names, change the right-hand side only.
const P = {
  name: 'Name',                     // title
  bookingId: 'Booking ID',          // text
  email: 'Email',                   // email
  phone: 'Phone',                   // phone
  from: 'Coming from',              // text
  checkin: 'Check-in',              // date
  checkout: 'Check-out',            // date
  guests: 'Guests',                 // number
  tents: 'Tents',                   // number
  lunch: 'Lunch',                   // checkbox
  amount: 'Amount',                 // number
  idProof: 'ID proof',              // text
  utr: 'UPI reference',             // text
  screenshot: 'Payment screenshot', // files & media
  status: 'Status',                 // select
  terms: 'Terms accepted',          // checkbox
};
const STATUS = { type: 'select', submitted: 'Payment submitted', cancelled: 'Cancelled' };

const NOTION = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

class UserError extends Error {}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const { pathname, searchParams } = new URL(req.url);
    try {
      if (req.method === 'GET' && pathname === '/api/availability') return json(await availability(searchParams, env), 200, cors);
      if (req.method === 'POST' && pathname === '/api/bookings') return json(await createBooking(req, env), 201, cors);
      return json({ error: 'Not found' }, 404, cors);
    } catch (e) {
      if (e instanceof UserError) return json({ error: e.message }, 400, cors);
      console.error(e);
      return json({ error: 'Something went wrong on our side. Please try again, or message us on WhatsApp.' }, 500, cors);
    }
  },
};

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  const h = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

// ---------- Dates & pricing ----------
const DAY = 86400000;
const todayIST = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d)) && addDays(d, 0) === d;
const tentsFor = guests => Math.ceil(guests / PER_TENT);

function parseStay(get) {
  const checkin = get('checkin') || '', checkout = get('checkout') || '';
  const guests = Number(get('guests'));
  if (!isDate(checkin) || !isDate(checkout)) throw new UserError('Please choose valid check-in and check-out dates.');
  if (checkin < todayIST()) throw new UserError('Check-in date is in the past.');
  const nights = Math.round((Date.parse(checkout) - Date.parse(checkin)) / DAY);
  if (nights < 1) throw new UserError('Check-out must be after check-in.');
  if (nights > MAX_NIGHTS) throw new UserError(`For stays longer than ${MAX_NIGHTS} nights, please message us on WhatsApp.`);
  if (!Number.isInteger(guests) || guests < 1 || guests > TENTS * PER_TENT) throw new UserError(`Guests must be between 1 and ${TENTS * PER_TENT}.`);
  return { checkin, checkout, nights, guests, tents: tentsFor(guests) };
}

function price({ nights, guests }, lunch) {
  const stay = guests * nights * PRICE_PER_HEAD;
  const lunchTotal = lunch ? guests * nights * LUNCH_PER_HEAD : 0;
  return { stay, lunch: lunchTotal, total: stay + lunchTotal };
}

// Free tents for each night from check-in up to (not including) check-out.
// Every booking that is not Cancelled holds its tents, including ones still awaiting payment checks.
async function freeTentsByNight(env, checkin, checkout) {
  const booked = {};
  for (let d = checkin; d < checkout; d = addDays(d, 1)) booked[d] = 0;
  const rows = await queryAll(env, {
    filter: { and: [
      { property: P.checkin, date: { before: checkout } },
      { property: P.checkout, date: { after: checkin } },
      { property: P.status, [STATUS.type]: { does_not_equal: STATUS.cancelled } },
    ] },
  });
  for (const { properties: pr } of rows) {
    const s = pr[P.checkin]?.date?.start?.slice(0, 10), e = pr[P.checkout]?.date?.start?.slice(0, 10);
    if (!s || !e) continue;
    const tents = pr[P.tents]?.number || tentsFor(pr[P.guests]?.number || 1);
    for (const d in booked) if (d >= s && d < e) booked[d] += tents;
  }
  return Object.entries(booked).map(([date, n]) => ({ date, free: Math.max(0, TENTS - n) }));
}

async function availability(params, env) {
  const stay = parseStay(k => params.get(k));
  const perNight = await freeTentsByNight(env, stay.checkin, stay.checkout);
  const free = Math.min(...perNight.map(n => n.free));
  return { ...stay, perNight, free, available: free >= stay.tents, price: price(stay, params.get('lunch') === '1') };
}

// ---------- Booking ----------
async function createBooking(req, env) {
  const form = await req.formData();
  const get = k => (form.get(k) ?? '').toString().trim();
  if (get('website')) throw new UserError('Booking could not be submitted.'); // honeypot field, bots fill it

  const stay = parseStay(get);
  const lunch = get('lunch') === '1';
  const name = get('name'), email = get('email'), phone = get('phone'), from = get('from');
  const idType = get('idType'), idLast4 = get('idLast4'), utr = get('utr');
  const file = form.get('screenshot');

  if (name.length < 2) throw new UserError('Please enter your full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError('Please enter a valid email address.');
  if (phone.replace(/\D/g, '').length < 10) throw new UserError('Please enter a valid phone number.');
  if (from.length < 3) throw new UserError('Please tell us your address (where you are coming from).');
  if (!ID_TYPES.includes(idType)) throw new UserError('Please choose an ID proof type.');
  if (!/^[A-Za-z0-9]{4}$/.test(idLast4)) throw new UserError('Please enter the last 4 characters of your ID number.');
  if (get('terms') !== '1') throw new UserError('Please accept the stay rules to continue.');
  if (!(file instanceof File) || file.size === 0) throw new UserError('Please upload your payment screenshot.');
  if (file.size > MAX_UPLOAD) throw new UserError('Screenshot is too large. Please upload an image under 5 MB.');
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/heic': 'heic' }[file.type];
  if (!ext) throw new UserError('Screenshot must be an image (PNG or JPG).');

  // Check again right before saving: someone else may have booked since the guest checked.
  const perNight = await freeTentsByNight(env, stay.checkin, stay.checkout);
  if (Math.min(...perNight.map(n => n.free)) < stay.tents) {
    throw new UserError('Sorry, those dates just filled up. Please pick other dates or message us on WhatsApp.');
  }

  const amount = price(stay, lunch).total;
  const bookingId = makeBookingId(stay.checkin);
  const filename = `${bookingId}-payment.${ext}`;
  const uploadId = await uploadFile(env, file, filename);
  const text = s => ({ rich_text: s ? [{ text: { content: s.slice(0, 2000) } }] : [] });

  await notion(env, 'POST', '/pages', {
    parent: { database_id: env.NOTION_DB_ID },
    properties: {
      [P.name]: { title: [{ text: { content: name.slice(0, 200) } }] },
      [P.bookingId]: text(bookingId),
      [P.email]: { email },
      [P.phone]: { phone_number: phone },
      [P.from]: text(from),
      [P.checkin]: { date: { start: stay.checkin } },
      [P.checkout]: { date: { start: stay.checkout } },
      [P.guests]: { number: stay.guests },
      [P.tents]: { number: stay.tents },
      [P.lunch]: { checkbox: lunch },
      [P.amount]: { number: amount },
      [P.idProof]: text(`${idType} ending ${idLast4.toUpperCase()}`),
      [P.utr]: text(utr),
      [P.screenshot]: { files: [{ type: 'file_upload', file_upload: { id: uploadId }, name: filename }] },
      [P.status]: { [STATUS.type]: { name: STATUS.submitted } },
      [P.terms]: { checkbox: true },
    },
  });
  return { bookingId, amount, ...stay };
}

// e.g. EKA-1015-K7QM (check-in month+day, then 4 random characters without look-alikes)
function makeBookingId(checkin) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = [...crypto.getRandomValues(new Uint8Array(4))].map(b => abc[b % abc.length]).join('');
  return `EKA-${checkin.slice(5).replace('-', '')}-${rand}`;
}

// ---------- Notion ----------
async function notion(env, method, path, body) {
  const res = await fetch(NOTION + path, {
    method,
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion ${method} ${path} → ${res.status}: ${data.message}`);
  return data;
}

async function queryAll(env, query) {
  const out = [];
  let cursor;
  do {
    const r = await notion(env, 'POST', `/databases/${env.NOTION_DB_ID}/query`, { ...query, page_size: 100, ...(cursor && { start_cursor: cursor }) });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

// Notion file upload: create the upload, send the bytes, then attach the upload id to the page.
async function uploadFile(env, file, filename) {
  const up = await notion(env, 'POST', '/file_uploads', { filename, content_type: file.type });
  const body = new FormData();
  body.append('file', file, filename);
  const res = await fetch(`${NOTION}/file_uploads/${up.id}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION },
    body,
  });
  if (!res.ok) throw new Error(`Notion file upload → ${res.status}: ${await res.text()}`);
  return up.id;
}
