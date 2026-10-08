// ทดสอบเอกสารหลังยื่นฟ้อง (ข้อมูลสมมติทั้งหมด): เลขคดีดำ/แดง (แต่ละเลขมีปีของตัวเอง) บนหัวเอกสาร · บัญชีพยานเพิ่มเติม (แบบ ๑๕ ทวิ) · หมายเรียก · คำร้อง · ข้อมูลการ์ดรายการ
// เลขคดีไม่บังคับ: ไม่มีเลขคดีก็ออกเอกสารได้ทุกฉบับ ไม่มีข้อความเตือนเรื่องเลขคดี
import assert from 'node:assert/strict';
import { newCase, newParty, newWitness, uid, isFiled, caseNoParts, filedBadge, caseListInfo, validateCase, witnessList, caseLabel, migrateCaseYears } from '../shared/model.js';
import { buildDocuments, isPostFilingDoc } from '../shared/docs.js';
import { toThaiDigits } from '../shared/thai.js';
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
  return c;
}
const wit = (name, o = {}) => ({ ...newWitness(o.kind || 'person', !!o.extra), name, ...o });

for (const type of ['criminal', 'civil']) {
  const c = base(type);
  c.caseNoBlack = type === 'civil' ? 'พ.456' : 'อ.123'; c.caseYearBlack = '2569';
  c.caseNoRed = 'ผ.7'; c.caseYearRed = '2570';
  c.witnesses = [wit('นายพยาน หนึ่ง'), wit('นางสาวพยาน สอง', { extra: true }), wit('สัญญาเช่าสมมติ', { kind: 'document', extra: true, holder: 'บริษัท สมมติ จำกัด' })];
  c.motions = [{ id: 'm1', kind: 'คำร้อง', title: 'ขอเลื่อนนัดสมมติ', text: 'โจทก์ขอเลื่อนนัด' }, { id: 'm2', kind: 'คำแถลง', title: 'แถลงสมมติ', text: 'โจทก์ขอแถลง' }];
  c.service = { ...c.service, mode: 'post' };
  c.docs = { ...c.docs, answer: true, settlement: true, attorney: true, proxy: true };
  c.hearing = { date: '2026-12-01', time: '09.00' };

  assert.equal(isFiled(c), true);
  const docs = buildDocuments(c, data);
  const ids = docs.map((d) => d.id);
  console.log(type, ids.join(', '));

  // 1) ทุกเอกสารที่ออก (ไม่ว่าชนิดใด) พิมพ์เลขคดีดำ + ปีของเลขดำ ; เลขแดง + ปีของเลขแดง (คนละปี) ที่หัวเอกสาร
  for (const [id, tp] of tops(docs)) {
    assert.ok(tp, `${id}: ไม่มีบล็อกหัวเรื่อง`);
    if (id === 'attachment') continue;
    assert.equal(tp.black, toThaiDigits(c.caseNoBlack), `${id}: เลขดำไม่ตรง`);
    assert.equal(tp.yearBlack, '๒๕๖๙', `${id}: ปีของเลขดำไม่ตรง`);
    assert.equal(tp.red, 'ผ.๗', `${id}: เลขแดงไม่ตรง`);
    assert.equal(tp.yearRed, '๒๕๗๐', `${id}: ปีของเลขแดงต้องแยกจากเลขดำ`);
  }

  // 2) บัญชีพยานเดิมไม่มีพยานเพิ่มเติม ; บัญชีเพิ่มเติมนับต่อจากบัญชีเดิม
  const w = docs.find((d) => d.id === 'witness'), wx = docs.find((d) => d.id === 'witnessExtra');
  assert.ok(w && wx, 'ต้องมีทั้ง witness และ witnessExtra');
  const rowsOf = (d) => d.blocks.find((b) => b.t === 'table').rows.filter((r) => r[0] !== '');
  const wr = rowsOf(w), xr = rowsOf(wx);
  assert.equal(wr.length, 2, 'บัญชีเดิม = โจทก์อ้างตนเอง + พยานหนึ่ง'); // 1 โจทก์ + พยานหนึ่ง
  assert.ok(!wr.some((r) => /สอง|สัญญาเช่า/.test(r[1])), 'บัญชีเดิมต้องไม่มีพยานเพิ่มเติม');
  assert.deepEqual(xr.map((r) => r[0]), ['๓', '๔'], 'บัญชีเพิ่มเติมเริ่มที่ 3 ต่อจากบัญชีเดิม 2 อันดับ');
  assert.ok(/พยานเอกสาร/.test(xr[1][1]));
  assert.equal(wx.blocks.find((b) => b.t === 'top').formNo, '(๑๕)');
  assert.match(JSON.stringify(wx.blocks.find((b) => b.t === 'top')), /บัญชีพยาน \(เพิ่มเติม\) ครั้งที่ \.{6}/);
  const intro = wx.blocks.find((b) => b.t === 'p' && /เพิ่มเติม/.test(b.runs.map((r) => r.text).join('')));
  assert.ok(intro && /อันดับที่ ๓ ถึง ๔/.test(intro.runs.map((r) => r.text).join('')), 'ประโยคระบุพยานเพิ่มเติม');

  // 3) หมายเรียกของพยานเพิ่มเติมยังออก และมีเลขคดี ; ลำดับที่ในชื่อเอกสารตรงกับบัญชี
  const sums = docs.filter((d) => d.id.startsWith('witnessSummons-'));
  assert.equal(sums.length, 3, 'หมายเรียก: พยานหนึ่ง + พยานสอง (เพิ่มเติม) + สัญญาเช่า (เพิ่มเติม)');
  assert.ok(sums.some((d) => /ลำดับที่ ๓/.test(d.title)) && sums.some((d) => /ลำดับที่ ๔/.test(d.title)), 'หมายเรียกอ้างลำดับต่อเนื่อง');
}

