import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocuments } from '../shared/docs.js';
import { renderDocx } from './render-docx.js';
import { caseTitle } from '../shared/model.js';
import { loadData, loadArticles, DATA_DIR } from './load-data.js';
import { packArticles } from './articles-pack.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CASES_DIR = path.join(ROOT, 'cases');
fs.mkdirSync(CASES_DIR, { recursive: true });

let cache = null;
const getData = (reload) => (cache && !reload ? cache : (cache = loadData()));

const app = express();
app.use(express.json({ limit: '5mb' }));

// หลังบ้าน (/admin และ API ที่มีข้อมูลคู่ความ) — ตั้ง ADMIN_PASSWORD เพื่อบังคับล็อกอิน (HTTP Basic)
// ไม่ตั้งค่า = ใช้เฉพาะเครื่องตัวเอง (เซิร์ฟเวอร์ผูกกับ 127.0.0.1)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
function adminAuth(req, res, next) {
  if (!ADMIN_PASSWORD) return next();
  const [scheme, cred] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && cred) {
    const [u, ...rest] = Buffer.from(cred, 'base64').toString('utf8').split(':');
    if (u === ADMIN_USER && rest.join(':') === ADMIN_PASSWORD) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Back office", charset="UTF-8"').status(401).send('ต้องเข้าสู่ระบบ');
}
app.use(['/admin', '/api/cases', '/api/people', '/api/docx', '/api/formtext', '/api/layout', '/api/inquiries'], adminAuth);

// LOCAL_BACKEND=1 npm start → ใช้ไฟล์ในเครื่อง (cases/) แทน Supabase โดยไม่ต้องแก้ config.js (ใช้ทดสอบ/พัฒนา)
if (process.env.LOCAL_BACKEND) app.get('/js/config.js', (req, res) => res.type('js').send('export default { supabase: { url: "", anonKey: "" } };'));
app.use('/shared', express.static(path.join(ROOT, 'shared')));
app.use('/templates', express.static(path.join(ROOT, 'templates')));
app.use(express.static(path.join(ROOT, 'public')));

app.get('/api/data', (req, res) => res.json(getData('reload' in req.query)));
app.get('/api/jurisdiction', (req, res) => {
  const j = getData().jurisdiction;
  return j ? res.json(j) : res.status(404).json({ error: 'ยังไม่มีข้อมูลเขตอำนาจศาลรายอำเภอ' });
});
// ค่าการจัดหน้า (ขอบ/ตัวอักษร/ตำแหน่งตราครุฑ) — { all: {...}, forms: { complaint: {...} } }
app.put('/api/layout', (req, res) => {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const num = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k, v]) => /^[\w.]+$/.test(k) && Number.isFinite(+v)).map(([k, v]) => [k, +v]));
  const clean = { all: num(b.all), forms: Object.fromEntries(Object.entries(b.forms || {}).filter(([k]) => /^\w+$/.test(k)).map(([k, v]) => [k, num(v)])) };
  fs.writeFileSync(path.join(DATA_DIR, 'layout.json'), JSON.stringify(clean, null, 2), 'utf8');
  if (cache) cache.layout = clean;
  res.json({ ok: true });
});
// แก้ข้อความมาตรฐานของแบบฟอร์ม (เก็บเฉพาะคีย์ที่ต่างจากค่าเริ่มต้น)
app.put('/api/formtext', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const clean = {};
  for (const [k, v] of Object.entries(body)) if (/^[\w.]+$/.test(k) && typeof v === 'string') clean[k] = v;
  fs.writeFileSync(path.join(DATA_DIR, 'form-text.json'), JSON.stringify(clean, null, 2), 'utf8');
  if (cache) cache.formText = clean;
  res.json({ ok: true });
});
app.get('/api/geo', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(DATA_DIR, 'geo.json'), (err) => err && res.status(404).json({ provinces: [] }));
});

