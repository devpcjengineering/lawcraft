// ทดสอบย่อหน้าของข้อ/ข้อย่อยในคำฟ้อง คำร้อง คำให้การ (ข้อมูลสมมติทั้งหมด)
//   ข้อ N. = 1.5 ซม. · N.N = 3.25 · N.N.N = 4.75 · (N)/(ก)/ก. ลึกกว่าข้อย่อยตัวเลขก่อนหน้าหนึ่งขั้น · บรรทัดอื่นชิดซ้าย (0)
//   “ข้อ N.” ที่ผู้ใช้พิมพ์ขึ้นต้นบรรทัดเองโดยไม่เว้นบรรทัด = ข้อใหม่ (เลขข้อเรียงต่อเนื่อง ป้ายเดิมถูกตัดออก)
import assert from 'node:assert/strict';
import { newCase, newParty, uid } from '../shared/model.js';
import { buildDocuments } from '../shared/docs.js';

const data = { laws: [], items: [], formText: {} };
const person = (role, first, last) => Object.assign(newParty(role), { first, last });
const mk = () => {
  const c = newCase('criminal');
  c.court = 'ศาลจังหวัดเชียงราย';
  c.parties = [person('plaintiff', 'สมมติ', 'โจทก์ทดสอบ'), person('defendant', 'สมมุติ', 'จำเลยทดสอบ')];
  return c;
};
const plain = (b) => (b.runs || []).map((r) => r.text || '').join('');
/** ย่อหน้าของเนื้อหาข้อในเอกสาร: [ข้อความย่อ, indent] เฉพาะบรรทัดที่ขึ้นต้นด้วยคำที่สนใจ */
const paras = (doc, re) => doc.blocks.filter((b) => b.t === 'p' && re.test(plain(b))).map((b) => [plain(b).slice(0, 30), b.indent || 0]);

const TEXT = [
  'ข้อแรกสมมติ',
  'บรรทัดต่อของข้อแรก',
  'ข้อ 2. ข้อสองพิมพ์เลขเอง',
  'บรรทัดต่อของข้อสอง',
  '2.1 ข้อย่อยสองหนึ่ง',
  '(1) วงเล็บใต้สองหนึ่ง',
  '(2) วงเล็บสองใต้สองหนึ่ง',
  '2.1.1 ข้อย่อยสามระดับ',
  '(ก) วงเล็บใต้สามระดับ',
  'ข้อ ๓. ข้อสามเลขไทย',
  '(1) วงเล็บใต้ข้อสามโดยตรง',
  'บรรทัดต่อของวงเล็บ',
  '',
  'ข้อสี่หลังบรรทัดว่าง',
].join('\n');

// คำร้อง
{
  const c = mk();
  c.motions = [{ id: 'm1', kind: 'คำร้อง', title: 'สมมติ', text: TEXT }];
  const d = buildDocuments(c, data).find((x) => x.id === 'motion-m1');
  const labels = d.blocks.filter((b) => b.t === 'p' && /^ข้อ [๐-๙]+\.$/.test(b.runs?.[0]?.text || '')).map((b) => [b.runs[0].text, plain(b).slice(0, 14), b.indent]);
  assert.deepEqual(labels.map((x) => x[0]), ['ข้อ ๑.', 'ข้อ ๒.', 'ข้อ ๓.', 'ข้อ ๔.'], 'ข้อ ๒/๓ ที่พิมพ์เองและข้อหลังบรรทัดว่าง = ข้อใหม่ เรียงเลขต่อ');
  assert.ok(labels.every((x) => x[2] === 1.5), 'ป้ายเลขข้อย่อหน้า 1.5');
  const joined = d.blocks.map(plain).join('\n');
  assert.equal((joined.match(/ข้อ ๒\./g) || []).length, 1, 'ป้าย “ข้อ ๒.” ที่ผู้ใช้พิมพ์ถูกตัดออก เหลือป้ายของระบบอันเดียว');
  assert.equal((joined.match(/ข้อ ๓\./g) || []).length, 1, 'ป้าย “ข้อ ๓.” เช่นกัน');
  assert.deepEqual(paras(d, /^บรรทัดต่อ/), [['บรรทัดต่อของข้อแรก', 0], ['บรรทัดต่อของข้อสอง', 0], ['บรรทัดต่อของวงเล็บ', 0]], 'บรรทัดต่อชิดซ้าย');
  assert.deepEqual(paras(d, /^๒\.๑ /), [['๒.๑ ข้อย่อยสองหนึ่ง', 3.25]]);
  assert.deepEqual(paras(d, /^๒\.๑\.๑/), [['๒.๑.๑ ข้อย่อยสามระดับ', 4.75]]);
  assert.deepEqual(paras(d, /^\(๑\)|^\(๒\)|^\(ก\)/), [
    ['(๑) วงเล็บใต้สองหนึ่ง', 4.75], ['(๒) วงเล็บสองใต้สองหนึ่ง', 4.75], ['(ก) วงเล็บใต้สามระดับ', 6.25], ['(๑) วงเล็บใต้ข้อสามโดยตรง', 3.25],
  ], 'วงเล็บลึกกว่าข้อย่อยตัวเลขก่อนหน้าหนึ่งขั้น และกลับมา 3.25 เมื่อขึ้นข้อใหม่');
}

// คำให้การ + คำฟ้อง (ข้อเท็จจริงช่องเดียวที่พิมพ์ “ข้อ ๒.” เอง) ใช้กติกาเดียวกัน
{
  const c = mk();
  c.answer = { defendantId: '', templateId: '', text: 'ให้การข้อแรก\n1.1 ย่อยหนึ่ง\n(1) วงเล็บ\nข้อ 2. ให้การข้อสอง' };
  c.docs.answer = true;
  const a = buildDocuments(c, data).find((x) => x.id === 'answer');
  assert.deepEqual(paras(a, /^๑\.๑|^\(๑\)|^ให้การข้อสอง/), [['๑.๑ ย่อยหนึ่ง', 3.25], ['(๑) วงเล็บ', 4.75]]);
  assert.ok(a.blocks.some((b) => b.t === 'p' && b.runs?.[0]?.text === 'ข้อ ๒.' && plain(b).includes('ให้การข้อสอง')), 'คำให้การ: ข้อ ๒ ที่พิมพ์เองเป็นข้อใหม่');

  c.facts = [{ id: uid(), text: 'ข้อเท็จจริงหนึ่ง\nข้อ 2. ข้อเท็จจริงสอง\n2.1 ย่อย' }, { id: uid(), text: 'ข้อเท็จจริงสาม' }];
  const cp = buildDocuments(c, data).find((x) => x.id === 'complaint');
  const lab = cp.blocks.filter((b) => b.t === 'p' && /^ข้อ [๐-๙]+\.$/.test(b.runs?.[0]?.text || '')).map((b) => plain(b).slice(0, 40));
  assert.ok(lab[0].startsWith('ข้อ ๑. ข้อเท็จจริงหนึ่ง') && lab[1].startsWith('ข้อ ๒. ข้อเท็จจริงสอง') && lab[2].startsWith('ข้อ ๓. ข้อเท็จจริงสาม'), 'คำฟ้อง: เลขข้อเรียงต่อเนื่องข้ามช่อง ' + lab.join(' | '));
  assert.deepEqual(paras(cp, /^๒\.๑/), [['๒.๑ ย่อย', 3.25]]);
}

console.log('item-indent OK');
