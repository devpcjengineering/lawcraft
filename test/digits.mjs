// ทดสอบ: (1) เลขไทยบังคับในเอกสารทุกฉบับ (พรีวิว HTML + Word) เว้นอีเมล/ที่อยู่เว็บ
//        (2) เลขดำ/เลขแดงมีปีของตัวเองแยกกัน  (3) ไม่มีเลขคดีก็ออกได้ทุกฉบับ ไม่มีคำเตือนเรื่องเลขคดี
//        (4) ข้อมูลที่เก็บไว้ไม่ถูกแก้ · รับเลขไทยที่ผู้ใช้พิมพ์ (บัตรประชาชน ปี จำนวนเงิน) · คดีเก่าที่มีปีช่องเดียวยังพิมพ์ได้
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { newCase, newParty, newWitness, uid, validateCase, indexLaw, serviceFeeInfo, migrateCaseYears } from '../shared/model.js';
import { buildDocuments } from '../shared/docs.js';
import { thaiDigitsDoc, toThaiDigits, toArabicDigits, toNum, toBE, validCitizenId, longDate, maskCitizenId } from '../shared/thai.js';
import { renderDocx } from '../server/render-docx.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

// ---------- ตัวแปลงเลขไทย ----------
assert.equal(thaiDigitsDoc('มาตรา 79 ค่านำหมาย 1,300 บาท'), 'มาตรา ๗๙ ค่านำหมาย ๑,๓๐๐ บาท');
assert.equal(thaiDigitsDoc('อีเมล a1@b2.co.th โทร 081-234-5678'), 'อีเมล a1@b2.co.th โทร ๐๘๑-๒๓๔-๕๖๗๘');
assert.equal(thaiDigitsDoc('ดูที่ https://example.com/p1?x=2 หรือ www.law2.co.th และ lawcraft9.com/a1 ปี 2569'), 'ดูที่ https://example.com/p1?x=2 หรือ www.law2.co.th และ lawcraft9.com/a1 ปี ๒๕๖๙');
assert.equal(thaiDigitsDoc('๑๒๓ และ 4'), '๑๒๓ และ ๔', 'เลขไทยเดิมต้องไม่เสีย');
for (const s of ['มาตรา 79', 'a1@b.com 12', '[ช่อง 1] 3.5', '']) assert.equal(thaiDigitsDoc(thaiDigitsDoc(s)), thaiDigitsDoc(s), `idempotent: ${s}`);
assert.equal(thaiDigitsDoc('3.5 ล้าน 10.00 น.'), '๓.๕ ล้าน ๑๐.๐๐ น.', 'ทศนิยมและเวลาไม่ถูกมองเป็นโดเมน');

// ---------- รับเลขไทยที่ผู้ใช้พิมพ์ ----------
assert.equal(toNum('๑,๓๐๐'), 1300);
assert.equal(toNum('1300.50'), 1300.5);
assert.ok(Number.isNaN(toNum('')));
assert.equal(toBE('๒๕๖๙'), 2569);
assert.equal(toBE('2026'), 2569);
assert.equal(longDate({ d: '๕', m: '๑๐', y: '๒๕๖๙' }), '๕ ตุลาคม 2569','วันที่ยังคำนวณถูกเมื่อพิมพ์เลขไทย');
assert.equal(validCitizenId('1101700207030'), true);
assert.equal(validCitizenId('๑๑๐๑๗๐๐๒๐๗๐๓๐'), true, 'บัตรประชาชนพิมพ์เลขไทยต้องผ่าน');
assert.equal(maskCitizenId('๑๑๐๑๗๐๐๒๐๗๐๓๐'), '1-1017-00207-03-0');
assert.equal(toArabicDigits(toThaiDigits('0123456789')), '0123456789');

