// ข้อความหน้าเว็บที่แอดมินแก้จากหลังบ้าน (นโยบายความเป็นส่วนตัว · หน้าแรก · หน้าติดต่อ · ข้อสงวนสิทธิ์ท้ายเว็บ)
// หลักการเดียวกับ live-config.js: HTML ตั้งต้นแสดงทันที (SEO/ไม่มี JS ก็อ่านได้) → ถ้ามีข้อความที่แก้ไว้ใน law_data 'content-pages'
// จึงค่อยแทนที่เฉพาะช่องที่ถูกแก้ แคช sessionStorage 5 นาทีให้หน้าถัดไปแสดงทันทีโดยไม่กะพริบ — อ่านไม่ได้/ว่าง = ไม่เปลี่ยนอะไรเลย
// โครงข้อมูลและชื่อช่องดู live-pages-schema.js · องค์ประกอบในหน้าอ้างด้วย data-live="<หน้า>.<ช่อง>"
// ปลอดภัย: ใส่ข้อความด้วย textContent / createTextNode เท่านั้น (ไม่มี innerHTML จากข้อมูลของแอดมิน)
import { loadContent } from '/site/content.js';
import { cleanSections, MAX_TEXT, readText } from '/site/live-pages-schema.js';

const CACHE_KEY = 'lawcraft:content:pages';
const TTL = 5 * 60 * 1000;

const defaults = new Map();   // องค์ประกอบ → innerHTML ตั้งต้น (ของเราเอง เชื่อถือได้) ไว้คืนค่าเมื่อแอดมินล้างช่อง
let applied = '{}';           // สถานะที่แสดงอยู่ (JSON) — เริ่มต้น = HTML ตั้งต้น
let secKey = '';              // หัวข้อนโยบายที่แสดงอยู่ (JSON) กันวาดซ้ำ
let secBase = null;           // { box, boxHtml, toc, tocHtml } ของ HTML ตั้งต้น
let disclaimer = null, disclaimerDef = null;

/** ใส่ข้อความล้วน ขึ้นบรรทัดใหม่เป็น <br> */
function setLines(el, text) {
  el.textContent = '';
  String(text).split('\n').forEach((line, i) => {
    if (i) el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(line));
  });
}
const text = (v) => (typeof v === 'string' && v.trim() ? v.replace(/\r\n?/g, '\n').slice(0, MAX_TEXT).trim() : '');

function setField(el, val) {
  if (val) {
    if (!defaults.has(el)) defaults.set(el, el.innerHTML);
    setLines(el, val);
  } else if (defaults.has(el)) {
    el.innerHTML = defaults.get(el); defaults.delete(el);
  }
}

function el(tag, txt, attrs) {
  const n = document.createElement(tag);
  if (txt != null) setLines(n, txt);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function applySections(raw) {
  const box = document.querySelector('[data-live-sections]');
  if (!box) return;
  const toc = document.querySelector('[data-live-toc]');
  if (!secBase) secBase = { box, boxHtml: box.innerHTML, toc, tocHtml: toc ? toc.innerHTML : '' };
  const secs = cleanSections(raw);
  const key = JSON.stringify(secs);
  if (key === secKey) return;
  secKey = key;
  if (!secs.length) {
    box.innerHTML = secBase.boxHtml;
    if (toc) toc.innerHTML = secBase.tocHtml;
  } else {
    const frag = document.createDocumentFragment();
    secs.forEach((s, i) => {
      frag.appendChild(el('h2', `${i + 1}. ${s.heading}`.replace(/\s+$/, ''), { id: s.id }));
      s.paragraphs.forEach((p) => frag.appendChild(el('p', p)));
      if (s.bullets.length) { const ul = el('ul'); s.bullets.forEach((b) => ul.appendChild(el('li', b))); frag.appendChild(ul); }
      s.after.forEach((p) => frag.appendChild(el('p', p)));
    });
    box.textContent = ''; box.appendChild(frag);
    if (toc) {
      const f2 = document.createDocumentFragment();
      secs.forEach((s) => { if (!s.heading) return; const li = el('li'); const a = el('a', s.heading, { href: '#' + s.id }); li.appendChild(a); f2.appendChild(li); });
      toc.textContent = ''; toc.appendChild(f2);
    }
  }
  try { window.__tocSpy?.(); } catch { /* ข้าม */ }
}

/** ข้อสงวนสิทธิ์ท้ายเว็บ: footer.js วาดท้ายเว็บใหม่เองหลังโหลดค่าสำนักงาน → คอยใส่ข้อความที่แก้ซ้ำเมื่อถูกวาดทับ */
function enforceDisclaimer() {
  const node = document.querySelector('.sf-legal');
  if (!node) return;
  if (disclaimer) {
    if (disclaimerDef == null) disclaimerDef = node.innerHTML;
    if (readText(node) !== disclaimer) setLines(node, disclaimer);
  } else if (disclaimerDef != null) {
    node.innerHTML = disclaimerDef; disclaimerDef = null;
  }
}
let footerWatch = null;
function watchFooter() {
  const foot = document.getElementById('siteFooter');
  if (!foot || footerWatch) return;
  footerWatch = new MutationObserver(enforceDisclaimer);
  footerWatch.observe(foot, { childList: true, subtree: true, characterData: true });
}

function apply(d) {
  const data = d && typeof d === 'object' ? d : {};
  document.querySelectorAll('[data-live]').forEach((node) => {
    const [page, field] = node.dataset.live.split('.');
    setField(node, text(data[page]?.[field]));
  });
  document.querySelectorAll('[data-live-hide]').forEach((node) => {
    const [page, field] = node.dataset.liveHide.split('.');
    node.style.display = data[page]?.[field] === true ? 'none' : '';
  });
  disclaimer = text(data.site?.disclaimer) || null;
  enforceDisclaimer(); watchFooter();
  applySections(data.privacy?.sections);
}

function run(d) {
  const s = JSON.stringify(d || {});
  if (s === applied) return;
  applied = s;
  try { apply(d); } catch (e) { console.warn('live-pages', e); }
}

function readCache() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (raw && Date.now() - raw.t < TTL && raw.d && typeof raw.d === 'object') return raw.d;
  } catch { /* ไม่มีแคช */ }
  return null;
}

function start() {
  const cached = readCache();
  if (cached) run(cached);           // แสดงทันทีจากแคช ไม่รอเครือข่าย
  watchFooter();
  loadContent('pages').then((fresh) => {
    const has = (o) => o && typeof o === 'object' && Object.keys(o).length > 0;
    // loadContent คืน {} ทั้งเมื่อ "ยังไม่มีข้อมูล" และ "อ่านไม่ได้" — ถ้าแคชยังสดและมีข้อความอยู่ ให้คงไว้ (ล้างจริงจะมีผลเมื่อแคชหมดอายุ ≤ 5 นาที)
    if (!has(fresh) && has(cached)) return;
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: fresh || {} })); } catch { /* ข้าม */ }
    run(fresh);
  });
}

start();
