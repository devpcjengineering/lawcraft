// ทดสอบ “คำร้องขอให้ศาลออกหมายเรียกพยาน” (witnessRequest): ฉบับเดียวต่อคดี ข้อละพยาน เรียง บุคคล → เอกสาร → วัตถุ
import assert from 'node:assert/strict';
import { newCase, newParty, newWitness, switchSide, witnessDeliver } from '../shared/model.js';
import { buildDocuments, docStage } from '../shared/docs.js';

const data = { laws: [], items: [], courtPhones: {}, formText: {} };
const addr = { no: '9', moo: '', building: '', soi: '', road: 'ถนนสมมติ', sub: 'ตำบลสมมติ', district: 'อำเภอสมมติ', province: 'เชียงราย', zip: '57000' };
const find = (c) => buildDocuments(c, data).find((d) => d.id === 'witnessRequest');
const items = (d) => d.blocks.filter((b) => b.t === 'p' && b.runs?.[0]?.b && /^ข้อ/.test(b.runs[0].text));
const text = (b) => b.runs.map((r) => r.text || '').join('');
const digits = (s) => s.replace(/[๐-๙]/g, (d) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)));

const mk = () => {
  const c = newCase('criminal');
  c.court = 'ศาลจังหวัดธัญบุรี';
  c.parties = [Object.assign(newParty('plaintiff'), { prefix: 'นาย', first: 'สมชาย', last: 'โจทก์ดี' }), Object.assign(newParty('defendant'), { prefix: 'นาย', first: 'สมปอง', last: 'จำเลยดี' })];
  return c;
};

// ค่าเริ่มต้น
const w0 = newWitness('person');
assert.equal(w0.deliver, 'ems'); assert.equal(w0.outside, false); assert.equal(w0.destCourt, '');
assert.equal(witnessDeliver({}), 'ems'); assert.equal(witnessDeliver({ deliver: 'officer' }), 'officer'); assert.equal(witnessDeliver(null), 'ems');
assert.equal(newCase('criminal').docs.witnessRequest, true);

// ไม่มีพยานที่ขอให้ศาลออกหมาย → ไม่มีเอกสาร
let c = mk();
c.witnesses = [{ ...newWitness('person'), name: 'พยานนำมาเอง', summons: false }];
assert.equal(find(c), undefined, 'ไม่มีพยานขอหมาย = ไม่มีคำร้อง');

// ผสม: วัตถุ เอกสาร บุคคล (ใส่สลับลำดับ) + officer + outside
c = mk();
c.witnesses = [
  { ...newWitness('object'), name: 'มีดของกลาง', holder: 'สถานีตำรวจ', addr },
  { ...newWitness('document'), name: 'สัญญาเช่า', holder: 'ผู้จัดการ', holderPos: 'ธนาคาร', addr, deliver: 'officer', outside: true, destCourt: 'ศาลจังหวัดเชียงราย' },
  { ...newWitness('person'), name: 'พยานหนึ่ง', position: 'ร.ต.อ.', addr },
  { ...newWitness('person'), name: 'พยานสอง', addr, deliver: 'officer' },
  { ...newWitness('person'), name: 'พยานเพิ่มเติม', addr, extra: true },
  { ...newWitness('person'), name: 'พยานนำมา', note: 'นำ', summons: false },   // หน้าจอปิดสวิตช์ให้เมื่อพิมพ์ นำ (syncWitnessSummons)
];
let d = find(c);
assert.ok(d, 'มีคำร้อง');
assert.equal(buildDocuments(c, data).filter((x) => x.id === 'witnessRequest').length, 1, 'ฉบับเดียว');
assert.equal(d.title, 'คำร้องขอให้ศาลออกหมายเรียกพยาน (ชั้นพิจารณา)', 'คดีอาญาฝั่งโจทก์ ค่าเริ่มต้น = ชั้นพิจารณา');
assert.equal(d.stage, undefined, 'ชั้นพิจารณาใช้ DOC_STAGE ปกติ (trial)');
const its = items(d).map(text).map(digits);
assert.equal(its.length, 5, 'พยานที่นำมาเองไม่รวม');
its.forEach((s, i) => assert.ok(s.startsWith(`ข้อ ${i + 1}.`), 'เลขข้อเรียง ' + i));
assert.match(its[0], /พยานหนึ่ง/); assert.match(its[0], /ร\.ต\.อ\./); assert.match(its[0], /เป็นพยานบุคคล/);
assert.match(its[0], /ไปรษณีย์ตอบรับด่วนพิเศษ/);
assert.match(its[1], /พยานสอง/); assert.match(its[1], /เจ้าพนักงานศาล/); assert.match(its[1], /ปิดหมาย/);
assert.match(its[2], /พยานเพิ่มเติม/, 'extra รวมด้วย');
assert.match(its[3], /สัญญาเช่า/); assert.match(its[3], /\(พยานเอกสาร\)/); assert.match(its[3], /ส่งเอกสารดังกล่าวต่อศาลก่อนวันสืบพยาน/);
assert.match(its[3], /ผู้จัดการ ธนาคาร/); assert.match(its[3], /เจ้าพนักงานศาล/);
assert.match(its[3], /นอกเขตอำนาจ/); assert.match(its[3], /ศาลจังหวัดเชียงราย/); assert.match(its[3], /ตำบลสมมติ/);
assert.match(its[4], /มีดของกลาง/); assert.match(its[4], /พยานวัตถุ/); assert.match(its[4], /ส่งวัตถุดังกล่าวต่อศาล/);
assert.ok(its.every((s) => s.includes('โจทก์')), 'ฝั่งโจทก์ใช้คำว่าโจทก์');
assert.ok(!its[0].includes('นอกเขต'));
assert.match(its[0], /มาเบิกความเป็นพยานต่อศาลในวันสืบพยาน/);