// ---------- คดีตัวอย่าง (สมมติ) ----------
const data = {
  laws: [{ id: 'pc', name: 'ประมวลกฎหมายอาญา', short: 'ป.อ.' }],
  items: [{
    id: 'pc-326', lawId: 'pc', kind: 'criminal', section: '326', name: 'หมิ่นประมาท', category: 'ชื่อเสียง', privateOffence: true,
    factTemplate: ['เมื่อวันที่ {{วันเวลาเกิดเหตุ}} จำเลยได้ใส่ความโจทก์ ณ {{สถานที่เกิดเหตุ}}'], prayerTemplate: ['ขอให้ลงโทษ{{จำเลย}}ตาม{{มาตรา}}'], relatedSections: [],
  }],
  formText: {}, courtPhones: { ศาลจังหวัดเชียงราย: '053-123456' },
};
const idx = indexLaw(data);
const EMAIL = 'somchai.test1@example.co.th', URL_ = 'https://example.com/case1';

function person(role, first, last, extra = {}) {
  const p = Object.assign(newParty(role), { first, last, idCard: '1101700207030', age: '40', phone: '081-234-5678', email: EMAIL, occupation: 'ค้าขาย' }, extra);
  Object.assign(p.address, { no: '99/1', moo: '4', soi: '12', road: 'พหลโยธิน', sub: 'รอบเวียง', district: 'เมืองเชียงราย', province: 'เชียงราย', zip: '57000' });
  return p;
}
const wit = (name, o = {}) => ({ ...newWitness(o.kind || 'person', !!o.extra), name, ...o });

function build(type, nums) {
  const c = newCase(type);
  c.court = type === 'civil' ? 'ศาลแพ่ง' : 'ศาลจังหวัดเชียงราย';
  c.parties = [person('plaintiff', 'สมมติ', 'โจทก์ทดสอบ'), person('plaintiff', 'อีกคน', 'โจทก์สอง'), person('defendant', 'สมมุติ', 'จำเลยทดสอบ'), person('defendant', 'จำเลย', 'สอง')];
  c.parties[2].address.province = 'กรุงเทพมหานคร';
  c.counsel = { ...c.counsel, enabled: true, first: 'ทนาย', last: 'ความดี', license: '1234/2560', idCard: '1101700207030', phone: '02-123-4567', email: EMAIL };
  Object.assign(c.counsel.address, { no: '5/6', province: 'เชียงราย' });
  if (type === 'criminal') {
    c.charges = [{ itemId: 'pc-326', related: ['พระราชบัญญัติคอมพิวเตอร์ พ.ศ. 2550 มาตรา 14'] }];
    c.hearing = { date: '2026-12-01', time: '09.00' };
  } else { c.civilCause = 'ผิดสัญญากู้ยืมเงิน 100,000 บาท'; }
  c.amount = { baht: '123456', satang: '50' };
  c.facts = [{ id: uid(), text: `${data.items[0].factTemplate[0]}\n3.1 ข้อย่อยตัวเลข 5 รายการ\nติดต่อ ${EMAIL} หรือ ${URL_}` }];
  c.prayers = [{ id: uid(), text: data.items[0].prayerTemplate[0] }, { id: uid(), text: 'ให้จำเลยชำระเงิน 100,000 บาท พร้อมดอกเบี้ยร้อยละ 7.5 ต่อปี', src: 'base-cost' }];
  c.vars = { 'วันเวลาเกิดเหตุ': '1 ตุลาคม 2569 เวลา 14.30 น.' }; // ไม่กรอก “สถานที่เกิดเหตุ” → ช่องสีเหลือง
  c.copies = '3';
  c.witnesses = [wit('นายพยาน หนึ่ง', { phone: '089-111-2222', purpose: 'เห็นเหตุการณ์ 2 ครั้ง' }), wit('นางสาวพยาน สอง', { extra: true, addr: { ...person('x', 'a', 'b').address } }),
    wit('สัญญาเช่า 1 ฉบับ', { kind: 'document', extra: true, holder: 'บริษัท สมมติ 2 จำกัด' }), wit('โทรศัพท์ 2 เครื่อง', { kind: 'object', holder: 'ร้านสมมติ', summons: true })];
  c.motions = [{ id: 'm1', kind: 'คำร้อง', title: 'ขอเลื่อนนัด 1 ครั้ง', text: 'โจทก์ขอเลื่อนนัดตามมาตรา 40 วรรค 2\n\n2. ขอเลื่อน 30 วัน' }, { id: 'm2', kind: 'คำแถลง', title: 'แถลงสมมติ', text: 'โจทก์ขอแถลง {{ค่าที่ไม่กรอก}}' }];
  c.service = { ...c.service, mode: 'cross-post', fee: '1300', court: 'ศาลแขวงดุสิต' };
  c.answer = { defendantId: c.parties[2].id, templateId: '', text: 'จำเลยขอให้การปฏิเสธข้อ 1 และข้อ 2' };
  c.settlement = { templateId: '', subject: 'ผิดสัญญา 1', clauses: [{ id: uid(), text: 'จำเลยตกลงชำระ 50,000 บาท ภายใน 30 วัน' }] };
  c.proxy = { holder: person('proxy', 'ผู้รับ', 'มอบอำนาจ'), purpose: 'ยื่นคำฟ้อง 1 ฉบับ' };
  c.docs = { ...c.docs, attorney: true, proxy: true, answer: true, settlement: true };
  Object.assign(c, nums);
  return c;
}

