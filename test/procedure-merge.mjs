// ทดสอบตัวผสานการแก้ไขขั้นตอนฟ้องคดี/ค่าธรรมเนียม/มาตราวิธีพิจารณา (shared/procedure-merge.js) กับ data/procedure.json จริง
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyProcedureEdits, diffFields, SECTION_FIELDS } from '../shared/procedure-merge.js';

const P = JSON.parse(fs.readFileSync(new URL('../data/procedure.json', import.meta.url), 'utf8'));
const sec0 = P.sections[0], fee0 = P.fees.items[0], steps0 = P.criminalCasePath.steps;

// ไม่มีการแก้ = เนื้อหาเท่าเดิม และไม่แก้ของเดิม
const same = applyProcedureEdits(P, {});
assert.deepEqual(same.sections, P.sections);
assert.deepEqual(same.fees.items, P.fees.items);
assert.deepEqual(same.criminalCasePath.steps, steps0);
assert.equal(same.__procBase, P);
assert.equal(applyProcedureEdits(P, null).sections.length, P.sections.length);

// แก้/ซ่อน/เพิ่ม มาตรา
const e = {
  sections: {
    edited: { [sec0.id]: { summary: 'ข้อความทดสอบ', verified: false, bogus: 'x' } },
    removed: [P.sections[1].id],
    added: [{ id: 'custom-t1', law: 'pvor', section: '999', title: 'ทดสอบ', summary: 's', verified: true }, { id: 'custom-empty', law: 'pvor' }],
  },
  fees: { note: 'หมายเหตุใหม่', edited: { [fee0.id]: { detail: 'ใหม่' } }, added: [{ id: 'f-new', title: 'ค่าใหม่', detail: 'รายละเอียด' }] },
  path: { title: 'หัวใหม่', steps: [{ title: '1. ก', detail: 'ข', ref: 'ค', verified: true }, { title: '', detail: '' }, { title: '2. ง', detail: 'จ' }] },
};
const m = applyProcedureEdits(P, e);
assert.equal(m.sections.find((s) => s.id === sec0.id).summary, 'ข้อความทดสอบ');
assert.equal(m.sections.find((s) => s.id === sec0.id).verified, false);
assert.ok(!('bogus' in m.sections.find((s) => s.id === sec0.id)));
assert.ok(!m.sections.some((s) => s.id === P.sections[1].id), 'ซ่อนแล้วต้องหาย');
assert.ok(m.sections.some((s) => s.id === 'custom-t1' && s.verified === true));
assert.ok(!m.sections.some((s) => s.id === 'custom-empty'), 'ร่างเปล่าต้องไม่เข้า');
assert.equal(m.sections.length, P.sections.length - 1 + 1);
assert.equal(m.fees.note, 'หมายเหตุใหม่');
assert.equal(m.fees.items.find((f) => f.id === fee0.id).detail, 'ใหม่');
assert.ok(m.fees.items.some((f) => f.id === 'f-new' && f.verified === false), 'รายการใหม่ต้องยังไม่ตรวจ');
assert.equal(m.criminalCasePath.title, 'หัวใหม่');
assert.equal(m.criminalCasePath.steps.length, 2, 'ขั้นตอนว่างต้องถูกตัด');
assert.equal(m.criminalCasePath.steps[0].verified, true);
assert.equal(P.sections.length, 163, 'ห้ามแก้ต้นฉบับ');

// ผสานซ้ำบนข้อมูลที่ผสานแล้ว = ผลเท่าเดิม (เริ่มจากต้นฉบับ)
assert.deepEqual(applyProcedureEdits(m, e).sections, m.sections);
assert.deepEqual(applyProcedureEdits(m, {}).sections, P.sections);

// ข้อมูลเพี้ยนไม่ทำให้ล้ม
assert.doesNotThrow(() => applyProcedureEdits(P, { sections: { edited: 5, added: 'x', removed: [1, null] }, fees: [], path: { steps: 'no' } }));

// diffFields: ส่งเฉพาะฟิลด์ที่ต่าง
assert.deepEqual(diffFields(sec0, { ...sec0 }, SECTION_FIELDS), {});
assert.deepEqual(diffFields(sec0, { ...sec0, title: 'ก' }, SECTION_FIELDS), { title: 'ก' });

console.log('procedure-merge OK');
