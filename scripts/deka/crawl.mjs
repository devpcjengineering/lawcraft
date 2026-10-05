#!/usr/bin/env node
// crawl.mjs — เก็บคำพิพากษาศาลฎีกา (ที่ศาลเผยแพร่ใน deka.supremecourt.or.th) ทีละหน้าอย่างสุภาพ
//
// ทำงานผ่าน Edge ที่เปิดไว้แล้วด้วย --remote-debugging-port=9333 (ดู README.md) โดย "ใช้หน้าเว็บตามปกติ":
//   1) เปิดหน้าแรก  2) กรอกฟอร์มค้นหา (ประเภท=คำพิพากษาศาลฎีกา, ปี พ.ศ. ต่อปี)  3) กดค้นหา
//   4) เปิดหน้าผลลัพธ์ถัดไปด้วย GET /search/index/N (ลิงก์แบ่งหน้าของเว็บเอง) — 20 คดี/หน้า
// ไม่แก้ลิขสิทธิ์/ไม่ข้าม captcha/ไม่หมุน IP: ถ้าเจอ captcha, 403, 429, หน้าไม่ใช่ผลลัพธ์ หรือ session หลุด → หยุดทันที
//
// ผลลัพธ์ (ค่าเริ่มต้นอยู่นอก repo):  %LOCALAPPDATA%\lawcraft-deka-data\
//     <out>\<ปี พ.ศ.>.jsonl   (1 บรรทัด = 1 คดี, dedup ด้วย docId ของระบบศาล)
//     <out>\checkpoint.json   (ต่อจากเดิมได้เมื่อรันซ้ำ)
//     <out>\crawl.log
//     สร้างไฟล์ <out>\STOP เพื่อสั่งหยุดอย่างปลอดภัย
//
// ตัวอย่าง:
//   node crawl.mjs --from 2560 --to 2560 --max-pages 2        # นำร่อง 2 หน้า (40 คดี)
//   node crawl.mjs --from 2520 --to 2569                       # ทั้งช่วงปี (รันต่อได้)
//   node crawl.mjs --years 2538,2540 --delay-min 4000 --delay-max 8000
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://deka.supremecourt.or.th';

// ---------- CLI ----------
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
  args[k] = v;
}
if (args.help) {
  console.log('ใช้: node crawl.mjs [--from 2560 --to 2569 | --years 2538,2540] [--out DIR] [--port 9333] [--delay-min 3000] [--delay-max 6000] [--max-pages N] [--doctype 1]');
  process.exit(0);
}
const PORT = +(args.port || 9333);
const OUT = path.resolve(args.out || path.join(process.env.LOCALAPPDATA || '.', 'lawcraft-deka-data'));
const DELAY_MIN = Math.max(3000, +(args['delay-min'] || 3000)); // ห้ามต่ำกว่า 3 วินาที
const DELAY_MAX = Math.max(DELAY_MIN, +(args['delay-max'] || 6000));
const MAX_PAGES = args['max-pages'] ? +args['max-pages'] : Infinity; // จำกัดจำนวนหน้าที่โหลดต่อการรัน (ใช้ตอนนำร่อง)
const DOCTYPE = String(args.doctype || '1'); // 1 = คำพิพากษาศาลฎีกา
let years = [];
if (args.years) years = args.years.split(',').map(Number);
else if (args.from) { const f = +args.from, t = +(args.to || args.from); for (let y = t; y >= f; y--) years.push(y); } // ใหม่ → เก่า
if (!years.length) { console.error('ต้องระบุ --from/--to หรือ --years  (ดู --help)'); process.exit(2); }
if (years.some((y) => !(y >= 2400 && y <= 2700))) { console.error('ปีต้องเป็น พ.ศ. 4 หลัก'); process.exit(2); }

if (OUT.toLowerCase().startsWith(path.resolve(HERE, '..', '..').toLowerCase())) {
  console.error('ปฏิเสธ: --out ต้องอยู่นอกโฟลเดอร์ repo (E:\\boi\\app)'); process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });
const EXTRACT = fs.readFileSync(path.join(HERE, 'extract.js'), 'utf8');
const CK = path.join(OUT, 'checkpoint.json');
const LOG = path.join(OUT, 'crawl.log');
const STOPFILE = path.join(OUT, 'STOP');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN);
const log = (...a) => { const l = `[${new Date().toISOString()}] ${a.join(' ')}`; console.log(l); fs.appendFileSync(LOG, l + '\n'); };

