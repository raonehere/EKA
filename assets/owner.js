/* EKA Forest — owner dashboard.
   Reads the Worker (/owner/summary, /owner/digest) with the owner key.
   Preview mode shows generated numbers so the layout can be reviewed offline. */

(function () {
  'use strict';

  var cfg = window.EKA_BOOKING || {};
  var API = String(cfg.apiBase || '').replace(/\/$/, '');
  var DEMO = !API;
  var TOKEN_KEY = 'eka-owner-key';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = {
    gate: $('#gate'), gateForm: $('#gate-form'), gateKey: $('#gate-key'),
    gateError: $('#gate-error'), gateSubmit: $('#gate-submit'),
    dash: $('#dash'), date: $('#dash-date'), refresh: $('#refresh'), signout: $('#signout'),
    demoflag: $('#demoflag'), loading: $('#loading'), loadingText: $('#loading-text'),
    kpiTents: $('#kpi-tents'), kpiTentsNote: $('#kpi-tents-note'),
    kpiGuests: $('#kpi-guests'), kpiGuestsNote: $('#kpi-guests-note'),
    kpiIn: $('#kpi-in'), kpiInNote: $('#kpi-in-note'),
    kpiOut: $('#kpi-out'), kpiOutNote: $('#kpi-out-note'),
    kpiConfirmed: $('#kpi-confirmed'), kpiReview: $('#kpi-review'), kpiReviewNote: $('#kpi-review-note'),
    bars: $('#bars'), arrivals: $('#arrivals'), departures: $('#departures'),
    digest: $('#digest'), digestCopy: $('#digest-copy'), digestSend: $('#digest-send'), digestNote: $('#digest-note'),
    rows: $('#rows'), upcomingNote: $('#upcoming-note')
  };

  var state = { key: '', data: null, digest: null, busy: false };

  /* ---------------- helpers ---------------------------------------------- */
  function rupees(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }

  function day(d) {
    return new Date(d + 'T00:00:00+05:30')
      .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  }

  function shortDay(d) {
    return new Date(d + 'T00:00:00+05:30')
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  }

  function nights(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }

  function waLink(phone, text) {
    var digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) digits = '91' + digits;
    return 'https://wa.me/' + digits + (text ? '?text=' + encodeURIComponent(text) : '');
  }

  function busy(on, text) {
    state.busy = on;
    el.loading.hidden = !on;
    el.loadingText.textContent = text || 'Reading Notion…';
  }

  function statusLabel(s) {
    return ({ 'Confirmed': 'Confirmed', 'Payment review': 'Check payment', 'Pending payment': 'Not paid' })[s] || s;
  }

  /* ---------------- gate -------------------------------------------------- */

  function showGate(message) {
    el.dash.hidden = true;
    el.gate.hidden = false;
    if (message) {
      el.gateError.textContent = message;
      el.gateError.hidden = false;
    }
    el.gateKey.focus();
  }

  el.gateForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var key = el.gateKey.value.trim();
    if (!key) { el.gateError.textContent = 'Paste your owner key first.'; return; }
    el.gateError.textContent = '';
    state.key = key;
    load();
  });

  /* ---------------- data -------------------------------------------------- */

  function get(path) {
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    return fetch(API + path + sep + 'k=' + encodeURIComponent(state.key), {
      headers: { accept: 'application/json' }
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (res.status === 404) throw new Error('key');
        if (!res.ok) throw new Error(body.error || 'Request failed (' + res.status + ')');
        return body;
      });
    });
  }

  function load() {
    if (DEMO) { render(demoData()); return; }
    busy(true, 'Reading Notion…');
    get('/owner/summary')
      .then(function (data) {
        try { localStorage.setItem(TOKEN_KEY, state.key); } catch (e) {}
        render(data);
      })
      .catch(function (err) {
        if (err.message === 'key') {
          try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
          showGate('That key was not accepted. Check OWNER_TOKEN in the Worker.');
        } else {
          showGate(err.message);
        }
      })
      .then(function () { busy(false); });
  }

  /* ---------------- render ------------------------------------------------ */

  function render(data) {
    state.data = data;
    el.gate.hidden = true;
    el.dash.hidden = false;
    el.demoflag.hidden = !DEMO;

    el.date.textContent = day(data.today);

    el.kpiTents.textContent = data.tonight.tents + ' / ' + data.units;
    el.kpiTentsNote.textContent = data.tonight.free + ' free';
    el.kpiGuests.textContent = String(data.tonight.guests);
    el.kpiGuestsNote.textContent = 'in house tonight';
    el.kpiIn.textContent = String(data.todayArrivals.length);
    el.kpiInNote.textContent = data.next7.arrivals + ' over the next week';
    el.kpiOut.textContent = String(data.todayDepartures.length);
    el.kpiOutNote.textContent = data.next7.departures + ' over the next week';
    el.kpiConfirmed.textContent = rupees(data.money.confirmed);
    el.kpiReview.textContent = rupees(data.money.review);
    el.kpiReviewNote.textContent = data.money.pending ? rupees(data.money.pending) + ' not paid yet' : 'nothing unpaid';

    paintBars(data.months);
    paintPeople(el.arrivals, data.todayArrivals, 'Nobody arriving today.');
    paintPeople(el.departures, data.todayDepartures, 'Nobody leaving today.');
    paintRows(data.upcoming);

    el.upcomingNote.textContent = data.changes.today
      ? data.changes.today + ' date change' + (data.changes.today === 1 ? '' : 's') + ' made today'
      : 'No date changes today';

    loadDigest();
  }

  function paintBars(months) {
    el.bars.innerHTML = '';
    months.forEach(function (m) {
      var pct = Math.max(0, Math.min(100, m.occupancy));
      var item = document.createElement('div');
      item.className = 'bar';
      item.innerHTML =
        '<div class="bar__track"><span class="bar__fill" style="height:' + pct + '%"></span></div>' +
        '<p class="bar__pct">' + m.occupancy + '%</p>' +
        '<p class="bar__label">' + m.label + '</p>' +
        '<p class="bar__sub">' + m.bookings + ' booked' + (m.cancelled ? ' · ' + m.cancelled + ' cancelled' : '') + '</p>';
      el.bars.appendChild(item);
    });
  }

  function paintPeople(list, items, emptyText) {
    list.innerHTML = '';
    if (!items.length) {
      var li = document.createElement('li');
      li.className = 'people__empty';
      li.textContent = emptyText;
      list.appendChild(li);
      return;
    }
    items.forEach(function (b) {
      var li = document.createElement('li');
      li.className = 'person';
      var link = waLink(b.phone, 'Hi ' + (b.name || '') + ', this is EKA Forest.');
      li.innerHTML =
        '<span class="person__name">' + escapeHTML(b.name || '—') + '</span>' +
        '<span class="person__meta">' + b.guests + (b.guests === 1 ? ' guest' : ' guests') +
        (b.children ? ' + ' + b.children + ' under 10' : '') +
        ' · ' + b.tents + ' tent' + (b.tents === 1 ? '' : 's') + ' · ' + escapeHTML(b.reference) + '</span>' +
        (link ? '<a class="person__wa" href="' + link + '" target="_blank" rel="noopener">WhatsApp</a>' : '');
      list.appendChild(li);
    });
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function paintRows(rows) {
    el.rows.innerHTML = '';
    if (!rows.length) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6" class="booktable__empty">No bookings in the next month.</td>';
      el.rows.appendChild(tr);
      return;
    }
    rows.forEach(function (b) {
      var tr = document.createElement('tr');
      tr.className = 'status-' + String(b.status).toLowerCase().replace(/\s+/g, '-');
      var link = waLink(b.phone, 'Hi ' + (b.name || '') + ', this is EKA Forest about your stay ' + b.reference + '.');
      tr.innerHTML =
        '<td data-label="Dates"><span class="cell__strong">' + shortDay(b.checkIn) + ' → ' + shortDay(b.checkOut) + '</span>' +
          '<span class="cell__sub">' + nights(b.checkIn, b.checkOut) + ' nights</span></td>' +
        '<td data-label="Guest"><span class="cell__strong">' + escapeHTML(b.name || '—') + '</span>' +
          '<span class="cell__sub">' + b.guests + (b.guests === 1 ? ' guest' : ' guests') +
          (b.children ? ' + ' + b.children + ' under 10' : '') +
          (link ? ' · <a href="' + link + '" target="_blank" rel="noopener">message</a>' : '') + '</span></td>' +
        '<td data-label="Tents">' + b.tents + '</td>' +
        '<td data-label="Advance">' + rupees(b.advance) + '</td>' +
        '<td data-label="Status"><span class="chip chip--' + String(b.status).toLowerCase().replace(/\s+/g, '-') + '">' +
          statusLabel(b.status) + '</span></td>' +
        '<td class="cell__actions" data-label="Do">' +
          (b.status !== 'Confirmed' ? '<button class="chipbtn" data-act="Confirmed" data-ref="' + escapeHTML(b.reference) + '">Confirm</button>' : '') +
          '<button class="chipbtn chipbtn--quiet" data-act="Cancelled" data-ref="' + escapeHTML(b.reference) + '">Cancel</button>' +
        '</td>';
      el.rows.appendChild(tr);
    });
  }

  el.rows.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn || state.busy) return;
    var action = btn.getAttribute('data-act');
    var reference = btn.getAttribute('data-ref');
    var verb = action === 'Confirmed' ? 'confirm this booking' : 'cancel this booking';
    if (!window.confirm('Really ' + verb + '? (' + reference + ')')) return;

    if (DEMO) {
      var b = state.data.upcoming.find(function (x) { return x.reference === reference; });
      if (b) b.status = action;
      paintRows(state.data.upcoming);
      return;
    }

    btn.disabled = true;
    busy(true, 'Writing to Notion…');
    fetch(API + '/owner/status?k=' + encodeURIComponent(state.key), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reference: reference, status: action })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error(body.error || 'Could not update that booking.');
        return body;
      });
    }).then(function () {
      load();
    }).catch(function (err) {
      window.alert(err.message);
      btn.disabled = false;
    }).then(function () { busy(false); });
  });

  /* ---------------- digest ------------------------------------------------ */

  function loadDigest() {
    if (DEMO) { paintDigest(localDigest(state.data)); return; }
    get('/owner/digest').then(function (d) {
      paintDigest(d.text, d.waLink);
    }).catch(function () {
      paintDigest('Could not build the update. Refresh to try again.');
    });
  }

  function paintDigest(text, wa) {
    el.digest.textContent = text;
    if (wa) {
      el.digestSend.href = wa;
      el.digestSend.hidden = false;
      el.digestNote.hidden = true;
    } else {
      el.digestSend.hidden = true;
      el.digestNote.hidden = false;
      el.digestNote.textContent = 'Set WA_NOTIFY to the property manager\'s number and this button becomes a one-tap send.';
    }
  }

  el.digestCopy.addEventListener('click', function () {
    var text = el.digest.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        el.digestCopy.textContent = 'Copied';
        setTimeout(function () { el.digestCopy.textContent = 'Copy'; }, 1600);
      }, function () { el.digestCopy.textContent = 'Select the text'; });
    } else {
      el.digestCopy.textContent = 'Select the text';
    }
  });

  el.refresh.addEventListener('click', function () { load(); });
  el.signout.addEventListener('click', function () {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    state.key = '';
    showGate();
  });

  /* ---------------- demo data --------------------------------------------- */

  function localDigest(s) {
    var out = ['EKA Forest — ' + day(s.today), ''];
    out.push('Tonight: ' + s.tonight.tents + ' of ' + s.units + ' tents, ' + s.tonight.guests + ' guests, ' + s.tonight.free + ' free');
    out.push('Today: ' + s.todayArrivals.length + ' arriving, ' + s.todayDepartures.length + ' leaving');
    out.push('Next 7 days: ' + s.next7.arrivals + ' arriving, ' + s.next7.departures + ' leaving');
    if (s.todayArrivals.length) {
      out.push('');
      out.push('Arriving today:');
      s.todayArrivals.forEach(function (b) {
        out.push('• ' + b.name + ' — ' + b.guests + ' guests, ' + b.tents + ' tent' + (b.tents === 1 ? '' : 's') + ' (' + b.reference + ')');
      });
    }
    out.push('');
    out.push('Money:');
    out.push('• ' + rupees(s.money.confirmed) + ' advance received');
    out.push('• ' + rupees(s.money.review) + ' waiting for your check');
    out.push('• ' + rupees(s.money.pending) + ' not paid yet');
    return out.join('\n');
  }

  function demoData() {
    var today = new Date();
    var iso = function (d) {
      return new Date(d.getTime() + (330 * 60000)).toISOString().slice(0, 10);
    };
    var t = iso(today);

    function plus(n) { return iso(new Date(today.getTime() + n * 86400000)); }

    var months = [];
    for (var i = -3; i <= 3; i++) {
      var d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      var key = d.toISOString().slice(0, 7);
      var occ = [54, 41, 73, 62, 88, 79, 46][i + 3] || 50;
      months.push({
        key: key, label: d.toLocaleString('en-GB', { month: 'short' }) + ' ' + String(d.getFullYear()).slice(2),
        days: 30, sold: 0, capacity: 0, occupancy: occ,
        bookings: 4 + (i + 3), cancelled: i === 1 ? 1 : 0, guests: 0,
        confirmedAdvance: 0, reviewAdvance: 0, pendingAdvance: 0
      });
    }

    var upcoming = [
      { reference: 'EKA-261119-A1B2', name: 'Meera Nair', phone: '919000000001', checkIn: t, checkOut: plus(2), nights: 2, guests: 2, children: 0, tents: 1, status: 'Confirmed', advance: 2000, moves: 0, notes: '' },
      { reference: 'EKA-261120-C3D4', name: 'Arjun & family', phone: '919000000002', checkIn: t, checkOut: plus(3), nights: 3, guests: 4, children: 2, tents: 2, status: 'Payment review', advance: 2000, moves: 1, notes: '' },
      { reference: 'EKA-261122-E5F6', name: 'Lena Fischer', phone: '491700000003', checkIn: plus(4), checkOut: plus(7), nights: 3, guests: 1, children: 0, tents: 1, status: 'Confirmed', advance: 2000, moves: 0, notes: '' },
      { reference: 'EKA-261125-G7H8', name: 'Ravi Kumar', phone: '919000000004', checkIn: plus(7), checkOut: plus(9), nights: 2, guests: 3, children: 0, tents: 2, status: 'Pending payment', advance: 2000, moves: 2, notes: '' }
    ];

    var arrive = upcoming.filter(function (b) { return b.checkIn === t; });
    var leave = upcoming.filter(function (b) { return b.checkOut === t; });

    return {
      today: t, units: 11, capacity: 2, advance: 2000,
      tonight: { tents: 7, free: 4, guests: 13 },
      todayArrivals: arrive, todayDepartures: leave,
      next7: { arrivals: 6, departures: 4 },
      months: months,
      money: { confirmed: 48000, review: 4000, pending: 2000 },
      changes: { today: 1, last7: 3 },
      cancellations: { upcoming: 1 },
      upcoming: upcoming
    };
  }

  /* ---------------- boot -------------------------------------------------- */

  (function boot() {
    if (DEMO) {
      state.key = 'preview';
      render(demoData());
      return;
    }

    var params = new URLSearchParams(location.search);
    var fromUrl = params.get('k');
    if (fromUrl) {
      state.key = fromUrl;
      try { localStorage.setItem(TOKEN_KEY, fromUrl); } catch (e) {}
      params.delete('k');
      var q = params.toString();
      history.replaceState(null, '', location.pathname + (q ? '?' + q : ''));
    } else {
      try { state.key = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) {}
    }

    if (state.key) load();
    else showGate();
  })();

})();
