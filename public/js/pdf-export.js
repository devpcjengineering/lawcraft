// ส่งออกเอกสารเป็นไฟล์ PDF แบบเวกเตอร์ (ตัวอักษรยังเป็นตัวอักษร เลือก/ค้น/ขยายได้ ไม่ใช่ภาพถ่ายหน้าจอ) ในเบราว์เซอร์ล้วน ๆ
// วิธีทำ: เอา HTML ที่ js/paginate.js แบ่งเป็นแผ่น A4 แล้ว (<section class="page sheet">) ไปวางใน iframe ที่ซ่อนอยู่ (มีเฉพาะ css/doc.css, ไม่ซูม)
// → เดินต้นไม้ DOM ของแต่ละแผ่น อ่านตำแหน่งจริงที่เบราว์เซอร์จัดวางไว้ (Range/getBoundingClientRect) แล้ววาดซ้ำลงหน้า PDF ด้วย PDFKit
//   · ตัวอักษร: แยกเป็นคำ (ตัดที่ช่องว่าง) วางที่ตำแหน่งซ้ายของคำนั้นตามที่เบราว์เซอร์วาง → ข้อความจัดชิดสองข้าง/ขึ้นบรรทัดใหม่ตรงกับพรีวิวทุกบรรทัด
//     คำไทยที่ถูกเบราว์เซอร์ตัดขึ้นบรรทัดใหม่กลางคำ (ไม่มีช่องว่าง) แยกตามกลุ่มอักขระ (grapheme) แล้ววางทีละบรรทัด
//     PDFKit (fontkit) จัดรูปสระ/วรรณยุกต์ไทยด้วย GSUB/GPOS เหมือนเบราว์เซอร์ + ฝังฟอนต์แบบ subset (เฉพาะอักษรที่ใช้)
//   · เส้นขอบ (ทึบ/จุด/ประ) เส้นใต้/เส้นขีดฆ่า วงกลม ปีกกา (SVG path) และตราครุฑ (ฝังภาพครั้งเดียวใช้ซ้ำทุกจุด)
//   · พื้นหลัง (ไฮไลต์ .ph สีเหลือง) ไม่วาด เหมือนตอนพิมพ์
// ไม่มีผลข้างเคียงตอน import: PDFKit (ไฟล์ UMD ขนาดใหญ่) โหลดจาก CDN เมื่อเรียก buildPdf ครั้งแรกเท่านั้น
const PDFKIT_URL = 'https://cdn.jsdelivr.net/npm/pdfkit@0.15.2/js/pdfkit.standalone.js';
const FONT_URLS = { regular: '/THSarabunIT9.ttf', bold: '/THSarabunIT9-Bold.ttf' };
const PT = 0.75; // 1 css px = 0.75 pt
const PAGE_W = 595.28, PAGE_H = 841.89; // A4 (pt)
const JUSTIFY_TOL = 0.6; // px: คำที่กว้างกว่าความกว้างธรรมชาติเกินนี้ = ถูกขยายช่องไฟจากการจัดชิดสองข้าง
const EMBLEM_SCALE = 3.5; // ความละเอียดภาพตราครุฑ = 3.5 เท่าของขนาดที่แสดง (~340 dpi; ภาพลายเส้นละเอียด) — ไม่เกินขนาดต้นฉบับ

let pdfkitPromise = null, fontsPromise = null;

function loadPdfKit() {
  if (globalThis.PDFDocument) return Promise.resolve(globalThis.PDFDocument);
  if (!pdfkitPromise) {
    pdfkitPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFKIT_URL;
      s.async = true;
      s.onload = () => (globalThis.PDFDocument ? resolve(globalThis.PDFDocument) : reject(new Error('PDFKit โหลดแล้วแต่ไม่พบ PDFDocument')));
      s.onerror = () => { pdfkitPromise = null; s.remove(); reject(new Error('โหลดตัวสร้าง PDF ไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต)')); };
      document.head.appendChild(s);
    });
  }
  return pdfkitPromise;
}

