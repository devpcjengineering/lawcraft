// หน้าบทความ: รายการ (/articles/) อย่างเดียว — หน้าอ่านแต่ละบทความเป็นหน้า SSR ที่ /articles/<slug>/ (api/post.js)
// ลิงก์เดิมแบบ /articles/?a=<slug> ให้ vercel.json ตอบ 301 — ที่นี่มีทางสำรอง: ถ้ายังมี ?a= มาถึง ให้ย้ายไปพาธใหม่เอง
import config from '/site/config.js';
import { morphInto } from '/js/morph.js';
import { loadContent } from '/site/content.js';
import { mergeIndex, reviewKind, reviewInfo } from './merge.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = $('#main');
const BASE_TITLE = 'บทความกฎหมายคดีออนไลน์ · LawCraft by PKT';
const BASE_DESC = $('meta[name=description]')?.content || '';
const thDate = (iso) => { try { return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return iso || ''; } };
const articleHref = (slug) => `/articles/${esc(slug)}/`;

// ---------- ส่วนหัว/ท้ายร่วม ----------
document.querySelectorAll('[data-site=name]').forEach((e) => { e.textContent = config.legalName || config.name; });
{
  // ท้ายเว็บสร้างโดย /site/footer.js
  const burger = $('#burger'), links = $('#navLinks');
  const close = () => { links.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'เปิดเมนู'); };
  burger.addEventListener('click', () => { const o2 = links.classList.toggle('open'); burger.setAttribute('aria-expanded', String(o2)); burger.setAttribute('aria-label', o2 ? 'ปิดเมนู' : 'เปิดเมนู'); });
  links.addEventListener('click', (e) => { if (e.target.tagName === 'A') close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

// ---------- ข้อมูล ----------
const cache = new Map();
async function getJson(url) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  return p;
}
const getIndex = () => getJson('/articles-data/index.json');

// ชั้นที่แอดมินสร้าง/แก้ (ผ่านหน้า "จัดการเนื้อหา") — โหลดครั้งเดียวต่อการเปิดหน้า ไม่เคยโยน (ไม่มี = {})
let livep;
const getLive = () => (livep ||= loadContent('articles').catch(() => ({})));
let navId = 0; // เพิ่มทุกครั้งที่เริ่มวาดหน้าใหม่ ใช้ทิ้งผลของงานเก่าที่เสร็จช้า

function setMeta(title, desc) {
  document.title = title;
  const m = $('meta[name=description]');
  if (m) m.content = desc || BASE_DESC;
}

// ---------- รายการ ----------
// ป้ายสถานะการตรวจ: ร่าง = เหลือง · ตรวจแล้ว = เขียว · ตรวจแล้วโดยนักกฎหมาย = ฟ้า (ป้ายเล็กในการ์ด)
const RV_ICO = {
  draft: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="m14.5 7.5 3 3"/>',
  checked: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.6 2.6L16 9.5"/>',
  lawyer: '<path d="M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6l-7-3z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
};
const rvHtml = (status) => {
  if (!String(status || '').trim()) return '';
  const k = reviewKind(status), info = reviewInfo(status);
  return `<span class="ar-rv ${k}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${RV_ICO[k]}</svg>${esc(info.label)}</span>`;
};
const refsHtml = (a) => (a.refs?.length ? `<span class="ar-refs">${a.refs.map((r) => `<i>${esc(r)}</i>`).join('')}</span>` : '');
const CAT_ORDER = ['ภาพรวม', 'พยานหลักฐาน', 'ซื้อขายออนไลน์', 'หมิ่นประมาท', 'คุกคาม', 'ภาพส่วนตัว', 'สิทธิเยียวยา'];

async function showList() {
  const my = navId;
  setMeta(BASE_TITLE, BASE_DESC);
  main.innerHTML = '<div class="wrap"><div class="ar-skel" aria-busy="true"><i></i><i></i><i></i></div></div>';
  let list, sIdx = null;
  try { sIdx = await getIndex(); } catch { /* ไฟล์ตั้งต้นโหลดไม่ได้ → ลองใช้เฉพาะบทความที่แอดมินสร้าง */ }
  if (my !== navId) return;
  if (sIdx) list = sIdx;
  else { list = mergeIndex([], await getLive()); if (my !== navId) return; if (!list.length) return fail(); }
  const rank = (c) => { const i = CAT_ORDER.indexOf(c); return i < 0 ? 99 : i; };
  const catsOf = (l) => [...new Set(l.map((a) => a.category))].sort((a, b) => rank(a) - rank(b));
  let cats = catsOf(list);
  let cat = '', q = '';
  main.innerHTML = `<div class="wrap">
    <header class="ar-hero">
      <p class="eyebrow">บทความ</p>
      <h1>คดีออนไลน์ ฟ้องอย่างไร.<br><span class="grad">อธิบายเป็นภาษาคน.</span></h1>
      <p class="lead">ซื้อขายออนไลน์ ฉ้อโกง หมิ่นประมาท ข่มขู่ และภาพส่วนตัว — ทางเลือก ขั้นตอน หลักฐาน และกำหนดเวลา สำหรับผู้เสียหายที่ต้องการดำเนินคดีด้วยตนเอง</p>
    </header>
    <div class="search ar-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="arq" type="search" placeholder="ค้นหา เช่น ฉ้อโกง, แคปหน้าจอ, รีวิว" aria-label="ค้นหาบทความ" autocomplete="off"></div>
    <div class="chips" id="arcats" role="group" aria-label="กรองตามหมวด"></div>
    <p class="count" id="arcount" role="status" aria-live="polite"></p>
    <div class="ar-grid" id="argrid"></div>
  </div>`;
  const chipBox = $('#arcats');
  const drawChips = () => {
    chipBox.innerHTML = ['', ...cats].map((c) => `<button type="button" class="chip" aria-pressed="${c === cat}" data-c="${esc(c)}">${c ? esc(c) : 'ทั้งหมด'}</button>`).join('');
  };
  const draw = (replay = false) => {
    const n = q.trim().toLowerCase();
    const rows = list.filter((a) => (!cat || a.category === cat) && (!n || [a.title, a.subtitle, a.summary, ...(a.tags || [])].join(' ').toLowerCase().includes(n)));
    $('#arcount').textContent = rows.length ? `${rows.length} บทความ` : 'ไม่พบบทความที่ตรงกับคำค้น';
    // การ์ดเป็นลิงก์ธรรมดาไปหน้า SSR /articles/<slug>/ (ไม่ดักคลิก)
    const gridHtml = rows.map((a, i) => `<a class="ar-card" href="${articleHref(a.slug)}" style="--i:${Math.min(i, 8)}">
      <span class="ar-top"><span class="ar-cat">${esc(a.category)}</span>${rvHtml(a.reviewStatus)}</span>
      <h2>${esc(a.title)}</h2>
      <p>${esc(a.subtitle)}</p>
      ${refsHtml(a)}
      <span class="ar-meta">อ่าน ${esc(a.readMinutes)} นาที · ปรับปรุง ${esc(thDate(a.updated))}</span>
    </a>`).join('');
    // เปลี่ยนหมวด = เล่นแอนิเมชันเข้าทีละใบ; พิมพ์ค้นหา = แก้เฉพาะส่วนต่าง (ไม่กะพริบทุกตัวอักษร)
    if (replay) $('#argrid').innerHTML = gridHtml; else morphInto($('#argrid'), gridHtml, { mark: false });
  };
  drawChips(); draw(true);
  chipBox.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; drawChips(); draw(true); });
  $('#arq').addEventListener('input', (e) => { q = e.target.value; draw(); });
  // ข้อมูลสดจากหลังบ้านมาถึงทีหลัง: ถ้ารายการต่างจากที่ build ไว้ ค่อยแก้เฉพาะส่วนต่าง (ไม่ต่างก็ไม่แตะหน้า)
  if (sIdx) {
    getLive().then((lv) => {
      if (my !== navId) return;
      const merged = mergeIndex(sIdx, lv);
      if (JSON.stringify(merged) === JSON.stringify(list)) return;
      list = merged; cats = catsOf(list);
      if (cat && !cats.includes(cat)) cat = '';
      drawChips(); draw();
    });
  }
}

function fail() {
  main.innerHTML = '<div class="wrap"><div class="ar-empty"><h1>โหลดบทความไม่สำเร็จ</h1><p>ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่</p><button class="btn-pill primary" onclick="location.reload()">ลองใหม่</button></div></div>';
}

// ---------- เส้นทาง ----------
function route() {
  // ลิงก์เดิม /articles/?a=<slug> → หน้า SSR /articles/<slug>/ (ทางสำรองกรณี redirect ฝั่งเซิร์ฟเวอร์ไม่ทำงาน; คง #hash ไว้)
  const slug = new URLSearchParams(location.search).get('a');
  if (slug) { location.replace('/articles/' + encodeURIComponent(slug) + '/' + location.hash); return; }
  navId++;
  showList();
}

route();
