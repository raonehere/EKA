/* ==========================================================================
   EKA Forest, monthly accounts (owner only)

   Period     : a month and year, picked in the Month box. The whole month is used.
   Sales      : from bookings. Only the totals for the month are shown. A
                confirmed booking counts on its check-in day, after discount.
   Expenses   : from the expenses data (/owner/expenses?month=YYYY-MM). Shows
                running expenses, assets, salaries and wages, and food
                and groceries. Sales in that data are ignored.
   PDFs       : the browser print window, choose "Save as PDF".
   Live mode  : reads /owner/month and /owner/expenses from the Worker.
   Preview    : cfg.apiBase is empty, so sample numbers are shown.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.EKA_BOOKING || {};
  var API = String(cfg.apiBase || '').replace(/\/+$/, '');
  var DEMO = !API;
  var KEY_STORE = 'eka-owner-key';
  var DOC_CSS = new URL('../../assets/accounts.css', location.href).href;
  var BIZ = {
    name: 'EKA Forest',
    address: 'Vattavada, Idukki, Kerala 685615',
    phone: '+91 70122 93538',
    email: 'ekaforestvattavada@gmail.com'
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = {
    gate: $('#gate'), gateForm: $('#gate-form'), gateKey: $('#gate-key'), gateError: $('#gate-error'),
    dash: $('#dash'), loading: $('#loading'), accLoading: $('#acc-loading'), accError: $('#acc-error'),
    accDemo: $('#acc-demo'), accRange: $('#acc-range'),
    month: $('#acc-month'), refresh: $('#acc-refresh'),
    kSales: $('#k-sales'), kExp: $('#k-exp'), kNet: $('#k-net'),
    salesNote: $('#sales-note'), salesCount: $('#sales-count'), salesWaiting: $('#sales-waiting'),
    salesTotal: $('#sales-total'),
    expNote: $('#exp-note'), expRunning: $('#exp-running'), expAssets: $('#exp-assets'),
    expSalaries: $('#exp-salaries'), expFood: $('#exp-food'), expTotal: $('#exp-total'),
    dlSales: $('#dl-sales'), dlExp: $('#dl-exp'), dlFull: $('#dl-full')
  };
  if (!el.dash) return;

  var state = { key: '', month: '', from: '', to: '', rows: [], sheet: null, sheetSeq: 0 };

  /* ---------------- helpers ---------------------------------------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rupees(n) {
    var v = Math.round(Number(n) || 0);
    return (v < 0 ? '−₹' : '₹') + Math.abs(v).toLocaleString('en-IN');
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function currentMonth() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function parts(key) {
    var p = key.split('-');
    return { y: +p[0], m: +p[1] };
  }
  /* Last day of a month: 28, 29, 30 or 31. new Date(y, m, 0) is the day before the 1st of the next month. */
  function daysIn(key) { var p = parts(key); return new Date(p.y, p.m, 0).getDate(); }
  function dayDate(key, d) { return key + '-' + pad(d); }
  function monthStart(key) { return key + '-01'; }
  function monthEnd(key) { return dayDate(key, daysIn(key)); }
  function monthTitle(key) {
    var p = parts(key);
    return new Date(p.y, p.m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  function dayLabel(date) {
    var p = date.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function shortDate(s) {
    if (!s) return '';
    var p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function todayLabel() { return new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function periodLabel() { return shortDate(state.from) + ' to ' + shortDate(state.to); }

  function inRange(date) { return !!date && date >= state.from && date <= state.to; }
  function rangeRows() { return state.rows.filter(function (b) { return inRange(b.checkIn); }); }
  /* Every day from the From date to the To date. */
  function rangeDays() {
    var a = +state.from.slice(8), b = +state.to.slice(8), out = [];
    for (var d = a; d <= b; d++) out.push(dayDate(state.month, d));
    return out;
  }

  /* What a booking brings in: total less discount, never below zero. */
  function netOf(b) { return Math.max(0, num(b.total) - num(b.discount)); }
  function isSale(b) { return b.status === 'Confirmed'; }

  /* ---------------- sample numbers (preview only) ------------------------ */
  function demoRows(key) {
    var samples = [
      { day: 3, nights: 2, name: 'Meera Nair', guests: 2, children: 0, tents: 1, status: 'Confirmed', total: 7400, discount: 0, discountPercent: 0, advance: 1480 },
      { day: 12, nights: 3, name: 'Arjun & family', guests: 4, children: 2, tents: 2, status: 'Confirmed', total: 16650, discount: 1000, discountPercent: 6, advance: 3330 },
      { day: 20, nights: 3, name: 'Lena Fischer', guests: 1, children: 0, tents: 1, status: 'Payment review', total: 5550, discount: 500, discountPercent: 9, advance: 1110 }
    ];
    return samples.map(function (s, i) {
      var inDate = dayDate(key, Math.min(s.day, daysIn(key)));
      var p = inDate.split('-').map(Number);
      var out = new Date(p[0], p[1] - 1, p[2] + s.nights);
      return {
        reference: 'EKA-DEMO-' + (i + 1), name: s.name, phone: '', email: '',
        checkIn: inDate, checkOut: out.getFullYear() + '-' + pad(out.getMonth() + 1) + '-' + pad(out.getDate()),
        nights: s.nights, guests: s.guests, children: s.children, tents: s.tents,
        status: s.status, total: s.total, discount: s.discount, discountPercent: s.discountPercent, advance: s.advance
      };
    });
  }

  function demoSheet() {
    return {
      month: state.month, runningExpenses: 37156, netCosts: 126594, salaries: 53900, assets: 10797, food: 35538,
      total: 172929, upToDate: true, note: ''
    };
  }

  /* ---------------- period ----------------------------------------------- */
  /* Shows the chosen month in the header line. */
  function syncPeriod() {
    el.accRange.innerHTML = 'Showing <strong>' + esc(periodLabel()) + '</strong> · ' + rangeDays().length + ' days';
  }

  /* ---------------- loading ---------------------------------------------- */
  function setLoading(on) { el.loading.hidden = !on; el.accLoading.hidden = !on; }
  function showError(msg) {
    el.accError.textContent = msg || '';
    el.accError.hidden = !msg;
  }
  function showGate(msg) {
    el.dash.hidden = true;
    el.gate.hidden = false;
    el.gateError.textContent = msg || '';
    el.gateKey.focus();
  }

  function setMonth(key) {
    state.month = key;
    state.from = monthStart(key);
    state.to = monthEnd(key);
    el.month.value = key;
  }


  function apiGet(path) {
    return fetch(API + path + '&k=' + encodeURIComponent(state.key), {
      headers: { accept: 'application/json' }
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (res.status === 404) throw new Error('key');
        if (!res.ok) throw new Error(body.error || 'read');
        return body;
      });
    });
  }

  function loadMonth() {
    var key = el.month.value || currentMonth();
    if (key !== state.month) setMonth(key);
    syncPeriod();
    showError('');
    el.accDemo.hidden = !DEMO;

    if (DEMO) {
      state.rows = demoRows(state.month);
      render();
      loadExpenses();
      return;
    }

    setLoading(true);
    apiGet('/owner/month?month=' + encodeURIComponent(state.month))
      .then(function (data) {
        state.rows = data.rows || [];
        setLoading(false);
        render();
        loadExpenses();
      })
      .catch(function (err) {
        setLoading(false);
        state.rows = [];
        if (err.message === 'key') {
          try { localStorage.removeItem(KEY_STORE); } catch (e) {}
          showGate('That key was not accepted. Check OWNER_TOKEN in the Worker.');
          return;
        }
        showError('Could not read bookings from Notion. Press Refresh to try again.');
        render();
      });
  }

  /* Reads the expenses sheet for the current period. A sequence number stops
     an answer for an old period from overwriting a newer one. */
  function loadExpenses() {
    var seq = ++state.sheetSeq;
    if (DEMO) {
      state.sheet = demoSheet();
      renderExpenses();
      return;
    }
    el.expNote.hidden = true;
    apiGet('/owner/expenses?month=' + encodeURIComponent(state.month))
      .then(function (data) {
        if (seq !== state.sheetSeq) return;
        state.sheet = data;
        renderExpenses();
      })
      .catch(function (err) {
        if (seq !== state.sheetSeq) return;
        state.sheet = null;
        if (err.message === 'key') return;
        renderExpenses(err.message === 'read' ? 'Could not read the expenses sheet.' : err.message);
      });
  }

  /* ---------------- render ----------------------------------------------- */
  function render() {
    el.gate.hidden = true;
    el.dash.hidden = false;
    renderSales();
    renderTotals();
  }

  function salesTotal() {
    return rangeRows().reduce(function (sum, b) { return sum + (isSale(b) ? netOf(b) : 0); }, 0);
  }

  function renderSales() {
    var inPeriod = rangeRows();
    var confirmed = inPeriod.filter(isSale);
    var waiting = inPeriod.filter(function (b) { return !isSale(b) && b.status !== 'Cancelled'; });
    var waitingAmount = waiting.reduce(function (s, b) { return s + netOf(b); }, 0);
    el.salesCount.textContent = String(confirmed.length);
    el.salesWaiting.textContent = rupees(waitingAmount) + (waiting.length ? ' (' + waiting.length + ')' : '');
    el.salesTotal.textContent = rupees(salesTotal());
    el.salesNote.textContent = waiting.length
      ? 'Waiting bookings are not counted until they are confirmed.'
      : '';
    el.salesNote.hidden = !el.salesNote.textContent;
  }

  function renderExpenses(errorText) {
    var s = state.sheet;
    var cells = [el.expRunning, el.expAssets, el.expSalaries, el.expFood, el.expTotal];
    if (errorText) {
      el.expNote.className = 'acc__note';
      el.expNote.textContent = errorText;
      el.expNote.hidden = false;
      cells.forEach(function (c) { c.textContent = '—'; });
      renderTotals();
      return;
    }
    if (!s) return;
    el.expRunning.textContent = rupees(s.runningExpenses);
    el.expAssets.textContent = rupees(s.assets);
    el.expSalaries.textContent = rupees(s.salaries);
    el.expFood.textContent = s.food === null ? '—' : rupees(s.food);
    el.expTotal.textContent = rupees(s.total);
    if (s.upToDate) {
      el.expNote.className = 'panel__note';
      el.expNote.textContent = 'Expenses for ' + monthTitle(state.month) + '.';
    } else {
      el.expNote.className = 'acc__note';
      el.expNote.textContent = s.note || 'These dates are not updated yet.';
    }
    el.expNote.hidden = false;
    renderTotals();
  }

  function renderTotals() {
    var sales = salesTotal();
    var exp = state.sheet ? state.sheet.total : 0;
    var running = state.sheet ? state.sheet.netCosts : 0;
    el.kSales.textContent = rupees(sales);
    el.kExp.textContent = state.sheet ? rupees(exp) : '—';
    el.kNet.textContent = state.sheet ? rupees(sales - running) : '—';
  }

  /* ---------------- printed documents ------------------------------------ */
  function printDoc(title, body) {
    var frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    var doc = frame.contentWindow.document;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) +
      '</title><link rel="stylesheet" href="' + DOC_CSS + '"></head><body><div class="doc">' + body + '</div></body></html>');
    doc.close();
    setTimeout(function () {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(function () { frame.remove(); }, 2000);
    }, 500);
  }

  function header(title, sub) {
    return '<div class="doc__head"><div><h1>' + esc(title) + '</h1><p>' + esc(BIZ.name) + '<br>' + esc(BIZ.address) +
      '<br>' + esc(BIZ.phone) + ' · ' + esc(BIZ.email) + '</p></div>' +
      '<div class="doc__meta">' + sub + '</div></div>';
  }

  function periodSub() {
    return 'Period: <strong>' + esc(periodLabel()) + '</strong><br>Prepared: ' + esc(todayLabel());
  }

  function salesDoc() {
    var inPeriod = rangeRows();
    var confirmed = inPeriod.filter(isSale);
    return header('Sales report', periodSub()) +
      '<h2>Sales</h2><table><tbody>' +
      '<tr><td>Bookings confirmed</td><td class="r">' + confirmed.length + '</td></tr>' +
      '<tr><td>Total sales after discount</td><td class="r">' + rupees(salesTotal()) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="foot">Sales count confirmed bookings only, on their check-in day, after discount.</p>';
  }

  function expenseSummaryTable(s) {
    if (!s) return '<p>The expenses could not be read for this month.</p>';
    var note = '<p class="foot">Expenses for ' + esc(monthTitle(state.month)) + '.</p>' +
      (s.upToDate ? '' : '<p class="foot"><strong>' + esc(s.note || 'These dates are not updated yet.') + '</strong></p>');
    return '<table><thead><tr><th>Group</th><th class="r">Amount</th></tr></thead><tbody>' +
      '<tr><td>Running expenses</td><td class="r">' + rupees(s.runningExpenses) + '</td></tr>' +
      '<tr><td>Salaries and wages</td><td class="r">' + rupees(s.salaries) + '</td></tr>' +
      '<tr><td>Food and groceries</td><td class="r">' + rupees(s.food || 0) + '</td></tr>' +
      '<tr><td>Assets</td><td class="r">' + rupees(s.assets) + '</td></tr>' +
      '</tbody><tfoot><tr><td>Total expenses</td><td class="r">' + rupees(s.total) + '</td></tr></tfoot></table>' + note;
  }

  function expensesDoc() {
    return header('Expenses', periodSub()) + '<h2>Expenses</h2>' + expenseSummaryTable(state.sheet);
  }

  function fullDoc() {
    var sales = salesTotal();
    var s = state.sheet;
    var exp = s ? s.total : 0;
    var running = s ? s.netCosts : 0;
    var summary = '<div class="sum"><div><span>Sales (confirmed)</span><span>' + rupees(sales) + '</span></div>' +
      '<div><span>Running expenses</span><span>− ' + rupees(s ? s.runningExpenses : 0) + '</span></div>' +
      '<div><span>Salaries and wages</span><span>− ' + rupees(s ? s.salaries : 0) + '</span></div>' +
      '<div><span>Food and groceries (shown, not deducted in net)</span><span>' + rupees(s ? s.food || 0 : 0) + '</span></div>' +
      '<div><span>Assets (shown, not deducted in net)</span><span>' + rupees(s ? s.assets : 0) + '</span></div>' +
      '<div class="grand"><span>Net for the month</span><span>' + rupees(sales - running) + '</span></div></div>';
    return header('Monthly statement', periodSub()) +
      '<h2>Summary</h2>' + summary +
      '<h2>Expenses</h2>' + expenseSummaryTable(s);
  }

  /* ---------------- events ----------------------------------------------- */
  el.month.addEventListener('change', loadMonth);
  el.refresh.addEventListener('click', loadMonth);

  el.gateForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var key = el.gateKey.value.trim();
    if (!key) { el.gateError.textContent = 'Paste your owner key first.'; return; }
    state.key = key;
    try { localStorage.setItem(KEY_STORE, key); } catch (err) {}
    loadMonth();
  });

  el.dlSales.addEventListener('click', function () { printDoc('Sales ' + periodLabel(), salesDoc()); });
  el.dlExp.addEventListener('click', function () { printDoc('Expenses ' + periodLabel(), expensesDoc()); });
  el.dlFull.addEventListener('click', function () { printDoc('Monthly statement ' + periodLabel(), fullDoc()); });

  /* ---------------- boot ------------------------------------------------- */
  (function boot() {
    el.month.value = currentMonth();
    var fromUrl = new URLSearchParams(location.search).get('k');
    if (fromUrl) {
      state.key = fromUrl;
      try { localStorage.setItem(KEY_STORE, fromUrl); } catch (e) {}
    }
    if (DEMO) { loadMonth(); return; }
    try { state.key = state.key || localStorage.getItem(KEY_STORE) || ''; } catch (e) {}
    if (state.key) loadMonth();
    else showGate('');
  })();
})();
