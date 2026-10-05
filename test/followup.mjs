// ทดสอบเอกสารหลังยื่นฟ้อง (ข้อมูลสมมติทั้งหมด): เลขคดีบนหัวเอกสาร · บัญชีพยานเพิ่มเติม (แบบ ๑๕ ทวิ) · หมายเรียก · คำร้อง · ข้อมูลการ์ดรายการ
import assert from 'node:assert/strict';
import { newCase, newParty, newWitness, uid, isFiled, caseNoParts, filedBadge, caseListInfo, validateCase, witnessList, caseLabel } from '../shared/model.js';
import { buildDocuments, isPostFilingDoc } from '../shared/docs.js';
import { resolveLayout } from '../shared/layout.js';
import { renderDocx } from '../server/render-docx.js';

const data = { laws: [], items: [], formText: {} };
const tops = (docs) => docs.map((d) => [d.id, d.blocks.find((b) => b.t === 'top')]);

function person(role, first, last) {
  return Object.assign(newParty(role), { first, last, idCard: '1101700230673' });
}
function base(type) {
  const c = newCase(type);
  c.court = type === 'civil' ? 'ศาลแพ่ง' : 'ศาลจังหวัดเชียงราย';
  c.parties = [person('plaintiff', 'สมมติ', 'โจทก์ทดสอบ'), person('defendant', 'สมมุติ', 'จำเลยทดสอบ')];
  c.parties[1].address.province = 'เชียงราย';
  c.facts = [{ id: uid(), text: 'ข้อเท็จจริงสมมติ' }];
  c.options.thaiDigits = false;
  return c;
}
const wit = (name, o = {}) => ({ ...newWitness(o.kind || 'person', !!o.extra), name, ...o });

for (const type of ['criminal', 'civil']) {
  const c = base(type);
  c.caseNoBlack = type === 'civil' ? 'พ.456' : 'อ.123'; c.caseYear = '2569';
  c.witnesses = [wit('นายพยาน หนึ่ง'), wit('นางสาวพยาน สอง', { extra: true }), wit('สัญญาเช่าสมมติ', { kind: 'document', extra: true, holder: 'บริษัท สมมติ จำกัด' })];
  c.motions = [{ id: 'm1', kind: 'คำร้อง', title: 'ขอเลื่อนนัดสมมติ', text: 'โจทก์ขอเลื่อนนัด' }, { id: 'm2', kind: 'คำแถลง', title: 'แถลงสมมติ', text: 'โจทก์ขอแถลง' }];
  c.service = { ...c.service, mode: 'post' };
  c.docs = { ...c.docs, answer: true, settlement: true, attorney: true, proxy: true };
  c.hearing = { date: '2026-12-01', time: '09.00' };

  assert.equal(isFiled(c), true);
  const docs = buildDocuments(c, data);
  const ids = docs.map((d) => d.id);
  console.log(type, ids.join(', '));

  // 1) ทุกเอกสารที่ออก (ไม่ว่าชนิดใด) พิมพ์เลขคดีดำ + ปีที่หัวเอกสาร
  for (const [id, tp] of tops(docs)) {
    assert.ok(tp, `${id}: ไม่มีบล็อกหัวเรื่อง`);
    if (id === 'attachment') continue;
    assert.equal(tp.black, c.caseNoBlack, `${id}: เลขดำไม่ตรง`);
    assert.equal(tp.year, '2569', `${id}: ปีไม่ตรง`);
  }

  // 2) บัญชีพยานเดิมไม่มีพยานเพิ่มเติม ; บัญชีเพิ่มเติมนับต่อจากบัญชีเดิม
  const w = docs.find((d) => d.id === 'witness'), wx = docs.find((d) => d.id === 'witnessExtra');
  assert.ok(w && wx, 'ต้องมีทั้ง witness และ witnessExtra');
  const rowsOf = (d) => d.blocks.find((b) => b.t === 'table').rows.filter((r) => r[0] !== '');
  const wr = rowsOf(w), xr = rowsOf(wx);
  assert.equal(wr.length, 2, 'บัญชีเดิม = โจทก์อ้างตนเอง + พยานหนึ่ง'); // 1 โจทก์ + พยานหนึ่ง
  assert.ok(!wr.some((r) => /สอง|สัญญาเช่า/.test(r[1])), 'บัญชีเดิมต้องไม่มีพยานเพิ่มเติม');
  assert.deepEqual(xr.map((r) => r[0]), ['3', '4'], 'บัญชีเพิ่มเติมเริ่มที่ 3 ต่อจากบัญชีเดิม 2 อันดับ');
  assert.ok(/พยานเอกสาร/.test(xr[1][1]));
  assert.equal(wx.blocks.find((b) => b.t === 'top').formNo, '(๑๕ ทวิ)');
  const intro = wx.blocks.find((b) => b.t === 'p' && /เพิ่มเติม/.test(b.runs.map((r) => r.text).join('')));
  assert.ok(intro && /อันดับที่ 3 ถึง 4/.test(intro.runs.map((r) => r.text).join('')), 'ประโยคระบุพยานเพิ่มเติม');

  // 3) หมายเรียกของพยานเพิ่มเติมยังออก และมีเลขคดี ; ลำดับที่ในชื่อเอกสารตรงกับบัญชี
  const sums = docs.filter((d) => d.id.startsWith('witnessSummons-'));
  assert.equal(sums.length, 3, 'หมายเรียก: พยานหนึ่ง + พยานสอง (เพิ่มเติม) + สัญญาเช่า (เพิ่มเติม)');
  assert.ok(sums.some((d) => /ลำดับที่ 3/.test(d.title)) && sums.some((d) => /ลำดับที่ 4/.test(d.title)), 'หมายเรียกอ้างลำดับต่อเนื่อง');
}

