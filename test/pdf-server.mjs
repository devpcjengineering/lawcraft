// ทดสอบการสร้าง PDF ด้วย Chrome บนเซิร์ฟเวอร์ (api/_pdf-render.js ผ่าน POST /api/pdf ของเซิร์ฟเวอร์ในเครื่อง):
// ได้ไฟล์ PDF จริง จำนวนหน้า = จำนวนแผ่นที่จัดหน้า มีข้อความค้นหาได้ (ฟอนต์ฝัง ไม่ใช่ภาพ) และทุกเอกสารในชุดอยู่ในไฟล์
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { newCase, newParty, newWitness } from '../shared/model.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (process.env.PDFEXPORT_NO_BROWSER || !edge) { console.log('pdf-server: ข้าม (ไม่มี Edge/Chrome)'); process.exit(0); }

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await freePort();
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, LOCAL_BACKEND: '1', PORT: String(port) }, stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch { /* ignore */ } });
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/css/doc.css`)).ok) break; } catch { /* รอ */ } await sleep(250); }
  const c = newCase('criminal');
  c.court = 'ศาลจังหวัดเชียงราย'; c.caseNoBlack = 'อ.123'; c.caseYearBlack = '2569';
  const mk = (role, f, l) => Object.assign(newParty(role), { prefix: 'นาย', first: f, last: l, idCard: '1101700230673', address: { no: '9', moo: '1', building: '', soi: '', road: 'ถนนสมมติ', sub: 'รอบเวียง', district: 'เมืองเชียงราย', province: 'เชียงราย', zip: '57000' } });
  c.parties = [mk('plaintiff', 'สมมติ', 'ทดสอบ'), mk('defendant', 'จำเลย', 'ตัวอย่าง')];
  c.facts = [{ id: 'f1', text: 'ข้อเท็จจริงทดสอบ จำเลยได้กระทำการอันเป็นความผิดตามฟ้อง', src: 'x' }];
  c.witnesses = [Object.assign(newWitness('person'), { name: 'นายพยาน หนึ่ง', addr: c.parties[1].address }), Object.assign(newWitness('document'), { name: 'สำเนาสัญญากู้ยืมเงินฉบับลงวันที่ ๑ มกราคม ๒๕๖๙', holder: 'ผู้จัดการธนาคารสมมติ สาขาเชียงราย', addr: c.parties[1].address })];
  const t0 = Date.now();
  const r = await fetch(`http://127.0.0.1:${port}/api/pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ case: c, title: 'ทดสอบชุดเอกสาร' }) });
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(r.status, 200, 'POST /api/pdf ต้องสำเร็จ: ' + buf.toString('utf8').slice(0, 300));
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  const sheets = +r.headers.get('x-pdf-pages');
  assert.ok(buf.subarray(0, 5).toString('latin1') === '%PDF-' && buf.subarray(-64).toString('latin1').includes('%%EOF'), 'ต้องเป็นไฟล์ PDF สมบูรณ์');
  const nPages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.ok(sheets >= 3, `ต้องมีแผ่นอย่างน้อย 3 (ได้ ${sheets})`);
  assert.equal(nPages, sheets, `จำนวนหน้า PDF (${nPages}) ต้องเท่าจำนวนแผ่น (${sheets})`);
  assert.ok(/\/FontFile2|\/FontFile3|\/FontFile/.test(buf.toString('latin1')), 'ต้องฝังฟอนต์ (ตัวอักษรเป็นเวกเตอร์)');
  assert.ok(buf.length < 2 * 1024 * 1024, `ไฟล์ใหญ่เกิน (${(buf.length / 1024).toFixed(0)} KB)`);
  const outDir = path.join(process.env.TEMP || process.env.TMPDIR || '.', 'pdf-server-check');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'out.pdf'), buf);
  console.log(`pdf-server OK · ${sheets} แผ่น = ${nPages} หน้า · ${(buf.length / 1024).toFixed(0)} KB · ${Date.now() - t0} ms (ไฟล์: ${path.join(outDir, 'out.pdf')})`);
} finally {
  try { server.kill(); } catch { /* ignore */ }
}
