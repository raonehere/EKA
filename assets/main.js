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
