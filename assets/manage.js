/* ==========================================================================
   EKA Forest, manage / cancel a booking
   Opens from the private link  /book/manage/?r=<reference>&k=<token>

   Live   : talks to the Cloudflare Worker (GET /booking, POST /booking/…)
   Preview: cfg.demo === true, everything is simulated in the browser
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.EKA_BOOKING || {};
  var UNITS = cfg.units || [];
  var TOTAL = UNITS.length || 11;
  var PER_TENT = UNITS.reduce(function (m, u) { return Math.min(m, u.capacity || 2); }, 9) || 2;
  var ADVANCE = cfg.advance || 2000;
  var API = (cfg.apiBase || '').replace(/\/+$/, '');
  var DEMO = !!cfg.demo || !API;
  var HORIZON = cfg.horizonMonths || 12;
  var MAX_NIGHTS = cfg.maxNights || 10;
  var WA = String(cfg.whatsapp || '').replace(/\D/g, '');
  var DEMO_KEY = 'eka-demo-booking';

  /* ---------------- date helpers ----------------------------------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function todayISO() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
    } catch (e) { return iso(new Date()); }
  }
  var TODAY = todayISO();
  function fmtLong(s) {
    return parse(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function monthName(y, m) {
    return new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function rupees(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }

  /* ---------------- link params ------------------------------------------ */
  var params = new URLSearchParams(window.location.search);
  var REF = (params.get('r') || '').trim().toUpperCase();
  var KEY = (params.get('k') || '').trim();

  /* ---------------- elements --------------------------------------------- */
  var $ = function (s) { return document.querySelector(s); };
  var el = {
    loading: $('#m-loading'),
    error: $('#m-error'),
    errorText: $('#m-error-text'),
    body: $('#m-body'),
    tag: $('#m-status'),
    ref: $('#m-ref'),
    in: $('#m-in'),
    out: $('#m-out'),
    guests: $('#m-guests'),
    tents: $('#m-tents'),
    advance: $('#m-advance'),
    policy: $('#m-policy'),
    flash: $('#m-flash'),
    actions: $('#m-actions'),
    moveBtn: $('#m-open-move'),
    cancelBtn: $('#m-open-cancel'),
    closed: $('#m-closed'),
    move: $('#m-move'),
    cancel: $('#m-cancel'),
    calMonth: $('#m-month'),
    calGrid: $('#m-grid'),
    calStatus: $('#m-cal-status'),
    calHint: $('#m-hint'),
    prev: $('#m-prev'),
    next: $('#m-next'),
    summary: $('#m-summary'),
    moveConfirm: $('#m-move-confirm'),
    moveNone: $('#m-move-none'),
    cancelConfirm: $('#m-cancel-confirm'),
    cancelNone: $('#m-cancel-none'),
    cancelError: $('#m-cancel-error'),
    done: $('#m-done'),
    doneRef: $('#m-done-ref')
  };

  if (!el.body) return;

  /* ---------------- state ------------------------------------------------ */
  var now = new Date();
  var state = {
    booking: null,
    nights: {},
    loaded: false,
    busy: false,
    viewY: now.getFullYear(),
    viewM: now.getMonth(),
    focusDate: TODAY,
    start: null,
    end: null,
    hover: null,
    canChange: false,
    canCancel: false,
    cutoffHours: cfg.changeCutoffHours || 48,
    closesAt: null,
    units: TOTAL
  };

  /* ---------------- whatsapp links --------------------------------------- */
  (function wireWhatsApp() {
    if (!WA) return;
    var msg = encodeURIComponent('Hi EKA Forest, I need help with my booking' + (REF ? ' ' + REF : '') + '.');
    Array.prototype.forEach.call(document.querySelectorAll('[data-wa-link]'), function (a) {
      a.href = 'https://wa.me/' + WA + '?text=' + msg;
    });
  })();

  /* ---------------- preview data ----------------------------------------- */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function demoNights(from, to) {
    var out = {}, d = from, guard = 0;
    var busy = {};
    [14, 15, 38, 39, 40, 61, 62].forEach(function (n) { busy[addDays(TODAY, n)] = 1; });
    while (d < to && guard++ < 800) {
      var dow = parse(d).getDay();
      var n = hash(d) % 10;
      var free = TOTAL;
      if (busy[d]) free = 0;
      else {
        if (dow === 5 || dow === 6) free -= 3;
        else if (dow === 0) free -= 1;
        if (n < 2) free -= 2;
        else if (n === 9) free -= 1;
      }
      out[d] = Math.max(0, Math.min(TOTAL, free));
      d = addDays(d, 1);
    }
    return out;
  }
  function demoBooking() {
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(DEMO_KEY) || 'null'); } catch (e) {}
    if (saved && saved.reference) return saved;
    return {
      reference: REF || 'PREVIEW-0001',
      name: 'Preview guest',
      checkIn: addDays(TODAY, 10),
      checkOut: addDays(TODAY, 12),
      nights: 2,
      guests: 2,
      childrenUnder10: 0,
      tents: 1,
      status: 'Confirmed',
      advance: ADVANCE
    };
  }
  function saveDemo(booking) {
    try { sessionStorage.setItem(DEMO_KEY, JSON.stringify(booking)); } catch (e) {}
  }

  /* ---------------- loading ---------------------------------------------- */
  function windowRange() {
    var from = iso(new Date(state.viewY, state.viewM, 1));
    if (from < TODAY) from = TODAY;
    var end = new Date(state.viewY, state.viewM + 1, 1);
    end.setMonth(end.getMonth() + HORIZON);
    return { from: from, to: iso(end) };
  }

  function showError(msg) {
    if (el.loading) el.loading.hidden = true;
    if (el.body) el.body.hidden = true;
    if (el.done) el.done.hidden = true;
    el.error.hidden = false;
    if (msg) el.errorText.textContent = msg;
  }

  function load() {
    if (!REF || !KEY) {
      showError('This link is missing its booking reference or key. Open the link exactly as it appears in your confirmation message.');
      return;
    }

    if (DEMO) {
      state.booking = demoBooking();
      var range = windowRange();
      state.nights = demoNights(range.from, range.to);
      state.loaded = true;
      state.canChange = true;
      state.canCancel = true;
      state.closesAt = new Date(Date.parse(state.booking.checkIn + 'T00:00:00+05:30') - state.cutoffHours * 3600000).toISOString();
      state.units = TOTAL;
      ready();
      return;
    }

    var r = windowRange();
    fetch(API + '/booking?r=' + encodeURIComponent(REF) + '&k=' + encodeURIComponent(KEY) +
      '&from=' + r.from + '&to=' + r.to, { headers: { accept: 'application/json' } })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { ok: res.ok, status: res.status, body: body };
        });
      })
      .then(function (out) {
        if (!out.ok) {
          var msg = out.body.error || 'We could not open this booking.';
          if (out.status === 403 || out.status === 404) {
            msg = 'This link is not valid for that booking. Open the exact link from your confirmation message.';
          }
          showError(msg);
          return;
        }
        state.booking = out.body.booking;
        state.nights = out.body.nights || {};
        state.units = out.body.units || TOTAL;
        state.loaded = true;
        state.canChange = !!out.body.canChange;
        state.canCancel = !!out.body.canCancel;
        state.cutoffHours = out.body.cutoffHours != null ? out.body.cutoffHours : state.cutoffHours;
        state.closesAt = out.body.changeClosesAt || null;
        ready();
      })
      .catch(function () {
        showError('We could not reach the booking service just now. Check your connection and try again, or message us on WhatsApp.');
      });
  }

  function ready() {
    el.loading.hidden = true;
    el.error.hidden = true;

    if (state.booking.status === 'Cancelled') {
      el.body.hidden = true;
      el.doneRef.textContent = state.booking.reference;
      el.done.hidden = false;
      return;
    }

    el.body.hidden = false;
    paintCard();
    render();
    updateSummary();
  }

  function paintCard() {
    var b = state.booking;
    var labels = {
      'Confirmed': 'Confirmed',
      'Pending payment': 'Awaiting payment',
      'Payment review': 'Checking payment',
      'Cancelled': 'Cancelled'
    };
    el.tag.textContent = labels[b.status] || b.status;
    el.tag.classList.toggle('is-cancelled', b.status === 'Cancelled');
    el.tag.classList.toggle('is-pending', b.status !== 'Confirmed' && b.status !== 'Cancelled');

    el.ref.textContent = b.reference;
    el.in.textContent = fmtLong(b.checkIn);
    el.out.textContent = fmtLong(b.checkOut);
    el.guests.textContent = plural(b.guests || 0, 'guest') +
      (b.childrenUnder10 ? ' · ' + b.childrenUnder10 + ' children' : '');
    el.tents.textContent = plural(b.tents || 1, 'tent');
    el.advance.textContent = rupees(b.advance || ADVANCE);

    var closes = state.closesAt ? new Date(state.closesAt) : null;
    var closesText = closes ? closes.toLocaleString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'
    }) : '';

    var bits = ['Your ' + rupees(ADVANCE) + ' advance comes off the final bill.'];
    if (state.canChange) {
      bits.push('You can move these dates as often as you like until ' + closesText +
        ' (' + state.cutoffHours + ' hours before check-in). The advance carries over, subject to tents being free.');
    } else if (b.status === 'Confirmed') {
      bits.push('Changes closed on ' + closesText + '. Message us on WhatsApp if something has come up.');
    }
    bits.push('Cancelling releases the nights and the advance is not refunded.');
    el.policy.innerHTML = bits.join(' ');

    var open = b.status === 'Confirmed';
    el.actions.hidden = !open;
    el.closed.hidden = open || b.status !== 'Confirmed';
    if (!open && b.status !== 'Confirmed') {
      if (b.status === 'Payment review') {
        el.closed.textContent = 'We are checking your payment screenshot. You will get a WhatsApp confirmation once it clears, usually within a few hours.';
      } else if (b.status === 'Pending payment') {
        el.closed.textContent = 'No payment has reached us yet. Pay the ₹' + Number(b.advance || ADVANCE).toLocaleString('en-IN') +
          ' advance by UPI and upload the screenshot from your booking page, or message us on WhatsApp.';
      } else {
        el.closed.textContent = 'This booking is ' + b.status.toLowerCase() + '. Message us on WhatsApp if you need anything.';
      }
    }

    el.moveBtn.disabled = !state.canChange;
    el.cancelBtn.disabled = !state.canCancel;
    if (!state.canChange) {
      el.moveBtn.querySelector('.manage__action-note').textContent =
        'Changes closed ' + state.cutoffHours + ' hours before check-in.';
    }
    if (!state.canCancel) {
      el.cancelBtn.querySelector('.manage__action-note').textContent = 'This booking cannot be cancelled online.';
    }
  }

  /* ---------------- availability helpers --------------------------------- */
  function freeOn(date) {
    if (state.nights[date] === undefined) return null;
    return state.nights[date];
  }
  function nightsNeeded() { return Math.max(1, state.booking.tents || 1); }
  function nightsOf(a, b) {
    var out = [], d = a;
    while (d < b) { out.push(d); d = addDays(d, 1); }
    return out;
  }
  function rangeStatus(a, b) {
    var n = diffDays(a, b);
    if (n < 1) return { ok: false, reason: 'Pick at least one night.' };
    if (n > MAX_NIGHTS) return { ok: false, reason: 'Stays are limited to ' + MAX_NIGHTS + ' nights. Message us for longer.' };
    var arr = nightsOf(a, b), minFree = 99;
    for (var i = 0; i < arr.length; i++) {
      var f = freeOn(arr[i]);
      if (f === null) return { ok: false, reason: 'Those dates are outside the booking window.' };
      if (f < nightsNeeded()) return { ok: false, reason: 'One of those nights is already full.' };
      if (f < minFree) minFree = f;
    }
    return { ok: true, minFree: minFree };
  }

  /* ---------------- calendar --------------------------------------------- */
  function render() {
    if (DEMO) {
      var r = windowRange();
      var more = demoNights(r.from, r.to);
      for (var key in more) {
        if (state.nights[key] === undefined) state.nights[key] = more[key];
      }
    }
    el.calMonth.textContent = monthName(state.viewY, state.viewM);

    var first = new Date(state.viewY, state.viewM, 1);
    var offset = (first.getDay() + 6) % 7;
    var days = new Date(state.viewY, state.viewM + 1, 0).getDate();
    var cells = [];

    for (var i = 0; i < offset; i++) {
      cells.push('<span class="day day--pad" aria-hidden="true"></span>');
    }

    for (var d = 1; d <= days; d++) {
      var date = iso(new Date(state.viewY, state.viewM, d));
      var free = freeOn(date);
      var past = date < TODAY;
      var full = free !== null && free < nightsNeeded();
      var unknown = free === null;
      var cls = 'day';
      var label = parse(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      var stateText;

      if (past) { cls += ' day--past'; stateText = 'past date'; }
      else if (unknown) { cls += ' day--unknown'; stateText = 'availability unknown'; }
      else if (full) { cls += ' day--full'; stateText = 'fully booked'; }
      else {
        cls += free <= 2 ? ' day--few' : ' day--open';
        stateText = free + (free === 1 ? ' tent free' : ' tents free');
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

    el.calGrid.innerHTML = cells.join('');
    paintSelection();
    syncNav();
  }

  function syncNav() {
    var cur = new Date();
    el.prev.disabled = (state.viewY < cur.getFullYear()) ||
      (state.viewY === cur.getFullYear() && state.viewM <= cur.getMonth());
    var max = new Date(); max.setMonth(max.getMonth() + HORIZON);
    el.next.disabled = (state.viewY > max.getFullYear()) ||
      (state.viewY === max.getFullYear() && state.viewM >= max.getMonth() + 1);
  }

  function paintSelection() {
    var cells = el.calGrid.querySelectorAll('.day[data-date]');
    var a = state.start;
    var b = state.end || (state.start && state.hover && state.hover > state.start ? state.hover : null);
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
    el.calHint.textContent = text;
    el.calHint.style.color = tone === 'bad' ? '#8c2f1f' : '';
  }

  function pick(date) {
    var free = freeOn(date);
    if (free === null || date < TODAY) return;
    var isFull = free < nightsNeeded();

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
        state.start = isFull ? state.start : date;
        state.end = null;
        hint(st.reason + ' Try a new check-in.', 'bad');
      }
    }
    state.focusDate = date;
    render();
    updateSummary();
  }

  function updateSummary() {
    if (!state.start) {
      el.summary.textContent = 'No new dates chosen yet.';
      el.moveConfirm.disabled = true;
      return;
    }
    if (!state.end) {
      el.summary.innerHTML = 'Check-in <strong>' + fmtLong(state.start) + '</strong> · now choose a check-out date.';
      el.moveConfirm.disabled = true;
      return;
    }
    var n = diffDays(state.start, state.end);
    var st = rangeStatus(state.start, state.end);
    el.summary.innerHTML = 'New stay: <strong>' + fmtLong(state.start) + ' → ' + fmtLong(state.end) +
      '</strong> · ' + plural(n, 'night') + ' · ' + plural(nightsNeeded(), 'tent') + '. ' +
      (st.ok ? 'Your advance carries over.' : st.reason);
    el.moveConfirm.disabled = !st.ok;
  }

  /* ---------------- actions ---------------------------------------------- */
  function flash(msg, bad) {
    el.flash.hidden = false;
    el.flash.textContent = msg;
    el.flash.classList.toggle('is-bad', !!bad);
    el.flash.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function busy(on, label) {
    state.busy = on;
    el.moveConfirm.disabled = on || !state.end;
    el.cancelConfirm.disabled = on;
    if (label) el.moveConfirm.textContent = label;
  }

  function openPanel(which) {
    var moveOpen = which === 'move' && el.move.hidden;
    var cancelOpen = which === 'cancel' && el.cancel.hidden;

    el.move.hidden = !moveOpen;
    el.cancel.hidden = !cancelOpen;
    el.moveBtn.setAttribute('aria-expanded', moveOpen ? 'true' : 'false');
    el.cancelBtn.setAttribute('aria-expanded', cancelOpen ? 'true' : 'false');
    el.flash.hidden = true;

    if (moveOpen) {
      if (state.loaded) render();
      el.move.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var target = el.calGrid.querySelector('.day[data-date="' + state.focusDate + '"]') ||
        el.calGrid.querySelector('.day[data-date]:not([disabled])');
      if (target) target.focus({ preventScroll: true });
    }
    if (cancelOpen) {
      el.cancel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.cancelNone.focus({ preventScroll: true });
    }
  }

  function reschedule() {
    if (state.busy || !state.start || !state.end) return;
    var st = rangeStatus(state.start, state.end);
    if (!st.ok) { hint(st.reason, 'bad'); return; }

    var checkIn = state.start, checkOut = state.end;

    if (DEMO) {
      busy(true, 'Moving…');
      setTimeout(function () {
        state.booking.checkIn = checkIn;
        state.booking.checkOut = checkOut;
        state.booking.nights = diffDays(checkIn, checkOut);
        saveDemo(state.booking);
        busy(false, 'Confirm new dates');
        afterMove(checkIn, checkOut);
      }, 700);
      return;
    }

    busy(true, 'Moving…');
    fetch(API + '/booking/reschedule', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ reference: state.booking.reference, token: KEY, checkIn: checkIn, checkOut: checkOut })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        return { ok: res.ok, body: body };
      });
    }).then(function (out) {
      busy(false, 'Confirm new dates');
      if (!out.ok) { flash(out.body.error || 'We could not move the booking. Please message us on WhatsApp.', true); return; }
      afterMove(out.body.checkIn || checkIn, out.body.checkOut || checkOut);
    }).catch(function () {
      busy(false, 'Confirm new dates');
      flash('We could not reach the booking service. Please try again, or message us on WhatsApp.', true);
    });
  }

  function afterMove(checkIn, checkOut) {
    state.booking.checkIn = checkIn;
    state.booking.checkOut = checkOut;
    state.booking.nights = diffDays(checkIn, checkOut);
    state.closesAt = new Date(Date.parse(checkIn + 'T00:00:00+05:30') - state.cutoffHours * 3600000).toISOString();
    state.canChange = Date.now() < Date.parse(state.closesAt);
    state.start = null;
    state.end = null;
    state.hover = null;
    state.focusDate = checkIn;
    el.move.hidden = true;
    el.moveBtn.setAttribute('aria-expanded', 'false');
    paintCard();
    updateSummary();
    flash('Done, your stay is now ' + fmtLong(checkIn) + ' → ' + fmtLong(checkOut) +
      '. We have updated your booking, and your advance carried over.');
    if (!DEMO) reloadNights();
  }

  function reloadNights() {
    var r = windowRange();
    fetch(API + '/booking?r=' + encodeURIComponent(REF) + '&k=' + encodeURIComponent(KEY) +
      '&from=' + r.from + '&to=' + r.to, { headers: { accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return;
        state.nights = data.nights || {};
        if (data.changeClosesAt) state.closesAt = data.changeClosesAt;
        if (data.booking) state.booking = data.booking;
        if (data.canChange !== undefined) state.canChange = !!data.canChange;
        if (data.canCancel !== undefined) state.canCancel = !!data.canCancel;
        paintCard();
        render();
        updateSummary();
      })
      .catch(function () {});
  }

  function cancel() {
    if (state.busy) return;
    el.cancelError.textContent = '';

    if (DEMO) {
      busy(true);
      setTimeout(function () {
        state.booking.status = 'Cancelled';
        saveDemo(state.booking);
        busy(false);
        showDone();
      }, 600);
      return;
    }

    busy(true);
    fetch(API + '/booking/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ reference: state.booking.reference, token: KEY })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        return { ok: res.ok, body: body };
      });
    }).then(function (out) {
      busy(false);
      if (!out.ok) { el.cancelError.textContent = out.body.error || 'We could not cancel the booking.'; return; }
      state.booking.status = 'Cancelled';
      showDone();
    }).catch(function () {
      busy(false);
      el.cancelError.textContent = 'We could not reach the booking service. Please try again, or message us on WhatsApp.';
    });
  }

  function showDone() {
    el.body.hidden = true;
    el.doneRef.textContent = state.booking.reference;
    el.done.hidden = false;
    el.done.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var focusTarget = el.done.querySelector('a, button');
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }

  /* ---------------- events ----------------------------------------------- */
  el.moveBtn.addEventListener('click', function () { openPanel('move'); });
  el.cancelBtn.addEventListener('click', function () { openPanel('cancel'); });
  el.moveNone.addEventListener('click', function () {
    el.move.hidden = true;
    el.moveBtn.setAttribute('aria-expanded', 'false');
    el.moveBtn.focus({ preventScroll: true });
  });
  el.cancelNone.addEventListener('click', function () {
    el.cancel.hidden = true;
    el.cancelBtn.setAttribute('aria-expanded', 'false');
    el.cancelBtn.focus({ preventScroll: true });
  });
  el.moveConfirm.addEventListener('click', reschedule);
  el.cancelConfirm.addEventListener('click', cancel);

  el.calGrid.addEventListener('click', function (e) {
    var b = e.target.closest('.day[data-date]');
    if (!b || b.disabled) return;
    pick(b.dataset.date);
    var again = el.calGrid.querySelector('.day[data-date="' + b.dataset.date + '"]');
    if (again) { again.tabIndex = 0; again.focus({ preventScroll: true }); }
  });

  el.calGrid.addEventListener('mouseover', function (e) {
    var b = e.target.closest('.day[data-date]');
    if (!b || b.disabled || !state.start || state.end) return;
    if (state.hover === b.dataset.date) return;
    state.hover = b.dataset.date;
    paintSelection();
  });
  el.calGrid.addEventListener('mouseleave', function () {
    if (state.hover) { state.hover = null; paintSelection(); }
  });

  el.calGrid.addEventListener('keydown', function (e) {
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
    var target = el.calGrid.querySelector('.day[data-date="' + next + '"]');
    if (target) {
      Array.prototype.forEach.call(el.calGrid.querySelectorAll('.day'), function (c) { c.tabIndex = -1; });
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

  load();
})();
