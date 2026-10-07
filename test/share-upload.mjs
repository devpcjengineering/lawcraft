// ทดสอบ “สร้าง PDF แล้วอัปโหลดทับไฟล์เดิม” ในเบราว์เซอร์จริง (Edge/Chrome) กับ Supabase จริง — ใช้โค้ดจริงของแอป: buildPdf → supabaseBackend.uploadCasePdf
//   ตรวจว่าไบต์ที่อ่านกลับมา (ลิงก์ชั่วคราวของ Storage และลิงก์ดูสาธารณะ Edge Function `pdf`) ตรงกับไฟล์ที่สร้างทุกไบต์ ทั้งตอนอัปโหลดครั้งแรก ตอนทับด้วยไฟล์ใหญ่กว่า และทับด้วยไฟล์เล็กกว่า
//   ใช้: node test/share-upload.mjs [project-ref]   (ต้องล็อกอิน supabase CLI — ดึงคีย์ในหน่วยความจำเท่านั้น; สร้างผู้ใช้/คดีชั่วคราวแล้วลบทิ้งตอนจบ)
//   ข้ามอัตโนมัติ: ไม่มี Edge/Chrome · ไม่มี supabase CLI/สิทธิ์ · ตั้ง PDFEXPORT_NO_BROWSER=1 หรือ SHARE_UPLOAD_SKIP=1
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeCase } from './frontfit-case.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
if (process.env.PDFEXPORT_NO_BROWSER || process.env.SHARE_UPLOAD_SKIP || !edge) { console.log('ข้าม (ไม่มี Edge/Chrome หรือตั้ง PDFEXPORT_NO_BROWSER / SHARE_UPLOAD_SKIP)'); process.exit(0); }

