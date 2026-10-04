// เราเตอร์ของหลังบ้าน (/workspace/…) ด้วย History API — ไม่มีไลบรารี
//   /workspace/                         รายการคดี
//   /workspace/new/criminal|civil       เปิดคดีใหม่ (?charge=<id> เลือกข้อหาไว้ให้) แล้วเปลี่ยนเป็น /case/<id>/case
//   /workspace/case/<id>/<tab>          พื้นที่ทำงานของคดี (tab = case parties counsel … ดู CASE_TABS)
//   /workspace/contacts | inbox | site  สมุดรายชื่อ · กล่องข้อความปรึกษา · จัดการเว็บไซต์
//   /workspace/content/articles[/<slug>] | laws | pages   จัดการเนื้อหา
//   /workspace/login | setup            เข้าสู่ระบบ · ตั้งผู้ดูแลคนแรก
// ผู้ใช้กดไปหน้าอื่น = pushState, ปรับ URL ให้ถูกรูป/ย้ายเส้นทาง = replaceState, ปุ่มย้อนกลับ/ไปข้างหน้า = popstate
// ชื่อหน้า (routeLabel) ใช้ทั้งหน้าโหลด “กำลังโหลด…ชื่อหน้า” และชื่อแท็บเบราว์เซอร์ — ตารางเดียวกันถูกย่อไว้ใน <script> ตั้งต้นของ workspace/index.html
export const BASE = '/workspace';

export const TAB_NAMES = {
  case: 'ข้อมูลคดี', parties: 'คู่ความ', counsel: 'ทนายความ', complaint: 'คำฟ้อง', prayer: 'คำขอท้ายคำฟ้อง', service: 'คำร้องส่งหมาย',
  witness: 'บัญชีพยาน', summons: 'หมายนัดไต่สวน', motions: 'คำร้อง / คำแถลง', extras: 'คำให้การ & สัญญา', export: 'ตรวจสอบ & ออกเอกสาร',
  ref: 'ตำรากฎหมาย', formtext: 'ข้อความในแบบฟอร์ม', layout: 'ตำแหน่ง & ตราครุฑ', forms: 'แบบพิมพ์ศาล',
};
export const CASE_TABS = Object.keys(TAB_NAMES);
const TAB_ALIAS = { charges: 'complaint', facts: 'complaint' };
export const CONTENT_TABS = ['articles', 'laws', 'pages'];
const CONTENT_NAMES = { articles: 'บทความ', laws: 'ข้อกฎหมาย', pages: 'ข้อความหน้าเว็บ' };
const SLUG = /^[a-z0-9][a-z0-9-]{1,60}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export const urls = {
  home: () => BASE + '/',
  login: () => BASE + '/login',
  setup: () => BASE + '/setup',
  newCase: (type, charge) => `${BASE}/new/${type === 'civil' ? 'civil' : 'criminal'}${charge ? '?charge=' + encodeURIComponent(charge) : ''}`,
  caseTab: (id, tab = 'case') => `${BASE}/case/${encodeURIComponent(id)}/${tab}`,
  contacts: () => BASE + '/contacts',
  inbox: () => BASE + '/inbox',
  site: () => BASE + '/site',
  content: (tab = 'articles', slug = '') => `${BASE}/content/${tab}${tab === 'articles' && slug ? '/' + encodeURIComponent(slug) : ''}`,
};

/** URL → { name, …พารามิเตอร์, canonical (พาธที่ถูกรูป) } ; พาธที่ไม่รู้จัก = หน้ารายการคดี */
export function parseRoute(pathname = location.pathname, search = location.search) {
  let parts = String(pathname).replace(/\/+$/, '').split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  if (parts[0] === 'workspace') parts = parts.slice(1);
  const q = new URLSearchParams(search);
  const r = (o) => ({ ...o, canonical: o.canonical });
  const [a, b, c] = parts;
  if (!a) return r({ name: 'home', canonical: urls.home() });
  if (a === 'login' && !b) return r({ name: 'login', canonical: urls.login() });
  if (a === 'setup' && !b) return r({ name: 'setup', canonical: urls.setup() });
  if (a === 'new' && (b === 'criminal' || b === 'civil') && !c) {
    const charge = q.get('charge') || '';
    return r({ name: 'new', type: b, charge, canonical: urls.newCase(b, charge) });
  }
  if (a === 'case' && b && ID.test(b)) {
    let tab = TAB_ALIAS[c] || c || 'case';
    if (!CASE_TABS.includes(tab)) tab = 'case';
    return r({ name: 'case', id: b, tab, canonical: urls.caseTab(b, tab) });
  }
  if (a === 'contacts' && !b) return r({ name: 'contacts', canonical: urls.contacts() });
  if (a === 'inbox' && !b) return r({ name: 'inbox', canonical: urls.inbox() });
  if (a === 'site' && !b) return r({ name: 'site', canonical: urls.site() });
  if (a === 'content') {
    const tab = CONTENT_TABS.includes(b) ? b : 'articles';
    const slug = tab === 'articles' && b === 'articles' && c && SLUG.test(c) ? c : '';
    return r({ name: 'content', tab, slug, canonical: urls.content(tab, slug) });
  }
  return r({ name: 'home', canonical: urls.home() });
}

