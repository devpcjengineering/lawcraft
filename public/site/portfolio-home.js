// หน้าแรก: ส่วน "ผลงานที่ผ่านมา" (#portfolio) — เติมผลงานแนะนำสูงสุด 3 รายการจาก law_data 'content-portfolio'
// ไม่มีผลงานที่เผยแพร่ (หรือโหลดไม่ได้) = ซ่อนทั้งส่วน (hidden) — ใส่ข้อความด้วย esc() เสมอ
import { loadContent } from '/site/content.js';
import { homeItems, yearLabel } from '/portfolio/model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sec = document.getElementById('portfolio');
const grid = document.getElementById('pfHome');
if (sec && grid) {
  loadContent('portfolio').then((raw) => {
    const items = homeItems(raw, 3);
    if (!items.length) { sec.hidden = true; return; }
    grid.innerHTML = items.map((it, i) => `<a class="pf-card${it.featured ? ' feat' : ''}" href="/portfolio/${esc(it.slug)}/" style="--i:${i}">
      ${it.images[0] ? `<img class="pf-img" src="${esc(it.images[0])}" alt="" loading="lazy">` : ''}
      <span class="pf-top"><span class="pf-cat">${esc(it.category || 'ผลงาน')}</span>${it.featured ? '<span class="pf-feat">ผลงานแนะนำ</span>' : ''}</span>
      <h3>${esc(it.title)}</h3><p>${esc(it.summary)}</p>
      ${it.outcome ? `<p class="pf-out"><b>ผลลัพธ์</b> ${esc(it.outcome)}</p>` : ''}
      <span class="pf-meta">${[it.role, it.court, yearLabel(it.year)].filter(Boolean).map(esc).join(' · ')}</span>
      ${it.anonymized ? '<span class="pf-anon">ปกปิดข้อมูลผู้รับบริการ</span>' : ''}
    </a>`).join('');
    grid.setAttribute('aria-busy', 'false');
    sec.hidden = false;
    sec.querySelectorAll('.reveal').forEach((el) => el.classList.add('in')); // ส่วนนี้ซ่อนตอน site.js ตั้ง observer จึงเผยเอง
  }).catch(() => { sec.hidden = true; });
}
