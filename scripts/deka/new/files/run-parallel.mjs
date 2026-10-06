// run-parallel.mjs — รัน crawl.mjs หลายตัวพร้อมกัน แบ่งช่วงปีละ N ปี (ไม่ทับกัน)
// แต่ละ worker มี Edge ของตัวเอง (profile + port แยก) เพื่อไม่ให้ session/cookie ของการค้นหาตีกัน
//
// ใช้:  node run-parallel.mjs --from 2463 --to 2569 --chunk 5 --workers 4 --base-port 9341 -- --delay-min 3000 --delay-max 4500
//       อาร์กิวเมนต์หลัง "--" จะส่งต่อให้ crawl.mjs ตรง ๆ
// หยุด: Ctrl+C หรือสร้างไฟล์ STOP ใน %LOCALAPPDATA%\lawcraft-deka-data  (รันใหม่ = ทำต่อจากเดิม)

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- args ----------
const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const own = sep === -1 ? argv : argv.slice(0, sep);
const passThrough = sep === -1 ? [] : argv.slice(sep + 1);
const opt = (name, def) => {
  const i = own.indexOf(`--${name}`);
  return i === -1 ? def : own[i + 1];
};

const FROM = Number(opt('from', 2463));
const TO = Number(opt('to', 2569));
const CHUNK = Number(opt('chunk', 5));
const WORKERS = Number(opt('workers', 4));
const BASE_PORT = Number(opt('base-port', 9341));
const MAX_RETRY = Number(opt('retries', 2));
const EDGE = opt('edge', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const START_URL = 'https://deka.supremecourt.or.th';

const LOCAL = process.env.LOCALAPPDATA;
const OUT = path.join(LOCAL, 'lawcraft-deka-data');
const STOP = path.join(OUT, 'STOP');
fs.mkdirSync(OUT, { recursive: true });

// ---------- logging ----------
const MAIN_LOG = path.join(OUT, 'parallel.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(MAIN_LOG, line + '\n');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- คิวช่วงปี: ใหม่ -> เก่า, ไม่ทับกัน, แต่ละช่วงถูกหยิบได้ครั้งเดียว ----------
const queue = [];
for (let hi = TO; hi >= FROM; hi -= CHUNK) {
  queue.push({ from: Math.max(FROM, hi - CHUNK + 1), to: hi, tries: 0 });
}

// ---------- Edge ต่อ worker ----------
const edges = [];
const children = new Set();
let stopping = false;

async function cdpUp(port, timeoutMs) {
  const end = Date.now() + timeoutMs;
  do {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return true;
    } catch {}
    await sleep(500);
  } while (Date.now() < end);
  return false;
}

async function ensureEdge(w) {
  const port = BASE_PORT + w;
  if (await cdpUp(port, 1000)) return port; // มี Edge ค้างจากรอบก่อน ใช้ต่อได้
  const profile = path.join(LOCAL, `lawcraft-deka-profile-w${w + 1}`);
  const p = spawn(EDGE, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    START_URL,
  ], { stdio: 'ignore' });
  edges.push(p);
  return (await cdpUp(port, 30000)) ? port : null;
}

function killEdges() {
  for (const e of edges) {
    try { execSync(`taskkill /PID ${e.pid} /T /F`, { stdio: 'ignore' }); } catch {}
  }
}

// ---------- รัน crawl.mjs หนึ่งช่วง ----------
function runChunk(w, port, chunk) {
  return new Promise((resolve) => {
    const tag = `[W${w + 1} ${chunk.from}-${chunk.to}]`;
    const wlog = fs.createWriteStream(path.join(OUT, `worker-${w + 1}.log`), { flags: 'a' });
    const child = spawn(process.execPath, [
      'crawl.mjs',
      '--from', String(chunk.from),
      '--to', String(chunk.to),
      '--port', String(port),
      '--tag', `W${w + 1}`,
      ...passThrough,
    ], {
      cwd: __dirname,
      env: { ...process.env, DEKA_PORT: String(port), CDP_PORT: String(port) },
    });
    children.add(child);
    for (const s of [child.stdout, child.stderr]) {
      readline.createInterface({ input: s }).on('line', (line) => {
        if (!line.trim()) return;
        console.log(`${tag} ${line}`);
        wlog.write(line + '\n');
      });
    }
    child.on('close', (code) => {
      children.delete(child);
      wlog.end();
      resolve(code);
    });
  });
}

