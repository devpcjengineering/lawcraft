// หน้าติดต่อปรึกษากฎหมาย: ตรวจข้อมูลฝั่งผู้ใช้ แล้วส่งเข้า "กล่องข้อความปรึกษา" ของหลังบ้าน
// - เว็บสถิต + Supabase (public/js/config.js ตั้ง url/anonKey): POST {url}/rest/v1/inquiries (anon = insert อย่างเดียวตาม RLS)
// - เซิร์ฟเวอร์ Node ในเครื่อง (ไม่ได้ตั้ง Supabase): POST /api/inquiry (honeypot + จำกัด 5 ครั้ง/ชั่วโมง/IP ที่ฝั่งเซิร์ฟเวอร์)
// ไม่มีการเก็บหรือเปิดเผยคีย์ service_role ในหน้านี้ (ใช้เฉพาะคีย์ anon สาธารณะ)
import { cachedSite, loadSite, defaultSite } from '/site/live-config.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const form = $('#ctForm'), summary = $('#ctSummary'), statusEl = $('#ctStatus'), submitBtn = $('#ctSubmit'), done = $('#ctDone');
const f = {
  name: $('#fName'), phone: $('#fPhone'), line: $('#fLine'), email: $('#fEmail'), topic: $('#fTopic'),
  province: $('#fProvince'), date: $('#fDate'), msg: $('#fMsg'), consent: $('#fConsent'), hp: $('#fWebsite'),
};
const MAX_MSG = 3000;
const TOPIC_LABEL = Object.fromEntries([...f.topic.options].filter((o) => o.value).map((o) => [o.value, o.textContent.trim()]));

// ช่องทางติดต่อโดยตรง: แสดงเฉพาะที่แอดมินตั้งไว้ในหลังบ้าน (ไม่สมมติเบอร์/ไลน์/อีเมล)
{
  const show = (cfg) => {
    const list = (cfg.contacts || []).filter((c) => c && c.value);
    $('#ctDirectList').innerHTML = list.map((c) => `<li>${c.href ? `<a href="${esc(c.href)}"><span>${esc(c.label)}</span> ${esc(c.value)}</a>` : `<span>${esc(c.label)}</span> ${esc(c.value)}`}</li>`).join('');
    $('#ctDirect').hidden = !list.length;
  };
  show(cachedSite() || defaultSite());
  loadSite().then(show);
}

// เลือกประเภทเรื่องล่วงหน้าจากหน้าแรก (/contact/?topic=defamation)
{
  const t = new URLSearchParams(location.search).get('topic');
  if (t && TOPIC_LABEL[t]) f.topic.value = t;
}

// ---- ตัวนับตัวอักษร ----
const count = $('#msgCount');
const updateCount = () => { const n = f.msg.value.length; count.textContent = `${n.toLocaleString('th-TH')} / ${MAX_MSG.toLocaleString('th-TH')}`; count.classList.toggle('near', n > MAX_MSG * 0.9); };
f.msg.addEventListener('input', updateCount);
updateCount();

// ---- วันที่เกิดเหตุ: ห้ามเป็นอนาคต + เตือนอ่อน ๆ เรื่อง 3 เดือน ----
const pad = (n) => String(n).padStart(2, '0');
const today = new Date();
f.date.max = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
const thDate = (iso) => { try { return new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return iso; } };
const daysAgo = (iso) => { const d = new Date(iso + 'T00:00:00'); return Number.isNaN(+d) ? null : Math.floor((Date.now() - +d) / 86400000); };
function dateNote() {
  const w = $('#wDate'), d = f.date.value ? daysAgo(f.date.value) : null;
  if (d !== null && d >= 60) {
    w.textContent = d >= 90
      ? `เหตุเกิดเมื่อประมาณ ${d} วันก่อน — หากเป็นความผิดต่อส่วนตัว อาจใกล้หรือเกินกำหนด 3 เดือนแล้ว (นับจากวันที่คุณรู้เรื่องและรู้ตัวผู้กระทำ ซึ่งอาจไม่ใช่วันเกิดเหตุ) โปรดแจ้งเราโดยเร็ว`
      : `เหตุเกิดเมื่อประมาณ ${d} วันก่อน — หากเป็นความผิดต่อส่วนตัว กำหนด 3 เดือนอาจใกล้ถึง โปรดแจ้งเราโดยเร็ว`;
    w.hidden = false;
  } else { w.hidden = true; w.textContent = ''; }
}
f.date.addEventListener('input', dateNote);
f.date.addEventListener('change', dateNote);

// ---- ตรวจข้อมูล ----
const cleanPhone = (v) => String(v || '').replace(/[\s\-().]/g, '');
const validPhone = (v) => /^(?:\+?66|0)\d{8,9}$/.test(cleanPhone(v));
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const validLine = (v) => /^@?[A-Za-z0-9._-]{3,40}$/.test(v);

