// ทดสอบ “ด้านหน้าห้ามล้นไปแผ่นที่สอง” ของหมายเรียกพยาน (แบบ ๑๖/๑๗/๑๘) และหมายนัดไต่สวนมูลฟ้อง (ข้อมูลสมมติทั้งหมด)
//  ส่วน A (Node ล้วน)   : ถ้อยคำด้านหน้า/ด้านหลังของแบบ ๑๗/๑๘ · ธง fitFront · ตัวห่อ .fitseg · Word (ย่อขนาดตัวอักษรส่วนหน้าเมื่อข้อมูลยาว)
//  ส่วน B (เบราว์เซอร์) : ถ้ามี Edge + เซิร์ฟเวอร์ในเครื่อง → แบ่งหน้าจริง (js/paginate.js) ทุกกรณี สั้น/ปกติ/ยาว/ยาวสุดขีด:
//                         ส่วนหน้าอยู่แผ่นเดียว · แผ่นหลังตามมา · PDF จริง (@media print) จำนวนหน้า = จำนวนแผ่น · ไม่มีบรรทัดถูกตัด/ล้นขอบ/ซ้อนทับ ที่ซูม 1 / 0.9 / 0.7
//                         ข้อมูลสั้น (พอดีอยู่แล้ว) ต้องไม่ถูกย่อ และผลลัพธ์เหมือนเดิมทุกไบต์   ข้าม: FRONTFIT_NO_BROWSER=1
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { newCase, newParty, newWitness } from '../shared/model.js';
import { buildDocuments } from '../shared/docs.js';
import { defaultFormText } from '../shared/formtext.js';
import { renderDocx, fitFactor } from '../server/render-docx.js';
import { makeCase, CASE_MATRIX } from './frontfit-case.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const layout = JSON.parse(fs.readFileSync(path.join(root, 'data', 'layout.json'), 'utf8'));
const data = { laws: [], items: [], formText: {}, courtPhones: {} };
const M = { newCase, newParty, newWitness };
const only = (cs) => (cs.form === 'summons' ? ['summons'] : ['witnessSummons']);
const docsOf = (cs) => buildDocuments(makeCase(M, cs), data, only(cs));
const plain = (b) => (b.runs ? b.runs.map((r) => r.text || '').join('') : b.text || '');
const REF = 'รายละเอียดปรากฏตามท้ายคำสั่งนี้';