const CASES = {
  'criminal+numbers': build('criminal', { caseNoBlack: 'อ.123', caseYearBlack: '2569', caseNoRed: 'พ.456', caseYearRed: '2570' }),
  'civil+numbers': build('civil', { caseNoBlack: 'พ.123', caseYearBlack: '2569', caseNoRed: 'พ.456', caseYearRed: '2570' }),
  'criminal-no-numbers': build('criminal', {}),
  'civil-no-numbers': build('civil', {}),
  'legacy-caseYear': build('criminal', { caseNoBlack: 'อ.9', caseYear: '2568' }),
  'typed-combined': build('civil', { caseNoBlack: 'พ.8/2567', caseNoRed: '๑๒/๒๕๖๘' }),
};

// ---------- เดินดูข้อความที่มองเห็นทุกบล็อก ----------
const SKIP_KEYS = new Set(['t', 'kind', 'id']);
function* strings(o, key = '') {
  if (typeof o === 'string') { if (!SKIP_KEYS.has(key)) yield o; return; }
  if (Array.isArray(o)) { for (const x of o) yield* strings(x, key); return; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) yield* strings(v, k);
}
/** ตัดอีเมล/ที่อยู่เว็บออก (ที่ต้องคงเป็นอักษรละติน) แล้วตรวจว่าไม่เหลือเลขอารบิก */
const STRIP = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"')\]]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|co|th)\b(?:\/[^\s<>"')\]]*)?/gi;
const asciiDigitsIn = (s) => String(s).replace(STRIP, '').match(/[0-9]/g);

// โหลด render-html.js (เป็นโมดูลเบราว์เซอร์ที่ import '/shared/…') เข้า Node โดยแปลงเส้นทาง
async function loadRenderHtml() {
  const src = fs.readFileSync(path.join(root, 'public', 'js', 'render-html.js'), 'utf8').split("'/shared/").join(`'${pathToFileURL(path.join(root, 'shared')).href}/`);
  return import('data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64'));
}
const { docsHtml } = await loadRenderHtml();
const htmlText = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

const REQUIRED_IDS = ['complaint', 'prayer', 'attachment', 'service', 'motion-m1', 'motion-m2', 'witness', 'witnessExtra', 'answer', 'settlement', 'attorney', 'proxy'];

