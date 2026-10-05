// แปลง blocks → ไฟล์ .docx (แก้ไขต่อใน Word ได้) ใช้ฟอนต์ TH Sarabun IT๙ ขนาด 16 (ปรับได้ที่หน้า "ตำแหน่งตัวหนังสือ & ตราครุฑ")
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle,
  ImageRun, TabStopType, PageBreak, VerticalAlign, TableLayoutType,
} from 'docx';
import { resolveLayout, mmToTwip, mmToPx } from '../shared/layout.js';
import { thaiDigitsDoc as TD } from '../shared/thai.js';
import BRACE_PNG from './brace-fallback.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT = 'TH SarabunIT๙';
const cm = (x) => Math.round(x * 567);
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NOBORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const DOT = { style: BorderStyle.DOTTED, size: 6, color: '000000' };
const LINE = { style: BorderStyle.SINGLE, size: 6, color: '000000' };

// ค่าจัดหน้าของเอกสารที่กำลังสร้าง (ตั้งใหม่ทุกเอกสารใน renderDocx)
let L = resolveLayout(null, '');
// สัดส่วนย่อของส่วนหน้าที่ยาวเกินแผ่นเดียว (1 = ไม่ย่อ) — ตั้งโดย renderDocx ผ่าน fitFactor(); คูณกับขนาดตัวอักษร/ช่องว่าง/ตราครุฑเท่านั้น
let FIT = 1;
const fz = () => Math.round(L['font.size'] * 2 * FIT);            // half-points
/** ขนาดเครื่องหมายท้ายย่อหน้า (กำหนดความสูงย่อหน้าว่าง) — ตามขนาดย่อเมื่อกำลังย่อส่วนหน้า; ไม่ย่อ = ไม่ตั้ง (ผลเหมือนเดิม) */
const paraMark = () => (FIT < 1 ? { run: { size: fz() } } : {});
const lineSp = () => Math.round(L['font.line'] * 250);        // 1.32 → 330
const textWidthMm = () => 210 - L['page.left'] - L['page.right'];

let emblem;
function getEmblem() {
  if (globalThis.__EMBLEM__) return globalThis.__EMBLEM__; // Edge Function ฉีดตราครุฑมาให้
  if (emblem === undefined) {
    try { emblem = fs.readFileSync(path.join(__dirname, '..', 'public', 'garuda.png')); } catch { emblem = null; }
  }
  return emblem;
}

function run(r, base = {}) {
  if (r.kind === 'dots') return new TextRun({ text: '.'.repeat(Math.round((r.len || 20) * 1.1)), font: FONT, size: fz() });
  return new TextRun({
    text: TD(r.text), font: FONT, size: base.size || fz(), bold: !!(r.b || base.bold), underline: r.kind === 'val' || r.u || base.underline ? { type: r.kind === 'val' ? 'dotted' : 'single' } : undefined,
    highlight: r.kind === 'ph' ? 'yellow' : undefined,
  });
}

const para = (children, o = {}) => new Paragraph({ children, spacing: { after: Math.round((o.after ?? 60) * FIT), line: lineSp() }, ...o.opts });
const txt = (text, extra = {}) => new TextRun({ text: TD(text), font: FONT, size: fz(), ...extra });

function dotted(text, size) {
  return text ? new TextRun({ text: TD(text), font: FONT, size: size || fz(), underline: { type: 'dotted' } }) : new TextRun({ text: '.'.repeat(18), font: FONT, size: size || fz() });
}

function cell(children, o = {}) {
  return new TableCell({ children, borders: o.borders || { top: NONE, bottom: NONE, left: NONE, right: NONE }, width: o.w ? { size: o.w, type: WidthType.PERCENTAGE } : undefined, verticalAlign: o.v, margins: o.margins });
}

