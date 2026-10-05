#!/usr/bin/env node
// load-aiven.mjs — โหลดคำพิพากษาศาลฎีกาจาก <ปี>.jsonl (ผล crawl.mjs) เข้า Aiven for PostgreSQL (ตาราง precedents_full)
//
// ต้องตั้ง environment variable AIVEN_DATABASE_URL (สตริงเชื่อมต่อของ avnadmin) — ห้ามเขียนรหัสผ่านลงไฟล์ใน repo
//   ถ้ามีไฟล์ CA ของ Aiven ให้ตั้ง AIVEN_CA_FILE=<path> เพื่อ “ตรวจใบรับรองเซิร์ฟเวอร์” ; ไม่ตั้ง = เข้ารหัส TLS แต่ไม่ตรวจตัวเซิร์ฟเวอร์ (มีคำเตือน)
//   ต้องมีแพ็กเกจ pg:  npm i --no-save pg   (ยังไม่ได้ใส่ใน package.json เพราะใช้เฉพาะสคริปต์นี้)
//
// ขั้นตอนปกติ (รันซ้ำได้ — ข้ามคดีที่มีแล้ว, ต่อจาก crawl ที่ยังวิ่งอยู่ได้):
//   node scripts/deka/load-aiven.mjs --schema-only            # สร้างตาราง (ไม่มีดัชนีหนัก)
//   node scripts/deka/load-aiven.mjs                          # โหลดทุกปีที่มีไฟล์ (หรือ --from 2560 --to 2569 / --years 2519,2520)
//   node scripts/deka/load-aiven.mjs --build-indexes          # สร้างดัชนีค้นหา หลังโหลดเสร็จ
//   node scripts/deka/load-aiven.mjs --create-reader          # สร้าง role lawcraft_reader (อ่านอย่างเดียว) → เขียน URL ลงไฟล์นอก repo
//   node scripts/deka/load-aiven.mjs --stats                  # สรุปจำนวน/ขนาดในฐาน
// ตัวเลือก: --dir <โฟลเดอร์ jsonl> (ค่าเริ่มต้น %LOCALAPPDATA%\lawcraft-deka-data) · --batch 100 · --max-gb 4 (หยุดเองถ้าฐานโตเกินนี้) · --limit N (ทดสอบ) · --dry-run (แปลงอย่างเดียว ไม่แตะฐาน)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { mapRow } from './precedent-map.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]; if (!a.startsWith('--')) continue;
  const nx = process.argv[i + 1]; args[a.slice(2)] = nx && !nx.startsWith('--') ? (i++, nx) : 'true';
}
const DIR = path.resolve(args.dir || path.join(process.env.LOCALAPPDATA || '.', 'lawcraft-deka-data'));
if (DIR.toLowerCase().startsWith(path.resolve(HERE, '..', '..').toLowerCase())) { console.error('ปฏิเสธ: --dir ต้องอยู่นอก repo'); process.exit(2); }
const BATCH = Math.max(1, +(args.batch || 100));
const MAX_BYTES = +(args['max-gb'] || 4) * 1024 ** 3;
const LIMIT = args.limit ? +args.limit : Infinity;
const DRY = args['dry-run'] === 'true';
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

let years = null;
if (args.years) years = args.years.split(',').map(Number);
else if (args.from) { years = []; for (let y = +args.from; y <= +(args.to || args.from); y++) years.push(y); }

async function connect() {
  const url = process.env.AIVEN_DATABASE_URL;
  if (!url) { console.error('ต้องตั้ง AIVEN_DATABASE_URL (สตริงเชื่อมต่อ Aiven)'); process.exit(2); }
  const { default: pg } = await import('pg').catch(() => { console.error('ไม่พบแพ็กเกจ pg — รัน: npm i --no-save pg'); process.exit(2); });
  const u = new URL(url); u.searchParams.delete('sslmode');
  let ssl;
  if (process.env.AIVEN_CA_FILE) ssl = { ca: fs.readFileSync(process.env.AIVEN_CA_FILE, 'utf8'), rejectUnauthorized: true };
  else { ssl = { rejectUnauthorized: false }; log('คำเตือน: ยังไม่ได้ตั้ง AIVEN_CA_FILE — เข้ารหัส TLS แต่ไม่ตรวจใบรับรองเซิร์ฟเวอร์'); }
  const c = new pg.Client({ connectionString: u.toString(), ssl, statement_timeout: 0 });
  await c.connect();
  return c;
}

