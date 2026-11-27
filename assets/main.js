// EKA Forest v1, tiny enhancements (site works without JS)
var yearEl = document.getElementById('y');
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


// Landing gallery arrows (the strip itself is swipeable without JS)
document.querySelectorAll('.gallery--carousel').forEach(gallery => {
  const strip = gallery.querySelector('.gallery__strip');
  const prev = gallery.querySelector('.gallery__nav--prev');
  const next = gallery.querySelector('.gallery__nav--next');
  if (!strip || !prev || !next) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const go = dir => {
    const tile = strip.querySelector('.ph--tile');
    const styles = getComputedStyle(strip);
    const gap = parseFloat(styles.columnGap || styles.gap) || 16;
    const step = tile ? tile.getBoundingClientRect().width + gap : strip.clientWidth * 0.8;
    const page = Math.max(1, Math.round((strip.clientWidth - 56) / step));
    strip.scrollBy({ left: dir * step * page, behavior: reduce ? 'auto' : 'smooth' });
  };
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
});



// Hero: sample each slide for a white or brown haze, and cross-fade three photos
(function () {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  var slides = Array.prototype.slice.call(hero.querySelectorAll('.hero__photo img'));
  if (!slides.length) return;

  var HOLD = 10000;
  var FADE = 1000;
  var cache = {};
  var current = 0;
  var timer = null;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function luma(r, g, b) {
    function lin(c) {
      c = c / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function apply(light) {
    if (light) {
      hero.style.setProperty('--hero-s-r', '255');
      hero.style.setProperty('--hero-s-g', '255');
      hero.style.setProperty('--hero-s-b', '255');
      hero.style.setProperty('--hero-ink', '#654330');
      hero.setAttribute('data-hero-tone', 'light');
    } else {
      hero.style.setProperty('--hero-s-r', '101');
      hero.style.setProperty('--hero-s-g', '67');
      hero.style.setProperty('--hero-s-b', '48');
      hero.style.setProperty('--hero-ink', '#e9edef');
      hero.setAttribute('data-hero-tone', 'dark');
    }
  }

  function sample(img) {
    var key = img.currentSrc || img.src;
    if (key && cache[key] != null) {
      apply(cache[key]);
      return;
    }
    if (!img.naturalWidth) return;
    try {
      var iw = img.naturalWidth, ih = img.naturalHeight;
      var maxSide = 96;
      var scale = Math.min(1, maxSide / Math.max(iw, ih));
      var cw = Math.max(8, Math.round(iw * scale));
      var ch = Math.max(8, Math.round(ih * scale));
      var canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);
      // Left/top region — the area the intro sits in on desktop
      var x0 = 0, y0 = 0;
      var w = Math.max(1, Math.round(cw * 0.45));
      var h = Math.max(1, Math.round(ch * 0.5));
      var data = ctx.getImageData(x0, y0, w, h).data;
      var r = 0, g = 0, b = 0, n = 0, i;
      for (i = 0; i < data.length; i += 16) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n += 1;
      }
      if (!n) return;
      var light = luma(r / n, g / n, b / n) >= 0.45;
      cache[key] = light;
      apply(light);
    } catch (err) {
      // Keep the CSS defaults if the canvas read fails.
    }
  }

  function show(index, instant) {
    current = (index + slides.length) % slides.length;
    slides.forEach(function (img, i) {
      var on = i === current;
      img.classList.toggle('is-on', on);
      if (on) {
        img.removeAttribute('aria-hidden');
      } else {
        img.setAttribute('aria-hidden', 'true');
      }
    });
    if (instant) hero.style.setProperty('--hero-fade', '0.01s');
    sample(slides[current]);
    if (instant) {
      // Restore the fade length on the next frame so later transitions stay slow.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          hero.style.removeProperty('--hero-fade');
        });
      });
    }
  }

  function tick() {
    show(current + 1, false);
    timer = setTimeout(tick, HOLD);
  }

  function start() {
    stop();
    timer = setTimeout(tick, HOLD);
  }

  function stop() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  var params = new URLSearchParams(window.location.search);
  var startAt = 0;
  var freeze = false;
  if (params.has('slide')) {
    startAt = parseInt(params.get('slide'), 10);
    if (isNaN(startAt)) startAt = 0;
    startAt = Math.max(0, Math.min(slides.length - 1, startAt));
    freeze = true;
  }

  slides.forEach(function (img) {
    if (!img.complete) img.addEventListener('load', function () {
      if (img === slides[current]) sample(img);
    });
  });

  show(startAt, true);
  if (!freeze && !reduce) {
    if (slides[0].complete) start();
    else slides[0].addEventListener('load', start);
  }

  window.__heroGo = function (i, keep) {
    stop();
    show(i, !keep);
    if (keep && !reduce) start();
  };
})();
