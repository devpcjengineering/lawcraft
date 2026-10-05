// ทดสอบ “หมายเหตุเป็นหลัก” ของพยาน: หมายเหตุ นำ/หมายเรียก ชนะสวิตช์ “ขอให้ศาลออกหมายเรียกพยานรายนี้” ; สวิตช์ใช้เมื่อหมายเหตุว่าง/เป็นข้อความอื่น
import assert from 'node:assert/strict';
import { newCase, newWitness, newParty, witnessWantsSummons, witnessNoteKeyword, syncWitnessSummons, witnessSummonsPlan } from '../shared/model.js';
import { buildDocuments } from '../shared/docs.js';

const w = (note, summons) => ({ ...newWitness('person'), name: 'พยาน', note, summons });

// ---- ลำดับความสำคัญ ----
assert.equal(witnessWantsSummons(w('หมายเรียก', false)), true, 'หมายเหตุ หมายเรียก ชนะสวิตช์ปิด');
assert.equal(witnessWantsSummons(w('นำ', true)), false, 'หมายเหตุ นำ ชนะสวิตช์เปิด');
assert.equal(witnessWantsSummons(w('นำมาเอง', true)), false);
assert.equal(witnessWantsSummons(w('  หมายเรียก  ', false)), true, 'ตัดช่องว่างหน้าหลัง');
assert.equal(witnessWantsSummons(w('', true)), true); assert.equal(witnessWantsSummons(w('', false)), false, 'ว่าง = ตามสวิตช์');
assert.equal(witnessWantsSummons(w('เด็กอายุไม่เกิน 18 ปี', true)), true, 'ข้อความอื่น = ตามสวิตช์');
assert.equal(witnessWantsSummons(w('เด็กอายุไม่เกิน 18 ปี', false)), false);
assert.equal(witnessWantsSummons({ ...w('หมายเรียก', true), self: true }), false, 'โจทก์อ้างตนเองไม่ออกหมาย');
assert.equal(witnessWantsSummons(null), false);
assert.equal(witnessWantsSummons({ ...w('', undefined) }), true, 'ข้อมูลเดิมไม่มีสวิตช์ = เปิด');
assert.equal(witnessNoteKeyword(w('นำ', true)), 'นำ'); assert.equal(witnessNoteKeyword(w('หมายเรียกพยานเด็ก', true)), 'หมายเรียก'); assert.equal(witnessNoteKeyword(w('x', true)), '');

// ---- ซิงก์หมายเหตุ ↔ สวิตช์ ----
let x = w('นำ', true); syncWitnessSummons(x, 'note'); assert.equal(x.summons, false, 'พิมพ์ นำ → ปิดสวิตช์');
x = w('หมายเรียก', false); syncWitnessSummons(x, 'note'); assert.equal(x.summons, true, 'พิมพ์ หมายเรียก → เปิดสวิตช์');
x = w('', false); syncWitnessSummons(x, 'note'); assert.equal(x.summons, false, 'ลบหมายเหตุ → คงสวิตช์เดิม');
x = w('นำ', false); x.summons = true; syncWitnessSummons(x, 'summons'); assert.equal(x.note, 'หมายเรียก', 'เปิดสวิตช์ขณะหมายเหตุ นำ → หมายเหตุเป็น หมายเรียก');
x = w('นำมาเอง', false); x.summons = true; syncWitnessSummons(x, 'summons'); assert.equal(x.note, 'หมายเรียกมาเอง', 'เปลี่ยนเฉพาะคำนำ');
x = w('หมายเรียก', true); x.summons = false; syncWitnessSummons(x, 'summons'); assert.equal(x.note, 'นำ');
x = w('เด็กอายุไม่เกิน 18 ปี', true); x.summons = false; syncWitnessSummons(x, 'summons'); assert.equal(x.note, 'เด็กอายุไม่เกิน 18 ปี', 'หมายเหตุอื่นไม่ถูกแก้');
assert.equal(witnessWantsSummons(x), false, 'และสวิตช์ปิดมีผล');

// ---- ในเอกสารจริง: จำนวนหมายเรียก + คอลัมน์หมายเหตุของบัญชีพยาน ----
const c = newCase('criminal');
c.court = 'ศาลจังหวัดธัญบุรี';
c.parties = [Object.assign(newParty('plaintiff'), { prefix: 'นาย', first: 'ก', last: 'ข' }), Object.assign(newParty('defendant'), { prefix: 'นาย', first: 'ค', last: 'ง' })];
c.hearing = { date: '2026-12-01', time: '09.00' };
c.docs = { ...c.docs, witness: true, witnessSummons: true };
const addr = { no: '9', moo: '', building: '', soi: '', road: 'ถนนสมมติ', sub: 'ตำบลสมมติ', district: 'อำเภอสมมติ', province: 'เชียงราย', zip: '57000' };
c.witnesses = [
  { ...w('หมายเรียก', false), name: 'พยานก', addr },   // สวิตช์ปิดแต่หมายเหตุสั่งออกหมาย → ออก
  { ...w('นำ', true), name: 'พยานข', addr },            // สวิตช์เปิดแต่หมายเหตุสั่งนำเอง → ไม่ออก
  { ...w('', true), name: 'พยานค', addr },              // ว่าง ตามสวิตช์เปิด → ออก
  { ...w('', false), name: 'พยานง', addr },             // ว่าง ตามสวิตช์ปิด → ไม่ออก
];
const plan = witnessSummonsPlan(c);
assert.deepEqual(plan.map((p) => p.name).sort(), ['พยานก', 'พยานค'], 'ออกหมายเฉพาะที่หมายเหตุ/สวิตช์ตัดสินว่าออก');
const docs = buildDocuments(c, { laws: [], items: [], courtPhones: {}, formText: {} });
assert.equal(docs.filter((d) => d.id.startsWith('witnessSummons-')).length, 2);
const table = docs.find((d) => d.id === 'witness').blocks.find((b) => b.t === 'table');
const noteOf = (name) => table.rows.find((r) => r[1].includes(name))?.[3];
assert.equal(noteOf('พยานก'), 'หมายเรียก'); assert.equal(noteOf('พยานข'), 'นำ'); assert.equal(noteOf('พยานค'), 'หมายเรียก'); assert.equal(noteOf('พยานง'), 'นำ');
console.log('witness-note OK');
