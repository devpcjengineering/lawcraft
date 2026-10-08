// ทดสอบ “ฝั่งจำเลย” ในคดีเดียวกัน: switchSide สลับข้อมูล / เอกสารใช้จำเลยเป็นผู้ยื่น / ย้อนกลับฝั่งโจทก์ได้ครบ / validateCase เฉพาะฝั่งจำเลย
import assert from 'node:assert/strict';
import { newCase, newParty, newWitness, switchSide, sideOf, validateCase } from '../shared/model.js';
import { buildDocuments } from '../shared/docs.js';

const data = { laws: [], items: [], courtPhones: {}, formText: {} };
const addr = { no: '9', moo: '', building: '', soi: '', road: 'ถนนสมมติ', sub: 'ตำบลสมมติ', district: 'อำเภอสมมติ', province: 'เชียงราย', zip: '57000' };
const J = (v) => JSON.stringify(v);

const c = newCase('criminal');
c.court = 'ศาลจังหวัดธัญบุรี';
c.parties = [Object.assign(newParty('plaintiff'), { prefix: 'นาย', first: 'สมชาย', last: 'โจทก์ดี' }), Object.assign(newParty('defendant'), { prefix: 'นาย', first: 'สมปอง', last: 'จำเลยดี' })];
c.witnesses = [{ ...newWitness('person'), name: 'พยานโจทก์', addr }];
const plCourt = c.court, plWitIds = c.witnesses.map((w) => w.id), plPartyIds = c.parties.map((p) => p.id);
c.hearing = { date: '2026-12-01', time: '09.00' };   // วันนัดใช้ร่วมกันทั้งสองฝั่ง (ไม่อยู่ใน SIDE_KEYS)
const before = J(buildDocuments(c, data));

// ---- สลับเป็นฝั่งจำเลย: ค่าเริ่มต้น ----
assert.equal(sideOf(c), 'plaintiff');
switchSide(c, 'defendant');
assert.equal(sideOf(c), 'defendant');
assert.equal(c.docs.complaint, false); assert.equal(c.docs.prayer, false); assert.equal(c.docs.answer, true);
assert.equal(c.docs.witness, true); assert.equal(c.docs.motions, true);
assert.deepEqual(c.witnesses, []);
assert.equal(c.court, plCourt);
assert.equal(c.parties.length, 2);
assert.equal(c.parties[0].first, 'สมชาย'); assert.equal(c.parties[1].first, 'สมปอง');
assert.ok(c.parties.every((p) => !plPartyIds.includes(p.id)), 'คู่ความฝั่งจำเลยมี id ใหม่');

// ---- กรอกข้อมูลฝั่งจำเลย ----
c.caseNoBlack = 'อ.123';
c.caseYearBlack = '2569';
c.witnesses = [
  { ...newWitness('person'), name: 'พยานจำเลย', addr, summons: true },
  { ...newWitness('document'), name: 'สัญญาเช่า', holder: 'ผู้จัดการ', addr, summons: true },
];
c.motions = [{ id: 'm1', title: 'ขอเลื่อนคดี', kind: 'คำร้อง', ids: [], text: 'จำเลยป่วย' }];
c.answer = { defendantId: c.parties[1].id, templateId: '', text: 'จำเลยไม่ได้กระทำความผิด' };

const dd = buildDocuments(c, data);
const ids = dd.map((d) => d.id);
assert.ok(!ids.includes('complaint') && !ids.includes('prayer'), 'ไม่มีคำฟ้อง/คำขอท้ายฟ้อง');
assert.ok(ids.includes('answer'), 'มีคำให้การ');
const wd = dd.find((d) => d.id === 'witness');
assert.equal(wd.title, 'บัญชีพยานจำเลย');
const wj = J(wd.blocks);
assert.ok(wj.includes('ข้าพเจ้า') && wj.includes('สมปอง') && wj.includes('จำเลย'), 'ผู้ยื่นคือจำเลย');
assert.ok(!wj.includes('โจทก์ทั้งหมด') && !wj.includes('(นายสมชาย'), 'ไม่ใช้ถ้อยคำผู้ยื่นฝั่งโจทก์');
const sm = dd.filter((d) => d.id.startsWith('witnessSummons-'));
assert.ok(sm.length >= 1, 'มีหมายเรียกพยาน');
for (const d of sm) { const s = J(d.blocks); assert.ok(s.includes('ด้วย') && s.includes('จำเลย'), 'หมายเรียก: ด้วย จำเลย'); }
const md = dd.find((d) => d.id.startsWith('motion-'));
assert.ok(md, 'มีคำร้อง');
assert.ok(J(md.blocks).includes('ข้าพเจ้า') && J(md.blocks).includes('สมปอง'), 'คำร้องใช้ ข้าพเจ้า = จำเลย');