/** ปีกกา “{” แบบเวกเตอร์สูง hMm มม. (ปลายแหลมตรงกลาง หัว/ท้ายโค้งขนาดคงที่) */
function braceSvg(hMm) {
  const h = Math.round(hMm * 10), mid = h / 2, c = 60;
  const d = `M58 4 C40 4 30 18 30 ${c} L30 ${mid - c} C30 ${mid - c / 2.2} 20 ${mid} 2 ${mid} C20 ${mid} 30 ${mid + c / 2.2} 30 ${mid + c} L30 ${h - c} C30 ${h - 18} 40 ${h - 4} 58 ${h - 4}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="${h}" viewBox="0 0 60 ${h}"><path d="${d}" fill="none" stroke="#000" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** ช่องว่างแนวตั้งเป็นมิลลิเมตร (ย่อหน้าว่างที่บางมาก) */
const gap = (mm) => new Paragraph({ children: [new TextRun({ text: '', size: 2 })], spacing: { before: mmToTwip(Math.max(0, mm) * FIT), after: 0, line: 20, lineRule: 'exact' } });

/** เลื่อนซ้าย/ขวา (มม.) ด้วยการย่อหน้า: บวก = ขวา ลบ = ซ้าย; centered=true คูณสองเพื่อให้จุดกึ่งกลางขยับตาม */
function shiftIndent(dx, centered = false) {
  const t = mmToTwip(Math.abs(dx)) * (centered ? 2 : 1);
  return dx >= 0 ? { left: t } : { right: t };
}

function blockToDocx(b) {
  switch (b.t) {
    case 'top': {
      const img = getEmblem();
      const wpx = Math.round(mmToPx(L['emblem.width']) * FIT);
      const left = [
        new Paragraph({ indent: shiftIndent(L['title.dx']), spacing: { before: mmToTwip(Math.max(0, L['title.dy']) * FIT), after: 0, line: lineSp() }, children: [txt(`○  ${b.formNo}`)] }),
        ...(b.kinds ? [para(b.kinds.all.flatMap((k, i) => [...(i ? [txt(' / ')] : []), txt(k, k === b.kinds.on ? {} : { strike: true })]), { after: 0, opts: { alignment: AlignmentType.CENTER, indent: shiftIndent(L['title.dx']) } })] : []),
        ...(b.title ? String(b.title).split('\n') : []).map((l) => (b.kinds
          ? para([txt(l)], { after: 0, opts: { alignment: AlignmentType.CENTER, indent: shiftIndent(L['title.dx']) } })
          : para([txt('      ' + l)], { after: 0, opts: { indent: shiftIndent(L['title.dx']) } }))),
      ];
      const mid = [new Paragraph({
        alignment: AlignmentType.CENTER, indent: shiftIndent(L['emblem.dx'], true),
        spacing: { before: mmToTwip(Math.max(0, L['emblem.dy']) * FIT), after: 0 },
        children: img && !b.noEmblem && L['emblem.show'] ? [new ImageRun({ data: img, type: 'png', transformation: { width: wpx, height: Math.round(wpx * 1.036) } })] : [],
      })];
      const right = [];
      const cn = { indent: shiftIndent(L['caseNo.dx']) };
      let first = true;
      const push = (children, o = {}) => {
        right.push(new Paragraph({ ...cn, ...o, spacing: { before: first ? mmToTwip(Math.max(0, L['caseNo.dy']) * FIT) : 0, after: 0, line: lineSp() }, children })); first = false;
      };
      if (b.courtUse) push([txt('สำหรับศาลใช้', { underline: {} })], { alignment: AlignmentType.RIGHT });
      if (!(b.noEmblem && !b.black)) push([txt('คดีหมายเลขดำที่ '), dotted(b.black), txt(' / '), dotted(b.yearBlack)]);
      if (b.showRed && !b.noEmblem) push([txt('คดีหมายเลขแดงที่ '), dotted(b.red), txt(' / '), dotted(b.yearRed)]);
      const midW = Math.max(25, Math.round(((L['emblem.width'] + 8) / textWidthMm()) * 100));
      return [new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, borders: NOBORDERS,
        rows: [new TableRow({ children: [cell(left, { w: Math.round((100 - midW) * 0.45) }), cell(mid, { w: midW }), cell(right, { w: Math.round((100 - midW) * 0.55) })] })],
      }), para([], { after: 60, opts: paraMark() })];
    }
    case 'subtitle': return [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(b.text, { bold: true })] })];
    case 'court': {
      const ind = shiftIndent(L['court.dx'], true);
      return [
        new Paragraph({ alignment: AlignmentType.CENTER, indent: ind, children: [txt('ศาล '), dotted(b.court)], spacing: { before: mmToTwip(L['court.before'] * FIT), after: 0, line: lineSp() } }),
        new Paragraph({ alignment: AlignmentType.CENTER, indent: ind, children: [txt('วันที่ '), dotted(b.day), txt(' เดือน '), dotted(b.month), txt(' พุทธศักราช '), dotted(b.year)], spacing: { after: 0, line: lineSp() } }),
        new Paragraph({ alignment: AlignmentType.CENTER, indent: ind, children: [txt('ความ '), dotted(b.kind)], spacing: { after: mmToTwip(L['court.after'] * FIT), line: lineSp() } }),
      ];
    }
    case 'between': {
      const rows = [];
      const mk = (list, label) => (list.length ? list : [{ name: '', label }]);
      const wMm = textWidthMm();
      const sides = [...mk(b.pl, 'โจทก์'), null, ...mk(b.df, 'จำเลย')];
      let lines = 0;
      for (const x of sides) {
        if (!x) { rows.push(new Paragraph({ children: [], spacing: { after: Math.round(120 * FIT) }, ...paraMark() })); continue; }
        lines += Math.max(1, Math.ceil((x.name || '').length / (40 / FIT)));
        rows.push(new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: mmToTwip(wMm * 0.76) }],
          border: { bottom: { ...DOT } },
          children: [dotted(x.name || ''), txt('\t' + x.label)], spacing: { after: 40 },
        }));
      }
      // ปีกกา “{” แบบรูปเวกเตอร์ สูงเท่าบล็อกรายชื่อ (ประมาณจากจำนวนบรรทัด)
      const braceMm = Math.max(16 * FIT, lines * (L['font.size'] * 0.3528 * L['font.line'] * FIT + 1.5 * FIT) + 5 * FIT);
      const brace = [new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 },
        children: [new ImageRun({ type: 'svg', data: Buffer.from(braceSvg(braceMm), 'utf8'), fallback: { type: 'png', data: Buffer.from(BRACE_PNG, 'base64') }, transformation: { width: mmToPx(6), height: mmToPx(braceMm) } })],
      })];
      return [gap(L['between.before']), new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, borders: NOBORDERS,
        rows: [new TableRow({ children: [
          cell([para([txt('ระหว่าง', { bold: true })])], { w: 13, v: VerticalAlign.CENTER }),
          cell(brace, { w: 5, v: VerticalAlign.CENTER }),
          cell(rows, { w: 82, v: VerticalAlign.CENTER }),
        ] })],
      }), gap(L['between.after'])];
    }
    case 'p': {
      const opts = {};
      if (b.align === 'right') opts.alignment = AlignmentType.RIGHT;
      else if (b.justify) opts.alignment = AlignmentType.THAI_DISTRIBUTE;
      if (b.hang) opts.indent = { left: cm(b.indent), hanging: cm(b.hang) };
      else if (b.indent) opts.indent = { firstLine: Math.max(0, cm(b.indent + L['body.indent'])) };
      const base = b.small ? { size: Math.max(Math.round(20 * FIT), fz() - 4) } : {};
      return [para((b.runs || []).map((r) => run(r, base)), { opts, after: (b.gap ? 120 : 60) + mmToTwip(L['body.gap']) })];
    }
    case 'leader': return [new Paragraph({ spacing: { after: 60, line: lineSp() }, children: [txt(`${b.label} ${'.'.repeat(60)}`)] })];
    case 'amount': return [new Paragraph({ spacing: { after: 60, line: lineSp() }, children: [txt(`จำนวนทุนทรัพย์ ${b.baht || '.'.repeat(30)} บาท ${b.satang || '.'.repeat(10)} สตางค์`)] })];
    case 'center':
      return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: Math.round(100 * FIT) }, children: [txt(b.text, { size: b.big ? fz() + Math.round(8 * FIT) : fz(), bold: !!b.b, underline: b.u ? {} : undefined })] })];
    case 'sig': {
      const out = [];
      const left = mmToTwip(textWidthMm() * (L['sig.left'] / 100));
      for (const l of b.lines) {
        out.push(new Paragraph({ indent: { left }, spacing: { before: Math.round((b.compact ? 120 : 360) * FIT), after: 0 }, children: [txt(`ลงชื่อ ${'.'.repeat(40)} `), txt(l.label)] }));
        if (l.name) out.push(new Paragraph({ indent: { left: left + cm(1.5) }, spacing: { after: b.compact ? 20 : 60 }, children: [txt(l.name)] }));
      }
      return out;
    }
    case 'flip': return [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt('(พลิก)')] })];
    case 'rule': return [new Paragraph({ border: { bottom: LINE }, spacing: { before: Math.round(200 * FIT), after: Math.round(100 * FIT) }, children: [], ...paraMark() })];
    case 'lines': return Array.from({ length: b.n }, () => new Paragraph({ border: { bottom: DOT }, spacing: { after: 200 }, children: [] }));
    case 'table': {
      const rows = [...b.rows];
      while (rows.length < (b.minRows || 0)) rows.push(b.head.map(() => ''));
      const bd = { top: LINE, bottom: LINE, left: LINE, right: LINE };
      const mkCell = (t, i, head) => new TableCell({
        borders: bd, width: { size: b.widths[i], type: WidthType.PERCENTAGE }, verticalAlign: head ? VerticalAlign.CENTER : VerticalAlign.TOP,
        children: [new Paragraph({ alignment: head || i === 0 ? AlignmentType.CENTER : AlignmentType.LEFT, children: [txt(String(t ?? ''), { size: head ? Math.max(20, fz() - 4) : fz(), bold: !!head })] })],
      });
      return [new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({ tableHeader: true, children: b.head.map((h, i) => mkCell(h, i, true)) }),
          ...rows.map((r) => new TableRow({ height: { value: 520, rule: 'atLeast' }, children: r.map((x, i) => mkCell(x, i, false)) })),
        ],
      }), para([], { after: 80, opts: paraMark() })];
    }
    // บรรทัดสูง 1pt ตายตัว: ถ้าส่วนหน้าเต็มแผ่นพอดี ย่อหน้าที่มีตัวแบ่งหน้านี้ต้องไม่ถูกดันไปแผ่นถัดไปจนเกิดแผ่นว่าง
    case 'pagebreak': return [new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' } })];
    default: return [];
  }
}

// ---------- “ด้านหน้าห้ามล้น” (best-effort) ----------
// Word ไม่มีตัววัดบนเซิร์ฟเวอร์ จึง “ประมาณ” ความสูงส่วนหน้า (บล็อกก่อน pagebreak แรก; แบบแผ่นเดียวที่ตั้ง fitFront = ทั้งฉบับ) ด้วยการจำลองการขึ้นบรรทัด
// (ความกว้างตัวอักษรไทย ≈ 0.36 em ไม่นับสระบน-ล่าง/วรรณยุกต์; Word ตัดบรรทัดที่ช่องว่างเท่านั้น — คำไทยยาวไม่มีเว้นวรรคตัดกลางคำไม่ได้ — จึงจำลองแบบเดียวกัน)
// ถ้าเกินหนึ่งแผ่น ให้ลดขนาดตัวอักษร ช่องว่าง และตราครุฑลงเท่ากัน (ครั้งละ 2%) ไม่ต่ำกว่า 50% ; ปรับค่าเทียบกับ Word จริง (แปลงเป็น PDF) แล้ว เผื่อ 4%
// ข้อจำกัด: เป็นการประมาณ — แบบอักษรของเครื่องผู้เปิดไฟล์ ต่างจากที่คาดอาจคลาดเคลื่อนได้ ; ข้อมูลยาวสุดขีดอาจยังเกินแผ่นหน้าเล็กน้อยใน Word (แก้ไขต่อใน Word ได้เสมอ) — ตัวอย่างพรีวิว/PDF ในเว็บเป็นตัววัดจริงและไม่ล้นเด็ดขาด
const COMBINING = /[ัิ-ฺ็-๎]/;
/** จำลองการขึ้นบรรทัดของ Word: จำนวนบรรทัดของข้อความ text ที่ความกว้าง w (มม.) ตัดที่ช่องว่างเท่านั้น; cw = ความกว้างพยัญชนะหนึ่งตัว (มม.), first = ย่อหน้าบรรทัดแรก (มม.) */
function wrapLines(text, w, cw, first = 0) {
  const width = (s) => [...s].reduce((n, ch) => n + (COMBINING.test(ch) ? 0 : ch === ' ' || ch === '.' ? 0.55 : 1), 0) * cw;
  const sp = 0.55 * cw;
  let lines = 1, cur = first;
  for (const word of String(text).split(/ +/)) {
    const ww = width(word);
    if (cur > 0 && cur + sp + ww > w) { lines++; cur = 0; }
    if (ww > w) { lines += Math.floor(ww / w); cur = ww % w; } else cur += (cur > 0 ? sp : 0) + ww;
  }
  return lines;
}
const runsText = (runs) => (runs || []).map((r) => (r.kind === 'dots' ? '.'.repeat(Math.round((r.len || 20) * 1.1)) : TD(r.text || ''))).join('');

/** ความสูง (มม.) โดยประมาณของบล็อกเดียวที่สเกล k */
function estimateBlockMm(b, k) {
  // Word: ระยะบรรทัด = ความสูงบรรทัดเดี่ยวของ TH SarabunIT๙ (≈1.126 em, วัดจาก Word จริง) × lineSp()/240 — สูงกว่า CSS (font-size × line-height) ประมาณ 17%
  const fsMm = L['font.size'] * 0.3528 * k, lineMm = fsMm * 1.126 * lineSp() / 240;
  const W = textWidthMm(), cw = fsMm * 0.365;
  const nl = (text, w = W, first = 0) => wrapLines(text, w * 0.985, cw, first);
  const sp = (twip) => (twip / 56.693) * k;
  switch (b.t) {
    case 'top': return Math.max(L['emblem.width'] * 1.036 * k + Math.max(0, L['emblem.dy']) * k, lineMm * (1 + (b.title ? String(b.title).split('\n').length : 0) + (b.kinds ? 1 : 0)), lineMm * ((b.courtUse ? 1 : 0) + 1 + (b.showRed && !b.noEmblem ? 1 : 0)) + Math.max(0, L['caseNo.dy']) * k) + lineMm + sp(60); // + ย่อหน้าว่างใต้ตาราง
    case 'subtitle': return lineMm + sp(60);
    case 'center': return lineMm * (b.big ? 1.25 : 1) + sp(100);
    case 'court': return lineMm * (nl('ศาล ' + (b.court || ''), W - Math.abs(L['court.dx']) * 2) + 2) + (L['court.before'] + L['court.after']) * k;
    case 'between': {
      const side = (list) => (list.length ? list : [{ name: '', label: 'โจทก์' }]).reduce((h, x) => h + nl(x.name || '', W * 0.68) * (lineMm + sp(40)), 0);
      return Math.max(16 * k, side(b.pl) + sp(120) + side(b.df)) + (L['between.before'] + L['between.after']) * k;
    }
    case 'p': {
      const hang = b.hang ? b.indent * 10 : 0, first = !b.hang && b.indent ? b.indent * 10 : 0;
      const small = b.small ? 0.875 : 1;
      return wrapLines(runsText(b.runs), (W - hang) * 0.985, cw * small, first) * lineMm * small + sp((b.gap ? 120 : 60)) + L['body.gap'] * k;
    }
    case 'sig': return b.lines.reduce((h, l) => h + sp(b.compact ? 120 : 360) + lineMm + (l.name ? lineMm + sp(b.compact ? 20 : 60) : 0), 0);
    case 'flip': return lineMm + sp(60);
    case 'rule': return sp(300);
    case 'leader': case 'amount': return lineMm + sp(60);
    case 'lines': return b.n * (lineMm + sp(200));
    case 'table': return (b.rows.length + 1) * Math.max(9.2, lineMm + 1) * k;
    default: return 0;
  }
}

/** ตัวคูณย่อ (≤ 1) ที่ทำให้ส่วนหน้า (blocks) พอดีหนึ่งแผ่น A4 ตามที่ประมาณ; พอดีอยู่แล้ว = 1 (ผลไฟล์เหมือนเดิม) */
export function fitFactor(blocks, layout = null, docId = '') {
  const keep = L;
  L = resolveLayout(layout, docId);
  try {
    const avail = (297 - L['page.top'] - L['page.bottom']) * 0.96;
    const est = (k) => blocks.reduce((h, b) => h + estimateBlockMm(b, k), 0);
    let k = 1;
    while (est(k) > avail && k > 0.5) k = Math.round((k - 0.02) * 100) / 100;
    return k;
  } finally { L = keep; }
}

/** ความสูงส่วนหน้า (มม.) โดยประมาณที่สเกล k — ใช้ทดสอบเทียบกับตัววัดจริงของพรีวิว */
export function estimateFrontMm(blocks, layout = null, docId = '', k = 1) {
  const keep = L;
  L = resolveLayout(layout, docId);
  try { return blocks.reduce((h, b) => h + estimateBlockMm(b, k), 0); } finally { L = keep; }
}

/** ส่วนหน้าที่ต้องไม่ล้น: บล็อกก่อน pagebreak ตัวแรก; ไม่มี pagebreak และตั้ง fitFront = ทั้งฉบับ; อย่างอื่น = ไม่จำกัด (null) */
const frontCount = (d) => { const i = d.blocks.findIndex((b) => b.t === 'pagebreak'); return i > 0 ? i : i < 0 && d.fitFront ? d.blocks.length : 0; };

/** layout = ค่าจาก data/layout.json ({all, forms}) — แต่ละเอกสารใช้ค่าของแบบตัวเอง */
export async function renderDocx(docs, title = 'เอกสารยื่นศาล', layout = null) {
  const sections = docs.map((d) => {
    L = resolveLayout(layout, d.id);
    const n = frontCount(d);
    let children;
    if (n) {
      FIT = fitFactor(d.blocks.slice(0, n), layout, d.id); // ส่วนหน้าย่อให้พอดีแผ่นเดียว; ส่วนหลัง (คำเตือน/รายการ) ขนาดปกติ ต่อกี่แผ่นก็ได้
      try { children = d.blocks.slice(0, n).flatMap(blockToDocx); } finally { FIT = 1; }
      children.push(...d.blocks.slice(n).flatMap(blockToDocx));
    } else children = d.blocks.flatMap(blockToDocx);
    return {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: mmToTwip(L['page.top']), bottom: mmToTwip(L['page.bottom']), left: mmToTwip(L['page.left']), right: mmToTwip(L['page.right']) } } },
      children,
    };
  });
  L = resolveLayout(layout, '');
  const doc = new Document({
    title,
    creator: 'ระบบสร้างเอกสารยื่นศาล',
    styles: { default: { document: { run: { font: FONT, size: fz() } } } },
    sections,
  });
  return Packer.toBuffer(doc);
}
