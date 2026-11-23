// EKA Forest v1, tiny enhancements (site works without JS)
const yearEl = document.getElementById('y');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// FAQ: opening a question closes the others in the same column
document.querySelectorAll('.faq__col').forEach(col => {
  col.addEventListener('toggle', e => {
    if (e.target.open) col.querySelectorAll('details[open]').forEach(d => { if (d !== e.target) d.open = false; });
  }, true);
});

// Map facade: load the Google Maps iframe only when asked (keeps the page fast)
const facade = document.querySelector('.map-facade');
if (facade) facade.addEventListener('click', e => {
  e.preventDefault();
  const f = document.createElement('iframe');
  f.src = facade.dataset.embed; f.title = 'Map of Vattavada, Kerala'; f.loading = 'lazy';
  f.referrerPolicy = 'no-referrer-when-downgrade'; f.allowFullscreen = true;
  facade.replaceWith(f);
});

// Slide-out menu. Built once, on every public page that loads this file.
(function () {
  var script = document.currentScript;
  if (!script) {
    var scripts = document.querySelectorAll('script[src]');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (/assets\/main\.js(\?|$)/.test(scripts[i].src)) { script = scripts[i]; break; }
    }
  }
  if (!script) return;

  var root = script.src.replace(/assets\/main\.js(?:\?.*)?$/, '');
  function section(id) {
    return document.getElementById(id) ? '#' + id : root + 'demo/#' + id;
  }
  var wa = 'https://wa.me/917012293538?text=' + encodeURIComponent("Hi EKA Forest, I'd like to book a stay.");

  var wrap = document.createElement('div');
  wrap.className = 'site-menu';
  wrap.innerHTML = [
    '<button class="menu-btn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="site-menu">',
    '  <span></span><span></span><span></span>',
    '</button>',
    '<div class="menu-overlay" data-menu-close aria-hidden="true"></div>',
    '<aside class="menu-drawer" id="site-menu" aria-label="Site menu" aria-hidden="true">',
    '  <div class="menu-drawer__head">',
    '    <span class="menu-drawer__brand">EKA Forest</span>',
    '    <button class="menu-drawer__close" type="button" aria-label="Close menu" data-menu-close>&times;</button>',
    '  </div>',
    '  <nav class="menu-drawer__primary" aria-label="Main">',
    '    <ul>',
    '      <li><a href="' + root + 'book/">Book a stay</a></li>',
    '      <li><a href="' + root + 'blog/">Journals</a></li>',
    '      <li><a href="' + root + 'events/">Events</a></li>',
    '      <li><a href="' + root + 'gallery/">Gallery</a></li>',
    '    </ul>',
    '  </nav>',
    '  <div class="menu-drawer__section">',
    '    <h3>Explore</h3>',
    '    <ul>',
    '      <li><a href="' + section('stays') + '">Stays &amp; experiences</a></li>',
    '      <li><a href="https://maps.app.goo.gl/ZacFg4FmZhpEeB4y6?g_st=iw" target="_blank" rel="noopener">Guest reviews</a></li>',
    '    </ul>',
    '  </div>',
    '  <div class="menu-drawer__section">',
    '    <h3>Contact</h3>',
    '    <ul>',
    '      <li><a href="' + wa + '" data-cms-wa target="_blank" rel="noopener">WhatsApp: <span data-cms="contact.whatsapp_display">+91 70122 93538</span></a></li>',
    '      <li><a href="https://www.instagram.com/eka_forest_/" data-cms-href="contact.instagram_url" target="_blank" rel="noopener">Instagram: <span data-cms="contact.instagram_handle">@eka_forest_</span></a></li>',
    '      <li><a href="mailto:hello@ekaforest.com" data-cms-mailto="contact.email" data-cms="contact.email">hello@ekaforest.com</a></li>',
    '    </ul>',
    '  </div>',
    '  <p class="menu-drawer__foot">EKA Forest, Vattavada, Kerala</p>',
    '</aside>'
  ].join('\n');

  document.body.appendChild(wrap);
  document.body.classList.add('has-menu');

  function onScroll() {
    document.body.classList.toggle('is-scrolled', window.scrollY > 16);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var drifts = [];
  document.querySelectorAll('.hero__media').forEach(function (el) { drifts.push({ box: el, el: el }); });
  document.querySelectorAll('.stay-row__media').forEach(function (fig) {
    var img = fig.querySelector('img'); if (img) drifts.push({ box: fig, el: img });
  });
  document.querySelectorAll('.gallery__strip .ph--tile').forEach(function (li) {
    var img = li.querySelector('img'); if (img) drifts.push({ box: li, el: img });
  });
  if (drifts.length && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var ticking = false;
    var moveAll = function () {
      ticking = false;
      var vh = window.innerHeight;
      drifts.forEach(function (d) {
        var r = d.box.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var t = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2);
        t = Math.max(-1, Math.min(1, t));
        d.el.style.transform = 'translate3d(0,' + (t * -40).toFixed(1) + 'px,0) scale(1.22)';
      });
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(moveAll); }
    }, { passive: true });
    window.addEventListener('resize', moveAll, { passive: true });
    moveAll();
  }

  var button = wrap.querySelector('.menu-btn');
  var drawer = wrap.querySelector('.menu-drawer');
  var overlay = wrap.querySelector('.menu-overlay');
  var closeButton = wrap.querySelector('.menu-drawer__close');
  var lastFocus = null;

  function openMenu() {
    lastFocus = document.activeElement;
    document.body.classList.add('menu-open');
    button.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');
    closeButton.focus();
  }

  function closeMenu() {
    if (!document.body.classList.contains('menu-open')) return;
    document.body.classList.remove('menu-open');
    button.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  button.addEventListener('click', function () {
    if (document.body.classList.contains('menu-open')) closeMenu(); else openMenu();
  });
  overlay.addEventListener('click', closeMenu);
  closeButton.addEventListener('click', closeMenu);
  drawer.addEventListener('click', function (event) {
    if (event.target.closest('a')) closeMenu();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeMenu();
  });
})();
