// ทดสอบอุทธรณ์ (แบบ ๓๒) + ท้ายอุทธรณ์ (แบบ ๓๓): ฝั่งจำเลย/ฝั่งโจทก์ · ผู้อุทธรณ์ที่เลือก · ประโยคนำ/วันที่ · ท้ายอุทธรณ์ (สำเนา ผู้เรียง ผู้พิมพ์) · แม่แบบ · กำหนดหนึ่งเดือน · เรนเดอร์ HTML/Word ได้ (ข้อมูลสมมติทั้งหมด)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { newCaseFor, newParty, newAppeal, appealDue, validateCase, collectVars, switchSide, sideOf } from '../shared/model.js';
import { buildDocuments, docKey, docStage, DOC_TYPES, DOC_ORDER, appellants } from '../shared/docs.js';
import { APPEALS, DEF_MOTIONS } from '../shared/def-templates.js';
import { layoutKeyOf } from '../shared/layout.js';
import { renderDocx } from '../server/render-docx.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = { laws: [], items: [], courtPhones: {}, formText: {} };
const src = fs.readFileSync(path.join(root, 'public', 'js', 'render-html.js'), 'utf8').split("'/shared/").join(`'${pathToFileURL(path.join(root, 'shared')).href}/`);
const { docsHtml } = await import('data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64'));
const J = (v) => JSON.stringify(v);
const textOf = (d) => J(d.blocks);
const person = (role, prefix, first, last) => Object.assign(newParty(role), { prefix, first, last });

// ---------- โครงสร้างคงที่ ----------
assert.ok(DOC_TYPES.some((d) => d.key === 'appeal'), 'มีชนิดเอกสาร appeal');
assert.ok(DOC_ORDER.includes('appeal'));
assert.equal(docKey('appeal-tail'), 'appeal');
assert.equal(docKey('appeal'), 'appeal');
assert.equal(docStage('appeal-tail'), 'trial');
assert.equal(layoutKeyOf('appeal-tail'), 'appeal', 'ท้ายอุทธรณ์ใช้ค่าจัดหน้าของแบบอุทธรณ์');
assert.ok(APPEALS.length >= 2 && new Set([...APPEALS, ...DEF_MOTIONS].map((x) => x.id)).size === APPEALS.length + DEF_MOTIONS.length, 'id แม่แบบไม่ซ้ำ');
for (const t of APPEALS) { assert.ok(t.title && t.text && t.caseType && t.side, `${t.id}: ครบช่อง`); assert.equal(t.verified, false); }
// แม่แบบต้องไม่มีชื่อบุคคลจริง/เลขคดีจริง (ข้อความกลาง ใช้ช่อง {{…}})
for (const t of APPEALS) assert.ok(!/ออมสิน|เดชอุดม|จันทมาศ|เวชคง|ผบE/.test(t.text + t.title), `${t.id}: ต้องไม่มีข้อมูลคดีจริง`);