// ---------- checkpoint ----------
let ck = { version: 1, years: {} };
try { ck = JSON.parse(fs.readFileSync(CK, 'utf8')); } catch { /* ใหม่ */ }
const saveCk = () => { ck.updatedAt = new Date().toISOString(); fs.writeFileSync(CK + '.tmp', JSON.stringify(ck, null, 1)); fs.renameSync(CK + '.tmp', CK); };

// ---------- CDP ----------
class Stop extends Error {}
async function attach() {
  let targets;
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); }
  catch { throw new Error(`เชื่อม CDP พอร์ต ${PORT} ไม่ได้ — เปิด Edge ตาม README ก่อน`); }
  const page = targets.find((t) => t.type === 'page' && t.url.includes('deka.supremecourt.or.th')) || targets.find((t) => t.type === 'page');
  if (!page) throw new Error('ไม่พบแท็บเบราว์เซอร์');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(); const listeners = new Set();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    else if (d.method) for (const l of listeners) l(d);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  const evaluate = async (expr) => {
    const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (res.result?.exceptionDetails) throw new Error('eval: ' + (res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text));
    return res.result?.result?.value;
  };
  // รอ "หน้าโหลดเสร็จ" หลังสั่งการ (navigate หรือ submit) พร้อมจับ HTTP status ของเอกสารหลัก
  const act = async (fn, timeoutMs = 60000) => {
    let status = null; let loaded = false;
    const l = (d) => {
      if (d.method === 'Network.responseReceived' && d.params.type === 'Document') status = d.params.response.status;
      if (d.method === 'Page.loadEventFired') loaded = true;
    };
    listeners.add(l);
    try {
      await fn();
      const t0 = Date.now();
      while (!loaded && Date.now() - t0 < timeoutMs) await sleep(150);
      if (!loaded) throw new Error('หน้าโหลดไม่เสร็จใน ' + timeoutMs + 'ms');
      await sleep(1200); // ให้ JS ของหน้าทำงานต่อ
      return status;
    } finally { listeners.delete(l); }
  };
  return { send, evaluate, act, close: () => ws.close() };
}

function guard(status, r) {
  if (status === 403 || status === 429) throw new Stop(`HTTP ${status} — หยุดทันที (อย่าลองใหม่ ติดต่อศาล/รอ)`);
  if (status && status >= 500) throw new Error(`HTTP ${status}`);
  const head = r?.bodyHead || '';
  if (/captcha|recaptcha|ยืนยันว่าคุณไม่ใช่|robot|Access Denied|Forbidden|Too Many Requests/i.test(head)) throw new Stop('พบ captcha/บล็อก — หยุดทันที');
  if (/เข้าสู่ระบบ.*(หมดอายุ|ก่อน)|session.*(expire|หมด)|กรุณาล็อกอิน/i.test(head)) throw new Stop('session หมดอายุ/ต้องล็อกอิน — หยุด');
}

const stats = { pages: 0, items: 0, newItems: 0, dups: 0 };
let c;

async function fetchPage(doNav) {
  const status = await c.act(doNav);
  const r = await c.evaluate(`JSON.stringify(${EXTRACT})`).then(JSON.parse);
  guard(status, r);
  return r;
}

async function searchYear(y) {
  await fetchPage(() => c.send('Page.navigate', { url: BASE + '/' })); // หน้าแรก (ไม่ใช่ผลลัพธ์ — ข้ามการตรวจ)
  await sleep(jitter());
  const r = await fetchPage(() => c.evaluate(
    `document.querySelector('#search_doctype').value=${JSON.stringify(DOCTYPE)};` +
    `document.querySelector('#search_deka_start_year').value='${y}';document.querySelector('#search_deka_end_year').value='${y}';` +
    `document.querySelector('#basic_search').submit();1`));
  return r;
}

function shardPath(y) { return path.join(OUT, `${y}.jsonl`); }
function loadSeen(y) {
  const s = new Set();
  try { for (const line of fs.readFileSync(shardPath(y), 'utf8').split('\n')) if (line) { try { s.add(JSON.parse(line).docId); } catch { /* บรรทัดขาด */ } } } catch { /* ยังไม่มีไฟล์ */ }
  return s;
}
function writeItems(y, r, seen, sourceUrl) {
  const now = new Date().toISOString();
  let lines = '';
  for (const it of r.items) {
    if (!it.docId) throw new Stop('ไม่พบ docId ในผลลัพธ์ — โครงสร้างหน้าเปลี่ยน หยุดเพื่อตรวจ');
    if (seen.has(it.docId)) { stats.dups++; continue; }
    seen.add(it.docId);
    lines += JSON.stringify({ ...it, sourceUrl, retrievedAt: now }) + '\n';
    stats.newItems++;
  }
  if (lines) fs.appendFileSync(shardPath(y), lines);
  stats.items += r.items.length;
}