const COLS = ['source_doc_id', 'title_raw', 'case_no', 'year', 'doc_type', 'case_type', 'headnote', 'full_text', 'sections', 'laws', 'litigants', 'judges', 'lower_courts', 'primary_court_nos', 'departments', 'black_no', 'sources', 'remark', 'source_url', 'retrieved_at', 'tok_a', 'tok_b', 'tok_c'];
const INSERT_SQL = `
insert into precedents_full (${COLS.slice(0, 20).join(', ')}, fts)
select r.source_doc_id, r.title_raw, r.case_no, r.year, r.doc_type, r.case_type, r.headnote, r.full_text, r.sections, r.laws, r.litigants, r.judges, r.lower_courts, r.primary_court_nos, r.departments, r.black_no, r.sources, r.remark, r.source_url, r.retrieved_at,
  setweight(to_tsvector('simple', r.tok_a), 'A') || setweight(to_tsvector('simple', r.tok_b), 'B') || setweight(to_tsvector('simple', r.tok_c), 'C')
from jsonb_to_recordset($1::jsonb) as r(source_doc_id text, title_raw text, case_no text, year int, doc_type text, case_type text, headnote text, full_text text, sections text[], laws jsonb, litigants text[], judges text[], lower_courts text[], primary_court_nos text[], departments text[], black_no text[], sources text[], remark text, source_url text, retrieved_at timestamptz, tok_a text, tok_b text, tok_c text)
on conflict (source_doc_id) do nothing`;

const dbBytes = async (c) => +(await c.query('select pg_database_size(current_database())::bigint b')).rows[0].b;
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

async function runSchema(c, part) {
  const sql = fs.readFileSync(path.join(HERE, 'schema-aiven.sql'), 'utf8');
  const [base, idx] = sql.split(/^-- @@INDEXES.*$/m);
  const text = part === 'indexes' ? idx : base;
  for (const stmt of text.split(/;\s*(?:\r?\n|$)/).map((s) => s.replace(/^(\s*--.*\n)+/gm, '').trim()).filter(Boolean)) {
    const t0 = Date.now(); await c.query(stmt);
    log('ok', stmt.split('\n')[0].slice(0, 90), `(${Date.now() - t0} ms)`);
  }
}

async function createReader(c) {
  const name = 'lawcraft_reader';
  const exists = (await c.query('select 1 from pg_roles where rolname=$1', [name])).rowCount > 0;
  const pass = crypto.randomBytes(24).toString('base64url');
  if (!exists) await c.query(`create role ${name} login password '${pass}' connection limit 8`);
  else await c.query(`alter role ${name} login password '${pass}' connection limit 8`);
  const db = (await c.query('select current_database() d')).rows[0].d;
  await c.query(`grant connect on database "${db}" to ${name}`);
  await c.query(`grant usage on schema public to ${name}`);
  await c.query(`revoke all on all tables in schema public from ${name}`);
  await c.query(`grant select on precedents_full to ${name}`);
  await c.query(`alter role ${name} set statement_timeout = '8s'`);
  await c.query(`alter role ${name} set default_transaction_read_only = on`);
  const u = new URL(process.env.AIVEN_DATABASE_URL); u.username = name; u.password = pass;
  const f = path.join(DIR, 'aiven-reader.url');
  fs.writeFileSync(f, u.toString() + '\n', { mode: 0o600 });
  log(`${exists ? 'รีเซ็ต' : 'สร้าง'} role ${name} (SELECT เฉพาะ precedents_full, statement_timeout 8s, อ่านอย่างเดียว) — URL เก็บที่ ${f} (นอก repo; ใช้เป็น AIVEN_READER_URL ของเว็บ)`);
}