// ---------- A1) ถ้อยคำแบบ ๑๗ (อาญา) / ๑๘ (แพ่ง) ----------
for (const type of ['criminal', 'civil']) {
  const [d] = docsOf({ type, form: 'item', level: 'typical' });
  const i = d.blocks.findIndex((b) => b.t === 'pagebreak');
  assert.ok(i > 0 && d.fitFront === true, `${type}: ต้องมี pagebreak และ fitFront`);
  const front = d.blocks.slice(0, i), back = d.blocks.slice(i + 1);
  const ft = front.map(plain).join('\n');
  assert.equal((ft.match(new RegExp(REF, 'g')) || []).length, 2, `${type}: ด้านหน้าต้องมี “${REF}” 2 แห่ง (ข้อความอ้าง + ข้อความให้ส่ง)`);
  assert.match(ft, new RegExp(`อ้าง ${REF} ซึ่งมีอยู่ที่ท่านเป็นพยาน`));
  assert.match(ft, new RegExp(`ให้ท่านจัดการส่ง ${REF} ไปยังศาล .+ก่อน`), `${type}: ข้อความให้ส่ง`);
  assert.ok(!/ดังกล่าวแล้ว|ปรากฏตามด้านหลัง/.test(ft) && !/\*/.test(ft), `${type}: ต้องไม่มี “ดังกล่าวแล้ว” / หมายเหตุ * ด้านหลัง`);
  const flip = front.find((b) => b.t === 'flip');
  assert.ok(flip && !flip.note, `${type}: (พลิก) ไม่มีหมายเหตุ`);
  assert.match(ft, /ด้วย โจทก์ โดย .+ ทนายความ โจทก์ อ้าง/, `${type}: ด้วย โจทก์ โดย … ทนายความ …`);
  assert.match(ft, /ตามรายละเอียดท้าย(หมาย|คำสั่ง)นี้/, `${type}: ใบรับ`);
  // ด้านหลัง: คำเตือน (ขีดเส้นใต้ ตัวหนา กลาง) → คำเตือน → หัวข้อรายละเอียด → รายการ (๑)… → เส้นประ
  assert.deepEqual([back[0].t, back[0].text, back[0].u, back[0].b], ['center', 'คำเตือน', true, true]);
  const head = back.find((b) => b.t === 'center' && /รายละเอียดที่ต้องจัดส่ง/.test(b.text));
  assert.equal(head.text, `รายละเอียดที่ต้องจัดส่งพยานหลักฐานตาม${type === 'civil' ? 'คำสั่งเรียก' : 'หมายเรียก'}ฉบับนี้`);
  assert.ok(head.u && head.b);
  const items = back.filter((b) => b.t === 'p' && /^\(๑\)|^\(๒\)/.test(plain(b)));
  assert.equal(items.length, 2, `${type}: รายการ (๑) (๒)`);
  assert.ok(back.some((b) => b.t === 'lines'));
  assert.ok(back.indexOf(head) < back.indexOf(items[0]), 'หัวข้อรายละเอียดมาก่อนรายการ');
}
assert.ok(!/ดังกล่าวแล้ว/.test(defaultFormText('wsum.item.deliver.criminal') + defaultFormText('wsum.item.deliver.civil')), 'แม่แบบ deliver ไม่มี “ดังกล่าวแล้ว”');
// แบบ ๑๖ และหมายนัดไต่สวนมูลฟ้อง: ธง fitFront
assert.equal(docsOf({ type: 'criminal', form: 'person', level: 'typical' })[0].fitFront, true);
assert.equal(docsOf({ type: 'criminal', form: 'summons', level: 'typical' })[0].fitFront, true);
assert.equal(docsOf({ type: 'criminal', form: 'summons', level: 'long' }).length, 3, 'จำเลย 3 คน = หมายนัด 3 ฉบับ');

// ---------- A2) Word: ส่วนหน้าที่ยาวถูกย่อขนาดตัวอักษร ส่วนหลังขนาดปกติ ----------
let JSZip = null;
try { JSZip = (await import('jszip')).default; } catch { console.log('(ข้ามตรวจ XML ของ docx: ไม่มี jszip)'); }
const sizesOf = (xml) => [...xml.matchAll(/<w:sz w:val="(\d+)"/g)].map((m) => +m[1]);
const wordK = {};
for (const cs of CASE_MATRIX) {
  const name = `${cs.type}-${cs.form}-${cs.level}`;
  const docs = docsOf(cs);
  const buf = await renderDocx(docs, name, layout);
  assert.ok(buf.length > 5000, `${name}: docx`);
  const d = docs[0];
  const n = d.blocks.findIndex((b) => b.t === 'pagebreak');
  const k = fitFactor(n > 0 ? d.blocks.slice(0, n) : d.blocks, layout, d.id);
  wordK[name] = k;
  assert.ok(k <= 1 && k >= 0.5, `${name}: k ของ Word ${k}`);
  if (JSZip) {
    const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
    if (n > 0) {
      const cut = xml.indexOf('w:type="page"');
      assert.ok(cut > 0, `${name}: ต้องมีตัวแบ่งหน้า`);
      const front = sizesOf(xml.slice(0, cut)), back = sizesOf(xml.slice(cut));
      if (k < 1) assert.ok(Math.max(...front) <= Math.round(32 * k) + 9 && Math.min(...front) < 32, `${name}: ขนาดอักษรส่วนหน้าต้องถูกย่อ (k=${k})`);
      assert.ok(back.includes(32) && Math.max(...back) <= 32, `${name}: ส่วนหลังต้องขนาดปกติ`);
    }
  }
}
// ยาวขึ้นต้องย่อมากขึ้น (ไม่ลดลง) และข้อมูลสั้นมากไม่ถูกย่อ
for (const f of ['criminal-person', 'criminal-item']) assert.ok(wordK[`${f}-long`] <= wordK[`${f}-typical`] && wordK[`${f}-typical`] <= wordK[`${f}-short`], `${f}: k ต้องไม่เพิ่มเมื่อข้อมูลยาวขึ้น`);
{
  const tiny = { id: 'witnessSummons-x', fitFront: true, blocks: [{ t: 'center', text: 'หน้า' }, { t: 'pagebreak' }, { t: 'center', text: 'หลัง' }] };
  assert.equal(fitFactor(tiny.blocks.slice(0, 1), layout, tiny.id), 1);
  if (JSZip) {
    const xml = await (await JSZip.loadAsync(await renderDocx([tiny], 't', layout))).file('word/document.xml').async('string');
    assert.ok(sizesOf(xml).every((s) => s === 32 || s === 2), 'ข้อมูลสั้น: ขนาดอักษร Word ต้องไม่เปลี่ยน');
  }
}
console.log('Word k:', Object.entries(wordK).map(([n, k]) => `${n.replace('criminal-', 'อ.').replace('civil-', 'พ.')}=${k}`).join(' '));
console.log('ส่วน A ผ่าน (ถ้อยคำ · fitFront · Word)');

