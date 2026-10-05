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
const fz = () => Math.round(L['font.size'] * 2);            // half-points
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

const para = (children, o = {}) => new Paragraph({ children, spacing: { after: o.after ?? 60, line: lineSp() }, ...o.opts });
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
const gap = (mm) => new Paragraph({ children: [new TextRun({ text: '', size: 2 })], spacing: { before: mmToTwip(Math.max(0, mm)), after: 0, line: 20, lineRule: 'exact' } });

/** เลื่อนซ้าย/ขวา (มม.) ด้วยการย่อหน้า: บวก = ขวา ลบ = ซ้าย; centered=true คูณสองเพื่อให้จุดกึ่งกลางขยับตาม */
function shiftIndent(dx, centered = false) {
  const t = mmToTwip(Math.abs(dx)) * (centered ? 2 : 1);
  return dx >= 0 ? { left: t } : { right: t };
}

function blockToDocx(b) {
  switch (b.t) {
    case 'top': {
      const img = getEmblem();
      const wpx = mmToPx(L['emblem.width']);
      const left = [
        new Paragraph({ indent: shiftIndent(L['title.dx']), spacing: { before: mmToTwip(Math.max(0, L['title.dy'])), after: 0, line: lineSp() }, children: [txt(`○  ${b.formNo}`)] }),
        ...(b.kinds ? [para(b.kinds.all.flatMap((k, i) => [...(i ? [txt(' / ')] : []), txt(k, k === b.kinds.on ? {} : { strike: true })]), { after: 0, opts: { alignment: AlignmentType.CENTER, indent: shiftIndent(L['title.dx']) } })] : []),
        ...(b.title ? String(b.title).split('\n') : []).map((l) => (b.kinds
          ? para([txt(l)], { after: 0, opts: { alignment: AlignmentType.CENTER, indent: shiftIndent(L['title.dx']) } })
          : para([txt('      ' + l)], { after: 0, opts: { indent: shiftIndent(L['title.dx']) } }))),
      ];
      const mid = [new Paragraph({
        alignment: AlignmentType.CENTER, indent: shiftIndent(L['emblem.dx'], true),
        spacing: { before: mmToTwip(Math.max(0, L['emblem.dy'])), after: 0 },
        children: img && !b.noEmblem && L['emblem.show'] ? [new ImageRun({ data: img, type: 'png', transformation: { width: wpx, height: Math.round(wpx * 1.036) } })] : [],
      })];
      const right = [];
      const cn = { indent: shiftIndent(L['caseNo.dx']) };
      let first = true;
      const push = (children, o = {}) => {
        right.push(new Paragraph({ ...cn, ...o, spacing: { before: first ? mmToTwip(Math.max(0, L['caseNo.dy'])) : 0, after: 0, line: lineSp() }, children })); first = false;
      };
      if (b.courtUse) push([txt('สำหรับศาลใช้', { underline: {} })], { alignment: AlignmentType.RIGHT });
      if (!(b.noEmblem && !b.black)) push([txt('คดีหมายเลขดำที่ '), dotted(b.black), txt(' / '), dotted(b.yearBlack)]);
      if (b.showRed && !b.noEmblem) push([txt('คดีหมายเลขแดงที่ '), dotted(b.red), txt(' / '), dotted(b.yearRed)]);
      const midW = Math.max(25, Math.round(((L['emblem.width'] + 8) / textWidthMm()) * 100));
      return [new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, borders: NOBORDERS,
        rows: [new TableRow({ children: [cell(left, { w: Math.round((100 - midW) * 0.45) }), cell(mid, { w: midW }), cell(right, { w: Math.round((100 - midW) * 0.55) })] })],
      }), para([], { after: 60 })];
    }
    case 'subtitle': return [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(b.text, { bold: true })] })];
    case 'court': {
      const ind = shiftIndent(L['court.dx'], true);
      return [
        new Paragraph({ alignment: AlignmentType.CENTER, indent: ind, children: [txt('ศาล '), dotted(b.court)], spacing: { before: mmToTwip(L['court.before']), after: 0, line: lineSp() } }),
        new Paragraph({ alignment: AlignmentType.CENTER, indent: ind, children: [txt('วันที่ '), dotted(b.day), txt(' เดือน '), dotted(b.month), txt(' พุทธศักราช '), dotted(b.year)], spacing: { after: 0, line: lineSp() } }),
        new Paragraph({ alignment: AlignmentType.CENTER, indent: ind, children: [txt('ความ '), dotted(b.kind)], spacing: { after: mmToTwip(L['court.after']), line: lineSp() } }),
      ];
    }
    case 'between': {
      const rows = [];
      const mk = (list, label) => (list.length ? list : [{ name: '', label }]);
      const wMm = textWidthMm();
      const sides = [...mk(b.pl, 'โจทก์'), null, ...mk(b.df, 'จำเลย')];
      let lines = 0;
      for (const x of sides) {
        if (!x) { rows.push(new Paragraph({ children: [], spacing: { after: 120 } })); continue; }
        lines += Math.max(1, Math.ceil((x.name || '').length / 40));
        rows.push(new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: mmToTwip(wMm * 0.76) }],
          border: { bottom: { ...DOT } },
          children: [dotted(x.name || ''), txt('\t' + x.label)], spacing: { after: 40 },
        }));
      }
      // ปีกกา “{” แบบรูปเวกเตอร์ สูงเท่าบล็อกรายชื่อ (ประมาณจากจำนวนบรรทัด)
      const braceMm = Math.max(16, lines * (L['font.size'] * 0.3528 * L['font.line'] + 1.5) + 5);
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
      const base = b.small ? { size: Math.max(20, fz() - 4) } : {};
      return [para((b.runs || []).map((r) => run(r, base)), { opts, after: (b.gap ? 120 : 60) + mmToTwip(L['body.gap']) })];
    }
    case 'leader': return [new Paragraph({ spacing: { after: 60, line: lineSp() }, children: [txt(`${b.label} ${'.'.repeat(60)}`)] })];
    case 'amount': return [new Paragraph({ spacing: { after: 60, line: lineSp() }, children: [txt(`จำนวนทุนทรัพย์ ${b.baht || '.'.repeat(30)} บาท ${b.satang || '.'.repeat(10)} สตางค์`)] })];
    case 'center':
      return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [txt(b.text, { size: b.big ? fz() + 8 : fz(), bold: !!b.b, underline: b.u ? {} : undefined })] })];
    case 'sig': {
      const out = [];
      const left = mmToTwip(textWidthMm() * (L['sig.left'] / 100));
      for (const l of b.lines) {
        out.push(new Paragraph({ indent: { left }, spacing: { before: b.compact ? 120 : 360, after: 0 }, children: [txt(`ลงชื่อ ${'.'.repeat(40)} `), txt(l.label)] }));
        if (l.name) out.push(new Paragraph({ indent: { left: left + cm(1.5) }, spacing: { after: b.compact ? 20 : 60 }, children: [txt(l.name)] }));
      }
      return out;
    }
    case 'flip': return [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt('(พลิก)')] })];
    case 'rule': return [new Paragraph({ border: { bottom: LINE }, spacing: { before: 200, after: 100 }, children: [] })];
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
      }), para([], { after: 80 })];
    }
    case 'pagebreak': return [new Paragraph({ children: [new PageBreak()] })];
    default: return [];
  }
}

/** layout = ค่าจาก data/layout.json ({all, forms}) — แต่ละเอกสารใช้ค่าของแบบตัวเอง */
export async function renderDocx(docs, title = 'เอกสารยื่นศาล', layout = null) {
  const sections = docs.map((d) => {
    L = resolveLayout(layout, d.id);
    const children = d.blocks.flatMap(blockToDocx);
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
