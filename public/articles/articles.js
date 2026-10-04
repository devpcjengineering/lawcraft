// หน้าบทความ: รายการ (/articles/) และหน้าอ่าน (/articles/?a=<slug>)
import config from '/site/config.js';
import { morphInto } from '/js/morph.js';
import { loadContent } from '/site/content.js';
import { mergeIndex, pickArticle, normArticle, needsResolve, reuseStaticRefs, resolveRefs, reviewKind, reviewInfo } from './merge.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = $('#main');
const BASE_TITLE = 'บทความกฎหมายคดีออนไลน์ · Law Craft';
const BASE_DESC = $('meta[name=description]')?.content || '';
const thDate = (iso) => { try { return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return iso || ''; } };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
const getArticle = (slug) => getJson(`/articles-data/${encodeURIComponent(slug)}.json`);

// ชั้นที่แอดมินสร้าง/แก้ (ผ่านหน้า "จัดการเนื้อหา") — โหลดครั้งเดียวต่อการเปิดหน้า ไม่เคยโยน (ไม่มี = {})
let livep;
const getLive = () => (livep ||= loadContent('articles').catch(() => ({})));
let navId = 0; // เพิ่มทุกครั้งที่เปลี่ยนหน้า ใช้ทิ้งผลของงานเก่าที่เสร็จช้า
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? u : '#');

function setMeta(title, desc) {
  document.title = title;
  const m = $('meta[name=description]');
  if (m) m.content = desc || BASE_DESC;
}

