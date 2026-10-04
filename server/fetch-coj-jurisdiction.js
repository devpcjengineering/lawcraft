// ดึงข้อมูลเขตอำนาจศาลรายอำเภอ/เขต จากระบบสาธารณะของสำนักงานศาลยุติธรรม (pubdata.coj.go.th/jurisdiction)
// ผลลัพธ์: data/jurisdiction.json  — รันซ้ำเพื่ออัปเดต:  node server/fetch-coj-jurisdiction.js
// หมายเหตุ: ยิงทีละน้อยและมีหน่วงเวลา เพื่อไม่รบกวนเซิร์ฟเวอร์ของหน่วยงาน
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://pubdata.coj.go.th/jurisdiction';
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const CONCURRENCY = 3, DELAY_MS = 120;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function http(url, opt = {}, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { ...opt, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } catch (e) {
      if (i === tries) throw e;
      await sleep(600 * i);
    }
  }
}
const options = (html) => [...html.matchAll(/<option value='([^']*)'>([^<]*)<\/option>/g)].map((m) => m[1]).filter(Boolean);
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();

/** แยกประเภทศาลจากชื่อ */
function classify(name) {
  if (/ฎีกา|อุทธรณ์/.test(name)) return { type: 'appeal', scope: 'appeal' };
  if (/เยาวชนและครอบครัว/.test(name)) return { type: 'juvenile', scope: 'special' };
  if (/แรงงาน|ภาษีอากร|ล้มละลาย|ทรัพย์สินทางปัญญา|ทุจริตและประพฤติมิชอบ/.test(name)) return { type: 'specialized', scope: 'special' };
  if (/^ศาลแพ่ง/.test(name)) return { type: 'first', scope: 'civil' };
  if (/^ศาลอาญา/.test(name)) return { type: 'first', scope: 'criminal' };
  if (/^ศาลแขวง/.test(name)) return { type: 'first', scope: 'both', magistrate: true };
  return { type: 'first', scope: 'both' };
}

function parseCourts(html) {
  const out = [];
  for (const m of html.matchAll(/<tr><td\s*>([^<]*)<\/td><td\s*>([^<]*)<\/td><\/tr>/g)) {
    const name = decode(m[1]);
    if (name) out.push({ name, phone: decode(m[2]) || undefined, ...classify(name) });
  }
  return out;
}

const AS_OF = '2018-08-01'; // วันที่ข้อมูลตามที่หน้าเว็บของสำนักงานศาลยุติธรรมระบุ ("ข้อมูล ณ วันที่ 1 สิงหาคม 2561")
const BASIS = 'ระบบสืบค้นเขตอำนาจศาล สำนักงานศาลยุติธรรม (ข้อมูล ณ 1 ส.ค. 2561)';
const tag = (c) => ({ ...c, verified: true, basis: BASIS });
const strip = (v) => v.replace(/^(เขต|อ\.|อำเภอ)\s*/, '').trim();

const provinces = options(await http(`${BASE}/getProvince.php`));
console.log('จังหวัด', provinces.length);

const result = {};
let total = 0, withCourts = 0;
const jobs = [];
for (const prov of provinces) {
  const html = await http(`${BASE}/getAmphr.php?q=${encodeURIComponent(prov)}`);
  const amphrs = options(html);
  result[prov] = { districts: {} };
  for (const a of amphrs) jobs.push({ prov, raw: a });
  await sleep(DELAY_MS);
}
console.log('อำเภอ/เขตทั้งหมด', jobs.length);

let idx = 0;
async function worker() {
  while (idx < jobs.length) {
    const job = jobs[idx++];
    const body = new URLSearchParams({ q: job.raw, q2: job.prov });
    try {
      const html = await http(`${BASE}/getCourt.php`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const courts = parseCourts(html);
      total++;
      if (courts.length) withCourts++;
      result[job.prov].districts[strip(job.raw)] = courts.map(tag);
    } catch (e) {
      console.warn('ล้มเหลว', job.prov, job.raw, e.message);
      result[job.prov].districts[strip(job.raw)] = [];
    }
    if (total % 100 === 0) console.log('...', total, '/', jobs.length);
    await sleep(DELAY_MS);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// ชื่ออำเภอที่สะกดต่างกันระหว่างฐานที่อยู่ (geo.json) กับระบบของศาล → ทำสำเนาชื่อให้ค้นเจอทั้งสองแบบ
const ALIASES = { 'มุกดาหาร/หว้านใหญ่': 'ว่านใหญ่', 'พัทลุง/ป่าพะยอม': 'ป่าพยอม', 'ยะลา/กรงปินัง': 'กรงปีนัง', 'บึงกาฬ/เมืองบึงกาฬ': 'บึงกาฬ' };
for (const [k, cojName] of Object.entries(ALIASES)) {
  const [prov, geoName] = k.split('/');
  if (result[prov]?.districts[cojName] && !result[prov].districts[geoName]) result[prov].districts[geoName] = result[prov].districts[cojName];
}

// ศาลหลักของจังหวัด (default) = ศาลชั้นต้นที่ปรากฏบ่อยที่สุดในจังหวัดนั้น
for (const [prov, v] of Object.entries(result)) {
  const count = new Map();
  for (const d of Object.values(v.districts)) for (const c of d) if (c.type === 'first') count.set(c.name, (count.get(c.name) || 0) + 1);
  v.default = [...count].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => tag({ name, scope: 'both', type: 'first' }));
}

const out = {
  source: 'สำนักงานศาลยุติธรรม — ระบบสืบค้นเขตอำนาจศาล https://pubdata.coj.go.th/jurisdiction/',
  fetchedAt: new Date().toISOString().slice(0, 10),
  asOf: AS_OF,
  note: 'ข้อมูลทางการรายอำเภอ/เขต ณ 1 ส.ค. 2561 (ตามที่ระบบของสำนักงานศาลยุติธรรมระบุ) อาจไม่รวมศาลที่จัดตั้งใหม่ภายหลัง. districts[ชื่อ] = รายการศาลที่มีเขตอำนาจ รวมศาลชั้นต้น ศาลชำนัญพิเศษ และศาลอุทธรณ์ (type: first | juvenile | specialized | appeal). default = ศาลชั้นต้นที่พบบ่อยในจังหวัด',
  coverage: { provinces: provinces.length, districts: total, districtsWithCourts: withCourts },
  provinces: result,
};
fs.writeFileSync(path.join(DATA, 'jurisdiction.json'), JSON.stringify(out), 'utf8');
console.log('เสร็จ:', out.coverage);