{ // กรณีเฉพาะอาญา: หมายเรียกครบ 3 ฉบับ (พยานหนึ่ง + สอง + เอกสาร)
  const c = base('criminal');
  c.caseNoBlack = 'อ.123'; c.caseYear = '2569';
  c.witnesses = [wit('นายพยาน หนึ่ง'), wit('นางสาวพยาน สอง', { extra: true })];
  const docs = buildDocuments(c, data);
  const sums = docs.filter((d) => d.id.startsWith('witnessSummons-'));
  assert.equal(sums.length, 2);
  assert.ok(sums.some((d) => /ลำดับที่ 3/.test(d.title)), 'หมายเรียกพยานเพิ่มเติมเป็นลำดับที่ 3');
  // คดีฟ้องแล้ว: เอกสารหลังยื่นฟ้องมาก่อนชุดคำฟ้อง
  const firstNonPost = docs.findIndex((d) => !isPostFilingDoc(d));
  assert.ok(docs.slice(0, firstNonPost).every(isPostFilingDoc) && docs.slice(firstNonPost).every((d) => !isPostFilingDoc(d)), 'เรียงกลุ่มหลังยื่นฟ้องก่อน');
  assert.equal(docs[0].id.startsWith('witness'), true);
}

{ // ยังไม่ฟ้อง: ไม่มีเลขคดี ลำดับเอกสารเดิม ; ไม่มีพยานเพิ่มเติม = ไม่มี witnessExtra
  const c = base('criminal');
  c.witnesses = [wit('นายพยาน หนึ่ง')];
  assert.equal(isFiled(c), false);
  assert.equal(filedBadge(c), '');
  const docs = buildDocuments(c, data);
  assert.ok(!docs.some((d) => d.id === 'witnessExtra'));
  assert.equal(docs[0].id, 'complaint');
  for (const [, tp] of tops(docs)) assert.equal(tp.black, '');
  // ธงเพิ่มเติมก่อนฟ้อง → เตือนให้ใส่เลขคดี แต่ยังสร้างเอกสารได้
  c.witnesses.push(wit('นางสาวพยาน สอง', { extra: true }));
  assert.ok(validateCase(c, { items: new Map(), laws: new Map() }).some((i) => /ยังไม่ได้ใส่เลขคดี/.test(i.msg)));
  assert.ok(buildDocuments(c, data).some((d) => d.id === 'witnessExtra'));
  // ปิดด้วยสวิตช์
  c.docs.witnessExtra = false;
  assert.ok(!buildDocuments(c, data).some((d) => d.id === 'witnessExtra'));
  // witnessList ลำดับต่อเนื่องแม้พยานเพิ่มเติมถูกเพิ่มก่อนพยานเดิมในอาร์เรย์
  c.witnesses = [wit('เพิ่มเติม ก', { extra: true }), wit('เดิม ข')];
  const wl = witnessList(c);
  assert.deepEqual(wl.map((r) => r.no), [1, 2, 3]);
  assert.deepEqual(wl.slice(1).map((r) => r.w.name), ['เดิม ข', 'เพิ่มเติม ก']);
}

