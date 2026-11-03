// ส่วน "SEO · ผลค้นหา" ในหน้าแก้ไขของแท็บ บทความ (content-articles.js) และ ผลงาน (content-portfolio.js)
// วาด: ตัวอย่างผลค้นหาแบบ Google · ช่อง หัวเรื่อง/คำอธิบาย SEO + noindex พร้อมตัวนับ · รายการตรวจ SEO · ข้อความสรุปคะแนนบนหัวหมวด
// ตรรกะ (ค่า title/description ที่ใช้จริง, รายการตรวจ) อยู่ใน /shared/post-seo.js — ที่นี่แค่วาด HTML; ทุกค่าจากข้อมูลผ่าน esc()
// pfx = 'cta' | 'cpf' (ใช้เป็น id ขององค์ประกอบและชื่อคลาสหมวดพับ .<pfx>-d) · class ของ SEO ใช้ชื่อ .cta-seo-* ร่วมกัน (นิยามใน CSS ของทั้งสองแท็บ)
import { seoChecks, seoScore, postSeo, trunc, BRAND, SITE, TITLE_MAX, DESC_MIN, DESC_MAX } from '/shared/post-seo.js';
import { icon } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HOST = SITE.replace(/^https?:\/\/(www\.)?/, '');
const CK_ICON = { ok: 'check', warn: 'alert', err: 'x' };
const seoOf = (m) => (m?.seo && typeof m.seo === 'object' ? m.seo : {});

/** กล่องตัวอย่างผลค้นหา (เนื้อใน #<pfx>-seo-pv) */
export function seoSnippet(kind, m) {
  const s = postSeo(kind, m);
  return `<div class="cta-seo-site"><span class="cta-seo-fav">${icon('globe', { size: 15 })}</span><span><b>${esc(BRAND)}</b><small>${esc(HOST + s.path)}</small></span></div>
    <div class="cta-seo-title">${esc(trunc(s.title, TITLE_MAX))}</div>
    <div class="cta-seo-desc">${esc(trunc(s.description, DESC_MAX))}</div>
    ${s.noindex ? `<div class="cta-seo-ni">${icon('eyeOff', { size: 14 })}ตั้ง noindex — หน้านี้จะไม่ปรากฏในผลค้นหา</div>` : ''}`;
}

/** รายการตรวจ (เนื้อใน #<pfx>-seo-ck) */
export function seoChecklist(kind, m) {
  return seoChecks(kind, m).map((c) => `<div class="cta-seo-ckr ${c.level}"><span class="cta-seo-cki">${icon(CK_ICON[c.level] || 'info', { size: 13, stroke: 2.6 })}</span><span><span>${esc(c.text)}</span>${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</span></div>`).join('');
}

/** ข้อความสรุปบนหัวหมวด เช่น "ผ่าน 7/9 · แนะนำแก้ 2" (จำนวนที่ควรแก้ก่อนเผยแพร่เป็นสีแดง) */
export function seoMeta(kind, m) {
  const s = seoScore(seoChecks(kind, m));
  if (s.ok === s.total) return `ผ่านครบ ${s.ok}/${s.total}`;
  return `ผ่าน ${s.ok}/${s.total}${s.err ? ` · <b class="cta-seo-bad">ควรแก้ก่อนเผยแพร่ ${s.err}</b>` : ''}${s.warn ? ` · แนะนำแก้ ${s.warn}` : ''}`;
}

const counter = (id, n, max, extra = '') => `<i class="cta-seo-n${n > max ? ' over' : ''}" id="${id}">${n}/${max}${extra}</i>`;
const descExtra = ` (แนะนำ ${DESC_MIN}–${DESC_MAX})`;

/**
 * เนื้อในหมวด SEO ทั้งหมด (ใส่ใน dsec ของแท็บ) — hints = { title, description } ข้อความบอกว่าถ้าว่างระบบใช้ค่าอะไร
 * ช่องกรอกใช้ data-p="seo.title" / "seo.description" / "seo.noindex" (data-t="bool") ให้ตัวจัดการ input ของแท็บเก็บค่าเอง
 */