for (const [name, c] of Object.entries(CASES)) {
  const before = JSON.stringify(c);
  const docs = buildDocuments(c, data);
  const ids = docs.map((d) => d.id);
  // ไม่ว่ามีเลขคดีหรือไม่ ทุกเอกสารต้องถูกสร้างครบ
  for (const id of REQUIRED_IDS) assert.ok(ids.includes(id), `${name}: ขาดเอกสาร ${id}`);
  assert.ok(ids.some((i) => i.startsWith('witnessSummons-p-')), `${name}: ขาดหมายเรียกพยานบุคคล`);
  assert.ok(ids.some((i) => i.startsWith('witnessSummons-i-')), `${name}: ขาดหมายเรียกพยานเอกสาร/วัตถุ`);
  if (c.type === 'criminal') assert.ok(ids.some((i) => i.startsWith('summons-')), `${name}: ขาดหมายนัดไต่สวน`);
  // ข้อมูลที่เก็บไว้ไม่ถูกแก้ (แปลงที่ผลลัพธ์เท่านั้น)
  assert.equal(JSON.stringify(c), before, `${name}: buildDocuments แก้ข้อมูลคดี`);
  // ไม่มีคำเตือน/ข้อความเรื่องเลขคดีในรายการตรวจ
  assert.ok(!validateCase(c, idx).some((i) => /เลขคดี|หมายเลขดำ|หมายเลขแดง/.test(i.msg)), `${name}: ต้องไม่มีข้อความเตือนเรื่องเลขคดี`);

  // blocks: ไม่มีเลขอารบิกในข้อความที่มองเห็น (ยกเว้นอีเมล/URL)
  for (const d of docs) for (const s of strings(d.blocks)) assert.ok(!asciiDigitsIn(s), `${name}/${d.id}: เหลือเลขอารบิก "${s.slice(0, 80)}"`);
  // อีเมลต้องคงเป็นอักษรละติน
  assert.ok(JSON.stringify(docs).includes(EMAIL), `${name}: อีเมลต้องคงเดิม`);
  assert.ok(JSON.stringify(docs).includes(URL_), `${name}: ที่อยู่เว็บต้องคงเดิม`);

  // หัวเอกสาร: เลขดำและเลขแดงมีปีของตัวเอง
  const tops = docs.filter((d) => d.id !== 'attachment').map((d) => d.blocks.find((b) => b.t === 'top'));
  assert.ok(tops.every(Boolean), `${name}: ทุกเอกสารต้องมีหัวเอกสาร`);
  const want = {
    'criminal+numbers': ['อ.๑๒๓', '๒๕๖๙', 'พ.๔๕๖', '๒๕๗๐'], 'civil+numbers': ['พ.๑๒๓', '๒๕๖๙', 'พ.๔๕๖', '๒๕๗๐'],
    'criminal-no-numbers': ['', '', '', ''], 'civil-no-numbers': ['', '', '', ''],
    'legacy-caseYear': ['อ.๙', '๒๕๖๘', '', ''], 'typed-combined': ['พ.๘', '๒๕๖๗', '๑๒', '๒๕๖๘'],
  }[name];
  for (const tp of tops) assert.deepEqual([tp.black, tp.yearBlack, tp.red, tp.yearRed], want, `${name}: เลขคดี/ปีที่หัวเอกสารไม่ตรง`);

  // พรีวิว HTML + (ไม่ใช้ตัวเลือก thaiDigits) : ปิดตัวเลือกเก่าก็ยังเป็นเลขไทย
  const html = docsHtml(docs, null);
  const text = htmlText(html);
  assert.ok(!asciiDigitsIn(text), `${name}: HTML พรีวิวมีเลขอารบิก: ${(text.match(/.{0,20}[0-9].{0,20}/) || [''])[0]}`);
  assert.ok(text.includes(EMAIL), `${name}: อีเมลในพรีวิว`);
  // ปีแยกกันในพรีวิว: แถวเลขดำ/เลขแดง
  if (want[0] && want[2]) assert.ok(new RegExp(`คดีหมายเลขดำที่\\s+${want[0].replace('.', '\\.')}\\s*/\\s*${want[1]}`).test(text) && new RegExp(`คดีหมายเลขแดงที่\\s+${want[2].replace('.', '\\.')}\\s*/\\s*${want[3]}`).test(text), `${name}: พรีวิวต้องแสดงเลข/ปีแยกกัน`);
  // ตัวแปรที่ไม่ได้กรอกยังเป็นช่องมาร์กสีเหลือง (ไม่ถูกทำลาย)
  assert.ok(/class="r ph"[^>]*>\[สถานที่เกิดเหตุ\]/.test(html), `${name}: ช่องตัวแปรต้องยังอยู่`);
  assert.ok(!/\{\{/.test(html), `${name}: ไม่มี {{ }} ค้าง`);

  // Word
  const buf = await renderDocx(docs, name);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  const wt = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(' ');
  assert.ok(!asciiDigitsIn(wt), `${name}: Word มีเลขอารบิก: ${(wt.match(/.{0,20}[0-9].{0,20}/) || [''])[0]}`);
  assert.ok(wt.includes(EMAIL), `${name}: อีเมลใน Word`);
  if (want[0]) assert.ok(wt.includes(want[0]) && wt.includes(want[1]), `${name}: Word ต้องมีเลขดำ+ปี`);
  console.log(name.padEnd(22), docs.length, 'เอกสาร · HTML/Word ไม่มีเลขอารบิก');
}

// ---------- ผู้ใช้พิมพ์เลขไทยในข้อมูล ----------
{
  const c = build('civil', {});
  c.amount = { baht: '๑๒๓,๔๕๖', satang: '๕๐' };
  c.date = { d: '๕', m: '๑๐', y: '๒๕๖๙' };
  c.parties[0].idCard = '๑๑๐๑๗๐๐๒๐๗๐๓๐';
  // อัตราค่านำหมาย: ไปรษณีย์ตอบรับด่วนพิเศษ = 80 บาท/จำเลย 1 คน · เจ้าพนักงาน/โจทก์จัดการเอง = ไม่มีตัวเลข
  const nDef = c.parties.filter((p) => p.role === 'defendant').length;
  assert.equal(serviceFeeInfo(c).total, 80 * nDef);
  c.service.deliver = 'officer'; assert.equal(serviceFeeInfo(c).total, 0);
  c.service.deliver = 'self'; assert.equal(serviceFeeInfo(c).total, 0);
  c.service.deliver = 'ems';
  // เลือกวิธีส่งรายจำเลย: จำเลยคนแรก = ไปรษณีย์ · คนอื่น = เจ้าพนักงาน/ส่งเอง → ค่านำหมายรวมเฉพาะไปรษณีย์ 80 บาท
  { const dfs = c.parties.filter((p) => p.role === 'defendant'); dfs[0].deliver = 'ems'; dfs.slice(1).forEach((d, i) => { d.deliver = i % 2 ? 'self' : 'officer'; });
    const fi = serviceFeeInfo(c); assert.deepEqual([fi.total, fi.nEms], [80, 1]); if (dfs.length > 1) assert.equal(fi.deliver, 'mixed'); dfs.forEach((d) => delete d.deliver); }
  assert.ok(!validateCase(c, idx).some((i) => /ทุนทรัพย์|เลขประจำตัวประชาชนของโจทก์/.test(i.msg)), 'เลขไทยที่พิมพ์ต้องผ่านการตรวจ');
  const docs = buildDocuments(c, data);
  const amount = docs.find((d) => d.id === 'complaint').blocks.find((b) => b.t === 'amount');
  assert.equal(amount.baht, '๑๒๓,๔๕๖');
  const court = docs.find((d) => d.id === 'complaint').blocks.find((b) => b.t === 'court');
  assert.equal(court.month, 'ตุลาคม');
  assert.equal(court.year, '๒๕๖๙');
}

// ---------- คดีเก่า: โหลดแล้วแยกปีช่องเดียวเป็นของเลขที่มี ----------
{
  const c = { caseNoBlack: 'อ.1', caseNoRed: '', caseYear: '2569' };
  migrateCaseYears(c);
  assert.deepEqual([c.caseYearBlack, c.caseYearRed, 'caseYear' in c], ['2569', '', false]);
}
console.log('digits OK');