{ // เลขคดีพิมพ์รวม "อ.123/2569" → แยกปี ; มีเฉพาะเลขแดง = ฟ้องแล้ว
  const c = base('criminal');
  c.caseNoBlack = 'อ.123/2569';
  assert.deepEqual(caseNoParts(c), { black: 'อ.123', red: '', year: '2569' });
  const c2 = base('criminal'); c2.caseNoRed = 'ผ.9'; c2.caseYear = '2570';
  assert.equal(isFiled(c2), true);
  assert.equal(filedBadge(c2), 'ฟ้องแล้ว · แดง ผ.9/2570');
  c2.options.thaiDigits = true;
  assert.equal(filedBadge(c2), 'ฟ้องแล้ว · แดง ผ.๙/๒๕๗๐');
  assert.equal(caseLabel(c2), 'คดีหมายเลขแดงที่ ผ.9/2570');
}

{ // ข้อมูลการ์ดรายการ
  const c = base('criminal');
  c.parties.push(person('plaintiff', 'อีกคน', 'หนึ่ง'), person('defendant', 'จำเลย', 'สอง'), person('defendant', 'จำเลย', 'สาม'));
  c.caseNoBlack = 'อ.1'; c.caseYear = '2569';
  const i = caseListInfo(c);
  assert.deepEqual(i, { caseNoBlack: 'อ.1', caseNoRed: '', caseYear: '2569', filed: true, plName: 'นายสมมติ โจทก์ทดสอบ', plMore: 1, dfName: 'นายสมมุติ จำเลยทดสอบ', dfMore: 2 });
}

{ // เลย์เอาต์: บัญชีพยานเพิ่มเติมใช้ค่าของบัญชีพยานถ้ายังไม่ตั้งเฉพาะแบบ
  const L = { all: {}, forms: { witness: { 'caseNo.dy': 0.1 } } };
  assert.equal(resolveLayout(L, 'witnessExtra')['caseNo.dy'], 0.1);
  assert.equal(resolveLayout({ all: {}, forms: { witness: { 'caseNo.dy': 0.1 }, witnessExtra: { 'caseNo.dy': 2 } } }, 'witnessExtra')['caseNo.dy'], 2);
}

{ // ออกไฟล์ Word ได้ (ทุกบล็อกที่ใช้ รวมตารางบัญชีพยานเพิ่มเติม)
  const c = base('criminal');
  c.caseNoBlack = 'อ.123'; c.caseYear = '2569';
  c.options.thaiDigits = true;
  c.witnesses = [wit('นายพยาน หนึ่ง'), wit('นางสาวพยาน สอง', { extra: true })];
  const docs = buildDocuments(c, data);
  const buf = await renderDocx(docs, 'ทดสอบ');
  assert.ok(buf.length > 5000);
  const wx = docs.find((d) => d.id === 'witnessExtra');
  assert.equal(wx.blocks.find((b) => b.t === 'top').black, 'อ.๑๒๓');
  assert.equal(wx.blocks.find((b) => b.t === 'table').rows[0][0], '๓');
}
console.log('followup OK');