// ---------- B) เบราว์เซอร์ ----------
const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
if (process.env.FRONTFIT_NO_BROWSER || !edge) { console.log('ข้ามส่วน B (ไม่มี Edge/Chrome หรือตั้ง FRONTFIT_NO_BROWSER)'); process.exit(0); }

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await freePort(), cdpPort = await freePort();
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, LOCAL_BACKEND: '1', PORT: String(port) }, stdio: 'ignore' });
const browser = spawn(edge, [`--remote-debugging-port=${cdpPort}`, '--headless=new', '--disable-gpu', '--user-data-dir=' + path.join(process.env.TEMP || '.', 'frontfit-' + cdpPort), 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { server.kill(); } catch { /* ignore */ } try { browser.kill(); } catch { /* ignore */ } };
process.on('exit', cleanup);
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/css/doc.css`)).ok) break; } catch { /* รอเซิร์ฟเวอร์ */ } await sleep(250); }
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json(); if (targets.length) break; } catch { /* รอเบราว์เซอร์ */ } await sleep(250); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await sleep(3000);

  const PAGE_SCRIPT = (cs) => `
const MK = ${makeCase.toString()};
const cs = ${JSON.stringify(cs)};
const { newCase, newParty, newWitness } = await import('/shared/model.js');
const { buildDocuments } = await import('/shared/docs.js');
const { docHtml } = await import('/js/render-html.js');
const { paginateHtml, documentFontsReady } = await import('/js/paginate.js');
const data = await (await fetch('/api/data')).json();
const c = MK({ newCase, newParty, newWitness }, cs);
const docs = buildDocuments(c, data, cs.form === 'summons' ? ['summons'] : ['witnessSummons']);
await documentFontsReady();
const wrapped = docs.map((x) => docHtml(x, data.layout));
const htmls = wrapped.map((h) => paginateHtml(h));
// ข้อมูลที่พอดีอยู่แล้ว: ผลต้องเหมือนกับไม่ห่อ .fitseg ทุกไบต์ (เท่ากับพฤติกรรมเดิม)
const identical = wrapped.map((h, i) => (htmls[i].includes('fitseg') ? null : paginateHtml(h.replace('<div class="fitseg">', '').replace(new RegExp('</div>(<div class="pb">|</section>)'), '$1')) === htmls[i]));
const full = '<!doctype html><html lang="th"><head><meta charset="utf-8"><base href="' + location.origin + '/"><link rel="stylesheet" href="css/doc.css"><style>html{background:#d9d9de}body{margin:0;padding:14px 0 28px}@media print{html{background:#fff}body{padding:0;zoom:1!important}}</style></head><body>' + htmls.join('') + '</body></html>';
document.open(); document.write(full); document.close();
await new Promise((r) => setTimeout(r, 1200));
await document.fonts.ready;
const MM = 96 / 25.4;
function audit() {
  const out = [];
  document.querySelectorAll('section.sheet').forEach((sh, si) => {
    const clip = sh.querySelector('.flow-clip'), cr = clip.getBoundingClientRect(), sr = sh.getBoundingClientRect();
    const z = sr.width / (210 * MM), tol = 1.5 * z, rects = [];
    const wk = document.createTreeWalker(clip, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = wk.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const q of r.getClientRects()) if (q.width > 0 && q.height > 0) rects.push({ t: q.top, b: q.bottom, l: q.left, r: q.right, txt: n.nodeValue.trim().slice(0, 14) });
    }
    const issues = [], inWin = rects.filter((q) => (q.t + q.b) / 2 >= cr.top && (q.t + q.b) / 2 <= cr.bottom);
    for (const q of rects) if ((q.t < cr.top - tol && q.b > cr.top + tol) || (q.t < cr.bottom - tol && q.b > cr.bottom + tol)) issues.push('CLIP ' + q.txt);
    for (const q of inWin) {
      if (q.r > sr.right - 18 * MM * z + 3 * z) issues.push('RIGHT ' + q.txt);
      if (q.l < sr.left + 25 * MM * z - 3 * z) issues.push('LEFT ' + q.txt);
    }
    for (let i = 0; i < inWin.length; i++) for (let j = i + 1; j < inWin.length; j++) {
      const a = inWin[i], b = inWin[j], hmin = Math.min(a.b - a.t, b.b - b.t);
      if (Math.abs((a.t + a.b) / 2 - (b.t + b.b) / 2) < 0.5 * hmin) continue;
      if (Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.45 * hmin && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 2 * z) issues.push('OVERLAP ' + a.txt + '|' + b.txt);
    }
    const fs = sh.querySelector('.fitseg');
    if (fs) { const ib = fs.firstElementChild.getBoundingClientRect().bottom; if (ib > fs.getBoundingClientRect().bottom + tol) issues.push('INNEROVER'); if (ib > cr.bottom + tol) issues.push('INNERBEYONDWINDOW'); }
    const txt = inWin.sort((a, b) => a.t - b.t || a.l - b.l).map((q) => q.txt);
    out.push({ doc: sh.dataset.doc, k: fs ? +fs.dataset.k : null, tight: fs ? fs.dataset.tight === '1' : null, first: txt[0] || '', joined: txt.join(' '), issues });
  });
  return out;
}
const zooms = {};
for (const zm of [1, 0.9, 0.7]) { document.body.style.zoom = String(zm); await new Promise((r) => setTimeout(r, 120)); zooms[zm] = audit(); }
document.body.style.zoom = '';
await new Promise((r) => setTimeout(r, 150));
return JSON.stringify({ nDocs: docs.length, nSheets: document.querySelectorAll('.sheet').length, identical, zooms });`;

  const cases = [...CASE_MATRIX, { type: 'criminal', form: 'item', level: 'long', items: 30 }];
  const rows = [];
  for (const cs of cases) {
    const name = `${cs.type}-${cs.form}-${cs.level}${cs.items ? '-' + cs.items + 'items' : ''}`;
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/css/doc.css` }); // หน้าว่างใหม่ทุกกรณี (สคริปต์เขียนทับเอกสาร และตัววัดของ paginate.js ผูกกับเอกสารเดิม)
    await sleep(700);
    const ev = await send('Runtime.evaluate', { expression: `(async()=>{${PAGE_SCRIPT(cs)}})()`, awaitPromise: true, returnByValue: true });
    const val = ev.result?.result?.value;
    assert.ok(val, `${name}: สคริปต์ในหน้าล้มเหลว ${JSON.stringify(ev.result?.exceptionDetails?.exception?.description || ev.result)}`);
    const r = JSON.parse(val);
    const z1 = r.zooms['1'];
    // ทุกเอกสาร: ส่วนหน้าแผ่นเดียว (witness: แผ่นแรกมีท้ายใบรับ แผ่นที่สองเริ่ม “คำเตือน”; หมายนัด: ทั้งฉบับแผ่นเดียวและมี “หมายเหตุ”)
    const byDoc = new Map();
    z1.forEach((s) => { (byDoc.get(s.doc) || byDoc.set(s.doc, []).get(s.doc)).push(s); });
    assert.equal(byDoc.size, r.nDocs, `${name}: จำนวนเอกสาร`);
    for (const [docId, sheets] of byDoc) {
      if (cs.form === 'summons') { assert.equal(sheets.length, 1, `${name}/${docId}: หมายนัดต้องแผ่นเดียว`); assert.match(sheets[0].joined, /หมายเหตุ/, `${name}: ต้องมีหมายเหตุท้ายหมายบนแผ่นเดียวกัน`); } else {
        assert.ok(sheets.length >= 2, `${name}: ต้องมีแผ่นหลัง`);
        assert.match(sheets[0].joined, /ผู้ส่ง(หมาย|คำสั่ง)/, `${name}: แผ่นแรกต้องมีลายมือชื่อท้ายใบรับ (ส่วนหน้าไม่ล้น)`);
        assert.ok(!/ผู้ส่ง(หมาย|คำสั่ง)/.test(sheets.slice(1).map((s) => s.joined).join(' ')), `${name}: ท้ายใบรับต้องไม่หลุดไปแผ่นหลัง`);
        assert.match(sheets[1].first, /^คำเตือน/, `${name}: แผ่นที่สองเริ่มด้วย “คำเตือน”`);
        assert.ok(sheets.slice(1).every((s) => s.k === null), `${name}: ย่อเฉพาะส่วนหน้า`);
      }
      const k = sheets[0].k;
      if (cs.level === 'short') assert.equal(k, null, `${name}: ข้อมูลสั้นต้องไม่ถูกย่อ (k=1)`);
      if (k !== null) assert.ok(k >= 0.6 && k < 1, `${name}: k=${k} ต้องอยู่ใน [0.6,1)`);
      if (cs.level === 'typical') assert.ok(k === null || k >= 0.9, `${name}: ข้อมูลปกติย่อได้ไม่เกิน ~10% (k=${k})`);
    }
    r.identical.forEach((v) => assert.notEqual(v, false, `${name}: ผลที่พอดีอยู่แล้วต้องเหมือนเดิมทุกไบต์`));
    for (const [zm, arr] of Object.entries(r.zooms)) arr.forEach((s, i) => assert.deepEqual(s.issues, [], `${name} ซูม ${zm} แผ่น ${i + 1}: ${s.issues.join(' ; ')}`));
    // พิมพ์ PDF จริง (@media print) → จำนวนหน้า = จำนวนแผ่น
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
    await send('Emulation.setEmulatedMedia', { media: '' });
    const pages = (Buffer.from(pdf.result.data, 'base64').toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.equal(pages, r.nSheets, `${name}: PDF ${pages} หน้า แต่แบ่งได้ ${r.nSheets} แผ่น`);
    const ks = z1.filter((s) => s.k !== null).map((s) => `${s.k}${s.tight ? 't' : ''}`);
    rows.push(`${name}: แผ่น ${r.nSheets} = PDF ${pages} · k ${ks.length ? [...new Set(ks)].join(',') : '1'}`);
  }
  rows.forEach((x) => console.log('  ' + x));
  ws.close();
  console.log('ส่วน B ผ่าน (แบ่งหน้าจริง + PDF)');
} finally { cleanup(); }
process.exit(0);
