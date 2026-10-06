// แท็บต่าง ๆ ของฟอร์มกรอกข้อมูลคดี
import { S, esc, actions, hooks } from './store.js';
import { idField, field, select, check, seg, dateFields, addressFields, badge, pageHead, group, disclose, more } from './ui.js';
import {
  newParty, uid, plaintiffs, defendants, partyLabel, partyName, collectVars, validateCase, chargeItem, chargeSectionsText, chargeNamesText, serviceAdvice, ensureBasePrayer, tailFacts, resolveRuns, serviceFeeInfo,
  WITNESS_KINDS, newWitness, emptyAddress, witnessKind, witnessSummonsPlan, witnessWantsSummons, witnessAddrText, witnessWho,
  witnessList, isFiled, filedBadge, sideOf,
} from '/shared/model.js';
import { DEF_MOTIONS } from '/shared/def-templates.js';
import { serviceMotionText, serviceMode, DOC_TYPES, MOTION_KINDS_ALL, POST_FILING_KEYS } from '/shared/docs.js';
import { openViewer } from './viewer.js';
import { icon as ix } from './icons.js';
import { FORM_TEXT, defaultFormText } from '/shared/formtext.js';
import { validCitizenId, isBkk, toThaiDigits } from '/shared/thai.js';
import { confirmBox } from './modal.js';
import { icon } from './icons.js';
import { notify } from './notify.js';
import { panelHtml as sharePanel } from './share.js';
import { LAYOUT_GROUPS, resolveLayout } from '/shared/layout.js';

const kindOf = () => (S.c.type === 'civil' ? 'civil' : 'criminal');
const rerender = () => hooks.rerender();
/** สถานะว่าง: ไอคอน + ข้อความ */
const emptyBox = (msg, ico = 'file') => `<div class="empty">${icon(ico, { size: 22 })}<span>${msg}</span></div>`;

// ===================== 1) ข้อมูลคดี =====================
function courtOptions() {
  const ok = S.c.type === 'civil' ? ['civil', 'both', 'special'] : ['criminal', 'both', 'special'];
  const names = [];
  for (const g of S.data.courts.groups || []) {
    if (g.scope === 'appeal') continue;
    for (const ct of g.courts || []) if (!ct.scope || ok.includes(ct.scope)) names.push(ct.name);
  }
  return [...new Set(names)];
}

/** ข้อความสถานะบนการ์ด “หลังยื่นฟ้อง” (ใช้ซ้ำตอนอัปเดตสดจาก app.js) */
export const postFilingState = (c) => (isFiled(c) ? { tone: 'ok', text: filedBadge(c) } : { tone: '', text: 'ยังไม่มีเลขคดี (ไม่บังคับ)' });

/** คู่ช่อง “เลข / ปี” ของเลขคดีหนึ่งเลข (ดำหรือแดง) — แต่ละเลขมีปีของตัวเอง ; พิมพ์ “อ.123/2569” ในช่องเลขก็ได้ ระบบแยกปีให้ */
function caseNoPair(label, kind, ph) {
  const v = (p) => esc(String(S.c[p] ?? ''));
  return `<div class="f s6 cn-pair" role="group" aria-label="${esc(label)}"><span>${esc(label)}</span><div class="cn-row">
    <input type="text" data-bind="caseNo${kind}" data-caseno="${kind}" value="${v('caseNo' + kind)}" placeholder="${esc(ph)}" aria-label="${esc(label)} (เลข)" autocomplete="off">
    <b class="cn-sl" aria-hidden="true">/</b>
    <input type="text" data-bind="caseYear${kind}" value="${v('caseYear' + kind)}" placeholder="ปี พ.ศ." inputmode="numeric" maxlength="4" aria-label="${esc(label)} (ปี พ.ศ.)" autocomplete="off"></div></div>`;
}

/** การ์ด “เลขคดี”: ศาลให้เลขเมื่อไรก็เติมได้ — ไม่บังคับและไม่มีผลต่อการออกเอกสาร (ไม่ใส่ = เว้นจุดไข่ปลาที่หัวเอกสาร) */
function postFilingCard() {
  const st = postFilingState(S.c);
  return `<div class="panel post-filing${isFiled(S.c) ? ' is-filed' : ''}" id="post-filing">
    <h3>${icon('gavel', { size: 18 })}เลขคดีที่ศาลให้ (ถ้ามี)<span class="grow"></span><span class="pill ${st.tone}" id="pf-state" role="status">${esc(st.text)}</span></h3>
    <p class="hint panel-note">ใส่เลขคดีเมื่อศาลให้แล้ว ระบบจะ<b>เติมเลขลงช่องหัวเอกสารทุกฉบับ</b> (หมายเรียกพยาน บัญชีพยานเพิ่มเติม คำร้อง คำแถลง ฯลฯ) · ไม่ใส่ก็ออกเอกสารได้ทุกฉบับ ช่องเลขคดีจะเป็นจุดไข่ปลาให้เขียนเติม · เลขดำและเลขแดงมี “ปี” ของตัวเองแยกกัน เลขแดงใส่ภายหลังได้เมื่อศาลพิพากษา</p>
    ${group('เลขคดี (ศาลเป็นผู้กรอก — เว้นว่างได้)', `
      ${caseNoPair('คดีหมายเลขดำที่', 'Black', 'เช่น อ.123')}
      ${caseNoPair('คดีหมายเลขแดงที่', 'Red', 'เช่น พ.456')}`)}
    <p class="hint hint-row flush">วันที่พิมพ์บนเอกสารฉบับใหม่ปรับได้ที่ “วันที่ยื่นเอกสาร” ด้านล่าง · พิมพ์ “อ.123/2569” ในช่องเลขก็ได้ ระบบแยกปีไปช่องปีของเลขนั้นให้ · พิมพ์เลขไทยหรือเลขอารบิกก็ได้ เอกสารจะออกเป็นเลขไทย</p>
    <div class="toolbar tight pf-go">
      <button type="button" class="btn outline" data-act="goTab" data-tab="witness">${icon('plus', { size: 16 })}พยาน / บัญชีพยานเพิ่มเติม</button>
      <button type="button" class="btn outline" data-act="goTab" data-tab="motions">${icon('file', { size: 16 })}คำร้อง / คำแถลง</button>
      <button type="button" class="btn outline" data-act="goTab" data-tab="export">${icon('download', { size: 16 })}ออกเอกสารหลังยื่นฟ้อง</button></div></div>`;
}

/** ช่องชื่อคู่ความของฝ่ายหนึ่งแบบย่อ (หน้าข้อมูลคดีฝั่งจำเลย): บุคคลธรรมดา = คำนำหน้า/ชื่อ/สกุล · นิติบุคคล = ชื่อ — รายละเอียดอื่นอยู่หน้า “คู่ความ” */
function defNameFields(role, label) {
  const i = S.c.parties.findIndex((p) => p.role === role);
  if (i < 0) return `<p class="hint hint-row flush">ยังไม่มี${label} — เพิ่มที่หน้า “คู่ความ”</p>`;
  if (S.c.parties[i].kind === 'juristic') return field(`ชื่อ${label} (นิติบุคคล)`, `parties.${i}.name`, { cls: 's12' });
  return `${field(`คำนำหน้า${label}`, `parties.${i}.prefix`, { cls: 's4' })}${field('ชื่อ', `parties.${i}.first`, { cls: 's4' })}${field('นามสกุล', `parties.${i}.last`, { cls: 's4' })}`;
}

/** หน้าข้อมูลคดีของ “ฝั่งจำเลย”: ชื่อโจทก์-จำเลย · ศาล · เลขคดีดำ/แดง · วันที่รับฟ้อง (ไม่มีข้อหา/ทุนทรัพย์/นัดไต่สวนของฝั่งโจทก์) */
function tabCaseDefendant() {
  const c = S.c;
  return `
  ${pageHead('ข้อมูลคดี — ฝั่งจำเลย', 'ข้อมูลหัวกระดาษของเอกสารฝั่งจำเลย (บัญชีพยานจำเลย คำร้อง คำแถลง คำให้การ หมายเรียกพยาน) แยกจากฝั่งโจทก์')}
  <div class="panel"><h3>โจทก์ — จำเลย</h3>
    ${group('ชื่อโจทก์', defNameFields('plaintiff', 'โจทก์'))}
    ${group('ชื่อจำเลย', defNameFields('defendant', 'จำเลย'))}
    <p class="hint hint-row flush">ที่อยู่ เลขประจำตัว และรายละเอียดอื่นกรอกเพิ่มได้ที่หน้า “คู่ความ” · ถ้าคดีมีโจทก์/จำเลยหลายคนให้เพิ่มที่หน้านั้น</p></div>
  <div class="panel"><h3>ศาลและเลขคดี</h3>
    ${group('ศาลและวันที่', `
      ${field('ศาล (พิมพ์ค้นหาหรือเลือกจากรายการ)', 'court', { cls: 's12', list: 'dl-court', required: true, ph: 'เช่น ศาลจังหวัดเชียงราย' })}
      ${field('วันที่รับฟ้อง', 'receivedDate', { cls: 's6', type: 'date', hint: 'วันที่จำเลยได้รับฟ้อง/หมายเรียก — ใช้ประกอบการนับกำหนดยื่นคำให้การ' })}
      ${dateFields('date', 'วันที่ยื่นเอกสาร', { cls: 's12' })}`)}
    ${group('เลขคดี (เว้นว่างได้)', `
      ${caseNoPair('คดีหมายเลขดำที่', 'Black', 'เช่น อ.123')}
      ${caseNoPair('คดีหมายเลขแดงที่', 'Red', 'เช่น พ.456')}`)}
    ${group('ประเภทคดี', `<div class="f s12">${seg('type', [['criminal', 'คดีอาญา'], ['civil', 'คดีแพ่ง']], { rerender: true, label: 'ประเภทคดี' })}</div>`)}
    <datalist id="dl-court">${courtOptions().map((n) => `<option value="${esc(n)}">`).join('')}</datalist></div>
  <div class="panel"><h3>ไปทำเอกสารฝั่งจำเลย</h3>
    <div class="toolbar tight pf-go">
      <button type="button" class="btn outline" data-act="goTab" data-tab="witness">${icon('user', { size: 16 })}บัญชีพยานจำเลย / หมายเรียกพยาน</button>
      <button type="button" class="btn outline" data-act="goTab" data-tab="motions">${icon('file', { size: 16 })}คำร้อง / คำแถลง / คำแถลงต่อสู้คดี</button>
      <button type="button" class="btn outline" data-act="goTab" data-tab="extras">${icon('pen', { size: 16 })}คำให้การ</button>
      <button type="button" class="btn outline" data-act="goTab" data-tab="export">${icon('download', { size: 16 })}ออกเอกสาร</button></div></div>`;
}

function tabCase() {
  if (sideOf(S.c) === 'defendant') return tabCaseDefendant();
  const c = S.c, crim = c.type === 'criminal';
  const filed = isFiled(c);
  return `
  ${pageHead('ข้อมูลคดี', 'ข้อมูลหัวกระดาษที่ใช้ในเอกสารทุกฉบับ กรอกครั้งเดียว')}
  ${filed ? postFilingCard() : ''}
  <div class="panel"><h3>คดีและศาล</h3>
    ${group('ประเภทคดี', `<div class="f s12">${seg('type', [['criminal', 'คดีอาญา (ราษฎรเป็นโจทก์ฟ้องเอง)'], ['civil', 'คดีแพ่ง']], { rerender: true, label: 'ประเภทคดี' })}
      <small class="hint">${crim ? 'ฟ้องตาม ป.วิ.อ. มาตรา 28(2) — ศาลต้องไต่สวนมูลฟ้องก่อนประทับฟ้อง (ม.162)' : 'ฟ้องตาม ป.วิ.พ. — ระบุทุนทรัพย์เพื่อคำนวณค่าขึ้นศาล'}</small></div>`)}
    ${group('ศาลและวันที่', `
      ${field('ศาล (พิมพ์ค้นหาหรือเลือกจากรายการ)', 'court', { cls: 's12', list: 'dl-court', required: true, ph: 'เช่น ศาลจังหวัดเชียงราย' })}
      ${dateFields('date', 'วันที่ยื่นเอกสาร', { cls: 's12' })}`)}
    <datalist id="dl-court">${courtOptions().map((n) => `<option value="${esc(n)}">`).join('')}</datalist></div>
  ${filed ? '' : postFilingCard()}
  ${crim ? `
  <div class="panel"><h3>เหตุการณ์และการไต่สวน</h3>
    ${group('การกระทำผิด', `
      ${field('วันที่เกิดเหตุ', 'incidentDate', { cls: 's6', type: 'date' })}
      ${field('วันที่รู้เรื่องและรู้ตัวผู้กระทำผิด', 'knownDate', { cls: 's6', type: 'date', hint: 'ใช้ตรวจกำหนด 3 เดือนของความผิดต่อส่วนตัว (ป.อ. มาตรา 96)' })}`)}
    ${group('นัดไต่สวนมูลฟ้อง (ถ้าศาลนัดแล้ว)', `
      ${field('วันนัด', 'hearing.date', { cls: 's6', type: 'date' })}
      ${field('เวลา (น.)', 'hearing.time', { cls: 's6', ph: '09.00' })}`)}
  </div>` : ''}
  <div class="panel"><h3>ทุนทรัพย์และตัวเลือก</h3>
    ${group(`ทุนทรัพย์${crim ? ' (ถ้ามี)' : ''}`, `
      ${field('จำนวนทุนทรัพย์ (บาท)', 'amount.baht', { cls: 's6', type: 'number', inputmode: 'decimal' })}
      ${field('สตางค์', 'amount.satang', { cls: 's6', ph: '00' })}
      ${crim ? '' : field('เรื่อง/มูลคดี (ถ้าไม่เลือกจากรายการข้อหา)', 'civilCause', { cls: 's12', ph: 'เช่น ผิดสัญญากู้ยืมเงิน' })}
      ${crim ? '<p class="hint hint-row flush">ถ้าคดีอาญามีมูลค่าทรัพย์ (เช่น ฉ้อโกง ยักยอก) ใส่ได้ ถ้าไม่มีปล่อยว่าง ระบบขีดจุดไว้ตามแบบพิมพ์</p>' : ''}`)}
  </div>`;
}

// ===================== 2) คู่ความ =====================
export function personFields(base, p) {
  if (p.kind === 'juristic') {
    return group('นิติบุคคล', `
      ${field('ชื่อนิติบุคคล', base + '.name', { cls: 's8', required: true, ph: 'บริษัท ... จำกัด' })}
      ${field('เลขทะเบียนนิติบุคคล', base + '.regNo', { cls: 's4' })}`)
      + group('ผู้แทนนิติบุคคล', `
      ${field('ชื่อ-สกุลผู้แทน', base + '.repName', { cls: 's6' })}
      ${field('ตำแหน่ง', base + '.repPosition', { cls: 's6', ph: 'กรรมการผู้มีอำนาจกระทำการแทน' })}`);
  }
  return group('ข้อมูลส่วนตัว', `
      ${field('คำนำหน้า', base + '.prefix', { cls: 's3', list: 'dl-prefix' })}
      ${field('ชื่อ', base + '.first', { cls: 's4', required: true })}
      ${field('นามสกุล', base + '.last', { cls: 's5' })}
      ${idField('เลขประจำตัวประชาชน', base + '.idCard', { cls: 's6' })}
      ${field('อาชีพ', base + '.occupation', { cls: 's6' })}`);
}

/** กรอกชื่อแล้วหรือยัง (คำนำหน้าอย่างเดียวไม่นับ) */
const hasName = (p) => !!String((p.kind === 'juristic' ? p.name : p.first) || '').trim();

/** รายการที่ยังขาดของคู่ความ (ใช้แสดงสถานะ “ครบ/ขาด” ในแถวสรุป) */
function partyMissing(p) {
  const m = [];
  const a = p.address || {};
  if (!hasName(p)) m.push('ชื่อ');
  if (p.role === 'plaintiff' && p.kind !== 'juristic' && !String(p.idCard || '').trim()) m.push('เลขประจำตัวประชาชน');
  if (!a.no && !a.province) m.push('ที่อยู่'); else if (!a.province) m.push('จังหวัด');
  return m;
}

/** แถวสรุปของการ์ดคู่ความ: ชื่อ · เลขบัตร (ปิดบางส่วน) · จังหวัด · สถานะ */
function partySummary(p) {
  const name = hasName(p) ? partyName(p) : '', miss = partyMissing(p), a = p.address || {};
  const meta = [p.kind === 'juristic' ? ['นิติบุคคล', p.regNo].filter(Boolean).join(' ') : (maskId(p.idCard) || (p.idCard ? 'เลขบัตรไม่ครบ 13 หลัก' : '')),
    a.province && (isBkk(a.province) ? a.province : 'จ.' + a.province)].filter(Boolean);
  return `<span class="role-dot ${p.role === 'plaintiff' ? 'plaintiff' : 'defendant'}" aria-hidden="true"></span><span class="sum-title">${esc(partyLabel(S.c, p))}</span>
    <span class="sum-name">${name ? esc(name) : '<em>ยังไม่ระบุชื่อ</em>'}</span>${meta.length ? `<span class="sum-meta">${meta.map(esc).join(' · ')}</span>` : ''}
    ${miss.length ? `<span class="pill warn" role="img" aria-label="ยังขาด: ${esc(miss.join(', '))}" title="ยังขาด: ${esc(miss.join(', '))}">ขาด ${miss.length}</span>` : '<span class="pill ok">ข้อมูลครบ</span>'}`;
}

