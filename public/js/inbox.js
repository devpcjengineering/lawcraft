// กล่องข้อความปรึกษา: ข้อความที่ผู้เยี่ยมชมส่งจากหน้า /contact/ — เจ้าหน้าที่ตรวจ ทำเครื่องหมายว่าจัดการแล้ว หรือลบ
// หน้าเดี่ยวแบบเดียวกับสมุดรายชื่อ (book.js) แต่ไม่มีฟอร์มผูกข้อมูล จึงวาด HTML ธรรมดา
import { S, esc, actions, hooks } from './store.js';
import { confirmBox } from './modal.js';
import { brandHtml, tbBtn } from './chrome.js';
import { icon } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);
let app, rows = [], selId = null, filter = 'all', q = '', loadState = 'idle', loadErr = '';
let unread = null; // จำนวนที่ยังไม่อ่าน (null = ยังไม่รู้) ใช้แสดงเป็นป้ายบนการ์ดหน้าแรก

const fmtDate = (iso) => { try { return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso || ''; } };
const countNew = () => rows.filter((r) => r.status !== 'handled').length;

/** แยกบรรทัดหัวที่หน้า /contact/ ใส่ไว้ต้นข้อความ (จังหวัด/วันที่เกิดเหตุ) ออกจากเนื้อเรื่อง */
function parseMessage(msg) {
  const meta = {};
  const lines = String(msg || '').split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const m = /^(จังหวัดที่เกิดเหตุ|วันที่เกิดเหตุ):\s*(.*)$/.exec(lines[i]);
    if (!m) break;
    meta[m[1]] = m[2].trim(); i++;
  }
  if (!Object.keys(meta).length) return { meta, body: String(msg || '') };
  if (lines[i] === '---') i++;
  return { meta, body: lines.slice(i).join('\n').trim() };
}

/** ดึงเบอร์โทร/อีเมลจากช่องทางติดต่อ เพื่อทำลิงก์ tel:/mailto: (ข้อความดิบแสดงเสมอ) */
function contactLinks(contact) {
  const out = [];
  const s = String(contact || '');
  for (const m of s.matchAll(/(?<![\d])0\d[\d\s-]{7,11}\d(?![\d])/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 10) out.push({ href: `tel:${digits}`, label: `โทร ${m[0].trim()}` });
  }
  for (const m of s.matchAll(/[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+/g)) out.push({ href: `mailto:${m[0]}`, label: `อีเมล ${m[0]}` });
  return out;
}

/** วันที่เกิดเหตุ (ISO yyyy-mm-dd ในวงเล็บหรือต้นข้อความ) → ผ่านมากี่วัน */
function daysSince(text) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(text || '');
  if (!m) return null;
  const d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isFinite(d) ? Math.floor((Date.now() - d) / 86400000) : null;
}

const filtered = () => {
  const n = q.trim().toLowerCase();
  return rows.filter((r) => (filter === 'all' || (filter === 'new' ? r.status !== 'handled' : r.status === 'handled'))
    && (!n || `${r.name} ${r.contact} ${r.topic} ${r.message}`.toLowerCase().includes(n)));
};

// ---------- หน้าจอ ----------
export function showInbox(root) {
  app = root;
  S.c = null;
  selId = null; filter = 'all'; q = ''; loadState = 'loading'; loadErr = '';
  app.innerHTML = `
  <header class="topbar">${brandHtml('กล่องข้อความปรึกษา')}<span class="grow"></span>
    ${tbBtn({ ico: 'refresh', text: 'รีเฟรช', act: 'ibRefresh' })}
    ${tbBtn({ ico: 'folder', text: 'คดีทั้งหมด', act: 'goHome', href: '/workspace/' })}</header>
  <main class="bookpage ibpage">
    <aside class="bk-side ib-side" aria-label="รายการข้อความ">
      <input type="search" id="ib-q" data-oninput="ibSearch" placeholder="ค้นหาชื่อ / ช่องทางติดต่อ / เรื่อง" aria-label="ค้นหาข้อความปรึกษา">
      <div class="seg-mini" id="ib-seg" role="group" aria-label="กรองสถานะ"></div>
      <div class="bk-list ib-list" id="ib-list" aria-live="polite"></div>
    </aside>
    <section class="bk-edit ib-detail" id="ib-detail" aria-live="polite"></section>
  </main>`;
  renderList(); renderDetail();
  return load(); // router รอให้โหลดข้อความเสร็จ (หน้าโหลดทั้งจอครอบอยู่)
}

