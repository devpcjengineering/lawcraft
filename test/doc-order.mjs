// ทดสอบลำดับเอกสาร + การแบ่งชั้น (ก่อนฟ้อง/ไต่สวนมูลฟ้อง · พิจารณา) + กติกาขีดเส้นใต้เลขข้อ (ข้อมูลสมมติทั้งหมด)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { newCase, newParty, newWitness, uid } from '../shared/model.js';
import { buildDocuments, DOC_STAGE, DOC_ORDER, docStage, docKey, DOC_TYPES } from '../shared/docs.js';
import { renderDocx } from '../server/render-docx.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = { laws: [], items: [], formText: {} };
const src = fs.readFileSync(path.join(root, 'public', 'js', 'render-html.js'), 'utf8').split("'/shared/").join(`'${pathToFileURL(path.join(root, 'shared')).href}/`);
const { docsHtml } = await import('data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64'));

const person = (role, first, last) => Object.assign(newParty(role), { first, last, idCard: '1101700230673' });
function base(type = 'criminal') {
  const c = newCase(type);
  c.court = type === 'civil' ? 'ศาลแพ่ง' : 'ศาลจังหวัดเชียงราย';
  c.parties = [person('plaintiff', 'สมมติ', 'โจทก์ทดสอบ'), person('defendant', 'สมมุติ', 'จำเลยทดสอบ')];
  c.parties[1].address.province = 'เชียงราย';
  c.facts = [{ id: uid(), text: 'ข้อเท็จจริงสมมติข้อแรก' }, { id: uid(), text: 'ข้อเท็จจริงสมมติข้อสอง' }, { id: uid(), text: 'ข้อเท็จจริงสมมติข้อสาม' }];
  c.witnesses = [
    { ...newWitness('person', false), name: 'นายพยาน หนึ่ง' },
    { ...newWitness('person', true), name: 'นางสาวพยาน สอง' },
  ];
  c.motions = [{ id: 'm1', kind: 'คำร้อง', title: 'ขอเลื่อนนัดสมมติ', text: 'ขอเลื่อนนัดเพราะเหตุสมมติ\n\nเหตุผลข้อสองสมมติ' }, { id: 'm2', kind: 'คำแถลง', title: 'แถลงสมมติ', text: 'ขอแถลง' }];
  c.service = { ...c.service, mode: 'post' };
  c.docs = { ...c.docs, attorney: true, proxy: true };
  c.counsel = { ...c.counsel, enabled: true, first: 'ทนาย', last: 'สมมติ' };
  c.hearing = { date: '2026-12-01', time: '09.00' };
  return c;
}
const ids = (docs) => docs.map((d) => d.id);
const stripSuffix = (list) => list.map(docKey);

// ---------- โครงสร้างคงที่ ----------
assert.equal(DOC_ORDER.length, new Set(DOC_ORDER).size);
for (const k of DOC_ORDER) assert.ok(DOC_STAGE[k] === 'pre' || DOC_STAGE[k] === 'trial', `${k}: ต้องมีชั้น`);
for (const { key } of DOC_TYPES) assert.ok(DOC_STAGE[key], `${key}: ชนิดเอกสารต้องมีชั้น`);
assert.equal(docStage('complaint'), 'pre');
assert.equal(docStage('summons-abc'), 'pre', 'หมายนัดไต่สวนแยกต่อจำเลย = ก่อนฟ้อง');
assert.equal(docStage('motion-m1'), 'trial');
assert.equal(docStage('witnessSummons-p-1'), 'trial');
assert.equal(docStage({ id: 'witnessExtra' }), 'trial');
assert.equal(docStage({ id: 'witnessExtra-2' }), 'trial');
assert.equal(docStage('witnessRequest'), 'trial');
assert.equal(docKey('motion-xyz'), 'motions');
assert.equal(docKey('witnessSummons-i-9'), 'witnessSummons');

