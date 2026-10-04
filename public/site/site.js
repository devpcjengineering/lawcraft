import config from './config.js';
import { loadLawData, loadGeo, loadJurisdiction } from '/js/public-data.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('th-TH');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// localStorage ที่ปลอดภัย (โหมดส่วนตัว / ถูกบล็อก อาจ throw)
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

document.querySelectorAll('[data-site=name]').forEach((e) => { e.textContent = config.legalName || config.name; });
document.title = `${config.name} · ${config.legalName || ''} — กฎหมายไทย ฐานความรู้ และระบบร่างคำฟ้อง`;

// ท้ายเว็บ + ข้อมูลสำนักงาน (JSON-LD) สร้างโดย /site/footer.js ร่วมกันทุกหน้า

// ---- nav ----
const burger = $('#burger'), links = $('#navLinks');
const closeMenu = () => { links.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'เปิดเมนู'); };
burger.addEventListener('click', () => { const o = links.classList.toggle('open'); burger.setAttribute('aria-expanded', String(o)); burger.setAttribute('aria-label', o ? 'ปิดเมนู' : 'เปิดเมนู'); });
links.addEventListener('click', (e) => { if (e.target.tagName === 'A') closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && links.classList.contains('open')) { closeMenu(); burger.focus(); } });

// scrollspy: ไฮไลต์เมนูตามส่วนที่กำลังดูอยู่
{
  const linkFor = new Map([...links.querySelectorAll('a[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    linkFor.forEach((a, id) => { if (id === e.target.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  }), { rootMargin: '-45% 0px -50% 0px' });
  linkFor.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  const hero = $('.hero');
  if (hero) new IntersectionObserver((es) => { if (es[0].isIntersecting) linkFor.forEach((a) => a.removeAttribute('aria-current')); }, { rootMargin: '-45% 0px -50% 0px' }).observe(hero);
}

// ---- reveal on scroll ----
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
const observeReveal = () => document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el));
observeReveal();

// ---- ตราชั่งกฎหมาย: scroll parallax + ตราชั่งสมดุลเมื่อเลื่อนลง ----
const heroScales = $('#heroScales');
if (heroScales && !reduceMotion.matches) {
  let queued = false;
  const MAX_AMP = 6; // องศา
  const update = () => {
    queued = false;
    const p = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.7)));
    heroScales.style.setProperty('--p', p.toFixed(3));
    heroScales.style.setProperty('--amp-live', `${(MAX_AMP * (1 - p) * (1 - p)).toFixed(2)}deg`);
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}
// ตราชั่งเล็กในหัวข้อเขตอำนาจศาล (โคลนจากตัวหลัก เล่นแอนิเมชันเมื่อเลื่อนมาถึง)
{
  const src = $('#scalesHero'), head = $('#jurisdiction .sec-head');
  if (src && head) {
    const mini = src.cloneNode(true);
    mini.removeAttribute('id'); mini.removeAttribute('role'); mini.removeAttribute('aria-label');
    mini.setAttribute('aria-hidden', 'true');
    mini.classList.remove('play'); mini.classList.add('mini');
    mini.querySelectorAll('defs, title').forEach((n) => n.remove()); // ใช้ gradient จากตัวหลัก
    const box = document.createElement('div');
    box.className = 'mini-scales'; box.appendChild(mini);
    head.insertBefore(box, head.firstChild);
    new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { mini.classList.add('play'); o.disconnect(); } }, { threshold: 0.6 }).observe(box);
  }
}

// ---- data ----
let data, dataFailed = false;
try {
  data = await loadLawData();
  { const h = Number(data.layout?.all?.['brand.site']); if (h >= 12 && h <= 64) document.documentElement.style.setProperty('--logo-h', h + 'px'); }
} catch { dataFailed = true; data = { laws: [], items: [], procedure: {}, courts: { groups: [] } }; }
const lawById = new Map((data.laws || []).map((l) => [l.id, l]));
const procLaws = new Map(((data.procedure || {}).laws || []).map((l) => [l.id, l]));
const lawShort = (id) => lawById.get(id)?.short || procLaws.get(id)?.short || id;
const lawName = (id) => lawById.get(id)?.name || procLaws.get(id)?.name || id;

// รวมข้อหา/มูลคดี + มาตราวิธีพิจารณา เป็นรายการเดียว
const entries = [
  ...(data.items || []).map((it) => ({
    key: it.id, lawId: it.lawId, section: it.section, title: it.name, category: it.category || '', kind: it.kind,
    body: it.text || '', it,
  })),
  ...((data.procedure || {}).sections || []).map((s) => ({
    key: s.id, lawId: s.law, section: s.section, title: s.title, category: 'วิธีพิจารณา', kind: 'proc', body: s.summary || '', proc: s,
  })),
];
const secNum = (s) => parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0;

