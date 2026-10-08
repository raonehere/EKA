// EKA Forest booking page: availability check, price summary, UPI payment + screenshot upload.
// Prices here are for display only; the Worker recalculates everything before saving to Notion.
const PRICE_PER_HEAD = 1850, LUNCH_PER_HEAD = 250, PER_TENT = 2;

const form = document.getElementById('booking-form');
const $ = id => document.getElementById(id);
const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:8787' : form.dataset.api;
const UPI = form.dataset.upi;
const inr = n => '₹' + n.toLocaleString('en-IN');
const DAY = 86400000;
const addDays = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

$('y').textContent = new Date().getFullYear();
$('upi-id').textContent = UPI;

// Dates: no past check-in (India time), check-out at least one night later.
const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
$('checkin').min = today;
$('checkout').min = addDays(today, 1);
$('checkin').addEventListener('change', () => {
  const next = addDays($('checkin').value, 1);
  $('checkout').min = next;
  if (!$('checkout').value || $('checkout').value < next) $('checkout').value = next;
});

let stay = null; // the stay that passed the availability check

function setStatus(el, msg, error = false) {
  el.textContent = msg;
  el.classList.toggle('status--error', error);
}

function reset() {
  stay = null;
  $('summary').hidden = $('step-details').hidden = $('step-pay').hidden = true;
  setStatus($('stay-status'), '');
}
['checkin', 'checkout', 'guests'].forEach(id => $(id).addEventListener('input', reset));
$('lunch').addEventListener('change', () => stay && render());

function render() {
  const lunch = $('lunch').checked;
  const { nights, guests, tents } = stay;
  const stayCost = guests * nights * PRICE_PER_HEAD;
  const lunchCost = lunch ? guests * nights * LUNCH_PER_HEAD : 0;
  const total = stayCost + lunchCost;
  const n = (x, word) => `${x} ${word}${x === 1 ? '' : 's'}`;
  $('summary').innerHTML = `<dl>
    <dt>${fmt(stay.checkin)} → ${fmt(stay.checkout)}</dt><dd>${n(nights, 'night')}</dd>
    <dt>${n(guests, 'guest')}</dt><dd>${n(tents, 'tent')}</dd>
    <dt>Stay with dinner &amp; breakfast (${guests} × ${inr(PRICE_PER_HEAD)} × ${n(nights, 'night')})</dt><dd>${inr(stayCost)}</dd>
    ${lunch ? `<dt>Lunch (${guests} × ${inr(LUNCH_PER_HEAD)} × ${n(nights, 'day')})</dt><dd>${inr(lunchCost)}</dd>` : ''}
    <dt class="total">Total</dt><dd class="total">${inr(total)}</dd>
  </dl>`;
  $('summary').hidden = false;
  $('pay-amount').textContent = inr(total);
  $('upi-app').href = `upi://pay?pa=${encodeURIComponent(UPI)}&pn=${encodeURIComponent('EKA Forest')}&am=${total}&cu=INR&tn=${encodeURIComponent('EKA Forest booking')}`;
}

$('check-btn').addEventListener('click', async () => {
  for (const id of ['checkin', 'checkout', 'guests']) if (!$(id).reportValidity()) return;
  const btn = $('check-btn');
  btn.disabled = true;
  setStatus($('stay-status'), 'Checking availability…');
  try {
    const q = new URLSearchParams({ checkin: $('checkin').value, checkout: $('checkout').value, guests: $('guests').value });
    const res = await fetch(`${API}/api/availability?${q}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (!data.available) {
      reset();
      const full = data.perNight.filter(n => n.free < data.tents).map(n => fmt(n.date));
      setStatus($('stay-status'), data.free === 0
        ? `Sorry, we're fully booked on ${full.join(', ')}. Please try other dates.`
        : `Sorry, only ${data.free} tent${data.free === 1 ? '' : 's'} free (${data.free * PER_TENT} people) for these dates. Try fewer guests or other dates.`, true);
      return;
    }
    stay = data;
    setStatus($('stay-status'), `Good news, ${data.tents === 1 ? 'a tent is' : `${data.tents} tents are`} available for your dates.`);
    render();
    $('step-details').hidden = $('step-pay').hidden = false;
  } catch (e) {
    reset();
    setStatus($('stay-status'), e.message || 'Could not check availability. Please try again.', true);
  } finally {
    btn.disabled = false;
  }
});

$('copy-upi').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(UPI); $('copy-upi').textContent = 'Copied'; }
  catch { $('copy-upi').textContent = 'Copy failed'; }
  setTimeout(() => { $('copy-upi').textContent = 'Copy'; }, 2000);
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!stay || !form.reportValidity()) return;
  const file = $('screenshot').files[0];
  if (file && file.size > 5 * 1024 * 1024) return setStatus($('submit-status'), 'Screenshot is too large. Please upload an image under 5 MB.', true);
  const btn = $('submit-btn');
  btn.disabled = true;
  setStatus($('submit-status'), 'Sending your booking…');
  try {
    const res = await fetch(`${API}/api/bookings`, { method: 'POST', body: new FormData(form) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    form.hidden = true;
    $('done-id').textContent = data.bookingId;
    $('done-summary').textContent = `${fmt(data.checkin)} to ${fmt(data.checkout)}, ${data.guests} guest${data.guests === 1 ? '' : 's'}, ${inr(data.amount)} paid by UPI.`;
    $('done').hidden = false;
    $('done').focus();
  } catch (err) {
    setStatus($('submit-status'), err.message || 'Could not send your booking. Please try again.', true);
    btn.disabled = false;
  }
});
