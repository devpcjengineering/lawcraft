// ทดสอบสิทธิ์การแชร์คดีกับ Supabase จริงโดยไม่ทิ้งร่องรอย: ต่อไมเกรชัน + test/sharing-rls.sql เป็นคำสั่งเดียว (ธุรกรรมเดียว)
// บล็อกทดสอบจบด้วย exception → ธุรกรรมถูก rollback ทั้งก้อน (รวม DDL ของไมเกรชัน) แล้วอ่านผลจากข้อความ error
//   node test/sharing-rls.mjs [project-ref]        (ต้องล็อกอิน supabase CLI แล้ว)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ref = process.argv[2] || 'rertcaxuqeuytleaqqft';
const root = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const migrations = ['20261006000000_case_sharing.sql', '20261006010000_case_member_notify.sql'].map((f) => fs.readFileSync(path.join(root, 'supabase/migrations', f), 'utf8'));
const sql = migrations.join('\n') + '\n' + fs.readFileSync(path.join(root, 'test/sharing-rls.sql'), 'utf8');
const f = path.join(os.tmpdir(), 'sharing-rls-run.sql');
fs.writeFileSync(f, sql);
const r = spawnSync('npx', ['--yes', 'supabase', 'db', 'query', '--linked', '--project-ref', ref, '-f', f], { cwd: root, encoding: 'utf8', shell: true });
const out = (r.stdout || '') + (r.stderr || '');
// ข้อความ error ถูก escape ซ้อนหลายชั้น (\" , \\\") และตัดบรรทัดตามความกว้างเทอร์มินัล → ล้างแล้วค่อยแยก JSON
const flat = out.replace(/\\+"/g, '"').replace(/\r?\n\s*/g, '');
const m = /RESULTS:(\[.*?\}\])/s.exec(flat);
if (!m) { console.log(out.slice(0, 3000)); console.error('ไม่พบผลทดสอบ — ดูข้อความด้านบน'); process.exit(1); }
const res = JSON.parse(m[1]);
let bad = 0;
for (const x of res) { console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.t}`); if (!x.ok) bad++; }
console.log(`\n${res.length - bad}/${res.length} ผ่าน`);
process.exit(bad ? 1 : 0);
