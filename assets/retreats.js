/* EKA Forest — group enquiry form.
   No backend: the form composes a WhatsApp message (and an email fallback).
   Nothing is sent until the guest presses send in WhatsApp or their mail app. */
(function () {
  var form = document.getElementById('rt-form');
  if (!form) return;

  var status = document.getElementById('rt-status');
  var mailto = document.getElementById('rt-mailto');
  var PHONE = '917012293538';
  var EMAIL = 'hello@ekaforest.com';

  function value(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function buildMessage() {
    var lines = [
      'Group stay enquiry — EKA Forest',
      '',
      'Name: ' + value('rt-name'),
      'Organisation: ' + (value('rt-org') || '—'),
      'Email: ' + value('rt-email'),
      'Phone: ' + value('rt-phone'),
      'Group size: ' + value('rt-guests'),
      'Preferred dates: ' + value('rt-dates'),
      'Type: ' + value('rt-type'),
      'Notes: ' + (value('rt-notes') || '—')
    ];
    return lines.join('\n');
  }

  function updateMailto() {
    if (!mailto) return;
    var subject = 'Group stay enquiry — ' + (value('rt-name') || 'EKA Forest');
    mailto.href = 'mailto:' + EMAIL +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(buildMessage());
  }

  function setStatus(text, isError) {
    if (!status) return;
    status.textContent = text;
    status.dataset.state = isError ? 'error' : 'ok';
  }

  function firstInvalid() {
    var checks = [
      ['rt-name', value('rt-name').length > 0],
      ['rt-email', /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value('rt-email'))],
      ['rt-phone', value('rt-phone').replace(/\D/g, '').length >= 8],
      ['rt-guests', Number(value('rt-guests')) > 0],
      ['rt-dates', value('rt-dates').length > 0]
    ];
    for (var i = 0; i < checks.length; i++) {
      if (!checks[i][1]) return checks[i][0];
    }
    return null;
  }

  form.addEventListener('input', updateMailto);

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var missing = firstInvalid();
    if (missing) {
      var el = document.getElementById(missing);
      setStatus('Please add your name, a valid email, a phone number, the group size and your dates.', true);
      if (el) el.focus();
      return;
    }

    var url = 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(buildMessage());
    updateMailto();
    var win = window.open(url, '_blank', 'noopener');
    if (win) {
      setStatus('WhatsApp opened in a new tab. Press send there to reach us — we reply within a day.', false);
    } else {
      setStatus('Your browser blocked the new tab. Use the WhatsApp link on the left, or send the same details by email below.', true);
    }
  });

  updateMailto();

  // Printing the page as a venue sheet: open every FAQ answer, then restore.
  window.addEventListener('beforeprint', function () {
    document.querySelectorAll('details').forEach(function (d) {
      d.dataset.wasOpen = d.open ? '1' : '0';
      d.open = true;
    });
  });
  window.addEventListener('afterprint', function () {
    document.querySelectorAll('details').forEach(function (d) {
      d.open = d.dataset.wasOpen === '1';
    });
  });
})();
