// หน้าผลงาน: รายการ (/portfolio/) และหน้ารายละเอียด (/portfolio/?p=<slug>) — ข้อมูลจาก law_data 'content-portfolio' ที่แอดมินลงไว้
// แสดงเฉพาะ published && consent (ดู /portfolio/model.js) · ใส่ข้อมูลด้วย esc() เสมอ (ข้อความล้วนจากแอดมิน)
import config from '/site/config.js';
import { loadContent } from '/site/content.js';
import { publicItems, yearLabel } from './model.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = $('#main');
const BRAND = config.legalName || config.name || 'LawCraft by PKT';
const BASE_TITLE = document.title;
const BASE_DESC = $('meta[name=description]')?.content || '';
const HERO = $('.pf-hero')?.outerHTML || '';
const DISCLAIMER = 'ผลงานที่แสดงเป็นตัวอย่างจากข้อเท็จจริงของแต่ละเรื่อง ผลของคดีขึ้นอยู่กับพยานหลักฐานและข้อเท็จจริงเฉพาะกรณี ไม่ใช่การรับประกันว่าเรื่องของคุณจะได้ผลเช่นเดียวกัน ข้อมูลผู้รับบริการถูกปกปิดและเผยแพร่โดยได้รับความยินยอมแล้ว';

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

function cardHtml(it, i) {
  return `<a class="pf-card${it.featured ? ' feat' : ''}" href="/portfolio/?p=${esc(it.slug)}" data-p="${esc(it.slug)}" style="--i:${Math.min(i, 8)}">
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

// ---------- หน้ารายละเอียด ----------
async function showItem(slug) {
  const my = navId;
  main.innerHTML = '<div class="wrap"><div class="pf-skel" aria-busy="true"><i></i><i></i><i></i></div></div>';
  const list = await getList();
  if (my !== navId) return;
  const i = list.findIndex((x) => x.slug === slug);
  if (i < 0) return notFound();
  const it = list[i], prev = i > 0 ? list[i - 1] : null, next = i < list.length - 1 ? list[i + 1] : null;
  setMeta(`${it.title} · ${BRAND}`, it.summary);
  main.innerHTML = `<div class="wrap pf-read">
    <p class="pf-crumb"><a href="/portfolio/" data-list>← ผลงานทั้งหมด</a></p>
    <header class="pf-head">
      <span class="pf-top"><span class="pf-cat">${esc(it.category || 'ผลงาน')}</span>${it.featured ? '<span class="pf-feat">ผลงานแนะนำ</span>' : ''}</span>
      <h1>${esc(it.title)}</h1>
      ${it.summary ? `<p class="pf-sub">${esc(it.summary)}</p>` : ''}
      <p class="pf-meta">${metaLine(it)}</p>
      ${anonHtml(it)}
    </header>
    <article class="pf-body">
      ${it.images.length ? `<div class="pf-gallery">${it.images.map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</div>` : ''}
      ${it.body.map((p) => `<p>${esc(p)}</p>`).join('')}
      ${it.outcome ? `<section class="pf-outcome"><h2>ผลลัพธ์</h2><p>${esc(it.outcome)}</p></section>` : ''}
      ${it.tags.length ? `<p class="pf-tags">${it.tags.map((x) => `<i>${esc(x)}</i>`).join('')}</p>` : ''}
      <aside class="pf-note" role="note"><b>ข้อมูลทั่วไป ไม่ใช่การรับประกันผล</b><p>${esc(DISCLAIMER)}</p></aside>
      ${ctaHtml()}
      <nav class="pf-pn" aria-label="ผลงานอื่น">
        ${prev ? `<a href="/portfolio/?p=${esc(prev.slug)}" data-p="${esc(prev.slug)}"><small>← ก่อนหน้า</small>${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a href="/portfolio/?p=${esc(next.slug)}" data-p="${esc(next.slug)}" class="r"><small>ถัดไป →</small>${esc(next.title)}</a>` : '<span></span>'}
      </nav>
    </article>
  </div>`;
  structuredItem(it);
}

function structuredList(list) {
  document.getElementById('pf-ld')?.remove();
  const s = document.createElement('script');
  s.type = 'application/ld+json'; s.id = 'pf-ld';
  s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'ผลงานที่ผ่านมา', numberOfItems: list.length,
    itemListElement: list.slice(0, 20).map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.title, url: `${location.origin}/portfolio/?p=${encodeURIComponent(it.slug)}` })) });
  document.head.appendChild(s);
}
function structuredItem(it) {
  document.getElementById('pf-ld')?.remove();
  const s = document.createElement('script');
  s.type = 'application/ld+json'; s.id = 'pf-ld';
  s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: it.title, description: it.summary, inLanguage: 'th', dateModified: it.updatedAt,
    about: it.category, author: { '@type': 'Organization', name: BRAND }, publisher: { '@type': 'Organization', name: BRAND } });
  document.head.appendChild(s);
}

function notFound() {
  setMeta(`ไม่พบผลงาน · ${BRAND}`, '');
  main.innerHTML = '<div class="wrap"><div class="pf-empty"><h1>ไม่พบผลงานนี้</h1><p>ลิงก์อาจผิด หรือผลงานถูกนำออกแล้ว</p><a class="btn-pill primary" href="/portfolio/" data-list>ดูผลงานทั้งหมด</a></div></div>';
}

// ---------- เส้นทาง ----------
function route(scroll = true) {
  navId++;
  const slug = new URLSearchParams(location.search).get('p');
  (slug ? showItem(slug) : showList()).then(() => { if (scroll) window.scrollTo({ top: 0, behavior: 'auto' }); });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-p], a[data-list]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  history.pushState(null, '', a.getAttribute('href'));
  route();
});
window.addEventListener('popstate', () => route(false));
route();
