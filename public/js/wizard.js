// ขั้นตอนทีละหน้า: ต้องกรอกข้อมูลที่จำเป็นของหน้าก่อนหน้าให้ครบ จึงไปหน้าถัดไปได้ (ย้อนกลับได้เสมอ)
import { plaintiffs, defendants, partyName, partyLabel } from '/shared/model.js';
import { validCitizenId } from '/shared/thai.js';
import { esc } from './store.js';
import { morphInto } from './morph.js';
import { icon } from './icons.js';

/** ลำดับหน้าหลัก — optional = ข้ามได้ ไม่บังคับ */
export const STEPS = [
  { key: 'case', label: 'ข้อมูลคดี' },
  { key: 'parties', label: 'คู่ความ' },
  { key: 'counsel', label: 'ทนายความ', optional: true },
  { key: 'complaint', label: 'คำฟ้อง' },
  { key: 'prayer', label: 'คำขอท้ายคำฟ้อง' },
  { key: 'service', label: 'คำร้องส่งหมาย', optional: true },
  { key: 'witness', label: 'บัญชีพยาน', optional: true },
  { key: 'summons', label: 'หมายนัดไต่สวน', optional: true, only: 'criminal' },
  { key: 'motions', label: 'คำร้อง / คำแถลง', optional: true },
  { key: 'extras', label: 'คำให้การ & สัญญา', optional: true },
  { key: 'export', label: 'ตรวจสอบ & ออกเอกสาร' },
];

const filled = (s) => String(s ?? '').trim().length > 0;
const hasText = (list) => (list || []).some((x) => filled(x.text));

/** ข้อมูลที่จำเป็นของหน้านั้นและยังไม่ได้กรอก → ["ชื่อโจทก์", ...] */
export function stepMissing(key, c) {
  const m = [];
  if (!c) return m;
  const crim = c.type !== 'civil';
  if (key === 'case') {
    if (!filled(c.court)) m.push('ศาลที่ยื่นฟ้อง');
    if (!crim && !(+c.amount?.baht > 0)) m.push('ทุนทรัพย์ (คดีแพ่ง)');
  }
  if (key === 'parties') {
    const pl = plaintiffs(c), df = defendants(c);
    if (!pl.length) m.push('โจทก์อย่างน้อย 1 คน');
    if (!df.length) m.push('จำเลยอย่างน้อย 1 คน');
    pl.forEach((p) => {
      const tag = partyLabel(c, p);
      if (!filled(p.kind === 'juristic' ? p.name : p.first)) m.push(`ชื่อ${tag}`);
      if (p.kind === 'juristic') { if (!filled(p.regNo)) m.push(`เลขทะเบียนนิติบุคคลของ${tag}`); } else if (!validCitizenId(p.idCard || '')) m.push(`เลขประจำตัวประชาชนของ${tag} (13 หลักให้ถูกต้อง)`);
      const a = p.address || {};
      if (!filled(a.no) || !filled(a.province) || !filled(a.district)) m.push(`ที่อยู่ของ${tag} (เลขที่ จังหวัด อำเภอ/เขต)`);
    });
    df.forEach((p) => {
      const tag = partyLabel(c, p);
      if (!filled(p.kind === 'juristic' ? p.name : p.first)) m.push(`ชื่อ${tag}`);
      const a = p.address || {};
      if (!filled(a.province) || !filled(a.district)) m.push(`ที่อยู่ของ${tag} (จังหวัด อำเภอ/เขต — ใช้กำหนดการส่งหมาย)`);
      if (p.kind !== 'juristic' && filled(p.idCard) && !validCitizenId(p.idCard)) m.push(`เลขประจำตัวประชาชนของ${tag} ไม่ถูกต้อง (หรือเว้นว่างถ้าไม่ทราบ)`);
    });
  }
  if (key === 'counsel' && c.counsel?.enabled) {
    if (!filled(c.counsel.first)) m.push('ชื่อทนายความ (หรือปิดตัวเลือก “มีทนายความ”)');
    if (filled(c.counsel.idCard) && !validCitizenId(c.counsel.idCard)) m.push('เลขประจำตัวประชาชนของทนายความไม่ถูกต้อง');
  }
  if (key === 'complaint') {
    if (crim && !(c.charges || []).length) m.push('ข้อหา/ฐานความผิดอย่างน้อย 1 ข้อ');
    if (!crim && !filled(c.civilCause) && !(c.charges || []).length) m.push('มูลคดีแพ่ง');
    if (!hasText(c.facts)) m.push('ข้อเท็จจริงในคำฟ้องอย่างน้อย 1 ข้อ');
  }
  return m;
}

