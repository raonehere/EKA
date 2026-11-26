/* EKA Forest: full-screen photo view. Site works without this script. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var items = [];
  var index = 0;
  var lastFocus = null;
  var swipeX = null;
  var pointer = null;
  var root, imgEl, capEl, prevBtn, nextBtn, closeBtn, backdrop;

  function groupOf(ph) {
    if (ph.closest('.post-card')) return null;
    if (ph.closest('.hero')) return null;
    if (ph.closest('a[href]')) return null;
    if (ph.closest('.gallery-page')) return 'gallery';
    if (ph.closest('.gallery--carousel')) return 'carousel';
    if (ph.closest('.book__strip')) return 'book-strip';
    if (ph.closest('.stays')) return 'stays';
    if (ph.classList.contains('ph--about') || ph.closest('.about')) return 'about';
    if (ph.closest('.event') || ph.closest('.events__section')) return 'events';
    if (ph.closest('.post') || ph.classList.contains('ph--post')) return 'post';
    return null;
  }

  function captionFor(ph, image) {
    var alt = (image && image.getAttribute('alt')) || '';
    return alt.trim();
  }

  function srcFor(image) {
    return image.currentSrc || image.src;
  }

  function collect() {
    items = [];
    document.querySelectorAll('.ph').forEach(function (ph) {
      var image = ph.querySelector('img');
      if (!image) return;
      var src = image.getAttribute('src') || '';
      if (/\/brand\/|logo\.|wordmark|icon-|grain\.png/i.test(src)) return;
      var group = groupOf(ph);
      if (!group) return;
      ph.classList.add('is-lb');
      ph.setAttribute('role', 'button');
      ph.setAttribute('tabindex', '0');
      var label = captionFor(ph, image) || 'photo';
      ph.setAttribute('aria-label', 'View ' + label + ' full screen');
      items.push({ ph: ph, group: group });
    });
  }

  function groupItems() {
    var g = items[index] && items[index].group;
    return items.filter(function (it) { return it.group === g; });
  }

  function groupIndex() {
    var g = groupItems();
    var current = items[index];
    for (var i = 0; i < g.length; i++) if (g[i] === current) return i;
    return 0;
  }

  function build() {
    root = document.createElement('div');
    root.className = 'lightbox';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Photo');
    root.innerHTML =
      '<div class="lightbox__backdrop" tabindex="-1"></div>' +
      '<button type="button" class="lightbox__close" aria-label="Close photo">' +
        '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
      '</button>' +
      '<button type="button" class="lightbox__nav lightbox__prev" aria-label="Previous photo">' +
        '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<button type="button" class="lightbox__nav lightbox__next" aria-label="Next photo">' +
        '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<figure class="lightbox__figure">' +
        '<img class="lightbox__img" alt="">' +
        '<figcaption class="lightbox__cap"></figcaption>' +
      '</figure>';
    document.body.appendChild(root);
    backdrop = root.querySelector('.lightbox__backdrop');
    imgEl = root.querySelector('.lightbox__img');
    capEl = root.querySelector('.lightbox__cap');
    prevBtn = root.querySelector('.lightbox__prev');
    nextBtn = root.querySelector('.lightbox__next');
    closeBtn = root.querySelector('.lightbox__close');

    backdrop.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', function (e) { e.stopPropagation(); go(-1); });
    nextBtn.addEventListener('click', function (e) { e.stopPropagation(); go(1); });

    root.addEventListener('touchstart', onSwipeStart, { passive: true });
    root.addEventListener('touchend', onSwipeEnd, { passive: true });
    root.addEventListener('keydown', onKey);
  }

  function onSwipeStart(e) {
    if (!e.changedTouches || !e.changedTouches[0]) return;
    swipeX = e.changedTouches[0].clientX;
  }

  function onSwipeEnd(e) {
    if (swipeX == null || !e.changedTouches || !e.changedTouches[0]) return;
    var dx = e.changedTouches[0].clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) < 40) return;
    go(dx < 0 ? 1 : -1);
  }

  function focusables() {
    var list = [closeBtn];
    if (!prevBtn.hidden) list.push(prevBtn);
    if (!nextBtn.hidden) list.push(nextBtn);
    return list;
  }

  function onKey(e) {
    if (root.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); return; }
    if (e.key !== 'Tab') return;
    var list = focusables();
    if (!list.length) return;
    var i = list.indexOf(document.activeElement);
    if (e.shiftKey) {
      if (i <= 0) { e.preventDefault(); list[list.length - 1].focus(); }
    } else if (i === list.length - 1 || i === -1) {
      e.preventDefault(); list[0].focus();
    }
  }

  function lockScroll(on) {
    document.documentElement.classList.toggle('lb-lock', on);
    document.body.classList.toggle('lb-lock', on);
  }

  function show(i) {
    index = i;
    var it = items[index];
    if (!it) return;
    var image = it.ph.querySelector('img');
    if (!image) return;
    var cap = captionFor(it.ph, image);
    imgEl.src = srcFor(image);
    imgEl.alt = cap;
    capEl.textContent = cap;
    capEl.hidden = !cap;
    var many = groupItems().length > 1;
    prevBtn.hidden = !many;
    nextBtn.hidden = !many;
    root.classList.toggle('has-nav', many);
  }

  function open(i) {
    if (!root) build();
    lastFocus = document.activeElement;
    show(i);
    root.hidden = false;
    lockScroll(true);
    requestAnimationFrame(function () {
      root.classList.add('is-open');
      closeBtn.focus();
    });
  }

  function close() {
    if (!root || root.hidden) return;
    root.classList.remove('is-open');
    lockScroll(false);
    var finish = function () {
      root.hidden = true;
      imgEl.removeAttribute('src');
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    };
    if (reduce) finish();
    else setTimeout(finish, 200);
  }

  function go(dir) {
    var g = groupItems();
    if (g.length < 2) return;
    var gi = (groupIndex() + dir + g.length) % g.length;
    index = items.indexOf(g[gi]);
    show(index);
  }

  function bindPointer(ph, opener) {
    ph.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
      pointer = { x: e.clientX, y: e.clientY, moved: false };
    });
    ph.addEventListener('pointermove', function (e) {
      if (!pointer) return;
      if (Math.abs(e.clientX - pointer.x) > 8 || Math.abs(e.clientY - pointer.y) > 8) pointer.moved = true;
    });
    ph.addEventListener('pointercancel', function () { pointer = null; });
    ph.addEventListener('click', function (e) {
      var moved = pointer && pointer.moved;
      pointer = null;
      if (moved) { e.preventDefault(); e.stopPropagation(); return; }
      if (e.target.closest && e.target.closest('a[href]')) return;
      e.preventDefault();
      opener();
    });
    ph.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      opener();
    });
  }

  collect();
  if (!items.length) return;
  items.forEach(function (it, i) {
    bindPointer(it.ph, function () { open(i); });
  });
})();