// ---------- ฝั่งจำเลย: จำเลย 5 คน เลือกผู้อุทธรณ์ 3 คน ----------
const c = newCaseFor('civil', 'defendant');
assert.equal(sideOf(c), 'defendant');
assert.equal(c.docs.appeal, false, 'ค่าเริ่มต้นยังไม่ออกอุทธรณ์');
c.court = 'ศาลจังหวัดสมมติ';
c.caseNoBlack = 'ผบ.100'; c.caseYearBlack = '2569'; c.caseNoRed = 'ผบ.200'; c.caseYearRed = '2569';
c.civilCause = 'ยืม ค้ำประกัน';
c.amount = { baht: '371529', satang: '97' };
c.parties = [
  Object.assign(newParty('plaintiff'), { kind: 'juristic', name: 'ธนาคารสมมติ จำกัด' }),
  person('defendant', 'นางสาว', 'หนึ่ง', 'ทายาทสมมติ'), person('defendant', 'นางสาว', 'สอง', 'ทายาทสมมติ'), person('defendant', 'นางสาว', 'สาม', 'ทายาทสมมติ'),
  person('defendant', 'นาย', 'สี่', 'ค้ำสมมติ'), person('defendant', 'นางสาว', 'ห้า', 'ค้ำสมมติ'),
];
const dfs = c.parties.filter((p) => p.role === 'defendant');
c.docs.appeal = true;
c.appeal = { ...newAppeal(), partyIds: dfs.slice(0, 3).map((p) => p.id), against: 'คำพิพากษาตามสัญญาประนีประนอมยอมความ', decisionDate: '2026-11-02', readDate: '2026-11-02', toCourt: 'ศาลอุทธรณ์ภาค 3', copies: '1', text: 'ความเป็นมาแห่งคดี\nบรรทัดต่อของข้อแรก {{ชื่อเจ้ามรดก}}\n\nเหตุผล\n2.1 ข้อย่อยหนึ่ง\n(1) วงเล็บหนึ่ง\n\nคำขอท้ายอุทธรณ์' };

assert.deepEqual(appellants(c).map((p) => p.first), ['หนึ่ง', 'สอง', 'สาม']);
let docs = buildDocuments(c, data);
let ids = docs.map((d) => d.id);
assert.ok(ids.includes('appeal') && ids.includes('appeal-tail'), 'มีอุทธรณ์และท้ายอุทธรณ์: ' + ids.join(','));
assert.equal(ids.indexOf('appeal') + 1, ids.indexOf('appeal-tail'), 'ท้ายอุทธรณ์ต่อจากอุทธรณ์ทันที');
assert.ok(!ids.includes('complaint') && !ids.includes('prayer'), 'ฝั่งจำเลยไม่มีคำฟ้อง');

