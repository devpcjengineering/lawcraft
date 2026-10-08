// สร้างข้อมูลค่านำหมาย (exp.coj.co.th) แบบเล็กและโหลดทีละจังหวัด → public/data/service-fees/
// ใช้: node scripts/build-service-fees.mjs [โฟลเดอร์ data_*.json เช่น E:\boi\exp]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { courtKind } from '../shared/service-fee.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = process.argv[2] || 'E:\\boi\\exp';
// ไม่อยู่ใน public/ (ไม่ deploy) — ข้อมูลจริงอยู่บน Supabase (scripts/load-service-fees.mjs) ; ไฟล์นี้ใช้โหลดขึ้น Supabase และให้เซิร์ฟเวอร์ local (server/index.js) ใช้ค้นแทน
const outDir = path.join(root, 'data', 'service-fees');

// ไฟล์ต้นทางเป็น mojibake: ไบต์ UTF-8 ถูกอ่านเป็น Latin-1/CP1252 แล้วบันทึกเป็น UTF-8 อีกรอบ
const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
const dec = new TextDecoder('utf-8', { fatal: true });
function fix(s) {
  s = String(s ?? '');
  if (!/[\u00c2-\u00f4]/.test(s)) return s.trim();
  const bytes = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 256) bytes.push(c);
    else if (CP1252[c] != null) bytes.push(CP1252[c]);
    else return s.trim(); // ไม่ใช่ mojibake
  }
  try { return dec.decode(Uint8Array.from(bytes)).trim(); } catch { return s.trim(); }
}
const today = new Date().toISOString().slice(0, 10);
// วันที่ผิดปกติ (0001-01-01, 2061-01-01 ฯลฯ) ถือว่าไม่มีวันที่
const day = (v) => { const d = /^\d{4}-\d{2}-\d{2}/.test(v || '') ? v.slice(0, 10) : ''; return d >= '2000-01-01' && d <= today ? d : ''; };
let noArea = 0;

const files = fs.readdirSync(srcDir).filter((f) => /^data_\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
const best = new Map(); // key → row
let seen = 0, expired = 0, dup = 0, asOf = '', bad = 0;
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(srcDir, f), 'utf8').replace(/^\uFEFF/, ''));
  for (const r of j.data || []) {
    seen++;
    const row = {
      court: fix(r.court_name), prov: fix(r.prov_name), amphur: fix(r.amphur_name), tambon: fix(r.tambon_name),
      moo: fix(r.moo).replace(/^0+(?=\d)/, ''), fee: Number(String(r.amtsentnotice).replace(/,/g, '')),
      remark: fix(r.remark).replace(/\s+/g, ' '), start: day(r.start_date), end: day(r.end_date),
    };
    if (/\uFFFD/.test(JSON.stringify(row))) bad++;
    const upd = day(r.update_date); if (upd > asOf) asOf = upd; if (row.start > asOf) asOf = row.start;
    if (row.end && row.end < today) { expired++; continue; }
    if (row.moo === '0') row.moo = ''; // "0" = ทั้งตำบล
    if (!row.prov || !row.court || !Number.isFinite(row.fee)) continue;
    if (!row.amphur || !row.tambon) { noArea++; continue; } // แถวไม่ระบุพื้นที่ (ใช้ค้นหาไม่ได้)
    const k = [row.court, row.amphur, row.tambon, row.moo].join('|');
    const o = best.get(k);
    if (o) { dup++; if (row.start <= o.start) continue; }
    best.set(k, row);
  }
}
// ---- ตัดข้อมูลซ้ำ/ไม่จำเป็น (ต้องไม่ทำให้ผลค้นของ lookupServiceFee เปลี่ยน — ดู shared/service-fee.js) ----
// remark: ปรับช่องว่าง/วรรคตอนท้ายข้อความให้เหมือนกัน เพื่อให้ข้อความที่ต่างกันแค่เล็กน้อยรวมเป็นอันเดียว
const normRemark = (t) => String(t || '').replace(/[\s​]+/g, ' ').replace(/\s*([,;:])\s*/g, '$1 ').replace(/\s+([.)])/g, '$1').replace(/[\s.;,]+$/, '').trim();
let nRemarkMerged = 0;
{ const canon = new Map();
  for (const r of best.values()) { if (!r.remark) continue; const n = normRemark(r.remark); const key = n.replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d)).replace(/[\s.,;:()]/g, ''); if (!canon.has(key)) canon.set(key, n); if (r.remark !== canon.get(key)) nRemarkMerged++; r.remark = canon.get(key); } }
