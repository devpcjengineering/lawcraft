// ทดสอบ “ตารางบัญชีพยานไม่ขาด”: แผ่นที่จบกลางตารางต้องมีเส้นปิดท้ายใต้แถวสุดท้ายเต็มความหนา (อยู่ในหน้าต่างตัด .flow-clip) ที่ทุกระดับซูมของพรีวิว
// ใช้ Edge จริง + เซิร์ฟเวอร์ในเครื่อง (ข้ามถ้าไม่มี Edge หรือตั้ง TABLECUT_NO_BROWSER=1)   ใช้: node test/tablecut.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
if (process.env.TABLECUT_NO_BROWSER || !edge) { console.log('ข้าม (ไม่มี Edge/Chrome หรือตั้ง TABLECUT_NO_BROWSER)'); process.exit(0); }

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await freePort(), cdpPort = await freePort();
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, LOCAL_BACKEND: '1', PORT: String(port) }, stdio: 'ignore' });
const browser = spawn(edge, [`--remote-debugging-port=${cdpPort}`, '--headless=new', '--disable-gpu', '--user-data-dir=' + path.join(process.env.TEMP || '.', 'tablecut-' + cdpPort), 'about:blank'], { stdio: 'ignore' });
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/css/doc.css` });
  await sleep(1000);

  const SCRIPT = `
const { newCase, newParty, newWitness } = await import('/shared/model.js');
const { buildDocuments } = await import('/shared/docs.js');
const { docHtml } = await import('/js/render-html.js');
const { paginateHtml, documentFontsReady } = await import('/js/paginate.js');
const data = await (await fetch('/api/data')).json();
const c = newCase('criminal');
c.court = 'ศาลจังหวัดเชียงราย';
const mk = (role, f, l) => Object.assign(newParty(role), { prefix: 'นาย', first: f, last: l, idCard: '1101700230673' });
c.parties = [mk('plaintiff', 'สมมติ', 'ทดสอบ'), mk('defendant', 'จำเลย', 'ตัวอย่าง')];
c.witnesses = Array.from({ length: 12 }, (_, i) => {
  const w = newWitness(i % 3 === 2 ? 'document' : 'person');
  w.name = i % 3 === 2 ? 'สำเนาเอกสารหลักฐานสมมติ ' + (i + 1) : 'นายพยานสมมติ หมายเลข ' + (i + 1);
  if (i % 3 === 2) { w.holder = 'บริษัท ทดสอบการค้าระหว่างประเทศ จำกัด'; w.holderPos = 'ผู้จัดการ'; }
  w.addr = { no: '99/' + (i + 1), moo: '9', building: i % 2 ? 'อาคารสมมติทาวเวอร์เพลสเซ็นเตอร์พลาซ่า' : '', soi: 'ซอยสมมติ 1', road: 'ถนนสมมติ', sub: 'ตำบลสมมติ', district: 'อำเภอสมมติ', province: 'เชียงราย', zip: '57000' };
  return w;
});
const docs = buildDocuments(c, data, ['witness']);
await documentFontsReady();
const html = paginateHtml(docHtml(docs[0], data.layout));
document.open();
document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><base href="' + location.origin + '/"><link rel="stylesheet" href="css/doc.css"></head><body style="margin:0">' + html + '</body></html>');
document.close();
await new Promise((r) => setTimeout(r, 1200));
await document.fonts.ready;
const out = {};
for (const zm of [1, 0.9, 0.7, 0.5, 1.25]) {
  document.body.style.zoom = String(zm);
  await new Promise((r) => setTimeout(r, 150));
  out[zm] = [...document.querySelectorAll('section.sheet')].map((sh) => {
    const cr = sh.querySelector('.flow-clip').getBoundingClientRect(), tbl = sh.querySelector('table.tbl');
    const rows = tbl ? [...tbl.tBodies[0].rows] : [], last = rows[rows.length - 1];
    const lr = last?.getBoundingClientRect(), td = last?.cells[0];
    return { rows: rows.length, clipBottom: cr.bottom, rowBottom: lr?.bottom, tblBottom: tbl?.getBoundingClientRect().bottom, bStyle: td && getComputedStyle(td).borderBottomStyle, bW: td && parseFloat(getComputedStyle(td).borderBottomWidth), z: sh.getBoundingClientRect().width / 793.7 };
  });
}
return JSON.stringify(out);`;
  const ev = await send('Runtime.evaluate', { expression: `(async()=>{${SCRIPT}})()`, awaitPromise: true, returnByValue: true });
  const val = ev.result?.result?.value;
  assert.ok(val, 'สคริปต์ในหน้าล้มเหลว ' + JSON.stringify(ev.result?.exceptionDetails?.exception?.description || ev.result));
  const res = JSON.parse(val);
  for (const [zm, sheets] of Object.entries(res)) {
    assert.ok(sheets.length >= 3, `ซูม ${zm}: ต้องมีอย่างน้อย 3 แผ่น (ได้ ${sheets.length})`);
    sheets.forEach((s, i) => {
      const lastSheet = i === sheets.length - 1;
      if (lastSheet) return; // แผ่นสุดท้ายจบตารางจริง ใช้เส้นของตารางเอง
      assert.ok(s.rows > 0, `ซูม ${zm} แผ่น ${i + 1}: ต้องมีแถวตาราง`);
      assert.equal(s.bStyle, 'solid', `ซูม ${zm} แผ่น ${i + 1}: เส้นปิดท้ายต้องทึบเหมือนเส้นคั่นแถว`);
      // ขอบล่างของตาราง (รวมครึ่งเส้นที่ล้นกล่อง) ต้องอยู่ในหน้าต่างตัดเต็มความหนา และไม่ปล่อยช่องว่างเกิน 4px
      const w = s.bW * s.z;
      assert.ok(s.clipBottom >= s.tblBottom + w / 2 - 0.01, `ซูม ${zm} แผ่น ${i + 1}: เส้นปิดท้ายถูกหน้าต่างตัด (clip ${s.clipBottom.toFixed(2)} < table ${s.tblBottom.toFixed(2)} + ${(w / 2).toFixed(2)})`);
      assert.ok(s.clipBottom - s.tblBottom <= 4 * s.z + 0.01, `ซูม ${zm} แผ่น ${i + 1}: หน้าต่างต่อท้ายตารางเกินไป`);
    });
  }
  console.log('tablecut ผ่าน: แผ่นที่จบกลางตารางมีเส้นปิดท้ายครบที่ซูม', Object.keys(res).join(' / '));
  ws.close();
} finally { cleanup(); }
process.exit(0);
