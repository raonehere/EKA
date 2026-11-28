/* ==========================================================================
   EKA Forest, availability calendar + booking flow
   No dependencies, no build step. Reads settings from booking-config.js.

   Live mode  : talks to the Cloudflare Worker in /worker (Notion + UPI advance)
   Preview    : cfg.demo === true, uses generated availability + a fake payment
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.EKA_BOOKING || {};
  var UNITS = cfg.units || [];
  var TOTAL = UNITS.length;
  var PER_TENT = UNITS.reduce(function (m, u) { return Math.min(m, u.capacity || 3); }, 9);
  var ADVANCE_SINGLE = cfg.advanceSingle || 1000;
  var ADVANCE_GROUP = cfg.advanceGroup || 2000;
  var API = (cfg.apiBase || '').replace(/\/+$/, '');
  var DEMO = !!cfg.demo || !API;
  var HORIZON = cfg.horizonMonths || 12;
  var MAX_NIGHTS = cfg.maxNights || 10;
  var MIN_NIGHTS = cfg.minNights || 1;
  var MAX_GUESTS = cfg.maxGuestsOnline || 20;
  var WA = String(cfg.whatsapp || '').replace(/\D/g, '');

  /* ---------------- tiny date helpers (all local, no UTC drift) ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) {
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function todayISO() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
    } catch (e) {
      var d = new Date(); return iso(d);
    }
  }
  var TODAY = todayISO();
  function fmtLong(s) {
    return parse(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtShort(s) {
    return parse(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function monthName(y, m) {
    return new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  /* ---------------- state ------------------------------------------------ */
  var state = {
    viewY: 0, viewM: 0,
    start: null, end: null, hover: null,
    nights: {},            // 'YYYY-MM-DD' -> free tents that night
    loaded: false,
    failed: false,
    focusDate: TODAY,
    order: null,
    paid: false,
    busy: false
  };

  /* ---------------- elements -------------------------------------------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = {
    grid: $('#cal-grid'),
    month: $('#cal-month'),
    prev: $('#cal-prev'),
    next: $('#cal-next'),
    hint: $('#cal-hint'),
    status: $('#cal-status'),
    fallback: $('#book-fallback'),
    form: $('#booking-form'),
    formError: $('#form-error'),
    sumIn: $('#sum-in'),
    sumOut: $('#sum-out'),
    sumNights: $('#sum-nights'),
    sumGuests: $('#sum-guests'),
    sumTents: $('#sum-tents'),
    sumStay: $('#sum-stay'),
    sumLunch: $('#sum-lunch'),
    sumTotal: $('#sum-total'),
    sumAdvance: $('#sum-advance'),
    sumBalance: $('#sum-balance'),
    advanceDue: $('#advance-due'),
    adults: $('#adults'),
    children: $('#children'),
    infants: $('#infants'),
    lunches: $('#lunches'),
    idProof: $('#id-proof'),
    capacity: $('#capacity-note'),
    payBtn: $('#pay-btn'),
    payLabel: $('#pay-btn-label'),
    terms: $('#terms'),
    name: $('#name'),
    phone: $('#phone'),
    email: $('#email'),
    notes: $('#notes'),
    paying: $('#paying'),
    payingText: $('#paying-text'),
    confirm: $('#confirm'),
    confirmTag: $('#confirm-tag'),
    confirmLead: $('#confirm-lead'),
    confirmRef: $('#confirm-ref'),
    confirmDates: $('#confirm-dates'),
    confirmGuests: $('#confirm-guests'),
    confirmPaid: $('#confirm-paid'),
    confirmWa: $('#confirm-wa'),
    confirmIcs: $('#confirm-ics'),
    confirmClose: $('#confirm-close'),
    confirmPreview: $('#confirm-preview'),
    confirmManage: $('#confirm-manage'),

    payPanel: $('#paypanel'),
    payTag: $('#pay-tag'),
    payAmount: $('#pay-amount'),
    payUpi: $('#pay-upi-id'),
    payCopy: $('#pay-copy'),
    payRef: $('#pay-ref'),
    payQr: $('#pay-qr'),
    payHold: $('#pay-hold'),
    payForm: $('#pay-form'),
    payFile: $('#pay-file'),
    payFileName: $('#pay-file-name'),
    payError: $('#pay-error'),
    payUpload: $('#pay-upload'),
    payLater: $('#pay-later'),
    payClose: $('#pay-close')
  };

  if (!el.grid) return;

  /* ---------------- WhatsApp links -------------------------------------- */
  (function wireWhatsApp() {
    if (!WA) return;
    var msg = encodeURIComponent(cfg.whatsappMessage || 'Hi EKA Forest, I have a question about booking a stay.');
    var href = 'https://wa.me/' + WA + '?text=' + msg;
    document.querySelectorAll('[data-wa-link]').forEach(function (a) { a.href = href; });
    el.confirmWa.href = href;
  })();

  /* ---------------- demo availability ----------------------------------- */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function demoNights(from, to) {
    var out = {}, d = from, guard = 0;
    // a couple of sell-out stretches so the "full" state is visible
    var busy = {};
    [38, 39, 40, 61, 62].forEach(function (n) { busy[addDays(TODAY, n)] = 1; });
    while (d < to && guard++ < 800) {
      var dow = parse(d).getDay();                 // 0 Sun … 6 Sat
      var n = hash(d) % 10;
      var free = TOTAL;
      if (busy[d]) free = 0;
      else {
        if (dow === 5 || dow === 6) free -= 3;     // weekends fill faster
        else if (dow === 0) free -= 1;
        if (n < 2) free -= 2;
        else if (n === 9) free -= 1;
      }
      out[d] = Math.max(0, Math.min(TOTAL, free));
      d = addDays(d, 1);
    }
    return out;
  }

  /* ---------------- availability fetch ---------------------------------- */
  function loadAvailability() {
    var from = iso(new Date(state.viewY, state.viewM, 1));
    if (from < TODAY) from = TODAY;      // the current month starts in the past
    var horizonEnd = (function () {
      var d = new Date(); d.setMonth(d.getMonth() + HORIZON + 1); d.setDate(1);
      return iso(d);
    })();
    var to = horizonEnd > from ? horizonEnd : addDays(from, 62);

    if (!DEMO) {
      fetch(API + '/availability?from=' + from + '&to=' + to, { headers: { accept: 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error('availability ' + r.status);
          return r.json();
        })
        .then(function (data) {
          state.nights = data.nights || {};
          state.loaded = true; state.failed = false;
          el.fallback.hidden = true;
          render();
          updateSummary();
        })
        .catch(function () {
          state.failed = true; state.loaded = false;
          el.fallback.hidden = false;
          el.grid.innerHTML = '<p class="cal__status">Availability is unavailable right now.</p>';
          el.month.textContent = monthName(state.viewY, state.viewM);
        });
      return;
    }

    // preview mode
    state.nights = demoNights(from, to < addDays(TODAY, 400) ? to : addDays(TODAY, 400));
    state.loaded = true;
    render();
    updateSummary();
  }

  function freeOn(date) {
    if (state.nights[date] === undefined) return null;   // outside window
    return state.nights[date];
  }

  /* ---------------- calendar rendering ---------------------------------- */
  function render() {
    var y = state.viewY, m = state.viewM;
    el.month.textContent = monthName(y, m);

    var first = new Date(y, m, 1);
    var offset = (first.getDay() + 6) % 7;             // Monday-first
    var days = new Date(y, m + 1, 0).getDate();
    var cells = [];

    for (var i = 0; i < offset; i++) {
      cells.push('<span class="day day--pad" aria-hidden="true"></span>');
    }

    for (var d = 1; d <= days; d++) {
      var date = iso(new Date(y, m, d));
      var free = freeOn(date);
      var past = date < TODAY;
      var full = free !== null && free <= 0;
      var unknown = free === null;
      var cls = 'day';
      var label = parse(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      var stateText;

      if (past) { cls += ' day--past'; stateText = 'past date'; }
      else if (unknown) { cls += ' day--unknown'; stateText = 'availability unknown'; }
      else if (full) { cls += ' day--full'; stateText = 'fully booked'; }
      else {
        cls += free <= 2 ? ' day--few' : ' day--open';
        stateText = free + (free === 1 ? ' A-frame tent free' : ' A-frame tents free');
      }
      if (date === TODAY) cls += ' day--today';

      var disabled = past || unknown;
      cells.push(
        '<button type="button" class="' + cls + '" data-date="' + date + '"' +
        ' tabindex="' + (date === state.focusDate ? '0' : '-1') + '"' +
        (disabled ? ' disabled' : '') +
        (full ? ' aria-disabled="true"' : '') +
        ' aria-label="' + label + ', ' + stateText + '">' +
        '<span class="day__n">' + d + '</span>' +
        '<span class="day__k">' + (past || unknown || full ? '' : '<span class="day__dot"></span>') + '</span>' +
        '</button>'
      );
    }

    el.grid.innerHTML = cells.join('');
    paintSelection();
    syncNav();
  }

  function syncNav() {
    var now = new Date();
    var curY = now.getFullYear(), curM = now.getMonth();
    el.prev.disabled = (state.viewY < curY) || (state.viewY === curY && state.viewM <= curM);
    var max = new Date(); max.setMonth(max.getMonth() + HORIZON);
    el.next.disabled = (state.viewY > max.getFullYear()) ||
      (state.viewY === max.getFullYear() && state.viewM >= (max.getMonth() + 1));
  }

  function paintSelection() {
    var cells = el.grid.querySelectorAll('.day[data-date]');
    var a = state.start, b = state.end || (state.start && state.hover && state.hover > state.start ? state.hover : null);
    Array.prototype.forEach.call(cells, function (c) {
      var date = c.dataset.date;
      c.classList.remove('day--start', 'day--end', 'day--in', 'day--preview');
      if (!a) return;
      var isEnd = b && date === b;
      if (date === a) c.classList.add('day--start');
      if (isEnd) c.classList.add('day--end');
      if (b && date > a && date < b) c.classList.add(state.end ? 'day--in' : 'day--preview');
      if (a === b && date === a) c.classList.add('day--end');
      c.setAttribute('aria-pressed', (date === a || isEnd) ? 'true' : 'false');
    });
  }

  function hint(text, tone) {
    el.hint.textContent = text;
    el.hint.style.color = tone === 'bad' ? '#8c2f1f' : (tone === 'warn' ? '#8c5a12' : '');
  }

  /* ---------------- guests ----------------------------------------------- */
  function paying() {
    return Math.max(0, parseInt(el.adults.value, 10) || 0);
  }
  function under10() { return +el.children.value || 0; }
  function under5() { return +el.infants.value || 0; }
  /* Price in rupees for the stay as currently chosen. */
  function priceFor(nights) {
    var P = cfg.pricing || { perHeadPerNight: 1850, childHalfPerNight: 925, lunchPerHeadPerDay: 250 };
    var stay = nights * (paying() * P.perHeadPerNight + under10() * P.childHalfPerNight);
    var lunchHeads = paying() + under10();
    var count = Math.min(parseInt(el.lunches.value, 10) || 0, nights);
    var lunch = count * lunchHeads * P.lunchPerHeadPerDay;
    var total = stay + lunch, due = advanceFor(total);
    return { stay: stay, lunch: lunch, total: total, advance: due, balance: total - due };
  }
  /* One paying guest pays ₹1,000, two or more pay ₹2,000. Under-5s are free
     and do not count towards the advance. */
  function advanceFor(total) {
    var heads = paying() + under10();
    return Math.min(total, heads > 1 ? ADVANCE_GROUP : ADVANCE_SINGLE);
  }
  /* The advance due right now, worked out from the form so the page never shows a stale figure. */
  function advanceDue() {
    if (!state.start || !state.end) return 0;
    return priceFor(diffDays(state.start, state.end)).advance;
  }
  function tentsNeeded() {
    if (!PER_TENT) return 1;
    // a solo guest still gets a whole tent
    return Math.max(1, Math.ceil(paying() / PER_TENT));
  }
  /* "3 guests, 1 aged 5 to 10, 1 under 5" for summaries and confirmations. */
  function guestLine() {
    var p = paying(), out = plural(p, 'adult');
    if (under10()) out += ', ' + under10() + ' aged 5 to 10';
    if (under5()) out += ', ' + under5() + ' under 5';
    return out;
  }
  function rupees(n) { return '₹' + Math.round(n).toLocaleString('en-IN'); }

  /* ---------------- range logic ----------------------------------------- */
  function nightsOf(a, b) {
    var out = [], d = a;
    while (d < b) { out.push(d); d = addDays(d, 1); }
    return out;
  }
  function rangeStatus(a, b) {
    // returns {ok, reason, minFree}
    var n = diffDays(a, b);
    if (n < MIN_NIGHTS) return { ok: false, reason: 'Pick at least ' + MIN_NIGHTS + ' night.' };
    if (n > MAX_NIGHTS) return { ok: false, reason: 'Stays are limited to ' + MAX_NIGHTS + ' nights. Message us for longer.' };
    var nights = nightsOf(a, b), minFree = 99;
    for (var i = 0; i < nights.length; i++) {
      var f = freeOn(nights[i]);
      if (f === null) return { ok: false, reason: 'Those dates are outside the booking window.' };
      if (f <= 0) return { ok: false, reason: 'One of those nights is already full.' };
      if (f < minFree) minFree = f;
    }
    return { ok: true, minFree: minFree };
  }

  function pick(date) {
    var free = freeOn(date);
    if (free === null || date < TODAY) return;
    var isFull = free <= 0;

    // Starting a stay on a sold-out night is impossible; but a sold-out night can
    // still be a check-out day, because check-out nights are not occupied.
    if (!state.start || (state.start && state.end)) {
      if (isFull) { hint('That night is full. Pick another check-in date.', 'bad'); return; }
      state.start = date; state.end = null; state.hover = null;
      hint('Now pick your check-out date.');
    } else if (date <= state.start) {
      if (isFull) { hint('That night is full. Pick another check-in date.', 'bad'); return; }
      state.start = date; state.end = null;
      hint('Now pick your check-out date.');
    } else {
      var st = rangeStatus(state.start, date);
      if (st.ok) {
        state.end = date;
        hint(diffDays(state.start, date) + ' night' + (diffDays(state.start, date) === 1 ? '' : 's') + ' selected.');
      } else {
        state.start = isFull ? state.start : date; state.end = null;
        hint(st.reason + ' Try a new check-in.', 'bad');
      }
    }
    state.focusDate = date;
    state.order = null;
    state.paid = false;
    el.payBtn.disabled = false;
    render();
    updateSummary();
    validateStay(false);
  }

  /* ---------------- summary --------------------------------------------- */
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function updateSummary() {
    var hasRange = !!(state.start && state.end);
    var n = hasRange ? diffDays(state.start, state.end) : 0;

    setDate(el.sumIn, state.start);
    setDate(el.sumOut, state.end);

    el.sumNights.textContent = hasRange ? plural(n, 'night') : '';
    el.sumGuests.textContent = guestLine();
    el.sumTents.textContent = (hasRange || state.start) && !isLarge() ? plural(tentsNeeded(), 'A-frame tent') : '';
    el.sumBalance.parentElement.hidden = step < 2;

    if (hasRange && n >= 1 && isLarge()) {
      el.sumStay.textContent = 'On WhatsApp';
      el.sumLunch.textContent = '';
      el.sumTotal.textContent = 'On WhatsApp';
      el.sumAdvance.textContent = '';
      el.sumBalance.textContent = '';
      el.advanceDue.textContent = '–';
    } else if (hasRange && n >= 1) {
      var p = priceFor(n);
      el.sumStay.textContent = rupees(p.stay);
      var count = Math.min(parseInt(el.lunches.value, 10) || 0, n);
      el.sumLunch.textContent = count ? count + (count === 1 ? ' lunch' : ' lunches') + ' each · ' + rupees(p.lunch) : 'None';
      el.sumTotal.textContent = rupees(p.total);
      el.sumAdvance.textContent = rupees(p.advance);
      el.sumBalance.textContent = rupees(p.balance);
      el.advanceDue.textContent = rupees(p.advance);
    } else {
      el.sumStay.textContent = '';
      el.sumLunch.textContent = '';
      el.sumTotal.textContent = '';
      el.sumAdvance.textContent = '';
      el.sumBalance.textContent = '';
      el.advanceDue.textContent = '–';
    }

    el.payLabel.textContent = (state.order && !state.paid) ? 'Finish payment' : 'Reserve these dates';
  }

  function setDate(node, value) {
    if (!value) {
      node.textContent = 'Select a date';
      node.classList.add('is-empty');
      return;
    }
    node.classList.remove('is-empty');
    node.textContent = fmtShort(value);
  }

  /* ---------------- validation ------------------------------------------ */
  function setError(name, msg) {
    var p = document.querySelector('[data-err-for="' + name + '"]');
    if (p) p.textContent = msg || '';
    var field = p && p.closest('.field');
    if (field) field.classList.toggle('is-invalid', !!msg);
    if (name === 'terms') el.terms.closest('.terms').style.color = msg ? '#8c2f1f' : '';
    return !msg;
  }

  function isLarge() { return paying() > MAX_GUESTS; }

  function validateStay(showHint) {
    if (!state.start) {
      el.capacity.textContent = 'Pick your nights above and we\'ll work out how many A-frame tents you need.';
      el.capacity.className = 'book__capacity';
      return false;
    }
    if (!state.end) {
      el.capacity.textContent = 'Now pick a check-out date.';
      el.capacity.className = 'book__capacity';
      return false;
    }
    if (isLarge()) {
      el.capacity.textContent = 'Large group: send your request and we will check availability for your dates and send the price on WhatsApp.';
      el.capacity.className = 'book__capacity';
      return true;
    }
    var need = tentsNeeded();
    var st = rangeStatus(state.start, state.end);
    if (!st.ok) {
      el.capacity.textContent = st.reason;
      el.capacity.className = 'book__capacity is-bad';
      return false;
    }
    if (st.minFree < need) {
      el.capacity.textContent = 'Only ' + plural(st.minFree, 'A-frame tent') + ' free on one of those nights, and ' +
        plural(paying(), 'paying guest') + ' needs ' + need + '. Reduce the group or choose other dates.';
      el.capacity.className = 'book__capacity is-bad';
      return false;
    }
    el.capacity.textContent = guestLine() + ' · ' + plural(need, 'A-frame tent') + ' for ' + plural(diffDays(state.start, state.end), 'night') + '.';
    el.capacity.className = 'book__capacity';
    return true;
  }

  /* ---------------- steps ----------------------------------------------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var ID_MAX = 8 * 1024 * 1024;
  var step = 1;

  /* Checks one step, shows its errors and returns the first field that failed (or null). */
  function checkStep(n) {
    var first = null;
    function fail(name, msg) {
      setError(name, msg);
      if (msg && !first) first = name;
    }

    if (n === 1) {
      if (!state.start || !state.end) {
        hint('Choose your check-in and check-out dates first.', 'bad');
        first = 'calendar';
      }
    }

    if (n === 2) {
      fail('adults', paying() ? '' : 'At least one paying guest is needed.');
      if (!first && !validateStay(true)) first = 'adults';
      fail('name', el.name.value.trim().length < 2 ? 'Please tell us your name.' : '');
      fail('phone', el.phone.value.replace(/\D/g, '').length === 10 ? '' : 'Enter a 10-digit Indian mobile number.');
      var mail = el.email.value.trim();
      fail('email', !mail || EMAIL_RE.test(mail) ? '' : 'Enter a valid email address.');
    }

    if (n === 3) {
      var idFile = el.idProof.files && el.idProof.files[0];
      fail('idproof', !idFile ? 'Upload a photo or PDF of your ID to continue.'
        : idFile.size > ID_MAX ? 'That ID file is too large. Please pick one under 8 MB.' : '');
    }

    return first;
  }

  function focusField(name) {
    if (name === 'calendar') {
      var day = el.grid.querySelector('.day[data-date]:not([disabled])');
      if (day) day.focus({ preventScroll: true });
      document.getElementById('calendar').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var node = $('#' + (name === 'idproof' ? 'id-proof' : name));
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try { node.focus({ preventScroll: true }); } catch (e) {}
  }

  function showStep(n) {
    step = n;
    el.form.setAttribute('data-step', String(n));
    updateSummary();
    Array.prototype.forEach.call(document.querySelectorAll('.wz-step'), function (s) {
      s.hidden = +s.getAttribute('data-step') !== n;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.wz-progress__item'), function (li) {
      var k = +li.getAttribute('data-step');
      li.classList.toggle('is-done', k < n);
      li.classList.toggle('is-current', k === n);
      if (k === n) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }

  function goNext() {
    var bad = checkStep(step);
    if (bad) { focusField(bad); return; }
    showStep(Math.min(4, step + 1));
    var top = el.form.getBoundingClientRect().top + window.pageYOffset - 24;
    window.scrollTo({ top: top, behavior: 'smooth' });
  }

  function goBack() {
    showStep(Math.max(1, step - 1));
    var top = el.form.getBoundingClientRect().top + window.pageYOffset - 24;
    window.scrollTo({ top: top, behavior: 'smooth' });
  }

  function validateForm() {
    var bad = null, badStep = 0;
    for (var s = 1; s <= 3 && !bad; s++) {
      bad = checkStep(s);
      if (bad) badStep = s;
    }
    if (!bad && !el.terms.checked) {
      setError('terms', 'Please accept the advance terms to continue.');
      bad = 'terms'; badStep = 4;
    }
    if (!bad && !validateStay(true)) { bad = 'calendar'; badStep = 1; }

    el.formError.hidden = true;
    if (bad) {
      showStep(badStep);
      focusField(bad);
      return false;
    }
    return true;
  }

  /* ---------------- payload --------------------------------------------- */
  function payload() {
    return {
      checkIn: state.start,
      checkOut: state.end,
      adults: paying(),
      childrenUnder10: under10() + under5(),
      childrenUnder5: under5(),
      childrenFiveToTen: under10(),
      lunches: Math.min(parseInt(el.lunches.value, 10) || 0, diffDays(state.start, state.end) || 0),
      guests: paying(),
      tents: tentsNeeded(),
      name: el.name.value.trim(),
      phone: '+91' + el.phone.value.replace(/\D/g, ''),
      email: el.email.value.trim(),
      notes: el.notes.value.trim(),
      termsAccepted: true
    };
  }

  /* ---------------- payment: UPI ------------------------------------------ */
  function upiId() {
    var o = state.order && state.order.upi;
    return (o && o.id) || (cfg.upi && cfg.upi.id) || '';
  }
  function upiName() {
    var o = state.order && state.order.upi;
    return (o && o.name) || (cfg.upi && cfg.upi.name) || 'EKA';
  }
  function upiLinkFor(reference) {
    var id = upiId();
    if (!id) return '';
    return 'upi://pay?' + [
      'pa=' + encodeURIComponent(id),
      'pn=' + encodeURIComponent(upiName()),
      'am=' + advanceDue(),
      'cu=INR',
      'tn=' + encodeURIComponent('EKA Forest advance ' + reference)
    ].join('&');
  }

  function renderQr(link) {
    if (!el.payQr) return;
    if (!link || !window.qrcode) {
      el.payQr.innerHTML = '<p class="paypanel__qrfallback">Scanning is not available, pay to the UPI ID instead.</p>';
      return;
    }
    try {
      var qr = window.qrcode(0, 'M');
      qr.addData(link);
      qr.make();
      el.payQr.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch (e) {
      el.payQr.innerHTML = '<p class="paypanel__qrfallback">Scanning is not available, pay to the UPI ID instead.</p>';
    }
  }

  var NOT_HELD = 'Your dates are not blocked yet, sending the screenshot is what claims them. ' +
    'Do it within a couple of hours. If someone else gets in first, message us and we will move your ' +
    'advance to other dates.';

  function busy(on, text) {
    state.busy = on;
    el.paying.hidden = !on;
    el.payingText.textContent = text || 'Saving your details…';
    el.payBtn.classList.toggle('is-busy', on);
    el.payBtn.disabled = on;
    document.body.classList.toggle('is-locked', on);
  }

  function fail(message) {
    busy(false);
    el.formError.hidden = false;
    el.formError.textContent = message;
    el.formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function demoReference() {
    return 'PREVIEW-' + state.start.slice(2, 4) + state.start.slice(5, 7) + state.start.slice(8, 10);
  }

  function demoOrder() {
    var ref = demoReference();
    return {
      reference: ref,
      token: 'demo',
      manageUrl: '',
      amount: advanceDue(),
      upi: { id: (cfg.upi && cfg.upi.id) || 'eka.82200883@hdfcbank', name: (cfg.upi && cfg.upi.name) || 'EKA', link: '' }
    };
  }

  /* ---------------- payment panel ----------------------------------------- */
  function showPayPanel() {
    var order = state.order;
    if (!order) return;

    var id = upiId();
    var link = upiLinkFor(order.reference);

    el.payRef.textContent = order.reference;
    el.payAmount.textContent = rupees(advanceDue());
    el.payUpi.textContent = id || 'not set';
    el.payCopy.hidden = !id;
    el.payHold.textContent = NOT_HELD;
    el.payError.textContent = '';
    el.payFileName.textContent = 'PNG, JPG or PDF · under 8 MB';
    el.payFile.value = '';

    renderQr(link);

    el.payTag.textContent = 'Pay to confirm';
    el.payTag.style.background = '#a55a1c';
    el.payPanel.hidden = false;
    document.body.classList.add('is-locked');
    setTimeout(function () { el.payUpload.focus({ preventScroll: true }); }, 40);
  }

  function closePayPanel() {
    el.payPanel.hidden = true;
    document.body.classList.remove('is-locked');
    if (state.order && !state.paid) {
      el.payLabel.textContent = 'Finish payment';
      hint('Your dates are not blocked yet. Pay ' + rupees(advanceDue()) +
        ' by UPI and upload the screenshot to claim them.', 'warn');
      el.payBtn.focus();
    }
  }

  function payError(msg) {
    el.payError.textContent = msg || '';
    if (msg) el.payError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* Photos from a phone are far too big for Notion; shrink before uploading. */
  async function shrink(file) {
    if (!/^image\//.test(file.type) || /^image\/(gif|svg)/.test(file.type)) return file;
    try {
      var bitmap = await createImageBitmap(file);
      var max = 1600;
      var scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && file.size < 400000) {
        if (bitmap.close) bitmap.close();
        return file;
      }
      var w = Math.round(bitmap.width * scale);
      var h = Math.round(bitmap.height * scale);
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      if (bitmap.close) bitmap.close();
      var blob = await new Promise(function (resolve) {
        canvas.toBlob(resolve, 'image/jpeg', 0.82);
      });
      if (!blob) return file;
      return new File([blob], 'payment.jpg', { type: 'image/jpeg' });
    } catch (e) {
      return file;
    }
  }

  async function uploadScreenshot(e) {
    e.preventDefault();
    if (state.busy || !state.order) return;

    var file = el.payFile.files && el.payFile.files[0];
    if (!file) return payError('Choose the screenshot or photo of your payment first.');
    if (file.size > 8 * 1024 * 1024) return payError('That file is too large. Please pick one under 8 MB.');

    payError('');
    state.busy = true;
    el.payUpload.disabled = true;
    el.payUpload.textContent = 'Sending…';

    try {
      var blob = await shrink(file);

      if (DEMO) {
        await new Promise(function (r) { setTimeout(r, 900); });
        state.paid = true;
        el.payPanel.hidden = true;
        confirmScreen({ reference: state.order.reference, preview: true, manageUrl: '' });
        return;
      }

      var fd = new FormData();
      fd.append('reference', state.order.reference);
      fd.append('token', state.order.token || '');
      fd.append('file', blob, blob.name || 'payment.jpg');

      var res = await fetch(API + '/bookings/screenshot', { method: 'POST', body: fd });
      var body = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(body.error || 'We could not store the screenshot.');

      state.paid = true;
      el.payPanel.hidden = true;
      confirmScreen({
        reference: body.reference || state.order.reference,
        preview: false,
        manageUrl: body.manageUrl || state.order.manageUrl || ''
      });
    } catch (err) {
      payError(err.message || 'We could not upload that. Please try again, or message us on WhatsApp.');
    } finally {
      state.busy = false;
      el.payUpload.disabled = false;
      el.payUpload.textContent = 'Send screenshot';
    }
  }

  async function uploadIdProof(file) {
    if (DEMO) return;
    var fd = new FormData();
    fd.append('reference', state.order.reference);
    fd.append('token', state.order.token || '');
    fd.append('file', file, file.name || 'id-proof');
    var res = await fetch(API + '/bookings/id', { method: 'POST', body: fd });
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(body.error || 'We could not store your ID proof. Please try again.');
  }

  async function submit() {
    if (state.busy) return;
    if (!validateForm()) return;

    var data = payload();

    if (DEMO) {
      busy(true, 'Preview: saving your details…');
      setTimeout(function () {
        busy(false);
        state.order = demoOrder();
        state.paid = false;
        showPayPanel();
      }, 800);
      return;
    }

    busy(true, 'Saving your details…');
    try {
      if (!state.order) {
        var res = await fetch(API + '/bookings', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(data)
        });
        var body = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(body.error || 'We could not hold those dates. Please try again.');
        state.order = body;
        state.paid = false;
      }
      busy(true, 'Sending your ID proof…');
      await uploadIdProof(el.idProof.files[0]);
    } catch (e) {
      fail(e.message || 'Something went wrong. Please try again or message us on WhatsApp.');
      return;
    }

    busy(false);
    if (state.order.large) {
      confirmScreen({ reference: state.order.reference, preview: false, large: true, manageUrl: state.order.manageUrl || '' });
      return;
    }
    showPayPanel();
  }

  /* ---------------- confirmation ---------------------------------------- */
  function confirmScreen(opts) {
    busy(false);
    var n = diffDays(state.start, state.end);
    el.confirmRef.textContent = opts.reference;
    el.confirmDates.textContent = fmtShort(state.start) + ' → ' + fmtShort(state.end) + ' · ' + plural(n, 'night');
    el.confirmGuests.textContent = guestLine() + (isLarge() ? '' : ' · ' + plural(tentsNeeded(), 'A-frame tent'));
    el.confirmPaid.textContent = rupees(advanceDue());
    el.confirmPreview.hidden = !opts.preview;

    if (el.confirmManage) {
      if (opts.manageUrl) {
        el.confirmManage.href = opts.manageUrl;
      } else {
        var manageBase = String(cfg.siteUrl || '').replace(/\/+$/, '');
        var managePath = cfg.managePath || 'manage/';
        el.confirmManage.href = (manageBase ? manageBase + '/book/' : '') + managePath +
          '?r=' + encodeURIComponent(opts.reference) + (DEMO ? '&k=demo' : '');
      }
    }

    if (opts.preview) {
      el.confirmTag.textContent = 'Preview';
      el.confirmTag.style.background = '#a55a1c';
      el.confirmLead.textContent = 'This is what guests see after they upload their payment screenshot. Nothing was charged or saved, preview mode.';
      document.getElementById('confirm-title').textContent = 'We\'re checking your payment';
    } else {
      el.confirmTag.textContent = 'Payment review';
      el.confirmTag.style.background = '#a55a1c';
      el.confirmLead.textContent = 'Thank you, your screenshot is in our bookings board. We check UPI credits by hand and confirm on WhatsApp, usually within a few hours.';
      document.getElementById('confirm-title').textContent = 'We\'re checking your payment';
    }

    if (opts.large) {
      el.confirmTag.textContent = 'Request received';
      el.confirmTag.style.background = '#6b5a45';
      el.confirmLead.textContent = 'Thanks. Groups this size need a quick check first. We will look at availability for your dates and send you the price on WhatsApp. Nothing is charged yet.';
      el.confirmPaid.textContent = 'On WhatsApp';
      document.getElementById('confirm-title').textContent = 'We have your request';
    }

    el.confirm.hidden = false;
    document.body.classList.add('is-locked');
    var focusTarget = el.confirm.querySelector('.btn, button');
    if (focusTarget) focusTarget.focus();
    document.getElementById('confirm-wa').href =
      'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hi EKA Forest, my booking reference is ' + opts.reference + '.');

    if (!opts.preview) {
      el.payBtn.disabled = true;
      el.payLabel.textContent = 'Screenshot sent';
    }
  }

  el.confirmClose.addEventListener('click', closeConfirm);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !el.confirm.hidden) closeConfirm();
  });

  function closeConfirm() {
    el.confirm.hidden = true;
    document.body.classList.remove('is-locked');
    el.payBtn.focus();
  }

  el.confirmIcs.addEventListener('click', function () {
    var stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    var ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EKA Forest//Booking//EN', 'BEGIN:VEVENT',
      'UID:' + Date.now() + '@ekaforest.com', 'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + state.start.replace(/-/g, ''),
      'DTEND;VALUE=DATE:' + state.end.replace(/-/g, ''),
      'SUMMARY:EKA Forest, ' + plural(diffDays(state.start, state.end), 'night'),
      'LOCATION:Vattavada, Idukki, Kerala 685615',
      'DESCRIPTION:Booking ' + el.confirmRef.textContent + '. Check-in from 1 PM, check-out by 11 AM.',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    var url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    var a = document.createElement('a');
    a.href = url; a.download = 'eka-forest-' + state.start + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  /* ---------------- events ---------------------------------------------- */
  el.grid.addEventListener('click', function (e) {
    var b = e.target.closest('.day[data-date]');
    if (!b || b.disabled) return;
    var date = b.dataset.date;
    pick(date);
    var again = el.grid.querySelector('.day[data-date="' + date + '"]');
    if (again) { again.tabIndex = 0; again.focus({ preventScroll: true }); }
  });

  el.grid.addEventListener('mouseover', function (e) {
    var b = e.target.closest('.day[data-date]');
    if (!b || b.disabled || !state.start || state.end) return;
    if (state.hover === b.dataset.date) return;
    state.hover = b.dataset.date;
    paintSelection();
  });
  el.grid.addEventListener('mouseleave', function () {
    if (state.hover) { state.hover = null; paintSelection(); }
  });

  el.grid.addEventListener('keydown', function (e) {
    var b = e.target.closest('.day[data-date]');
    if (!b) return;
    var map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in map)) return;
    e.preventDefault();
    var next = addDays(b.dataset.date, map[e.key]);
    var d = parse(next);
    if (d.getMonth() !== state.viewM || d.getFullYear() !== state.viewY) {
      state.viewY = d.getFullYear(); state.viewM = d.getMonth();
      render();
    }
    var target = el.grid.querySelector('.day[data-date="' + next + '"]');
    if (target) {
      Array.prototype.forEach.call(el.grid.querySelectorAll('.day'), function (c) { c.tabIndex = -1; });
      target.tabIndex = 0;
      target.focus();
    }
  });

  el.prev.addEventListener('click', function () {
    var d = new Date(state.viewY, state.viewM - 1, 1);
    state.viewY = d.getFullYear(); state.viewM = d.getMonth();
    render();
  });
  el.next.addEventListener('click', function () {
    var d = new Date(state.viewY, state.viewM + 1, 1);
    state.viewY = d.getFullYear(); state.viewM = d.getMonth();
    render();
  });

  el.adults.addEventListener('input', function () {
    updateSummary();
    setError('adults', '');
    if (state.start && state.end) validateStay(false);
  });
  el.adults.addEventListener('blur', function () {
    var v = parseInt(this.value, 10);
    if (!v || v < 1) this.value = '1';
    updateSummary();
    if (state.start && state.end) validateStay(false);
  });
  el.children.addEventListener('change', function () {
    updateSummary();
    if (state.start && state.end) validateStay(false);
  });
  el.infants.addEventListener('change', updateSummary);
  el.lunches.addEventListener('change', updateSummary);

  el.phone.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 10);
  });

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.paid) return;
    if (step < 4) { goNext(); return; }
    if (state.order) { showPayPanel(); return; }
    submit();
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-next]'), function (b) {
    b.addEventListener('click', goNext);
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-back]'), function (b) {
    b.addEventListener('click', goBack);
  });

  el.form.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'name') setError('name', '');
    if (t.id === 'email') setError('email', '');
    if (t.id === 'phone') setError('phone', '');
    if (t.id === 'terms') setError('terms', '');
  });

  /* ---------------- payment panel events --------------------------------- */
  if (el.payPanel) {
    el.payClose.addEventListener('click', closePayPanel);
    el.payLater.addEventListener('click', closePayPanel);
    el.payForm.addEventListener('submit', uploadScreenshot);

    el.payFile.addEventListener('change', function () {
      var f = this.files && this.files[0];
      el.payFileName.textContent = f
        ? f.name + ' · ' + Math.max(1, Math.round(f.size / 1024)) + ' KB'
        : 'PNG, JPG or PDF · under 8 MB';
      payError('');
    });

    el.payCopy.addEventListener('click', function () {
      var id = upiId();
      if (!id) return;
      var done = function () {
        el.payCopy.textContent = 'Copied';
        setTimeout(function () { el.payCopy.textContent = 'Copy'; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(id).then(done, function () { el.payCopy.textContent = 'Select the ID'; });
      } else {
        el.payCopy.textContent = 'Select the ID';
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.payPanel.hidden) closePayPanel();
    });
  }

  /* ---------------- boot ------------------------------------------------ */
  (function boot() {
    var now = new Date();
    state.viewY = now.getFullYear();
    state.viewM = now.getMonth();
    state.focusDate = TODAY;

    var yearEl = document.getElementById('y');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
    if (DEMO) {
      var demoNote = document.getElementById('demo-note');
      if (demoNote) demoNote.hidden = false;
    }

    el.month.textContent = monthName(state.viewY, state.viewM);
    showStep(1);
    updateSummary();
    validateStay(false);
    loadAvailability();
  })();

})();