{ // กรณีเฉพาะอาญา: หมายเรียกครบ 2 ฉบับ (พยานหนึ่ง + สอง)
  const c = base('criminal');
  c.caseNoBlack = 'อ.123'; c.caseYearBlack = '2569';
  c.witnesses = [wit('นายพยาน หนึ่ง'), wit('นางสาวพยาน สอง', { extra: true })];
  const docs = buildDocuments(c, data);
  const sums = docs.filter((d) => d.id.startsWith('witnessSummons-'));
  assert.equal(sums.length, 2);
  assert.ok(sums.some((d) => /ลำดับที่ ๓/.test(d.title)), 'หมายเรียกพยานเพิ่มเติมเป็นลำดับที่ 3');
  // คดีมีเลขคดี: เอกสารหลังยื่นฟ้องมาก่อนชุดคำฟ้อง
  const firstNonPost = docs.findIndex((d) => !isPostFilingDoc(d));
  assert.ok(docs.slice(0, firstNonPost).every(isPostFilingDoc) && docs.slice(firstNonPost).every((d) => !isPostFilingDoc(d)), 'เรียงกลุ่มหลังยื่นฟ้องก่อน');
  assert.equal(docs[0].id.startsWith('witness'), true);
}

{ // ไม่มีเลขคดี: ลำดับเอกสารเดิม ; ออกได้ทุกฉบับ ไม่เตือนเรื่องเลขคดี
  const c = base('criminal');
  c.witnesses = [wit('นายพยาน หนึ่ง')];
  c.motions = [{ id: 'm1', kind: 'คำร้อง', title: 'ขอเลื่อนนัดสมมติ', text: 'โจทก์ขอเลื่อนนัด' }];
  assert.equal(isFiled(c), false);
  assert.equal(filedBadge(c), '');
  const docs = buildDocuments(c, data);
  assert.ok(!docs.some((d) => d.id === 'witnessExtra'));
  assert.equal(docs[0].id, 'complaint');
  assert.ok(docs.some((d) => d.id.startsWith('witnessSummons-')), 'ไม่มีเลขคดีก็ต้องออกหมายเรียกพยาน');
  assert.ok(docs.some((d) => d.id.startsWith('motion-')), 'ไม่มีเลขคดีก็ต้องออกคำร้อง');
  for (const [, tp] of tops(docs)) { assert.equal(tp.black, ''); assert.equal(tp.yearBlack, ''); assert.equal(tp.red, ''); assert.equal(tp.yearRed, ''); }
  // ธงเพิ่มเติมก่อนฟ้อง → ไม่เตือนเรื่องเลขคดีเลย และสร้างเอกสารได้ (เลขคดีเป็นแค่ช่องที่เติมลงหัวเอกสาร)
  c.witnesses.push(wit('นางสาวพยาน สอง', { extra: true }));
  const idx = { items: new Map(), laws: new Map() };
  assert.ok(!validateCase(c, idx).some((i) => /เลขคดี/.test(i.msg)), 'ต้องไม่มีข้อความเตือนเรื่องเลขคดี');
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

{ // เลขคดีพิมพ์รวม "อ.123/2569" → แยกปี ต่อเลข ; มีเฉพาะเลขแดง = มีเลขคดี
  const c = base('criminal');
  c.caseNoBlack = 'อ.123/2569';
  assert.deepEqual(caseNoParts(c), { black: 'อ.123', yearBlack: '2569', red: '', yearRed: '' });
  c.caseNoRed = 'พ.5/2570'; // แต่ละเลขแยกปีของตัวเอง
  assert.deepEqual(caseNoParts(c), { black: 'อ.123', yearBlack: '2569', red: 'พ.5', yearRed: '2570' });
  c.caseYearRed = '๒๕๗๑'; // ช่องปีมาก่อนปีที่พิมพ์รวม (รับเลขไทยที่ผู้ใช้พิมพ์)
  assert.equal(caseNoParts(c).yearRed, '๒๕๗๑');
  const c2 = base('criminal'); c2.caseNoRed = 'ผ.9'; c2.caseYearRed = '2570';
  assert.equal(isFiled(c2), true);
  c2.options.thaiDigits = false;
  assert.equal(filedBadge(c2), 'ฟ้องแล้ว · แดง ผ.9/2570');
  c2.options.thaiDigits = true;
  assert.equal(filedBadge(c2), 'ฟ้องแล้ว · แดง ผ.๙/๒๕๗๐');
  assert.equal(caseLabel(c2), 'คดีหมายเลขแดงที่ ผ.9/2570');
  c2.caseNoBlack = 'อ.1'; c2.caseYearBlack = '2569';
  assert.equal(caseLabel(c2), 'คดีหมายเลขดำที่ อ.1/2569', 'ป้ายการ์ดใช้เลขดำ + ปีของเลขดำก่อน');
}

{ // ข้อมูลเก่ามีปีช่องเดียว (caseYear): ใช้เป็นปีของเลขที่มีอยู่ ทั้งตอนพิมพ์เอกสารและตอนโหลด (migrateCaseYears)
  const c = base('criminal');
  c.caseNoBlack = 'อ.123'; c.caseYear = '2569';
  assert.deepEqual(caseNoParts(c), { black: 'อ.123', yearBlack: '2569', red: '', yearRed: '' });
  assert.equal(caseLabel(c), 'คดีหมายเลขดำที่ อ.123/2569');
  const docs = buildDocuments(c, data);
  const tp = docs.find((d) => d.id === 'complaint').blocks.find((b) => b.t === 'top');
  assert.equal(tp.black, 'อ.๑๒๓'); assert.equal(tp.yearBlack, '๒๕๖๙'); assert.equal(tp.red, ''); assert.equal(tp.yearRed, '');
  c.caseNoRed = 'ผ.5';
  migrateCaseYears(c);
  assert.equal(c.caseYear, undefined, 'เลิกเขียน caseYear');
  assert.equal(c.caseYearBlack, '2569'); assert.equal(c.caseYearRed, '2569');
  // ชื่อเก่าบนรายการ (แถวจากฐานข้อมูล) ที่มีแต่ caseYear ก็ได้ป้ายถูก
  assert.equal(caseLabel({ caseNoBlack: 'อ.9', caseYear: '2568' }), 'คดีหมายเลขดำที่ อ.9/2568');
}

{ // ข้อมูลการ์ดรายการ
  const c = base('criminal');
  c.parties.push(person('plaintiff', 'อีกคน', 'หนึ่ง'), person('defendant', 'จำเลย', 'สอง'), person('defendant', 'จำเลย', 'สาม'));
  c.caseNoBlack = 'อ.1'; c.caseYearBlack = '2569'; c.caseNoRed = 'ผ.2'; c.caseYearRed = '2570';
  const i = caseListInfo(c);
  assert.deepEqual(i, { caseNoBlack: 'อ.1', caseYearBlack: '2569', caseNoRed: 'ผ.2', caseYearRed: '2570', filed: true, plName: 'นายสมมติ โจทก์ทดสอบ', plMore: 1, dfName: 'นายสมมุติ จำเลยทดสอบ', dfMore: 2 });
  // ยังไม่กรอกชื่อ (มีแต่คำนำหน้า “นาย”) → ไม่แสดงเป็นชื่อ
  const e = newCase('criminal');
  assert.equal(caseListInfo(e).plName, '');
  assert.equal(caseListInfo(e).dfName, '');
}

{ // เลย์เอาต์: บัญชีพยานเพิ่มเติมใช้ค่าของบัญชีพยานถ้ายังไม่ตั้งเฉพาะแบบ
  const L = { all: {}, forms: { witness: { 'caseNo.dy': 0.1 } } };
  assert.equal(resolveLayout(L, 'witnessExtra')['caseNo.dy'], 0.1);
  assert.equal(resolveLayout({ all: {}, forms: { witness: { 'caseNo.dy': 0.1 }, witnessExtra: { 'caseNo.dy': 2 } } }, 'witnessExtra')['caseNo.dy'], 2);
}

{ // ออกไฟล์ Word ได้ (ทุกบล็อกที่ใช้ รวมตารางบัญชีพยานเพิ่มเติม)
  const c = base('criminal');
  c.caseNoBlack = 'อ.123'; c.caseYearBlack = '2569';
  c.witnesses = [wit('นายพยาน หนึ่ง'), wit('นางสาวพยาน สอง', { extra: true })];
  const docs = buildDocuments(c, data);
  const buf = await renderDocx(docs, 'ทดสอบ');
  assert.ok(buf.length > 5000);
  const wx = docs.find((d) => d.id === 'witnessExtra');
  assert.equal(wx.blocks.find((b) => b.t === 'top').black, 'อ.๑๒๓');
  assert.equal(wx.blocks.find((b) => b.t === 'table').rows[0][0], '๓');
}
console.log('followup OK');