function loadFonts() {
  if (!fontsPromise) {
    const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`โหลดฟอนต์ ${u} ไม่สำเร็จ`); return r.arrayBuffer(); };
    fontsPromise = Promise.all([get(FONT_URLS.regular), get(FONT_URLS.bold)]).then(([regular, bold]) => ({ regular, bold }), (e) => { fontsPromise = null; throw e; });
  }
  return fontsPromise;
}

// ---------- iframe สำหรับวัด (มีเฉพาะ css/doc.css, ไม่ซูม) ----------
async function openMeasureFrame(sheetsHtml) {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;
  f.style.cssText = 'position:absolute;left:-10000px;top:0;width:900px;height:1200px;border:0;visibility:hidden;pointer-events:none;';
  f.srcdoc = `<!doctype html><html lang="th"><head><meta charset="utf-8"><base href="${location.origin}/"><link rel="stylesheet" href="css/doc.css"></head><body style="margin:0;zoom:1"></body></html>`;
  await new Promise((resolve) => { f.onload = resolve; document.body.appendChild(f); });
  const d = f.contentDocument;
  d.body.insertAdjacentHTML('beforeend', sheetsHtml);
  try { await Promise.all([d.fonts.load('16px THSarabunIT9', 'ก'), d.fonts.load('bold 16px THSarabunIT9', 'ก')]); await d.fonts.ready; } catch { /* ใช้ฟอนต์สำรอง (ตำแหน่งยังตรง แต่รูปอักษรอาจต่าง) */ }
  await Promise.all([...d.images].map((im) => (im.decode ? im.decode().catch(() => {}) : null)));
  return { frame: f, doc: d };
}

/** ระยะจากขอบบนกล่องตัวอักษร (Range rect) ถึงเส้นฐาน (px) ที่ขนาดจริง — วัดด้วยตัวตรวจขนาด 0 ที่วางข้างตัวอักษร (Chrome ปัดค่า ascent เป็นจำนวนเต็มตามขนาดตัวอักษรที่ใช้จริง จึงต้องวัดที่ขนาดนั้น ๆ) */
function makeAscentProbe(d) {
  const box = d.createElement('div');
  box.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;line-height:normal;font-family:THSarabunIT9';
  box.innerHTML = 'ก<span style="display:inline-block;width:0;height:0"></span>';
  d.body.appendChild(box);
  const range = d.createRange();
  const cache = new Map();
  const get = (bold, px) => {
    const key = `${bold ? 1 : 0}|${px.toFixed(3)}`;
    let v = cache.get(key);
    if (v === undefined) {
      box.style.fontWeight = bold ? '700' : '400';
      box.style.fontSize = `${px}px`;
      range.selectNodeContents(box.firstChild);
      const q = range.getClientRects()[0];
      v = box.lastChild.getBoundingClientRect().bottom - (q ? q.top : 0);
      cache.set(key, v);
    }
    return v;
  };
  get.dispose = () => box.remove();
  return get;
}

// ---------- ตัวช่วยสี/เส้น ----------
function parseColor(css) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/.exec(css || '');
  if (!m) return [0, 0, 0];
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return a === 0 ? null : [+m[1], +m[2], +m[3]];
}
const STYLE_RANK = { double: 6, solid: 5, dashed: 4, dotted: 3, ridge: 2, outset: 2, groove: 1, inset: 1 };

/** เส้นตรงแนวนอน/แนวตั้ง (px ในพิกัดหน้า) แบบ solid/dotted/dashed — ความหนา w กึ่งกลางเส้นอยู่ที่พิกัดที่ให้ */
function strokeLine(doc, x1, y1, x2, y2, w, style, color) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (!(len > 0) || !(w > 0) || !color) return;
  doc.save();
  doc.strokeColor(color).lineWidth(w * PT).lineCap('butt');
  if (style === 'dotted' || style === 'dashed') {
    const dash = style === 'dotted' ? w : w * 3, base = dash * (style === 'dotted' ? 2 : 1.67);
    const n = Math.max(1, Math.round((len + base - dash) / base)); // จำนวนช่วงที่ลงตัวพอดีความยาว (เส้นเริ่มและจบด้วยช่วงทึบ)
    if (n > 1) doc.dash(dash * PT, { space: ((len - n * dash) / (n - 1)) * PT });
  }
  doc.moveTo(x1 * PT, y1 * PT).lineTo(x2 * PT, y2 * PT).stroke();
  doc.restore();
}