function partyCard(p, i) {
  const base = `parties.${i}`;
  const mine = S.people.filter((x) => x.kind === 'party');
  const isFirst = S.c.parties.find((x) => x.role === p.role) === p;
  const extra = `
      ${p.kind === 'juristic' ? '' : `${field('วันเกิด', base + '.birth', { cls: 's6', type: 'date', attrs: 'data-age="1"' })}
      ${field('อายุ (ปี)', base + '.age', { cls: 's6', type: 'number' })}
      ${field('เชื้อชาติ', base + '.ethnicity', { cls: 's6' })}
      ${field('สัญชาติ', base + '.nationality', { cls: 's6' })}`}
      ${field('โทรสาร', base + '.fax', { cls: 's6' })}
      ${field('ไปรษณีย์อิเล็กทรอนิกส์', base + '.email', { cls: 's6' })}
      ${field('อาคาร/หมู่บ้าน', base + '.address.building', { cls: 's12' })}`;
  const body = `
    <div class="item-toolbar">
      ${select('', base + '.role', [['plaintiff', 'โจทก์'], ['defendant', 'จำเลย']], { rerender: true, aria: 'บทบาทในคดี' })}
      ${select('', base + '.kind', [['person', 'บุคคลธรรมดา'], ['juristic', 'นิติบุคคล']], { rerender: true, aria: 'ประเภทบุคคล' })}
      <span class="grow"></span>
      ${mine.length ? `<select data-onchange="usePerson" data-i="${i}" aria-label="เลือกจากสมุดรายชื่อ"><option value="">เลือกจากสมุดรายชื่อ…</option>${mine.map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('')}</select>` : ''}
      <button class="btn sm outline" data-act="savePerson" data-i="${i}" title="บันทึกไว้ใช้ซ้ำในคดีอื่น">${icon('bookmark', { size: 15 })}บันทึกลงสมุดรายชื่อ</button>
      ${S.c.parties.length > 2 ? `<button class="btn sm danger" data-act="delParty" data-i="${i}">${icon('trash', { size: 15 })}ลบคู่ความ</button>` : ''}
    </div>
    ${personFields(base, p)}
    <section class="grp">${addressFields(base + '.address', { title: 'ที่อยู่ / ภูมิลำเนา', building: false })}</section>
    ${group('ติดต่อ', field('โทรศัพท์', base + '.phone', { cls: 's6' }))}
    ${more(`pm:${p.id}`, 'ข้อมูลเพิ่มเติม', extra, { hint: p.kind === 'juristic' ? 'โทรสาร · อีเมล · อาคาร' : 'วันเกิด · เชื้อชาติ · สัญชาติ · โทรสาร · อีเมล · อาคาร' })}`;
  return disclose(`p:${p.id}`, `<span class="sum-main">${partySummary(p)}</span>`, body,
    { cls: 'item', open: isFirst || !hasName(p), attrs: `data-sum="party" data-i="${i}"` });
}

// แถวสรุป (ชื่อ/สถานะ) อัปเดตตามที่พิมพ์ โดยไม่ต้องวาดหน้าใหม่ — รอให้ตัวจัดการหลักอัปเดต S.c ก่อน
const SUMMARY = {
  party: (d) => { const p = S.c.parties[+d.dataset.i]; return p && partySummary(p); },
  wit: (d) => { const w = S.c.witnesses[+d.dataset.i]; return w && witSummary(w); },
  motion: (d) => { const m = S.c.motions[+d.dataset.i]; return m && motionSummary(m, +d.dataset.i); },
};
function refreshSummary(e) {
  const d = e.target.closest?.('details[data-sum]');
  if (!d || !S.c) return;
  setTimeout(() => {
    const html = SUMMARY[d.dataset.sum]?.(d);
    const box = d.querySelector(':scope > summary > .sum-main');
    if (box && html != null) box.innerHTML = html;
  }, 0);
}
document.addEventListener('input', refreshSummary);
document.addEventListener('change', refreshSummary);

// ----- สมุดรายชื่อ: บันทึกข้อมูลบุคคลไว้ครั้งเดียว แล้วกดเลือกเป็นโจทก์/จำเลยในคดีใดก็ได้ -----
const maskId = (id) => { const d = String(id || '').replace(/\D/g, ''); return d.length === 13 ? `x-xxxx-xxxxx-${d.slice(10, 12)}-${d[12]}` : ''; };

function addressBookPanel() {
  const all = S.people.filter((x) => x.kind === 'party');
  const q = (S.ui.pbQ || '').trim().toLowerCase();
  const list = all.filter((x) => !q || `${x.label} ${x.data?.idCard || ''} ${x.data?.address?.province || ''} ${x.data?.occupation || ''}`.toLowerCase().includes(q));
  const row = (x) => `<div class="book-row"><div class="book-info"><b>${esc(x.label)}</b>
      <small>${[x.data?.kind === 'juristic' ? 'นิติบุคคล' : '', maskId(x.data?.idCard), x.data?.address?.province && 'จ.' + x.data.address.province, x.data?.occupation].filter(Boolean).map(esc).join(' · ')}</small></div>
    <div class="book-act"><button class="btn sm outline" data-act="addFromBook" data-id="${esc(x.id)}" data-role="plaintiff">${icon('plus', { size: 14 })}เป็นโจทก์</button>
      <button class="btn sm outline" data-act="addFromBook" data-id="${esc(x.id)}" data-role="defendant">${icon('plus', { size: 14 })}เป็นจำเลย</button>
      <button class="btn sm danger" data-act="delBook" data-id="${esc(x.id)}" aria-label="ลบ ${esc(x.label)} ออกจากสมุดรายชื่อ">ลบ</button></div></div>`;
  const body = all.length
    ? `<div class="book-search"><input type="search" id="pb-q" data-oninput="setPbQ" value="${esc(S.ui.pbQ || '')}" placeholder="ค้นหาชื่อ / เลขบัตร / จังหวัด" aria-label="ค้นหาในสมุดรายชื่อ"></div>
      <div class="book-list">${list.map(row).join('') || '<div class="empty">ไม่พบรายการ</div>'}</div>`
    : '<p class="hint book-none">ยังไม่มีรายการ — กด “จัดการสมุดรายชื่อ” เพื่อเพิ่มบุคคลได้เลย หรือกรอกในการ์ดคู่ความแล้วกด “บันทึกลงสมุดรายชื่อ”</p>';
  return disclose('book', `<span class="book-ico" aria-hidden="true">${icon('bookmark', { size: 18 })}</span><b>สมุดรายชื่อ</b><span class="hint">${all.length} รายการ · เลือกเป็นโจทก์/จำเลยได้ทันที</span>`, body + `<div class="book-more"><button type="button" class="btn sm outline" data-act="openBook">${icon('users', { size: 15 })}จัดการสมุดรายชื่อ — เพิ่มบุคคล/ทนายโดยตรง</button></div>`, { cls: 'book', open: false });
}

function tabParties() {
  const c = S.c;
  const pl = plaintiffs(c), df = defendants(c);
  const multi = pl.length > 1 || df.length > 1;
  const side = (title, list, role) => `<h3 class="sec-h">${title} <span class="cnt">${list.length} คน</span></h3>
    ${list.length ? list.map((p) => partyCard(p, c.parties.indexOf(p))).join('') : emptyBox(`ยังไม่มี${title} — กด “เพิ่ม${title}”`, 'user')}`;
  return `
  ${pageHead('คู่ความ', 'ระบุโจทก์และจำเลย ระบบนำไปเติมทุกแบบฟอร์มให้')}
  <div class="toolbar">
    <button class="btn outline" data-act="addParty" data-role="plaintiff">${icon('plus', { size: 16 })}เพิ่มโจทก์</button>
    <button class="btn outline" data-act="addParty" data-role="defendant">${icon('plus', { size: 16 })}เพิ่มจำเลย</button>
    <span class="grow"></span>
    <button class="btn" data-act="swapRoles" title="สลับสถานะ โจทก์ ↔ จำเลย ทั้งหมด">${icon('swap', { size: 16 })}สลับโจทก์/จำเลย</button>
  </div>
  ${multi ? `<div class="caution note-multi">${icon('info', { size: 18 })}<div>มีคู่ความหลายคน — หัวเอกสารใช้คนแรกเป็นหลัก (“นาย… ที่ ๑ กับพวกรวม … คน”) และระบบสร้างเอกสารแนบท้ายคำฟ้องที่มีรายละเอียดทุกคนให้
    <div class="caution-act">${check('ออกเอกสารแนบท้ายคำฟ้องในชุด', 'docs.attachment', { sw: true })}</div></div></div>` : ''}
  ${addressBookPanel()}
  ${side('โจทก์', pl, 'plaintiff')}
  ${side('จำเลย', df, 'defendant')}`;
}

actions.addParty = (el) => { S.c.parties.push(newParty(el.dataset.role)); rerender(); hooks.changed(); };
actions.delParty = (el) => { S.c.parties.splice(+el.dataset.i, 1); rerender(); hooks.changed(); };
actions.swapRoles = () => { S.c.parties.forEach((p) => { p.role = p.role === 'plaintiff' ? 'defendant' : 'plaintiff'; }); rerender(); hooks.changed(); };

/** บันทึกลงสมุดรายชื่อ: ถ้ามีคนเดิมอยู่แล้ว (เลขบัตรเดียวกัน หรือชื่อเดียวกันเมื่อไม่มีเลขบัตร) ให้อัปเดตแทนการสร้างซ้ำ */
actions.savePerson = async (el) => {
  const p = S.c.parties[+el.dataset.i];
  const label = partyName(p);
  if (!label) return hooks.toast('กรอกชื่อก่อนบันทึกลงสมุดรายชื่อ');
  const idc = String(p.idCard || '').replace(/\D/g, '');
  const exist = S.people.find((x) => x.kind === 'party' && ((idc && String(x.data?.idCard || '').replace(/\D/g, '') === idc) || (!idc && x.label === label)));
  const data = structuredClone(p); delete data.id; delete data.role;
  const rec = { id: exist?.id || uid(), kind: 'party', label, data };
  try { await hooks.api.savePerson(rec); } catch (e) { return hooks.toast('บันทึกไม่สำเร็จ: ' + e.message); }
  if (exist) Object.assign(exist, rec); else S.people.push(rec);
  hooks.toast(exist ? `อัปเดต “${label}” ในสมุดรายชื่อแล้ว` : `บันทึก “${label}” ลงสมุดรายชื่อแล้ว`);
  rerender();
};

const fromRecord = (rec, role, id) => {
  const base = newParty(role);
  const d = structuredClone(rec.data || {});
  return { ...base, ...d, role, id: id || uid(), address: { ...base.address, ...(d.address || {}) } };
};

/** เลือกจากการ์ดคู่ความเดิม (คงบทบาทเดิม) */
actions.usePerson = (el) => {
  const rec = S.people.find((x) => x.id === el.value);
  if (!rec) return;
  const i = +el.dataset.i, old = S.c.parties[i];
  S.c.parties[i] = fromRecord(rec, old.role, old.id);
  rerender(); hooks.changed();
};

/** กดจากสมุดรายชื่อ → เพิ่มเป็นโจทก์/จำเลย (เติมแทนช่องว่างของบทบาทนั้นก่อน ถ้ายังไม่มีชื่อ) */
actions.addFromBook = (el) => {
  const rec = S.people.find((x) => x.id === el.dataset.id), role = el.dataset.role;
  if (!rec) return;
  const blank = S.c.parties.findIndex((x) => x.role === role && !partyName(x));
  if (blank >= 0) S.c.parties[blank] = fromRecord(rec, role, S.c.parties[blank].id);
  else S.c.parties.push(fromRecord(rec, role));
  hooks.toast(`เพิ่ม “${rec.label}” เป็น${role === 'plaintiff' ? 'โจทก์' : 'จำเลย'}แล้ว`);
  rerender(); hooks.changed();
};
actions.delBook = async (el) => {
  const rec = S.people.find((x) => x.id === el.dataset.id);
  if (!rec) return;
  if (!(await confirmBox(`ลบ “${rec.label}” ออกจากสมุดรายชื่อ? (คดีที่ใช้ข้อมูลนี้ไปแล้วไม่ได้รับผลกระทบ)`, { title: 'ลบออกจากสมุดรายชื่อ', okText: 'ลบ', danger: true }))) return;
  try { await hooks.api.deletePerson(rec.id); } catch (e) { return hooks.toast('ลบไม่สำเร็จ: ' + e.message); }
  S.people = S.people.filter((x) => x.id !== rec.id);
  rerender();
};
actions.setPbQ = (el) => {
  S.ui.pbQ = el.value; clearTimeout(actions._pb);
  actions._pb = setTimeout(() => { const k = el.selectionStart; rerender(); const n = document.getElementById('pb-q'); n?.focus(); n?.setSelectionRange(k, k); }, 200);
};

// ===================== 3) ทนายความ / ผู้รับมอบ =====================
function tabCounsel() {
  const c = S.c, cn = c.counsel;
  const mine = S.people.filter((x) => x.kind === 'counsel');
  const h = c.proxy?.holder || {};
  const proxyFilled = !!(h.first || h.last || h.idCard || h.phone || c.proxy?.purpose);
  return `
  ${pageHead('ผู้เรียงพิมพ์ / ทนายความ', 'ใช้ออกใบแต่งทนายความ — ถ้าโจทก์ทำเอง ปล่อยปิดไว้ ระบบใช้ชื่อโจทก์เป็นผู้เรียงและพิมพ์')}
  <div class="panel"><div class="toolbar tight">${check('มีทนายความ / ผู้เรียงพิมพ์ที่ไม่ใช่โจทก์', 'counsel.enabled', { rerender: true, sw: true })}
    <span class="grow"></span>
    ${cn.enabled ? `${mine.length ? `<select class="sel-inline" data-onchange="useCounsel" aria-label="เลือกจากสมุดรายชื่อ"><option value="">เลือกจากสมุดรายชื่อ…</option>${mine.map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('')}</select>` : ''}
    <button class="btn sm outline" data-act="saveCounsel">${icon('bookmark', { size: 15 })}บันทึกลงสมุดรายชื่อ</button>` : ''}</div>
    ${cn.enabled ? `<div class="panel-body">
      ${group('ข้อมูลส่วนตัว', `
        ${field('คำนำหน้า', 'counsel.prefix', { cls: 's3', list: 'dl-prefix' })}
        ${field('ชื่อ', 'counsel.first', { cls: 's4', required: true })}
        ${field('นามสกุล', 'counsel.last', { cls: 's5' })}
        ${field('ใบอนุญาตทนายความเลขที่', 'counsel.license', { cls: 's6' })}
        ${idField('เลขประจำตัวประชาชน', 'counsel.idCard', { cls: 's6' })}`)}
      <section class="grp">${addressFields('counsel.address', { title: 'ที่อยู่สำนักงาน' })}</section>
      ${group('ติดต่อ', `
        ${field('โทรศัพท์', 'counsel.phone', { cls: 's6' })}
        ${field('อีเมล', 'counsel.email', { cls: 's6' })}`)}
      ${group('อำนาจที่มอบ', field('อำนาจที่มอบให้ทนายความเพิ่มเติม (ช่อง * ในใบแต่งทนายความ)', 'counsel.powers', { cls: 's12', type: 'textarea', rows: 2, hint: 'ตาม ป.วิ.พ. มาตรา 62 ต้องระบุชัดแจ้ง เช่น ถอนฟ้อง ประนีประนอมยอมความ อุทธรณ์/ฎีกา — ไม่ระบุหากไม่ให้อำนาจ' }))}
    </div>` : ''}
  </div>
  ${disclose('proxy', '<span class="sum-main"><span class="sum-title">ใบมอบอำนาจ (ถ้าใช้)</span><span class="sum-meta">ผู้มอบอำนาจ = โจทก์คนแรก</span></span>', `
    ${group('ผู้รับมอบอำนาจ', `
      ${proxyPicker()}
      ${field('คำนำหน้า', 'proxy.holder.prefix', { cls: 's3', list: 'dl-prefix' })}
      ${field('ชื่อ', 'proxy.holder.first', { cls: 's4' })}
      ${field('นามสกุล', 'proxy.holder.last', { cls: 's5' })}
      ${idField('เลขประจำตัวประชาชน', 'proxy.holder.idCard', { cls: 's6' })}
      ${field('โทรศัพท์', 'proxy.holder.phone', { cls: 's6' })}`)}
    <section class="grp">${addressFields('proxy.holder.address', { title: 'ที่อยู่' })}</section>
    ${group('กิจการที่มอบอำนาจ', field('กิจการที่มอบอำนาจ', 'proxy.purpose', { cls: 's12', type: 'textarea', rows: 2, ph: 'เช่น ไปยื่นคำฟ้อง รับหมายและเอกสารต่าง ๆ ของศาลแทนข้าพเจ้า' }))}`,
  { cls: 'item', open: proxyFilled })}`;
}
// ผู้รับมอบอำนาจ: เลือกจากโจทก์/จำเลยในคดี หรือสมุดรายชื่อ (บุคคล · ทนายความ) แทนการพิมพ์ใหม่
function proxyPicker() {
  const inCase = S.c.parties.filter((p) => partyName(p)).map((p) => `<option value="case:${esc(p.id)}">${esc(partyLabel(S.c, p))} · ${esc(partyName(p))}</option>`).join('');
  const book = S.people.filter((x) => x.kind === 'party' || x.kind === 'counsel').map((x) => `<option value="book:${esc(x.id)}">${esc(x.label)}${x.kind === 'counsel' ? ' (ทนายความ)' : ''}</option>`).join('');
  if (!inCase && !book) return '';
  return `<label class="f s12"><span>เลือกจากคู่ความในคดี / สมุดรายชื่อ</span><select data-onchange="pickProxy" aria-label="เลือกผู้รับมอบอำนาจ"><option value="">เลือกแล้วระบบเติมข้อมูลให้…</option>
    ${inCase ? `<optgroup label="คู่ความในคดีนี้">${inCase}</optgroup>` : ''}${book ? `<optgroup label="สมุดรายชื่อ">${book}</optgroup>` : ''}</select></label>`;
}
actions.pickProxy = (el) => {
  const [kind, id] = String(el.value).split(':');
  const src = kind === 'case' ? S.c.parties.find((p) => p.id === id) : S.people.find((x) => x.id === id)?.data;
  if (!src) return;
  const base = newParty('plaintiff');
  S.c.proxy = S.c.proxy || {};
  S.c.proxy.holder = { prefix: src.prefix || '', first: src.first || '', last: src.last || '', idCard: src.idCard || '', phone: src.phone || '', address: { ...base.address, ...structuredClone(src.address || {}) } };
  rerender(); hooks.changed();
};
actions.saveCounsel = async () => {
  const cn = S.c.counsel, label = `ทนาย ${cn.first} ${cn.last}`.trim();
  const rec = { id: uid(), kind: 'counsel', label, data: structuredClone(cn) };
  await hooks.api.savePerson(rec);
  S.people.push(rec); hooks.toast('บันทึกทนายความแล้ว'); rerender();
};
actions.useCounsel = (el) => {
  const rec = S.people.find((x) => x.id === el.value);
  if (rec) { S.c.counsel = { ...structuredClone(rec.data), enabled: true }; rerender(); hooks.changed(); }
};