// ชั้นไต่สวนมูลฟ้อง (คดีอาญาฝั่งโจทก์): ชื่อเรื่อง + ถ้อยคำเปลี่ยน + จัดเป็นเอกสารชุดก่อนฟ้อง
assert.equal(newCase('criminal').witnessStage, 'trial');
c.witnessStage = 'preliminary';
d = find(c);
assert.equal(d.title, 'คำร้องขอให้ศาลออกหมายเรียกพยาน (ชั้นไต่สวนมูลฟ้อง)');
assert.equal(docStage(d), 'pre', 'ชั้นไต่สวนมูลฟ้อง = ชุดก่อนฟ้อง');
const pi = items(d).map(text);
assert.match(pi[0], /มาเบิกความเป็นพยานต่อศาลในวันนัดไต่สวนมูลฟ้อง/);
assert.match(pi[3], /ส่งเอกสารดังกล่าวต่อศาลก่อนวันนัดไต่สวนมูลฟ้อง/);
assert.ok(pi.every((s) => !s.includes('วันสืบพยาน')), 'ไม่มีคำว่าวันสืบพยานในชั้นไต่สวนมูลฟ้อง');
// คดีแพ่งไม่มีชั้นไต่สวนมูลฟ้อง: ชื่อเรื่องไม่มีวงเล็บ แม้ตั้ง preliminary
{
  const cv = newCase('civil');
  cv.parties = mk().parties; cv.witnesses = [{ ...newWitness('document'), name: 'เอกสารแพ่ง', holder: 'ผู้ถือ', addr }];
  cv.witnessStage = 'preliminary';
  const dv = find(cv);
  assert.equal(dv.title, 'คำร้องขอให้ศาลออกหมายเรียกพยาน');
  assert.match(items(dv).map(text)[0], /ก่อนวันสืบพยาน/);
  assert.equal(docStage(dv), 'trial');
}
c.witnessStage = 'trial';

// ฝั่งจำเลย
switchSide(c, 'defendant');
c.parties = mk().parties;
c.witnesses = [{ ...newWitness('person'), name: 'พยานจำเลย', addr }];
d = find(c);
assert.ok(d, 'ฝั่งจำเลยมีคำร้อง');
assert.equal(d.title, 'คำร้องขอให้ศาลออกหมายเรียกพยาน', 'ฝั่งจำเลยไม่มีชั้นไต่สวนมูลฟ้อง');
const di = items(d).map(text);
assert.equal(di.length, 1);
assert.ok(di[0].includes('จำเลยมีความจำเป็นต้องอ้าง') && !di[0].includes('โจทก์'), 'ฝั่งจำเลยใช้ จำเลย');

// ปิดด้วย docs.witnessRequest=false
c.docs.witnessRequest = false;
assert.equal(find(c), undefined, 'ปิดแล้วไม่สร้าง');
assert.ok(buildDocuments(c, data, ['witnessRequest']).some((x) => x.id === 'witnessRequest'), 'only บังคับสร้างได้');

console.log('witness-request ok');
