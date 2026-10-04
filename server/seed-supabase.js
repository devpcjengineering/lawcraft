// อัปโหลดข้อมูลกฎหมาย (data/*.json) ขึ้นตาราง public.law_data ใน Supabase
// ใช้: SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node server/seed-supabase.js
// (service_role key ห้ามใส่ในไฟล์/โค้ดฝั่งเว็บ ใช้เฉพาะตอนรันสคริปต์นี้)
import { loadData, loadArticles, readJson } from './load-data.js';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('ต้องตั้ง SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const d = loadData();
const geo = readJson('geo.json') || { provinces: [] };
const rows = [
  ['laws', d.laws], ['items', d.items], ['procedure', d.procedure], ['precedents', d.precedents],
  ['courts', d.courts], ['courtPhones', d.courtPhones], ['articles', loadArticles()], ['templates', d.templates], ['jurisdiction', d.jurisdiction || null], ['geo', geo],
];

// formText เป็นของแอดมินแก้ผ่านหน้าเว็บ — ไม่ทับค่าเดิมที่มีอยู่ในฐานข้อมูล ยกเว้นยังไม่มีเลย
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };

async function upsert(k, data) {
  const res = await fetch(`${url}/rest/v1/law_data?on_conflict=key`, {
    method: 'POST', headers, body: JSON.stringify([{ key: k, data, updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) throw new Error(`${k}: ${res.status} ${await res.text()}`);
  console.log(`✓ ${k}  (${(JSON.stringify(data).length / 1024).toFixed(0)} KB)`);
}

for (const [k, data] of rows) if (data !== null) await upsert(k, data);

// formText / layout เป็นของแอดมินแก้ผ่านหน้าเว็บ — ไม่ทับค่าเดิม ยกเว้นยังไม่มีเลย
for (const [k, v] of [['formText', d.formText || {}], ['layout', d.layout || { all: {}, forms: {} }]]) {
  const exist = await fetch(`${url}/rest/v1/law_data?key=eq.${k}&select=key`, { headers }).then((r) => r.json());
  if (!exist.length || process.env.SEED_SETTINGS) await upsert(k, v); // SEED_SETTINGS=1 = เขียนทับด้วยค่าจากไฟล์ในเครื่อง (ใช้ตอนย้ายระบบ)
}
console.log('เสร็จสิ้น');