// ===================== 4) ข้อหา / มูลคดี =====================
function itemList() {
  const kind = kindOf(), q = S.ui.q.trim().toLowerCase();
  return S.data.items.filter((it) => it.kind === kind && (!S.ui.law || it.lawId === S.ui.law) &&
    (!q || `${it.section} ${it.name} ${it.category || ''} ${it.text || ''}`.toLowerCase().includes(q)));
}

function itemOptions() {
  const groups = new Map();
  for (const it of itemList()) {
    const law = S.idx.laws.get(it.lawId);
    const g = `${law?.short || ''} · ${it.category || 'อื่น ๆ'}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  }
  const num = (s) => parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0;
  return [...groups].map(([g, list]) => `<optgroup label="${esc(g)}">${list.sort((a, b) => num(a.section) - num(b.section))
    .map((it) => { const taken = S.c.charges.some((x) => x.itemId === it.id); return `<option value="${esc(it.id)}" ${taken ? 'disabled' : ''}>${taken ? '(เลือกแล้ว) ' : ''}${esc((S.idx.laws.get(it.lawId)?.short || '') + ' ม.' + it.section + ' — ' + it.name)}</option>`; }).join('')}</optgroup>`).join('');
}

function precBlock(id) {
  const l = (S.data.precedents || []).filter((p) => p.itemId === id);
  if (!l.length) return '';
  return disclose(`prec:${id}`, `ฎีกาที่เกี่ยวข้อง (${l.length})`, l.map((p) => `<div class="prec-i"><b>${esc(p.caseNo)}</b> ${p.verified === false ? badge('ยังไม่ยืนยัน', 'err') : badge('ตรวจแล้ว', 'ok')}<div>${esc(p.topic || '')}</div><div class="hint">${esc(p.holding || '')}</div>${/^https?:/.test(p.source || '') ? `<a href="${esc(p.source)}" target="_blank" rel="noopener">แหล่งอ้างอิง</a>` : ''}</div>`).join(''), { cls: 'prec' });
}

function chargeCard(ch, i) {
  const it = chargeItem(S.idx, ch);
  if (!it) {
    return disclose(`c:custom:${i}`, `<span class="sum-main"><span class="ctag">กรอกเอง</span><span class="sum-name">${esc(ch.customName || 'ข้อหาอื่น')}</span></span>
      <span class="sum-act"><button class="btn sm danger" data-act="delCharge" data-i="${i}">${icon('trash', { size: 15 })}ลบ</button></span>`,
    `<dl class="charge-dl"><dt>บทมาตรา</dt><dd>${esc(ch.customSection || '-')}</dd></dl><p class="hint flush">ข้อหาที่กรอกเอง ระบบไม่มีตัวบท/ระวางโทษให้ — ตรวจความถูกต้องก่อนยื่น</p>`, { cls: 'item' });
  }
  const law = S.idx.laws.get(it.lawId);
  const civil = it.kind === 'civil';
  const rows = [];
  const add = (k, v) => v && rows.push(`<dt>${k}</dt><dd>${esc(Array.isArray(v) ? v.join(' • ') : v)}</dd>`);
  add('ตัวบท', it.text);
  if (!civil) { add('ระวางโทษ', it.penalty); add('องค์ประกอบ', it.elements); } else { add('ประเภทคำขอ', it.claimType); add('ดอกเบี้ย', it.interest); add('ก่อนฟ้องต้อง', it.prerequisites); add('หลักฐานที่ต้องมี', it.evidenceChecklist); add('ค่าขึ้นศาล', it.courtFeeNote); }
  add('อายุความ', it.limitation);
  const rel = (it.relatedSections || []).map((r) => {
    const ref = typeof r === 'string' ? r : r.ref, why = typeof r === 'string' ? '' : r.why;
    return `<label class="chk"><input type="checkbox" data-onchange="toggleRelated" data-i="${i}" data-ref="${esc(ref)}" ${(ch.related || []).includes(ref) ? 'checked' : ''}><span>${esc(ref)} ${why ? `<span class="hint">— ${esc(why)}</span>` : ''}</span></label>`;
  }).join('');
  const name = `${law?.short || ''} มาตรา ${it.section} ${it.name}`.trim();
  const sum = `<span class="sum-main wrap"><span class="ctag">${esc(law?.short || '')} ม.${esc(it.section)}</span><span class="sum-name">${esc(it.name)}</span>
      <span class="sum-badges">${it.privateOffence ? badge('ความผิดต่อส่วนตัว', 'warn') : ''}${it.compoundable ? badge('ยอมความได้', 'warn') : ''}${it.verified === false ? badge('ยังไม่ตรวจแหล่งอ้างอิง', 'err') : badge('ตรวจแหล่งอ้างอิงแล้ว', 'ok')}</span></span>
    <span class="sum-act"><button class="btn sm danger" data-act="delCharge" data-i="${i}" aria-label="ลบข้อหา ${esc(name)}">${icon('trash', { size: 15 })}ลบ</button></span>`;
  const body = `
    <dl class="charge-dl">${rows.join('')}</dl>
    ${it.privateOffence && !/3 เดือน|สามเดือน/.test(it.caution || '') ? `<div class="caution legal">${icon('alert', { size: 18 })}<div>ความผิดต่อส่วนตัว — ต้องร้องทุกข์หรือฟ้องภายใน 3 เดือนนับแต่รู้เรื่องและรู้ตัวผู้กระทำผิด (ป.อ. มาตรา 96)</div></div>` : ''}
    ${it.caution ? `<div class="caution">${icon('alert', { size: 18 })}<div>${esc(it.caution)}</div></div>` : ''}
    ${rel ? `<div class="d-sub">มาตราที่มักอ้างประกอบ (ติ๊กเพื่อใส่ในบทมาตรา)</div><div class="rel">${rel}</div>` : ''}
    ${precBlock(it.id)}
    ${it.source ? `<div class="hint src-line">แหล่งอ้างอิง: ${/^https?:/.test(it.source) ? `<a href="${esc(it.source)}" target="_blank" rel="noopener">${esc(it.source)}</a>` : esc(it.source)}</div>` : ''}
    <div class="item-toolbar foot"><button class="btn sm outline" data-act="refill" data-i="${i}" title="เติมข้อเท็จจริง/คำขอของข้อหานี้อีกครั้ง">${icon('refresh', { size: 15 })}เติมข้อความจากข้อหานี้ใหม่</button></div>`;
  return disclose(`c:${ch.itemId}`, sum, body, { cls: 'item' });
}

function tabCharges() {
  const kind = kindOf();
  const lawsHere = S.data.laws.filter((l) => S.data.items.some((it) => it.lawId === l.id && it.kind === kind));
  const list = itemList();
  return `
  ${pageHead(kind === 'civil' ? 'มูลคดีแพ่ง' : 'ข้อหา / ฐานความผิด', 'เลือกกฎหมายและมาตรา ระบบดึงตัวบท โทษ และร่างข้อเท็จจริง/คำขอมาให้แก้ต่อ เพิ่มได้หลายข้อหา')}
  <div class="panel"><h3>เลือกข้อหา</h3><div class="grid">
    <label class="f s4"><span>กฎหมาย</span><select data-onchange="setLaw"><option value="">ทุกฉบับ</option>${lawsHere.map((l) => `<option value="${esc(l.id)}" ${S.ui.law === l.id ? 'selected' : ''}>${esc(l.short ? l.short + ' — ' : '')}${esc(l.name)}</option>`).join('')}</select></label>
    <label class="f s8"><span>ค้นหา (มาตรา / ชื่อข้อหา)</span><input type="search" id="charge-q" value="${esc(S.ui.q)}" data-oninput="setQ" placeholder="เช่น ฉ้อโกง, 341, หมิ่นประมาท"></label>
    <label class="f s12"><span>ข้อหา <span class="hint">(พบ ${list.length} รายการ)</span></span><select id="charge-sel" size="1">${itemOptions() || '<option value="">— ไม่พบรายการ —</option>'}</select></label>
  </div>
  <div class="toolbar foot"><button class="btn primary" data-act="addCharge">${icon('plus', { size: 16 })}เพิ่มข้อหานี้</button>
    ${check('เติมร่างข้อเท็จจริงและคำขอท้ายฟ้องให้อัตโนมัติ', 'options.autoFill', { sw: true })}</div>
  ${more('ch:custom', 'เพิ่มข้อหา/บทมาตราที่ไม่มีในรายการ', `
      <label class="f s6"><span>ชื่อข้อหา</span><input type="text" id="cust-name"></label>
      <label class="f s6"><span>บทมาตรา (ข้อความเต็ม)</span><input type="text" id="cust-sec" placeholder="เช่น พ.ร.บ.… พ.ศ.… มาตรา …"></label>
      <div class="f s12"><div><button class="btn outline" data-act="addCustomCharge">${icon('plus', { size: 16 })}เพิ่ม</button></div></div>`)}</div>
  <h3 class="sec-h">ข้อหาที่เลือก <span class="cnt">(${S.c.charges.length})</span></h3>
  ${S.c.charges.length ? S.c.charges.map(chargeCard).join('') : emptyBox('ยังไม่ได้เลือกข้อหา — เลือกจากรายการด้านบนแล้วกด “เพิ่มข้อหานี้”', 'gavel')}
  <div class="panel spaced"><h3>ข้อความในคำฟ้อง</h3>
    ${field('ข้อหาหรือฐานความผิดที่จะแสดงในคำฟ้อง (เว้นว่าง = ใช้ชื่อข้อหาที่เลือก)', 'chargeText', { cls: 's12', type: 'textarea', rows: 3, ph: chargeNamesText(S.c, S.idx) || 'เช่น แจ้งข้อความอันเป็นเท็จแก่เจ้าพนักงาน เพื่อจะแกล้งให้ผู้อื่นต้องรับโทษ', hint: 'ตัวอย่างศาลมักเขียนข้อความเต็มของฐานความผิด ไม่ใช่ชื่อย่อ' })}
    ${S.c.charges.length ? `<p class="hint">บทมาตราที่จะปรากฏในคำขอท้ายฟ้อง: <b>${esc(chargeSectionsText(S.c, S.idx))}</b></p>` : ''}
  </div>`;
}

export function fillFromItem(it) {
  const c = S.c;
  if (!c.facts.some((f) => f.src === it.id)) for (const t of it.factTemplate || []) c.facts.push({ id: uid(), text: t, src: it.id });
  // คดีอาญา: คำขอท้ายฟ้องมีถ้อยคำ “ขอให้ลงโทษจำเลยตาม…มาตรา…” ให้อัตโนมัติอยู่แล้ว จึงไม่เติมซ้ำเป็นรายการ — คดีแพ่งยังเติมคำขอตามมูลหนี้
  if (c.type === 'civil' && !c.prayers.some((f) => f.src === it.id)) for (const t of it.prayerTemplate || []) c.prayers.push({ id: uid(), text: t, src: it.id });
  ensureBasePrayer(c);
}
actions.addCharge = () => {
  const id = document.getElementById('charge-sel')?.value;
  const it = S.idx.items.get(id);
  if (!it) return hooks.toast('กรุณาเลือกข้อหาก่อน');
  if (S.c.charges.some((x) => x.itemId === id)) {
    const law = S.idx.laws.get(it.lawId);
    return notify({ type: 'warn', id: 'dup-charge', title: 'เพิ่มข้อหานี้ซ้ำไม่ได้', message: `${law?.short || ''} มาตรา ${it.section} ${it.name} ถูกเลือกไว้ในคดีนี้แล้ว` });
  }
  S.c.charges.push({ itemId: id, related: [] });
  if (S.c.options.autoFill !== false) fillFromItem(it);
  rerender(); hooks.changed();
};
actions.addCustomCharge = () => {
  const name = document.getElementById('cust-name').value.trim(), sec = document.getElementById('cust-sec').value.trim();
  if (!name && !sec) return;
  if (S.c.charges.some((x) => !x.itemId && (x.customName || '') === name && (x.customSection || '') === sec)) return notify({ type: 'warn', id: 'dup-charge', title: 'เพิ่มข้อหานี้ซ้ำไม่ได้', message: 'ข้อหา/บทมาตราที่กรอกเองนี้มีอยู่ในคดีแล้ว' });
  S.c.charges.push({ customName: name, customSection: sec, related: [] }); rerender(); hooks.changed();
};
actions.delCharge = async (el) => {
  const ch = S.c.charges[+el.dataset.i];
  S.c.charges.splice(+el.dataset.i, 1);
  if (ch.itemId && (S.c.facts.some((f) => f.src === ch.itemId) || S.c.prayers.some((f) => f.src === ch.itemId)) &&
    await confirmBox('ลบข้อเท็จจริงและคำขอท้ายฟ้องที่สร้างจากข้อหานี้ออกด้วยหรือไม่?', { title: 'ลบข้อหา', okText: 'ลบออกด้วย', cancelText: 'เก็บไว้', danger: true })) {
    S.c.facts = S.c.facts.filter((f) => f.src !== ch.itemId);
    S.c.prayers = S.c.prayers.filter((f) => f.src !== ch.itemId);
  }
  rerender(); hooks.changed();
};
actions.refill = (el) => {
  const ch = S.c.charges[+el.dataset.i], it = chargeItem(S.idx, ch);
  if (it) { S.c.facts = S.c.facts.filter((f) => f.src !== it.id); S.c.prayers = S.c.prayers.filter((f) => f.src !== it.id); fillFromItem(it); hooks.toast('เติมข้อความจากข้อหานี้ใหม่แล้ว'); rerender(); hooks.changed(); }
};
actions.toggleRelated = (el) => {
  const ch = S.c.charges[+el.dataset.i];
  ch.related = ch.related || [];
  const ref = el.dataset.ref;
  ch.related = el.checked ? [...new Set([...ch.related, ref])] : ch.related.filter((x) => x !== ref);
  rerender(); hooks.changed();
};
actions.setLaw = (el) => { S.ui.law = el.value; rerender(); };
actions.setQ = (el) => {
  S.ui.q = el.value;
  const sel = document.getElementById('charge-sel');
  if (sel) sel.innerHTML = itemOptions() || '<option value="">— ไม่พบรายการ —</option>';
};

// ===================== ช่องตัวแปร + snippet =====================
function varsPanel() {
  const vars = collectVars(S.c);
  if (!vars.length) return '';
  const missing = vars.filter((v) => !(S.c.vars[v] || '').trim()).length;
  // ยังมีช่องค้าง = เปิดให้กรอก · ครบแล้ว = พับเก็บเหลือแถวเดียว (กดดู/แก้ค่าได้) ไม่ให้กินที่หน้าจอ
  const summary = `<span class="sum-main"><span class="sum-title">ช่องข้อมูลที่ต้องกรอก</span>${missing ? badge(`ค้าง ${missing}`, 'warn') : badge('ครบแล้ว', 'ok')}</span>`;
  const body = `<p class="hint">ข้อความ <code>{{…}}</code> ในร่างจะถูกแทนด้วยค่าที่กรอกที่นี่ ช่องที่ยังว่างจะเป็นแถบเหลืองในตัวอย่าง</p>
    <div class="grid">${vars.map((v) => `<label class="f s6"><span>${esc(v)}</span><input type="text" data-var="${esc(v)}" value="${esc(S.c.vars[v] || '')}"></label>`).join('')}</div>`;
  return disclose('vars', summary, body, { cls: 'item vars', open: false, force: missing ? true : undefined });
}

function snippetPicker(types, act, label = 'แทรกข้อความสำเร็จรูป') {
  const list = (S.data.procedure.snippets || []).filter((s) => types.includes(s.docType));
  if (!list.length) return '';
  return `<div class="row snip-row"><select id="snip-${act}" class="sel-grow" aria-label="${esc(label)}"><option value="">${label}…</option>${list.map((s) => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('')}</select>
    <button class="btn outline" data-act="${act}">แทรก</button></div>`;
}
const snippetById = (id) => (S.data.procedure.snippets || []).find((s) => s.id === id);

// ===================== 5) ข้อเท็จจริง =====================
const listOf = (key) => key.split('.').reduce((o, k) => o[k], S.c);

function itemEditor(listKey, label, emptyMsg = 'ยังไม่มีรายการ — เลือกข้อหาเพื่อเติมร่างอัตโนมัติ หรือกด “เพิ่ม”') {
  const list = listOf(listKey);
  if (!list.length) return emptyBox(emptyMsg, 'list');
  return list.map((f, i) => `<div class="fact">
    <div class="no">${label} ${i + 1}</div>
    <textarea rows="3" data-bind="${listKey}.${i}.text" aria-label="${label} ${i + 1}">${esc(f.text)}</textarea>
    <div class="ctl"><button class="btn sm icon" data-act="moveItem" data-list="${listKey}" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="เลื่อนขึ้น" title="เลื่อนขึ้น">${icon('arrowUp', { size: 16 })}</button>
      <button class="btn sm icon" data-act="moveItem" data-list="${listKey}" data-i="${i}" data-d="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="เลื่อนลง" title="เลื่อนลง">${icon('arrowDown', { size: 16 })}</button>
      <button class="btn sm icon danger" data-act="delItem" data-list="${listKey}" data-i="${i}" aria-label="ลบ ${label} ${i + 1}" title="ลบ">${icon('trash', { size: 16 })}</button></div></div>`).join('');
}
actions.moveItem = (el) => {
  const l = listOf(el.dataset.list), i = +el.dataset.i, j = i + +el.dataset.d;
  if (j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]]; rerender(); hooks.changed();
};
actions.delItem = (el) => { listOf(el.dataset.list).splice(+el.dataset.i, 1); rerender(); hooks.changed(); };
actions.addItem = (el) => { listOf(el.dataset.list).push({ id: uid(), text: '' }); rerender(); hooks.changed(); };
actions.addJurisFact = () => {
  const crim = S.c.type === 'criminal';
  const text = crim
    ? 'เหตุเกิดที่ {{สถานที่เกิดเหตุ}} อยู่ในเขตอำนาจของศาลนี้ โจทก์{{ข้อความเรื่องการร้องทุกข์}} จึงนำคดีมาฟ้องต่อศาลโดยตรง'
    : 'มูลคดีเกิดที่ {{สถานที่เกิดเหตุ}} และ{{จำเลย}}มีภูมิลำเนาอยู่ในเขตอำนาจของศาลนี้ ศาลนี้จึงมีอำนาจพิจารณาพิพากษาคดี';
  S.c.facts.push({ id: uid(), text, src: 'juris' });
  if (crim && !S.c.vars['ข้อความเรื่องการร้องทุกข์']) S.c.vars['ข้อความเรื่องการร้องทุกข์'] = 'มิได้ร้องทุกข์ต่อพนักงานสอบสวนในความผิดคดีนี้';
  rerender(); hooks.changed();
};
actions.addPrayer = () => { S.c.prayers.push({ id: uid(), text: '' }); ensureBasePrayer(S.c); rerender(); hooks.changed(); };
actions.snipFact = () => { const s = snippetById(document.getElementById('snip-snipFact').value); if (s) { S.c.facts.push({ id: uid(), text: s.text, src: 'snip' }); rerender(); hooks.changed(); } };
actions.snipPrayer = () => { const s = snippetById(document.getElementById('snip-snipPrayer').value); if (s) { S.c.prayers.push({ id: uid(), text: s.text, src: 'snip' }); ensureBasePrayer(S.c); rerender(); hooks.changed(); } };

/** ข้อท้ายคำฟ้อง — ระบบต่อท้ายข้อเท็จจริงให้อัตโนมัติ (สถานที่เกิดเหตุใช้ช่องเดียวกับข้อความด้านบน) แสดงตัวอย่างสด ปิดได้ */
function tailPanel() {
  const crim = S.c.type === 'criminal';
  S.c.closing ||= { mode: 'self', auto: true };
  if (S.c.closing.auto === undefined) S.c.closing.auto = true; // ค่าเริ่มต้น = ใส่ให้อัตโนมัติ (ให้สวิตช์ตรงกับสถานะจริง)
  const on = S.c.closing.auto !== false;
  const n = S.c.facts.filter((f) => (f.text || '').trim()).length;
  const items = tailFacts(S.c);
  return `<div class="panel tail"><h3>ข้อท้ายคำฟ้อง <span class="pill ${on ? 'ok' : ''}">${on ? 'ใส่ให้อัตโนมัติ' : 'ปิดอยู่'}</span></h3>
    <p class="hint panel-note">ต่อท้ายข้อเท็จจริงด้านบนให้เองในคำฟ้อง ไม่ต้องกดอะไร — สถานที่เกิดเหตุใช้ช่อง “สถานที่เกิดเหตุ” ที่กรอกไว้ด้านบน</p>
    ${check('ใส่ข้อท้ายคำฟ้องให้อัตโนมัติ', 'closing.auto', { rerender: true, sw: true })}
    ${on && crim ? `<div class="f tail-opt"><span class="lbl">การร้องทุกข์ต่อพนักงานสอบสวน</span>${seg('closing.mode', [['self', 'ไม่ได้ร้องทุกข์ — ประสงค์ดำเนินคดีด้วยตนเอง'], ['police', 'ร้องทุกข์ไว้แล้ว แต่ประสงค์ฟ้องเอง']], { label: 'การร้องทุกข์', rerender: true })}</div>` : ''}
    ${on ? `<ol class="tail-list" start="${n + 1}">${items.map((t) => `<li>${resolveRuns(t, S.c, S.idx).map((r) => (r.kind === 'ph' ? `<mark>${esc(r.text)}</mark>` : esc(r.text))).join('')}</li>`).join('')}</ol>` : ''}</div>`;
}

function tabFacts() {
  return `${pageHead('ข้อเท็จจริงในคำฟ้อง', 'แต่ละช่องคือ “ข้อ ๑, ๒ …” ของคำฟ้อง ร่างจากข้อหาที่เลือก ปรับถ้อยคำได้')}
  ${varsPanel()}
  <div class="panel"><h3>รายการข้อเท็จจริง</h3>
    <p class="hint panel-note">ใช้ <code>{{โจทก์}}</code> <code>{{จำเลย}}</code> <code>{{ศาล}}</code> <code>{{มาตรา}}</code> แทนชื่อคู่ความ/ศาล/บทมาตราโดยอัตโนมัติ</p>
    ${itemEditor('facts', 'ข้อ')}
    <div class="toolbar foot"><button class="btn outline" data-act="addItem" data-list="facts">${icon('plus', { size: 16 })}เพิ่มข้อ (พิมพ์เอง)</button></div>
    ${snippetPicker(S.c.type === 'civil' ? ['complaint-civil'] : ['complaint-criminal'], 'snipFact')}</div>
  ${tailPanel()}`;
}

// ===================== 6) คำขอท้ายฟ้อง =====================
const amountText = () => (S.c.amount?.baht ? Number(S.c.amount.baht).toLocaleString('en-US') + (S.c.amount.satang && S.c.amount.satang !== '00' ? '.' + S.c.amount.satang : '') : '');
actions.addInterestPrayer = (el) => {
  const amt = amountText() || '{{จำนวนเงิน}}';
  const text = el.dataset.from === 'filing'
    ? `ให้จำเลยชำระเงินจำนวน ${amt} บาท แก่โจทก์ พร้อมดอกเบี้ยอัตราร้อยละ {{อัตราดอกเบี้ย}} ต่อปี ของต้นเงินดังกล่าว นับแต่วันฟ้องเป็นต้นไปจนกว่าจะชำระเสร็จสิ้น`
    : `ให้จำเลยชำระเงินจำนวน ${amt} บาท แก่โจทก์ พร้อมดอกเบี้ยอัตราร้อยละ {{อัตราดอกเบี้ย}} ต่อปี ของต้นเงินดังกล่าว นับแต่วันที่ {{วันผิดสัญญา}} ซึ่งเป็นวันผิดสัญญา/ผิดนัด จนถึงวันฟ้อง และต่อไปจนกว่าจะชำระเสร็จสิ้น`;
  S.c.prayers.push({ id: uid(), text, src: 'interest-' + el.dataset.from });
  ensureBasePrayer(S.c);
  rerender(); hooks.changed();
};
function interestPanel() {
  const amt = amountText();
  return `<div class="panel"><h3>ขอให้ชำระเงิน พร้อมดอกเบี้ย</h3>
    <p class="hint panel-note">${amt ? `ทุนทรัพย์ตามหน้าฟ้อง <b>${esc(amt)}</b> บาท — เลือกเพิ่มคำขอได้แยกกัน (ดอกเบี้ยนับแต่วันผิดสัญญา หรือนับแต่วันฟ้อง) แล้วแก้ถ้อยคำในรายการคำขอ` : 'ยังไม่ได้ระบุจำนวนทุนทรัพย์ในหน้า “ข้อมูลคดี” — เมื่อระบุแล้วจำนวนเงินจะถูกใส่ในคำขอให้อัตโนมัติ'}</p>
    <div class="toolbar tight"><button class="btn outline" data-act="addInterestPrayer" data-from="breach">${icon('plus', { size: 16 })}ชำระเงิน พร้อมดอกเบี้ยนับแต่วันผิดสัญญา</button>
      <button class="btn outline" data-act="addInterestPrayer" data-from="filing">${icon('plus', { size: 16 })}ชำระเงิน พร้อมดอกเบี้ยนับแต่วันฟ้อง</button></div></div>`;
}
function tabPrayer() {
  const crim = S.c.type === 'criminal';
  return `${pageHead('คำขอท้ายคำฟ้อง', crim ? 'แบบ ๖ — ระบบใส่ “การที่จำเลยได้กระทำ… เป็นความผิดตามบทมาตรา …” ให้อัตโนมัติ' : 'แบบ ๕ คำขอท้ายคำฟ้องแพ่ง')}
  ${varsPanel()}
  <div class="panel"><h3>การยื่น</h3><div class="grid">
    ${crim ? select('ขอให้ศาล', 'summonKind', ['ออกหมายนัดไต่สวนมูลฟ้อง/หมายเรียก', 'ออกหมายเรียก', 'ออกหมายจับ'], { cls: 's8', rerender: true }) : ''}
    ${field('จำนวนสำเนาคำฟ้องที่ยื่นมาด้วย (ฉบับ)', 'copies', { cls: crim ? 's4' : 's6', type: 'number' })}</div></div>
  ${interestPanel()}
  <div class="panel"><h3>รายการคำขอ</h3>${itemEditor('prayers', 'ข้อ')}
    <div class="toolbar foot"><button class="btn outline" data-act="addPrayer">${icon('plus', { size: 16 })}เพิ่มคำขอ</button></div>
    ${snippetPicker(S.c.type === 'civil' ? ['prayer-civil'] : ['prayer-criminal'], 'snipPrayer')}</div>`;
}

// ===================== 7) พยาน =====================
const WIT_KIND = WITNESS_KINDS;
/** พยานที่ระบบจะออกหมายเรียกให้ (เปิดสวิตช์รวม + ระบุชื่อแล้ว + ไม่ได้ปิดรายตัว/ไม่ใช่ “นำ” เอง) */
const witOn = (x) => S.c.docs.witnessSummons !== false && !!(x.name || '').trim() && witnessWantsSummons(x);
const witLacksAddr = (x) => witOn(x) && (witnessKind(x) === 'person' ? !witnessAddrText(x) : !(x.holder || '').trim() && !witnessAddrText(x));
function witSummary(x) {
  // แถวสรุปแสดงแค่ชื่อพยาน (อันดับ/หมายเหตุ/ตำแหน่งดูได้เมื่อกางแถว)
  const k = witnessKind(x), named = (x.name || '').trim();
  return `<span class="pill ${k === 'person' ? 'info' : ''}">${WIT_KIND[k]}</span>${x.extra ? badge('เพิ่มเติม', 'warn') : ''}
    <span class="sum-name">${named ? esc(x.name) : '<em>ยังไม่ระบุ</em>'}</span>${witLacksAddr(x) ? badge('ยังไม่มีที่อยู่', 'warn') : ''}`;
}

/** กล่อง “บัญชีพยาน (เพิ่มเติม) ครั้งที่ …” (ใช้แบบ ๑๕):พยานที่ติดธง “เพิ่มเติมภายหลังยื่นฟ้อง” + สวิตช์ + ดูตัวอย่าง */
function witnessExtraPanel() {
  const c = S.c, on = c.docs.witnessExtra !== false, extra = witnessList(c, 'extra'), base = witnessList(c, 'base');
  const filed = isFiled(c);
  const hint = filed
    ? 'คดีนี้ฟ้องแล้ว — พยานที่เพิ่มใหม่ในหน้านี้จะเข้า “บัญชีพยานเพิ่มเติม” โดยอัตโนมัติ (ปิดสวิตช์ “เพิ่มเติมภายหลังยื่นฟ้อง” ของรายนั้นได้ถ้าต้องการลงบัญชีเดิม)'
    : 'พยานที่ติดธง “เพิ่มเติมภายหลังยื่นฟ้อง” จะไม่อยู่ในบัญชีพยานเดิม แต่ไปลงบัญชีพยาน (เพิ่มเติม) ครั้งที่ … (ใช้แบบ ๑๕ เดียวกัน) โดยนับอันดับต่อจากบัญชีเดิม · เลขคดีที่ศาลให้ (ถ้ามี) ใส่ในหน้า “ข้อมูลคดี” เพื่อเติมลงหัวเอกสาร ไม่ใส่ก็ออกเอกสารได้ เว้นจุดไข่ปลาไว้ให้เขียนเติม';
  return `<div class="panel wit-panel">
    <h3>${icon('file', { size: 18 })}<span class="h-t">บัญชีพยาน (เพิ่มเติม): ${on ? extra.length : 0} รายการ</span><span class="grow"></span>${check('สร้างบัญชีพยานเพิ่มเติมอัตโนมัติ', 'docs.witnessExtra', { sw: true, rerender: true })}</h3>
    <p class="hint">${hint}</p>
    ${on ? `<div class="grid">${field('ครั้งที่ (บัญชีพยาน (เพิ่มเติม) ครั้งที่ …)', 'witnessExtraRound', { cls: 's6', ph: 'เว้นว่าง = จุดไข่ปลาให้เขียนเติม' })}</div>` : ''}
    ${!on ? `<div class="empty">${icon('file', { size: 22 })}<span>ปิดอยู่ — ไม่สร้างบัญชีพยานเพิ่มเติมในชุดเอกสาร</span></div>`
    : extra.length ? `<ul class="rows"><li><span class="st-ico ok" aria-hidden="true">${icon('check', { size: 15 })}</span>
        <span class="r-main">บัญชีพยานเพิ่มเติม · อันดับที่ ${extra[0].no}${extra.length > 1 ? `–${extra[extra.length - 1].no}` : ''}<span class="r-note">บัญชีเดิมมี ${base.length} อันดับ · ${extra.length} รายการเพิ่มเติม ลำดับนับต่อเนื่องกัน</span></span>
        <span class="r-act"><button type="button" class="btn sm outline" data-act="pvDoc" data-id="witnessExtra">${icon('eye', { size: 15 })}<span>ดูตัวอย่าง</span></button></span></li></ul>`
    : `<div class="empty">${icon('file', { size: 22 })}<span>ยังไม่มีพยานเพิ่มเติม — กด “เพิ่มพยานเพิ่มเติม” ด้านบน หรือเปิดสวิตช์ในรายการพยาน</span></div>`}
  </div>`;
}

/** กล่อง “ระบบสร้างหมายเรียกให้อัตโนมัติ”: รายการหมายที่จะออก + สวิตช์เปิด/ปิด */
function witnessSummonsPanel() {
  const c = S.c, on = c.docs.witnessSummons !== false, plan = witnessSummonsPlan(c);
  const civil = c.type === 'civil';
  const formName = (g) => (g.kind === 'person' ? 'แบบ ๑๖ หมายเรียกพยานบุคคล' : civil ? 'แบบ ๑๘ คำสั่งเรียกพยานเอกสาร/วัตถุ (คดีแพ่ง)' : 'แบบ ๑๗ หมายเรียกพยานเอกสาร/วัตถุ (คดีอาญา)');
  const row = (g) => {
    const lack = g.rows.some((r) => witLacksAddr(r.w));
    return `<li><span class="st-ico ${lack ? 'todo' : 'ok'}" aria-hidden="true">${lack ? icon('alert', { size: 15 }) : icon('check', { size: 15 })}</span>
      <span class="r-main">${esc(toThaiDigits(g.title))}<span class="r-note">${esc(formName(g))}${g.rows.length > 1 ? ` · รวม ${g.rows.length} รายการของผู้ครอบครองรายเดียวกัน` : ''}${lack ? ' · ยังไม่ระบุที่อยู่ (จะเว้นว่างให้เขียนเติม)' : ''}</span></span>
      <span class="r-act"><button type="button" class="btn sm outline" data-act="pvDoc" data-id="${esc(g.id)}">${icon('eye', { size: 15 })}<span>ดูตัวอย่าง</span></button></span></li>`;
  };
  return `<div class="panel wit-panel">
    <h3>${icon('send', { size: 18 })}<span class="h-t">ระบบสร้างหมายเรียกให้อัตโนมัติ: ${on ? plan.length : 0} ฉบับ</span><span class="grow"></span>${check('สร้างหมายเรียกพยานอัตโนมัติ', 'docs.witnessSummons', { sw: true, rerender: true })}</h3>
    <p class="hint">ระบบสร้างให้ฉบับละพยาน (พยานบุคคล = แบบ ๑๖ · เอกสาร/วัตถุ = ${civil ? 'แบบ ๑๘' : 'แบบ ๑๗'} ผู้ครอบครองรายเดียวกันรวมเป็นฉบับเดียว) ดึงศาล คู่ความ ทนายความ และวัน-เวลานัดมาเติมเอง · ถ้าโจทก์นำพยานมาเอง พิมพ์ “นำ” ในหมายเหตุของรายนั้น (หรือปิดสวิตช์ “ขอให้ศาลออกหมายเรียก”) — ระบบอ้างอิงหมายเหตุเป็นหลัก สวิตช์กับหมายเหตุจะตรงกันให้เอง</p>
    ${!on ? `<div class="empty">${icon('send', { size: 22 })}<span>ปิดอยู่ — ไม่สร้างหมายเรียกพยานในชุดเอกสาร</span></div>`
    : plan.length ? `<ul class="rows">${plan.map(row).join('')}</ul>` : `<div class="empty">${icon('send', { size: 22 })}<span>ยังไม่มีพยานที่ต้องออกหมายเรียก — เพิ่มพยานบุคคล เอกสาร หรือวัตถุด้านล่าง (ต้องระบุชื่อ/รายการก่อน)</span></div>`}
  </div>`;
}

function witnessFields(x, i) {
  const k = witnessKind(x), person = k === 'person', base = `witnesses.${i}`;
  const posHint = 'พิมพ์ในหมายเรียกเป็นบรรทัดใต้ชื่อ · ไม่บังคับ (เว้นว่าง = ไม่พิมพ์บรรทัดนี้)';
  // ชื่อ | ตำแหน่ง/ยศ แยกช่องกัน (จอกว้างอยู่แถวเดียวกัน 2 คอลัมน์) · ที่อยู่เป็นกลุ่มช่องของตัวเองด้านล่าง · โทรศัพท์ต่อท้ายกลุ่มที่อยู่
  return `<div class="grid">
      <div class="f s12 wit-kind" role="group" aria-label="ประเภทพยาน"><span>ประเภทพยาน</span>${seg(`${base}.kind`, [['person', 'พยานบุคคล'], ['document', 'พยานเอกสาร'], ['object', 'พยานวัตถุ']], { rerender: true, label: 'ประเภทพยาน' })}</div>
      ${person
    ? `${field('ชื่อและสกุลพยาน (ยศ/คำนำหน้า ถ้ามี)', `${base}.name`, { cls: 's6', required: true, ph: 'เช่น ร.ต.อ. ศุภชัย แช่มช้อย' })}
      ${field('ตำแหน่ง', `${base}.position`, { cls: 's6', ph: 'เช่น พนักงานสอบสวน สถานีตำรวจภูธร…', hint: posHint })}`
    : `${field(k === 'document' ? 'รายการเอกสาร (ชื่อ/ลักษณะเอกสาร)' : 'รายการวัตถุ (ชื่อ/ลักษณะวัตถุ)', `${base}.name`, { cls: 's12', required: true, ph: k === 'document' ? 'เช่น สัญญาเช่าฉบับลงวันที่ …' : 'เช่น โทรศัพท์มือถือ 1 เครื่อง' })}
      ${field('ผู้ครอบครอง (ผู้รับหมาย)', `${base}.holder`, { cls: 's6', ph: 'ชื่อบุคคล/หน่วยงานที่เก็บรักษา', hint: 'รายการที่ผู้ครอบครอง ตำแหน่ง และที่อยู่ตรงกัน ระบบรวมเป็นหมายฉบับเดียว' })}
      ${field('ตำแหน่งของผู้ครอบครอง', `${base}.holderPos`, { cls: 's6', ph: 'เช่น ผู้จัดการ บริษัท …', hint: posHint })}`}
    </div>
    <section class="grp wit-addr">${addressFields(`${base}.addr`, { title: person ? 'ที่อยู่พยาน (ใช้ในหมายเรียก)' : 'ที่อยู่ผู้ครอบครอง / ที่เก็บรักษา (ใช้ในหมายเรียก)', building: false })}
      <div class="grid wit-phone">${field('โทรศัพท์', `${base}.phone`, { cls: 's6' })}</div></section>
    ${(x.address || '').trim() ? `<section class="grp"><div class="grid">${field('ที่อยู่แบบข้อความรวม (ข้อมูลเดิม — ใช้เมื่อไม่ได้กรอกช่องที่อยู่ด้านบน)', `${base}.address`, { cls: 's12' })}</div></section>` : ''}
    <section class="grp"><div class="grid">
      ${person ? field('ประเด็นที่จะให้พยานเบิกความ (ไม่บังคับ — พิมพ์ลงช่องว่างด้านหลังหมายเรียก)', `${base}.purpose`, { cls: 's12', type: 'textarea', rows: 2 }) : ''}
      ${field('หมายเหตุ (ลงในบัญชีพยาน)', `${base}.note`, { cls: 's6', list: 'dl-wnote', ph: 'นำ / หมายเรียก', hint: `หมายเหตุเป็นหลัก: พิมพ์ “หมายเรียก” = ขอให้ศาลออกหมาย · “นำ” = โจทก์นำมาเอง (ไม่ออกหมาย) · เว้นว่างหรือข้อความอื่น = ตามสวิตช์ด้านขวา (ระบบเติม “หมายเรียก”/“นำ” ลงบัญชีพยานให้)${person ? ' · พยานเป็นเด็กอายุไม่เกิน ๑๘ ปี ให้ระบุในช่องนี้' : ''}` })}
      <div class="f s6"><span>หมายเรียก</span>${check('ขอให้ศาลออกหมายเรียกพยานรายนี้', `${base}.summons`, { sw: true, rerender: true })}</div>
      <div class="f s12"><span>บัญชีพยาน</span>${check('เพิ่มเติมภายหลังยื่นฟ้อง — ลงบัญชีพยาน (เพิ่มเติม) ครั้งที่ … ไม่ลงบัญชีพยานเดิม', `${base}.extra`, { sw: true, rerender: true })}</div>
    </div></section>`;
}

function tabWitness() {
  const w = S.c.witnesses;
  for (const x of w) { if (x.summons === undefined) x.summons = true; x.addr = { ...emptyAddress(), ...x.addr }; } // ข้อมูลเดิมไม่มีช่องใหม่ → เติมค่าเริ่มต้น
  const nPerson = w.filter((x) => witnessKind(x) === 'person').length;
  const unnamed = w.filter((x) => !(x.name || '').trim()).length;
  const filed = isFiled(S.c), nExtra = w.filter((x) => x.extra).length;
  return `${pageHead('บัญชีพยาน', 'แบบ ๑๕ — พยานบุคคลลงตาราง พยานเอกสาร/วัตถุแยกตาราง · พยานเพิ่มเติมหลังยื่นฟ้องใช้แบบเดียวกันเป็น “บัญชีพยาน (เพิ่มเติม) ครั้งที่ …” ·ระบบสร้างหมายเรียกพยาน (แบบ ๑๖ · ๑๗ · ๑๘) ให้อัตโนมัติ')}
  <datalist id="dl-wnote"><option value="นำ"><option value="หมายเรียก"><option value="เด็กอายุไม่เกิน 18 ปี"></datalist>
  <div class="toolbar wit-add n${filed ? 3 : 4}" role="group" aria-label="เพิ่มพยาน">
    <button class="btn outline" data-act="addWit" data-kind="person">${icon('plus', { size: 16 })}<span>พยานบุคคล</span></button>
    <button class="btn outline" data-act="addWit" data-kind="document">${icon('plus', { size: 16 })}<span>พยานเอกสาร</span></button>
    <button class="btn outline" data-act="addWit" data-kind="object">${icon('plus', { size: 16 })}<span>พยานวัตถุ</span></button>
    ${filed ? '' : `<button class="btn outline" data-act="addWit" data-kind="person" data-extra="1" title="พยานที่เพิ่มภายหลังยื่นฟ้อง — ลงบัญชีพยาน (เพิ่มเติม) ครั้งที่ …">${icon('plus', { size: 16 })}<span>พยานเพิ่มเติม</span></button>`}
    <select class="sel-inline wit-from" data-onchange="witFromParty" aria-label="เพิ่มพยานจากรายชื่อคู่ความ"><option value="">เพิ่มจากรายชื่อคู่ความ…</option>${S.c.parties.map((p) => `<option value="${esc(p.id)}">${esc(partyLabel(S.c, p))}: ${esc(partyName(p))}</option>`).join('')}</select>
  </div>
  <div class="panel compact">${check(sideOf(S.c) === 'defendant' ? 'จำเลยอ้างตนเองเป็นพยาน (ค่าเริ่มต้น — ใส่ชื่อจำเลยเป็นลำดับแรกในบัญชีพยานให้อัตโนมัติ)' : 'โจทก์อ้างตนเองเป็นพยาน (ค่าเริ่มต้น — ใส่ชื่อโจทก์เป็นลำดับแรกในบัญชีพยานให้อัตโนมัติ)', 'options.selfWitness', { rerender: true, sw: true })}</div>
  ${witnessExtraPanel()}
  ${witnessSummonsPanel()}
  ${w.length ? `<p class="hint list-count">${w.length} รายการที่เพิ่มเอง · พยานบุคคล ${nPerson} · เอกสาร/วัตถุ ${w.length - nPerson}${nExtra ? ` · เพิ่มเติมภายหลังยื่นฟ้อง ${nExtra}` : ''}${unnamed ? ` · ยังไม่ระบุชื่อ ${unnamed} (ยังไม่นับในบัญชีและไม่ออกหมาย)` : ''}</p>` : ''}
  ${w.length ? w.map((x, i) => disclose(`w:${x.id || i}`, `<span class="sum-main">${witSummary(x)}</span>
      <span class="sum-act"><button class="btn sm danger" data-act="delWit" data-i="${i}" aria-label="ลบพยานลำดับที่ ${i + 1}">${icon('trash', { size: 15 })}ลบ</button></span>`,
    witnessFields(x, i), { cls: 'item', open: !(x.name || '').trim(), attrs: `data-sum="wit" data-i="${i}"` })).join('') : emptyBox('ยังไม่มีพยานที่เพิ่มเอง — กดปุ่มด้านบนเพื่อเพิ่มพยานบุคคล เอกสาร หรือวัตถุ แล้วระบบจะสร้างหมายเรียกให้', 'users')}`;
}
actions.viewPdf = (el) => window.open(el.getAttribute('href'), '_blank');
// คดีที่ฟ้องแล้ว: พยานที่เพิ่มใหม่ถือเป็น “เพิ่มเติม” (บัญชีพยานเดิมยื่นไปแล้ว) · ยังไม่ฟ้อง: ปุ่ม “เพิ่มพยานเพิ่มเติม” ติดธงให้
actions.addWit = (el) => { S.c.witnesses.push(newWitness(el.dataset.kind, isFiled(S.c) || el.dataset.extra === '1')); rerender(); hooks.changed(); };
actions.delWit = (el) => { S.c.witnesses.splice(+el.dataset.i, 1); rerender(); hooks.changed(); };
actions.witFromParty = (el) => {
  const p = S.c.parties.find((x) => x.id === el.value);
  if (!p) return;
  S.c.witnesses.push({ ...newWitness('person', isFiled(S.c)), name: partyName(p), addr: { ...emptyAddress(), ...p.address }, phone: p.phone || '' });
  rerender(); hooks.changed();
};

// ===================== 8) คำร้อง =====================
function motionSummary(x, i) {
  return `<span class="sum-title">ฉบับที่ ${i + 1}</span><span class="sum-name">${(x.title || '').trim() ? esc(x.title) : '<em>ยังไม่ระบุเรื่อง</em>'}</span>`;
}

function tabMotions() {
  const m = S.c.motions;
  return `${pageHead('คำร้อง / คำแถลง / คำขอ', 'นอกเหนือจากคำร้องส่งหมาย — แต่ละฉบับออกเป็นเอกสารแยก')}
  ${varsPanel()}
  <div class="panel"><h3>เพิ่มคำร้อง</h3>
    <div class="row"><select id="motion-tpl" class="sel-grow" aria-label="แม่แบบคำร้อง"><option value="">เลือกแม่แบบคำร้อง / คำแถลง (${tplMotions().length} แบบ)…</option>${MOTION_KINDS_ALL.map((k) => { const l = tplMotions().filter((x) => x.kind === k); return l.length ? `<optgroup label="${esc(k)} (${l.length})">${l.map((x) => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>
      <button class="btn outline" data-act="addMotionTpl">เพิ่มจากแม่แบบ</button>
      <button class="btn outline" data-act="addMotion">${icon('plus', { size: 16 })}คำร้องเปล่า</button></div>
    <div class="caution">${icon('alert', { size: 18 })}<div>แม่แบบเขียนขึ้นเองตามโครงเอกสารทั่วไป เลขมาตราที่อ้างยังไม่ผ่านการตรวจกับแหล่งทางการ ตรวจก่อนยื่นทุกครั้ง</div></div></div>
  ${m.length ? m.map((x, i) => disclose(`m:${x.id || i}`, `<span class="sum-main">${motionSummary(x, i)}</span>
      <span class="sum-act"><button class="btn sm danger" data-act="delMotion" data-i="${i}" aria-label="ลบคำร้องฉบับที่ ${i + 1}">${icon('trash', { size: 15 })}ลบ</button></span>`, `
    <div class="grid">${select('ประเภทเอกสาร (คำที่ไม่ใช้จะถูกขีดฆ่าที่หัวเอกสาร)', `motions.${i}.kind`, MOTION_KINDS_ALL, { cls: 's6', rerender: true, value: x.kind || 'คำร้อง' })}
    ${field('เรื่อง (แสดงใต้หัวเอกสาร)', `motions.${i}.title`, { cls: 's12', ph: 'เช่น ส่งหมายข้ามเขตและปิดหมาย' })}
    ${field('เนื้อหา', `motions.${i}.text`, { cls: 's12', type: 'textarea', rows: 9, hint: 'แบ่งข้อโดยเว้นบรรทัดว่าง — ระบบใส่ “ข้อ ๑ ๒ …” ให้' })}</div>
    <div class="snip-wrap">${snippetPicker(['motion'], 'snipMotion', 'แทรกข้อความสำเร็จรูปลงฉบับนี้').replace('data-act="snipMotion"', `data-act="snipMotion" data-i="${i}"`)}</div>`,
  { cls: 'item', open: !(x.title || x.text), attrs: `data-sum="motion" data-i="${i}"` })).join('') : emptyBox('ยังไม่มีคำร้อง — เลือกแม่แบบหรือเพิ่มคำร้องเปล่าด้านบน', 'file')}`;
}
const tplData = () => S.data.templates || { motions: [], answers: [], settlements: [] };
const tplMotions = () => [...(sideOf(S.c) === 'defendant' ? DEF_MOTIONS : []), ...(tplData().motions || [])].filter((x) => x.caseType === 'any' || x.caseType === S.c.type);
actions.addMotionTpl = () => {
  const tpl = tplMotions().find((x) => x.id === document.getElementById('motion-tpl')?.value);
  if (!tpl) return hooks.toast('เลือกแม่แบบก่อน');
  S.c.motions.push({ id: uid(), kind: tpl.kind, title: tpl.title, text: tpl.text });
  rerender(); hooks.changed(); hooks.toast('เพิ่มคำร้องแล้ว — กรอกช่องสีเหลือง');
};

// ===================== 8.5) คำให้การจำเลย & สัญญาประนีประนอมยอมความ =====================
function tabExtras() {
  const c = S.c, T = tplData();
  const ans = (T.answers || []).filter((x) => x.caseType === c.type);
  const sets = (T.settlements || []).filter((x) => x.caseType === c.type);
  const dfs = defendants(c);
  return `${pageHead('คำให้การ & สัญญาประนีประนอม', 'คำให้การจำเลย (แบบ ๑๑) และสัญญาประนีประนอมยอมความ (แบบ ๒๙) ใช้ข้อมูลคู่ความชุดเดียวกัน')}
  ${varsPanel()}
  <div class="panel"><h3>คำให้การจำเลย (แบบ ๑๑)<span class="grow"></span>${check('ออกในชุดเอกสาร', 'docs.answer', { rerender: true, sw: true })}</h3>
    ${group('จำเลยและแม่แบบ', `
      <label class="f s6"><span>จำเลยผู้ให้การ</span><select data-bind="answer.defendantId" data-rerender="1">${dfs.map((d) => `<option value="${esc(d.id)}" ${c.answer.defendantId === d.id ? 'selected' : ''}>${esc(partyLabel(c, d))}: ${esc(partyName(d))}</option>`).join('')}</select></label>
      <label class="f s6"><span>แม่แบบ</span><select id="ans-tpl"><option value="">เลือกแม่แบบคำให้การ…</option>${ans.map((x) => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('')}</select></label>
      <div class="f s12"><div><button class="btn outline" data-act="useAnswerTpl">ใช้แม่แบบนี้ (แทนที่ข้อความ)</button></div></div>`)}
    ${group('ข้อความ', field('ข้อความคำให้การ (แยกข้อด้วยบรรทัดว่าง)', 'answer.text', { cls: 's12', type: 'textarea', rows: 9 }))}</div>
  <div class="panel"><h3>สัญญาประนีประนอมยอมความ (แบบ ๒๙)<span class="grow"></span>${check('ออกในชุดเอกสาร', 'docs.settlement', { rerender: true, sw: true })}</h3>
    ${group('แม่แบบ', `
      <label class="f s8"><span>แม่แบบ</span><select id="set-tpl"><option value="">เลือกแม่แบบสัญญา…</option>${sets.map((x) => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('')}</select></label>
      <div class="f s4 f-end"><button class="btn outline" data-act="useSettlementTpl">ใช้แม่แบบนี้</button></div>
      ${field('เรื่อง', 'settlement.subject', { cls: 's12', ph: 'เช่น ผิดสัญญากู้ยืมเงิน' })}`)}
    <section class="grp"><div class="grp-t">ข้อตกลง</div>${itemEditor('settlement.clauses', 'ข้อ', 'ยังไม่มีข้อตกลง — เลือกแม่แบบด้านบน หรือกด “เพิ่มข้อตกลง”')}
      <div class="toolbar foot"><button class="btn outline" data-act="addItem" data-list="settlement.clauses">${icon('plus', { size: 16 })}เพิ่มข้อตกลง</button></div></section></div>`;
}
actions.useAnswerTpl = () => {
  const tpl = (tplData().answers || []).find((x) => x.id === document.getElementById('ans-tpl')?.value);
  if (!tpl) return hooks.toast('เลือกแม่แบบก่อน');
  S.c.answer.text = tpl.text;
  if (!S.c.answer.defendantId) S.c.answer.defendantId = defendants(S.c)[0]?.id || '';
  S.c.docs.answer = true; rerender(); hooks.changed();
};
actions.useSettlementTpl = () => {
  const tpl = (tplData().settlements || []).find((x) => x.id === document.getElementById('set-tpl')?.value);
  if (!tpl) return hooks.toast('เลือกแม่แบบก่อน');
  S.c.settlement.templateId = tpl.id;
  S.c.settlement.subject = tpl.subject || S.c.settlement.subject;
  S.c.settlement.clauses = tpl.clauses.map((text) => ({ id: uid(), text }));
  S.c.docs.settlement = true; rerender(); hooks.changed();
};
actions.addMotion = () => { S.c.motions.push({ id: uid(), title: '', text: '' }); rerender(); hooks.changed(); };
actions.delMotion = (el) => { S.c.motions.splice(+el.dataset.i, 1); rerender(); hooks.changed(); };
actions.snipMotion = (el) => {
  const s = snippetById(el.parentElement?.querySelector('select')?.value || '');
  if (!s) return;
  const m = S.c.motions[+el.dataset.i];
  m.text = (m.text ? m.text + '\n\n' : '') + s.text;
  rerender(); hooks.changed();
};
// ===================== 9) ออกเอกสาร =====================
const REQUIRED = () => {
  const c = S.c, sm = serviceMode(c);
  const rows = [
    { label: 'คำฟ้อง', tab: 'complaint', ok: hasText(c.facts) && (c.type === 'civil' || c.charges.length > 0), note: hasText(c.facts) ? (c.type === 'civil' || c.charges.length ? '' : 'ยังไม่ได้เลือกข้อหา') : 'ยังไม่มีข้อเท็จจริง' },
    { label: 'คำขอท้ายคำฟ้อง', tab: 'prayer', ok: hasText(c.prayers), note: hasText(c.prayers) ? '' : 'ยังไม่มีคำขอ' },
    { label: 'คำร้องส่งหมายนอกเขต / ปิดหมาย', tab: 'service', ok: sm !== 'none', note: sm === 'none' ? 'เลือก “ไม่ต้องขอ” ไว้' : '' },
    { label: 'บัญชีพยาน', tab: 'witness', ok: c.witnesses.some((w) => w.kind === 'person' && (w.name || '').trim()), note: 'ต้องมีพยานบุคคลอย่างน้อย 1 คน' },
  ];
  if (plaintiffs(c).length > 1 || defendants(c).length > 1) rows.splice(1, 0, { label: 'เอกสารแนบท้ายคำฟ้อง (รายละเอียดคู่ความหลายคน)', tab: 'parties', ok: c.docs.attachment !== false, note: 'สร้างอัตโนมัติเมื่อมีโจทก์/จำเลยมากกว่าหนึ่งคน' });
  if (c.type === 'criminal') rows.push({ label: 'หมายนัดไต่สวนมูลฟ้อง (ร่าง)', tab: 'summons', ok: c.docs.summons !== false, note: c.hearing.date ? '' : 'ยังไม่ระบุวันนัด' });
  return rows;
};

const ISSUE_ICON = { error: ['err', ix('alertCircle')], warn: ['warn', ix('alert')], info: ['info', ix('info')] };
function tabExport() {
  const c = S.c;
  const issues = validateCase(c, S.idx);
  const errs = issues.filter((x) => x.level === 'error'), warns = issues.filter((x) => x.level === 'warn'), infos = issues.filter((x) => x.level === 'info');
  const tabNames = { case: 'ข้อมูลคดี', parties: 'คู่ความ', counsel: 'ทนายความ', charges: 'คำฟ้อง', facts: 'คำฟ้อง', complaint: 'คำฟ้อง', prayer: 'คำขอท้ายฟ้อง', witness: 'บัญชีพยาน' };
  const req = REQUIRED(), reqOk = req.filter((r) => r.ok).length;
  const tone = errs.length ? 'err' : warns.length ? 'warn' : 'ok';
  const issueRow = (x) => `<li><span class="st-ico ${ISSUE_ICON[x.level][0]}" aria-hidden="true">${ISSUE_ICON[x.level][1]}</span><span class="r-main">${esc(x.msg)}</span>
      <span class="r-act"><button class="btn sm outline" data-act="goTab" data-tab="${esc(x.tab)}"><span>ไปที่${tabNames[x.tab] ? ' ' + tabNames[x.tab] : ''}</span>${ix('arrowRight')}</button></span></li>`;
  const issueGroup = (title, list) => list.length ? `<div class="iss-h">${title} <span class="pill ${title === 'ต้องแก้' ? 'err' : 'warn'}">${list.length}</span></div><ul class="rows">${list.map(issueRow).join('')}</ul>` : '';
  const filed = isFiled(c);
  // คดีที่ฟ้องแล้ว: กลุ่ม “เอกสารหลังยื่นฟ้อง” อยู่บนสุด (ก่อนชุดคำฟ้อง) — ยังไม่ฟ้องคงลำดับเดิม
  const nSum = witnessSummonsPlan(c).length, nExtra = witnessList(c, 'extra').length, nMot = c.motions.length;
  const postRow = (label, note, n, tab, btn) => `<li><span class="st-ico ${n ? 'ok' : 'todo'}" aria-hidden="true">${n ? ix('check') : ix('circle')}</span>
      <span class="r-main">${esc(label)}<span class="r-note">${esc(note)}</span></span>
      <span class="r-act"><button class="btn sm outline" data-act="goTab" data-tab="${tab}"><span>${btn}</span>${ix('arrowRight')}</button></span></li>`;
  const postPanel = filed ? `<div class="panel post-docs"><h3>เอกสารหลังยื่นฟ้อง<span class="grow"></span><span class="pill ok">${esc(filedBadge(c))}</span></h3>
    <p class="hint panel-note">พิมพ์เลขคดีที่ศาลให้บนหัวเอกสารทุกฉบับ — เตรียมหมายเรียกพยาน บัญชีพยานเพิ่มเติม และคำร้อง/คำแถลงได้จากกลุ่มนี้</p>
    <ul class="rows">
      ${postRow('หมายเรียกพยาน (แบบ ๑๖ · ๑๗ · ๑๘)', nSum ? `${nSum} ฉบับ — สร้างอัตโนมัติจากรายการพยาน` : 'ยังไม่มีพยานที่ต้องออกหมายเรียก', nSum, 'witness', nSum ? 'ดู/แก้พยาน' : 'เพิ่มพยาน')}
      ${postRow('บัญชีพยาน (เพิ่มเติม) ครั้งที่ …',nExtra ? `${nExtra} รายการ · อันดับต่อจากบัญชีเดิม` : 'ยังไม่มีพยานเพิ่มเติม', nExtra, 'witness', nExtra ? 'ดู/แก้พยาน' : 'เพิ่มพยาน')}
      ${postRow('คำร้อง / คำแถลง / คำขอ', nMot ? `${nMot} ฉบับ` : 'ยังไม่มีคำร้องหรือคำแถลง', nMot, 'motions', nMot ? 'ดู/แก้' : 'เพิ่มคำร้อง')}
    </ul>
    <div class="doc-pick">${POST_FILING_KEYS.map((k) => DOC_TYPES.find((d) => d.key === k)).map((d) => check(esc(d.label), `docs.${d.key}`, { rerender: true })).join('')}</div>
    <div class="dl-sub">เอกสารหลังยื่นฟ้องที่จะออก — แยกทีละฉบับ</div>
    <div id="doclist-post"></div></div>` : '';
  const packTypes = DOC_TYPES.filter((d) => (d.key !== 'summons' || c.type === 'criminal') && !(filed && POST_FILING_KEYS.includes(d.key)));
  return `${pageHead('ออกเอกสาร', 'ตรวจความครบถ้วน เลือกชุดเอกสาร แล้วกด “ดู PDF” เพื่อตรวจหน้าตาเอกสารก่อน จากนั้นบันทึกเป็น PDF')}
  <div class="status-bar ${tone}" role="status"><span class="sb-ico" aria-hidden="true">${tone === 'ok' ? ix('checkCircle') : ix('alertCircle')}</span>
    <div class="sb-txt"><div class="big">${errs.length ? `${errs.length} จุดต้องแก้ก่อนยื่น` : warns.length ? `พร้อมออกเอกสาร — มี ${warns.length} ข้อควรตรวจ` : 'พร้อมออกเอกสาร'}</div>
    <div class="hint">เอกสารขั้นต่ำครบ ${reqOk} จาก ${req.length} รายการ</div></div></div>
  ${postPanel}
  <div class="panel"><h3>${filed ? 'ชุดคำฟ้อง · ' : ''}เอกสารขั้นต่ำสำหรับฟ้อง 1 คดี<span class="grow"></span><span class="pill ${reqOk === req.length ? 'ok' : 'warn'}">${reqOk}/${req.length}</span></h3>
    <ul class="rows rows-req">${req.map((r) => `<li><span class="st-ico ${r.ok ? 'ok' : 'todo'}" aria-hidden="true">${r.ok ? ix('check') : ix('circle')}</span>
      <span class="r-main">${esc(r.label)}${r.note ? `<span class="r-note">${esc(r.note)}</span>` : ''}<span class="vh">${r.ok ? ' — พร้อม' : ' — ยังไม่ครบ'}</span></span>
      <span class="r-act"><button class="btn sm ${r.ok ? 'outline' : 'primary'}" data-act="goTab" data-tab="${r.tab}"><span>${r.ok ? 'ดู' : 'ไปกรอก'}</span>${ix('arrowRight')}</button></span></li>`).join('')}</ul></div>
  <div class="panel"><h3>ประเด็นที่ต้องตรวจ</h3>
    ${issues.length ? `${issueGroup('ต้องแก้', errs)}${issueGroup('ควรตรวจ', warns)}
      ${infos.length ? disclose('iss:info', `ข้อมูลเพิ่มเติม (${infos.length})`, `<ul class="rows">${infos.map(issueRow).join('')}</ul>`, { cls: 'iss-fold', open: false }) : ''}`
    : `<ul class="rows"><li><span class="st-ico ok" aria-hidden="true">${ix('check')}</span><span class="r-main">ข้อมูลครบถ้วน ไม่พบประเด็นที่ต้องแก้</span></li></ul>`}</div>
  <div class="panel"><h3>${filed ? 'เลือกเอกสารในชุดคำฟ้อง' : 'เลือกเอกสารในชุด'}</h3>
    <div class="doc-pick">${packTypes.map((d) => check(esc(d.label), `docs.${d.key}`, { rerender: true })).join('')}</div></div>
  <div class="panel"><h3>ดาวน์โหลด</h3>
    <div class="dl-main"><div class="btn-group"><button class="btn primary" data-act="printAll">${ix('print')}<span>ดู PDF ทั้งชุด</span></button>
      <button class="btn outline" data-act="dlJson">${ix('download')}<span>ข้อมูลคดี (.json)</span></button></div>
      <p class="hint">เปิดดูเอกสารในหน้านี้ได้เลย ไม่ดาวน์โหลดลงเครื่อง — พอตรวจแล้วกด “พิมพ์ / บันทึกเป็น PDF” (ตั้งกระดาษ A4 และปิด “ส่วนหัวและท้ายกระดาษ”)</p></div>
    <div class="dl-sub">${filed ? 'ชุดคำฟ้อง — แยกทีละฉบับ' : 'แยกทีละฉบับ'}</div>
    <div id="doclist"></div></div>
  ${sharePanel()}`;
}

// ===================== 10) ตำรากฎหมาย =====================
function tabRef() {
  const q = S.ui.refQ.trim().toLowerCase();
  const kinds = [['items', 'ข้อหา / มูลคดี'], ['sections', 'มาตราวิธีพิจารณา'], ['precedents', 'ฎีกา'], ['snippets', 'ข้อความสำเร็จรูป']];
  const LIMIT = 80;
  let html = '', total = 0, empty = 'ไม่พบรายการ';
  // การ์ดผลลัพธ์: ป้ายมาตรา + ชื่อ + (ป้ายสถานะ) / เนื้อหา (ย่อไว้ กด “ดูทั้งหมด”) / ข้อมูลประกอบ
  const card = ({ tag, title, flag = '', text = '', meta = '', extra = '' }) => `<article class="ref-item"><div class="ref-h">${tag ? `<span class="ref-tag">${esc(tag)}</span>` : ''}<b class="ref-t">${esc(title)}</b>${flag}</div>${text ? `<p class="ref-text">${esc(text)}</p>` : ''}${meta ? `<div class="ref-meta">${esc(meta)}</div>` : ''}${extra}${text.length > 220 ? `<button type="button" class="link-btn ref-more" data-act="toggleRef" aria-expanded="false">ดูทั้งหมด</button>` : ''}</article>`;
  if (S.ui.refKind === 'items') {
    const all = S.data.items.filter((it) => !q || `${it.section} ${it.name} ${it.category || ''} ${it.text || ''}`.toLowerCase().includes(q)); total = all.length;
    html = all.slice(0, LIMIT).map((it) => card({ tag: `${S.idx.laws.get(it.lawId)?.short || ''} มาตรา ${it.section}`.trim(), title: it.name, flag: it.verified === false ? badge('ยังไม่ตรวจ', 'err') : '', text: it.text || '', meta: it.penalty || it.limitation || '' })).join('');
  } else if (S.ui.refKind === 'sections') {
    const all = (S.data.procedure.sections || []).filter((s) => !q || `${s.section} ${s.title} ${s.summary}`.toLowerCase().includes(q)); total = all.length;
    html = all.slice(0, LIMIT).map((s) => card({ tag: `${(S.data.procedure.laws || []).find((x) => x.id === s.law)?.short || s.law} มาตรา ${s.section}`, title: s.title, flag: s.verified === false ? badge('ยังไม่ตรวจ', 'err') : '', text: s.summary || '' })).join('');
  } else if (S.ui.refKind === 'precedents') {
    const all = (S.data.precedents || []).filter((p) => !q || `${p.caseNo} ${p.topic} ${p.holding} ${p.itemId}`.toLowerCase().includes(q)); total = all.length;
    empty = 'ยังไม่มีข้อมูลฎีกา';
    html = all.slice(0, LIMIT).map((p) => card({ tag: 'ฎีกา', title: p.caseNo, flag: p.verified === false ? badge('ยังไม่ยืนยัน', 'err') : badge('ตรวจแล้ว', 'ok'), text: p.topic || '', meta: p.holding || '', extra: /^https?:/.test(p.source || '') ? `<a class="lnk ref-src" href="${esc(p.source)}" target="_blank" rel="noopener">แหล่งอ้างอิง${ix('external')}</a>` : '' })).join('');
  } else {
    const all = (S.data.procedure.snippets || []).filter((s) => !q || `${s.title} ${s.text}`.toLowerCase().includes(q)); total = all.length;
    html = all.map((s) => card({ tag: s.docType || '', title: s.title, text: s.text || '', meta: (s.refs || []).join(', ') })).join('');
  }
  const shown = Math.min(total, S.ui.refKind === 'snippets' ? total : LIMIT);
  return `${pageHead('ตำรากฎหมาย', 'ค้นมาตราและข้อความสำเร็จรูปที่ระบบใช้ — รายการป้ายแดง “ยังไม่ตรวจ” ต้องตรวจกับกฎหมายฉบับปัจจุบันก่อนใช้')}
  <div class="toolbar ref-bar"><label class="ref-search">${ix('search')}<input type="search" id="ref-q" data-oninput="setRefQ" value="${esc(S.ui.refQ)}" placeholder="ค้นหา เช่น ชื่อข้อหา เลขมาตรา" aria-label="ค้นหาในตำรากฎหมาย"></label>${seg('@ui.refKind', kinds, { rerender: true, label: 'หมวดข้อมูล' })}</div>
  <div class="ref-count" role="status" aria-live="polite">${total ? `แสดง ${shown} จาก ${total} รายการ${q ? ` ที่ตรงกับ “${esc(S.ui.refQ.trim())}”` : ''}` : ''}</div>
  <div class="ref-list" id="ref-list">${html || `<div class="empty">${ix('search', { size: 22 })}<span>${empty}</span></div>`}</div>`;
}
actions.toggleRef = (el) => { const it = el.closest('.ref-item'); const o = it.classList.toggle('open'); el.setAttribute('aria-expanded', String(o)); el.textContent = o ? 'ย่อ' : 'ดูทั้งหมด'; };
actions.setRefQ = (el) => { S.ui.refQ = el.value; clearTimeout(actions._rt); actions._rt = setTimeout(() => { const keep = el.selectionStart; rerender(); const n = document.getElementById('ref-q'); n?.focus(); n?.setSelectionRange(keep, keep); }, 250); };

// ===================== หน้า: คำฟ้อง (รวมข้อหา + ข้อเท็จจริง) =====================
const asPart = (html) => html.replace('<h2>', '<h3 class="part">').replace('</h2>', '</h3>');

function tabComplaint() {
  return `${pageHead('คำฟ้อง (แบบ ๔)', 'เลือกข้อหาหรือมูลคดี แล้วปรับข้อเท็จจริงเป็น “ข้อ ๑ ๒ …” ตัวอย่างด้านขวาเปลี่ยนตามทันที')}
  ${asPart(tabCharges())}<hr class="part-sep">${asPart(tabFacts())}`;
}

// ค่านำหมาย: จำเลยคนเดียว = กรอกอัตราเอง · จำเลยหลายคน = บวกค่านำหมายของจำเลยแต่ละคน แสดงยอดรวมแก้เองไม่ได้
function feeBlock() {
  const fi = serviceFeeInfo(S.c), baht = (n) => n.toLocaleString('th-TH');
  if (!fi.multi) return field('อัตราค่านำหมาย (บาท)', 'service.fee', { cls: 's6', type: 'number' });
  const rows = defendants(S.c).map((d) => `<li><span>${esc(partyLabel(S.c, d))}${partyName(d) ? ` · ${esc(partyName(d))}` : ''}</span><b>${baht(fi.unit)} บาท</b></li>`).join('');
  return `<div class="f s12 fee-sum"><span>ค่านำหมายรวม (บวกของจำเลยแต่ละคน — แก้ยอดรวมเองไม่ได้)</span>
    <ul class="fee-list">${rows}</ul>
    <div class="fee-total"><span>รวม ${fi.n} คน</span><output aria-live="polite"><b>${baht(fi.total)}</b> บาท</output></div>
    <p class="hint flush">อัตราต่อจำเลย 1 คนตั้งไว้ ${baht(fi.unit)} บาท ยอดรวมคำนวณตามจำนวนจำเลยและใส่ในคำร้องให้เอง</p></div>`;
}

// ===================== หน้า: คำร้องส่งหมายนอกเขต / ปิดหมาย =====================
function tabService() {
  const c = S.c, sv = c.service, mode = serviceMode(c);
  const adv = serviceAdvice(c, S.data);
  const auto = sv.auto !== false;
  const addr = (d) => [d.address.sub && 'ต.' + d.address.sub, d.address.district && 'อ.' + d.address.district, d.address.province && 'จ.' + d.address.province].filter(Boolean).join(' ');
  let advice;
  if (adv.status === 'same') advice = `<div class="advice ok"><b>ฟ้องและส่งหมายที่ศาลเดียวกัน → ปิดหมายอย่างเดียว</b><p>จำเลยทุกคนมีภูมิลำเนาอยู่ในเขตอำนาจของ ${esc(c.court)} ไม่ต้องส่งหมายผ่านศาลอื่น หากเจ้าพนักงานส่งไม่ได้ จึงขอปิดหมาย ณ ภูมิลำเนา</p></div>`;
  else if (adv.status === 'outside') advice = `<div class="advice warn"><b>ฟ้องอีกศาล ส่งหมายอีกศาล → ส่งหมายข้ามเขต</b>
      <p>ฟ้องที่ ${esc(c.court)} แต่${adv.rows.filter((r) => r.known && !r.inside).map((r) => `${esc(partyLabel(c, r.party))} (${esc(addr(r.party))}) อยู่ในเขตของ ${esc(r.dest || 'ศาลอื่น')}`).join(' · ')}</p>
      <p>จึงขอให้ศาลส่งสำเนาคำฟ้องและหมายไปยัง <b>${esc(adv.court)}</b> เพื่อส่งให้จำเลย และขอปิดหมายหากส่งไม่ได้</p></div>`;
  else advice = `<div class="advice"><b>ยังตัดสินอัตโนมัติไม่ได้</b><p>ต้องเลือกศาลที่ฟ้อง และกรอกจังหวัด/อำเภอ(เขต)ภูมิลำเนาจำเลยในหน้า “คู่ความ” ระบบจะเทียบกับเขตอำนาจศาลให้ ระหว่างนี้เลือกรูปแบบเอง${adv.rows.some((r) => !r.known) ? ' (ไม่พบอำเภอ/เขตของจำเลยบางคนในข้อมูลเขตอำนาจ)' : ''}</p></div>`;
  const modeName = { 'cross-post': 'ส่งนอกเขต + ปิดหมาย', post: 'ปิดหมายอย่างเดียว', cross: 'ส่งนอกเขตอย่างเดียว', none: 'ไม่ต้องขอ' }[mode];
  const preview = serviceMotionText(c, S.data).split('\n\n').map((x) => `<p>${esc(x).replace(/\{\{([^}]+)\}\}/g, '<mark>[$1]</mark>')}</p>`).join('');
  return `${pageHead('คำร้องส่งหมายนอกเขต / ปิดหมาย', 'แบบ ๗ — เทียบภูมิลำเนาจำเลยกับเขตศาล แล้วเลือกรูปแบบการส่งหมายและเขียนข้อความให้')}
  <div class="panel"><h3>รูปแบบการส่งหมาย</h3>
    ${advice}
    <div class="svc-auto">${check('เลือกให้อัตโนมัติตามภูมิลำเนาจำเลย (ปิดเพื่อเลือกเอง)', 'service.auto', { rerender: true, sw: true })}</div>
    ${auto ? `<p class="hint flush">รูปแบบที่ใช้: <b>${esc(modeName)}</b>${sv.court ? ` · ส่งผ่าน <b>${esc(sv.court)}</b>` : ''}</p>`
      : seg('service.mode', [['cross-post', 'ส่งนอกเขต + ปิดหมาย'], ['post', 'ปิดหมายอย่างเดียว'], ['cross', 'ส่งนอกเขตอย่างเดียว'], ['none', 'ไม่ต้องขอ']], { rerender: true })}
    ${mode !== 'none' ? group('รายละเอียด', `
      ${field('วันนัดไต่สวนมูลฟ้อง / วันนัด (ถ้าศาลกำหนดแล้ว)', 'hearing.date', { type: 'date', cls: 's6' })}
      ${mode.includes('cross') && !auto ? field('ศาลปลายทางที่จะส่งหมาย', 'service.court', { cls: 's6', list: 'dl-court2', ph: 'เช่น ศาลจังหวัดเชียงราย' }) : ''}
      ${mode.includes('post') ? feeBlock() : ''}`, { cls: 'gap-top' }) : ''}
    <datalist id="dl-court2">${courtOptions().map((n) => `<option value="${esc(n)}">`).join('')}</datalist></div>
  ${mode !== 'none' ? `<div class="panel"><h3>ข้อความในคำร้อง
      <span class="grow"></span>${sv.custom ? '<button class="btn sm outline" data-act="resetServiceText">ใช้ข้อความอัตโนมัติ</button>' : '<button class="btn sm outline" data-act="editServiceText">แก้ไขข้อความเอง</button>'}</h3>
    ${sv.custom ? field('ข้อความ (แยกข้อด้วยบรรทัดว่าง)', 'service.text', { cls: 's12', type: 'textarea', rows: 12 }) : `<div class="prose">${preview}</div><p class="hint">ข้อความสร้างจากข้อมูลคู่ความ ข้อหา และวันนัด — เปลี่ยนข้อมูลแล้วข้อความอัปเดตเอง</p>`}
  </div>` : emptyBox('ไม่ออกคำร้องส่งหมายในชุดนี้', 'send')}`;
}
actions.editServiceText = () => { S.c.service.custom = true; S.c.service.text = serviceMotionText(S.c, S.data); rerender(); hooks.changed(); };
actions.resetServiceText = async () => {
  if (!(await confirmBox('ข้อความที่แก้ไขเองจะถูกแทนด้วยข้อความอัตโนมัติ', { title: 'ใช้ข้อความอัตโนมัติ', okText: 'ใช้ข้อความอัตโนมัติ' }))) return;
  S.c.service.custom = false; rerender(); hooks.changed();
};

// ===================== หน้า: หมายนัดไต่สวนมูลฟ้อง =====================
function tabSummons() {
  return `${pageHead('หมายนัดไต่สวนมูลฟ้อง (แบบ ๑๙ ตรี)', 'ศาลเป็นผู้ออกหมายนี้ — ระบบเตรียมร่างให้ ระบุวันนัดเมื่อศาลกำหนดแล้ว')}
  <div class="panel"><h3>วันนัด</h3>
    ${group('', `
    ${field('วันนัดไต่สวนมูลฟ้อง', 'hearing.date', { type: 'date', cls: 's6' })}
    ${field('เวลา (น.)', 'hearing.time', { cls: 's6', ph: '09.00' })}`)}
    <p class="hint">การขอให้ศาลออกหมายนัดไต่สวนมูลฟ้อง/หมายเรียก เลือกได้ที่หน้า “คำขอท้ายฟ้อง”</p>
    <div class="panel-foot">${check('ออกร่างหมายนัดนี้ในชุดเอกสาร', 'docs.summons', { sw: true })}</div></div>`;
}

// ===================== หน้า: ข้อความในแบบฟอร์ม (แก้แม่แบบ) =====================
// แถบสลับ 3 หน้าในกลุ่ม “ตั้งค่า & แม่แบบ” (เมนูซ้ายเหลือรายการเดียว — ดู NAV)
const SETTINGS_TABS = [['formtext', 'ข้อความในแบบฟอร์ม'], ['layout', 'ตำแหน่ง & ตราครุฑ'], ['forms', 'แบบพิมพ์ศาล']];
/** แถบสลับ 3 หน้าในรายการเมนู “ตั้งค่า & แม่แบบ” (เมนูซ้ายมีรายการเดียว — ดู NAV) */
function settingsBar(active) {
  return `<nav class="subtabs" aria-label="ตั้งค่า & แม่แบบ">${SETTINGS_TABS.map(([k, l]) =>
    `<button type="button" class="${k === active ? 'on' : ''}" data-act="goTab" data-tab="${k}" ${k === active ? 'aria-current="page"' : ''}>${ix({ formtext: 'type', layout: 'layout', forms: 'file' }[k])}<span>${l}</span></button>`).join('')}</nav>`;
}

/** โครงหน้าแบบพอดีจอ: หัว/แถบเครื่องมืออยู่กับที่ เนื้อหาเลื่อนเฉพาะในกรอบของตัวเอง (ถ้ายาวเกิน) ปุ่มบันทึกอยู่ล่างสุด */
function fit(head, body, foot = '', label = 'เนื้อหา') {
  return `<div class="fit"><div class="fit-head">${head}</div><div class="fit-body" tabindex="0" role="region" aria-label="${esc(label)}">${body}</div>${foot ? `<div class="fit-foot">${foot}</div>` : ''}</div>`;
}

const ftIsMod = (x) => { const ov = S.data.formText || {}; return Object.prototype.hasOwnProperty.call(ov, x.key) && ov[x.key] !== x.value; };
const ftModCount = () => FORM_TEXT.filter(ftIsMod).length;

function tabFormText() {
  const ov = S.data.formText || {};
  const q = (S.ui.ftQ || '').trim().toLowerCase();
  const groups = [...new Set(FORM_TEXT.map((x) => x.group))];
  const gi = Math.min(Math.max(+S.ui.ftGroup || 0, 0), groups.length - 1);
  const curOf = (x) => (Object.prototype.hasOwnProperty.call(ov, x.key) ? ov[x.key] : x.value);
  const list = q ? FORM_TEXT.filter((x) => `${x.label} ${x.group} ${curOf(x)}`.toLowerCase().includes(q)) : FORM_TEXT.filter((x) => x.group === groups[gi]);
  const item = (x) => {
    const id = 'ft-' + x.key.replace(/\W/g, '_');
    return `<div class="ft-item" ${ftIsMod(x) ? 'data-mod="1"' : ''}><div class="ft-h"><label for="${esc(id)}">${esc(x.label)}</label>${q ? `<span class="hint">${esc(x.group)}</span>` : ''}${badge('แก้แล้ว', 'warn')}<span class="grow"></span>
      <button type="button" class="link-btn" data-act="resetFormText" data-key="${esc(x.key)}">${ix('undo')}<span>คืนค่าเริ่มต้น</span></button></div>
      <textarea id="${esc(id)}" rows="2" data-ftkey="${esc(x.key)}" data-oninput="setFormText">${esc(curOf(x))}</textarea></div>`;
  };
  const head = `${settingsBar('formtext')}
    ${pageHead('ข้อความในแบบฟอร์ม', 'ถ้อยคำมาตรฐานในเอกสารทุกคดี — แก้แล้วมีผลทุกคดี ตัวอย่างขวาเปลี่ยนตามทันที')}
    <div class="toolbar">
      <label class="f ft-grp"><span class="vh">กลุ่มข้อความ</span><select data-onchange="setFtGroup" ${q ? 'disabled' : ''} aria-label="กลุ่มข้อความ">${groups.map((g, i) => {
        const n = FORM_TEXT.filter((x) => x.group === g && ftIsMod(x)).length;
        return `<option value="${i}" ${i === gi ? 'selected' : ''}>${esc(g)}${n ? ` · แก้แล้ว ${n}` : ''}</option>`;
      }).join('')}</select></label>
      <label class="ref-search">${ix('search')}<input type="search" id="ft-q" data-oninput="setFtQ" value="${esc(S.ui.ftQ || '')}" placeholder="ค้นหาข้อความทุกกลุ่ม" aria-label="ค้นหาข้อความในแบบฟอร์ม"></label>
      <span class="hint ft-cnt" id="ft-count">แก้แล้ว ${ftModCount()} รายการ</span></div>
    <p class="hint ft-vars">ตัวแปรที่ใช้ได้: <code>{def}</code> จำเลย · <code>{names}</code> ชื่อจำเลย · <code>{n}</code> จำนวน · หมายเรียกพยาน: <code>{when}</code> วัน-เวลานัด · <code>{date}</code> วันที่ · <code>{items}</code> รายการเอกสาร/วัตถุ · <code>{court}</code> ศาล · บัญชีพยาน (เพิ่มเติม): <code>{round}</code> ครั้งที่ (ใน “ชื่อเอกสาร”) · <code>{range}</code> อันดับที่ (เช่น ๕ ถึง ๗) · <code>{from}</code> <code>{to}</code> (ขึ้นบรรทัดใหม่ = ย่อหน้าใหม่)</p>`;
  const body = `<div class="panel flat">${list.length ? list.map(item).join('') : `<div class="empty">${ix('search', { size: 22 })}<span>ไม่พบข้อความที่ค้นหา</span></div>`}</div>`;
  const foot = `<button class="btn primary" data-act="saveFormText">${ix('save')}<span>บันทึกข้อความแบบฟอร์ม</span></button><span class="hint" id="ft-state">${S.ui.ftDirty ? 'ยังไม่ได้บันทึก' : ''}</span>`;
  return fit(head, body, foot, 'รายการข้อความ');
}
actions.setFtGroup = (el) => { S.ui.ftGroup = +el.value; rerender(); };
actions.setFtQ = (el) => {
  S.ui.ftQ = el.value; clearTimeout(actions._fq);
  actions._fq = setTimeout(() => { const k = el.selectionStart; rerender(); const n = document.getElementById('ft-q'); n?.focus(); n?.setSelectionRange(k, k); }, 250);
};
actions.setFormText = (el) => {
  S.data.formText = { ...(S.data.formText || {}), [el.dataset.ftkey]: el.value };
  S.ui.ftDirty = true;
  const item = el.closest('.ft-item'), def = FORM_TEXT.find((x) => x.key === el.dataset.ftkey);
  if (item && def) item.toggleAttribute('data-mod', el.value !== def.value);
  const cnt = document.getElementById('ft-count'); if (cnt) cnt.textContent = `แก้แล้ว ${ftModCount()} รายการ`;
  const st = document.getElementById('ft-state'); if (st) st.textContent = 'ยังไม่ได้บันทึก';
  hooks.preview();
};
actions.resetFormText = (el) => {
  const o = { ...(S.data.formText || {}) };
  delete o[el.dataset.key];
  S.data.formText = o; S.ui.ftDirty = true; rerender();
};
actions.saveFormText = async () => {
  try { await hooks.api.saveFormText(S.data.formText || {}); S.ui.ftDirty = false; hooks.toast('บันทึกข้อความแบบฟอร์มแล้ว'); rerender(); }
  catch (e) { hooks.toast('บันทึกไม่สำเร็จ: ' + e.message); }
};

// ===================== หน้า: แบบพิมพ์ศาล (ต้นฉบับ) =====================
let formsIndex = null;
const USED_FORMS = new Set(['04', '05', '06', '07', '09', '10', '11', '15', '16', '17', '18', '19 ตรี', '29']);
function tabForms() {
  if (!formsIndex) {
    fetch('/templates/index.json').then((r) => r.json()).then((j) => { formsIndex = j.forms || []; if (S.tab === 'forms') rerender(); }).catch(() => { formsIndex = []; if (S.tab === 'forms') rerender(); });
    return `${settingsBar('forms')}${pageHead('แบบพิมพ์ศาล', 'กำลังโหลดรายการ…')}<div class="empty">กำลังโหลดรายการ…</div>`;
  }
  const q = (S.ui.formQ || '').trim().toLowerCase();
  const only = !!S.ui.formsOnly;
  const base = formsIndex.filter((f) => !q || `${f.no} ${f.title}`.toLowerCase().includes(q));
  const list = only ? base.filter((f) => USED_FORMS.has(f.no)) : base;
  const link = (dir, file, label) => (file ? `<a class="lnk" href="/templates/${dir}/${encodeURIComponent(file)}" download>${ix('download')}<span>${label}</span></a>` : '<span class="hint">—</span>');
  const chip = (v, label, n) => `<button type="button" class="chip" data-act="setFormsFilter" data-v="${v}" aria-pressed="${(v === 'used') === only}">${label} <span class="chip-n">${n}</span></button>`;
  const head = `${settingsBar('forms')}
    ${pageHead('แบบพิมพ์ศาล (ต้นฉบับ)', 'ไฟล์ต้นฉบับใน app/templates — ป้าย “ใช้ในระบบ” = ระบบสร้างให้อัตโนมัติ')}
    <div class="toolbar"><label class="ref-search">${ix('search')}<input type="search" id="form-q" data-oninput="setFormQ" value="${esc(S.ui.formQ || '')}" placeholder="ค้นหา เช่น คำฟ้อง, บัญชีพยาน, 15" aria-label="ค้นหาแบบพิมพ์"></label>
      <div class="chips" role="group" aria-label="กรองแบบพิมพ์">${chip('all', 'ทั้งหมด', base.length)}${chip('used', 'ใช้ในระบบ', base.filter((f) => USED_FORMS.has(f.no)).length)}</div></div>`;
  const body = `<div class="panel tbl-wrap flat"><table class="simple forms-tbl"><thead><tr><th>แบบ</th><th>ชื่อ</th><th>ไฟล์</th></tr></thead><tbody>
    ${list.map((f) => `<tr class="${USED_FORMS.has(f.no) ? 'used' : ''}"><td class="nowrap"><span class="form-no">${esc(f.no)}</span></td><td class="form-title">${esc(f.title)} ${USED_FORMS.has(f.no) ? badge('ใช้ในระบบ', 'ok') : ''}</td><td class="nowrap form-files">${link('word', f.word, 'Word')} ${f.pdf ? `<a class="lnk" href="/templates/pdf/${encodeURIComponent(f.pdf)}" data-act="viewPdf" data-title="${esc(f.no + ' ' + f.title)}">${ix('eye')}<span>ดู PDF</span></a>` : '<span class="hint">—</span>'}</td></tr>`).join('') || `<tr><td colspan="3"><div class="empty">${ix('search', { size: 22 })}<span>ไม่พบรายการ</span></div></td></tr>`}
  </tbody></table></div>`;
  return fit(head, body, '', 'รายการแบบพิมพ์');
}
actions.setFormsFilter = (el) => { S.ui.formsOnly = el.dataset.v === 'used'; rerender(); };
actions.setFormQ = (el) => {
  S.ui.formQ = el.value; clearTimeout(actions._ft);
  actions._ft = setTimeout(() => { const k = el.selectionStart; rerender(); const n = document.getElementById('form-q'); n?.focus(); n?.setSelectionRange(k, k); }, 250);
};

// ===================== หน้า: ตำแหน่งตัวหนังสือ & ตราครุฑ =====================
const LAYOUT_FORMS = [
  ['all', 'ทุกแบบ (ค่ากลาง)', ''], ['complaint', 'คำฟ้อง (แบบ ๔)', 'complaint'], ['prayer', 'คำขอท้ายคำฟ้อง', 'prayer'],
  ['attachment', 'เอกสารแนบท้ายคำฟ้อง', 'attachment'], ['service', 'คำร้องส่งหมาย / ปิดหมาย', 'service'], ['motion', 'คำร้อง / คำแถลงอื่น', 'motion'],
  ['witness', 'บัญชีพยาน', 'witness'], ['witnessExtra', 'บัญชีพยาน (เพิ่มเติม) ครั้งที่ …', 'witnessExtra'], ['witnessSummons', 'หมายเรียกพยาน (แบบ ๑๖ · ๑๗ · ๑๘)', 'witnessSummons'], ['summons', 'หมายนัดไต่สวนมูลฟ้อง', 'summons'], ['attorney', 'ใบแต่งทนายความ', 'attorney'],
  ['proxy', 'ใบมอบอำนาจ', 'proxy'], ['answer', 'คำให้การจำเลย', 'answer'], ['settlement', 'สัญญาประนีประนอมยอมความ', 'settlement'],
];
const LAYOUT_PRESETS = { 'emblem.width': [['เล็ก', 18], ['มาตรฐาน', 24], ['ใหญ่', 32]] };
const layoutObj = () => { const L = (S.data.layout ||= {}); L.all ||= {}; L.forms ||= {}; return L; };

const GROUP_SHORT = [[/หน้ากระดาษ/, 'หน้ากระดาษ'], [/ตัวหนังสือ/, 'ตัวอักษร'], [/^ตราครุฑ/, 'ตราครุฑ'], [/โลโก้/, 'โลโก้'], [/หัวเรื่อง/, 'หัวเรื่อง · เลขคดี'], [/^ศาล/, 'ศาล · ระหว่าง'], [/ลายมือชื่อ/, 'ลายมือชื่อ']];
const groupShort = (g) => GROUP_SHORT.find(([re]) => re.test(g.title))?.[1] || g.title;

function tabLayout() {
  const f = S.ui.layoutForm || 'all';
  const L = layoutObj();
  const eff = resolveLayout(L, f === 'all' ? '' : f);
  const own = f === 'all' ? L.all : (L.forms[f] || {});
  const line = (fd) => {
    const v = eff[fd.k], isOwn = fd.k in own;
    const tip = fd.hint ? `<span class="info" tabindex="0" role="img" aria-label="${esc(fd.hint)}" data-tip="${esc(fd.hint)}">${ix('info')}</span>` : '';
    const lab = `${esc(fd.label)}${isOwn && f !== 'all' ? ' <em class="own">เฉพาะแบบนี้</em>' : ''}${tip}`;
    if (fd.type === 'check') return `<label class="lay-line chk-line chk sw"><input type="checkbox" role="switch" data-k="${fd.k}" data-oninput="setLayoutVal" ${v ? 'checked' : ''}><span>${lab}</span></label>`;
    return `<div class="lay-line"><span class="lay-name">${lab}</span>
      <input type="range" data-k="${fd.k}" data-oninput="setLayoutVal" min="${fd.min}" max="${fd.max}" step="${fd.step}" value="${v}" aria-label="${esc(fd.label)}">
      <span class="lay-in"><input type="number" data-k="${fd.k}" data-oninput="setLayoutVal" min="${fd.min}" max="${fd.max}" step="${fd.step}" value="${v}" aria-label="${esc(fd.label)} (ตัวเลข)"><i>${esc(fd.unit || '')}</i></span>
      <button class="btn sm icon" type="button" data-act="resetLayoutKey" data-k="${fd.k}" title="คืนค่าเริ่มต้นของช่องนี้" aria-label="คืนค่าเริ่มต้น: ${esc(fd.label)}" ${isOwn ? '' : 'disabled'}>${ix('undo')}</button>
      ${LAYOUT_PRESETS[fd.k] ? `<div class="presets"><span class="hint">สำเร็จรูป (${esc(fd.unit || '')})</span>${LAYOUT_PRESETS[fd.k].map(([lb, pv]) => `<button type="button" class="btn sm outline" data-act="setLayoutPreset" data-k="${fd.k}" data-v="${pv}" aria-pressed="${+v === pv}">${lb} ${pv}</button>`).join('')}</div>` : ''}</div>`;
  };
  const vis = LAYOUT_GROUPS.map((g, gi) => [g, gi]).filter(([g]) => g.scope !== 'all' || f === 'all');
  let ag = S.ui.layoutGroup;
  if (!vis.some(([, gi]) => gi === ag)) ag = (vis.find(([g]) => /^ตราครุฑ/.test(g.title)) || vis[0])[1];
  const g = LAYOUT_GROUPS[ag];
  const nOwn = g.fields.filter((fd) => fd.k in own).length;
  const tabs = `<div class="gtabs" role="tablist" aria-label="กลุ่มการตั้งค่า">${vis.map(([vg, gi]) => {
    const n = vg.fields.filter((fd) => fd.k in own).length;
    return `<button type="button" role="tab" class="${gi === ag ? 'on' : ''} ${n ? 'has-own' : ''}" aria-selected="${gi === ag}" data-act="setLayoutGroup" data-g="${gi}">${esc(groupShort(vg))}${n ? `<span class="vh"> (ปรับแล้ว ${n})</span>` : ''}</button>`;
  }).join('')}</div>`;
  const head = `${settingsBar('layout')}
    ${pageHead('ตำแหน่งตัวหนังสือ & ตราครุฑ', 'ปรับขอบ ขนาดอักษร ตราครุฑ ลายมือชื่อ — ตัวอย่างขวาเปลี่ยนตามทันที')}
    <div class="lay-bar" role="toolbar" aria-label="เครื่องมือจัดหน้า">
      <label class="lay-form"><span>สำหรับ</span><select data-onchange="setLayoutForm">${LAYOUT_FORMS.map(([k, l]) => `<option value="${k}" ${k === f ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="chk sw lay-sw"><input type="checkbox" role="switch" data-oninput="toggleGuides" ${S.ui.guides ? 'checked' : ''}><span>เส้นไกด์</span></label>
      <span class="grow"></span><span class="hint" id="lay-state">${S.ui.layoutDirty ? 'ยังไม่ได้บันทึก' : ''}</span>
      <button class="btn sm outline" data-act="resetLayoutForm">${ix('undo')}<span>${f === 'all' ? 'คืนค่า' : 'ล้างค่าแบบนี้'}</span></button>
      <button class="btn sm primary" data-act="saveLayout">${ix('save')}<span>บันทึก</span></button>
    </div>${tabs}`;
  const body = `<div class="panel flat" role="tabpanel"><h3>${esc(g.title)}<span class="grow"></span>
      <button class="btn sm danger" type="button" data-act="resetLayoutGroup" data-g="${ag}" ${nOwn ? '' : 'disabled'}>${ix('undo')}<span>รีเซ็ตกลุ่มนี้</span></button></h3>
    ${f !== 'all' ? '<p class="hint lay-note">ค่าที่ไม่ได้ปรับเฉพาะแบบนี้ ใช้ตามค่ากลาง “ทุกแบบ”</p>' : ''}
    <div class="lay-lines">${g.fields.map(line).join('')}</div></div>`;
  return fit(head, body, '', 'ค่าการจัดหน้า');
}
actions.setLayoutGroup = (el) => { S.ui.layoutGroup = +el.dataset.g; rerender(); };

function layoutTarget() { const L = layoutObj(); const f = S.ui.layoutForm || 'all'; return f === 'all' ? L.all : (L.forms[f] ||= {}); }
actions.setLayoutForm = (el) => {
  S.ui.layoutForm = el.value;
  const docKey = LAYOUT_FORMS.find((x) => x[0] === el.value)?.[2];
  if (docKey) S.ui.pvDoc = docKey === 'motion' ? (S.c.motions[0] ? 'motion-' + S.c.motions[0].id : 'service') : docKey;
  rerender();
};
actions.toggleGuides = (el) => { S.ui.guides = el.checked; hooks.layoutLive(); };
actions.setLayoutVal = (el) => {
  const k = el.dataset.k;
  const v = el.type === 'checkbox' ? (el.checked ? 1 : 0) : parseFloat(el.value);
  if (Number.isNaN(v)) return;
  layoutTarget()[k] = v;
  document.querySelectorAll(`[data-k="${k}"]`).forEach((n) => { if (n !== el && n.type !== 'checkbox') n.value = v; });
  S.ui.layoutDirty = true;
  const st = document.getElementById('lay-state'); if (st) st.textContent = 'ยังไม่ได้บันทึก';
  hooks.layoutLive(); // เลื่อนตามทันทีโดยไม่ต้องเรนเดอร์เอกสารใหม่
};
actions.resetLayoutKey = (el) => { delete layoutTarget()[el.dataset.k]; S.ui.layoutDirty = true; rerender(); hooks.layoutLive(); };
/** รีเซ็ตทีละกลุ่ม: ลบเฉพาะคีย์ของกลุ่มนั้นจากค่าที่ปรับไว้ (ยังไม่บันทึกจนกว่าจะกด “บันทึกการจัดหน้า”) */
actions.resetLayoutGroup = (el) => {
  const g = LAYOUT_GROUPS[+el.dataset.g];
  if (!g) return;
  const t = layoutTarget();
  for (const fd of g.fields) delete t[fd.k];
  S.ui.layoutDirty = true; rerender(); hooks.layoutLive();
  hooks.toast(`รีเซ็ตกลุ่ม “${g.title}” แล้ว`);
};
/** ปุ่มลัดขนาดสำเร็จรูป (เช่น ตราครุฑ เล็ก/มาตรฐาน/ใหญ่) */
actions.setLayoutPreset = (el) => {
  const v = parseFloat(el.dataset.v);
  if (Number.isNaN(v)) return;
  layoutTarget()[el.dataset.k] = v;
  S.ui.layoutDirty = true; rerender(); hooks.layoutLive();
};
actions.resetLayoutForm = async () => {
  const f = S.ui.layoutForm || 'all';
  if (!(await confirmBox(f === 'all' ? 'คืนค่าการจัดหน้าทั้งหมดเป็นค่าเริ่มต้นของแบบพิมพ์ศาล (รวมค่าที่ปรับเฉพาะแต่ละแบบ)' : 'ล้างค่าที่ปรับเฉพาะแบบนี้ ให้กลับไปใช้ค่ากลาง', { title: 'คืนค่าเริ่มต้น', okText: 'คืนค่า', danger: true }))) return;
  const L = layoutObj();
  if (f === 'all') { L.all = {}; L.forms = {}; } else delete L.forms[f];
  S.ui.layoutDirty = true; rerender();
};
actions.saveLayout = async () => {
  try { await hooks.api.saveLayout(layoutObj()); S.ui.layoutDirty = false; hooks.toast('บันทึกการจัดหน้าแล้ว'); const st = document.getElementById('lay-state'); if (st) st.textContent = ''; }
  catch (e) { hooks.toast('บันทึกไม่สำเร็จ: ' + e.message); }
};

// ===================== เมนูซ้าย: จัดกลุ่ม + สถานะ =====================
const hasText = (list) => list.some((f) => (f.text || '').trim());
const personWit = () => S.c.witnesses.some((w) => w.kind === 'person' && (w.name || '').trim());
const partiesOk = () => plaintiffs(S.c).some(hasName) && defendants(S.c).some(hasName);

// เมนูซ้ายต้องพอดีจอเตี้ย ๆ (768px) โดยไม่มีแถบเลื่อน — ป้ายสั้น กลุ่มกระชับ
// “ตั้งค่า & แม่แบบ” เหลือรายการเดียว: key/render เป็น getter ตามหน้าที่เปิดอยู่ (formtext | layout | forms) จึงไฮไลต์ถูกทั้ง 3 หน้าโดยไม่ต้องแก้ app.js
const SETTINGS_PAGES = { formtext: tabFormText, layout: tabLayout, forms: tabForms };
export const NAV = [
  { group: 'ข้อมูลพื้นฐาน', items: [
    { key: 'case', label: 'ข้อมูลคดี', ico: 'clipboard', render: tabCase, status: () => (S.c.court ? 'ok' : 'todo') },
    { key: 'parties', label: 'คู่ความ', ico: 'users', render: tabParties, doc: 'attachment', status: () => (partiesOk() ? 'ok' : 'todo') },
    { key: 'counsel', label: 'ทนายความ', ico: 'briefcase', render: tabCounsel, doc: 'attorney', status: () => (!S.c.counsel.enabled || S.c.counsel.first ? 'ok' : 'todo') },
  ] },
  { group: 'เอกสารในชุดฟ้อง', items: [
    { key: 'complaint', label: 'คำฟ้อง', ico: 'gavel', render: tabComplaint, doc: 'complaint', status: () => (hasText(S.c.facts) && (S.c.type === 'civil' || S.c.charges.length) ? 'ok' : 'todo') },
    { key: 'prayer', label: 'คำขอท้ายคำฟ้อง', ico: 'scale', render: tabPrayer, doc: 'prayer', status: () => (hasText(S.c.prayers) ? 'ok' : 'todo') },
    { key: 'service', label: 'คำร้องส่งหมาย', ico: 'send', render: tabService, doc: 'service', status: () => (serviceMode(S.c) === 'none' ? 'off' : 'ok') },
    { key: 'witness', label: 'บัญชีพยาน', ico: 'user', render: tabWitness, doc: 'witness', status: () => (personWit() ? 'ok' : 'todo') },
    { key: 'summons', label: 'หมายนัดไต่สวน', ico: 'calendar', render: tabSummons, doc: 'summons', only: 'criminal', status: () => (S.c.docs.summons === false ? 'off' : S.c.hearing.date ? 'ok' : 'todo') },
  ] },
  { group: 'เพิ่มเติม', items: [
    { key: 'motions', label: 'คำร้อง / คำแถลง', ico: 'file', render: tabMotions, doc: 'motions', count: () => S.c.motions.length },
    { key: 'extras', label: 'คำให้การ & สัญญา', ico: 'pen', render: tabExtras, doc: 'answer' },
  ] },
  { group: 'ออกเอกสาร', items: [
    { key: 'export', label: 'ออกเอกสาร', ico: 'download', render: tabExport },
    { key: 'ref', label: 'ตำรากฎหมาย', ico: 'book', render: tabRef },
  ] },
  { group: 'ตั้งค่า', items: [
    { get key() { return SETTINGS_PAGES[S.tab] ? S.tab : 'layout'; }, label: 'แม่แบบ & การจัดหน้า', ico: 'sliders', get render() { return SETTINGS_PAGES[S.tab] || tabLayout; } },
  ] },
];
// รายการที่ไม่แสดงในเมนู แต่ลิงก์ภายในยังอ้าง key เหล่านี้ได้
export const TABS = [...NAV.flatMap((g) => g.items), { key: 'layout', render: tabLayout }, { key: 'formtext', render: tabFormText }, { key: 'forms', render: tabForms }];
export { courtOptions };