// ----- คดีที่บันทึกไว้ (ไฟล์ JSON ในโฟลเดอร์ cases/) -----
const safeId = (id) => String(id || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
const caseFile = (id) => path.join(CASES_DIR, `${safeId(id)}.json`);

app.get('/api/cases', (req, res) => {
  const list = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(CASES_DIR, f), 'utf8'));
      return { id: c.id, title: caseTitle(c), caseNoBlack: c.caseNoBlack || '', caseNoRed: c.caseNoRed || '', caseYear: c.caseYear || '', type: c.type, court: c.court, updatedAt: c.updatedAt };
    } catch { return null; }
  }).filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  res.json(list);
});
app.get('/api/cases/:id', (req, res) => {
  const f = caseFile(req.params.id);
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'ไม่พบคดี' });
  res.type('json').send(fs.readFileSync(f, 'utf8'));
});
app.put('/api/cases/:id', (req, res) => {
  const id = safeId(req.params.id);
  if (!id || req.body?.id !== id) return res.status(400).json({ error: 'รหัสคดีไม่ตรงกัน' });
  const c = { ...req.body, updatedAt: new Date().toISOString() };
  fs.writeFileSync(caseFile(id), JSON.stringify(c, null, 2), 'utf8');
  res.json({ ok: true, updatedAt: c.updatedAt });
});
app.delete('/api/cases/:id', (req, res) => {
  const f = caseFile(req.params.id);
  if (fs.existsSync(f)) fs.unlinkSync(f);
  res.json({ ok: true });
});

// ----- สมุดรายชื่อ (คู่ความ/ทนายความที่ใช้ซ้ำ) -----
const PEOPLE_FILE = path.join(ROOT, 'cases', '_people.json');
const readPeople = () => { try { return JSON.parse(fs.readFileSync(PEOPLE_FILE, 'utf8')); } catch { return []; } };
app.get('/api/people', (req, res) => res.json(readPeople()));
app.put('/api/people/:id', (req, res) => {
  const id = safeId(req.params.id);
  const list = readPeople().filter((p) => p.id !== id);
  list.push({ ...req.body, id });
  fs.writeFileSync(PEOPLE_FILE, JSON.stringify(list, null, 2), 'utf8');
  res.json({ ok: true });
});
app.delete('/api/people/:id', (req, res) => {
  const id = safeId(req.params.id);
  fs.writeFileSync(PEOPLE_FILE, JSON.stringify(readPeople().filter((p) => p.id !== id), null, 2), 'utf8');
  res.json({ ok: true });
});

// ----- บทความ (สาธารณะ) -----
let articleCache = null;
const getArticles = () => (articleCache ||= loadArticles());
app.get('/api/articles', (req, res) => {
  if ('reload' in req.query) articleCache = null;
  res.json(getArticles().map(({ slug, title, subtitle, category, tags, readMinutes, updated, summary }) => ({ slug, title, subtitle, category, tags, readMinutes, updated, summary })));
});
app.get('/api/articles/:slug', (req, res) => {
  const a = getArticles().find((x) => x.slug === req.params.slug);
  return a ? res.json(a) : res.status(404).json({ error: 'ไม่พบบทความ' });
});

// ข้อมูลเว็บไซต์ที่แอดมินแก้ได้ (ช่องทางติดต่อ ฯลฯ) — โหมดไฟล์ในเครื่อง: อ่านสาธารณะ เขียนต้องเป็นแอดมิน
const SITE_FILE = path.join(DATA_DIR, 'site.json');
// เนื้อหาที่แอดมินจัดการ (บทความ/ข้อกฎหมายที่แก้/หน้าข้อความ) เก็บเป็นไฟล์ data/content/<key>.json (เหมือนแถว content-<key> ใน law_data)
const CONTENT_DIR = path.join(DATA_DIR, 'content');
const contentKey = (k) => (/^[a-z][a-z0-9-]{0,30}$/.test(k) ? k : null);
app.get('/api/content/:key', (req, res) => { const k = contentKey(req.params.key); if (!k) return res.status(400).json({ error: 'key' }); try { res.json(JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, k + '.json'), 'utf8'))); } catch { res.json({}); } });
app.put('/api/content/:key', adminAuth, (req, res) => { const k = contentKey(req.params.key); if (!k) return res.status(400).json({ error: 'key' }); fs.mkdirSync(CONTENT_DIR, { recursive: true }); fs.writeFileSync(path.join(CONTENT_DIR, k + '.json'), JSON.stringify(req.body && typeof req.body === 'object' ? req.body : {}, null, 2), 'utf8'); res.json({ ok: true }); });
app.get('/api/site', (req, res) => { try { res.json(JSON.parse(fs.readFileSync(SITE_FILE, 'utf8'))); } catch { res.json({}); } });
app.put('/api/site', adminAuth, (req, res) => { fs.writeFileSync(SITE_FILE, JSON.stringify(req.body && typeof req.body === 'object' ? req.body : {}, null, 2), 'utf8'); res.json({ ok: true }); });

// ไฟล์ข้อมูลบทความที่หน้าเว็บอ่าน (ตรงกับ dist/articles-data/ ของเว็บสถิต)
app.get('/articles-data/:file', (req, res) => {
  const pack = packArticles();
  const f = req.params.file;
  if (f === 'index.json') return res.json(pack.index);
  const a = pack.articles[f.replace(/\.json$/, '')];
  return a ? res.json(a) : res.status(404).json({ error: 'ไม่พบบทความ' });
});