async function load() {
  loadState = 'loading'; renderList();
  try {
    rows = (await hooks.api.listInquiries()) || [];
    loadState = 'ok';
  } catch (e) {
    rows = []; loadState = 'err';
    loadErr = e.status === 401 ? 'หมดเวลาเข้าสู่ระบบ — โหลดหน้านี้ใหม่แล้วเข้าสู่ระบบอีกครั้ง'
      : /relation .* does not exist|schema cache|PGRST205/i.test(e.message || '') ? 'ยังไม่มีตาราง inquiries ในฐานข้อมูล — รัน migration 20261004010000_inquiries.sql ก่อน'
      : `โหลดข้อความไม่สำเร็จ: ${e.message || e.status || ''}`;
  }
  unread = loadState === 'ok' ? countNew() : unread;
  if (selId && !rows.some((r) => r.id === selId)) selId = null;
  renderList(); renderDetail();
}

function renderList() {
  const seg = $('#ib-seg'), box = $('#ib-list');
  if (!seg || !box) return;
  const nNew = countNew(), nDone = rows.length - nNew;
  seg.innerHTML = [['all', `ทั้งหมด ${rows.length}`], ['new', `ยังไม่อ่าน ${nNew}`], ['done', `จัดการแล้ว ${nDone}`]]
    .map(([k, t]) => `<button type="button" data-act="ibFilter" data-k="${k}" aria-pressed="${k === filter}">${t}</button>`).join('');
  if (loadState === 'loading' && !rows.length) { box.innerHTML = '<div class="empty">กำลังโหลด…</div>'; return; }
  if (loadState === 'err') { box.innerHTML = `<div class="empty ib-err" role="alert">${esc(loadErr)}</div>`; return; }
  const list = filtered();
  box.innerHTML = list.map((r) => {
    const isNew = r.status !== 'handled';
    const { body } = parseMessage(r.message);
    return `<button type="button" class="bk-row ib-row ${r.id === selId ? 'on' : ''} ${isNew ? 'unread' : ''}" data-act="ibPick" data-id="${esc(r.id)}">
      <span class="ib-top"><i class="ib-dot" ${isNew ? '' : 'hidden'} title="ยังไม่อ่าน"></i><b>${esc(r.name)}</b><time>${esc(fmtDate(r.createdAt))}</time></span>
      <small>${r.topic ? `<span class="ib-topic">${esc(r.topic)}</span> ` : ''}${esc(body.replace(/\s+/g, ' ').slice(0, 90))}</small></button>`;
  }).join('') || `<div class="empty">${rows.length ? 'ไม่พบข้อความตามเงื่อนไข' : 'ยังไม่มีข้อความปรึกษาเข้ามา'}</div>`;
}

function renderDetail() {
  const box = $('#ib-detail');
  if (!box) return;
  const r = rows.find((x) => x.id === selId);
  if (!r) {
    box.innerHTML = `<div class="bk-empty"><span class="es-ico">${icon('inbox')}</span><h2>กล่องข้อความปรึกษา</h2>
      <p>ข้อความที่ผู้เยี่ยมชมส่งจากหน้า “ติดต่อปรึกษากฎหมาย” ของเว็บไซต์จะมาอยู่ที่นี่ — เลือกรายการในรายการข้อความเพื่อดูรายละเอียด แล้วติดต่อกลับตามช่องทางที่ผู้ส่งให้ไว้</p>
      <p class="hint">ข้อมูลในกล่องนี้เป็นข้อมูลส่วนบุคคล ใช้เพื่อติดต่อกลับเท่านั้น และควรลบเมื่อดำเนินการเสร็จ</p></div>`;
    return;
  }
  const done = r.status === 'handled';
  const { meta, body } = parseMessage(r.message);
  const links = contactLinks(r.contact);
  const inc = meta['วันที่เกิดเหตุ'], ds = daysSince(inc);
  box.innerHTML = `
    <div class="bk-head ib-head"><h2>${esc(r.name)}</h2><span class="pill ${done ? 'ok' : 'warn'}">${done ? 'จัดการแล้ว' : 'ยังไม่อ่าน'}</span><span class="grow"></span>
      <button class="btn sm" data-act="ibStatus" data-id="${esc(r.id)}" data-to="${done ? 'new' : 'handled'}">${done ? 'ทำเป็นยังไม่อ่าน' : icon('check') + ' ทำเครื่องหมายว่าจัดการแล้ว'}</button>
      <button class="btn sm danger" data-act="ibDel" data-id="${esc(r.id)}">ลบ</button></div>
    <dl class="ib-dl">
      <dt>ส่งเมื่อ</dt><dd>${esc(fmtDate(r.createdAt))}</dd>
      <dt>ช่องทางติดต่อกลับ</dt><dd><span class="ib-contact">${esc(r.contact)}</span>
        ${links.length ? `<span class="ib-links">${links.map((l) => `<a class="btn sm" href="${esc(l.href)}">${esc(l.label)}</a>`).join('')}</span>` : ''}</dd>
      <dt>ประเภทเรื่อง</dt><dd>${esc(r.topic || '—')}</dd>
      ${meta['จังหวัดที่เกิดเหตุ'] ? `<dt>จังหวัดที่เกิดเหตุ</dt><dd>${esc(meta['จังหวัดที่เกิดเหตุ'])}</dd>` : ''}
      ${inc ? `<dt>วันที่เกิดเหตุ</dt><dd>${esc(inc)}${ds !== null && ds >= 0 ? ` <span class="hint">· ผ่านมา ${ds} วัน${ds >= 60 ? ' — ควรตรวจกำหนดเวลา 3 เดือนของความผิดต่อส่วนตัว (นับจากวันที่รู้เรื่องและรู้ตัวผู้กระทำผิด)' : ''}</span>` : ''}</dd>` : ''}
      <dt>ความยินยอม</dt><dd>${r.consent === false ? 'ไม่มี' : 'ยินยอมให้เก็บและใช้ข้อมูลเพื่อติดต่อกลับ'}</dd>
    </dl>
    <h3 class="ib-h">รายละเอียดเรื่อง</h3>
    <div class="ib-msg">${esc(body)}</div>`;
}