const applicable = (c) => STEPS.filter((s) => !s.only || s.only === (c.type === 'civil' ? 'civil' : 'criminal'));
const keyOf = (k) => k;

/** หน้าแรกก่อนหน้า “key” ที่ยังกรอกไม่ครบ (ถ้ามี) → {key,label,missing} */
export function firstBlocked(key, c) {
  if (!c) return null;
  const list = applicable(c);
  const at = list.findIndex((s) => s.key === keyOf(key));
  if (at < 0) return null; // หน้านอกลำดับหลัก (ตำรา ตั้งค่า) เข้าได้เสมอ
  for (let i = 0; i < at; i++) {
    const miss = stepMissing(list[i].key, c);
    if (miss.length) return { key: list[i].key, label: list[i].label, missing: miss };
  }
  return null;
}
export const isLocked = (key, c) => !!firstBlocked(key, c);

/** แถบ ย้อนกลับ / ถัดไป ท้ายแต่ละหน้า (พร้อมตัวบอกความคืบหน้า “ขั้นที่ n จาก N”) */
export function wizardNav(key, c) {
  const list = applicable(c);
  const at = list.findIndex((s) => s.key === key);
  if (at < 0) return '';
  const miss = stepMissing(key, c);
  return `<div class="wiz-nav" id="wiz-nav">${wizardInner(list[at - 1], list[at + 1], miss, at, list.length)}</div>`;
}
export function wizardInner(prev, next, miss, at = 0, total = 0) {
  const pct = total ? Math.round(((at + 1) / total) * 100) : 0;
  return `${miss.length ? `<div class="wiz-miss" role="status"><div class="wiz-miss-h">${icon('alert', { size: 16 })}<b>กรอกให้ครบก่อนไปหน้าถัดไป</b></div><ul>${miss.slice(0, 8).map((x) => `<li>${esc(x)}</li>`).join('')}${miss.length > 8 ? `<li>…และอีก ${miss.length - 8} รายการ</li>` : ''}</ul></div>` : ''}
    <div class="wiz-btns">${prev ? `<button type="button" class="btn" data-act="wizGo" data-tab="${prev.key}">${icon('arrowLeft', { size: 16 })}<span class="wiz-t">${esc(prev.label)}</span></button>` : '<span></span>'}
      ${total ? `<div class="wiz-prog" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${at + 1}" aria-label="ความคืบหน้า"><span class="wiz-prog-t">ขั้นที่ ${at + 1} จาก ${total}</span><span class="wiz-prog-bar"><i style="width:${pct}%"></i></span></div>` : ''}
      ${next ? `<button type="button" class="btn primary ${miss.length ? 'is-locked' : ''}" data-act="wizNext" data-tab="${next.key}" ${miss.length ? 'aria-disabled="true"' : ''}><span class="wiz-t">${esc(next.label)}</span>${icon('arrowRight', { size: 16 })}</button>` : '<span></span>'}</div>`;
}
/** อัปเดตแถบตามข้อมูลล่าสุด (เรียกหลังพิมพ์) โดยไม่วาดหน้าใหม่ */
export function refreshWizard(key, c) {
  const el = document.getElementById('wiz-nav');
  if (!el || !c) return;
  const list = applicable(c);
  const at = list.findIndex((s) => s.key === key);
  if (at < 0) return;
  morphInto(el, wizardInner(list[at - 1], list[at + 1], stepMissing(key, c), at, list.length));
}