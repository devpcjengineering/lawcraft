// หน้าแอดมิน "จัดการเนื้อหาเว็บไซต์": บทความ · ข้อกฎหมาย · หน้าข้อความ (นโยบายความเป็นส่วนตัว ฯลฯ)
// โครงหน้า (แท็บ + สถานะบันทึก) อยู่ที่นี่ ส่วนเนื้อหาแต่ละแท็บเป็นโมดูลแยก (content-articles.js / content-laws.js / content-pages.js)
// ที่เก็บข้อมูล: law_data แถว key='content-<ชื่อ>' (Supabase) หรือ data/content/<ชื่อ>.json (โหมดไฟล์ในเครื่อง) — ผ่าน hooks.api.loadContent/saveContent
// ทุกคนอ่านได้ เฉพาะแอดมินเขียนได้ (RLS) — เว็บสาธารณะอ่านผ่าน /site/content.js
//
// สัญญาของโมดูลแท็บ:  export default { id, label, hint, mount(box, ctx), unmount?() }
//   ctx = { api, esc, notify, confirmBox, setState(txt, tone), load(key), save(key, obj), data }
//   - mount: วาดเนื้อหาลงใน box (ใช้ event delegation ภายใน box เอง ห้ามผูกกับ document)
//   - unmount: ถ้ามีงานที่ค้างบันทึก (debounce) ให้บันทึกให้เสร็จก่อนคืนค่า (await ได้)
import { S, esc, hooks } from './store.js';
import { indexLaw } from '/shared/model.js';
import { confirmBox } from './modal.js';
import { notify } from './notify.js';
import { inlineLoading } from './loading.js';
import { brandHtml, tbBtn } from './chrome.js';
import { icon } from './icons.js';
import { go, urls } from './router.js';

// URL ของหน้านี้: /workspace/content/articles[/<slug>] | laws | pages — router.js เป็นผู้ตัดสิน ที่นี่รับ tab/slug แล้วสลับเนื้อหา
const $ = (s, r = document) => r.querySelector(s);
const TABS = [
  () => import('./content-articles.js'),
  () => import('./content-laws.js'),
  () => import('./content-procedure.js'),
  () => import('./content-pages.js'),
];
let app, mods = [], cur = null, curIdx = 0, stateTxt = '', stateTone = '';

function setState(txt, tone = '') {
  stateTxt = txt; stateTone = tone;
  const el = $('#ct-state');
  if (el) { el.textContent = txt; el.dataset.tone = tone; }
}

const ctx = () => ({
  api: hooks.api, esc, notify, confirmBox, setState, data: S.data,
  nav: (url, opt) => go(url, opt), // เปลี่ยน URL (เช่นเปิด/ปิดหน้าแก้บทความ) — { replace, quiet } ดู router.go
  load: (key) => hooks.api.loadContent(key),
  save: async (key, obj) => { await hooks.api.saveContent(key, obj); try { sessionStorage.removeItem('lawcraft:content:' + key); } catch { /* ข้าม */ } },
});

/** แถบแท็บเลื่อนแนวนอนบนมือถือ: เลื่อนแท็บที่เลือกให้อยู่ในมุมมอง + ตั้ง data-edge (start|end|mid) ให้ CSS ทำเงาจางบอกว่ายังเลื่อนต่อได้ */
function tabsEdge(scrollToActive = false) {
  const t = $('.ct-tabs');
  if (!t) return;
  if (scrollToActive) {
    const on = t.querySelector('.ct-tab.on');
    if (on && t.scrollWidth > t.clientWidth) t.scrollTo({ left: on.offsetLeft - (t.clientWidth - on.offsetWidth) / 2, behavior: 'auto' });
  }
  const max = t.scrollWidth - t.clientWidth;
  t.dataset.edge = max <= 2 ? 'none' : t.scrollLeft <= 2 ? 'start' : t.scrollLeft >= max - 2 ? 'end' : 'mid';
}