/** ชื่อหน้าสำหรับ “กำลังโหลด…ชื่อหน้า” และชื่อแท็บ */
export function routeLabel(r) {
  switch (r.name) {
    case 'home': return 'รายการคดี';
    case 'login': return 'เข้าสู่ระบบ';
    case 'setup': return 'ตั้งผู้ดูแลระบบ';
    case 'new': return 'คดีใหม่';
    case 'case': return TAB_NAMES[r.tab] || 'ข้อมูลคดี';
    case 'contacts': return 'สมุดรายชื่อ';
    case 'inbox': return 'กล่องข้อความปรึกษา';
    case 'site': return 'จัดการเว็บไซต์';
    case 'content': return r.slug ? 'แก้ไขบทความ' : 'จัดการเนื้อหา · ' + CONTENT_NAMES[r.tab];
    default: return 'รายการคดี';
  }
}
export const setTitle = (label) => { document.title = (label ? label + ' · ' : '') + 'Law Craft'; };

// ---------- ควบคุมการนำทาง ----------
let handler = null;
const here = () => location.pathname + location.search;

/**
 * ไปที่ URL (ในหลังบ้านเดียวกัน)
 *  replace: ใช้ replaceState แทน pushState · quiet: แก้ URL อย่างเดียว ไม่เรียกตัวแสดงหน้า (หน้าจอเปลี่ยนไปแล้ว)
 * คืน Promise ที่จบเมื่อวาดหน้าเสร็จ
 */
export function go(url, { replace = false, quiet = false } = {}) {
  if (url === here()) replace = true; // กดลิงก์หน้าเดิม: ไม่เพิ่มประวัติซ้ำ
  try { history[replace ? 'replaceState' : 'pushState'](null, '', url); } catch { location.assign(url); return Promise.resolve(); }
  return quiet || !handler ? Promise.resolve() : handler(parseRoute(), 'nav');
}

/** แก้ URL ให้ตรงหน้าปัจจุบันโดยไม่เพิ่มประวัติ (ย้ายเส้นทาง/ทำให้ถูกรูป) */
export function replaceUrl(url) { if (url !== here()) { try { history.replaceState(null, '', url); } catch { /* ข้าม */ } } }

/** ลิงก์ที่อยู่ในหลังบ้านและไม่ใช่การเปิดแท็บใหม่/ดาวน์โหลด */
function internalLink(a, e) {
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  if (a.target && a.target !== '_self') return null;
  if (a.hasAttribute('download') || a.closest('[data-act]')) return null; // ลิงก์ที่ผูก data-act ให้ระบบ action จัดการเอง
  let u; try { u = new URL(a.href, location.href); } catch { return null; }
  if (u.origin !== location.origin || !(u.pathname === BASE || u.pathname.startsWith(BASE + '/'))) return null;
  return u.pathname + u.search + u.hash;
}

/** เริ่มเราเตอร์: onRoute(route, source) ถูกเรียกเมื่อ URL เปลี่ยน (popstate | nav | init) */
export function initRouter(onRoute) {
  handler = onRoute;
  try { history.scrollRestoration = 'manual'; } catch { /* ข้าม */ }
  window.addEventListener('popstate', () => { onRoute(parseRoute(), 'pop'); });
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    const to = internalLink(a, e);
    if (!to) return;
    e.preventDefault();
    go(to.replace(/#.*$/, ''));
  });
}
export const start = () => handler?.(parseRoute(), 'init');

/** ลิงก์เก่า (#setup · #newcase=…&charge=… · #case=…&tab=…) → พาธใหม่ ; ไม่ใช่รูปแบบเก่า = null (ไม่แตะ hash ของ OAuth) */
export function legacyHashTarget(hash = location.hash) {
  const h = new URLSearchParams(String(hash).replace(/^#/, ''));
  if (h.has('setup') && !h.has('access_token')) return urls.setup();
  const nt = h.get('newcase');
  if (nt === 'criminal' || nt === 'civil') return urls.newCase(nt, h.get('charge') || '');
  if (h.get('case') && ID.test(h.get('case'))) return urls.caseTab(h.get('case'), CASE_TABS.includes(h.get('tab')) ? h.get('tab') : 'case');
  return null;
}