// ---------- รายการ ----------
// ป้ายสถานะการตรวจ: ร่าง = เหลือง · ตรวจแล้ว = เขียว · ตรวจแล้วโดยนักกฎหมาย = ฟ้า (full = ข้อความเต็มในหน้าอ่าน, ไม่ใช่ = ป้ายเล็กในการ์ด)
const RV_ICO = {
  draft: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="m14.5 7.5 3 3"/>',
  checked: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.6 2.6L16 9.5"/>',
  lawyer: '<path d="M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6l-7-3z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
};
const rvHtml = (status, full = false) => {
  if (!String(status || '').trim()) return '';
  const k = reviewKind(status), info = reviewInfo(status);
  return `<span class="ar-rv ${k}${full ? ' full' : ''}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${RV_ICO[k]}</svg>${esc(full ? info.note : info.label)}</span>`;
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
      <input id="arq" type="search" placeholder="ค้นหา เช่น ฉ้อโกง, แคปหน้าจอ, รีวิว, deepfake" aria-label="ค้นหาบทความ" autocomplete="off"></div>
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
    const gridHtml = rows.map((a, i) => `<a class="ar-card" href="/articles/?a=${esc(a.slug)}" data-slug="${esc(a.slug)}" style="--i:${Math.min(i, 8)}">
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
  prefetchOnHover($('#argrid'));
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

// ---------- หน้าอ่าน ----------
const calloutLabel = { warn: 'ข้อควรระวัง', tip: 'คำแนะนำ', law: 'ตัวบทสำคัญ' };

function sectionHtml(s) {
  const call = s.callout ? `<aside class="ar-callout ${esc(s.callout.type)}" role="note"><b>${esc(calloutLabel[s.callout.type] || 'หมายเหตุ')}</b><p>${esc(s.callout.text)}</p></aside>` : '';
  const tbl = s.table ? `<div class="ar-table"><table><thead><tr>${s.table.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  return `<section id="${esc(s.id)}" class="ar-sec"><h2>${esc(s.heading)}</h2>
    ${(s.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join('')}
    ${s.bullets?.length ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    ${tbl}${call}</section>`;
}

function relatedHtml(a) {
  if (!a.related?.length) return '';
  return `<section id="r-items" class="ar-sec"><h2>มาตราที่เกี่ยวข้อง</h2>
    <div class="ar-rel">${a.related.map((it) => `<article class="ar-rel-card">
      <div><b>${esc(it.law)} ม.${esc(it.section)}</b> <span class="ar-rel-name">${esc(it.name)}</span></div>
      ${it.penalty ? `<p><span>ระวางโทษ</span> ${esc(it.penalty)}</p>` : ''}
      ${it.limitation ? `<p><span>อายุความ</span> ${esc(it.limitation)}</p>` : ''}
      ${it.privateOffence ? '<p class="ar-flag">ความผิดต่อส่วนตัว — ต้องร้องทุกข์/ฟ้องภายใน 3 เดือนนับแต่รู้เรื่องและรู้ตัวผู้กระทำผิด</p>' : ''}
      ${it.verified ? '' : '<p class="ar-flag warn">ข้อมูลมาตรานี้ยังไม่ผ่านการตรวจกับแหล่งทางการ — ตรวจสอบตัวบทก่อนใช้</p>'}
      <a class="btn-pill ghost sm" href="/workspace/new/${it.kind === 'civil' ? 'civil' : 'criminal'}?charge=${encodeURIComponent(it.id)}">ร่างคำฟ้องข้อหานี้</a>
    </article>`).join('')}</div></section>`;
}

function precedentsHtml(a) {
  if (!a.precedents?.length) return '';
  return `<section id="r-prec" class="ar-sec"><h2>คำพิพากษาศาลฎีกาที่เกี่ยวข้อง</h2>
    <div class="ar-prec">${a.precedents.map((p) => `<article>
      <b>${esc(p.caseNo)}</b>${p.verified ? '' : ' <span class="ar-flag warn inline">ยังไม่ยืนยัน</span>'}
      <p class="ar-prec-topic">${esc(p.topic)}</p><p>${esc(p.holding)}</p>
      ${p.source ? `<a class="ar-src-link" href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">แหล่งอ้างอิง ↗</a>` : ''}
    </article>`).join('')}</div>
    <p class="fine">สรุปหลักด้วยถ้อยคำของเว็บไซต์ ไม่ใช่ข้อความเต็มของคำพิพากษา — ควรตรวจกับฉบับเต็มก่อนอ้างในศาล</p></section>`;
}

// แสดงบทความจากข้อมูลตั้งต้นทันที แล้วค่อยผสานข้อมูลสดจากหลังบ้าน (บทความที่แอดมินสร้าง/แก้/ซ่อน) เมื่อมาถึง
async function showArticle(slug) {
  const my = navId;
  main.innerHTML = '<div class="wrap"><div class="ar-skel" aria-busy="true"><i></i><i></i><i></i></div></div>';
  const [sa, sIdx] = await Promise.all([getArticle(slug).catch(() => null), getIndex().catch(() => null)]);
  if (my !== navId) return;
  let shown = null; // ลายเซ็นของสิ่งที่แสดงอยู่ (ใช้ตัดสินว่าข้อมูลสดต่างไหม)
  if (sa) {
    const a0 = normArticle(sa), l0 = sIdx || [];
    renderArticle(a0, l0, slug, false);
    shown = JSON.stringify([a0, l0]);
  }
  const applyLive = async () => {
    const lv = await getLive();
    if (my !== navId) return;
    let a = pickArticle(sa, lv, slug);
    if (!a) { if (shown || !sa) notFound(); return; }
    if (needsResolve(a, sa)) {
      // บทความที่แอดมินแก้รายการมาตรา/ฎีกา: หาข้อมูลเต็มจากฐานกฎหมายสาธารณะ (ถ้าโหลดไม่ได้ก็แสดงไปโดยไม่มีส่วนนั้น)
      try { const { loadLawData } = await import('/js/public-data.js'); a = { ...a, ...resolveRefs(a, await loadLawData()) }; } catch { a = { ...a, related: [], precedents: [] }; }
      if (my !== navId) return;
    } else a = reuseStaticRefs(a, sa);
    const l = mergeIndex(sIdx || [], lv);
    const sig = JSON.stringify([a, l]);
    if (sig === shown) return;
    renderArticle(a, l, slug, !!shown);
    shown = sig;
  };
  if (sa) { applyLive().catch(() => {}); return; } // หน้าขึ้นแล้ว ไม่ต้องรอ
  await applyLive().catch(() => notFound());
}

function renderArticle(a, list, slug, update) {
  setMeta(`${a.title} · Law Craft`, a.summary);
  const tocOpen = update ? $('.ar-toc details')?.open : null;

  const toc = [
    ...a.sections.map((s) => [s.id, s.heading]),
    ...(a.steps?.length ? [['r-steps', 'ขั้นตอนปฏิบัติ']] : []),
    ...(a.checklist ? [['r-check', a.checklist.title]] : []),
    ...(a.related?.length ? [['r-items', 'มาตราที่เกี่ยวข้อง']] : []),
    ...(a.precedents?.length ? [['r-prec', 'คำพิพากษาฎีกา']] : []),
    ...(a.faq?.length ? [['r-faq', 'คำถามที่พบบ่อย']] : []),
    ...(a.sources?.length ? [['r-src', 'แหล่งอ้างอิง']] : []),
  ];
  const i = list.findIndex((x) => x.slug === slug);
  const prev = i > 0 ? list[i - 1] : null, next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;

  const html = `<div class="wrap ar-read">
    <p class="ar-crumb"><a href="/articles/" data-list>← บทความทั้งหมด</a></p>
    <header class="ar-head">
      <span class="ar-cat">${esc(a.category)}</span>
      <h1>${esc(a.title)}</h1>
      <p class="ar-sub">${esc(a.subtitle)}</p>
      <p class="ar-meta">อ่านประมาณ ${esc(a.readMinutes)} นาที · ปรับปรุงล่าสุด ${esc(thDate(a.updated))}</p>
      ${String(a.reviewStatus || '').trim() ? `<p class="ar-review">${rvHtml(a.reviewStatus, true)}</p>` : ''}
    </header>
    <div class="ar-cols">
      <nav class="ar-toc" aria-label="สารบัญ"><details open><summary>สารบัญ</summary><ol>${toc.map(([id, h]) => `<li><a href="#${esc(id)}">${esc(h)}</a></li>`).join('')}</ol></details></nav>
      <article class="ar-body">
        <p class="ar-summary">${esc(a.summary)}</p>
        ${a.keyPoints?.length ? `<div class="ar-key"><b>ใจความสำคัญ</b><ul>${a.keyPoints.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></div>` : ''}
        ${a.sections.map(sectionHtml).join('')}
        ${a.steps?.length ? `<section id="r-steps" class="ar-sec"><h2>ขั้นตอนปฏิบัติ</h2><ol class="ar-steps">${a.steps.map((s) => `<li><b>${esc(s.title)}</b><p>${esc(s.detail)}</p></li>`).join('')}</ol></section>` : ''}
        ${a.checklist ? `<section id="r-check" class="ar-sec"><h2>${esc(a.checklist.title)}</h2><ul class="ar-check">${a.checklist.items.map((x) => `<li><label><input type="checkbox"> <span>${esc(x)}</span></label></li>`).join('')}</ul></section>` : ''}
        ${relatedHtml(a)}
        ${precedentsHtml(a)}
        ${a.faq?.length ? `<section id="r-faq" class="ar-sec"><h2>คำถามที่พบบ่อย</h2>${a.faq.map((f) => `<details class="ar-faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>` : ''}
        ${a.sources?.length ? `<section id="r-src" class="ar-sec"><h2>แหล่งอ้างอิง</h2><ul class="ar-sources">${a.sources.map((s) => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>${s.verified ? '' : ' <span class="ar-flag warn inline">ยังไม่ได้ตรวจเปิดอ่าน</span>'}</li>`).join('')}</ul></section>` : ''}
        <aside class="ar-disclaimer" role="note"><b>ข้อมูลทั่วไป ไม่ใช่คำปรึกษากฎหมาย</b><p>บทความนี้เขียนเพื่อให้ความรู้เบื้องต้น แต่ละคดีมีข้อเท็จจริงและกำหนดเวลาแตกต่างกัน กฎหมายและแนวคำพิพากษาอาจเปลี่ยนแปลง ควรตรวจสอบตัวบทฉบับปัจจุบันและปรึกษาทนายความหรือพนักงานสอบสวนก่อนตัดสินใจดำเนินการ</p></aside>
        <div class="ar-cta"><div><b>พร้อมร่างคำฟ้องแล้วหรือยัง</b><p>กรอกข้อมูลครั้งเดียว ระบบจัดทำคำฟ้อง คำขอท้ายฟ้อง และเอกสารประกอบตามแบบพิมพ์ศาล</p></div><a class="btn-pill primary" href="/workspace/">เข้าสู่ระบบร่างคำฟ้อง</a></div>
        <nav class="ar-pn" aria-label="บทความอื่น">
          ${prev ? `<a href="/articles/?a=${esc(prev.slug)}" data-slug="${esc(prev.slug)}"><small>← ก่อนหน้า</small>${esc(prev.title)}</a>` : '<span></span>'}
          ${next ? `<a href="/articles/?a=${esc(next.slug)}" data-slug="${esc(next.slug)}" class="r"><small>ถัดไป →</small>${esc(next.title)}</a>` : '<span></span>'}
        </nav>
      </article>
    </div></div>`;
  // อัปเดตจากข้อมูลสด = แก้เฉพาะส่วนต่าง (ตำแหน่งเลื่อน/ช่องติ๊กไม่หลุดถ้าเนื้อหาส่วนนั้นไม่เปลี่ยน)
  if (update) morphInto(main, html, { mark: false }); else main.innerHTML = html;
  structuredData(a);
  tocSpy();
  const det = $('.ar-toc details');
  if (update && tocOpen != null) det.open = tocOpen;
  else if (matchMedia('(max-width: 900px)').matches) det?.removeAttribute('open');
}

function structuredData(a) {
  document.getElementById('ar-ld')?.remove();
  const s = document.createElement('script');
  s.type = 'application/ld+json'; s.id = 'ar-ld';
  s.textContent = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.summary, inLanguage: 'th', dateModified: a.updated,
    author: { '@type': 'Organization', name: config.legalName }, publisher: { '@type': 'Organization', name: config.legalName },
  });
  document.head.appendChild(s);
}

let spy;
function tocSpy() {
  spy?.disconnect();
  const links = new Map([...document.querySelectorAll('.ar-toc a')].map((x) => [x.getAttribute('href').slice(1), x]));
  spy = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    links.forEach((l, id) => (id === e.target.id ? l.setAttribute('aria-current', 'true') : l.removeAttribute('aria-current')));
  }), { rootMargin: '-20% 0px -70% 0px' });
  links.forEach((_, id) => { const el = document.getElementById(id); if (el) spy.observe(el); });
}

