// ตัวช่วยทดสอบหน้าเว็บจริงด้วย Edge (Chrome DevTools Protocol) — ใช้: node test/cdp.mjs <url> <script.js> <out.png>
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const [url, scriptFile, outPng] = process.argv.slice(2);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(edge, [`--remote-debugging-port=${port}`, '--headless=new', '--disable-gpu', '--window-size=1280,1000', '--user-data-dir=' + process.env.TEMP + '\\cdp-' + port, '--force-prefers-no-reduced-motion', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch { /* รอเบราว์เซอร์เปิด */ } await sleep(200); }
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
  if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url });
await sleep(3500);
const src = fs.readFileSync(scriptFile, 'utf8');
const res = await send('Runtime.evaluate', { expression: `(async()=>{${src}})()`, awaitPromise: true, returnByValue: true });
console.log('RESULT:', JSON.stringify(res.result?.result?.value ?? res.result?.exceptionDetails?.exception?.description ?? res.result));
await sleep(1200);
if (outPng) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPng, Buffer.from(shot.result.data, 'base64'));
}
if (logs.length) console.log('CONSOLE:', logs.slice(0, 10).join(' | '));
ws.close(); proc.kill();
