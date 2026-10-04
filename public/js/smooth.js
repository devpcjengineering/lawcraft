// เปิดหน้าเมื่อฟอนต์พร้อม (หรือครบ 1.4 วินาที) เพื่อไม่ให้ตัวอักษรกระโดดตอนโหลด — ใช้คู่กับ css/smooth.css
(function () {
  var d = document.documentElement;
  if (!d.classList.contains('fw')) return;
  var done = function () { d.classList.add('fr'); };
  var wait = new Promise(function (r) { setTimeout(r, 1400); });
  if (document.fonts && document.fonts.load) {
    var fams = ['400 16px "Noto Sans Thai"', '600 16px "Noto Sans Thai"', '400 16px Sarabun', '600 16px Sarabun'];
    Promise.race([Promise.all(fams.map(function (f) { return document.fonts.load(f, 'ก').catch(function () {}); })), wait]).then(done, done);
  } else done();
  setTimeout(done, 2200);
})();

// ไม่จำตำแหน่ง: รีโหลดแล้วเริ่มที่บนสุดของหน้าเสมอ และไม่เก็บ #หัวข้อ ไว้ใน URL (ลิงก์ภายในหน้าเลื่อนไปที่หัวข้อโดยไม่ใส่ #)
(function () {
  if (/^\/admin(\/|$)/.test(location.pathname)) return;
  try { history.scrollRestoration = 'manual'; } catch (e) { /* ข้าม */ }
  var id = function (h) { try { return decodeURIComponent(h.replace(/^#/, '')); } catch (e) { return ''; } };
  var go = function (name) { var el = name && document.getElementById(name); if (!el) return false; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; };
  var h = id(location.hash);
  if (location.hash) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ข้าม */ } }
  if (h) { var tries = 0; (function t() { if (go(h) || ++tries > 25) return; setTimeout(t, 120); })(); } else { window.scrollTo(0, 0); }
  window.addEventListener('pageshow', function (e) { if (e.persisted) window.scrollTo(0, 0); });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button || a.target) return;
    var u; try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.origin !== location.origin || !u.hash || u.pathname !== location.pathname || u.search !== location.search) return;
    if (go(id(u.hash))) e.preventDefault();
  });
})();

// เบราว์เซอร์ที่ยังไม่รองรับ View Transitions ข้ามหน้า (เช่น Firefox/Safari เก่า): จางออกก่อนเปลี่ยนหน้า — หน้าใหม่จางเข้าเองจาก body opacity
(function () {
  if (/^\/admin(\/|$)/.test(location.pathname) || 'onpageswap' in window) return;
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button || a.target || a.hasAttribute('download') || a.hasAttribute('data-slug') || a.hasAttribute('data-list')) return;
    var u; try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.origin !== location.origin || u.pathname + u.search === location.pathname + location.search) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    document.body.style.transition = 'opacity .18s ease';
    document.body.style.opacity = '0';
    setTimeout(function () { location.href = a.href; }, 170);
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) document.body.style.opacity = ''; });
})();