const ERR = { name: $('#eName'), phone: $('#ePhone'), line: $('#eLine'), email: $('#eEmail'), contact: $('#eContact'), msg: $('#eMsg'), consent: $('#eConsent') };
function setErr(key, text, input) {
  const el = ERR[key];
  if (!el) return;
  el.textContent = text || ''; el.hidden = !text;
  const target = input || f[key];
  if (target) { if (text) target.setAttribute('aria-invalid', 'true'); else target.removeAttribute('aria-invalid'); }
}

/** คืนรายการข้อผิดพลาด [{key, msg, el}] (ว่าง = ผ่าน) */
function validate() {
  const errs = [];
  const v = (k) => f[k].value.trim();
  const phone = v('phone'), line = v('line'), email = v('email');
  Object.keys(ERR).forEach((k) => setErr(k, ''));
  f.phone.removeAttribute('aria-invalid'); f.line.removeAttribute('aria-invalid'); f.email.removeAttribute('aria-invalid');

  if (v('name').length < 2) errs.push({ key: 'name', msg: 'กรุณากรอกชื่อ-นามสกุล', el: f.name });
  if (!phone && !line && !email) {
    errs.push({ key: 'contact', msg: 'กรุณากรอกช่องทางติดต่อกลับอย่างน้อย 1 ช่องทาง (โทรศัพท์ / LINE / อีเมล)', el: f.phone });
  }
  if (phone && !validPhone(phone)) errs.push({ key: 'phone', msg: 'เบอร์โทรศัพท์ไม่ถูกต้อง (เช่น 0812345678)', el: f.phone });
  if (line && !validLine(line)) errs.push({ key: 'line', msg: 'LINE ID ไม่ถูกต้อง (ตัวอักษรอังกฤษ ตัวเลข . _ - อย่างน้อย 3 ตัว)', el: f.line });
  if (email && !validEmail(email)) errs.push({ key: 'email', msg: 'รูปแบบอีเมลไม่ถูกต้อง', el: f.email });
  const m = f.msg.value.trim();
  if (m.length < 10) errs.push({ key: 'msg', msg: 'กรุณาเล่าเรื่องโดยย่ออย่างน้อย 10 ตัวอักษร', el: f.msg });
  else if (m.length > MAX_MSG) errs.push({ key: 'msg', msg: `รายละเอียดยาวเกิน ${MAX_MSG.toLocaleString('th-TH')} ตัวอักษร`, el: f.msg });
  if (f.date.value && f.date.value > f.date.max) errs.push({ key: 'date', msg: 'วันที่เกิดเหตุต้องไม่เป็นวันในอนาคต', el: f.date });
  if (!f.consent.checked) errs.push({ key: 'consent', msg: 'กรุณายินยอมให้เก็บและใช้ข้อมูลเพื่อติดต่อกลับ', el: f.consent });
  return errs;
}

function showErrors(errs) {
  errs.forEach((e) => setErr(e.key, e.msg, e.el));
  if (errs.some((e) => e.key === 'date')) { const w = $('#wDate'); w.textContent = errs.find((e) => e.key === 'date').msg; w.hidden = false; }
  summary.innerHTML = `<b>กรุณาตรวจสอบข้อมูล ${errs.length} จุด</b><ul>${errs.map((e) => `<li><a href="#${e.el.id}" data-focus="${e.el.id}">${esc(e.msg)}</a></li>`).join('')}</ul>`;
  summary.hidden = false;
  summary.focus({ preventScroll: false });
}
summary.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-focus]');
  if (a) { e.preventDefault(); const el = document.getElementById(a.dataset.focus); el?.focus(); }
});
// แก้ไขแล้วเอาข้อความผิดพลาดของช่องนั้นออกทันที
form.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.hasAttribute('aria-invalid')) return;
  el.removeAttribute('aria-invalid');
  const id = { fName: 'name', fPhone: 'phone', fLine: 'line', fEmail: 'email', fMsg: 'msg', fConsent: 'consent' }[el.id];
  if (id && ERR[id]) { ERR[id].hidden = true; ERR[id].textContent = ''; }
});
f.consent.addEventListener('change', () => { if (f.consent.checked) { ERR.consent.hidden = true; f.consent.removeAttribute('aria-invalid'); } });

