// บัญชีพยาน (เพิ่มเติม) หลายครั้ง: เลขอันดับต่อเนื่องข้ามครั้ง · เอกสารแยกครั้งละฉบับ · ข้อมูลเดิม (ไม่มี w.round) ยังออกฉบับเดียว
import assert from 'node:assert/strict';
import { newCase, newParty, newWitness, uid, witnessList, witnessRounds, witnessSummonsPlan } from '../shared/model.js';
import { buildDocuments, isPostFilingDoc, docKey, docStage } from '../shared/docs.js';

const data = { laws: [], items: [], formText: {} };
const person = (role, first, last) => Object.assign(newParty(role), { first, last, idCard: '1101700230673' });
const wit = (name, o = {}) => ({ ...newWitness('person', !!o.extra), name, ...o });
function mk() {
  const c = newCase('civil');
  c.court = 'ศาลแพ่ง';
  c.parties = [person('plaintiff', 'สมมติ', 'โจทก์'), person('defendant', 'สมมุติ', 'จำเลย')];
  c.facts = [{ id: uid(), text: 'ข้อเท็จจริงสมมติ' }];
  c.options = { ...c.options, selfWitness: false };
  return c;
}
const rowsOf = (d) => d.blocks.find((b) => b.t === 'table').rows.filter((r) => r[0] !== '');
const xdocs = (c) => buildDocuments(c, data).filter((d) => /^witnessExtra/.test(d.id));

// 3 พยานเดิม + 2 พยานครั้งที่ 1 + 1 พยานครั้งที่ 2 (ใส่สลับลำดับ) → 1-3, 4-5, 6
{
  const c = mk();
  c.witnesses = [wit('ก1'), wit('ข2', { extra: true, round: '2' }), wit('ค3'), wit('ง4', { extra: true, round: '1' }), wit('จ5'), wit('ฉ6', { extra: true, round: '1' })];
  const all = witnessList(c);
  assert.deepEqual(all.map((r) => [r.no, r.w.name]), [[1, 'ก1'], [2, 'ค3'], [3, 'จ5'], [4, 'ง4'], [5, 'ฉ6'], [6, 'ข2']]);
  const rounds = witnessRounds(c);
  assert.deepEqual(rounds.map((g) => [g.id, g.label, g.rows.map((r) => r.no)]), [['witnessExtra', '1', [4, 5]], ['witnessExtra-2', '2', [6]]]);
  const docs = buildDocuments(c, data);
  const ids = docs.map((d) => d.id);
  assert.deepEqual(ids.filter((i) => /^witness(Extra|$)/.test(i)), ['witness', 'witnessExtra', 'witnessExtra-2']);
  assert.ok(ids.indexOf('witnessExtra') < ids.indexOf('witnessExtra-2'));
  const [d1, d2] = xdocs(c);
  assert.equal(d1.title, 'บัญชีพยาน (เพิ่มเติม) ครั้งที่ ๑');
  assert.equal(d2.title, 'บัญชีพยาน (เพิ่มเติม) ครั้งที่ ๒');
  assert.deepEqual(rowsOf(d1).map((r) => r[0]), ['๔', '๕']);
  assert.deepEqual(rowsOf(d2).map((r) => r[0]), ['๖']);
  assert.deepEqual(rowsOf(docs.find((d) => d.id === 'witness')).map((r) => r[0]), ['๑', '๒', '๓']);
  assert.ok(isPostFilingDoc({ id: 'witnessExtra-2' }) && isPostFilingDoc({ id: 'witnessExtra' }));
  assert.equal(docKey('witnessExtra-2'), 'witnessExtra');
  assert.equal(docStage({ id: 'witnessExtra-2' }), 'trial');
  // หมายเรียก: เลขอันดับตรงกับบัญชีรวม
  const nos = witnessSummonsPlan(c).map((g) => g.nos[0]).sort((a, b) => a - b);
  assert.deepEqual(nos, [1, 2, 3, 4, 5, 6]);
  // ปิดสวิตช์ → ไม่ออกทั้งสองฉบับ ; only:['witnessExtra'] → ออกทุกครั้ง
  c.docs.witnessExtra = false;
  assert.equal(xdocs(c).length, 0);
  assert.equal(buildDocuments(c, data, ['witnessExtra']).length, 2);
}

// ป้ายครั้งที่ว่าง → จุดไข่ปลา
{
  const c = mk();
  c.witnesses = [wit('ก1'), wit('ข2', { extra: true })];
  const [d] = xdocs(c);
  assert.equal(xdocs(c).length, 1);
  assert.equal(d.id, 'witnessExtra');
  assert.ok(/ครั้งที่ \.{6}/.test(d.title), d.title);
}

// ข้อมูลเดิม: extra:true ไม่มี round + c.witnessExtraRound='2' → ฉบับเดียว ครั้งที่ ๒
{
  const c = mk();
  c.witnessExtraRound = '2';
  c.witnesses = [wit('ก1'), wit('ข2', { extra: true }), wit('ค3', { extra: true })];
  const ds = xdocs(c);
  assert.equal(ds.length, 1);
  assert.equal(ds[0].id, 'witnessExtra');
  assert.equal(ds[0].title, 'บัญชีพยาน (เพิ่มเติม) ครั้งที่ ๒');
  assert.deepEqual(rowsOf(ds[0]).map((r) => r[0]), ['๒', '๓']);
}
console.log('witness-rounds ok');