// ----- ข้อความปรึกษาคดีจากหน้าเว็บ (สาธารณะ: ส่งได้อย่างเดียว) -----
const INQ_FILE = path.join(CASES_DIR, '_inquiries.json');
const readInq = () => { try { return JSON.parse(fs.readFileSync(INQ_FILE, 'utf8')); } catch { return []; } };
const writeInq = (l) => fs.writeFileSync(INQ_FILE, JSON.stringify(l, null, 2), 'utf8');
const inqHits = new Map(); // ip → เวลาที่ส่งล่าสุด (จำกัด 5 ครั้ง/ชั่วโมง)
app.post('/api/inquiry', (req, res) => {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  if (b.website) return res.json({ ok: true });                         // honeypot: บอทกรอกช่องที่ซ่อนไว้ — ทำเป็นสำเร็จแต่ไม่เก็บ
  const rec = { name: str(b.name, 120), contact: str(b.contact, 200), topic: str(b.topic, 80), message: str(b.message, 4000) };
  if (rec.name.length < 2) return res.status(400).json({ error: 'กรุณากรอกชื่อ' });
  if (rec.contact.length < 5) return res.status(400).json({ error: 'กรุณากรอกช่องทางติดต่อกลับ (เบอร์โทร / LINE / อีเมล)' });
  if (rec.message.length < 10) return res.status(400).json({ error: 'กรุณาเล่าเรื่องโดยย่ออย่างน้อย 10 ตัวอักษร' });
  if (b.consent !== true) return res.status(400).json({ error: 'กรุณายินยอมให้เก็บและใช้ข้อมูลเพื่อติดต่อกลับ' });
  const ip = req.ip || 'x', now = Date.now();
  const hits = (inqHits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (hits.length >= 5) return res.status(429).json({ error: 'ส่งข้อความบ่อยเกินไป กรุณาลองใหม่ภายหลัง' });
  inqHits.set(ip, [...hits, now]);
  const list = readInq();
  list.unshift({ id: Math.random().toString(36).slice(2, 10), createdAt: new Date().toISOString(), status: 'new', consent: true, ...rec });
  writeInq(list.slice(0, 2000));
  res.json({ ok: true });
});
app.get('/api/inquiries', (req, res) => res.json(readInq()));
app.patch('/api/inquiries/:id', (req, res) => {
  const list = readInq(), it = list.find((x) => x.id === req.params.id);
  if (!it) return res.status(404).json({ error: 'ไม่พบข้อความ' });
  if (['new', 'handled'].includes(req.body?.status)) it.status = req.body.status;
  writeInq(list); res.json({ ok: true });
});
app.delete('/api/inquiries/:id', (req, res) => { writeInq(readInq().filter((x) => x.id !== req.params.id)); res.json({ ok: true }); });

// ----- ออกไฟล์ Word -----
app.post('/api/docx', async (req, res) => {
  try {
    const { case: c, only, docId } = req.body || {};
    if (!c) return res.status(400).json({ error: 'ไม่มีข้อมูลคดี' });
    let docs = buildDocuments(c, getData(), only);
    if (docId) docs = docs.filter((d) => d.id === docId);
    if (!docs.length) return res.status(400).json({ error: 'ไม่มีเอกสารที่เลือก' });
    const buf = await renderDocx(docs, c.title || caseTitle(c), getData().layout);
    const name = docId ? docs[0].title : 'ชุดเอกสารยื่นศาล';
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}.docx`,
    });
    res.send(Buffer.from(buf));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
// HOST=0.0.0.0 เพื่อให้เครื่องอื่นในเครือข่ายเข้าได้ (ควรตั้ง ADMIN_PASSWORD คู่กันเสมอ)
const HOST = process.env.HOST || '127.0.0.1';
if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !ADMIN_PASSWORD) {
  console.warn('คำเตือน: เปิดให้เครื่องอื่นเข้าได้ แต่ยังไม่ได้ตั้ง ADMIN_PASSWORD — หลังบ้านจะไม่มีรหัสผ่าน!');
}
const server = app.listen(PORT, HOST, () => {
  const d = getData();
  console.log(`ระบบสร้างเอกสารยื่นศาล พร้อมใช้งานที่ http://localhost:${PORT}  (ข้อหา/มูลคดี ${d.items.length} รายการ)`);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`พอร์ต ${PORT} ถูกใช้อยู่ — ปิดโปรแกรมเดิมก่อน หรือรันด้วย PORT=3001`);
  else console.error(e);
  process.exit(1);
});

