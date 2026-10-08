// โหลดข้อมูลค่านำหมาย (data/service-fees/ ที่สร้างโดย scripts/build-service-fees.mjs) ขึ้น Supabase โดยไม่ใช้ secret ใน repo
// ใช้ Supabase CLI ที่ล็อกอินไว้แล้ว: npx supabase db query --linked --project-ref <ref> -f <ไฟล์ SQL ชั่วคราว>
// SQL สร้างเป็นก้อน (jsonb_to_recordset บน dollar-quoted JSON) ; id กำหนดแบบคงที่ (เรียงตามข้อมูล) ทำซ้ำได้ผลเดิม (idempotent)
//   ไฟล์ 0: truncate + ศาล + หมายเหตุ + meta (ธุรกรรมเดียว)  ·  ไฟล์ 1..n: service_fees ก้อนละ CHUNK แถว (upsert ตาม id)  ·  สุดท้าย: ตรวจจำนวน
// ใช้: node scripts/load-service-fees.mjs [--dry] [--ref <project-ref>] [--chunk 1500]
// ต้องรัน scripts/build-service-fees.mjs ก่อนทุกครั้งที่ข้อมูลต้นทางเปลี่ยน และ apply supabase/migrations/20261008000000_service_fees.sql แล้ว
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizePlace, courtKey, courtKind } from '../shared/service-fee.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'service-fees');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const dry = process.argv.includes('--dry');
const ref = arg('--ref', 'rertcaxuqeuytleaqqft');   // project ref ไม่ใช่ความลับ
const CHUNK = +arg('--chunk', 1500);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'service-fees-'));

const kindOf = courtKind;
const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const th = new Intl.Collator('th');
const files = index.provinces.map((p) => ({ p, d: JSON.parse(fs.readFileSync(path.join(dir, p.file), 'utf8')) }));
const courtNames = [...new Set(files.flatMap(({ d }) => d.rows.map((r) => r[0])))].sort(th.compare);
const courtId = new Map(courtNames.map((n, i) => [n, i + 1]));
const remarkTexts = [...new Set(files.flatMap(({ d }) => d.remarks))].sort(th.compare);
const remarkId = new Map(remarkTexts.map((t, i) => [t, i + 1]));
const keys = new Map();   // ศาลสองชื่อที่คีย์ซ้ำกันไม่ได้ (คีย์ใช้จับคู่)
for (const n of courtNames) { const k = courtKey(n); if (keys.has(k)) throw new Error(`court key collision: ${n} / ${keys.get(k)}`); keys.set(k, n); }

const fees = [];
let id = 0;
for (const { p, d } of files) {
  for (const r of d.rows) {
    id++;
    fees.push({ id, province: p.name, province_key: normalizePlace(p.name), amphur: r[1], amphur_key: normalizePlace(r[1]), tambon: r[2], tambon_key: normalizePlace(r[2]), moo: r[3] || '', court_id: courtId.get(r[0]), fee: r[4], remark_id: r[5] >= 0 ? remarkId.get(d.remarks[r[5]]) : null, start_date: r[6] || null });
  }
}
const q = (s) => { if (/\$j\$/.test(s)) throw new Error('dollar-quote clash'); return `$j$${s}$j$`; };
const json = (v) => q(JSON.stringify(v));

const sql0 = `begin;
truncate public.service_fees, public.service_fee_courts, public.service_fee_remarks, public.service_fee_meta;
insert into public.service_fee_courts (id, name, key, kind)
  select id, name, key, kind from jsonb_to_recordset(${json(courtNames.map((n) => ({ id: courtId.get(n), name: n, key: courtKey(n), kind: kindOf(n) })))}::jsonb) as t(id smallint, name text, key text, kind text);
insert into public.service_fee_remarks (id, text)
  select id, text from jsonb_to_recordset(${json(remarkTexts.map((t) => ({ id: remarkId.get(t), text: t })))}::jsonb) as t(id int, text text);
insert into public.service_fee_meta (k, v) values ('as_of', ${q(index.asOf || '')}), ('source', ${q(index.source || '')}), ('loaded_at', ${q(new Date().toISOString())}), ('rows', '${fees.length}');
commit;
`;
const chunks = [];
for (let i = 0; i < fees.length; i += CHUNK) {
  chunks.push(`insert into public.service_fees (id, province, province_key, amphur, amphur_key, tambon, tambon_key, moo, court_id, fee, remark_id, start_date)
select id, province, province_key, amphur, amphur_key, tambon, tambon_key, moo, court_id, fee, remark_id, start_date
from jsonb_to_recordset(${json(fees.slice(i, i + CHUNK))}::jsonb) as t(id int, province text, province_key text, amphur text, amphur_key text, tambon text, tambon_key text, moo text, court_id smallint, fee int, remark_id int, start_date date)
on conflict (id) do update set province = excluded.province, province_key = excluded.province_key, amphur = excluded.amphur, amphur_key = excluded.amphur_key, tambon = excluded.tambon, tambon_key = excluded.tambon_key, moo = excluded.moo, court_id = excluded.court_id, fee = excluded.fee, remark_id = excluded.remark_id, start_date = excluded.start_date;
`);
}
console.log(`courts ${courtNames.length}, remarks ${remarkTexts.length}, fee rows ${fees.length}, chunks ${chunks.length} (tmp ${tmp})`);

function run(name, sql) {
  const f = path.join(tmp, name);
  fs.writeFileSync(f, sql, 'utf8');
  if (dry) return '';
  const r = spawnSync(`npx supabase db query --linked --project-ref ${ref} -f "${f}"`, { shell: true, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); throw new Error(`supabase db query failed: ${name}`); }
  return r.stdout;
}
run('00-base.sql', sql0);
chunks.forEach((c, i) => { run(`${String(i + 1).padStart(2, '0')}-fees.sql`, c); process.stdout.write(`\rloaded chunk ${i + 1}/${chunks.length}`); });
console.log('');
if (!dry) {
  const out = run('99-count.sql', `select (select count(*) from public.service_fees) as fees, (select count(*) from public.service_fee_courts) as courts, (select count(*) from public.service_fee_remarks) as remarks, (select count(distinct province) from public.service_fees) as provinces, (select sum(fee)::bigint from public.service_fees) as fee_sum`);
  console.log(out.replace(/\s+/g, ' ').match(/"rows":.*?\]/)?.[0] || out);
  const sum = fees.reduce((a, r) => a + r.fee, 0);
  console.log(`expected: fees ${fees.length}, courts ${courtNames.length}, remarks ${remarkTexts.length}, provinces ${files.length}, fee_sum ${sum}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