const pruned = { zeroNoRemark: 0, mooSameAsWhole: 0, mooCollapsed: 0 };
{ // ค่า 0 บาทและไม่มีหมายเหตุ = ไม่มีข้อมูลที่ใช้ได้ (ศาลยังไม่ตั้งอัตรา) → ไม่ใส่ ให้ผู้ใช้ได้ผล “ไม่พบ” แทนเลข 0
  for (const [k, r] of [...best]) if (r.fee === 0 && !r.remark) { best.delete(k); pruned.zeroNoRemark++; }
  // จัดกลุ่มตาม ศาล+อำเภอ+ตำบล
  const groups = new Map();
  for (const r of best.values()) { const g = [r.court, r.amphur, r.tambon].join('|'); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  const rm = (r) => best.delete([r.court, r.amphur, r.tambon, r.moo].join('|'));
  for (const list of groups.values()) {
    const whole = list.find((r) => !r.moo), withMoo = list.filter((r) => r.moo);
    if (!withMoo.length) continue;
    if (whole) { // แถวระบุหมู่ที่ ศาล/ตำบล/ค่า/หมายเหตุ/วันที่ เหมือนแถวทั้งตำบล → ซ้ำซ้อน
      for (const r of withMoo) if (r.fee === whole.fee && r.remark === whole.remark && r.start === whole.start) { rm(r); pruned.mooSameAsWhole++; }
    } else if (withMoo.length > 1 && withMoo.every((r) => r.fee === withMoo[0].fee && r.remark === withMoo[0].remark && r.start === withMoo[0].start)) {
      // ทุกหมู่ค่าเท่ากัน ไม่มีแถวทั้งตำบล → lookup ให้อัตราเดียวกันอยู่แล้ว (exact 'tambon') รวมเป็นแถวเดียว
      for (const r of withMoo) rm(r); const f = { ...withMoo[0], moo: '' }; best.set([f.court, f.amphur, f.tambon, ''].join('|'), f); pruned.mooCollapsed += withMoo.length - 1;
    }
  }
}
const th = new Intl.Collator('th');
const byProv = new Map();
for (const r of best.values()) { if (!byProv.has(r.prov)) byProv.set(r.prov, []); byProv.get(r.prov).push(r); }
const provs = [...byProv.keys()].sort(th.compare);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const index = { asOf, source: 'https://exp.coj.co.th (สำนักงานศาลยุติธรรม — ค่านำหมาย)', provinces: [] };
const allRemarks = new Map(), feeCount = new Map();
let rowsN = 0, withMoo = 0;
provs.forEach((p, i) => {
  const rows = byProv.get(p).sort((a, b) => th.compare(a.amphur, b.amphur) || th.compare(a.tambon, b.tambon) || th.compare(a.moo, b.moo, { numeric: true }) || th.compare(a.court, b.court));
  const remarks = [];
  const out = rows.map((r) => {
    let ri = -1;
    if (r.remark) { ri = remarks.indexOf(r.remark); if (ri < 0) ri = remarks.push(r.remark) - 1; allRemarks.set(r.remark, (allRemarks.get(r.remark) || 0) + 1); }
    feeCount.set(r.fee, (feeCount.get(r.fee) || 0) + 1);
    if (r.moo) withMoo++;
    return [r.court, r.amphur, r.tambon, r.moo, r.fee, ri, r.start];
  });
  rowsN += out.length;
  const file = `p${String(i + 1).padStart(2, '0')}.json`;
  fs.writeFileSync(path.join(outDir, file), JSON.stringify({ province: p, asOf, remarks, rows: out }), 'utf8');
  index.provinces.push({ name: p, file, count: out.length });
});
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index), 'utf8');
{ // courts.json = ผลค้นหาศาลแบบ static (โหมด local) รูปแบบเดียวกับ RPC service_fee_courts_search
  const m = new Map();
  for (const r of best.values()) { const c = m.get(r.court) || { court: r.court, kind: courtKind(r.court), provinces: new Set(), n_places: 0 }; c.provinces.add(r.prov); c.n_places++; m.set(r.court, c); }
  fs.writeFileSync(path.join(outDir, 'courts.json'), JSON.stringify([...m.values()].sort((a, b) => th.compare(a.court, b.court)).map((c) => ({ ...c, provinces: [...c.provinces].sort(th.compare) }))), 'utf8');
}

let size = 0; for (const f of fs.readdirSync(outDir)) size += fs.statSync(path.join(outDir, f)).size;
const fees = [...feeCount.entries()].sort((a, b) => b[1] - a[1]);
console.log(`files ${files.length}, rows seen ${seen}, expired ${expired}, duplicate keys ${dup}, dropped no-area ${noArea}, U+FFFD rows ${bad}`);
console.log(`pruned: fee 0 w/o remark ${pruned.zeroNoRemark}, moo rows identical to whole-tambon row ${pruned.mooSameAsWhole}, same-fee moo rows collapsed ${pruned.mooCollapsed}, remark texts normalised ${nRemarkMerged}; rows before prune ${best.size + pruned.zeroNoRemark + pruned.mooSameAsWhole + pruned.mooCollapsed}`);
console.log(`provinces ${provs.length}, rows ${rowsN}, rows with moo ${withMoo}, asOf ${asOf}`);
console.log(`distinct fees ${fees.length}, min ${Math.min(...feeCount.keys())}, max ${Math.max(...feeCount.keys())}, most common ${fees.slice(0, 5).map(([f, n]) => `${f}(${n})`).join(', ')}`);
console.log(`output ${(size / 1048576).toFixed(2)} MB in ${provs.length + 1} files`);
console.log(`distinct remarks ${allRemarks.size}:`);
for (const [t, n] of [...allRemarks.entries()].sort((a, b) => b[1] - a[1])) console.log(`  [${n}] ${t}`);