export function seoBody(kind, m, pfx, hints = {}) {
  const seo = seoOf(m), auto = postSeo(kind, { ...m, seo: {} });
  const title = String(seo.title || ''), desc = String(seo.description || '');
  return `<p class="hint">หน้าสาธารณะอยู่ที่ <code>${esc(auto.path)}</code> — เสิร์ชเอนจินอ่านหัวเรื่อง/คำอธิบายด้านล่าง (ว่าง = ระบบสร้างให้จากชื่อและสรุป) ตัวอย่างนี้ใกล้เคียงกับที่ Google แสดง</p>
    <div class="cta-seo-pv" id="${pfx}-seo-pv" aria-label="ตัวอย่างผลค้นหา">${seoSnippet(kind, m)}</div>
    <label class="f"><span class="cta-seo-lbl"><span>หัวเรื่อง SEO <small>(ว่าง = ${esc(hints.title || 'ใช้ชื่อ + | ' + BRAND)})</small></span>${counter(`${pfx}-seo-tc`, title.length, TITLE_MAX)}</span>
      <input type="text" data-p="seo.title" value="${esc(title)}" maxlength="120" autocomplete="off" placeholder="${esc(auto.title)}"></label>
    <label class="f"><span class="cta-seo-lbl"><span>คำอธิบาย SEO <small>(ว่าง = ${esc(hints.description || 'ใช้สรุป')})</small></span>${counter(`${pfx}-seo-dc`, desc.length, DESC_MAX, descExtra)}</span>
      <textarea data-p="seo.description" rows="3" maxlength="320" placeholder="${esc(auto.description)}">${esc(desc)}</textarea></label>
    <label class="chk cta-seo-chk"><input type="checkbox" data-p="seo.noindex" data-t="bool"${seo.noindex === true ? ' checked' : ''}><span>ไม่ให้เสิร์ชเอนจินเก็บหน้านี้ (noindex) — ใช้กับหน้าที่ยังไม่อยากให้ค้นเจอ</span></label>
    <div class="cta-seo-h"><b>รายการตรวจ SEO</b><span class="hint">อัปเดตทันทีเมื่อแก้</span></div>
    <div class="cta-seo-ck" id="${pfx}-seo-ck">${seoChecklist(kind, m)}</div>`;
}

/** วาดใหม่เฉพาะส่วนที่เปลี่ยนตามการพิมพ์ (ตัวอย่าง · รายการตรวจ · ตัวนับ · สรุปบนหัวหมวด) — เรียกจาก touch() ของแท็บ */
export function renderSeo(box, kind, m, pfx) {
  if (!box || !m) return;
  const pv = box.querySelector(`#${pfx}-seo-pv`);
  if (!pv) return; // ยังไม่ได้วาดหน้าแก้ไข
  pv.innerHTML = seoSnippet(kind, m);
  const ck = box.querySelector(`#${pfx}-seo-ck`);
  if (ck) ck.innerHTML = seoChecklist(kind, m);
  const seo = seoOf(m);
  const tc = box.querySelector(`#${pfx}-seo-tc`), dc = box.querySelector(`#${pfx}-seo-dc`);
  const tl = String(seo.title || '').length, dl = String(seo.description || '').length;
  if (tc) { tc.textContent = `${tl}/${TITLE_MAX}`; tc.classList.toggle('over', tl > TITLE_MAX); }
  if (dc) { dc.textContent = `${dl}/${DESC_MAX}${descExtra}`; dc.classList.toggle('over', dl > DESC_MAX); }
  const meta = box.querySelector(`.${pfx}-d[data-k="seo"] > summary small`);
  if (meta) meta.innerHTML = seoMeta(kind, m);
}