// ---------- ปุ่มต่าง ๆ ----------
actions.ibPick = (el) => {
  selId = el.dataset.id;
  renderList(); renderDetail();
  if (!matchMedia('(min-width: 861px)').matches) $('#ib-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
actions.ibFilter = (el) => { filter = el.dataset.k; renderList(); };
actions.ibSearch = (el) => { q = el.value; renderList(); };
actions.ibRefresh = () => load();
actions.ibStatus = async (el) => {
  const r = rows.find((x) => x.id === el.dataset.id);
  if (!r) return;
  const to = el.dataset.to === 'new' ? 'new' : 'handled';
  el.disabled = true;
  try { await hooks.api.setInquiryStatus(r.id, to); } catch (e) { el.disabled = false; return hooks.toast('บันทึกสถานะไม่สำเร็จ: ' + (e.message || e.status)); }
  r.status = to; unread = countNew();
  renderList(); renderDetail();
  hooks.toast(to === 'handled' ? 'ทำเครื่องหมายว่าจัดการแล้ว' : 'ทำเป็นยังไม่อ่านแล้ว');
};
actions.ibDel = async (el) => {
  const r = rows.find((x) => x.id === el.dataset.id);
  if (!r) return;
  if (!(await confirmBox(`ลบข้อความของ “${r.name}” ถาวร? (ลบแล้วกู้คืนไม่ได้)`, { title: 'ลบข้อความปรึกษา', okText: 'ลบ', danger: true }))) return;
  try { await hooks.api.deleteInquiry(r.id); } catch (e) { return hooks.toast('ลบไม่สำเร็จ: ' + (e.message || e.status)); }
  rows = rows.filter((x) => x.id !== r.id); selId = null; unread = countNew();
  renderList(); renderDetail();
  hooks.toast('ลบข้อความแล้ว');
};

// ---------- ป้ายจำนวนที่ยังไม่อ่านบนการ์ดหน้าแรก (โหลดทีหลัง ไม่บล็อกการวาดหน้า) ----------
// หน้าแรกวาดการ์ดที่มี <span data-inbox-badge hidden> ไว้ — เฝ้าดู #app แล้วเติมตัวเลขเมื่อโหลดเสร็จ
async function fillBadge() {
  const el = document.querySelector('[data-inbox-badge]');
  if (!el || el.dataset.state) return;
  el.dataset.state = 'loading';
  const paint = (n) => { el.textContent = String(n); el.hidden = !(n > 0); el.setAttribute('aria-label', `${n} ข้อความที่ยังไม่อ่าน`); };
  if (unread !== null) paint(unread);
  try {
    const list = await hooks.api.listInquiries();
    unread = list.filter((r) => r.status !== 'handled').length;
    if (document.body.contains(el)) paint(unread);
  } catch { /* ไม่มีสิทธิ์/ยังไม่มีตาราง — ซ่อนป้ายเงียบ ๆ */ }
}
{
  const host = document.getElementById('app');
  if (host) new MutationObserver(() => { if (hooks.api) fillBadge(); }).observe(host, { childList: true });
}