async function stats(c) {
  const t = (await c.query(`select count(*)::int n, count(full_text)::int with_full, min(year) y0, max(year) y1, pg_size_pretty(pg_total_relation_size('precedents_full')) tbl, pg_size_pretty(pg_database_size(current_database())) db from precedents_full`)).rows[0];
  log('ในฐาน:', JSON.stringify(t));
  const by = (await c.query('select year, count(*)::int n from precedents_full group by 1 order by 1 desc limit 8')).rows;
  log('ปีล่าสุด:', by.map((r) => `${r.year}=${r.n}`).join(' '));
}

async function loadYearFile(c, file, year) {
  const seen = new Set();
  if (c) for (const r of (await c.query('select source_doc_id from precedents_full where year=$1', [year])).rows) seen.add(r.source_doc_id);
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, file), { encoding: 'utf8' }), crlfDelay: Infinity });
  let batch = [], read = 0, skipped = 0, bad = 0, inserted = 0, noMap = 0;
  const flush = async () => {
    if (!batch.length) return;
    if (c) { const r = await c.query(INSERT_SQL, [JSON.stringify(batch)]); inserted += r.rowCount; }
    else inserted += batch.length;
    batch = [];
  };
  for await (const line of rl) {
    if (!line) continue;
    if (read + skipped >= LIMIT) break;
    let o; try { o = JSON.parse(line); } catch { bad++; continue; } // บรรทัดสุดท้ายที่ crawl เขียนค้างอยู่
    if (!o.docId) { noMap++; continue; }
    if (seen.has(String(o.docId))) { skipped++; continue; }
    seen.add(String(o.docId));
    const row = mapRow(o);
    if (!row) { noMap++; continue; }
    read++;
    batch.push(row);
    if (batch.length >= BATCH) { await flush(); if (c && inserted % (BATCH * 20) < BATCH && (await dbBytes(c)) > MAX_BYTES) throw new Error(`ฐานโตเกิน --max-gb (${mb(await dbBytes(c))}) — หยุดเพื่อความปลอดภัย (เพิ่มพื้นที่แล้วรันซ้ำได้ จะต่อจากเดิม)`); }
  }
  await flush();
  return { read, skipped, bad, noMap, inserted };
}

(async () => {
  const c = DRY ? null : await connect();
  try {
    if (args['schema-only']) { await runSchema(c, 'base'); await stats(c).catch(() => {}); return; }
    if (args['build-indexes']) { await runSchema(c, 'indexes'); await stats(c); return; }
    if (args['create-reader']) { await createReader(c); return; }
    if (args.stats) { await stats(c); return; }
    if (c) await runSchema(c, 'base'); // ไม่มีก็สร้าง (if not exists)
    const files = fs.readdirSync(DIR).filter((f) => /^\d{4}\.jsonl$/.test(f)).sort().reverse(); // ใหม่ → เก่า
    const todo = files.filter((f) => !years || years.includes(+f.slice(0, 4)));
    if (!todo.length) { log('ไม่พบไฟล์ <ปี>.jsonl ใน', DIR); return; }
    log(`โหลด ${todo.length} ไฟล์จาก ${DIR}${DRY ? ' (dry-run)' : ''} batch=${BATCH} เพดาน=${mb(MAX_BYTES)}`);
    const tot = { read: 0, skipped: 0, bad: 0, noMap: 0, inserted: 0 }; const t0 = Date.now();
    for (const f of todo) {
      const r = await loadYearFile(c, f, +f.slice(0, 4));
      for (const k of Object.keys(tot)) tot[k] += r[k];
      log(`${f}: เพิ่ม ${r.inserted} · มีแล้ว ${r.skipped}${r.bad ? ` · บรรทัดเสีย ${r.bad}` : ''}${r.noMap ? ` · ข้ามข้อมูลไม่ครบ ${r.noMap}` : ''} | รวม ${tot.inserted} (${Math.round((Date.now() - t0) / 1000)} s)${c ? ' | ฐาน ' + mb(await dbBytes(c)) : ''}`);
      if (tot.read >= LIMIT) break;
    }
    log('เสร็จ:', JSON.stringify(tot));
    if (c) await stats(c);
  } finally { await c?.end(); }
})().catch((e) => { console.error('ผิดพลาด:', e.message); process.exit(1); });
