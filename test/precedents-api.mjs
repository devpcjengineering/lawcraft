// ทดสอบ API ค้นหาฎีกา (api/precedents.js) กับฐาน Aiven จริงด้วยบทบาทอ่านอย่างเดียว (AIVEN_READER_URL จาก .env)
// ไม่มี AIVEN_READER_URL = ข้ามส่วนที่ต้องใช้ฐาน (เหลือทดสอบ buildFilter ที่ไม่ใช้เครือข่าย)
import assert from 'node:assert/strict';
import { loadEnv } from '../scripts/load-env.mjs';
loadEnv();
const { default: handler, buildFilter } = await import('../api/precedents.js');

// ---- buildFilter (ไม่ใช้ฐาน) ----
let f = buildFilter({ q: 'มรดก ที่ดิน', year: '2560', type: 'แพ่ง' });
assert.ok(f.tsq && f.tokens.length >= 2 && f.where.includes('fts @@ plainto_tsquery') && f.params.includes(2560) && f.params.includes('แพ่ง'));
f = buildFilter({ q: 'ฎีกาที่ ๑๐๐๒๙/๒๕๖๐' });
assert.ok(f.where.includes('case_no =') && f.params.includes('10029') && f.params.includes(2560) && !f.tsq, 'เลขฎีกา/ปี (เลขไทยได้) ค้นตรงเลข ไม่ผ่าน FTS');
f = buildFilter({ q: "'; drop table precedents_full; --", year: '1', type: 'x', sec: '' });
assert.ok(!f.where.includes('drop') && !f.params.some((p) => p === 1) && !f.where.includes("type"), 'ค่าผิดปกติถูกทิ้ง/ส่งเป็นพารามิเตอร์เท่านั้น');
assert.equal(buildFilter({}).where, 'true');
assert.equal(buildFilter({ q: 'a'.repeat(5000) }).params.length <= 1, true);

if (!process.env.AIVEN_READER_URL) { console.log('precedents-api: ไม่มี AIVEN_READER_URL — ข้ามส่วนที่ใช้ฐาน'); process.exit(0); }

const call = (url, method = 'GET') => new Promise((resolve) => {
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { resolve({ status: this.statusCode, headers: this.headers, body: b ? JSON.parse(b) : null }); } };
  handler({ method, url, headers: {} }, res);
});

let r = await call('/api/precedents?q=' + encodeURIComponent('มรดก'));
assert.equal(r.status, 200); assert.ok(r.body.items.length > 0 && r.body.total > 0, 'ค้น "มรดก" ต้องเจอ');
assert.ok(r.body.notice.includes('ไม่ใช่ข้อความคำพิพากษาฉบับเต็ม'));
assert.match(r.headers['cache-control'], /s-maxage/);
const first = r.body.items[0];
assert.ok(first.id && first.caseNo && first.year && 'snippet' in first);
assert.ok(r.body.items.length <= 20);

r = await call('/api/precedents?q=' + encodeURIComponent('มรดก') + '&page=2');
assert.equal(r.status, 200); assert.equal(r.body.page, 2);
assert.ok(!r.body.items.some((x) => x.id === first.id), 'หน้า 2 ต้องไม่ซ้ำหน้า 1');

r = await call('/api/precedents?q=' + encodeURIComponent('มรดก') + '&year=2560');
assert.ok(r.body.items.length > 0 && r.body.items.every((x) => x.year === 2560), 'กรองปี');
r = await call('/api/precedents?type=' + encodeURIComponent('อาญา') + '&q=' + encodeURIComponent('ยักยอก'));
assert.ok(r.body.items.length > 0 && r.body.items.every((x) => x.caseType === 'อาญา'), 'กรองประเภทคดี');
r = await call('/api/precedents?q=' + encodeURIComponent('10029/2560'));
assert.ok(r.body.items.length > 0 && r.body.items.every((x) => x.caseNo === '10029' && x.year === 2560), 'ค้นเลขฎีกา/ปี');
r = await call('/api/precedents?sec=' + encodeURIComponent('ป.อ. ม. 288'));
assert.equal(r.status, 200); assert.ok(r.body.items.length > 0, 'กรองมาตรา ต้องเจอ');
for (const x of r.body.items.slice(0, 3)) assert.ok((await call('/api/precedents?id=' + x.id)).body.item.sections.includes('ป.อ. ม. 288'), 'ทุกคดีที่กรองต้องอ้างมาตรานั้นจริง (ในรายการส่งกลับแค่ 6 มาตราแรก จึงตรวจจากรายละเอียดเต็ม)');
r = await call('/api/precedents?q=' + encodeURIComponent('zzzzไม่มีคำนี้แน่นอนqqq'));
assert.equal(r.status, 200); assert.equal(r.body.total, 0); assert.deepEqual(r.body.items, []);
r = await call('/api/precedents?q=' + encodeURIComponent("'; drop table precedents_full; --"));
assert.equal(r.status, 200, 'ข้อความเจาะระบบต้องไม่ทำให้ error/ไม่กระทบฐาน');
r = await call('/api/precedents?year=2560');
assert.ok(r.body.items.length === 20 && r.body.hasMore, 'ไม่ระบุคำค้น = รายการตามปี');

// อ่านรายการเดียว
r = await call('/api/precedents?id=' + first.id);
assert.equal(r.status, 200);
const it = r.body.item;
assert.equal(it.id, first.id); assert.ok(it.headnote && Array.isArray(it.litigants) && Array.isArray(it.sections) && it.sourceUrl);
assert.ok(r.headers['cache-control'].includes('s-maxage=86400'));
assert.equal((await call('/api/precedents?id=999999999')).status, 404);
assert.equal((await call('/api/precedents?id=abc')).status, 400);
assert.equal((await call('/api/precedents?q=x', 'POST')).status, 405);

// สิทธิ์: บทบาทอ่านอย่างเดียวห้ามเขียน
const { default: pg } = await import('pg');
const u = new URL(process.env.AIVEN_READER_URL); u.searchParams.delete('sslmode');
const fs = await import('node:fs');
const c = new pg.Client({ connectionString: u.toString(), ssl: { ca: fs.readFileSync(process.env.AIVEN_CA_FILE, 'utf8'), rejectUnauthorized: true } });
await c.connect();
for (const sql of ['delete from precedents_full where id = 1', "update precedents_full set headnote = 'x' where id = 1", 'drop table precedents_full', 'create table zz(x int)']) {
  await assert.rejects(() => c.query(sql), `เขียนต้องถูกปฏิเสธ: ${sql}`);
}
await c.end();
console.log('precedents-api OK');
process.exit(0);