function notFound() {
  setMeta(`ไม่พบบทความ · Law Craft`, '');
  main.innerHTML = '<div class="wrap"><div class="ar-empty"><h1>ไม่พบบทความนี้</h1><p>ลิงก์อาจผิด หรือบทความถูกย้ายแล้ว</p><a class="btn-pill primary" href="/articles/" data-list>ดูบทความทั้งหมด</a></div></div>';
}
function fail() {
  main.innerHTML = '<div class="wrap"><div class="ar-empty"><h1>โหลดบทความไม่สำเร็จ</h1><p>ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่</p><button class="btn-pill primary" onclick="location.reload()">ลองใหม่</button></div></div>';
}

// ---------- เส้นทาง ----------
function route(scroll = true) {
  navId++;
  const slug = new URLSearchParams(location.search).get('a');
  (slug ? showArticle(slug) : showList()).then(() => {
    if (!scroll) return;
    const h = location.hash.slice(1);
    const t = h && document.getElementById(h);
    if (t) t.scrollIntoView(); else window.scrollTo({ top: 0, behavior: 'auto' });
  });
}
function go(href) {
  history.pushState(null, '', href);
  document.body.classList.remove('ar-leave');
  route();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-slug], a[data-list]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});
window.addEventListener('popstate', () => route(false));

function prefetchOnHover(root) {
  root?.addEventListener('pointerover', (e) => { const a = e.target.closest('a[data-slug]'); if (a) getArticle(a.dataset.slug).catch(() => {}); });
}

route();
