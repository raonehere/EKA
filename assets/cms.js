/* EKA Forest – Google Sheets CMS loader.
   Reads the sheet "EKA Forest – Website Content" (tabs: contact, about, stays, gallery, reach, faq, footer;
   columns key | value | notes) and fills elements tagged data-cms="tab.key".
   Journal article bodies use data-cms-body="blog.postN_body" with a simple heading/paragraph/bullet format.
   The HTML text stays as the fallback: if the fetch fails or a cell is empty, nothing changes. */
(function () {
  var SHEET_ID = '1SGwnRwcCm8O7QgaROm5XQ4jnb8fO22u_ZLt2iEytGUw';
  // data-cms prefix -> sheet tab title (friendly tab names in the sheet)
  var TABS = { about: 'About', stays: 'Stays', gallery: 'Gallery', reach: 'Getting here',
               faq: 'FAQ', contact: 'Contact', footer: 'Footer',
               events: 'Events', blog: 'Journals' };
  var ALLOWED = { BR: 1, STRONG: 1, EM: 1, A: 1 };

  // Site root, so sheet values like "assets/img/x.jpg" work from /blog/ too.
  var ROOT = (function () {
    var s = document.querySelector('script[src*="cms.js"]');
    return s ? s.src.replace(/assets\/cms\.js.*$/, '') : '';
  })();

  function url(tab) {
    return 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
      '/gviz/tq?tqx=out:json&headers=1&sheet=' + encodeURIComponent(tab);
  }
  function parse(txt) {                       // gviz wraps JSON in a JS callback
    var json = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    var out = {}, cols = json.table.cols.map(function (c) { return (c.label || '').trim().toLowerCase(); });
    var ki = cols.indexOf('key'), vi = -1;            // columns found by header, so layout can change
    cols.forEach(function (l, i) { if (vi < 0 && /^(your content|value)/.test(l)) vi = i; });
    if (ki < 0) ki = 0; if (vi < 0) vi = 1;
    (json.table.rows || []).forEach(function (r) {
      var k = r.c[ki] && r.c[ki].v, v = r.c[vi] && r.c[vi].v;
      if (k && v !== null && v !== undefined && String(v).trim() !== '') out[String(k).trim()] = String(v);
    });
    return out;
  }
  function safeHTML(el, html) {               // allow only br/strong/em/a(href http/mailto)
    var tpl = document.createElement('template'); tpl.innerHTML = html;
    (function clean(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 1) {
          if (!ALLOWED[n.tagName]) { n.replaceWith(document.createTextNode(n.textContent)); return; }
          Array.prototype.slice.call(n.attributes).forEach(function (a) {
            if (!(n.tagName === 'A' && /^(href|target|rel)$/.test(a.name))) n.removeAttribute(a.name);
          });
          if (n.tagName === 'A' && !/^(https?:|mailto:|#)/.test(n.getAttribute('href') || '')) n.removeAttribute('href');
          clean(n);
        }
      });
    })(tpl.content);
    el.replaceChildren(tpl.content);
  }

  // Safe hrefs for journal bodies: http/https/mailto, in-page #, and same-site relative paths.
  // Protocol-relative (//…), javascript:, data: and other schemes are rejected.
  function safeHref(href) {
    href = (href || '').trim();
    if (/^(https?:\/\/|mailto:)/i.test(href)) return href;
    if (href.charAt(0) === '#' && !/[\s<>"']/.test(href)) return href;
    if (/^\/[^/]/.test(href) && !/[\s<>"'\\]/.test(href) && href.indexOf(':') < 0) return href;
    if (/^(\.\/|\.\.\/)/.test(href) && !/[\s<>"'\\]/.test(href) && href.indexOf(':') < 0) return href;
    return '';
  }

  function appendInline(parent, text) {
    var re = /<br\s*\/?>|<\/?(?:strong|b|em|i)>|<a\s+[^>]*href=["']([^"']+)["'][^>]*>|<\/a>|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/gi;
    var pos = 0, m, stack = [parent];
    function cur() { return stack[stack.length - 1]; }
    function addText(s) { if (s) cur().appendChild(document.createTextNode(s)); }
    while ((m = re.exec(text))) {
      addText(text.slice(pos, m.index));
      pos = re.lastIndex;
      var tok = m[0], lower = tok.toLowerCase();
      if (/^<br/.test(lower)) {
        cur().appendChild(document.createElement('br'));
      } else if (lower === '<strong>' || lower === '<b>') {
        var strongEl = document.createElement('strong'); cur().appendChild(strongEl); stack.push(strongEl);
      } else if (lower === '</strong>' || lower === '</b>') {
        if (stack.length > 1 && cur().tagName === 'STRONG') stack.pop();
        else addText(tok);
      } else if (lower === '<em>' || lower === '<i>') {
        var emEl = document.createElement('em'); cur().appendChild(emEl); stack.push(emEl);
      } else if (lower === '</em>' || lower === '</i>') {
        if (stack.length > 1 && cur().tagName === 'EM') stack.pop();
        else addText(tok);
      } else if (lower.indexOf('<a') === 0 && lower !== '</a>') {
        var aEl = document.createElement('a');
        var href = safeHref(m[1] || '');
        if (href) aEl.setAttribute('href', href);
        cur().appendChild(aEl); stack.push(aEl);
      } else if (lower === '</a>') {
        if (stack.length > 1 && cur().tagName === 'A') stack.pop();
        else addText(tok);
      } else if (tok.slice(0, 2) === '**') {
        var bold = document.createElement('strong');
        bold.textContent = m[2];
        cur().appendChild(bold);
      } else if (tok.charAt(0) === '[') {
        var mdHref = safeHref(m[4] || '');
        if (mdHref) {
          var mdA = document.createElement('a');
          mdA.setAttribute('href', mdHref);
          mdA.textContent = m[3];
          cur().appendChild(mdA);
        } else {
          addText(m[3]);
        }
      }
    }
    addText(text.slice(pos));
  }

  function renderBody(el, src) {
    src = String(src).replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
    var lines = src.split('\n');
    var frag = document.createDocumentFragment();
    var i = 0, ul = null;
    function closeList() { if (ul) { frag.appendChild(ul); ul = null; } }
    function isHeading(line) { return /^##\s+/.test(line); }
    function isBullet(line) { return /^-\s+/.test(line); }
    while (i < lines.length) {
      var line = lines[i];
      if (line.trim() === '') { closeList(); i++; continue; }
      if (isHeading(line)) {
        closeList();
        var h = document.createElement('h2');
        appendInline(h, line.replace(/^##\s+/, ''));
        frag.appendChild(h);
        i++;
        continue;
      }
      if (isBullet(line)) {
        if (!ul) ul = document.createElement('ul');
        var li = document.createElement('li');
        appendInline(li, line.replace(/^-\s+/, ''));
        ul.appendChild(li);
        i++;
        continue;
      }
      closeList();
      var para = [line];
      i++;
      while (i < lines.length && lines[i].trim() !== '' && !isHeading(lines[i]) && !isBullet(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      var p = document.createElement('p');
      appendInline(p, para.join(' '));
      frag.appendChild(p);
    }
    closeList();
    el.replaceChildren(frag);
  }

  function apply(d) {
    var n = 0;
    // Footer Address block removed: never render footer.address from CMS
    document.querySelectorAll('[data-cms="footer.address"]').forEach(function (el) { el.remove(); });
    var get = function (path) { var p = path.split('.'); return d[p[0]] && d[p[0]][p[1]]; };
    document.querySelectorAll('[data-cms]').forEach(function (el) {
      if (el.getAttribute('data-cms') === 'footer.address') { el.remove(); return; }
      var v = get(el.getAttribute('data-cms')); if (v === undefined) return; n++;
      if (/[<&]/.test(v)) safeHTML(el, v.replace(/\n/g, '<br>'));
      else { el.textContent = ''; v.split('\n').forEach(function (line, i) {
        if (i) el.appendChild(document.createElement('br')); el.appendChild(document.createTextNode(line)); }); }
    });
    document.querySelectorAll('[data-cms-href]').forEach(function (el) {
      var v = get(el.getAttribute('data-cms-href')); if (v && /^https?:/.test(v)) el.href = v;
    });
    document.querySelectorAll('[data-cms-mailto]').forEach(function (el) {
      var v = get(el.getAttribute('data-cms-mailto')); if (v) el.href = 'mailto:' + v.trim();
    });
    var num = (get('contact.whatsapp_number') || '').replace(/\D/g, '');
    if (num) {
      var msg = get('contact.whatsapp_message');
      document.querySelectorAll('[data-cms-wa]').forEach(function (el) {
        var u = new URL(el.href); u.pathname = '/' + num;
        if (msg && el.getAttribute('data-cms-wa') !== 'keep') u.searchParams.set('text', msg);
        el.href = u.toString();
      });
    }
    document.querySelectorAll('[data-cms-img]').forEach(function (el) {
      var v = get(el.getAttribute('data-cms-img')); if (!v || !/^(https?:|assets\/)/.test(v)) return;
      // "assets/..." is relative to the site root, not to the current page:
      // without this, /blog/ asked for /blog/assets/... and every journal
      // photo 404ed.
      if (v.indexOf('assets/') === 0) v = ROOT + v;
      el.style.backgroundImage = 'url("' + v.replace(/"/g, '%22') + '")';
      el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center';
      el.classList.add('has-photo');
      var cap = el.querySelector('span, figcaption'); if (cap) cap.classList.add('visually-hidden');
    });
    document.querySelectorAll('[data-cms-body]').forEach(function (el) {
      var v = get(el.getAttribute('data-cms-body')); if (v === undefined) return;
      renderBody(el, v); n++;
    });
    document.documentElement.setAttribute('data-cms-loaded', '');
    document.documentElement.setAttribute('data-cms-count', n);  // fields filled from the sheet
  }

  // Only fetch the tabs this page actually uses (keeps inner pages light)
  var used = { contact: 1 };
  document.querySelectorAll('[data-cms],[data-cms-href],[data-cms-img],[data-cms-mailto],[data-cms-body]').forEach(function (el) {
    ['data-cms', 'data-cms-href', 'data-cms-img', 'data-cms-mailto', 'data-cms-body'].forEach(function (a) {
      var v = el.getAttribute(a); if (v) used[v.split('.')[0]] = 1;
    });
  });
  Promise.all(Object.keys(TABS).filter(function (t) { return used[t]; }).map(function (t) {
    return fetch(url(TABS[t])).then(function (r) { if (!r.ok) throw r.status; return r.text(); })
      .then(parse).then(function (rows) { return [t, rows]; })
      .catch(function () { return [t, {}]; });       // one bad tab never breaks the page
  })).then(function (pairs) {
    var d = {}; pairs.forEach(function (p) { d[p[0]] = p[1]; }); apply(d);
  }).catch(function () {});
})();