// ---------- ตัวเดินเอกสารของแต่ละแผ่น ----------
function createRenderer({ doc, d, ascentOf, emblem, stats }) {
  const win = d.defaultView;
  // แยกกลุ่มอักขระ (grapheme cluster): ตัวฐาน + สระ/วรรณยุกต์ที่ซ้อนอยู่ (สำรอง: เบราว์เซอร์ที่ไม่มี Intl.Segmenter)
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'grapheme' })
    : { segment: (s) => [...s.matchAll(/[^\p{M}ำ][\p{M}ำ]*|[\p{M}ำ]+/gu)].map((m) => ({ index: m.index })) };
  const range = d.createRange();
  let sx = 0, sy = 0, clipR = null; // จุดกำเนิดของแผ่นปัจจุบัน + กรอบหน้าต่างตัด (px)
  const X = (v) => (v - sx) * PT, Y = (v) => (v - sy) * PT;
  const L = (x1, y1, x2, y2, w, style, color) => strokeLine(doc, x1 - sx, y1 - sy, x2 - sx, y2 - sy, w, style, color); // พิกัด client -> พิกัดหน้า
  const seen = new Set(); // อักขระทั้งหมดที่วาด (ไว้ตรวจว่าฟอนต์มีครบ)
  const outside = (r) => r.bottom < clipR.top || r.top > clipR.bottom || r.right < clipR.left || r.left > clipR.right;

  // ---- ตัวอักษร ----
  const useFont = (bold, fpx) => doc.font(bold ? 'B' : 'R').fontSize(fpx * PT);
  /** ความกว้างธรรมชาติ (px) ของข้อความตามฟอนต์ที่ฝัง (fontkit: kerning/GPOS) */
  const widthPx = (str, bold, fpx) => useFont(bold, fpx).widthOfString(str) / PT;

  function drawStr(str, left, baseline, fpx, bold, color, extra = 0, clusters = null) {
    useFont(bold, fpx).fillColor(color);
    if (extra && clusters) {
      // ข้อความจัดชิดสองข้างแบบ text-justify:inter-character → เบราว์เซอร์เพิ่มช่องไฟเท่ากันหลังอักขระทุกกลุ่ม (cluster)
      // วางทีละกลุ่มที่ตำแหน่ง x คำนวณเอง (สระ/วรรณยุกต์ยังอยู่กับตัวฐานในกลุ่มเดียวกัน) — ไม่ใช้ตัวดำเนินการ Tw/Tc ของ PDF
      // เพราะกับฟอนต์ฝังแบบ 2 ไบต์ (Identity-H) ตัวอ่านของ Apple (Safari/iOS) ตีความ Tw ต่างจาก pdf.js/MuPDF ทำให้ตัวอักษรกระจายและซ้อนกัน
      let x = left;
      for (const c of clusters) {
        doc.text(c, X(x), Y(baseline), { baseline: 'alphabetic', lineBreak: false });
        x += widthPx(c, bold, fpx) + extra;
      }
    } else doc.text(str, X(left), Y(baseline), { baseline: 'alphabetic', lineBreak: false });
    stats.strings++;
  }

  /** กล่องของช่วงอักขระ [a,b) ในโหนดข้อความ (หนึ่ง rect ต่อบรรทัด) */
  const rectsOf = (node, a, b) => { range.setStart(node, a); range.setEnd(node, b); return [...range.getClientRects()].filter((q) => q.width > 0 || q.height > 0); };

  /** วางข้อความช่วง [i0,i1) ที่อยู่บรรทัดเดียว ที่ตำแหน่งซ้ายตามที่เบราว์เซอร์วาง; ถ้ากว้างกว่าธรรมชาติ (จัดชิดสองข้าง) → กระจายช่องไฟตามกลุ่มอักขระ */
  function placeRun(node, i0, i1, S) {
    const qs = rectsOf(node, i0, i1);
    if (!qs.length) return;
    const q = qs[0], cyy = (q.top + q.bottom) / 2;
    if (cyy < clipR.top || cyy > clipR.bottom) return; // อยู่นอกหน้าต่างตัด (บรรทัดที่ถูกซ่อน)
    const left = Math.min(...qs.map((r) => r.left)), width = Math.max(...qs.map((r) => r.right)) - left;
    const str = node.nodeValue.slice(i0, i1), base = Math.round(q.top + S.asc); // เส้นฐานปัดเป็นพิกเซลเต็มเหมือนที่ Chrome วางตัวอักษรบนหน้าจอ (วัดจากภาพจริง)
    const nat = widthPx(str, S.bold, S.fpx), diff = width - nat;
    if (diff > JUSTIFY_TOL) {
      const cl = [...seg.segment(str)].map((s) => s.index);
      if (cl.length > 1) {
        const last = cl[cl.length - 1], ql = rectsOf(node, i0 + last, i1)[0];
        const extra = ql ? (ql.left - left - widthPx(str.slice(0, last), S.bold, S.fpx)) / (cl.length - 1) : 0;
        if (extra > 0.005) { drawStr(str, left, base, S.fpx, S.bold, S.color, extra, cl.map((c, k) => str.slice(c, cl[k + 1]))); stats.spread++; return; }
      }
    }
    if (Math.abs(diff) > stats.widthDiffMax) { stats.widthDiffMax = Math.abs(diff); stats.widest = `${str} (${diff.toFixed(2)}px, ${S.fpx.toFixed(1)}px)`; } // ส่วนต่างความกว้างที่ไม่ได้อธิบายด้วยการจัดชิดสองข้าง (ควรเล็ก)
    drawStr(str, left, base, S.fpx, S.bold, S.color);
  }

  function drawToken(node, a, b, S) {
    const rects = rectsOf(node, a, b);
    if (!rects.length) return;
    const tops = [...new Set(rects.map((q) => q.top.toFixed(1)))].map(Number);
    if (tops.length === 1) { placeRun(node, a, b, S); return; }
    // คำที่ถูกตัดขึ้นบรรทัดใหม่กลางคำ (ภาษาไทยไม่มีช่องว่าง): แยกเป็นกลุ่มอักขระตามบรรทัด แล้ววางทีละบรรทัด
    tops.sort((p, q) => p - q);
    const str = node.nodeValue.slice(a, b);
    const cl = [...seg.segment(str)].map((s) => s.index); // ตำแหน่งเริ่มของแต่ละกลุ่มอักขระ
    const lineOf = (ci) => {
      const q = rectsOf(node, a + cl[ci], a + (cl[ci + 1] ?? str.length))[0];
      if (!q) return -1;
      let best = 0;
      for (let i = 1; i < tops.length; i++) if (Math.abs(tops[i] - q.top) < Math.abs(tops[best] - q.top)) best = i;
      return best;
    };
    const starts = [0];
    for (let n = 1; n < tops.length; n++) { // ดัชนีกลุ่มอักขระแรกที่อยู่บรรทัด >= n (ค้นหาแบบแบ่งครึ่ง)
      let lo = starts[n - 1], hi = cl.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (lineOf(m) >= n) hi = m; else lo = m + 1; }
      starts.push(lo);
    }
    starts.push(cl.length);
    for (let n = 0; n < tops.length; n++) if (starts[n] < starts[n + 1]) placeRun(node, a + cl[starts[n]], a + (cl[starts[n + 1]] ?? str.length), S);
  }

  /** เส้นใต้/เส้นขีดฆ่าที่ถูกประกาศบนบรรพบุรุษของข้อความ (ส่งต่อถึงลูกที่อยู่ในบรรทัด; ไม่ส่งผ่าน inline-block/ลอย/absolute) */
  function decorationsOf(el, z) {
    const out = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = win.getComputedStyle(e);
      const lines = cs.textDecorationLine || '';
      if (lines && lines !== 'none') out.push({ lines, cs });
      if (/^inline-block|^inline-flex|^inline-table/.test(cs.display) || cs.position === 'absolute' || cs.position === 'fixed' || cs.cssFloat !== 'none') break;
    }
    return out;
  }

  /**
   * วาดเส้นใต้/เส้นขีดฆ่าของข้อความในโหนดหนึ่ง ต่อบรรทัด — ค่าตรงกับที่ Chrome วาด (วัดจากภาพจริง): Chrome ปัดความหนา/ตำแหน่งเส้นเป็นพิกเซลเต็ม
   *  ความหนา auto = floor(ขนาดอักษร/10) (อย่างน้อย 1) · ความหนาที่กำหนดเองปัดเป็นจำนวนเต็ม (1.5px → 2px)
   *  เส้นใต้ auto: ขอบบนเส้นอยู่ใต้เส้นฐาน 1px (เส้นบาง) หรือ 2px (เส้นหนา ≥2px) · text-underline-offset ที่กำหนด = ระยะจากเส้นฐานถึงขอบบนของเส้น
   *  เส้นขีดฆ่า: ขอบบนเส้นอยู่เหนือเส้นฐาน round(ขนาดอักษร/3)   (เส้นฐานในที่นี้คือเส้นฐานที่ปัดเป็นพิกเซลเต็มแล้ว)
   */
  function drawDecoration(node, decl, fpx, asc, color, z) {
    const { cs, lines } = decl;
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((q) => q.width > 0 && !outside(q));
    if (!rects.length) return;
    const dcolor = parseColor(cs.textDecorationColor) || color;
    const style = cs.textDecorationStyle === 'dotted' || cs.textDecorationStyle === 'dashed' ? cs.textDecorationStyle : 'solid';
    const thickCss = parseFloat(cs.textDecorationThickness), offCss = parseFloat(cs.textUnderlineOffset);
    const th = Number.isFinite(thickCss) ? Math.max(1, Math.round(thickCss * z)) : Math.max(1, Math.floor(fpx / 10));
    for (const kind of ['underline', 'line-through']) {
      if (!lines.includes(kind)) continue;
      for (const q of rects) {
        const base = Math.round(q.top + asc);
        const top = kind === 'underline' ? base + (Number.isFinite(offCss) ? offCss * z : th >= 2 ? 2 : 1) : base - Math.round(fpx / 3);
        L(q.left, top + th / 2, q.right, top + th / 2, th, style, dcolor);
      }
    }
  }
  function drawText(node, z) {
    const s = node.nodeValue;
    if (!s) return;
    const el = node.parentElement, cs = win.getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none') return;
    const color = parseColor(cs.color);
    if (!color) return;
    const bold = parseInt(cs.fontWeight, 10) >= 600 || cs.fontWeight === 'bold';
    const fpx = parseFloat(cs.fontSize) * z; // ขนาดจริงที่เห็น (ค่า computed ไม่รวม CSS zoom)
    const asc = ascentOf(bold, fpx);
    const re = /\S+/g;
    let mt;
    for (const ch of s) seen.add(ch);
    const S = { fpx, bold, color, asc };
    while ((mt = re.exec(s))) drawToken(node, mt.index, mt.index + mt[0].length, S);
    for (const decl of decorationsOf(el, z)) drawDecoration(node, decl, fpx, asc, color, z);
  }

  // ---- เส้นขอบ ----
  function sideInfo(cs, side, z) {
    const w = parseFloat(cs[`border${side}Width`]) * z, style = cs[`border${side}Style`];
    if (!(w > 0) || style === 'none' || style === 'hidden') return null;
    const color = parseColor(cs[`border${side}Color`]);
    return color ? { w, style, color } : null;
  }

  function drawBox(r, sides) {
    const { Top: t, Right: rt, Bottom: b, Left: l } = sides;
    const fill = (x, y, w, h, color) => { doc.save(); doc.fillColor(color).rect(X(x), Y(y), w * PT, h * PT).fill(); doc.restore(); };
    if (t) { if (t.style === 'solid') fill(r.left, r.top, r.width, t.w, t.color); else L(r.left, r.top + t.w / 2, r.right, r.top + t.w / 2, t.w, t.style, t.color); }
    if (b) { if (b.style === 'solid') fill(r.left, r.bottom - b.w, r.width, b.w, b.color); else L(r.left, r.bottom - b.w / 2, r.right, r.bottom - b.w / 2, b.w, b.style, b.color); }
    if (l) { if (l.style === 'solid') fill(r.left, r.top, l.w, r.height, l.color); else L(r.left + l.w / 2, r.top, r.left + l.w / 2, r.bottom, l.w, l.style, l.color); }
    if (rt) { if (rt.style === 'solid') fill(r.right - rt.w, r.top, rt.w, r.height, rt.color); else L(r.right - rt.w / 2, r.top, r.right - rt.w / 2, r.bottom, rt.w, rt.style, rt.color); }
  }

  /** กล่องที่มุมโค้งเป็นวงกลม/วงรี (border-radius 50%) และขอบเหมือนกันทั้งสี่ด้าน → วาดเป็นวงรี */
  function isRound(cs, r, sides) {
    const s = sides.Top;
    if (!s || !sides.Right || !sides.Bottom || !sides.Left) return false;
    const rad = cs.borderTopLeftRadius;
    const half = rad.endsWith('%') ? parseFloat(rad) >= 50 : parseFloat(rad) >= Math.min(r.width, r.height) / 2 - 0.01;
    return half && ['Right', 'Bottom', 'Left'].every((k) => sides[k].w === s.w && sides[k].style === s.style);
  }

  function drawBorders(el, cs, z) {
    const sides = { Top: sideInfo(cs, 'Top', z), Right: sideInfo(cs, 'Right', z), Bottom: sideInfo(cs, 'Bottom', z), Left: sideInfo(cs, 'Left', z) };
    if (!sides.Top && !sides.Right && !sides.Bottom && !sides.Left) return;
    const rects = cs.display === 'inline' ? [...el.getClientRects()] : [el.getBoundingClientRect()];
    for (const r of rects) {
      if (!(r.width > 0 || r.height > 0) || outside(r)) continue;
      if (isRound(cs, r, sides)) {
        const w = sides.Top.w;
        doc.save();
        doc.strokeColor(sides.Top.color).lineWidth(w * PT);
        doc.ellipse(X(r.left + r.width / 2), Y(r.top + r.height / 2), (r.width - w) / 2 * PT, (r.height - w) / 2 * PT).stroke();
        doc.restore();
      } else drawBox(r, sides);
    }
  }

  /** ตารางแบบ border-collapse: ขอบแต่ละด้านใช้ร่วมกันระหว่างเซลล์ข้างเคียง → เลือกเส้นที่ชนะ (หนากว่า → ชนิดเส้นทึบก่อน) แล้ววาดครั้งเดียว กึ่งกลางเส้นอยู่บนขอบเซลล์ */
  function drawCollapsedTable(table, z) {
    const edges = new Map();
    const add = (orient, c, a, b, info) => {
      if (!info) return;
      const key = `${orient}|${Math.round(c * 4)}|${Math.round(a * 4)}|${Math.round(b * 4)}`;
      const old = edges.get(key), rank = [info.w, STYLE_RANK[info.style] || 0];
      if (!old || rank[0] > old.rank[0] || (rank[0] === old.rank[0] && rank[1] > old.rank[1])) edges.set(key, { orient, c, a, b, info, rank });
    };
    for (const cell of table.querySelectorAll('th, td')) {
      const r = cell.getBoundingClientRect(), cs = win.getComputedStyle(cell);
      if (outside(r) && r.height > 0) continue;
      add('h', r.top, r.left, r.right, sideInfo(cs, 'Top', z));
      add('h', r.bottom, r.left, r.right, sideInfo(cs, 'Bottom', z));
      add('v', r.left, r.top, r.bottom, sideInfo(cs, 'Left', z));
      add('v', r.right, r.top, r.bottom, sideInfo(cs, 'Right', z));
    }
    for (const e of edges.values()) {
      if (e.orient === 'h' && e.c < clipR.top - 0.5) continue;
      const { w, style, color } = e.info, ext = style === 'solid' ? w / 2 : 0; // เส้นทึบยื่นปลายครึ่งหนึ่งให้มุมเต็ม
      // เส้นนอนที่ตกขอบล่างของหน้าต่างตัดพอดี (ขอบล่างของแถวสุดท้ายในแผ่นที่ตารางไหลต่อ): ตัวอย่างบนจออาจถูกตัดหายครึ่งเส้น
      // แต่ในกระดาษ PDF ต้องปิดท้ายตารางให้เห็นเส้น → ดึงเข้ามาอยู่ในหน้าต่างเต็มความหนา
      const c = e.orient === 'h' ? Math.min(e.c, clipR.bottom - w / 2) : e.c;
      if (e.orient === 'h') L(e.a - ext, c, e.b + ext, c, w, style, color);
      else L(e.c, e.a - ext, e.c, e.b + ext, w, style, color);
    }
  }

  // ---- SVG ปีกกา (path ใช้เฉพาะคำสั่ง M L C Z แบบพิกัดสัมบูรณ์) ----
  function drawSvg(svg, z) {
    const r = svg.getBoundingClientRect();
    const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || !vb[2] || !vb[3]) return;
    const mx = (x) => X(r.left + ((x - vb[0]) / vb[2]) * r.width), my = (y) => Y(r.top + ((y - vb[1]) / vb[3]) * r.height); // preserveAspectRatio="none"
    for (const p of svg.querySelectorAll('path')) {
      const cs = win.getComputedStyle(p), color = parseColor(cs.stroke);
      const w = parseFloat(cs.strokeWidth);
      if (!color || !(w > 0) || cs.stroke === 'none') continue;
      const tok = (p.getAttribute('d') || '').match(/[MLCZmlcz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
      doc.save();
      doc.strokeColor(color).lineWidth(w * z * PT).lineCap(cs.strokeLinecap === 'round' ? 'round' : 'butt').lineJoin(cs.strokeLinejoin === 'round' ? 'round' : 'miter');
      for (let i = 0, cmd = ''; i < tok.length;) {
        if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++].toUpperCase();
        const n = () => parseFloat(tok[i++]);
        if (cmd === 'M') doc.moveTo(mx(n()), my(n()));
        else if (cmd === 'L') doc.lineTo(mx(n()), my(n()));
        else if (cmd === 'C') doc.bezierCurveTo(mx(n()), my(n()), mx(n()), my(n()), mx(n()), my(n()));
        else if (cmd === 'Z') doc.closePath();
        else break;
      }
      doc.stroke();
      doc.restore();
    }
  }

  function drawImg(img) {
    const r = img.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0) || outside(r) || !emblem.image) return;
    doc.image(emblem.image, X(r.left), Y(r.top), { width: r.width * PT, height: r.height * PT });
    stats.images++;
  }

  // ---- เดินต้นไม้ ----
  function visit(node, z) {
    if (node.nodeType === 3) { drawText(node, z); return; }
    if (node.nodeType !== 1) return;
    const cs = win.getComputedStyle(node);
    if (cs.display === 'none') return;
    const nz = z * (parseFloat(cs.zoom) || 1);
    const tag = node.localName;
    if (tag === 'svg') { if (cs.visibility === 'visible') drawSvg(node, nz); return; }
    if (cs.visibility === 'visible') {
      if (tag === 'img') { drawImg(node); return; }
      if (tag === 'table' && cs.borderCollapse === 'collapse') drawCollapsedTable(node, nz);
      else if (!((tag === 'td' || tag === 'th') && node.closest('table') && win.getComputedStyle(node.closest('table')).borderCollapse === 'collapse')) drawBorders(node, cs, nz);
    }
    for (const c of node.childNodes) visit(c, nz);
  }

  return {
    seen,
    /** วาดหนึ่งแผ่น (sheet) ลงหน้า PDF ปัจจุบัน */
    sheet(sheet) {
      const sr = sheet.getBoundingClientRect(), clip = sheet.querySelector('.flow-clip');
      sx = sr.left; sy = sr.top;
      clipR = clip.getBoundingClientRect();
      doc.save();
      doc.rect(X(clipR.left), Y(clipR.top), clipR.width * PT, clipR.height * PT).clip(); // เหมือน overflow:hidden ของหน้าต่างมองเนื้อหา
      for (const c of clip.childNodes) visit(c, 1);
      doc.restore();
    },
  };
}