// ---- stats ----
const courts = (data.courts?.groups || []).flatMap((g) => g.courts || []);
const stats = [
  [entries.length, 'มาตราและมูลคดี'],
  [new Set(entries.map((e) => e.lawId)).size, 'ฉบับกฎหมาย'],
  [courts.length, 'ศาลทั่วประเทศ'],
  [77, 'จังหวัด'],
];
$('#stats').innerHTML = stats.map(([n, l]) => `<div class="stat"><b data-n="${n}">0</b><span>${l}</span></div>`).join('');
function countUp() {
  document.querySelectorAll('.stat b').forEach((el) => {
    const to = +el.dataset.n; const t0 = performance.now();
    if (reduceMotion.matches) { el.textContent = fmt(to); return; }
    const tick = (t) => { const p = Math.min(1, (t - t0) / 1100); el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}
new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { countUp(); o.disconnect(); } }, { threshold: 0.4 }).observe($('#stats'));

// ---- library ----
let activeLaw = 'all', activeKind = 'all', query = '', shown = 24;
const lawOrder = ['pc', 'cc', 'pvor', 'pvpe'];
const lawRank = (id) => (lawOrder.indexOf(id) < 0 ? 99 : lawOrder.indexOf(id));
const KINDS = [['all', 'ทั้งหมด'], ['criminal', 'อาญา'], ['civil', 'แพ่ง'], ['proc', 'วิธีพิจารณา']];
const inKind = (e) => activeKind === 'all' || e.kind === activeKind;
/** ตัวกรอง 2 ชั้น: ประเภท (แถบเดียว) → กฎหมายหลัก 4 ฉบับเป็นชิป ที่เหลือรวมในเมนู "กฎหมายอื่น ๆ" */
function chips() {
  const counts = new Map();
  entries.filter(inKind).forEach((e) => counts.set(e.lawId, (counts.get(e.lawId) || 0) + 1));
  if (activeLaw !== 'all' && !counts.has(activeLaw)) activeLaw = 'all';
  const main = lawOrder.filter((id) => counts.has(id));
  const others = [...counts.keys()].filter((id) => !lawOrder.includes(id)).sort((x, y) => (lawShort(x) || '').localeCompare(lawShort(y) || '', 'th'));
  const total = entries.filter(inKind).length;
  const chip = (id, label, n) => `<button class="chip" aria-pressed="${id === activeLaw}" data-law="${esc(id)}" title="${esc(id === 'all' ? 'ทุกฉบับ' : lawName(id))}">${esc(label)}<small>${n}</small></button>`;
  const otherOn = others.includes(activeLaw);
  $('#chips').innerHTML = `<div class="kindseg" role="group" aria-label="ประเภทกฎหมาย">${KINDS.map(([k, l]) => `<button type="button" data-kind="${k}" aria-pressed="${k === activeKind}">${l}</button>`).join('')}</div>
    <div class="lawrow">${chip('all', 'ทุกฉบับ', total)}${main.map((id) => chip(id, lawShort(id) || lawName(id), counts.get(id))).join('')}
    ${others.length ? `<label class="pillsel ${otherOn ? 'on' : ''}"><span class="sr">กฎหมายอื่น ๆ</span><select id="otherLaw" aria-label="กฎหมายอื่น ๆ">
      <option value="">กฎหมายอื่น ๆ (${others.length})</option>${others.map((id) => `<option value="${esc(id)}" ${id === activeLaw ? 'selected' : ''}>${esc(lawShort(id) || lawName(id))} — ${esc(lawName(id))} (${counts.get(id)})</option>`).join('')}</select></label>` : ''}</div>`;
}
function filtered() {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => inKind(e) && (activeLaw === 'all' || e.lawId === activeLaw) &&
    (!q || `${e.section} ${e.title} ${e.category} ${e.body} ${lawShort(e.lawId)}`.toLowerCase().includes(q)))
    .sort((a, b) => lawRank(a.lawId) - lawRank(b.lawId) || secNum(a.section) - secNum(b.section));
}
let animFrom = 0; // การ์ดลำดับตั้งแต่นี้เป็นต้นไปจะค่อย ๆ ปรากฏ (กด “แสดงเพิ่มเติม” ไม่เล่นซ้ำของเดิม)
function renderResults() {
  const list = filtered(), box = $('#results');
  box.setAttribute('aria-busy', 'false');
  if (dataFailed) {
    box.innerHTML = '<div class="empty"><p>โหลดข้อมูลมาตรากฎหมายไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองใหม่</p><button class="btn-pill ghost" data-act="reload">ลองใหม่</button></div>';
    $('#resCount').textContent = ''; $('#moreBtn').hidden = true; return;
  }
  if (!entries.length) {
    box.innerHTML = '<div class="empty"><p>กำลังจัดทำฐานข้อมูลมาตรากฎหมาย — กลับมาดูอีกครั้งเร็ว ๆ นี้</p></div>';
    $('#resCount').textContent = ''; $('#moreBtn').hidden = true; return;
  }
  box.innerHTML = list.slice(0, shown).map((e, i) => `<button class="card${i >= animFrom ? ' pop' : ''}" style="--i:${Math.min(Math.max(i - animFrom, 0), 10)}" data-key="${esc(e.key)}">
      <span class="law"><span class="tag ${e.kind === 'civil' ? 'civil' : e.kind === 'criminal' ? 'crim' : ''}">${e.kind === 'civil' ? 'แพ่ง' : e.kind === 'criminal' ? 'อาญา' : ['pvor', 'pvpe'].includes(e.lawId) ? 'วิธีพิจารณา' : 'บททั่วไป'}</span>${esc(lawShort(e.lawId))}</span>
      <span class="sec-no"><small>มาตรา</small>${esc(e.section)}</span>
      <h3>${esc(e.title)}</h3>${e.body ? `<p>${esc(e.body)}</p>` : ''}</button>`).join('')
    || `<div class="empty"><p>ไม่พบรายการที่ตรงกับ${query.trim() ? ` “${esc(query.trim())}”` : 'ตัวกรองนี้'}<br><span class="fine">ลองใช้คำค้นอื่น เลขมาตรา หรือชื่อข้อหา</span></p><button class="btn-pill ghost" data-act="clear">ล้างการค้นหา</button></div>`;
  $('#resCount').textContent = list.length ? (list.length > shown ? `แสดง ${fmt(shown)} จาก ${fmt(list.length)} รายการ` : `${fmt(list.length)} รายการ`) : '';
  $('#moreBtn').hidden = list.length <= shown;
}
$('#chips').addEventListener('click', (e) => {
  const k = e.target.closest('[data-kind]');
  if (k) { activeKind = k.dataset.kind; shown = 24; chips(); renderResults(); return; }
  const b = e.target.closest('.chip');
  if (b) { activeLaw = b.dataset.law; shown = 24; chips(); renderResults(); }
});
$('#chips').addEventListener('change', (e) => {
  if (e.target.id !== 'otherLaw') return;
  activeLaw = e.target.value || 'all'; shown = 24; chips(); renderResults();
});
let qTimer;
$('#q').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { query = e.target.value; shown = 24; renderResults(); }, 120); });
$('#moreBtn').addEventListener('click', () => { animFrom = shown; shown += 24; renderResults(); animFrom = 0; });
chips(); renderResults();

