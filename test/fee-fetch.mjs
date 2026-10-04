// ดึงอัตราค่านำหมายทั่วประเทศ (exp.coj.go.th) ลงโฟลเดอร์ชั่วคราวเพื่อวิเคราะห์โครงสร้าง
import fs from 'node:fs';
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// รหัสจังหวัดตามกรมการปกครอง 10–96 (ที่มีจริง 77 จังหวัด) — ลองทุกรหัส ที่ไม่มีข้อมูลจะได้รายการว่าง
const ids = [];
for (let i = 10; i <= 96; i++) ids.push(i);
let done = 0;
async function one(id) {
  for (let t = 1; t <= 4; t++) {
    try {
      const res = await fetch(`https://exp.coj.go.th/api/v1/search?prov_id=${id}`, { headers: { 'User-Agent': 'Mozilla/5.0 court-doc-builder', Accept: 'application/json' }, signal: AbortSignal.timeout(90000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const txt = await res.text();
      const n = JSON.parse(txt).data?.length ?? 0;
      fs.writeFileSync(`${out}/p${id}.json`, txt);
      return n;
    } catch (e) { if (t === 4) return `ERR ${e.message}`; await sleep(800 * t); }
  }
}
const q = [...ids];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (q.length) {
    const id = q.shift();
    const n = await one(id);
    done++;
    console.log(String(id).padStart(2), n);
    await sleep(150);
  }
}));
console.log('done', done);