/** ย่อภาพตราครุฑให้พอดีความละเอียดที่ใช้ (เก็บความโปร่งใส) แล้วคืน PDFKit image object ใช้ซ้ำได้ทุกจุด (ฝังลง PDF ครั้งเดียว) */
async function prepareEmblem(doc, d) {
  const imgs = [...d.images].filter((im) => im.naturalWidth > 0);
  if (!imgs.length) return { image: null };
  let maxW = 0;
  for (const im of imgs) maxW = Math.max(maxW, im.getBoundingClientRect().width);
  const src = imgs[0];
  const w = Math.max(1, Math.min(src.naturalWidth, Math.ceil(maxW * EMBLEM_SCALE))), h = Math.max(1, Math.round((w * src.naturalHeight) / src.naturalWidth));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
  return { image: doc.openImage(await blob.arrayBuffer()) };
}

/**
 * สร้างไฟล์ PDF จากแผ่น A4 ที่แบ่งหน้าแล้ว
 * @param {string} sheetsHtml ผลลัพธ์ของ paginateHtml (หลายเอกสารต่อกันได้) — ลำดับ <section class="page ... sheet">
 * @param {{title?:string, onProgress?:(done:number,total:number)=>void, stats?:object}} [opt]
 * @returns {Promise<Blob>} application/pdf
 */
