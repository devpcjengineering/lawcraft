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