async function crawlYear(y) {
  const st = ck.years[y] || (ck.years[y] = { status: 'pending', nextPage: 1, totalPages: null, found: null, saved: 0 });
  if (st.status === 'done') { log(`ปี ${y}: เสร็จแล้ว ข้าม`); return; }
  const seen = loadSeen(y);
  log(`ปี ${y}: เริ่ม/ต่อ จากหน้า ${st.nextPage} (มีแล้ว ${seen.size} คดี)`);
  let r = await searchYear(y); stats.pages++;
  if (r.found === 0 || r.n === 0) { st.status = 'done'; st.found = 0; st.totalPages = 0; saveCk(); log(`ปี ${y}: ไม่พบคดี`); return; }
  if (!r.totalPages) throw new Stop('อ่านจำนวนหน้าไม่ได้ — โครงสร้างหน้าเปลี่ยนหรือถูกบล็อก');
  if (st.found != null && st.found !== r.found) log(`ปี ${y}: คำเตือน จำนวนผลลัพธ์เปลี่ยน ${st.found} → ${r.found} (ศาลอัปเดตข้อมูล)`);
  st.found = r.found; st.totalPages = r.totalPages;
  if (st.nextPage <= 1) { writeItems(y, r, seen, `${BASE}/search#POST doctype=${DOCTYPE} year=${y} page=1`); st.nextPage = 2; st.saved = seen.size; saveCk(); }
  for (let p = st.nextPage; p <= st.totalPages; p++) {
    if (fs.existsSync(STOPFILE)) throw new Stop('พบไฟล์ STOP — หยุดอย่างปลอดภัย');
    if (stats.pages >= MAX_PAGES) throw new Stop(`ครบ --max-pages ${MAX_PAGES}`);
    await sleep(jitter());
    r = await fetchPage(() => c.send('Page.navigate', { url: `${BASE}/search/index/${p}` })); stats.pages++;
    if (r.page !== p || r.totalPages !== st.totalPages || r.n === 0) {
      throw new Stop(`หน้าที่ได้ไม่ตรง (ขอ ${p}/${st.totalPages}, ได้ ${r.page}/${r.totalPages}, n=${r.n}) — session อาจหลุด หยุดเพื่อตรวจ`);
    }
    writeItems(y, r, seen, `${BASE}/search/index/${p}#year=${y}`);
    st.nextPage = p + 1; st.saved = seen.size; saveCk();
    if (p % 10 === 0 || p === st.totalPages) log(`ปี ${y}: หน้า ${p}/${st.totalPages} บันทึกแล้ว ${seen.size}/${st.found} | รวมรันนี้ หน้า=${stats.pages} ใหม่=${stats.newItems} ซ้ำ=${stats.dups}`);
  }
  st.status = 'done'; saveCk();
  log(`ปี ${y}: เสร็จ ${seen.size} คดี (ศาลแจ้ง ${st.found})`);
}

process.on('SIGINT', () => { log('ได้รับ Ctrl+C — บันทึก checkpoint แล้วออก'); saveCk(); process.exit(130); });

(async () => {
  log(`เริ่ม years=${years.join(',')} out=${OUT} delay=${DELAY_MIN}-${DELAY_MAX}ms maxPages=${MAX_PAGES}`);
  try {
    c = await attach();
    for (const y of years) await crawlYear(y);
    log('เสร็จทุกปีที่ระบุ');
  } catch (e) {
    saveCk();
    if (e instanceof Stop) { log('หยุด: ' + e.message); process.exitCode = 3; }
    else { log('ผิดพลาด: ' + (e.stack || e.message)); process.exitCode = 1; }
  } finally {
    log(`สรุปรอบนี้: หน้า=${stats.pages} คดีที่อ่าน=${stats.items} ใหม่=${stats.newItems} ซ้ำ=${stats.dups}`);
    try { c?.close(); } catch { /* ignore */ }
    process.exit();
  }
})();