export async function buildPdf(sheetsHtml, { title = 'ชุดเอกสาร', onProgress, stats: statsOut } = {}) {
  const [PDFDocument, fonts] = await Promise.all([loadPdfKit(), loadFonts()]);
  const { frame, doc: d } = await openMeasureFrame(sheetsHtml);
  const ascentOf = makeAscentProbe(d);
  try {
    const sheets = [...d.querySelectorAll('section.sheet')];
    const stats = { sheets: sheets.length, strings: 0, images: 0, spread: 0, widthDiffMax: 0 };
    const pdf = new PDFDocument({ autoFirstPage: false, size: [PAGE_W, PAGE_H], margin: 0, compress: true, info: { Title: title, Producer: 'PDFKit', Creator: 'เอกสารศาล' }, displayTitle: true });
    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    const ended = new Promise((resolve, reject) => { pdf.on('end', resolve); pdf.on('error', reject); });
    pdf.registerFont('R', fonts.regular);
    pdf.registerFont('B', fonts.bold);
    const emblem = await prepareEmblem(pdf, d);
    const r = createRenderer({ doc: pdf, d, ascentOf, emblem, stats });
    onProgress?.(0, sheets.length);
    for (let i = 0; i < sheets.length; i++) {
      pdf.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
      r.sheet(sheets[i]);
      onProgress?.(i + 1, sheets.length);
      await new Promise((res) => setTimeout(res)); // คืนเวลาให้หน้าเว็บตอบสนอง
    }
    // ตัวอักษรที่ฟอนต์ไม่มี (จะกลายเป็นกล่องว่าง): เตือนในคอนโซล + บันทึกใน stats
    try {
      const f = pdf.font('R')._font.font;
      stats.missingChars = [...r.seen].filter((ch) => !/\s/.test(ch) && !f.hasGlyphForCodePoint(ch.codePointAt(0))).join('');
      if (stats.missingChars) console.warn('pdf-export: ฟอนต์ไม่มีตัวอักษร', stats.missingChars);
    } catch { /* ใช้ API ภายในของ PDFKit — ข้ามถ้าไม่มี */ }
    pdf.end();
    await ended;
    if (statsOut) Object.assign(statsOut, stats);
    return new Blob(chunks, { type: 'application/pdf' });
  } finally {
    ascentOf.dispose();
    frame.remove();
  }
}
