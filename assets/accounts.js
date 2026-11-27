/* ==========================================================================
   EKA Forest, monthly accounts (owner only)

   Period     : a month, plus a From and To date inside it. By default the
                whole month. Everything below follows the period.
   Sales      : filled from bookings. Every day in the period is listed. A
                confirmed booking counts on its check-in day, after discount.
   Expenses   : typed in by the owner for dates in the period, saved in this
                browser per month. Entries outside the period are not counted.
   Other      : miscellaneous items, typed in the same way.
   PDFs       : the browser print window, choose "Save as PDF".
   Live mode  : reads /owner/month from the Worker with the owner key.
   Preview    : cfg.apiBase is empty, so sample bookings are shown.
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
  var EXP_CATS = ['Salaries', 'Food & kitchen', 'Electricity & water', 'Maintenance & repairs',
    'Supplies & cleaning', 'Transport', 'Marketing', 'Other'];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = {
    gate: $('#gate'), gateForm: $('#gate-form'), gateKey: $('#gate-key'), gateError: $('#gate-error'),
    dash: $('#dash'), loading: $('#loading'), accLoading: $('#acc-loading'), accError: $('#acc-error'),
    accDemo: $('#acc-demo'), accRange: $('#acc-range'),
    month: $('#acc-month'), from: $('#acc-from'), to: $('#acc-to'), refresh: $('#acc-refresh'),
    kSales: $('#k-sales'), kExp: $('#k-exp'), kMisc: $('#k-misc'), kNet: $('#k-net'),
    salesNote: $('#sales-note'), salesDays: $('#sales-days'), salesTotal: $('#sales-total'),
    bookings: $('#bookings'),
    expAdd: $('#exp-add'), expRows: $('#exp-rows'), expTotal: $('#exp-total'),
    miscAdd: $('#misc-add'), miscRows: $('#misc-rows'), miscTotal: $('#misc-total'),
    dlSales: $('#dl-sales'), dlExp: $('#dl-exp'), dlMisc: $('#dl-misc'), dlFull: $('#dl-full')
  };
  if (!el.dash) return;

  var state = { key: '', month: '', from: '', to: '', rows: [], exp: [], misc: [] };

  /* ---------------- helpers ---------------------------------------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rupees(n) { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function currentMonth() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
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
  function rangeList(list) { return list.filter(function (x) { return inRange(x.date); }); }
  /* Every day from the From date to the To date. */
  function rangeDays() {
    var a = +state.from.slice(8), b = +state.to.slice(8), out = [];
    for (var d = a; d <= b; d++) out.push(dayDate(state.month, d));
    return out;
  }

  /* What a booking brings in: total less discount, never below zero. */
  function netOf(b) { return Math.max(0, num(b.total) - num(b.discount)); }
  function isSale(b) { return b.status === 'Confirmed'; }

  function storeKey(kind) { return 'eka-acc-' + kind + '-' + state.month; }
  function readList(kind) {
    try { return JSON.parse(localStorage.getItem(storeKey(kind)) || '[]'); } catch (e) { return []; }
  }
  function saveList(kind, list) {
    try { localStorage.setItem(storeKey(kind), JSON.stringify(list)); } catch (e) {}
  }

  /* ---------------- sample bookings (preview only) ----------------------- */
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

  /* ---------------- period ----------------------------------------------- */
  function clampToMonth(d) {
    var first = monthStart(state.month), last = monthEnd(state.month);
    if (!d) return first;
    if (d < first) return first;
    if (d > last) return last;
    return d;
  }

  /* Puts the From/To inputs in step with the state (month limits, values). */
  function syncPeriod() {
    var first = monthStart(state.month), last = monthEnd(state.month);
    el.from.min = el.to.min = first;
    el.from.max = el.to.max = last;
    el.from.value = state.from;
    el.to.value = state.to;
    el.accRange.innerHTML = 'Showing <strong>' + esc(periodLabel()) + '</strong> · ' + rangeDays().length + ' days';
  }

  /* Moving From past To moves To with it, and the other way round. */
  function onFromChange() {
    state.from = clampToMonth(el.from.value);
    if (state.to < state.from) state.to = state.from;
    applyPeriod();
  }
  function onToChange() {
    state.to = clampToMonth(el.to.value);
    if (state.from > state.to) state.from = state.to;
    applyPeriod();
  }
  function applyPeriod() {
    syncPeriod();
    render();
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
    state.exp = readList('exp');
    state.misc = readList('misc');
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
      return;
    }

    setLoading(true);
    fetch(API + '/owner/month?month=' + encodeURIComponent(state.month) + '&k=' + encodeURIComponent(state.key), {
      headers: { accept: 'application/json' }
    })
      .then(function (res) {
        if (res.status === 404) throw new Error('key');
        if (!res.ok) throw new Error('read');
        return res.json();
      })
      .then(function (data) {
        state.rows = data.rows || [];
        setLoading(false);
        render();
      })
      .catch(function (err) {
        setLoading(false);
        state.rows = [];
        if (err.message === 'key') {
          try { localStorage.removeItem(KEY_STORE); } catch (e) {}
          showGate('That key was not accepted. Check OWNER_TOKEN in the Worker.');
          return;
        }
        showError('Could not read bookings from Notion. Press Refresh to try again. Your expenses are still here.');
        render();
      });
  }

  /* ---------------- render ----------------------------------------------- */
  function render() {
    el.gate.hidden = true;
    el.dash.hidden = false;
    renderSales();
    renderList('exp');
    renderList('misc');
    renderTotals();
  }

  function salesByDay() {
    var map = {};
    rangeRows().forEach(function (b) {
      if (!isSale(b)) return;
      if (!map[b.checkIn]) map[b.checkIn] = { count: 0, amount: 0 };
      map[b.checkIn].count += 1;
      map[b.checkIn].amount += netOf(b);
    });
    return map;
  }

  function salesTotal() {
    return rangeRows().reduce(function (sum, b) { return sum + (isSale(b) ? netOf(b) : 0); }, 0);
  }

  function renderSales() {
    var map = salesByDay();
    var days = rangeDays();
    var html = '';
    days.forEach(function (date) {
      var s = map[date];
      html += '<tr><td>' + esc(dayLabel(date)) + '</td>' +
        '<td>' + (s ? s.count + (s.count === 1 ? ' booking' : ' bookings') : '<span class="acc__empty">none</span>') + '</td>' +
        '<td class="acc__num">' + (s ? rupees(s.amount) : '₹0') + '</td></tr>';
    });
    el.salesDays.innerHTML = html;
    el.salesTotal.textContent = rupees(salesTotal());

    var inPeriod = rangeRows();
    var waiting = inPeriod.filter(function (b) { return !isSale(b) && b.status !== 'Cancelled'; });
    var waitingAmount = waiting.reduce(function (s, b) { return s + netOf(b); }, 0);
    el.salesNote.textContent = days.length + ' days, ' + periodLabel() + '. ' +
      (waiting.length
        ? waiting.length + ' booking' + (waiting.length === 1 ? ' is' : 's are') + ' not confirmed yet (' + rupees(waitingAmount) + '), so not counted.'
        : 'Only confirmed bookings are counted.');

    if (!inPeriod.length) {
      el.bookings.innerHTML = '<tr><td colspan="7" class="acc__empty">No bookings check in between ' + esc(periodLabel()) + '.</td></tr>';
      return;
    }
    el.bookings.innerHTML = inPeriod.map(function (b) {
      return '<tr>' +
        '<td>' + esc(shortDate(b.checkIn)) + '<br><span class="acc__empty">' + esc(b.nights) + ' nights</span></td>' +
        '<td>' + esc(b.name) + '<br><span class="acc__empty">' + esc(b.guests) + ' guests' + (b.children ? ' + ' + esc(b.children) + ' children' : '') + '</span></td>' +
        '<td>' + esc(b.status) + '</td>' +
        '<td class="acc__num">' + rupees(b.total) + '</td>' +
        '<td class="acc__num">' + (b.discount ? rupees(b.discount) + (b.discountPercent ? ' <span class="acc__empty">(' + b.discountPercent + '%)</span>' : '') : '—') + '</td>' +
        '<td class="acc__num">' + (isSale(b) ? rupees(netOf(b)) : '<span class="acc__empty">not yet</span>') + '</td>' +
        '<td><button class="chipbtn" type="button" data-invoice="' + state.rows.indexOf(b) + '">Invoice PDF</button></td>' +
        '</tr>';
    }).join('');
  }

  function rowHtml(kind, item, i) {
    var out = inRange(item.date) ? '' : ' class="acc__out"';
    var cat = kind === 'exp'
      ? '<td><select data-kind="' + kind + '" data-i="' + i + '" data-f="category">' +
        EXP_CATS.map(function (c) { return '<option' + (c === item.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
        '</select></td>'
      : '';
    return '<tr' + out + '>' +
      '<td><input type="date" min="' + state.from + '" max="' + state.to + '" value="' + esc(item.date) + '" data-kind="' + kind + '" data-i="' + i + '" data-f="date"></td>' +
      '<td><input type="text" value="' + esc(item.desc) + '" placeholder="' + (kind === 'exp' ? 'e.g. Staff salary, Kitchen gas' : 'e.g. Bank charges, Repair') + '" data-kind="' + kind + '" data-i="' + i + '" data-f="desc"></td>' +
      cat +
      '<td class="acc__amt"><input type="number" min="0" step="1" inputmode="numeric" value="' + (item.amount || '') + '" data-kind="' + kind + '" data-i="' + i + '" data-f="amount"></td>' +
      '<td><button class="acc__del" type="button" data-remove="' + kind + '" data-i="' + i + '">Remove</button></td>' +
      '</tr>';
  }

  function renderList(kind) {
    var list = kind === 'exp' ? state.exp : state.misc;
    var body = kind === 'exp' ? el.expRows : el.miscRows;
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="' + (kind === 'exp' ? 5 : 4) + '" class="acc__empty">Nothing yet. Press “' +
        (kind === 'exp' ? 'Add expense' : 'Add item') + '”.</td></tr>';
      return;
    }
    body.innerHTML = list.map(function (item, i) { return rowHtml(kind, item, i); }).join('');
  }

  function listTotal(list) { return list.reduce(function (s, x) { return s + num(x.amount); }, 0); }

  function renderTotals() {
    var sales = salesTotal();
    var exp = listTotal(rangeList(state.exp));
    var misc = listTotal(rangeList(state.misc));
    el.kSales.textContent = rupees(sales);
    el.kExp.textContent = rupees(exp);
    el.kMisc.textContent = rupees(misc);
    el.kNet.textContent = rupees(sales - exp - misc);
    el.expTotal.textContent = rupees(exp);
    el.miscTotal.textContent = rupees(misc);
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
    var map = salesByDay();
    var rows = rangeDays().map(function (date) {
      var s = map[date];
      return '<tr><td>' + esc(dayLabel(date)) + '</td><td>' + (s ? s.count : 0) + '</td><td class="r">' + rupees(s ? s.amount : 0) + '</td></tr>';
    }).join('');
    var bookings = rangeRows().map(function (b) {
      return '<tr><td>' + esc(shortDate(b.checkIn)) + '</td><td>' + esc(b.reference) + '</td><td>' + esc(b.name) +
        '</td><td>' + esc(b.status) + '</td><td class="r">' + rupees(b.total) + '</td><td class="r">' + rupees(b.discount) +
        '</td><td class="r">' + (isSale(b) ? rupees(netOf(b)) : '—') + '</td></tr>';
    }).join('') || '<tr><td colspan="7">No bookings check in this period.</td></tr>';
    return header('Sales report', periodSub()) +
      '<h2>Sales by day</h2><table><thead><tr><th>Day</th><th>Bookings</th><th class="r">Sales</th></tr></thead><tbody>' + rows +
      '</tbody><tfoot><tr><td>Total</td><td></td><td class="r">' + rupees(salesTotal()) + '</td></tr></tfoot></table>' +
      '<h2>Bookings checking in</h2><table><thead><tr><th>Check-in</th><th>Reference</th><th>Guest</th><th>Status</th>' +
      '<th class="r">Total</th><th class="r">Discount</th><th class="r">Sales</th></tr></thead><tbody>' + bookings + '</tbody></table>' +
      '<p class="foot">Sales count confirmed bookings only, on their check-in day, after discount.</p>';
  }

  function listTable(list, withCategory) {
    if (!list.length) return '<p>Nothing recorded for this period.</p>';
    var head = '<tr><th>Date</th><th>Description</th>' + (withCategory ? '<th>Category</th>' : '') + '<th class="r">Amount</th></tr>';
    var rows = list.map(function (x) {
      return '<tr><td>' + esc(x.date ? shortDate(x.date) : '') + '</td><td>' + esc(x.desc) + '</td>' +
        (withCategory ? '<td>' + esc(x.category) + '</td>' : '') + '<td class="r">' + rupees(x.amount) + '</td></tr>';
    }).join('');
    return '<table><thead>' + head + '</thead><tbody>' + rows + '</tbody><tfoot><tr><td colspan="' +
      (withCategory ? 3 : 2) + '">Total</td><td class="r">' + rupees(listTotal(list)) + '</td></tr></tfoot></table>';
  }

  function expensesDoc() {
    return header('Expenses', periodSub()) +
      '<h2>Expenses</h2>' + listTable(rangeList(state.exp), true) +
      '<h2>Other &amp; miscellaneous</h2>' + listTable(rangeList(state.misc), false);
  }

  function fullDoc() {
    var sales = salesTotal(), exp = listTotal(rangeList(state.exp)), misc = listTotal(rangeList(state.misc));
    var summary = '<div class="sum"><div><span>Sales (confirmed)</span><span>' + rupees(sales) + '</span></div>' +
      '<div><span>Expenses</span><span>− ' + rupees(exp) + '</span></div>' +
      '<div><span>Other &amp; miscellaneous</span><span>− ' + rupees(misc) + '</span></div>' +
      '<div class="grand"><span>Net for the period</span><span>' + rupees(sales - exp - misc) + '</span></div></div>';
    var map = salesByDay();
    var salesRows = Object.keys(map).sort().map(function (date) {
      return '<tr><td>' + esc(shortDate(date)) + '</td><td>' + map[date].count + '</td><td class="r">' + rupees(map[date].amount) + '</td></tr>';
    }).join('') || '<tr><td colspan="3">No confirmed sales in this period.</td></tr>';
    return header('Monthly statement', periodSub()) +
      '<h2>Summary</h2>' + summary +
      '<h2>Sales by check-in day</h2><table><thead><tr><th>Date</th><th>Bookings</th><th class="r">Sales</th></tr></thead><tbody>' + salesRows + '</tbody></table>' +
      '<h2>Expenses</h2>' + listTable(rangeList(state.exp), true) +
      '<h2>Other &amp; miscellaneous</h2>' + listTable(rangeList(state.misc), false);
  }

  function invoiceDoc(b) {
    var net = netOf(b);
    var advance = num(b.advance);
    var balance = Math.max(0, net - advance);
    var guestLine = b.guests + (b.guests === 1 ? ' adult' : ' adults') + (b.children ? ', ' + b.children + ' children aged 5 to 10' : '');
    return header('Invoice', 'Invoice no: <strong>' + esc(b.reference) + '</strong><br>Date issued: ' + esc(todayLabel())) +
      '<h2>Bill to</h2><p>' + esc(b.name) + (b.phone ? '<br>' + esc(b.phone) : '') + (b.email ? '<br>' + esc(b.email) : '') + '</p>' +
      '<h2>Stay</h2><p>' + esc(shortDate(b.checkIn)) + ' to ' + esc(shortDate(b.checkOut)) + ' · ' + esc(b.nights) +
      ' nights · ' + esc(guestLine) + ' · ' + esc(b.tents) + (b.tents === 1 ? ' A-frame tent' : ' A-frame tents') + '</p>' +
      '<h2>Charges</h2><table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>' +
      '<tr><td>Stay, meals and lunches as booked</td><td class="r">' + rupees(b.total) + '</td></tr>' +
      (b.discount ? '<tr><td>Discount' + (b.discountPercent ? ' (' + b.discountPercent + '%)' : '') + '</td><td class="r">− ' + rupees(b.discount) + '</td></tr>' : '') +
      '</tbody></table>' +
      '<div class="sum"><div><span>Total after discount</span><span>' + rupees(net) + '</span></div>' +
      '<div><span>Advance (paid by UPI)</span><span>− ' + rupees(advance) + '</span></div>' +
      '<div class="grand"><span>Balance due at EKA Forest</span><span>' + rupees(balance) + '</span></div></div>' +
      '<p class="foot">Pay the balance at EKA Forest on arrival. The advance is part of the total and is not refunded if you cancel, as set out in our cancellation policy.</p>';
  }

  /* ---------------- events ----------------------------------------------- */
  el.month.addEventListener('change', loadMonth);
  el.from.addEventListener('change', onFromChange);
  el.to.addEventListener('change', onToChange);
  el.refresh.addEventListener('click', loadMonth);

  el.gateForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var key = el.gateKey.value.trim();
    if (!key) { el.gateError.textContent = 'Paste your owner key first.'; return; }
    state.key = key;
    try { localStorage.setItem(KEY_STORE, key); } catch (err) {}
    loadMonth();
  });

  function addRow(kind) {
    var list = kind === 'exp' ? state.exp : state.misc;
    var today = todayISO();
    var item = { date: inRange(today) ? today : state.from, desc: '', amount: '' };
    if (kind === 'exp') item.category = EXP_CATS[0];
    list.push(item);
    saveList(kind, list);
    renderList(kind);
    renderTotals();
  }
  el.expAdd.addEventListener('click', function () { addRow('exp'); });
  el.miscAdd.addEventListener('click', function () { addRow('misc'); });

  function onEntryInput(e) {
    var t = e.target;
    var kind = t.getAttribute('data-kind');
    if (!kind) return;
    var list = kind === 'exp' ? state.exp : state.misc;
    var item = list[+t.getAttribute('data-i')];
    if (!item) return;
    item[t.getAttribute('data-f')] = t.value;
    saveList(kind, list);
    if (t.getAttribute('data-f') === 'date') {
      var row = t.closest('tr');
      if (row) row.classList.toggle('acc__out', !inRange(t.value));
    }
    renderTotals();
  }
  el.expRows.addEventListener('input', onEntryInput);
  el.expRows.addEventListener('change', onEntryInput);
  el.miscRows.addEventListener('input', onEntryInput);
  el.miscRows.addEventListener('change', onEntryInput);

  function onRemove(e) {
    var btn = e.target.closest('button[data-remove]');
    if (!btn) return;
    var kind = btn.getAttribute('data-remove');
    var list = kind === 'exp' ? state.exp : state.misc;
    list.splice(+btn.getAttribute('data-i'), 1);
    saveList(kind, list);
    renderList(kind);
    renderTotals();
  }
  el.expRows.addEventListener('click', onRemove);
  el.miscRows.addEventListener('click', onRemove);

  el.bookings.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-invoice]');
    if (!btn) return;
    var b = state.rows[+btn.getAttribute('data-invoice')];
    if (b) printDoc('Invoice ' + b.reference, invoiceDoc(b));
  });

  el.dlSales.addEventListener('click', function () { printDoc('Sales ' + periodLabel(), salesDoc()); });
  el.dlExp.addEventListener('click', function () { printDoc('Expenses ' + periodLabel(), expensesDoc()); });
  el.dlMisc.addEventListener('click', function () { printDoc('Other expenses ' + periodLabel(), expensesDoc()); });
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