// ---- detail sheet ----
const sheet = $('#sheet');
const dl = (rows) => `<dl>${rows.filter(([, v]) => v && (!Array.isArray(v) || v.length)).map(([k, v]) => `<dt>${k}</dt><dd>${esc(Array.isArray(v) ? v.join(' • ') : v)}</dd>`).join('')}</dl>`;
$('#results').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  if (act) {
    if (act.dataset.act === 'reload') location.reload();
    if (act.dataset.act === 'clear') { query = ''; activeLaw = 'all'; activeKind = 'all'; shown = 24; $('#q').value = ''; chips(); renderResults(); $('#q').focus(); }
    return;
  }
  const card = e.target.closest('.card'); if (!card) return;
  const en = entries.find((x) => x.key === card.dataset.key); if (!en) return;
  const it = en.it, s = en.proc;
  let html = `<div class="detail"><span class="law" style="color:var(--ink-3);font-size:14px">${esc(lawName(en.lawId))}</span>
    <h3 id="sheetTitle">มาตรา ${esc(en.section)} ${esc(en.title)}</h3>`;
  if (it) {
    html += dl([
      ['ตัวบท / สาระ', it.text],
      ['ระวางโทษ', it.penalty], ['องค์ประกอบ', it.elements],
      ['ประเภทคำขอ', it.claimType], ['ดอกเบี้ย', it.interest], ['ก่อนฟ้องต้อง', it.prerequisites], ['หลักฐานที่ต้องมี', it.evidenceChecklist], ['ค่าขึ้นศาล', it.courtFeeNote],
      ['อายุความ', it.limitation],
      ['มาตราที่อ้างประกอบ', (it.relatedSections || []).map((r) => typeof r === 'string' ? r : `${r.ref}${r.why ? ' (' + r.why + ')' : ''}`)],
    ]);
    const flags = [it.privateOffence && '<span class="tag warn">ความผิดต่อส่วนตัว — ต้องร้องทุกข์/ฟ้องภายใน 3 เดือน (ป.อ. มาตรา 96)</span>', it.compoundable && '<span class="tag warn">ยอมความได้</span>'].filter(Boolean).join(' ');
    if (flags) html += `<div class="box">${flags}</div>`;
    if (it.caution) html += `<div class="box">⚠ ${esc(it.caution)}</div>`;
    html += `<p class="fine" style="margin-top:16px">${it.verified === false ? 'ข้อมูลนี้ยังไม่ผ่านการตรวจกับแหล่งทางการ โปรดตรวจสอบตัวบทก่อนใช้' : 'ตรวจกับแหล่งอ้างอิงแล้ว'}${it.source ? ' · แหล่งอ้างอิง: ' + (/^https?:/.test(it.source) ? `<a href="${esc(it.source)}" target="_blank" rel="noopener">${esc(new URL(it.source).hostname)}</a>` : esc(it.source)) : ''}</p>`;
    html += `<div class="cta"><a class="btn-pill primary" href="/admin/">ใช้ข้อหานี้ร่างคำฟ้อง</a></div>`;
  } else if (s) {
    html += dl([['สาระสำคัญ', s.summary], ['ใช้ในเอกสาร', s.usedIn]]);
    html += `<p class="fine" style="margin-top:16px">${s.verified === false ? 'ยังไม่ผ่านการตรวจกับแหล่งทางการ' : 'ตรวจกับแหล่งอ้างอิงแล้ว'}${s.source ? ' · ' + (/^https?:/.test(s.source) ? `<a href="${esc(s.source)}" target="_blank" rel="noopener">แหล่งอ้างอิง</a>` : esc(s.source)) : ''}</p>`;
  }
  $('#sheetBody').innerHTML = html + '</div>';
  sheet.showModal();
});
$('#sheetClose').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

// ---- process ----
const FALLBACK = [
  { title: 'ยื่นคำฟ้อง', detail: 'โจทก์ยื่นคำฟ้องพร้อมบัญชีพยานและเอกสารที่เกี่ยวข้องต่อศาลที่มีเขตอำนาจ', ref: 'ป.วิ.อ. มาตรา 158' },
  { title: 'ไต่สวนมูลฟ้อง', detail: 'ศาลนัดไต่สวนมูลฟ้อง โจทก์นำพยานเข้าสืบเพื่อให้เห็นว่าคดีมีมูล จำเลยมีสิทธิ์ถามค้านพยานโจทก์ได้', ref: 'ป.วิ.อ. มาตรา 162' },
  { title: 'ประทับฟ้อง', detail: 'ถ้าคดีมีมูล ศาลประทับฟ้องไว้พิจารณา และออกหมายเรียกหรือหมายจับจำเลย', ref: '' },
  { title: 'สอบคำให้การ', detail: 'ศาลอ่านและอธิบายฟ้องให้จำเลยฟัง สอบถามว่าจะรับสารภาพหรือไม่', ref: 'ป.วิ.อ. มาตรา 172' },
  { title: 'สืบพยาน', detail: 'โจทก์และจำเลยนำพยานเข้าสืบตามลำดับที่ศาลกำหนด', ref: '' },
  { title: 'พิพากษา', detail: 'ศาลพิพากษาคดี คู่ความมีสิทธิ์อุทธรณ์ ฎีกาตามกฎหมาย', ref: '' },
];
{
  const path = (data.procedure || {}).criminalCasePath;
  const pSteps = Array.isArray(path) ? path : path?.steps;
  const steps = pSteps?.length ? pSteps : FALLBACK;
  $('#steps').innerHTML = steps.map((s) => `<li class="reveal"><h3>${esc(s.title)}</h3><p>${esc(s.detail || '')}</p>${s.ref ? `<p class="ref">${esc(s.ref)}</p>` : ''}</li>`).join('');
  observeReveal();
}