// ---------- ยังไม่ฟ้อง: ชั้นก่อนฟ้องก่อน → ชั้นพิจารณา ----------
{
  const c = base('criminal');
  c.service.mode = 'post';
  const docs = buildDocuments(c, data);
  const keys = stripSuffix(ids(docs));
  console.log('unfiled', ids(docs).join(', '));
  const pos = (k) => keys.indexOf(k);
  // คำฟ้อง → คำขอท้ายคำฟ้อง → คำร้องปิดหมาย → บัญชีพยาน → หมายนัดไต่สวนมูลฟ้อง → ใบแต่งทนาย → ใบมอบอำนาจ
  const pre = ['complaint', 'prayer', 'service', 'witness', 'summons', 'attorney', 'proxy'];
  pre.forEach((k, i) => { assert.ok(pos(k) >= 0, `ขาด ${k}`); if (i) assert.ok(pos(pre[i - 1]) < pos(k), `${pre[i - 1]} ต้องมาก่อน ${k}`); });
  // หลังฟ้อง: คำร้องอื่น ๆ → บัญชีพยานเพิ่มเติม → คำร้องขอหมายเรียกพยาน → หมายเรียกพยาน
  const trial = ['motions', 'witnessExtra', 'witnessRequest', 'witnessSummons'];
  trial.forEach((k, i) => { assert.ok(pos(k) >= 0, `ขาด ${k}`); if (i) assert.ok(pos(trial[i - 1]) < pos(k), `${trial[i - 1]} ต้องมาก่อน ${k}`); });
  assert.ok(pos('proxy') < pos('motions'), 'ชั้นก่อนฟ้องมาก่อนชั้นพิจารณา');
  // ภายในชนิดเดียวกันคงลำดับเดิม
  assert.deepEqual(ids(docs).filter((x) => x.startsWith('motion-')), ['motion-m1', 'motion-m2']);
  // ชั้นต้องไม่สลับกันเลย
  const stages = keys.map(docStage);
  assert.equal(stages.join(',').replace(/pre,/g, '').replace(/trial,?/g, ''), '', 'ไม่มีชั้นอื่น');
  assert.ok(stages.lastIndexOf('pre') < stages.indexOf('trial'), 'pre ทั้งหมดอยู่ก่อน trial');
}

// ---------- ฟ้องแล้ว (มีเลขคดี): ชั้นพิจารณามาก่อน ----------
{
  const c = base('criminal');
  c.caseNoBlack = 'อ.123'; c.caseYearBlack = '2569';
  const docs = buildDocuments(c, data);
  const keys = stripSuffix(ids(docs));
  console.log('filed', ids(docs).join(', '));
  assert.deepEqual(keys.slice(0, 3), ['motions', 'motions', 'witnessExtra']);
  const stages = keys.map(docStage);
  assert.ok(stages.lastIndexOf('trial') < stages.indexOf('pre'), 'ชั้นพิจารณาทั้งหมดอยู่ก่อนชั้นก่อนฟ้อง');
  const order = (a, b) => assert.ok(keys.indexOf(a) < keys.indexOf(b), `${a} ก่อน ${b}`);
  order('motions', 'witnessExtra'); order('witnessExtra', 'witnessRequest'); order('witnessRequest', 'witnessSummons');
  order('complaint', 'prayer'); order('prayer', 'service'); order('service', 'witness'); order('witness', 'summons'); order('summons', 'attorney'); order('attorney', 'proxy');
}

