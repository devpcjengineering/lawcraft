// สร้าง PDF ชุดเอกสารด้วย Chrome แบบไม่มีหน้าจอบนเซิร์ฟเวอร์ — ผลลัพธ์ไม่ขึ้นกับเครื่อง/เบราว์เซอร์ของผู้ใช้
// วิธี: เปิดหน้า /print/ ของเว็บเอง แล้วรันขั้นตอนเดียวกับหน้าตัวอย่างในหลังบ้าน (buildDocuments → docHtml → paginateHtml)
// ในหน้านั้น จากนั้นสั่ง Chrome พิมพ์เป็น PDF (ตัวอักษรเป็นเวกเตอร์ ฟอนต์ฝัง) → หน้าตาตรงกับตัวอย่างบน Chrome ทุกประการ
// ใช้ร่วมกันโดย api/pdf.js (Vercel) และ server/index.js (เครื่องในเครื่อง — ใช้ Edge/Chrome ที่ติดตั้งไว้)
import fs from 'node:fs';

const LOCAL_BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

async function launch() {
  const puppeteer = (await import('puppeteer-core')).default;
  const onVercel = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (onVercel || process.env.PDF_USE_SPARTICUZ === '1') {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({ args: [...chromium.args, '--font-render-hinting=none'], executablePath: await chromium.executablePath(), headless: true, defaultViewport: { width: 1000, height: 1400 } });
  }
  const exe = process.env.PDF_BROWSER || LOCAL_BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('ไม่พบ Chrome/Edge ในเครื่องสำหรับสร้าง PDF (ตั้ง PDF_BROWSER=<พาธ>)');
  return puppeteer.launch({ executablePath: exe, headless: true, args: ['--headless=new', '--disable-gpu', '--font-render-hinting=none', '--no-first-run', '--no-default-browser-check'], defaultViewport: { width: 1000, height: 1400 } });
}

// รันในหน้า /print/ (ในเบราว์เซอร์): ประกอบเอกสารจากข้อมูลคดีด้วยโมดูลเดียวกับหลังบ้าน แล้ววางแผ่น A4 ลงหน้า
const PAGE_SCRIPT = `async (c, title) => {
  const { buildDocuments } = await import('/shared/docs.js');
  const { docHtml } = await import('/js/render-html.js');
  const { paginateHtml, documentFontsReady } = await import('/js/paginate.js');
  const { loadLawData } = await import('/js/public-data.js');
  const data = await loadLawData();
  const docs = buildDocuments(c, data);
  if (!docs.length) throw new Error('ไม่มีเอกสารในชุด');
  await Promise.all([document.fonts.load('16px THSarabunIT9', 'ก'), document.fonts.load('bold 16px THSarabunIT9', 'ก')]).catch(() => {});
  await documentFontsReady();
  document.title = title || 'ชุดเอกสาร';
  document.body.innerHTML = docs.map((d) => paginateHtml(docHtml(d, data.layout))).join('');
  await document.fonts.ready;
  await Promise.all([...document.images].map((im) => (im.decode ? im.decode().catch(() => {}) : null)));
  return { sheets: document.querySelectorAll('section.sheet').length, docs: docs.map((d) => d.id) };
}`;

/**
 * สร้าง PDF ของคดี
 * @param {{ origin: string, caseData: object, title?: string, timeoutMs?: number }} o origin = ที่อยู่เว็บที่มีหน้า /print/ และโมดูล (เช่น https://www.law-craft.co)
 * @returns {Promise<{ pdf: Buffer, sheets: number, docs: string[], ms: number }>}
 */
export async function renderCasePdf({ origin, caseData, title = '', timeoutMs = 50000 }) {
  const t0 = Date.now();
  const browser = await launch();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    const res = await page.goto(`${origin.replace(/\/$/, '')}/print/`, { waitUntil: 'networkidle0' });
    if (!res || !res.ok()) throw new Error(`เปิดหน้า /print/ ไม่ได้ (${res ? res.status() : 'no response'})`);
    // ส่งสคริปต์เป็นนิพจน์เรียกฟังก์ชัน (สตริงใน page.evaluate ถูกประเมินเป็นนิพจน์ ไม่ใช่ฟังก์ชันรับอาร์กิวเมนต์)
    const info = await page.evaluate(`(${PAGE_SCRIPT})(${JSON.stringify(caseData)}, ${JSON.stringify(String(title))})`);
    if (!info || !(info.sheets > 0)) throw new Error('ประกอบเอกสารในหน้า /print/ ไม่สำเร็จ');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); // ให้จัดหน้าเสร็จก่อนพิมพ์
    const pdf = Buffer.from(await page.pdf({ width: '210mm', height: '297mm', margin: { top: 0, right: 0, bottom: 0, left: 0 }, printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, timeout: timeoutMs }));
    if (errors.length) console.warn('pdf-render: page errors', errors.slice(0, 3));
    return { pdf, sheets: info.sheets, docs: info.docs, ms: Date.now() - t0 };
  } finally {
    await browser.close().catch(() => {});
  }
}

/** ตรวจว่า Chrome บนเซิร์ฟเวอร์ใช้งานได้ (พิมพ์หน้าเล็ก ๆ หนึ่งหน้า) */
export async function pdfHealth() {
  const t0 = Date.now();
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html lang="th"><body style="font:16px sans-serif">ทดสอบ Chrome</body></html>');
    const pdf = await page.pdf({ format: 'A4' });
    return { ok: pdf.length > 1000, bytes: pdf.length, ms: Date.now() - t0, version: await browser.version() };
  } finally { await browser.close().catch(() => {}); }
}