async function worker(w) {
  await sleep(w * 3000); // เหลื่อมเวลาเริ่ม ไม่ให้ยิงพร้อมกันทุกตัว
  const port = await ensureEdge(w);
  if (!port) {
    log(`W${w + 1}: Edge ไม่ขึ้นที่พอร์ต ${BASE_PORT + w} — worker นี้ไม่ทำงาน (ช่วงปีที่เหลือ worker อื่นรับต่อ)`);
    return;
  }
  while (queue.length && !stopping) {
    if (fs.existsSync(STOP)) { log(`W${w + 1}: พบไฟล์ STOP — หยุด`); return; }
    const chunk = queue.shift(); // JS เป็น single-thread: shift() ไม่มีทางได้ช่วงเดียวกันสองตัว
    log(`W${w + 1}: เริ่มช่วงปี ${chunk.from}-${chunk.to} (port ${port})`);
    const code = await runChunk(w, port, chunk);
    if (stopping || code === 130) return;
    if (code === 0) {
      log(`W${w + 1}: จบช่วงปี ${chunk.from}-${chunk.to}`);
    } else if (code === 3) {
      // crawl.mjs หยุดเพราะ 403/429/captcha/session หลุด/โครงสร้างหน้าเปลี่ยน/ไฟล์ STOP
      // ห้าม retry อัตโนมัติ — สร้าง STOP ให้ทุก worker หยุดหลังจบหน้าปัจจุบัน แล้วให้คนตรวจ log
      if (!fs.existsSync(STOP)) {
        fs.writeFileSync(STOP, `stopped by W${w + 1} (${chunk.from}-${chunk.to})\n`);
        log(`W${w + 1}: crawl.mjs หยุดด้วยเหตุผลที่ต้องตรวจ (ดู worker-${w + 1}.log) — สั่ง STOP ทุก worker`);
      }
      queue.unshift(chunk); // คืนช่วงเข้าคิว เพื่อให้สรุปท้ายนับถูก (รันใหม่จะต่อจาก checkpoint)
      return;
    } else if (++chunk.tries <= MAX_RETRY) {
      log(`W${w + 1}: ช่วงปี ${chunk.from}-${chunk.to} ผิดพลาด (code ${code}) — ใส่คิวใหม่ (ครั้งที่ ${chunk.tries})`);
      queue.push(chunk); // ตัวเดิมจบไปแล้ว + มี lock ต่อปี จึงไม่มีการดึงปีเดียวกันซ้อนกัน
      await sleep(10000);
    } else {
      log(`W${w + 1}: ช่วงปี ${chunk.from}-${chunk.to} ล้มเหลวเกิน ${MAX_RETRY} ครั้ง — ข้าม (รันใหม่ภายหลังเพื่อทำต่อ)`);
    }
  }
}

process.on('SIGINT', () => {
  if (stopping) return;
  stopping = true;
  log('Ctrl+C — กำลังหยุดทุก worker');
  for (const c of children) { try { c.kill(); } catch {} }
  killEdges();
  setTimeout(() => process.exit(1), 2000);
});

// ---------- main ----------
if (fs.existsSync(STOP)) fs.unlinkSync(STOP);
log(`เริ่ม ${FROM}-${TO} ช่วงละ ${CHUNK} ปี = ${queue.length} ช่วง | workers=${WORKERS} | ports ${BASE_PORT}-${BASE_PORT + WORKERS - 1}`);
await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, (_, w) => worker(w)));
log(queue.length ? `หยุดแล้ว เหลือ ${queue.length} ช่วงในคิว (รันใหม่เพื่อทำต่อ)` : 'จบทุกช่วงแล้ว');
killEdges();
