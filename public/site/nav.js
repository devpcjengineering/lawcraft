// เมนูมือถือ (ปุ่มแฮมเบอร์เกอร์) สำหรับหน้าสาธารณะที่ไม่มีสคริปต์ของตัวเอง เช่น /contact/ และ /privacy/
const burger = document.getElementById('burger'), links = document.getElementById('navLinks');
if (burger && links) {
  const close = () => { links.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'เปิดเมนู'); };
  burger.addEventListener('click', () => { const o = links.classList.toggle('open'); burger.setAttribute('aria-expanded', String(o)); burger.setAttribute('aria-label', o ? 'ปิดเมนู' : 'เปิดเมนู'); });
  links.addEventListener('click', (e) => { if (e.target.tagName === 'A') close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && links.classList.contains('open')) { close(); burger.focus(); } });
}
