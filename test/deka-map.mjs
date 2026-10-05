// ทดสอบตัวแปลงข้อมูลฎีกา (scripts/deka/precedent-map.mjs) — ไม่ต้องใช้เครือข่ายหรือฐานข้อมูล
import assert from 'node:assert/strict';
import { arabic, tokenize, inferCaseType, mapRow } from '../scripts/deka/precedent-map.mjs';

assert.equal(arabic('มาตรา ๒๘๘ ปี ๒๕๖๐'), 'มาตรา 288 ปี 2560');
// เลขไทยติดคำ: ต้องแยกเลขออกมาเป็นโทเค็นของตัวเอง
assert.ok(tokenize('มาตรา๒๘๘').includes('288'), 'เลขไทยติดคำต้องค้นเจอเป็น 288');
assert.ok(tokenize('ผู้เสียหายมีสิทธิร้องทุกข์').length >= 3);
assert.deepEqual(tokenize('ศาล ศาล ศาล'), ['ศาล'], 'ไม่ซ้ำ');
assert.deepEqual(tokenize(''), []); assert.deepEqual(tokenize(null), []);
assert.ok(!tokenize('ก ข 5').includes('ก'), 'ตัวอักษรเดี่ยวทิ้ง');
assert.ok(tokenize('ก ข 5').includes('5'), 'ตัวเลขเดี่ยวเก็บ');

assert.equal(inferCaseType([{ abbr: 'ป.อ.' }]), 'อาญา');
assert.equal(inferCaseType([{ abbr: 'ป.พ.พ.' }, { abbr: 'ป.วิ.พ.' }]), 'แพ่ง');
assert.equal(inferCaseType([{ abbr: 'ป.อ.' }, { abbr: 'ป.พ.พ.' }]), 'แพ่งและอาญา');
assert.equal(inferCaseType([{ abbr: 'พ.ร.บ.x' }]), null);
assert.equal(inferCaseType([]), null);

const raw = {
  docId: 45962, titleRaw: 'คำพิพากษาศาลฎีกาที่ 2942/2519', docType: 'คำพิพากษาศาลฎีกา', caseNo: '2942', year: 2519,
  shortText: 'จำเลยกับพวกอีก 3 คน ร่วมกันฆ่าผู้อื่น  \r\n\r\n\r\n\r\nศาลฎีกาพิพากษายืน', longText: '',
  laws: [{ code: 'ป06-01', name: 'ประมวลกฎหมายอาญา', abbr: 'ป.อ.', sections: ['ม. 59', 'ม. 288'] }],
  source: ['กองผู้ช่วยผู้พิพากษา'], litigants: ['โจทก์ - พนักงานอัยการ', 'จำเลย - นายสมชาย'], judges: ['วิทูร เทพพิทักษ์'],
  lowerCourts: ['ศาลอุทธรณ์ - นายประการ'], department: [], blackNo: [], primaryCourtNos: ['หมายเลขคดีดำ - อ912/2539'], remark: '', sourceUrl: 'https://x/y', retrievedAt: '2026-10-05T19:53:07.337Z',
};
const r = mapRow(raw);
assert.equal(r.source_doc_id, '45962');
assert.equal(r.case_no, '2942'); assert.equal(r.year, 2519);
assert.equal(r.case_type, 'อาญา');
assert.deepEqual(r.sections, ['ป.อ. ม. 59', 'ป.อ. ม. 288']);
assert.equal(r.full_text, null, 'ย่อยาวว่าง = null');
assert.ok(!/\n{3,}/.test(r.headnote) && !r.headnote.includes('\r'), 'จัดบรรทัดว่างซ้อนและ CR');
assert.ok(r.tok_a.split(' ').includes('2942') && r.tok_a.split(' ').includes('2519') && r.tok_a.split(' ').includes('288'));
assert.ok(r.tok_b.length > 0 && r.tok_c === '');
assert.deepEqual(r.litigants, ['โจทก์ - พนักงานอัยการ', 'จำเลย - นายสมชาย']);
assert.ok(Array.isArray(r.laws) && r.laws[0].abbr === 'ป.อ.', 'laws ต้องเป็นอาร์เรย์ (ไม่ใช่สตริง JSON)');
// โทเค็นของ headnote ไม่ซ้ำกับของ A (เลขฎีกา/ปี/มาตรา) เพื่อไม่ให้ดัชนีบวมโดยไม่จำเป็น
const aSet = new Set(r.tok_a.split(' ')); assert.ok(r.tok_b.split(' ').filter(Boolean).every((w) => !aSet.has(w)));

// ข้อมูลไม่ครบ → null ; ฟิลด์หายไปไม่ทำให้พัง
assert.equal(mapRow(null), null); assert.equal(mapRow({}), null);
assert.equal(mapRow({ docId: 1, caseNo: '', year: 2500 }), null);
assert.equal(mapRow({ docId: 1, caseNo: '5', year: 'x' }), null);
const min = mapRow({ docId: 'a1', caseNo: '5', year: 2500 });
assert.ok(min && min.litigants.length === 0 && min.laws === null && min.headnote === null && min.case_type === null);
console.log('deka-map OK');