// ---------- ขีดเส้นใต้ “ข้อ N.” ทุกข้อ (หน้าเอกสาร + HTML + Word) ----------
{
  const c = base('criminal');
  const docs = buildDocuments(c, data);
  const labelRuns = (d) => d.blocks.filter((b) => b.t === 'p').flatMap((b) => b.runs).filter((r) => /^ข้อ [๐-๙]+\.$/.test(r.text));
  const complaint = docs.find((d) => d.id === 'complaint');
  const lr = labelRuns(complaint);
  assert.ok(lr.length >= 3, 'คำฟ้องมีอย่างน้อย 3 ข้อ (ข้อท้ายฟ้องอัตโนมัติอาจต่อท้าย)');
  assert.ok(lr.every((r) => r.u && r.b), 'ป้ายเลขข้อในคำฟ้องต้องหนา+ขีดเส้นใต้ทุกข้อ');
  assert.deepEqual(lr.slice(0, 3).map((r) => r.text), ['ข้อ ๑.', 'ข้อ ๒.', 'ข้อ ๓.'], 'เลขไทย');
  // เนื้อความต้องไม่ขีดเส้นใต้
  const bodyRuns = complaint.blocks.filter((b) => b.t === 'p').flatMap((b) => b.runs).filter((r) => /ข้อเท็จจริงสมมติ/.test(r.text));
  assert.ok(bodyRuns.length >= 3 && bodyRuns.every((r) => !r.u), 'เนื้อความไม่ขีดเส้นใต้');
  const motion = docs.find((d) => d.id === 'motion-m1');
  const mr = labelRuns(motion);
  assert.equal(mr.length, 2, 'คำร้อง 2 ข้อ');
  assert.ok(mr.every((r) => r.u && r.b), 'ป้ายเลขข้อในคำร้องต้องขีดเส้นใต้ทุกข้อ');
  const wreq = docs.find((d) => d.id === 'witnessRequest');
  assert.ok(wreq && labelRuns(wreq).length >= 1 && labelRuns(wreq).every((r) => r.u), 'คำร้องขอหมายเรียกพยานขีดเส้นใต้เลขข้อ');

  // HTML: ป้ายมี class u ; เนื้อความไม่มี
  const html = docsHtml(docs, {});
  assert.ok(/<span class="r b u">ข้อ ๑\.<\/span>/.test(html), 'HTML: ข้อ ๑. ต้องมี class u');
  assert.ok(/<span class="r b u">ข้อ ๓\.<\/span>/.test(html), 'HTML: ข้อ ๓. ต้องมี class u');
  assert.ok(!/class="r[^"]*\bu\b[^"]*">ข้อเท็จจริง/.test(html), 'HTML: เนื้อความไม่ขีดเส้นใต้');

  // Word: run ของ “ข้อ ๑.” มี <w:u>
  const zip = await JSZip.loadAsync(await renderDocx(docs, 'ทดสอบ'));
  const xml = await zip.file('word/document.xml').async('string');
  const runs = xml.match(/<w:r>.*?<\/w:r>/gs) || [];
  const wl = runs.filter((r) => /<w:t[^>]*>ข้อ [๐-๙]+\.<\/w:t>/.test(r));
  assert.ok(wl.length >= 6, 'Word: พบป้ายเลขข้อ');
  assert.ok(wl.every((r) => /<w:u /.test(r)), 'Word: ป้ายเลขข้อทุกอันมีเส้นใต้');
  const body = runs.filter((r) => /<w:t[^>]*>[^<]*ข้อเท็จจริงสมมติ[^<]*<\/w:t>/.test(r));
  assert.ok(body.length >= 3 && body.every((r) => !/<w:u /.test(r)), 'Word: เนื้อความไม่ขีดเส้นใต้');
}

// ---------- หมายเรียกเอกสาร/วัตถุ: หัวเรื่อง “รายละเอียดที่ต้องจัดส่ง…” ไม่ขีดเส้นใต้ ----------
for (const type of ['criminal', 'civil']) {
  const c = base(type);
  c.witnesses = [{ ...newWitness('document', false), name: 'สัญญาสมมติ', holder: 'บริษัท สมมติ จำกัด' }];
  const sum = buildDocuments(c, data).find((d) => d.id.startsWith('witnessSummons-'));
  assert.ok(sum, `${type}: ต้องมีหมายเรียกเอกสาร`);
  const head = sum.blocks.find((b) => b.t === 'center' && /^รายละเอียดที่ต้องจัดส่ง/.test(b.text));
  assert.ok(head && !head.u && head.b, `${type}: หัวเรื่องรายละเอียดต้องหนาและไม่ขีดเส้นใต้`);
  const html = docsHtml([sum], {});
  assert.ok(!/class="p center b u">รายละเอียดที่ต้องจัดส่ง/.test(html), `${type}: HTML ไม่ขีดเส้นใต้`);
  // หัวเรื่องอื่น (คำเตือน) ยังขีดเส้นใต้ตามเดิม
  assert.ok(sum.blocks.some((b) => b.t === 'center' && b.text === 'คำเตือน' && b.u), `${type}: “คำเตือน” ยังขีดเส้นใต้`);
}
console.log('doc-order OK');
