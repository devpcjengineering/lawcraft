// ทดสอบเร็ว: สร้างคดีตัวอย่าง (ข้อมูลสมมติ) → สร้างเอกสารทุกชนิด → ออก .docx
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newCase, newParty, uid, validateCase, indexLaw, chargeSectionsText } from '../shared/model.js';
import { buildDocuments, serviceMotionText } from '../shared/docs.js';
import { renderDocx } from '../server/render-docx.js';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
fs.mkdirSync(out, { recursive: true });

const data = {
  laws: [{ id: 'pc', name: 'ประมวลกฎหมายอาญา', short: 'ป.อ.' }],
  items: [{
    id: 'pc-326', lawId: 'pc', kind: 'criminal', section: '326', name: 'หมิ่นประมาท', category: 'ชื่อเสียง', privateOffence: true,
    factTemplate: ['เมื่อวันที่ {{วันเวลาเกิดเหตุ}} จำเลยได้บังอาจใส่ความโจทก์ต่อบุคคลที่สาม ณ {{สถานที่เกิดเหตุ}} ทำให้{{โจทก์}}เสียชื่อเสียง'],
    prayerTemplate: ['ขอให้ลงโทษ{{จำเลย}}ตาม{{มาตรา}}'], relatedSections: [],
  }],
};
const idx = indexLaw(data);
const c = newCase('criminal');
c.court = 'ศาลจังหวัดเชียงราย';
Object.assign(c.parties[0], { first: 'สมชาย', last: 'ตัวอย่างดี', idCard: '1101700230673', occupation: 'ค้าขาย', age: '40' });
Object.assign(c.parties[0].address, { no: '99/1', moo: '4', sub: 'รอบเวียง', district: 'เมืองเชียงราย', province: 'เชียงราย', zip: '57000' });
Object.assign(c.parties[1], { first: 'สมศักดิ์', last: 'สมมติ' });
c.parties[1].address.province = 'กรุงเทพมหานคร';
c.parties.push({ ...newParty('defendant'), first: 'วิชัย', last: 'ทดสอบ' });
c.charges.push({ itemId: 'pc-326', related: [] });
c.facts.push({ id: uid(), text: data.items[0].factTemplate[0] });
c.prayers.push({ id: uid(), text: data.items[0].prayerTemplate[0] });
c.vars['วันเวลาเกิดเหตุ'] = '1 ตุลาคม 2569'; c.vars['สถานที่เกิดเหตุ'] = 'ตลาดสดเมืองเชียงราย';
c.witnesses.push({ id: uid(), kind: 'person', name: 'นางสาวพยาน หนึ่ง', address: '12 ถ.พหลโยธิน เชียงราย', note: '' }, { id: uid(), kind: 'document', name: 'ภาพถ่ายข้อความ', address: '', note: '' });
c.counsel = { ...c.counsel, enabled: true, first: 'ทนาย', last: 'ความดี', license: '1234/2560' };
c.service = { crossDistrict: true, postNotice: true, fee: '1300', court: 'ศาลแขวงดุสิต' };
c.motions.push({ id: uid(), title: 'ขอส่งหมายนอกเขต', text: serviceMotionText(c, data) });
c.docs = { complaint: true, prayer: true, witness: true, attorney: true, proxy: true, summons: true, motions: true };

const docs = buildDocuments(c, data);
console.log('เอกสาร:', docs.map((d) => d.id).join(', '));
console.log('บทมาตรา:', chargeSectionsText(c, idx));
console.log('ตรวจสอบ:', validateCase(c, idx).map((i) => `${i.level}:${i.msg}`).join(' | '));
const flat = JSON.stringify(docs);
if (/\{\{/.test(flat)) throw new Error('ยังมี {{ }} ค้างในเอกสาร');
if (!/๒๕๖/.test(flat)) throw new Error('ไม่แปลงเป็นเลขไทย');
// เลขไทยบังคับ: ข้อความที่มองเห็นทุกบล็อกต้องไม่มีเลขอารบิก (ข้ามคีย์ t/kind/id) ; ไม่มีเลขคดีก็ต้องออกเอกสารครบ ไม่มีคำเตือนเรื่องเลขคดี
const visibleDigits = (o, k = '') => (typeof o === 'string' ? (!['t', 'kind', 'id'].includes(k) && /[0-9]/.test(o) ? [o] : [])
  : Array.isArray(o) ? o.flatMap((x) => visibleDigits(x, k)) : o && typeof o === 'object' ? Object.entries(o).flatMap(([kk, v]) => visibleDigits(v, kk)) : []);
const bad = visibleDigits(docs.map((d) => d.blocks));
if (bad.length) throw new Error('เหลือเลขอารบิกในเอกสาร: ' + bad.slice(0, 3).join(' | '));
if (c.caseNoBlack || c.caseNoRed) throw new Error('smoke ควรทดสอบกรณีไม่มีเลขคดี');
if (!docs.some((d) => d.id.startsWith('witnessSummons-')) || !docs.some((d) => d.id.startsWith('motion-'))) throw new Error('ไม่มีเลขคดีก็ต้องออกหมายเรียกพยานและคำร้อง');
if (validateCase(c, idx).some((i) => /เลขคดี/.test(i.msg))) throw new Error('ต้องไม่มีคำเตือนเรื่องเลขคดี');
const buf = await renderDocx(docs, 'ทดสอบ');
fs.writeFileSync(path.join(out, 'smoke.docx'), buf);
console.log('docx bytes:', buf.length);
fs.writeFileSync(path.join(out, 'case.json'), JSON.stringify(c, null, 2));
console.log('OK');
