// ทดสอบ public/js/pdf-export.js (ส่งออก PDF แบบเวกเตอร์จากแผ่น A4 ที่แบ่งหน้าแล้ว) ด้วย Edge จริง (CDP) + เซิร์ฟเวอร์ในเครื่อง (ข้อมูลสมมติทั้งหมด)
//  1) สร้างชุดเอกสารเต็ม (คำฟ้อง บัญชีพยาน หมายเรียกพยานหลายฉบับ ...) → paginateHtml → buildPdf → ตรวจ: PDF แยกได้ จำนวนหน้า = จำนวนแผ่น ขนาดไม่เกินเกณฑ์ ไม่มี error ในคอนโซล เวลาสร้าง
//  2) เทียบภาพ: เรนเดอร์หน้า PDF ด้วย pdf.js (โหลดจาก CDN) เทียบกับภาพถ่ายแผ่น HTML จริงทีละหน้า → รายงานสัดส่วนหมึกที่ไม่ตรง + บันทึกภาพ (html / pdf / overlay) ไว้ดูด้วยตา
//     ข้ามส่วนเทียบภาพได้ด้วย PDFEXPORT_NO_VISUAL=1 (หรืออัตโนมัติถ้าโหลด pdf.js ไม่ได้)
//  ใช้: node test/pdfexport.mjs   (ผลลัพธ์ภาพอยู่ใน PDFEXPORT_OUT หรือโฟลเดอร์ชั่วคราว)   ข้าม: PDFEXPORT_NO_BROWSER=1
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeCase } from './frontfit-case.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
if (process.env.PDFEXPORT_NO_BROWSER || !edge) { console.log('ข้าม (ไม่มี Edge/Chrome หรือตั้ง PDFEXPORT_NO_BROWSER)'); process.exit(0); }
const outDir = process.env.PDFEXPORT_OUT || path.join(os.tmpdir(), 'pdfexport-check');
fs.mkdirSync(outDir, { recursive: true });
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/';

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await freePort(), cdpPort = await freePort();
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, LOCAL_BACKEND: '1', PORT: String(port) }, stdio: 'ignore' });
const browser = spawn(edge, [`--remote-debugging-port=${cdpPort}`, '--headless=new', '--disable-gpu', '--user-data-dir=' + path.join(os.tmpdir(), 'pdfexport-' + cdpPort), 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { server.kill(); } catch { /* ignore */ } try { browser.kill(); } catch { /* ignore */ } };
process.on('exit', cleanup);

// ชุดเอกสารสมมติ: คดีอาญา โจทก์/จำเลย ทนาย ข้อหา + พยานบุคคล/เอกสาร/วัตถุหลายราย (รวมรายที่ข้อมูลยาวจนต้องย่อด้วย fitFront)
const PAGE_SCRIPT = `
const MK = ${makeCase.toString()};
const { newCase, newParty, newWitness } = await import('/shared/model.js');
const { buildDocuments } = await import('/shared/docs.js');
const { docHtml } = await import('/js/render-html.js');
const { paginateHtml, documentFontsReady } = await import('/js/paginate.js');
const { buildPdf } = await import('/js/pdf-export.js');
const data = await (await fetch('/api/data')).json();
const c = MK({ newCase, newParty, newWitness }, { type: 'criminal', form: 'item', level: 'typical' });
const long = MK({ newCase, newParty, newWitness }, { type: 'criminal', form: 'item', level: 'long' });
c.witnesses.push(...long.witnesses.slice(0, 2));
const mkPerson = (name, position, addr, purpose) => Object.assign(newWitness('person'), { name, position, addr, phone: '081-234-5678', purpose });
const A = { no: '88', moo: '9', building: '', soi: 'ซอยสมมติ 1', road: 'ถนนสมมติ', sub: 'ตำบลสมมติ', district: 'อำเภอสมมติ', province: 'เชียงราย', zip: '57000' };
c.witnesses.push(mkPerson('นายพยานสมมติ ตัวอย่างระบบ', 'ร้อยตำรวจเอก', A, 'รู้เห็นเหตุการณ์ในวันเกิดเหตุ'), mkPerson('นางสาวสมมติ ทดสอบฐานะ', '', A, 'ฐานะผู้เสียหาย ญาติของผู้เสียหาย'), mkPerson('นายพยานผู้มีชื่อและนามสกุลยาวมากเป็นพิเศษสำหรับการทดสอบการล้นหน้า นามสกุลยาวเช่นกัน', 'ผู้ช่วยผู้อำนวยการสำนักงานอาวุโสฝ่ายสืบสวนสอบสวนคดีพิเศษประจำภูมิภาค', A, 'ข้อเท็จจริงเกี่ยวกับการตรวจพิสูจน์หลักฐานและการเก็บรักษาพยานวัตถุของกลางในคดีนี้ตั้งแต่ต้นจนจบกระบวนการ'));
const it = data.items.find((x) => x.kind === 'criminal');
c.charges = [{ itemId: it.id, related: [] }];
c.incidentDate = '2026-05-01'; c.knownDate = '2026-05-02';
c.facts = [{ id: 'f1', text: 'เมื่อวันที่ ๑ พฤษภาคม ๒๕๖๙ จำเลยได้บังอาจพูดจาดูหมิ่นโจทก์ต่อหน้าผู้อื่น ณ ถนนสมมติ ตำบลสมมติ อำเภอสมมติ จังหวัดเชียงราย อันเป็นการเหยียดหยามและดูถูกโจทก์ผู้เป็นเจ้าพนักงาน ฐานะผู้ปฏิบัติหน้าที่ตามกฎหมาย จำเลยกระทำโดยเจตนาให้โจทก์เสียหายและเสื่อมเสียเกียรติ เหตุเกิดที่ตำบลสมมติ อำเภอสมมติ จังหวัดเชียงราย ขอให้ศาลลงโทษจำเลยตามกฎหมาย', src: 'x' }];
c.motions = [{ id: 'm1', title: 'ขอเลื่อนนัดสืบพยาน', kind: 'คำแถลง', text: 'โจทก์ขอยื่นคำแถลงนี้เพื่อประกอบการพิจารณาของศาล เนื่องจากพยานโจทก์ติดภารกิจสำคัญ ไม่สามารถมาเบิกความได้ในวันนัด จึงขอศาลได้โปรดอนุญาตให้เลื่อนนัดสืบพยานออกไป\\n\\nขอศาลได้โปรดพิจารณา' }]; // ใช้ตัวขีดฆ่า (.strike) ในหัวเอกสาร
${process.env.PDFEXPORT_SCEN || ''}
const docs = buildDocuments(c, data);
await documentFontsReady();
const htmls = docs.map((x) => paginateHtml(docHtml(x, data.layout)));
const sheetsHtml = htmls.join('');
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
const stats = {};
const t0 = performance.now();
let lastProgress = null;
const blob = await buildPdf(sheetsHtml, { title: 'ทดสอบ', stats, onProgress: (a, b) => { lastProgress = [a, b]; } });
const ms = Math.round(performance.now() - t0);
const t1 = performance.now(); const blob2 = await buildPdf(sheetsHtml, { title: 'ทดสอบซ้ำ' }); const ms2 = Math.round(performance.now() - t1); // เรียกซ้ำ: โหลดไลบรารี/ฟอนต์จากแคช ต้องได้ผลเหมือนกัน
const size2 = blob2.size;
const buf = new Uint8Array(await blob.arrayBuffer());
let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
// สำหรับเทียบภาพ: เขียนแผ่น HTML ทั้งหมดลงหน้า (ไม่มีกรอบเงา) แล้วคืนกรอบของแต่ละแผ่น
document.open();
document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><base href="' + location.origin + '/"><link rel="stylesheet" href="css/doc.css"><style>html,body{background:#fff}body{margin:0}.page{margin:0 0 0 0!important;box-shadow:none!important}</style></head><body>' + sheetsHtml + '</body></html>');
document.close();
await new Promise((r) => setTimeout(r, 1000));
await document.fonts.ready;
const rects = [...document.querySelectorAll('section.sheet')].map((s) => { const r = s.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, doc: s.dataset.doc, pg: s.dataset.pg + '/' + s.dataset.of }; });
return JSON.stringify({ b64: btoa(bin), ms, ms2, size2, type: blob.type, stats, lastProgress, errors, rects, nDocs: docs.length, docIds: docs.map((x) => x.id) });`;

// pdf.js ในหน้าเปล่า: เรนเดอร์หน้า PDF ที่สเกล 2 แล้วเทียบกับภาพ HTML (สเกล 1.5 ของ px CSS = กว้างเท่ากัน)
const COMPARE_SCRIPT = `
window.__cmp = async (b64pdf, idx, b64html) => {
  const pdfjs = window.__pdfjs || (window.__pdfjs = await import('${PDFJS}pdf.min.mjs'));
  pdfjs.GlobalWorkerOptions.workerSrc = '${PDFJS}pdf.worker.min.mjs';
  if (!window.__doc) { const bytes = Uint8Array.from(atob(b64pdf), (ch) => ch.charCodeAt(0)); window.__doc = await pdfjs.getDocument({ data: bytes }).promise; }
  if (idx < 0) return { pages: window.__doc.numPages };
  const page = await window.__doc.getPage(idx + 1);
  const vp = page.getViewport({ scale: 2 });
  const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const img = new Image(); img.src = 'data:image/png;base64,' + b64html; await img.decode();
  const W = Math.min(cv.width, img.width), H = Math.min(cv.height, img.height);
  const hc = document.createElement('canvas'); hc.width = W; hc.height = H; const hx = hc.getContext('2d'); hx.fillStyle = '#fff'; hx.fillRect(0, 0, W, H); hx.drawImage(img, 0, 0);
  const a = hx.getImageData(0, 0, W, H).data, b = ctx.getImageData(0, 0, W, H).data;
  const inkA = new Uint8Array(W * H), inkB = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { inkA[i] = (a[i * 4] + a[i * 4 + 1] + a[i * 4 + 2]) / 3 < 140 ? 1 : 0; inkB[i] = (b[i * 4] + b[i * 4 + 1] + b[i * 4 + 2]) / 3 < 140 ? 1 : 0; }
  const dil = (m, r) => { const t = new Uint8Array(W * H), o = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < W && m[y * W + xx]) v = 1; } t[y * W + x] = v; } for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < H && t[yy * W + x]) v = 1; } o[y * W + x] = v; } return o; };
  const R = 2, dA = dil(inkA, R), dB = dil(inkB, R);
  let nA = 0, nB = 0, onlyA = 0, onlyB = 0;
  const ov = document.createElement('canvas'); ov.width = W; ov.height = H; const ox = ov.getContext('2d'); const od = ox.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    let r = 255, g = 255, bl = 255;
    if (inkA[i]) { nA++; if (!dB[i]) { onlyA++; r = 255; g = 0; bl = 0; } else { r = g = bl = 150; } }
    if (inkB[i]) { nB++; if (!dA[i]) { onlyB++; r = 0; g = 0; bl = 255; } else if (!inkA[i]) { r = g = bl = 190; } }
    od.data[i * 4] = r; od.data[i * 4 + 1] = g; od.data[i * 4 + 2] = bl; od.data[i * 4 + 3] = 255;
  }
  ox.putImageData(od, 0, 0);
  const tc = await page.getTextContent();
  return { W, H, inkHtml: nA, inkPdf: nB, missing: onlyA / Math.max(1, nA), extra: onlyB / Math.max(1, nB), overlay: ov.toDataURL('image/png').split(',')[1], pdfPng: cv.toDataURL('image/png').split(',')[1], text: tc.items.map((t) => t.str).join('') };
};
return 'ok';`;

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/css/doc.css`)).ok) break; } catch { /* รอเซิร์ฟเวอร์ */ } await sleep(250); }
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json(); if (targets.length) break; } catch { /* รอเบราว์เซอร์ */ } await sleep(250); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(d.params.type)) logs.push('console.' + d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalPage = async (expr) => { const ev = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (ev.result?.exceptionDetails) throw new Error(ev.result.exceptionDetails.exception?.description || JSON.stringify(ev.result.exceptionDetails)); return ev.result?.result?.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: Number(process.env.PDFEXPORT_DPR) || 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/css/doc.css` });
  await sleep(800);

  // ---- 1) สร้าง PDF ----
  const r = JSON.parse(await evalPage(`(async()=>{${PAGE_SCRIPT}})()`));
  const pdf = Buffer.from(r.b64, 'base64');
  fs.writeFileSync(path.join(outDir, 'out.pdf'), pdf);
  const nPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`เอกสาร ${r.nDocs} ฉบับ (${r.docIds.join(', ')})`);
  console.log(`แผ่น ${r.rects.length} → PDF ${nPages} หน้า · ${(pdf.length / 1024).toFixed(0)} KB · สร้างใน ${r.ms} ms · ข้อความ ${r.stats.strings} ชิ้น (จัดชิดสองข้าง ${r.stats.spread}) · รูป ${r.stats.images} จุด · ต่างความกว้างคำสูงสุด ${r.stats.widthDiffMax.toFixed(1)}px [${r.stats.widest}]`);
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-', 'ต้องเป็นไฟล์ PDF');
  assert.equal(nPages, r.rects.length, 'จำนวนหน้า PDF = จำนวนแผ่น');
  assert.deepEqual(r.lastProgress, [r.rects.length, r.rects.length], 'onProgress ครบ');
  assert.ok(pdf.length < 1024 * 1024, `ขนาด PDF ${pdf.length} ไบต์ ต้องไม่เกิน 1 MB`);
  assert.deepEqual(r.errors, [], 'ไม่มี error ในหน้า');
  assert.equal(r.stats.missingChars, '', 'ฟอนต์ต้องมีตัวอักษรครบ');
  assert.equal(r.type, 'application/pdf');
  assert.ok(Math.abs(r.size2 - pdf.length) < 200, `เรียกซ้ำต้องได้ขนาดใกล้เคียง ( กับ )`);
  console.log(`  เรียกซ้ำใช้ ${r.ms2} ms`);
  assert.ok(r.ms < 15000, `สร้างช้าเกินไป ${r.ms} ms`);
  // ตราครุฑฝังครั้งเดียว: จำนวนอ็อบเจ็กต์รูปใน PDF ต้องไม่เพิ่มตามจำนวนจุดที่วาด
  const imgObjs = (pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length;
  assert.ok(imgObjs <= 2, `ภาพฝังใน PDF ${imgObjs} อ็อบเจ็กต์ (ตราครุฑต้องฝังครั้งเดียว: ภาพ + SMask)`);
  console.log(`  ภาพที่ฝัง ${imgObjs} อ็อบเจ็กต์ (วาด ${r.stats.images} จุด)`);

  // ---- 2) เทียบภาพกับตัวอย่าง HTML ----
  if (process.env.PDFEXPORT_NO_VISUAL) { console.log('ข้ามส่วนเทียบภาพ'); }
  else {
    // ภาพถ่ายแผ่น HTML (สเกล 1.5) — ใช้สื่อ print เหมือนตอนพิมพ์
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    await sleep(300);
    const shots = [];
    for (const [i, q] of r.rects.entries()) {
      const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: q.x, y: q.y, width: q.w, height: q.h, scale: 1.5 / (Number(process.env.PDFEXPORT_DPR) || 1) } });
      const buf = Buffer.from(s.result.data, 'base64');
      fs.writeFileSync(path.join(outDir, `html-${String(i + 1).padStart(2, '0')}.png`), buf);
      shots.push(s.result.data);
    }
    await send('Emulation.setEmulatedMedia', { media: '' });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/css/doc.css` });
    await sleep(500);
    let ok = true;
    try { await evalPage(`(async()=>{${COMPARE_SCRIPT}})()`); await evalPage(`window.__cmp(${JSON.stringify(r.b64)}, -1)`); } catch (e) { ok = false; console.log('ข้ามส่วนเทียบภาพ: โหลด pdf.js ไม่ได้ (' + String(e.message).split('\n')[0] + ')'); }
    if (ok) {
      const worst = [];
      for (const [i, q] of r.rects.entries()) {
        const c = await evalPage(`window.__cmp(null, ${i}, ${JSON.stringify(shots[i])})`);
        const n = String(i + 1).padStart(2, '0');
        fs.writeFileSync(path.join(outDir, `pdf-${n}.png`), Buffer.from(c.pdfPng, 'base64'));
        fs.writeFileSync(path.join(outDir, `diff-${n}.png`), Buffer.from(c.overlay, 'base64'));
        console.log(`  หน้า ${n} (${q.doc} ${q.pg}): หมึกหายไป ${(c.missing * 100).toFixed(2)}% · หมึกเกิน ${(c.extra * 100).toFixed(2)}%`);
        worst.push(Math.max(c.missing, c.extra));
        if (i === 0) assert.ok(c.text.replace(/\s/g, '').includes('ศาล'), 'PDF ต้องมีข้อความที่เลือก/ค้นหาได้ (หน้า 1 ไม่มี “ศาล”)');
      }
      const mx = Math.max(...worst);
      assert.ok(mx < 0.12, `ภาพ PDF ต่างจากตัวอย่างมากเกินไป (สูงสุด ${(mx * 100).toFixed(1)}%)`);
    }
  }
  assert.deepEqual(logs, [], 'ไม่มี error ในคอนโซล');
  console.log('ผ่าน · ภาพที่ใช้เทียบอยู่ที่ ' + outDir);
  ws.close();
} finally { cleanup(); }
process.exit(0);