// ================= เขตอำนาจศาล =================
const LS_J = 'th-law:jurisdiction:v1';
const RULES = {
  criminal: [
    ['ศาลที่ความผิดเกิดขึ้น', 'ให้ฟ้องคดีอาญา ณ ศาลที่ความผิดได้เกิดขึ้นในเขตอำนาจ หรือศาลที่จำเลยมีที่อยู่ในเขตอำนาจ หรือศาลที่ผู้ต้องหาถูกจับในเขตอำนาจ', 'ป.วิ.อ. มาตรา 22'],
    ['ศาลแขวง', 'คดีอาญาที่มีอัตราโทษจำคุกไม่เกิน 3 ปี หรือปรับไม่เกิน 60,000 บาท หรือทั้งจำทั้งปรับ อยู่ในอำนาจศาลแขวง ตรวจสอบเกณฑ์ตามกฎหมายฉบับปัจจุบัน', 'พ.ร.บ.จัดตั้งศาลแขวงฯ'],
    ['ไต่สวนมูลฟ้อง', 'ราษฎรเป็นโจทก์ฟ้องเอง ศาลต้องไต่สวนมูลฟ้องก่อนว่าคดีมีมูลหรือไม่ แล้วจึงประทับฟ้อง', 'ป.วิ.อ. มาตรา 28(2), 162'],
  ],
  civil: [
    ['ศาลที่จำเลยมีภูมิลำเนา', 'ให้เสนอคำฟ้องต่อศาลที่จำเลยมีภูมิลำเนาอยู่ในเขตศาล หรือต่อศาลที่มูลคดีเกิดขึ้นในเขตศาล', 'ป.วิ.พ. มาตรา 4 ทวิ'],
    ['อสังหาริมทรัพย์', 'คดีเกี่ยวกับอสังหาริมทรัพย์ ฟ้องต่อศาลที่ทรัพย์สินตั้งอยู่ในเขตศาล ตรวจสอบมาตราที่เกี่ยวข้องกับกฎหมายฉบับปัจจุบัน', 'ป.วิ.พ. หมวดเขตอำนาจศาล'],
    ['ศาลแขวง (แพ่ง)', 'คดีที่มีทุนทรัพย์ไม่เกินเกณฑ์ที่กฎหมายกำหนด อยู่ในอำนาจศาลแขวง ตรวจสอบเกณฑ์ตามกฎหมายฉบับปัจจุบัน', 'พ.ร.บ.จัดตั้งศาลแขวงฯ'],
  ],
};

const J = { jt: 'criminal', prov: '', dist: '', sub: '' };
const provSel = $('#prov'), distSel = $('#dist'), subSel = $('#sub'), resetBtn = $('#jReset'), courtOut = $('#courtOut');
let provinces = [];            // geo.provinces
let jur = null;                // /api/jurisdiction (ถ้ามี)
const allCourts = (data.courts?.groups || []).flatMap((g) => (g.courts || []).map((c) => ({ ...c, group: g.group || '' })));

const THAI = '\\u0E00-\\u0E7F';
const nameHasProv = (n, p) => new RegExp(`${p}(?![${THAI}])`).test(n);
const stripPrefix = (s) => String(s).replace(/^(?:จังหวัด|อำเภอ|เขต|อ\.)\s*/, '').trim();
const wording = (p) => (p?.kind === 'bkk' ? { d: 'เขต', s: 'แขวง', prov: '' } : { d: 'อำเภอ', s: 'ตำบล', prov: 'จังหวัด' });
const curProv = () => provinces.find((p) => p.name === J.prov);
const curDist = () => curProv()?.districts.find((d) => d.name === J.dist);
const curSub = () => curDist()?.subs.find((s) => s.name === J.sub);

function saveJ() { store.set(LS_J, { jt: J.jt, prov: J.prov, dist: J.dist, sub: J.sub }); }

function renderRules() {
  $('#rules').innerHTML = RULES[J.jt].map(([h, p, r]) => `<div class="rule reveal"><h3>${esc(h)}</h3><p>${esc(p)}</p><p class="fine" style="margin-top:8px">${esc(r)}</p></div>`).join('');
  observeReveal();
  $('#provHint').textContent = J.jt === 'criminal' ? 'ที่เกิดเหตุ / ที่อยู่จำเลย' : 'ภูมิลำเนาจำเลย / ที่เกิดมูลคดี';
}

function setSel(sel, placeholder, names, current, disabled) {
  sel.innerHTML = `<option value="">${esc(placeholder)}</option>` + names.map((n, i) => `<option value="${i}"${n === current ? ' selected' : ''}>${esc(n)}</option>`).join('');
  sel.disabled = disabled;
  if (!current) sel.value = '';
}
function syncSelects() {
  const p = curProv(), W = wording(p), d = curDist();
  // หัวช่องเขียนเต็ม “อำเภอ/เขต” และ “ตำบล/แขวง” เสมอ (ในผลลัพธ์ใช้คำที่ถูกต้องตามจังหวัด: กรุงเทพฯ = เขต/แขวง)
  $('#distLabel').textContent = 'อำเภอ/เขต';
  $('#subLabel').textContent = 'ตำบล/แขวง';
  if (!p) setSel(distSel, 'เลือกจังหวัดก่อน', [], '', true);
  else setSel(distSel, `เลือก${W.d}…`, p.districts.map((x) => x.name), J.dist, false);
  if (!d) setSel(subSel, p ? `เลือก${W.d}ก่อน` : 'เลือกอำเภอ / เขตก่อน', [], '', true);
  else setSel(subSel, `ไม่ระบุ${W.s}`, d.subs.map((x) => x.name), J.sub, false);
  resetBtn.hidden = !J.prov;
}

// ---- jurisdiction.json ----
function jurLists(p, d) {
  if (!jur?.provinces || !p) return { jp: null, jd: null };
  const key = Object.keys(jur.provinces).find((k) => stripPrefix(k) === stripPrefix(p.name));
  const jp = key ? jur.provinces[key] : null;
  if (!jp) return { jp: null, jd: null };
  let jd = null;
  if (d && jp.districts) {
    const dk = Object.keys(jp.districts).find((k) => stripPrefix(k) === stripPrefix(d.name));
    if (dk && Array.isArray(jp.districts[dk]) && jp.districts[dk].length) jd = jp.districts[dk];
  }
  return { jp: Array.isArray(jp.default) && jp.default.length ? jp : { ...jp, default: [] }, jd };
}

