// หน้าผลงาน: รายการ (/portfolio/) อย่างเดียว — หน้ารายละเอียดแต่ละชิ้นเป็นหน้า SSR ที่ /portfolio/<slug>/ (api/post.js) · ข้อมูลจาก law_data 'content-portfolio' ที่แอดมินลงไว้
// ลิงก์เดิมแบบ /portfolio/?p=<slug> ให้ vercel.json ตอบ 301 — ที่นี่มีทางสำรอง: ถ้ายังมี ?p= มาถึง ให้ย้ายไปพาธใหม่เอง
// แสดงเฉพาะ published && consent (ดู /portfolio/model.js) · ใส่ข้อมูลด้วย esc() เสมอ (ข้อความล้วนจากแอดมิน)
import { loadContent } from '/site/content.js';
import { publicItems, yearLabel } from './model.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = $('#main');
const BASE_TITLE = document.title;
const BASE_DESC = $('meta[name=description]')?.content || '';
const HERO = $('.pf-hero')?.outerHTML || '';
const DISCLAIMER = 'ผลงานที่แสดงเป็นตัวอย่างจากข้อเท็จจริงของแต่ละเรื่อง ผลของคดีขึ้นอยู่กับพยานหลักฐานและข้อเท็จจริงเฉพาะกรณี ไม่ใช่การรับประกันว่าเรื่องของคุณจะได้ผลเช่นเดียวกัน ข้อมูลผู้รับบริการถูกปกปิดและเผยแพร่โดยได้รับความยินยอมแล้ว';
const itemHref = (slug) => `/portfolio/${esc(slug)}/`;

let listP;
const getList = () => (listP ||= loadContent('portfolio').then(publicItems).catch(() => []));
let navId = 0;

function setMeta(title, desc) {
  document.title = title;
  const m = $('meta[name=description]');
  if (m) m.content = desc || BASE_DESC;
}
const anonHtml = (it) => (it.anonymized ? '<span class="pf-anon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.5 10.5 0 0 1 12 5c5 0 9 4 10 7a11 11 0 0 1-2.4 3.6M6.5 6.5C4.2 7.9 2.7 9.9 2 12c1 3 5 7 10 7 1.5 0 2.9-.3 4.1-.9"/></svg>ปกปิดข้อมูลผู้รับบริการ</span>' : '');
const metaLine = (it) => [it.role, it.court, yearLabel(it.year)].filter(Boolean).map(esc).join(' · ');

// การ์ดเป็นลิงก์ธรรมดาไปหน้า SSR /portfolio/<slug>/ (ไม่ดักคลิก)
function cardHtml(it, i) {
  return `<a class="pf-card${it.featured ? ' feat' : ''}" href="${itemHref(it.slug)}" style="--i:${Math.min(i, 8)}">
    ${it.images[0] ? `<img class="pf-img" src="${esc(it.images[0])}" alt="" loading="lazy">` : ''}
    <span class="pf-top"><span class="pf-cat">${esc(it.category || 'ผลงาน')}</span>${it.featured ? '<span class="pf-feat">ผลงานแนะนำ</span>' : ''}</span>
    <h2>${esc(it.title)}</h2>
    <p>${esc(it.summary)}</p>
    ${it.outcome ? `<p class="pf-out"><b>ผลลัพธ์</b> ${esc(it.outcome)}</p>` : ''}
    <span class="pf-meta">${metaLine(it)}</span>
    ${anonHtml(it)}
  </a>`;
}

// ---------- รายการ ----------
async function showList() {
  const my = navId;
  setMeta(BASE_TITLE, BASE_DESC);
  main.innerHTML = `<div class="wrap">${HERO}<div class="pf-skel" aria-busy="true"><i></i><i></i><i></i></div></div>`;
  const list = await getList();
  if (my !== navId) return;
  if (!list.length) {
    main.innerHTML = `<div class="wrap">${HERO}
      <div class="pf-empty"><h2>กำลังรวบรวมผลงาน</h2><p>เรากำลังขอความยินยอมจากผู้รับบริการเพื่อนำเรื่องที่ผ่านมามาเล่าอย่างปกปิดข้อมูล ระหว่างนี้อ่านแนวทางได้จากบทความ หรือเล่าเรื่องของคุณให้เราตรวจสอบเบื้องต้น</p>
      <div class="pf-empty-acts"><a class="btn-pill primary" href="/contact/">ปรึกษาเรื่องของคุณ</a><a class="btn-pill ghost" href="/articles/">อ่านบทความ</a></div></div>
      ${ctaHtml()}</div>`;
    return;
  }
  const cats = [...new Set(list.map((a) => a.category).filter(Boolean))];
  let cat = '';
  main.innerHTML = `<div class="wrap">${HERO}
    <div class="chips pf-chips" id="pfcats" role="group" aria-label="กรองตามหมวด"></div>
    <p class="count" id="pfcount" role="status" aria-live="polite"></p>
    <div class="pf-grid" id="pfgrid"></div>
    <aside class="pf-note" role="note"><b>หมายเหตุ</b><p>${esc(DISCLAIMER)}</p></aside>
    ${ctaHtml()}
  </div>`;
  const chipBox = $('#pfcats');
  const drawChips = () => { chipBox.innerHTML = ['', ...cats].map((c) => `<button type="button" class="chip" aria-pressed="${c === cat}" data-c="${esc(c)}">${c ? esc(c) : 'ทั้งหมด'}</button>`).join(''); };
  const draw = () => {
    const rows = list.filter((a) => !cat || a.category === cat);
    $('#pfcount').textContent = rows.length ? `${rows.length} ผลงาน` : 'ไม่มีผลงานในหมวดนี้';
    $('#pfgrid').innerHTML = rows.map(cardHtml).join('');
  };
  drawChips(); draw();
  chipBox.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; drawChips(); draw(); });
  structuredList(list);
}

const ctaHtml = () => `<div class="pf-cta"><div><b>มีเรื่องคล้ายกัน?</b><p>เล่าเรื่องโดยย่อให้เราตรวจสอบเบื้องต้น แล้วติดต่อกลับตามช่องทางที่คุณให้ไว้ — การส่งข้อความไม่ใช่การว่าจ้างทนายความ และไม่ใช่การรับประกันผลของคดี</p></div><a class="btn-pill light" href="/contact/">ปรึกษาเรื่องคล้ายกัน</a></div>`;

function structuredList(list) {
  document.getElementById('pf-ld')?.remove();
  const s = document.createElement('script');
  s.type = 'application/ld+json'; s.id = 'pf-ld';
  s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'ผลงานที่ผ่านมา', numberOfItems: list.length,
    itemListElement: list.slice(0, 20).map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.title, url: `${location.origin}/portfolio/${encodeURIComponent(it.slug)}/` })) });
  document.head.appendChild(s);
}

// ---------- เส้นทาง ----------
function route() {
  // ลิงก์เดิม /portfolio/?p=<slug> → หน้า SSR /portfolio/<slug>/ (ทางสำรองกรณี redirect ฝั่งเซิร์ฟเวอร์ไม่ทำงาน; คง #hash ไว้)
  const slug = new URLSearchParams(location.search).get('p');
  if (slug) { location.replace('/portfolio/' + encodeURIComponent(slug) + '/' + location.hash); return; }
  navId++;
  showList();
}
route();
