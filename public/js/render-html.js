import { resolveLayout, layoutCssVars } from '/shared/layout.js';
// แปลง blocks → HTML สำหรับพรีวิวและพิมพ์ PDF (ฟอนต์ TH Sarabun IT๙ ตามแบบฟอร์มศาล)

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function runHtml(r) {
  if (r.kind === 'dots') return `<span class="dots" style="min-width:${(r.len || 20) * 0.28}em"></span>`;
  const cls = ['r'];
  if (r.kind === 'val') cls.push('val');
  if (r.kind === 'ph') cls.push('ph');
  if (r.b) cls.push('b');
  if (r.u) cls.push('u');
  const text = esc(r.text).replace(/\n/g, '<br>');
  return cls.length === 1 ? text : `<span class="${cls.join(' ')}">${text}</span>`;
}

// ปีกกา “{” ประกอบจากชิ้นส่วน: หัว – เส้นตรงยืดได้ – ปลายแหลมกลาง – เส้นตรงยืดได้ – ท้าย (ยืดตามความสูงของรายชื่อ ไม่เพี้ยน)
const BRACE = [
  '<svg viewBox="0 0 10 12" preserveAspectRatio="none"><path d="M10 0.8 C6.5 0.8 5 2.6 5 6 L5 12"/></svg>',
  '<i class="bl"></i>',
  '<svg viewBox="0 0 10 12" preserveAspectRatio="none"><path d="M5 0 L5 3.2 C5 5 3 6 0.4 6 C3 6 5 7 5 8.8 L5 12"/></svg>',
  '<i class="bl"></i>',
  '<svg viewBox="0 0 10 12" preserveAspectRatio="none"><path d="M5 0 L5 6 C5 9.4 6.5 11.2 10 11.2"/></svg>',
].join('');

const runsHtml = (runs) => (runs || []).map(runHtml).join('');
const dotField = (v, w = 8) => (v ? `<span class="val">${esc(v)}</span>` : `<span class="dots" style="min-width:${w}em"></span>`);

function blockHtml(b, doc) {
  switch (b.t) {
    case 'top':
      return `<div class="top">
        <div class="top-l"><span class="circle"></span><div><div>${esc(b.formNo)}</div><div class="top-title">${esc(b.title).replace(/\n/g, '<br>')}</div></div></div>
        <div class="top-c">${b.noEmblem ? '' : '<img src="/garuda.png" alt="ตราครุฑ">'}</div>
        <div class="top-r">${b.courtUse ? '<div class="court-use">สำหรับศาลใช้</div>' : ''}
          ${b.noEmblem && !b.black ? '' : `<div>คดีหมายเลขดำที่ ${dotField(b.black, 4.5)}/${dotField(b.year, 3)}</div>`}
          ${b.showRed && !b.noEmblem ? `<div>คดีหมายเลขแดงที่ ${dotField(b.red, 4.5)}/${dotField(b.year, 3)}</div>` : ''}
        </div></div>`;
    case 'subtitle': return `<div class="subtitle">${esc(b.text)}</div>`;
    case 'court':
      return `<div class="court"><div>ศาล ${dotField(b.court, 18)}</div>
        <div>วันที่ ${dotField(b.day, 3)} เดือน ${dotField(b.month, 8)} พุทธศักราช ${dotField(b.year, 3)}</div>
        <div>ความ ${dotField(b.kind, 6)}</div></div>`;
    case 'between': {
      const rows = (list, label) => list.length
        ? list.map((x) => `<div class="bt-row"><span class="bt-name">${x.name ? `<span class="val">${esc(x.name)}</span>` : '<span class="dots"></span>'}</span><span class="bt-role">${esc(x.label)}</span></div>`).join('')
        : `<div class="bt-row"><span class="bt-name"><span class="dots"></span></span><span class="bt-role">${label}</span></div>`;
      return `<div class="between"><div class="bt-lab">ระหว่าง</div><div class="brace" aria-hidden="true">${BRACE}</div><div class="bt-rows">${rows(b.pl, 'โจทก์')}<div class="bt-gap"></div>${rows(b.df, 'จำเลย')}</div></div>`;
    }
    case 'p': {
      const st = [];
      if (b.hang) st.push(`padding-left:${b.indent}cm;text-indent:-${b.hang}cm`);
      else if (b.indent) st.push(`text-indent:calc(${b.indent}cm + var(--ind-add, 0cm))`);
      if (b.align) st.push(`text-align:${b.align}`);
      const cls = ['p'];
      if (b.justify) cls.push('just');
      if (b.small) cls.push('small');
      if (b.gap) cls.push('gap');
      if (b.keep) cls.push('keep');
      return `<p class="${cls.join(' ')}" style="${st.join(';')}">${runsHtml(b.runs)}</p>`;
    }
    case 'center':
      return `<p class="p center${b.big ? ' big' : ''}${b.b ? ' b' : ''}${b.u ? ' u' : ''}">${esc(b.text)}</p>`;
    case 'sig':
      return `<div class="sig${b.compact ? ' compact' : ''}">${b.lines.map((l) => `<div class="sig-row"><div class="sig-line"><span>ลงชื่อ</span><span class="sig-dots"></span><span>${esc(l.label)}</span></div>${l.name ? `<div class="sig-name">${esc(l.name)}</div>` : ''}</div>`).join('')}</div>`;
    case 'flip': return '<div class="flip">(พลิก)</div>';
    case 'rule': return '<hr class="rule">';
    case 'lines': return Array.from({ length: b.n }, () => '<div class="dline"></div>').join('');
    case 'table': {
      const rows = [...b.rows];
      while (rows.length < (b.minRows || 0)) rows.push(b.head.map(() => ''));
      return `<table class="tbl"><colgroup>${b.widths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>
        <thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((cell, i) => `<td class="${i === 0 ? 'c' : ''}">${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    case 'pagebreak': return '<div class="pb"></div>';
    default: return '';
  }
}

export function docHtml(doc, layout) {
  const style = layoutCssVars(resolveLayout(layout, doc.id));
  return `<section class="page" data-doc="${esc(doc.id)}" style="${style}">${doc.blocks.map((b) => blockHtml(b, doc)).join('')}</section>`;
}

export function docsHtml(docs, layout) {
  return docs.map((d) => docHtml(d, layout)).join('');
}