// ---- จับคู่ศาลจากชื่อ ----
const compat = (c) => c.scope !== 'appeal' && !(c.scope === 'criminal' && J.jt === 'civil') && !(c.scope === 'civil' && J.jt === 'criminal');
const catOf = (c) => (/เยาวชนและครอบครัว/.test(c.name) ? 'youth' : (c.type === 'ศาลแขวง' || /^ศาลแขวง/.test(c.name)) ? 'mag' : c.scope === 'special' ? 'special' : 'main');
const placeOf = (n) => n.replace(/^ศาล(?:เยาวชนและครอบครัวจังหวัด|เยาวชนและครอบครัว|จังหวัด|แขวง|แพ่ง|อาญา)/, '');
function districtMatches(courtName, distName) {
  const place = placeOf(courtName);
  if (!place) return false;
  const full = distName.trim(), bare = full.replace(/^เมือง(?=.)/, '');
  if (place === full || place === bare) return true;
  return new RegExp(`^${full}(?:เหนือ|ใต้|ตะวันออก|ตะวันตก|กลาง)$`).test(place);
}
function nameMatchCourts(p, d) {
  const bkk = p.kind === 'bkk';
  const inProv = (c) => (bkk ? (/กรุงเทพมหานคร/.test(c.group) || (c.scope === 'special' && /กลาง/.test(c.name))) : nameHasProv(c.name, p.name));
  const set = new Set(allCourts.filter((c) => compat(c) && inProv(c)));
  if (d) {
    // ศาลที่ชื่อเป็นอำเภอ/เขต แต่ไม่มีชื่อจังหวัด (เช่น ศาลจังหวัดเทิง) — ค้นในภาคเดียวกันและกลุ่มศาลเพิ่มเติม
    const regions = new Set(allCourts.filter((c) => /^ศาลชั้นต้น/.test(c.group) && inProv(c)).map((c) => c.group));
    allCourts.forEach((c) => { if (!set.has(c) && compat(c) && (regions.has(c.group) || /เพิ่มเติม/.test(c.group)) && districtMatches(c.name, d.name)) set.add(c); });
  }
  const list = [...set].map((c) => ({ ...c, cat: catOf(c), hl: !!d && districtMatches(c.name, d.name) }));
  return list.sort((a, b) => b.hl - a.hl);
}

// ---- สร้างผลลัพธ์ ----
const SCOPE_TXT = { criminal: 'รับคดีอาญา', civil: 'รับคดีแพ่ง' };
function courtCard(c, i, W) {
  const badges = [];
  if (c.verified === true) badges.push('<span class="badge ok">ยืนยันแล้ว</span>');
  else if (c.verified === false) badges.push('<span class="badge pending">ยังไม่ยืนยัน</span>');
  if (c.hl) badges.push(`<span class="badge match">ชื่อตรงกับ${W.d}ที่เลือก</span>`);
  const sub = [c.phone ? `โทร ${c.phone}` : '', SCOPE_TXT[c.scope], c.note].filter(Boolean);
  return `<div class="court${c.hl ? ' hl' : ''}" style="--i:${i}"><span class="cn">${esc(c.name)}</span>${badges.length ? `<span>${badges.join(' ')}</span>` : ''}${sub.map((s) => `<small>${esc(s)}</small>`).join('')}</div>`;
}
function section(title, list, W, ctx) {
  if (!list.length) return '';
  const i = ctx.n++;
  return `<section class="jsec${ctx.minor ? ' minor' : ''}" style="--i:${i}"><h4>${esc(title)}</h4><div class="court-list">${list.map((c, k) => courtCard(c, k, W)).join('')}</div></section>`;
}
function buildBody(p, d) {
  const W = wording(p), where = p.kind === 'bkk' ? p.name : `จังหวัด${p.name}`;
  const caseTxt = J.jt === 'criminal' ? 'คดีอาญา' : 'คดีแพ่ง';
  const { jp, jd } = jurLists(p, d);
  const named = nameMatchCourts(p, d);
  const ctx = { n: 0, minor: false };
  let html = '', count = 0;

  const jurFiltered = (arr) => arr.filter(compat).map((c) => ({ ...c, cat: catOf(c) }));
  const minors = (exclude) => {
    const skip = new Set(exclude.map((c) => c.name));
    const pick = (cat) => named.filter((c) => c.cat === cat && !skip.has(c.name));
    ctx.minor = true;
    const mag = pick('mag'), youth = pick('youth'), sp = pick('special');
    count += mag.length + youth.length + sp.length;
    return section(`ศาลแขวงใน${where}`, mag, W, ctx) + section('ศาลเยาวชนและครอบครัว', youth, W, ctx) + section('ศาลชำนัญพิเศษ', sp, W, ctx);
  };

  const jdAll = jd ? jd.map((c) => ({ ...c, cat: c.scope === 'appeal' || c.type === 'appeal' ? 'appeal' : catOf(c) })).filter((c) => c.cat === 'appeal' || compat(c)) : [];
  if (jdAll.length) {
    // 1) มีข้อมูลรายอำเภอ (ระบบสืบค้นเขตอำนาจศาลของสำนักงานศาลยุติธรรม) — แสดงตามหมวดศาล ไม่เติมศาลจากการเทียบชื่อ
    count += jdAll.length;
    const by = (cat) => jdAll.filter((c) => c.cat === cat);
    html += section(`ศาลชั้นต้นที่มีเขตอำนาจใน${W.d}นี้`, by('main'), W, ctx);
    ctx.minor = true;
    html += section('ศาลแขวง', by('mag'), W, ctx) + section('ศาลเยาวชนและครอบครัว', by('youth'), W, ctx)
      + section('ศาลชำนัญพิเศษ', by('special'), W, ctx) + section('ศาลอุทธรณ์', by('appeal'), W, ctx);
    const asOf = jur?.asOf ? new Date(jur.asOf + 'T00:00:00').toLocaleDateString('th-TH', { dateStyle: 'long' }) : '';
    html += `<div class="jwarn">ข้อมูลจากระบบสืบค้นเขตอำนาจศาลของสำนักงานศาลยุติธรรม${asOf ? ` ณ ${asOf}` : ''} อาจไม่รวมศาลที่จัดตั้งหรือเปลี่ยนแปลงเขตอำนาจภายหลังจากนั้น ตรวจสอบกับศาลหรือสำนักงานศาลยุติธรรมก่อนยื่นฟ้องทุกครั้ง</div>`;
  } else if (jp?.default?.length) {
    // 2) มีเฉพาะศาลหลักของจังหวัด
    const def = jurFiltered(jp.default);
    count += def.length;
    html += section('ศาลหลักของจังหวัด', def, W, ctx);
    const hasDistData = jp.districts && Object.keys(jp.districts).length;
    html += `<div class="jwarn">${d
      ? `ยังไม่มีข้อมูลเขตอำนาจรายอำเภอสำหรับ${W.d}${esc(d.name)} ศาลข้างต้นเป็นศาลหลักของจังหวัด ศาลอื่นในจังหวัดอาจมีเขตอำนาจเหนือ${W.d}นี้ โปรดตรวจสอบกับสำนักงานศาลยุติธรรม`
      : hasDistData ? `เลือก${W.d}เพื่อดูศาลที่มีเขตอำนาจเฉพาะพื้นที่ ข้อมูลข้างต้นเป็นศาลหลักของจังหวัดเท่านั้น` : 'ยังไม่มีข้อมูลเขตอำนาจรายอำเภอ ข้อมูลข้างต้นเป็นศาลหลักของจังหวัดเท่านั้น'}</div>`;
    html += minors(def);
  } else {
    // 3) fallback: จับคู่ชื่อศาล
    const main = named.filter((c) => c.cat === 'main');
    count += main.length;
    html += main.length
      ? section(`ศาลชั้นต้นที่รับฟ้อง${caseTxt}ในพื้นที่`, main, W, ctx)
      : `<p class="fine" style="margin:18px 0 0">ไม่พบศาลในรายการสำหรับ${esc(where)} — โปรดตรวจสอบกับสำนักงานศาลยุติธรรม</p>`;
    const hits = named.filter((c) => c.hl).length;
    html += `<div class="jwarn">ยังไม่มีข้อมูลเขตอำนาจรายอำเภอ ระบบจับคู่จากชื่อศาลในจังหวัดเท่านั้น${d ? (hits ? ` ศาลที่ชื่อตรงกับ${W.d}${esc(d.name)}ถูกไฮไลต์ไว้ก่อน แต่ไม่ได้ยืนยันว่า${W.d}นี้อยู่ในเขตศาลนั้น` : ` ไม่พบศาลที่ชื่อตรงกับ${W.d}${esc(d.name)}`) : ` เลือก${W.d}เพื่อไฮไลต์ศาลที่ชื่อตรงกับพื้นที่`} โปรดตรวจสอบกับสำนักงานศาลยุติธรรม</div>`;
    html += minors([]);
  }
  return { html, count };
}