const A = docs.find((d) => d.id === 'appeal'), T = docs.find((d) => d.id === 'appeal-tail');
assert.equal(A.title, 'อุทธรณ์ (แพ่ง)');
const topA = A.blocks[0];
assert.equal(topA.t, 'top'); assert.equal(topA.formNo, '(๓๒)'); assert.equal(topA.title, 'อุทธรณ์');
assert.equal(topA.black, 'ผบ.๑๐๐', 'เลขคดีดำบนหัว'); assert.equal(topA.red, 'ผบ.๒๐๐');
const sA = textOf(A);
assert.ok(sA.includes('ข้อหาหรือฐานความผิด') && sA.includes('ยืม ค้ำประกัน'), 'ข้อหา/มูลคดี');
assert.ok(sA.includes('๓๗๑,๕๒๙') && sA.includes('๙๗'), 'ทุนทรัพย์เลขไทย');
assert.ok(sA.includes('ข้าพเจ้า ') && sA.includes('นางสาวหนึ่ง ทายาทสมมติ') && sA.includes('จำเลยที่ ๑') && sA.includes('นางสาวสาม ทายาทสมมติ') && sA.includes('จำเลยที่ ๓') && sA.includes(' ผู้อุทธรณ์'), 'ผู้อุทธรณ์ 3 คนพร้อมฐานะ');
assert.ok(!sA.includes('นายสี่') && !sA.includes('นางสาวห้า'), 'จำเลยที่ไม่ได้เลือกไม่อยู่ในบรรทัดผู้อุทธรณ์');
assert.ok(sA.includes('ขอยื่นอุทธรณ์คัดค้าน') && sA.includes('คำพิพากษาตามสัญญาประนีประนอมยอมความ') && sA.includes('ศาลจังหวัดสมมติ'), 'ประโยคนำ');
assert.ok(sA.includes('๒ พฤศจิกายน ๒๕๖๙'), 'วันที่คำพิพากษา/วันอ่าน เป็นวันที่ไทย');
assert.ok(sA.includes(' ต่อ') && sA.includes('ศาลอุทธรณ์ภาค ๓'), 'ยื่นต่อศาลอุทธรณ์');
assert.ok(sA.includes('มีข้อความตามที่จะกล่าวต่อไปนี้'));
{ // ผู้อุทธรณ์ + ประโยคนำอยู่ย่อหน้าเดียวกัน (ไม่ขึ้นย่อหน้าใหม่)
  const intro = A.blocks.find((b) => b.t === 'p' && J(b.runs).includes('ขอยื่นอุทธรณ์คัดค้าน'));
  assert.ok(J(intro.runs).includes('ข้าพเจ้า ') && J(intro.runs).includes(' ผู้อุทธรณ์ ') && intro.indent === 1.5, 'ข้าพเจ้า … ผู้อุทธรณ์ ขอยื่นอุทธรณ์คัดค้าน… ย่อหน้าเดียว');
}
assert.ok(sA.includes('"ข้อ ๑."') && sA.includes('"ข้อ ๒."') && sA.includes('"ข้อ ๓."'), 'เลขข้อ');
assert.ok(sA.includes('ความเป็นมาแห่งคดี') && sA.includes('คำขอท้ายอุทธรณ์'));
assert.ok(sA.includes('[ชื่อเจ้ามรดก]') && sA.includes('"kind":"ph"'), 'ช่อง {{…}} ที่ยังไม่กรอกเป็นแถบเหลือง');
assert.ok(sA.includes('ควรมิควรแล้วแต่จะโปรด'));
assert.ok(!sA.includes('[จำเลย]') && !/\{\{/.test(sA));
// ข้อย่อย 2.1 ย่อหน้าลึกกว่า ข้อ ; (1) ลึกกว่า 2.1
const paras = A.blocks.filter((b) => b.t === 'p');
const ind = (needle) => paras.find((b) => J(b.runs).includes(needle))?.indent;
assert.equal(ind('"ข้อ ๒."'), 1.5); assert.equal(ind('๒.๑ ข้อย่อยหนึ่ง'), 3.25); assert.equal(ind('(๑) วงเล็บหนึ่ง'), 4.75);

// ---- ท้ายอุทธรณ์ ----
assert.equal(T.title, 'ท้ายอุทธรณ์');
assert.equal(T.blocks[0].formNo, '(๓๓)'); assert.equal(T.blocks[0].noEmblem, true); assert.equal(T.blocks[0].showRed, false);
const sT = textOf(T);
assert.ok(sT.includes('ได้ยื่นสำเนาอุทธรณ์') && sT.includes('"๑"') && sT.includes('ฉบับ'), 'สำเนาอุทธรณ์ ๑ ฉบับ');
const sigs = T.blocks.filter((b) => b.t === 'sig');
assert.equal(sigs[0].lines.length, 3, 'ลงชื่อผู้อุทธรณ์ 3 คน');
assert.ok(sigs[0].lines.every((l) => l.label === 'ผู้อุทธรณ์'));
assert.ok(sigs[0].lines[0].name.includes('นางสาวหนึ่ง'));
assert.ok(sT.includes('อุทธรณ์ฉบับนี้ข้าพเจ้า') && sT.includes('เป็นผู้เรียง') && sT.includes('เป็นผู้เขียนหรือผู้พิมพ์'));
assert.ok(sigs.some((s) => s.lines[0].label === 'ผู้เรียง' && s.lines[0].name.includes('นางสาวหนึ่ง')), 'ไม่มีทนาย → ผู้อุทธรณ์คนแรกเป็นผู้เรียง');
assert.ok(sigs.some((s) => s.lines[0].label === 'ผู้เขียนหรือผู้พิมพ์' && s.lines[0].name.includes('นางสาวหนึ่ง')), 'ผู้พิมพ์ว่าง = ผู้เรียง');

// ---- มีทนายความ + ผู้พิมพ์ระบุเอง ----
c.counsel = { ...c.counsel, enabled: true, prefix: 'นาย', first: 'ทนาย', last: 'สมมติ', license: '1234/2560', phone: '081-000-0000', email: 'lawyer@example.com', address: { ...c.counsel.address, no: '9', road: 'ถนนสมมติ', sub: 'ตำบลสมมติ', district: 'อำเภอสมมติ', province: 'อุบลราชธานี', zip: '34000' } };
c.appeal.typist = 'นางสาวเสมียน พิมพ์ดี';
docs = buildDocuments(c, data);
const T2 = docs.find((d) => d.id === 'appeal-tail'), sT2 = textOf(T2);
assert.ok(sT2.includes('นายทนาย สมมติ') && sT2.includes('ทนายความใบอนุญาตที่') && sT2.includes('๑๒๓๔/๒๕๖๐') && sT2.includes('อยู่บ้านเลขที่') && sT2.includes('๐๘๑-๐๐๐-๐๐๐๐') && sT2.includes('lawyer@example.com'), 'ผู้เรียง = ทนายความ พร้อมใบอนุญาต ที่อยู่ โทรศัพท์ อีเมล');
assert.ok(sT2.includes('นางสาวเสมียน พิมพ์ดี') && sT2.includes('เป็นผู้เขียนหรือผู้พิมพ์'));
assert.ok(docs.some((d) => d.id === 'attorney'), 'ใบแต่งทนายออกด้วยเมื่อเปิดทนาย');

// ---- ปิด docs.appeal → ไม่มีเอกสาร ; ไม่เลือกผู้อุทธรณ์ → ทุกคน ----
c.docs.appeal = false;
assert.ok(!buildDocuments(c, data).some((d) => d.id.startsWith('appeal')));
c.docs.appeal = true; c.appeal.partyIds = [];
const A5 = buildDocuments(c, data).find((d) => d.id === 'appeal-tail');
assert.equal(A5.blocks.filter((b) => b.t === 'sig')[0].lines.length, 5, 'ไม่เลือก = จำเลยทั้งห้าเป็นผู้อุทธรณ์');
// เลือกเฉพาะ only=['appeal'] จากหน้าออกเอกสาร
assert.deepEqual(buildDocuments(c, data, ['appeal']).map((d) => d.id), ['appeal', 'appeal-tail', 'appeal-copy1', 'appeal-tail-copy1'], 'สำเนา 1 ฉบับ → เพิ่มอีก 1 ชุด');

// ---- validateCase / collectVars / กำหนดหนึ่งเดือน ----
assert.ok(collectVars(c).includes('ชื่อเจ้ามรดก'), 'ช่องในข้อความอุทธรณ์อยู่ในรายการตัวแปร');
assert.equal(appealDue('2026-11-02'), '2026-12-02');
assert.equal(appealDue('2026-01-31'), '2026-02-28', 'เดือนสั้น → วันสุดท้ายของเดือน');
assert.equal(appealDue('2028-01-31'), '2028-02-29');
assert.equal(appealDue(''), null);
{
  const v = validateCase(c, { byId: {} });
  assert.ok(v.some((i) => i.tab === 'extras' && /ยังไม่ได้กรอก/.test(i.msg) && /ชื่อเจ้ามรดก/.test(i.msg)), 'เตือนช่องค้างของอุทธรณ์ ชี้ไปหน้า extras');
  const today = new Date().toISOString().slice(0, 10);
  const fresh = { ...c, appeal: { ...c.appeal, readDate: today, text: 'ข้อความ' } };
  const v2 = validateCase(fresh, { byId: {} });
  assert.ok(v2.some((i) => i.level === 'info' && /ต้องยื่นภายใน/.test(i.msg)), 'อ่านวันนี้ → แจ้งกำหนด (info)');
  assert.ok(!v2.some((i) => i.level === 'error'), 'ไม่มี error');
  const stale = { ...c, appeal: { ...c.appeal, readDate: '2020-01-01', text: 'ข้อความ' } };
  assert.ok(validateCase(stale, { byId: {} }).some((i) => i.level === 'error' && /พ้นกำหนด/.test(i.msg)), 'พ้นกำหนด = error');
  const none = { ...c, appeal: { ...c.appeal, readDate: '', text: '' } };
  const v3 = validateCase(none, { byId: {} });
  assert.ok(v3.some((i) => /ยังไม่มีข้อความอุทธรณ์/.test(i.msg)) && v3.some((i) => /ยังไม่ระบุวันที่อ่าน/.test(i.msg)));
  const off = { ...c, docs: { ...c.docs, appeal: false } };
  assert.ok(!validateCase(off, { byId: {} }).some((i) => /อุทธรณ์/.test(i.msg)), 'ปิดออกอุทธรณ์ → ไม่ตรวจ');
}

// ---- แม่แบบฝั่งจำเลย (ทายาท/ฉ้อฉล) ใส่แล้วสร้างเอกสารได้ ข้อ 1–5 และฎีกาที่อ้างครบ ----
{
  const tpl = APPEALS.find((x) => x.id === 'ap-settlement-heir');
  assert.equal(tpl.side, 'defendant'); assert.equal(tpl.caseType, 'civil');
  const cc = { ...c, appeal: { ...c.appeal, text: tpl.text, against: tpl.against, partyIds: [] }, vars: { 'ชื่อเจ้ามรดก': 'นางสมมติ เจ้ามรดก', 'จำเลยที่เป็นทายาท': 'จำเลยที่ 1 ถึงที่ 3', 'จำเลยที่เป็นผู้ค้ำประกัน': 'จำเลยที่ 4 และที่ 5' } };
  const d = buildDocuments(cc, data, ['appeal'])[0], s = textOf(d);
  for (let i = 1; i <= 5; i++) assert.ok(s.includes(`"ข้อ ${'๐๑๒๓๔๕'[i]}."`), `มีข้อ ${i}`);
  assert.ok(!s.includes(`"ข้อ ๖."`));
  for (const no of ['๒๙๕๙/๒๕๕๑', '๓๔๓๘/๒๕๕๘', '๒๗๘๖/๒๕๒๓', '๑๒๐๖/๒๕๕๔', '๒๗๘๙/๒๕๔๓', '๑๓๙๓/๒๕๒๖', '๑๑๗๓๑/๒๕๕๕', '๗๔๓/๒๕๕๒', '๒๔๗/๒๕๔๑']) assert.ok(s.includes(no), 'อ้างฎีกา ' + no);
  assert.ok(!s.includes('๓๗๕๗/๒๕๔๓'), 'ไม่อ้างฎีกา 3757/2543 (เนื้อหาไม่ตรง)');
  assert.ok(s.includes('นางสมมติ เจ้ามรดก') && s.includes('จำเลยที่ ๑ ถึงที่ ๓') && s.includes('จำเลยทั้งห้า') && !s.includes('จำเลยทั้ง ๕'), 'ค่าตัวแปรและ {{จำเลย}} อัตโนมัติ (ห้าคน = จำเลยทั้งห้า)');
  assert.ok(s.includes('มาตรา ๑๖๐๑') && s.includes('มาตรา ๑๓๘ วรรคสอง') && s.includes('มาตรา ๑๗๕๔ วรรคสาม'));
  const ph = (s.match(/"kind":"ph"/g) || []).length;
  assert.ok(ph > 0, 'ยังมีช่องให้กรอก (เช่น วันที่ สาระสำคัญสัญญา)');
  // เรนเดอร์ HTML + Word ได้
  const html = docsHtml(buildDocuments(cc, data, ['appeal']), { layout: {} });
  assert.ok(html.includes('อุทธรณ์') && html.includes('ท้ายอุทธรณ์') && html.includes('(๓๒)') && html.includes('(๓๓)'));
  const buf = await renderDocx(buildDocuments(cc, data, ['appeal']), 'ทดสอบอุทธรณ์');
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  assert.ok(xml.includes('อุทธรณ์') && xml.includes('ผู้อุทธรณ์') && xml.includes('ท้ายอุทธรณ์'), 'Word มีอุทธรณ์และท้ายอุทธรณ์');
}

// ---- ฝั่งโจทก์: ผู้อุทธรณ์ = โจทก์ ; แม่แบบทั่วไปใช้ได้ ส่วนแม่แบบฝั่งจำเลยไม่ขึ้น ----
{
  const pc = newCaseFor('criminal', 'plaintiff');
  pc.court = 'ศาลแขวงสมมติ';
  pc.parties = [person('plaintiff', 'นาย', 'โจทก์', 'สมมติ'), person('defendant', 'นาย', 'จำเลย', 'สมมติ')];
  pc.docs.appeal = true;
  pc.appeal = { ...newAppeal(), text: APPEALS.find((x) => x.id === 'ap-generic').text, against: 'คำพิพากษา', decisionDate: '2026-10-01', readDate: '2026-10-01' };
  const d = buildDocuments(pc, data, ['appeal']);
  assert.deepEqual(d.map((x) => x.id), ['appeal', 'appeal-tail']);
  assert.equal(d[0].title, 'อุทธรณ์ (อาญา)');
  const s = textOf(d[0]);
  assert.ok(s.includes('นายโจทก์ สมมติ') && s.includes('" โจทก์"') && s.includes(' ผู้อุทธรณ์'), 'โจทก์เป็นผู้อุทธรณ์');
  assert.ok(!s.includes('นายจำเลย สมมติ ผู้อุทธรณ์'));
  assert.ok(s.includes('ขอยื่นอุทธรณ์คัดค้าน') && s.includes('"คำพิพากษา"') && s.includes('ศาลแขวงสมมติ'));
  const want = APPEALS.filter((x) => (x.caseType === 'any' || x.caseType === pc.type) && (x.side === 'any' || x.side === 'plaintiff'));
  assert.ok(want.some((x) => x.id === 'ap-generic') && !want.some((x) => x.id === 'ap-settlement-heir'));
  // สลับฝั่ง: อุทธรณ์แยกตามฝั่ง
  switchSide(pc, 'defendant');
  assert.equal(pc.appeal.text, '', 'ฝั่งจำเลยเริ่มด้วยอุทธรณ์ว่าง');
  switchSide(pc, 'plaintiff');
  assert.ok(pc.appeal.text.includes('ความเป็นมาแห่งคดี'), 'กลับฝั่งโจทก์ อุทธรณ์เดิมกลับมา');
}

// ---- สำเนาอุทธรณ์ตามจำนวนในท้ายอุทธรณ์: ชุดที่ 2 ขึ้นไปมี “สำเนาถูกต้อง” มุมซ้ายบน ----
{
  const cc = { ...c, appeal: { ...c.appeal, copies: '2' } };
  const d = buildDocuments(cc, data, ['appeal']);
  assert.deepEqual(d.map((x) => x.id), ['appeal', 'appeal-tail', 'appeal-copy1', 'appeal-tail-copy1', 'appeal-copy2', 'appeal-tail-copy2'], 'ต้นฉบับ + สำเนา 2 ชุด');
  assert.equal(d[0].blocks[0].copyMark, undefined, 'ต้นฉบับไม่มีคำว่าสำเนาถูกต้อง');
  assert.equal(d[1].blocks[0].copyMark, undefined);
  for (const x of d.slice(2)) { assert.equal(x.blocks[0].copyMark, 'สำเนาถูกต้อง', x.id); assert.equal(docKey(x), 'appeal'); assert.ok(/สำเนาชุดที่ [๒๓]/.test(x.title), x.title); }
  assert.equal(textOf(d[2]).replace(/,"copyMark":"สำเนาถูกต้อง"/, ''), textOf(d[0]), 'เนื้อหาสำเนาเหมือนต้นฉบับ');
  const html = docsHtml(d, { layout: {} });
  assert.equal((html.match(/copy-mark/g) || []).length, 4, 'HTML มี “สำเนาถูกต้อง” 4 หน้าแรก (อุทธรณ์+ท้าย × 2 ชุด)');
  const zip = await JSZip.loadAsync(await renderDocx(d, 'ทดสอบสำเนา'));
  const xml = await zip.file('word/document.xml').async('string');
  assert.equal((xml.match(/สำเนาถูกต้อง/g) || []).length, 4, 'Word มีสำเนาถูกต้อง 4 ครั้ง');
  // ไม่ระบุ/ศูนย์/ค่าเพี้ยน → ไม่มีสำเนา ; เกิน 10 → 10
  assert.equal(buildDocuments({ ...c, appeal: { ...c.appeal, copies: '' } }, data, ['appeal']).length, 2);
  assert.equal(buildDocuments({ ...c, appeal: { ...c.appeal, copies: 'abc' } }, data, ['appeal']).length, 2);
  assert.equal(buildDocuments({ ...c, appeal: { ...c.appeal, copies: '99' } }, data, ['appeal']).length, 22);
}

// ---- คำร้องขอทุเลาการบังคับ (ม.231) ในชุดแม่แบบคำร้องฝั่งจำเลย: ออกเป็นคำร้องแบบ ๗ คู่กับอุทธรณ์ ----
{
  const st = DEF_MOTIONS.find((x) => x.id === 'd-stay-execution');
  assert.ok(st && st.kind === 'คำร้อง' && st.caseType === 'civil' && /ทุเลาการบังคับ/.test(st.title) && st.refs.includes('ป.วิ.พ. มาตรา 231'));
  const mc = { ...c, docs: { ...c.docs, motions: true }, motions: [{ id: 'stay', kind: st.kind, title: st.title, text: st.text }], vars: { 'วันที่คำพิพากษา': '2 พฤศจิกายน 2569' } };
  const d = buildDocuments(mc, data).find((x) => x.id === 'motion-stay');
  assert.ok(d, 'มีคำร้องขอทุเลา');
  const s = textOf(d);
  assert.ok(s.includes('ทุเลาการบังคับตามคำพิพากษา') && s.includes('จนกว่าคดีจะถึงที่สุด') && s.includes('๒ พฤศจิกายน ๒๕๖๙') && s.includes('จำเลยทั้งห้า'));
  assert.ok(s.includes('"ข้อ ๑."') && s.includes('"ข้อ ๔."') && !s.includes('"ข้อ ๕."'), 'คำร้อง 4 ข้อ');
  assert.ok(s.includes('"kind":"ph"'), 'เหตุผล/หลักประกันเป็นช่องให้กรอก');
  assert.ok(s.includes('ผู้ร้อง'), 'ลงชื่อผู้ร้อง');
  // ผู้เรียงและเขียนหรือพิมพ์: ไม่มีทนาย → ชื่อผู้ร้องคนแรกใต้ช่องลงชื่อ ; ระบุ c.author → ใช้ชื่อนั้น (ทั้งคำร้องและท้ายอุทธรณ์)
  const noC = { ...mc, counsel: { ...mc.counsel, enabled: false } };
  const sig = (doc) => doc.blocks.filter((b) => b.t === 'sig').find((b) => b.lines[0].label === 'ผู้เรียงและเขียนหรือพิมพ์');
  assert.equal(sig(buildDocuments(noC, data).find((x) => x.id === 'motion-stay')).lines[0].name, '(นางสาวหนึ่ง ทายาทสมมติ)', 'ชื่อผู้เรียงใต้ลายมือชื่อคำร้อง');
  const au = { ...noC, author: 'นายเสมียน เรียงดี' };
  const ds = buildDocuments(au, data);
  assert.equal(sig(ds.find((x) => x.id === 'motion-stay')).lines[0].name, '(นายเสมียน เรียงดี)');
  assert.ok(textOf(ds.find((x) => x.id === 'motion-stay')).includes('ข้าพเจ้า ') && textOf(ds.find((x) => x.id === 'motion-stay')).includes('นายเสมียน เรียงดี'));
  assert.ok(textOf(ds.find((x) => x.id === 'appeal-tail')).includes('นายเสมียน เรียงดี') && textOf(ds.find((x) => x.id === 'appeal-tail')).includes('เป็นผู้เรียง'), 'ท้ายอุทธรณ์ใช้ชื่อผู้เรียงที่ระบุ');
  const dsC = buildDocuments({ ...au, counsel: mc.counsel }, data);
  assert.equal(sig(dsC.find((x) => x.id === 'motion-stay')).lines[0].name, '(นายทนาย สมมติ)', 'มีทนาย → ทนายเป็นผู้เรียง ไม่ใช้ c.author');
}

// ---- คำร้องขอยกเว้นค่าธรรมเนียมศาลชั้นอุทธรณ์ (ม.155, 156, 156/1, 157, 229) ----
{
  const fw = DEF_MOTIONS.find((x) => x.id === 'd-fee-waiver-appeal');
  assert.ok(fw && fw.kind === 'คำร้อง' && fw.caseType === 'civil' && /ยกเว้นค่าธรรมเนียมศาล/.test(fw.title));
  for (const r of ['ป.วิ.พ. มาตรา 155', 'ป.วิ.พ. มาตรา 156', 'ป.วิ.พ. มาตรา 156/1', 'ป.วิ.พ. มาตรา 157', 'ป.วิ.พ. มาตรา 229']) assert.ok(fw.refs.includes(r), r);
  assert.ok(!/อนาถา/.test(fw.text), 'ใช้ถ้อยคำปัจจุบัน “ยกเว้นค่าธรรมเนียมศาล” ไม่ใช่ “คนอนาถา”');
  assert.ok(/ไม่มีทรัพย์สินพอ/.test(fw.text) && /เดือดร้อนเกินสมควร/.test(fw.text) && /เหตุผลอันสมควร/.test(fw.text) && /มาตรา 229/.test(fw.text) && /สาบานตัว/.test(fw.text), 'องค์ประกอบตาม ม.156/1 ว.2 + เงินวางศาล ม.229 + ไต่สวน/สาบาน');
  const mc = { ...c, docs: { ...c.docs, motions: true }, motions: [{ id: 'fee', kind: fw.kind, title: fw.title, text: fw.text }] };
  const d = buildDocuments(mc, data).find((x) => x.id === 'motion-fee');
  const s = textOf(d);
  assert.ok(s.includes('"ข้อ ๔."') && !s.includes('"ข้อ ๕."'), 'คำร้อง 4 ข้อ');
  assert.ok(s.includes('จำเลยทั้งห้า') && s.includes('มาตรา ๑๕๖/๑') && s.includes('"kind":"ph"'));
}

// ---- ไม่มีวันที่/สำเนา → จุดไข่ปลา ไม่พัง ; ข้อความว่าง → เส้นให้เขียน ----
{
  const e = { ...c, appeal: { ...newAppeal() }, counsel: { ...c.counsel, enabled: false } };
  const d = buildDocuments(e, data, ['appeal']);
  const s = textOf(d[0]);
  assert.ok(s.includes('"kind":"dots"'), 'วันที่ว่าง = จุดไข่ปลา');
  assert.ok(d[0].blocks.some((b) => b.t === 'lines'), 'ไม่มีข้อความ = เส้นให้เขียน');
  assert.ok(textOf(d[1]).includes('"kind":"dots"'), 'จำนวนสำเนาว่าง = จุดไข่ปลา');
}
console.log('appeal OK');
