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

const $ = (s, r = document) => r.querySelector(s);
const TABS = [
  () => import('./content-articles.js'),
  () => import('./content-laws.js'),
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
  load: (key) => hooks.api.loadContent(key),
  save: async (key, obj) => { await hooks.api.saveContent(key, obj); try { sessionStorage.removeItem('lawcraft:content:' + key); } catch { /* ข้าม */ } },
});

async function openTab(i) {
  if (cur?.unmount) { try { await cur.unmount(); } catch { /* ข้าม */ } }
  curIdx = i; cur = mods[i];
  document.querySelectorAll('.ct-tab').forEach((b, j) => { b.setAttribute('aria-selected', String(j === i)); b.classList.toggle('on', j === i); });
  const box = $('#ct-body');
  box.innerHTML = '<div class="boot"><div class="boot-logo-wrap"><img src="/logo.svg" alt="" aria-hidden="true"><div class="spinner" aria-hidden="true"></div></div><p>กำลังโหลด…</p></div>';
  setState('');
  try { await cur.mount(box, ctx()); } catch (e) { box.innerHTML = `<p class="empty">โหลดไม่สำเร็จ: ${esc(e.message || e)}</p>`; }
}

export async function showContentAdmin(root) {
  app = root;
  S.bookMode = true; S.c = null; stateTxt = ''; stateTone = '';
  app.innerHTML = `
  <header class="topbar"><div class="brand" data-act="goHome"><svg class="brand-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="24" cy="7" r="2"/><path d="M24 9v29M16 41h16M13 38h22M7 14h34"/><path d="M10 14 3 28M10 14l7 14M38 14l-7 14M38 14l7 14"/><path d="M3 28h14c-.5 5-3.5 7.5-7 7.5S3.5 33 3 28zM31 28h14c-.5 5-3.5 7.5-7 7.5S31.5 33 31 28z"/></svg><span class="brand-text"><span class="lt-th">สำนักงานกฎหมาย ลอว์คราฟต์</span><span class="lt-en">Law Craft Legal Consultants</span></span><span class="brand-sub">จัดการเนื้อหา</span></div><span class="grow"></span>
    <a class="btn ghost" href="/articles/" target="_blank" rel="noopener"><span class="tb-t">ดูบทความ ↗</span></a>
    <button class="btn ghost" data-act="goHome"><span class="tb-i" aria-hidden="true">←</span><span class="tb-t"> คดีทั้งหมด</span></button></header>
  <main class="contentpage" id="ct-main">
    <div class="sp-head"><div><h1>จัดการเนื้อหาเว็บไซต์</h1><p class="hint">แก้บทความ ข้อกฎหมาย และข้อความบนเว็บไซต์ — บันทึกแล้วเว็บสาธารณะอัปเดตทันที (เฉพาะแอดมิน)</p></div><span class="save-state" id="ct-state"></span></div>
    <div class="ct-tabs" role="tablist" aria-label="หมวดเนื้อหา"><span class="hint">กำลังโหลด…</span></div>
    <div id="ct-body"></div>
  </main>`;
  mods = [];
  for (const load of TABS) { try { mods.push((await load()).default); } catch (e) { console.warn('content tab', e); } }
  $('.ct-tabs').innerHTML = mods.map((m, i) => `<button type="button" class="ct-tab" role="tab" data-ct-tab="${i}" title="${esc(m.hint || '')}">${esc(m.label)}</button>`).join('');
  await openTab(0);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-ct-tab]');
  if (b && S.bookMode && document.getElementById('ct-body')) openTab(+b.dataset.ctTab);
});

export async function leaveContentAdmin() {
  if (cur?.unmount) { try { await cur.unmount(); } catch { /* ข้าม */ } }
  cur = null; mods = [];
  try { S.idx = indexLaw(S.data); } catch { /* ข้าม */ } // ข้อกฎหมายที่แก้ในแท็บมีผลกับตัวช่วยร่างทันที
  if (document.getElementById('ct-body')) { S.bookMode = false; S.c = null; }
}