let bodyKey = '';
function renderResult() {
  const p = curProv();
  if (!p) {
    bodyKey = '';
    courtOut.innerHTML = `<p class="jhint">${provinces.length ? 'เริ่มจากเลือกจังหวัด แล้วเลือกอำเภอ / เขต เพื่อดูศาลที่มีเขตอำนาจ' : ''}</p>`;
    $('#jStatus').textContent = '';
    return;
  }
  const W = wording(p), d = curDist(), s = curSub();
  const where = p.kind === 'bkk' ? p.name : `จังหวัด${p.name}`;
  const addr = [s && `${W.s}${s.name}`, d && `${W.d}${d.name}`, where].filter(Boolean).join(' ');
  let zip = '';
  if (s?.zip) zip = s.zip;
  else if (d) { const z = [...new Set(d.subs.map((x) => x.zip).filter(Boolean))]; zip = z.length > 3 ? `${z.slice(0, 3).join(', ')} …` : z.join(', '); }

  let card = $('#jcard');
  if (!card) {
    courtOut.innerHTML = '<div class="jcard" id="jcard"><div class="jhead" id="jhead"></div><div id="jbody"></div></div>';
    card = $('#jcard'); bodyKey = '';
  }
  $('#jhead').innerHTML = `<div><span class="k">ที่อยู่ที่เลือก · ${J.jt === 'criminal' ? 'คดีอาญา' : 'คดีแพ่ง'}</span>
    <p class="addr">${s ? `<span class="muted">${esc(W.s)}</span>${esc(s.name)} ` : ''}${d ? `<span class="muted">${esc(W.d)}</span>${esc(d.name)} ` : ''}${p.kind === 'bkk' ? '' : '<span class="muted">จังหวัด</span>'}${esc(p.name)}</p></div>${zip ? `<span class="zip">รหัสไปรษณีย์ <b>${esc(zip)}</b></span>` : ''}`;

  const { html, count } = buildBody(p, d);
  const key = `${J.jt}|${J.prov}|${J.dist}|${html}`;
  if (key !== bodyKey) { bodyKey = key; $('#jbody').innerHTML = html; }
  $('#jStatus').textContent = `${addr} — แสดงศาล ${count} รายการ`;
}

function onChange() { syncSelects(); renderResult(); saveJ(); }
document.querySelectorAll('input[name=jt]').forEach((r) => r.addEventListener('change', () => { if (!r.checked) return; J.jt = r.value; renderRules(); renderResult(); saveJ(); }));
const pick = (sel, arr) => (sel.value === '' ? '' : arr?.[+sel.value]?.name ?? '');
provSel.addEventListener('change', () => { J.prov = pick(provSel, provinces); J.dist = ''; J.sub = ''; onChange(); });
distSel.addEventListener('change', () => { J.dist = pick(distSel, curProv()?.districts); J.sub = ''; onChange(); });
subSel.addEventListener('change', () => { J.sub = pick(subSel, curDist()?.subs); onChange(); });
resetBtn.addEventListener('click', () => { J.prov = J.dist = J.sub = ''; setProvOptions(); onChange(); provSel.focus(); });