const ref = process.argv[2] || 'rertcaxuqeuytleaqqft';
const url = `https://${ref}.supabase.co`;
let anonKey, serviceKey;
try {
  const r = spawnSync('npx', ['--yes', 'supabase', 'projects', 'api-keys', '--project-ref', ref, '-o', 'json'], { encoding: 'utf8', shell: true });
  const keys = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')));
  anonKey = keys.find((k) => k.id === 'anon').api_key; serviceKey = keys.find((k) => k.id === 'service_role').api_key;
} catch { console.log('ข้าม (ดึงคีย์ Supabase ไม่ได้ — ต้องล็อกอิน supabase CLI)'); process.exit(0); }
const { createClient } = await import('@supabase/supabase-js');

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await freePort(), cdpPort = await freePort();
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, LOCAL_BACKEND: '1', CLOUD_BACKEND: '1', PORT: String(port) }, stdio: 'ignore' });
const browser = spawn(edge, [`--remote-debugging-port=${cdpPort}`, '--headless=new', '--disable-gpu', '--user-data-dir=' + path.join(os.tmpdir(), 'share-upload-' + cdpPort), 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { server.kill(); } catch { /* ignore */ } try { browser.kill(); } catch { /* ignore */ } };
process.on('exit', cleanup);

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const rnd = Math.random().toString(36).slice(2, 8);
const caseId = 'up' + rnd;
const user = { email: `up-${rnd}@example.com`, password: 'Pw!' + rnd + 'xyZ9' };
let userId = null;

// ในหน้า: สร้าง PDF ใหญ่ (ทั้งชุด) กับเล็ก (คำฟ้องอย่างเดียว) แล้วอัปโหลดทับสลับกันด้วย supabaseBackend.uploadCasePdf จริง
const PAGE_SCRIPT = (session) => `
localStorage.setItem('sb-${ref}-auth-token', ${JSON.stringify(JSON.stringify(session))});
const MK = ${makeCase.toString()};
const { newWitness, newParty, newCase } = await import('/shared/model.js');
const { buildDocuments } = await import('/shared/docs.js');
const { docHtml } = await import('/js/render-html.js');
const { paginateHtml, documentFontsReady } = await import('/js/paginate.js');
const { buildPdf } = await import('/js/pdf-export.js');
const { supabaseBackend: B } = await import('/js/supabase-backend.js');
const data = await (await fetch('/api/data')).json();
const c = MK({ newCase, newParty, newWitness }, { type: 'criminal', form: 'item', level: 'typical' });
const it = data.items.find((x) => x.kind === 'criminal');
c.charges = [{ itemId: it.id, related: [] }];
c.incidentDate = '2026-05-01'; c.knownDate = '2026-05-02';
c.facts = [{ id: 'f1', text: 'เมื่อวันที่ ๑ พฤษภาคม ๒๕๖๙ จำเลยได้บังอาจพูดจาดูหมิ่นโจทก์ต่อหน้าผู้อื่น ณ ถนนสมมติ ขอให้ศาลลงโทษจำเลยตามกฎหมาย', src: 'x' }];
const docs = buildDocuments(c, data);
await documentFontsReady();
const htmlOf = (list) => list.map((d) => paginateHtml(docHtml(d, data.layout))).join('');
const sha = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
const big = await buildPdf(htmlOf(docs), { title: 'ใหญ่' });
const small = await buildPdf(htmlOf(docs.slice(0, 1)), { title: 'เล็ก' });
const out = { sizes: { big: big.size, small: small.size }, steps: [] };
const back = async (blob, tag) => {
  const want = await sha(await blob.arrayBuffer());
  const u = await B.casePdfViewUrl(${JSON.stringify(caseId)});
  const r = await fetch(u, { cache: 'no-store' });
  const buf = await r.arrayBuffer();
  const step = { tag, want, status: r.status, type: r.headers.get('content-type'), len: buf.byteLength, size: blob.size, got: await sha(buf), head: new TextDecoder('latin1').decode(new Uint8Array(buf, 0, 5)) };
  out.steps.push(step);
};
const up = async (blob, tag) => { const row = await B.uploadCasePdf(${JSON.stringify(caseId)}, blob, { pages: 1 }); await back(blob, tag); out.steps[out.steps.length - 1].rowSize = row.sizeBytes; };
await up(small, 'first upload (small)');
await up(big, 'overwrite with bigger');
await up(small, 'overwrite with smaller');
await up(big, 'overwrite bigger again');
out.shareToken = await B.setPdfShare(${JSON.stringify(caseId)}, 'on');
const r = await fetch(out.shareToken, { cache: 'no-store' });
const buf = await r.arrayBuffer();
out.pub = { status: r.status, type: r.headers.get('content-type'), len: buf.byteLength, got: await sha(buf), want: await sha(await big.arrayBuffer()) };
return JSON.stringify(out);`;

try {
  let res = await admin.auth.admin.createUser({ email: user.email, password: user.password, email_confirm: true });
  assert.ifError(res.error); userId = res.data.user.id;
  const cl = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const si = await cl.auth.signInWithPassword(user);
  assert.ifError(si.error);
  const ins = await cl.from('cases').insert({ id: caseId, title: 'upload-test', type: 'criminal', data: { v: 1 }, updated_at: new Date().toISOString() });
  assert.ifError(ins.error);

  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/css/doc.css`)).ok) break; } catch { /* รอเซิร์ฟเวอร์ */ } await sleep(250); }
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json(); if (targets.length) break; } catch { /* รอเบราว์เซอร์ */ } await sleep(250); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalPage = async (expr) => { const ev = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (ev.result?.exceptionDetails) throw new Error(ev.result.exceptionDetails.exception?.description || JSON.stringify(ev.result.exceptionDetails)); return ev.result?.result?.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/css/doc.css` });
  await sleep(800);

  const r = JSON.parse(await evalPage(`(async()=>{${PAGE_SCRIPT(si.data.session)}})()`));
  console.log(`PDF ใหญ่ ${r.sizes.big} ไบต์ · เล็ก ${r.sizes.small} ไบต์`);
  for (const s of r.steps) {
    console.log(`  ${s.tag}: ${s.status} ${s.type} ${s.len}/${s.size} ไบต์ · แถวในตาราง ${s.rowSize}`);
    assert.equal(s.status, 200, `${s.tag}: เปิดไฟล์ได้`);
    assert.match(s.type, /application\/pdf/, `${s.tag}: ชนิดไฟล์`);
    assert.equal(s.head, '%PDF-', `${s.tag}: หัวไฟล์`);
    assert.equal(s.len, s.size, `${s.tag}: ขนาดที่อ่านกลับ = ขนาดที่อัปโหลด`);
    assert.equal(s.got, s.want, `${s.tag}: ไบต์ที่อ่านกลับต้องตรงกับไฟล์ที่สร้างทุกไบต์`);
    assert.equal(s.rowSize, s.size, `${s.tag}: size_bytes ในตาราง = ขนาดไฟล์`);
  }
  const left = (await admin.storage.from('case-pdfs').list(caseId)).data || [];
  assert.equal(left.length, 1, `ในโฟลเดอร์คดีต้องเหลือไฟล์ล่าสุดไฟล์เดียว (เหลือ ${left.map((o) => o.name).join(', ')})`);
  assert.equal(r.pub.status, 200, 'ลิงก์สาธารณะเปิดได้');
  assert.equal(r.pub.got, r.pub.want, 'ลิงก์สาธารณะส่งไฟล์ล่าสุดตรงทุกไบต์');
  // ลิงก์สาธารณะแบบที่เบราว์เซอร์ขอจริง (curl ไม่ถอดรหัสบีบอัดให้เอง): ไบต์ดิบที่ได้ต้องเป็น PDF ครบ ไม่ถูกบีบอัดซ้อน/ตัดท้าย
  const hdrs = spawnSync('curl.exe', ['-s', '-D', '-', '-o', path.join(os.tmpdir(), 'share-upload-raw.pdf'), '-H', 'Accept-Encoding: gzip, deflate, br, zstd', r.shareToken], { encoding: 'utf8' });
  if (!hdrs.error && hdrs.stdout) {
    const raw = fs.readFileSync(path.join(os.tmpdir(), 'share-upload-raw.pdf'));
    const h = Object.fromEntries(hdrs.stdout.split(/\r?\n/).filter((l) => l.includes(':')).map((l) => [l.slice(0, l.indexOf(':')).toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
    console.log(`  curl: content-type=${h['content-type']} content-length=${h['content-length']} content-encoding=${h['content-encoding'] || '-'} ได้ ${raw.length} ไบต์`);
    assert.ok(!h['content-encoding'] || Number(h['content-length']) === raw.length || !h['content-length'], 'Content-Length ต้องตรงกับไบต์ที่ส่งจริง (ถ้าบีบอัด)');
    assert.equal(raw.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.equal(raw.subarray(-6).toString('latin1').includes('%%EOF'), true, 'ท้ายไฟล์ต้องมี %%EOF');
  }
  assert.deepEqual(logs, [], 'ไม่มี exception ในหน้า');
  console.log('ผ่าน');
  ws.close();
} finally {
  cleanup();
  try { const names = ((await admin.storage.from('case-pdfs').list(caseId)).data || []).map((o) => `${caseId}/${o.name}`); if (names.length) await admin.storage.from('case-pdfs').remove(names); } catch { /* ข้าม */ }
  try { await admin.from('cases').delete().eq('id', caseId); } catch { /* ข้าม */ }
  if (userId) try { await admin.auth.admin.deleteUser(userId); } catch { /* ข้าม */ }
}
process.exit(0);