// ---- ประกอบข้อมูลตามคอลัมน์ของตาราง inquiries / ฟิลด์ของ /api/inquiry: name, contact, topic, message, consent ----
function buildPayload() {
  const parts = [];
  const phone = f.phone.value.trim(), line = f.line.value.trim(), email = f.email.value.trim();
  if (phone) parts.push(`โทร ${cleanPhone(phone)}`);
  if (line) parts.push(`LINE ${line}`);
  if (email) parts.push(`อีเมล ${email}`);
  const head = [];
  if (f.province.value.trim()) head.push(`จังหวัดที่เกิดเหตุ: ${f.province.value.trim().slice(0, 60)}`);
  if (f.date.value) head.push(`วันที่เกิดเหตุ: ${f.date.value} (${thDate(f.date.value)})`);
  const body = f.msg.value.trim();
  return {
    name: f.name.value.trim().slice(0, 120),
    contact: parts.join('; ').slice(0, 200),
    topic: TOPIC_LABEL[f.topic.value] || null,
    message: (head.length ? `${head.join('\n')}\n---\n${body}` : body).slice(0, 4000),
    consent: true,
  };
}

// ---- จำกัดการส่งซ้ำฝั่งเบราว์เซอร์ (ชั้นเสริม — ชั้นจริงอยู่ที่เซิร์ฟเวอร์/Supabase) ----
const RL_KEY = 'lc-inquiry-sent', RL_MAX = 5, RL_WIN = 3600_000;
const sentTimes = () => { try { return (JSON.parse(localStorage.getItem(RL_KEY)) || []).filter((t) => Date.now() - t < RL_WIN); } catch { return []; } };
const markSent = () => { try { localStorage.setItem(RL_KEY, JSON.stringify([...sentTimes(), Date.now()])); } catch { /* ไม่มี localStorage ก็ข้าม */ } };

async function sendInquiry(payload) {
  const sb = await import('/js/config.js').then((m) => m.default?.supabase).catch(() => null);
  let res;
  try {
    if (sb?.url && sb?.anonKey) {
      res = await fetch(`${sb.url.replace(/\/$/, '')}/rest/v1/inquiries`, {
        method: 'POST',
        headers: { apikey: sb.anonKey, Authorization: `Bearer ${sb.anonKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch('/api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, topic: payload.topic || '', website: f.hp.value }) });
    }
  } catch {
    throw new Error('ส่งไม่สำเร็จ — ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง');
  }
  if (res.ok) return;
  let detail = '';
  try { const j = await res.json(); detail = j.error || j.message || ''; } catch { /* ไม่ใช่ JSON */ }
  if (res.status === 429) throw new Error('ส่งข้อความบ่อยเกินไป กรุณาลองใหม่ภายหลัง');
  if (res.status === 400 && detail && !/[a-z]{4}/i.test(detail)) throw new Error(detail); // ข้อความภาษาไทยจากเซิร์ฟเวอร์ในเครื่อง
  if (res.status === 400 || res.status === 422) throw new Error('ข้อมูลไม่ครบหรือไม่ถูกต้องตามที่ระบบกำหนด กรุณาตรวจสอบแล้วลองอีกครั้ง');
  throw new Error('ระบบขัดข้องชั่วคราว ลองอีกครั้งในอีกสักครู่');
}

let sending = false;
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sending) return;
  summary.hidden = true; statusEl.textContent = ''; statusEl.className = 'ct-status';
  const errs = validate();
  if (errs.length) return showErrors(errs);
  if (sentTimes().length >= RL_MAX) { statusEl.textContent = 'ส่งข้อความบ่อยเกินไป กรุณาลองใหม่ภายหลัง'; statusEl.classList.add('err'); return; }

  sending = true; submitBtn.disabled = true; submitBtn.classList.add('busy');
  submitBtn.textContent = 'กำลังส่ง…'; statusEl.textContent = 'กำลังส่งข้อความ…'; form.setAttribute('aria-busy', 'true');
  try {
    if (f.hp.value) { await new Promise((r) => setTimeout(r, 600)); } // บอทกรอกช่องล่อ: แกล้งสำเร็จโดยไม่ส่ง
    else { await sendInquiry(buildPayload()); markSent(); }
    form.hidden = true; done.hidden = false; done.focus();
    done.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  } catch (err) {
    statusEl.textContent = err.message || 'ส่งไม่สำเร็จ'; statusEl.classList.add('err');
    submitBtn.textContent = 'ลองส่งอีกครั้ง';
  } finally {
    sending = false; submitBtn.disabled = false; submitBtn.classList.remove('busy'); form.removeAttribute('aria-busy');
    if (submitBtn.textContent === 'กำลังส่ง…') submitBtn.textContent = 'ส่งข้อความ';
  }
});

$('#ctAgain').addEventListener('click', () => {
  form.reset(); updateCount(); dateNote();
  Object.keys(ERR).forEach((k) => setErr(k, ''));
  statusEl.textContent = ''; submitBtn.textContent = 'ส่งข้อความ';
  done.hidden = true; form.hidden = false; f.name.focus();
});