function setProvOptions() {
  provSel.innerHTML = '<option value="">เลือกจังหวัด…</option>' + provinces.map((p, i) => `<option value="${i}"${p.name === J.prov ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  provSel.disabled = !provinces.length;
  if (!J.prov) provSel.value = '';
}

async function initJurisdiction() {
  provSel.disabled = true;
  const [geo, jr] = await Promise.all([
    loadGeo().catch(() => null),
    loadJurisdiction(),
  ]);
  jur = jr;
  provinces = Array.isArray(geo?.provinces) ? geo.provinces : [];
  if (!provinces.length) {
    provSel.innerHTML = '<option value="">โหลดรายชื่อจังหวัดไม่สำเร็จ</option>';
    courtOut.innerHTML = '<div class="jhint"><p style="margin:0 0 10px">โหลดข้อมูลจังหวัดไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองใหม่</p><button class="btn-pill ghost sm" id="geoRetry">ลองใหม่</button></div>';
    $('#geoRetry').addEventListener('click', initJurisdiction);
    return;
  }
  // คืนค่าล่าสุด (ตรวจว่ายังมีอยู่ในข้อมูล)
  const saved = store.get(LS_J);
  if (saved.jt === 'criminal' || saved.jt === 'civil') J.jt = saved.jt;
  const sp = provinces.find((p) => p.name === saved.prov);
  if (sp) {
    J.prov = sp.name;
    const sd = sp.districts.find((d) => d.name === saved.dist);
    if (sd) { J.dist = sd.name; if (sd.subs.some((s) => s.name === saved.sub)) J.sub = saved.sub; }
  }
  document.querySelectorAll('input[name=jt]').forEach((r) => { r.checked = r.value === J.jt; });
  renderRules(); setProvOptions(); syncSelects(); renderResult();
}
renderRules();
renderResult();
initJurisdiction();

// ---- คดีออนไลน์: เลือกสถานการณ์ → สิ่งที่ควรทำก่อน + บทความที่เกี่ยวข้อง ----
// เนื้อหาเป็นข้อมูลทั่วไป ไม่รับประกันผล; กำหนด 3 เดือนใช้เฉพาะความผิดต่อส่วนตัว (ป.อ. มาตรา 96)
const SITUATIONS = [
  { k: 'fraud', topic: 'trading', slug: 'online-trading-fraud', title: 'ถูกหลอกโอนเงินซื้อของ', hint: 'โอนแล้วไม่ได้ของ ร้านหาย บล็อก',
    icon: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>',
    first: ['หยุดโอนเงินเพิ่ม แม้ถูกเร่งให้จ่าย “ค่าปลดล็อก” หรือ “ค่าธรรมเนียม”', 'เก็บสลิป แชต หน้าโปรไฟล์/โพสต์ร้าน และเลขบัญชีปลายทางไว้ก่อนถูกลบ', 'แจ้งธนาคารโดยเร็วเพื่อขอระงับธุรกรรม แล้วแจ้งความให้มีบันทึกเหตุการณ์'],
    paths: ['แจ้งความ', 'ฟ้องฉ้อโกงเอง', 'ฟ้องแพ่งเรียกเงินคืน'],
    time: 'ฉ้อโกงทั่วไปเป็นความผิดต่อส่วนตัว ต้องร้องทุกข์หรือฟ้องภายใน 3 เดือนนับแต่รู้เรื่องและรู้ตัวผู้กระทำ ถ้าไม่แน่ใจ ให้ถือว่ามีกำหนดนี้ไว้ก่อน' },
  { k: 'defame', topic: 'defamation', slug: 'online-defamation', title: 'ถูกด่าหรือใส่ร้ายในโซเชียล', hint: 'โพสต์ รีวิว กลุ่มไลน์ ที่ทำให้เสียชื่อเสียง',
    icon: '<path d="M4 5.5h16v10.5H10l-5 4v-4H4z"/><path d="M8.5 10h7"/>',
    first: ['อย่าโพสต์ตอบโต้หรือประจานกลับ เพราะอาจทำให้ตัวเองถูกฟ้องได้', 'แคปโพสต์/คอมเมนต์ให้เห็นชื่อบัญชี ลิงก์ วันเวลา และจำนวนคนที่เห็น', 'จดไทม์ไลน์ว่าเห็นครั้งแรกเมื่อใด และรู้ว่าใครเป็นผู้ทำเมื่อใด'],
    paths: ['แจ้งความ', 'ฟ้องหมิ่นประมาทเอง', 'ขอให้ลบเนื้อหา', 'ฟ้องแพ่งเรียกค่าเสียหาย'],
    time: 'หมิ่นประมาทเป็นความผิดต่อส่วนตัว ต้องร้องทุกข์หรือฟ้องภายใน 3 เดือนนับแต่รู้เรื่องและรู้ตัวผู้กระทำ' },
  { k: 'threat', topic: 'threat', slug: 'online-threat-harassment', title: 'ถูกข่มขู่ รีดเงิน หรือคุกคาม', hint: 'ขู่แฉ ขู่ทำร้าย ปลอมบัญชี ทวงหนี้ประจาน',
    icon: '<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17v.01"/>',
    first: ['อย่าจ่ายเงินตามที่ถูกขู่ เพราะมักไม่จบและถูกเรียกเพิ่ม', 'อย่าลบแชต เก็บข้อความ เสียง เบอร์/บัญชีผู้ขู่ และหลักฐานการโอน (ถ้ามี)', 'แจ้งความโดยเร็ว หากรู้สึกไม่ปลอดภัยให้ขอความช่วยเหลือทันที'],
    paths: ['แจ้งความ', 'ฟ้องคดีอาญาเอง', 'ขอคุ้มครอง/ลบข้อมูล'],
    time: 'กรรโชก/รีดเอาทรัพย์ไม่ใช่ความผิดต่อส่วนตัว แต่บางฐานในเหตุการณ์เดียวกัน เช่น ข่มขืนใจวรรคแรก เป็นความผิดต่อส่วนตัว (3 เดือน) จึงควรนับเวลาแยกตามแต่ละฐาน' },
  { k: 'images', topic: 'intimate', slug: 'intimate-images', title: 'ภาพส่วนตัวถูกเผยแพร่หรือขู่แฉ', hint: 'ภาพ/คลิปส่วนตัว ภาพตัดต่อ deepfake',
    icon: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-4.6-4.6L7 19.5"/>',
    first: ['แคปหลักฐานไว้ก่อนแจ้งลบ (ลิงก์ ชื่อบัญชี วันเวลา) แต่อย่าแชร์ภาพต่อ', 'รายงานแพลตฟอร์มให้ลบ และอย่าจ่ายเงินให้ผู้ขู่ เพราะอาจถูกเรียกซ้ำ', 'แจ้งความ และขอคำแนะนำจากผู้เชี่ยวชาญหากเป็นภาพของผู้เยาว์'],
    paths: ['แจ้งความ', 'ขอลบ/ระงับเนื้อหา', 'ฟ้องคดีอาญา/แพ่ง'],
    time: 'บางฐาน เช่น ภาพตัดต่อตาม พ.ร.บ.คอมพิวเตอร์ มาตรา 16 และหมิ่นประมาท เป็นความผิดต่อส่วนตัว (3 เดือน) ส่วนฐานอื่นไม่ใช่ จึงควรรีบดำเนินการ' },
  { k: 'shop', topic: 'civil', slug: 'online-trading-civil', title: 'ร้านไม่ส่งของ หรือส่งไม่ตรงปก', hint: 'ส่งช้า สินค้าไม่ตรงโฆษณา ไม่คืนเงิน',
    icon: '<path d="M3.5 7.8 12 3.5l8.5 4.3v8.4L12 20.5l-8.5-4.3z"/><path d="m3.5 7.8 8.5 4.4 8.5-4.4M12 12.2v8.3"/>',
    first: ['ทวงถามเป็นลายลักษณ์อักษร (แชต/ข้อความ) พร้อมกำหนดเวลาให้ส่งของหรือคืนเงิน', 'เก็บคำสั่งซื้อ โฆษณา สลิป และภาพ/วิดีโอตอนเปิดพัสดุ', 'ขอคืนเงินผ่านแพลตฟอร์มหรือผู้ให้บริการชำระเงิน ถ้ามีช่องทางนั้น'],
    paths: ['เจรจา/ร้องเรียน', 'บอกเลิกสัญญา', 'ฟ้องแพ่งเรียกเงินคืน'],
    time: 'ผิดสัญญาทางแพ่งไม่ติดกำหนด 3 เดือน แต่มีอายุความตามกฎหมายแพ่งซึ่งแตกต่างกันตามประเภทหนี้ และถ้าถูกหลอกตั้งแต่ต้นอาจเป็นฉ้อโกง ดูข้อแรก' },
  { k: 'evidence', topic: 'other', slug: 'digital-evidence', title: 'ต้องเก็บหลักฐานก่อนถูกลบ', hint: 'โพสต์ แชต บัญชี ที่อาจหายไป',
    icon: '<path d="M4 8.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3M20 8.5V5.5A1.5 1.5 0 0 0 18.5 4h-3M4 15.5v3A1.5 1.5 0 0 0 5.5 20h3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3"/><circle cx="12" cy="12" r="3.2"/>',
    first: ['แคปให้เห็นชื่อบัญชี ลิงก์ (URL) วันที่ เวลา และบริบททั้งหมดของข้อความ', 'บันทึกวิดีโอหน้าจอขณะเปิดดู แล้วสำรองไฟล์ไว้หลายที่โดยไม่แก้ไขไฟล์ต้นฉบับ', 'จด ID/ลิงก์โปรไฟล์ และไทม์ไลน์ ก่อนผู้ทำจะลบหรือเปลี่ยนชื่อบัญชี'],
    paths: ['เก็บหลักฐานเอง', 'ขอข้อมูลจากผู้ให้บริการ', 'ปรึกษาก่อนตัดสินใจ'],
    time: 'ยิ่งเร็วยิ่งดี เพราะโพสต์และบัญชีอาจถูกลบได้ทุกเมื่อ และถ้าเรื่องนั้นเป็นความผิดต่อส่วนตัว กำหนด 3 เดือนก็นับอยู่' },
];
{
  const root = $('#picker'), opts = $('#pkOpts'), out = $('#pkOut');
  if (root && opts && out) {
    let cur = null;
    opts.innerHTML = SITUATIONS.map((s, i) => `<button type="button" class="pk-opt" data-i="${i}" aria-pressed="false" aria-controls="pkOut">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${s.icon}</svg>
      <b>${esc(s.title)}</b><span>${esc(s.hint)}</span></button>`).join('');
    const show = (i, scroll) => {
      const s = SITUATIONS[i];
      if (!s || i === cur) return;
      cur = i;
      opts.querySelectorAll('.pk-opt').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.i === i)));
      out.innerHTML = `<div class="pk-card">
        <div class="pk-main">
          <h4>${esc(s.title)} — ทำอะไรก่อน</h4>
          <ol class="pk-first">${s.first.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
          <div class="pk-paths" aria-label="ทางเลือกที่เกี่ยวข้อง"><span>ทางเลือก</span>${s.paths.map((p) => `<i>${esc(p)}</i>`).join('')}</div>
        </div>
        <div class="pk-side">
          <p class="pk-time"><b>เรื่องเวลา</b>${esc(s.time)}</p>
          <a class="btn-pill primary sm" href="/articles/?a=${esc(s.slug)}">อ่านบทความที่เกี่ยวข้อง</a>
          <a class="btn-pill ghost sm" href="/contact/?topic=${esc(s.topic)}">ปรึกษาเรื่องนี้</a>
        </div>
      </div><p class="fine pk-note">ข้อมูลทั่วไปเพื่อประกอบการตัดสินใจเบื้องต้น ไม่ใช่คำปรึกษาทางกฎหมายและไม่รับประกันผลของคดี ข้อเท็จจริงแต่ละเรื่องต่างกัน ควรปรึกษาทนายความก่อนดำเนินการ</p>`;
      if (scroll) {
        const r = out.getBoundingClientRect();
        if (r.top > innerHeight * 0.62) out.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
      }
    };
    opts.addEventListener('click', (e) => { const b = e.target.closest('.pk-opt'); if (b) show(+b.dataset.i, true); });
    // ลูกศรซ้าย/ขวา/ขึ้น/ลง ย้ายโฟกัสระหว่างตัวเลือก
    opts.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(e.key in keys)) return;
      const all = [...opts.querySelectorAll('.pk-opt')], at = all.indexOf(document.activeElement);
      if (at < 0) return;
      e.preventDefault();
      all[(at + keys[e.key] + all.length) % all.length].focus();
    });
    root.hidden = false;
    show(0, false);
  }
}

// ---- บทความแนะนำ (การ์ดบนหน้าแรก) ----
(async () => {
  const box = $('#artTeaser');
  if (!box) return;
  try {
    const list = await (await fetch('/articles-data/index.json')).json();
    box.innerHTML = list.map((a, i) => `<a class="ar-card" href="/articles/?a=${esc(a.slug)}" style="--i:${i}">
      <span class="ar-cat">${esc(a.category)}</span><h3>${esc(a.title)}</h3><p>${esc(a.subtitle)}</p>
      ${a.refs?.length ? `<span class="ar-refs">${a.refs.map((r) => `<i>${esc(r)}</i>`).join('')}</span>` : ''}<span class="ar-meta">อ่าน ${esc(a.readMinutes)} นาที</span></a>`).join('');
  } catch { box.closest('section').hidden = true; }
  box.removeAttribute('aria-busy');
})();