async function openTab(i, slug = '') {
  if (cur?.unmount) { try { await cur.unmount(); } catch { /* ข้าม */ } }
  curIdx = i; cur = mods[i];
  document.querySelectorAll('.ct-tab').forEach((b, j) => { b.setAttribute('aria-selected', String(j === i)); b.classList.toggle('on', j === i); });
  tabsEdge(true);
  const box = $('#ct-body');
  box.innerHTML = inlineLoading(cur.label); // หน้าโหลดทั้งจอ (router) ครอบอยู่แล้วถ้าช้า — ตัวนี้กันกล่องว่างระหว่างโหลดเนื้อหาแท็บ
  setState('');
  try { await cur.mount(box, ctx()); } catch (e) { box.innerHTML = `<p class="empty">โหลดไม่สำเร็จ: ${esc(e.message || e)}</p>`; return; }
  if (cur.show) await cur.show(slug); // เช่น /content/articles/<slug> → เปิดหน้าแก้บทความ
}

/** หน้าจัดการเนื้อหากำลังแสดงอยู่ (router ใช้ตัดสินว่าสลับแท็บในที่เดิมได้ ไม่ต้องวาดทั้งหน้าใหม่) */
export const contentOpen = () => !!document.getElementById('ct-body') && mods.length > 0;

/** ไปที่แท็บ/บทความตาม URL (เรียกจาก router เมื่ออยู่ในหน้านี้อยู่แล้ว) */
export async function contentGoto(tab, slug = '') {
  const i = Math.max(0, mods.findIndex((m) => m.id === tab));
  if (i !== curIdx || !cur) return openTab(i, slug);
  if (cur.show) await cur.show(slug);
}

export async function showContentAdmin(root, { tab = 'articles', slug = '' } = {}) {
  app = root;
  S.bookMode = true; S.c = null; stateTxt = ''; stateTone = '';
  app.innerHTML = `
  <header class="topbar">${brandHtml('จัดการเนื้อหา')}<span class="grow"></span>
    ${tbBtn({ ico: 'external', text: 'ดูบทความ', href: '/articles/', external: true })}
    ${tbBtn({ ico: 'folder', text: 'คดีทั้งหมด', act: 'goHome', href: '/workspace/' })}</header>
  <main class="contentpage" id="ct-main">
    <div class="sp-head"><div><h1>จัดการเนื้อหาเว็บไซต์</h1><p class="hint">แก้บทความ ข้อกฎหมาย และข้อความบนเว็บไซต์ — บันทึกแล้วเว็บสาธารณะอัปเดตทันที (เฉพาะแอดมิน)</p></div><span class="save-state" id="ct-state"></span></div>
    <div class="ct-tabs" role="tablist" aria-label="หมวดเนื้อหา"></div>
    <div id="ct-body"></div>
  </main>`;
  mods = [];
  for (const load of TABS) { try { mods.push((await load()).default); } catch (e) { console.warn('content tab', e); } }
  // แท็บเป็นลิงก์จริง (เปิดแท็บใหม่/คัดลอกลิงก์ได้) — router.js ดักคลิกแล้วเรียก contentGoto
  $('.ct-tabs').innerHTML = mods.map((m) => `<a class="ct-tab" role="tab" href="${urls.content(m.id)}" title="${esc(m.hint || '')}">${esc(m.label)}</a>`).join('');
  curIdx = -1; cur = null;
  $('.ct-tabs').addEventListener('scroll', () => tabsEdge(), { passive: true });
  addEventListener('resize', () => tabsEdge());
  await openTab(Math.max(0, mods.findIndex((m) => m.id === tab)), slug);
}

export async function leaveContentAdmin() {
  if (cur?.unmount) { try { await cur.unmount(); } catch { /* ข้าม */ } }
  cur = null; mods = [];
  try { S.idx = indexLaw(S.data); } catch { /* ข้าม */ } // ข้อกฎหมายที่แก้ในแท็บมีผลกับตัวช่วยร่างทันที (ขั้นตอน/มาตราวิธีพิจารณาที่แก้ก็ใช้ S.data.procedure ที่ถูกอัปเดตแล้ว)
  if (document.getElementById('ct-body')) { S.bookMode = false; S.c = null; }
}