// ---- validateCase ฝั่งจำเลย ----
let v = validateCase(c, { byId: {} });
assert.ok(!v.some((i) => /ข้อหา|ข้อเท็จจริง|คำขอท้ายฟ้อง|เลขประจำตัว/.test(i.msg)), 'ไม่มีข้อตรวจของคำฟ้อง');
assert.ok(!v.some((i) => i.level === 'error'));
assert.ok(v.some((i) => i.msg === 'ยังไม่ได้ระบุวันที่รับฟ้อง'));
c.caseNoBlack = ''; c.court = '';
v = validateCase(c, { byId: {} });
assert.ok(v.some((i) => i.level === 'error' && i.msg === 'ยังไม่ได้ระบุศาล'));
assert.ok(v.some((i) => i.level === 'warn' && /เลขคดีดำ/.test(i.msg)));
c.caseNoBlack = 'อ.123'; c.court = plCourt;

// ---- จำเลยหลายคน: ฝั่งจำเลยไม่มีเอกสารแนบท้ายคำฟ้อง จึงต้องไม่อ้างถึงในคำร้อง/คำให้การ/บัญชีพยาน; ฝั่งโจทก์ที่เปิดเอกสารแนบยังอ้างตามเดิม ----
{
  const two = [...c.parties, Object.assign(newParty('defendant'), { prefix: 'นาง', first: 'สมใจ', last: 'จำเลยสอง' })];
  const keep = c.parties; c.parties = two;
  for (const d of buildDocuments(c, data)) assert.ok(!J(d.blocks).includes('แนบท้ายคำฟ้อง'), `ฝั่งจำเลยหลายคน: ${d.id} ไม่ควรอ้างเอกสารแนบท้ายคำฟ้อง`);
  c.parties = keep;
}
{
  const pc = newCase('criminal'); pc.court = plCourt;
  pc.parties = [Object.assign(newParty('plaintiff'), { first: 'ก' }), Object.assign(newParty('plaintiff'), { first: 'ง' }), Object.assign(newParty('defendant'), { first: 'ข' })];
  pc.motions = [{ id: 'm1', title: 'ขอเลื่อนคดี', kind: 'คำร้อง', ids: [], text: 'ขอเลื่อน' }];
  const mdoc = () => buildDocuments(pc, data, ['motions'])[0];
  assert.ok(J(mdoc().blocks).includes('แนบท้ายคำฟ้อง'), 'ฝั่งโจทก์ยังอ้างเอกสารแนบเมื่อเปิดไว้');
  pc.docs.attachment = false;
  assert.ok(!J(mdoc().blocks).includes('แนบท้ายคำฟ้อง'), 'ปิดเอกสารแนบ → ไม่อ้างถึง');
}

// ---- กลับฝั่งโจทก์: ข้อมูลเดิมครบ ----
const defSnapshot = J({ w: c.witnesses.map((w) => w.id), p: c.parties.map((p) => p.id), n: c.caseNoBlack });
switchSide(c, 'plaintiff');
assert.equal(sideOf(c), 'plaintiff');
assert.equal(c.court, plCourt);
assert.deepEqual(c.witnesses.map((w) => w.id), plWitIds);
assert.deepEqual(c.parties.map((p) => p.id), plPartyIds);
assert.equal(c.docs.complaint, true);
assert.equal(J(buildDocuments(c, data)), before, 'เอกสารฝั่งโจทก์ไม่เปลี่ยน');

// ---- สลับไปมาอีก ----
switchSide(c, 'defendant');
assert.equal(J({ w: c.witnesses.map((w) => w.id), p: c.parties.map((p) => p.id), n: c.caseNoBlack }), defSnapshot, 'ฝั่งจำเลยกลับมาครบ');
switchSide(c, 'plaintiff');
assert.equal(J(buildDocuments(c, data)), before);
console.log('defendant-side OK');
