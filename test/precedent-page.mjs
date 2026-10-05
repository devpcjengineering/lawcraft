// ทดสอบหน้าเฉพาะต่อฎีกา (api/precedent.js) — ส่วนที่ไม่ใช้ฐาน (fillShell/renderMain/escape) + ส่วนกับฐาน Aiven จริง (AIVEN_READER_URL จาก .env)
// ต้อง build ก่อน (dist/_px/precedent.html) ; ไม่มีแม่แบบ = ข้าม
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../scripts/load-env.mjs';
loadEnv();
const SHELL = path.resolve('dist/_px/precedent.html');
if (!fs.existsSync(SHELL)) { console.log('precedent-page: ไม่พบ dist/_px/precedent.html (ยังไม่ build) — ข้าม'); process.exit(0); }
process.env.PX_SHELL_FILE = SHELL;
const { default: handler, fillShell, renderMain, titleOf } = await import('../api/precedent.js');
const { precedentSlug, docIdFromSlug } = await import('../api/_aiven.js');

// ---- slug ----
assert.equal(precedentSlug('10029', 2560, '48121'), '10029-2560-48121');
assert.equal(precedentSlug('9996 - 9997', 2519, 77), '9996-9997-2519-77');
assert.equal(docIdFromSlug('10029-2560-48121'), '48121');
assert.equal(docIdFromSlug(''), null);

// ---- แม่แบบ: ไม่เหลือ token, escape ถูกบริบท ----
const shell = fs.readFileSync(SHELL, 'utf8');
assert.ok(shell.includes('@@PX_MAIN@@') && shell.includes('@@PX_TITLE@@'));
const evil = { slug: '1-2-3', title: '"><script>alert(1)</script> & x', desc: "d'esc\"<b>", crumb: '</script><img src=x onerror=alert(1)>', main: '<h1>ok</h1>' };
const html = fillShell(shell, evil);
assert.ok(!html.includes('@@PX_'), 'ต้องไม่เหลือ token');
assert.ok(!/<script>alert/.test(html) && !html.includes('<img src=x onerror=alert(1)>'), 'ค่าจากฐานต้องถูก escape');
const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
const graph = JSON.parse(ld[1]); assert.ok(graph['@graph'].length >= 2, 'JSON-LD ต้อง parse ได้แม้มีอักขระพิเศษ');
assert.match(html, /<link rel="canonical" href="https:\/\/[^"]+\/precedents\/1-2-3\/">/);
assert.ok(html.includes('<h1>ok</h1>') && html.includes('class="nav"'), 'มี main + เมนูเหมือนหน้าอื่น');

const sample = { source_doc_id: '45962', case_no: '2942', year: 2519, case_type: 'อาญา', headnote: 'จำเลย <b>x</b>\n\nศาลฎีกาพิพากษายืน', full_text: null, laws: [{ name: 'ประมวลกฎหมายอาญา', abbr: 'ป.อ.', sections: ['ม. 288'] }], litigants: ['โจทก์ - <i>อัยการ</i>'], judges: ['ก'], lower_courts: [], primary_court_nos: [], departments: [] };
const main = renderMain(sample);
assert.ok(main.includes('ฎีกาที่ 2942/2519') && main.includes('ป.อ.') === false && main.includes('ประมวลกฎหมายอาญา — ม. 288'));
assert.ok(!main.includes('<b>x</b>') && !main.includes('<i>อัยการ</i>') && main.includes('&lt;b&gt;x&lt;/b&gt;'), 'เนื้อหาจากฐานต้อง escape');
assert.ok(main.includes('ที่มาของข้อมูล') && main.includes('ศูนย์เทคโนโลยีสารสนเทศและการสื่อสารในศาลฎีกา') && main.includes('ไม่ใช่ข้อความคำพิพากษาฉบับเต็ม'));
assert.match(titleOf(sample), /^ฎีกาที่ 2942\/2519 จำเลย/);

if (!process.env.AIVEN_READER_URL) { console.log('precedent-page: ไม่มี AIVEN_READER_URL — ข้ามส่วนที่ใช้ฐาน'); console.log('precedent-page OK (offline)'); process.exit(0); }

const call = (url, method = 'GET') => new Promise((resolve) => {
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { resolve({ status: this.statusCode, headers: this.headers, body: b || '' }); } };
  handler({ method, url, headers: {} }, res);
});
const { default: api } = await import('../api/precedents.js');
const list = await new Promise((resolve) => { const res = { headers: {}, setHeader() {}, end(b) { resolve(JSON.parse(b)); } }; api({ method: 'GET', url: '/api/precedents?q=' + encodeURIComponent('มรดก'), headers: {} }, res); });
const it = list.items[0];
assert.ok(it.path.startsWith('/precedents/') && it.docId, 'รายการค้นหาต้องมี path และ docId');
const slug = it.path.replace(/^\/precedents\/|\/$/g, '');

let r = await call('/api/precedent?slug=' + encodeURIComponent(slug));
assert.equal(r.status, 200, 'หน้าฎีกาต้องเปิดได้');
assert.ok(r.body.includes(`ฎีกาที่ ${it.caseNo}/${it.year}`) && r.body.includes('<h1>') && !r.body.includes('@@PX_'));
assert.ok(r.body.includes(`rel="canonical" href="https://www.law-craft.co${it.path}"`) || r.body.includes(it.path), 'canonical ต้องเป็น URL ของฎีกานี้');
assert.match(r.headers['cache-control'], /s-maxage=86400/);
assert.ok(!/noindex/.test(r.body), 'หน้าฎีกาต้องให้ index');
const ld2 = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(r.body)[1]); assert.ok(ld2['@graph']);
// slug หน้าไม่ตรง → เด้งไป URL หลัก
r = await call('/api/precedent?slug=' + encodeURIComponent(`wrong-prefix-${it.docId}`));
assert.equal(r.status, 301); assert.equal(r.headers.location, it.path);
// ไม่มีรหัสนี้ / slug แปลก
r = await call('/api/precedent?slug=1-2000-99999999999');
assert.equal(r.status, 404); assert.ok(r.body.includes('noindex'));
assert.equal((await call('/api/precedent?slug=' + encodeURIComponent("../../etc/passwd"))).status, 404);
assert.equal((await call('/api/precedent')).status, 404);
assert.equal((await call('/api/precedent?slug=x', 'POST')).status, 405);

// facets + doc lookup ของ API
const fac = await new Promise((resolve) => { const res = { headers: {}, setHeader() {}, end(b) { resolve(JSON.parse(b)); } }; api({ method: 'GET', url: '/api/precedents?facets=1', headers: {} }, res); });
assert.ok(fac.years.length > 10 && fac.types.length >= 1 && fac.laws.length >= 3 && fac.total > 1000, 'facets ต้องมีปี/ประเภท/กฎหมาย');
assert.ok(fac.laws.every((l) => l.abbr && l.n > 0));
const byLaw = await new Promise((resolve) => { const res = { headers: {}, setHeader() {}, end(b) { resolve(JSON.parse(b)); } }; api({ method: 'GET', url: '/api/precedents?law=' + encodeURIComponent(fac.laws[0].abbr), headers: {} }, res); });
assert.ok(byLaw.items.length > 0, 'กรองตามกฎหมายต้องเจอ');
const detail = await new Promise((resolve) => { const res = { headers: {}, setHeader() {}, end(b) { resolve(JSON.parse(b)); } }; api({ method: 'GET', url: '/api/precedents?doc=' + it.docId, headers: {} }, res); });
assert.equal(detail.item.docId, it.docId); assert.equal(detail.item.path, it.path);
console.log('precedent-page OK');
process.exit(0);
