import { resolveLayout, layoutCssVars } from '/shared/layout.js';
import { thaiDigitsDoc } from '/shared/thai.js';
// แปลง blocks → HTML สำหรับพรีวิวและพิมพ์ PDF (ฟอนต์ TH Sarabun IT๙ ตามแบบฟอร์มศาล)

const escRaw = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** ข้อความที่มองเห็นในเอกสาร: เลขไทยเสมอ (เว้นอีเมล/ที่อยู่เว็บ) — buildDocuments แปลงแล้ว ที่นี่กันซ้ำอีกชั้น (idempotent) */
const esc = (s) => escRaw(thaiDigitsDoc(s));

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

// ปีกกา “{” ประกอบจากชิ้นส่วน: หัว (สูงคงที่) – เส้นตรงยืดได้ – ปลายแหลมกลาง (สูงคงที่) – เส้นตรงยืดได้ – ท้าย (สูงคงที่)
// ปลายหัว/ท้ายอยู่ที่ขอบบน/ล่างของกล่องปีกกาพอดี และ CSS (.brace) เว้นขอบบน/ล่างให้ตรงกึ่งกลางบรรทัดโจทก์/จำเลย; ปลายแหลมอยู่กึ่งกลางกล่องพอดี
const BRACE = [
  '<svg class="bc" viewBox="0 0 10 10" preserveAspectRatio="none"><path d="M10 0 C6.4 0 5 1.6 5 5 L5 10"/></svg>',
  '<svg class="bl" viewBox="0 0 10 1" preserveAspectRatio="none"><path d="M5 0 L5 1"/></svg>',
  '<svg class="bm" viewBox="0 0 10 10" preserveAspectRatio="none"><path d="M5 0 L5 2.4 C5 4.2 3 5 0 5 C3 5 5 5.8 5 7.6 L5 10"/></svg>',
  '<svg class="bl" viewBox="0 0 10 1" preserveAspectRatio="none"><path d="M5 0 L5 1"/></svg>',
  '<svg class="bc" viewBox="0 0 10 10" preserveAspectRatio="none"><path d="M5 0 L5 5 C5 8.4 6.4 10 10 10"/></svg>',
].join('');

const runsHtml = (runs) => (runs || []).map(runHtml).join('');
const dotField = (v, w = 8) => (v ? `<span class="val">${esc(v)}</span>` : `<span class="dots" style="min-width:${w}em"></span>`);

function blockHtml(b, doc) {
  switch (b.t) {
    case 'top':
      return `<div class="top${b.kinds ? ' kinds' : ''}">
        <div class="top-l"><span class="circle"></span><div><div>${b.formNo ? esc(b.formNo) : '&nbsp;'}</div><div class="top-title">${b.kinds ? `<div>${b.kinds.all.map((k) => `<span class="${k === b.kinds.on ? '' : 'strike'}">${esc(k)}</span>`).join(' / ')}</div>` : ''}${b.title ? esc(b.title).replace(/\n/g, '<br>') : ''}</div></div></div>
        <div class="top-c">${b.noEmblem ? '' : '<img src="/garuda.png" alt="ตราครุฑ">'}</div>
        <div class="top-r">${b.courtUse ? '<div class="court-use">สำหรับศาลใช้</div>' : ''}
          ${b.noEmblem && !b.black ? '' : `<div>คดีหมายเลขดำที่ ${dotField(b.black, 4.5)}/${dotField(b.yearBlack, 3)}</div>`}
          ${b.showRed && !b.noEmblem ? `<div>คดีหมายเลขแดงที่ ${dotField(b.red, 4.5)}/${dotField(b.yearRed, 3)}</div>` : ''}
        </div></div>`;
    case 'leader': return `<div class="ldr"><span>${esc(b.label)}</span><span class="ldr-fill"></span></div>`;
    case 'amount': return `<div class="ldr"><span>จำนวนทุนทรัพย์</span><span class="ldr-fill">${esc(b.baht)}</span><span>บาท</span><span class="ldr-fill s">${esc(b.satang)}</span><span>สตางค์</span></div>`;
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
      if (b.fit) cls.push('fit1');
      return `<p class="${cls.join(' ')}" style="${st.join(';')}">${runsHtml(b.runs)}</p>`;
    }
    case 'center':
      return `<p class="p center${b.big ? ' big' : ''}${b.b ? ' b' : ''}${b.u ? ' u' : ''}">${esc(b.text)}</p>`;
    case 'sig':
      return `<div class="sig${b.compact ? ' compact' : ''}">${b.lines.map((l) => `<div class="sig-row"><div class="sig-line"><span>ลงชื่อ</span><span class="sig-dots"></span><span>${esc(l.label)}</span></div>${l.name ? `<div class="sig-name">${esc(l.name)}</div>` : ''}</div>`).join('')}</div>`;
    case 'flip': return b.note ? `<div class="flip flip-n"><span>${esc(b.note)}</span><span>(พลิก)</span></div>` : '<div class="flip">(พลิก)</div>';
    case 'rule': return '<hr class="rule">';
    case 'lines': return Array.from({ length: b.n }, () => '<div class="dline"></div>').join('');
    case 'table': {
      const rows = [...b.rows];
      while (rows.length < (b.minRows || 0)) rows.push(b.head.map(() => ''));
      return `<table class="tbl"><colgroup>${b.widths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>
        <thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((cell, i) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    case 'pagebreak': return '<div class="pb"></div>';
    default: return '';
  }
}

export function docHtml(doc, layout) {
  const style = layoutCssVars(resolveLayout(layout, doc.id));
  // “ด้านหน้าห้ามล้น”: ส่วนหน้า (บล็อกก่อน pagebreak ตัวแรก; เอกสารแผ่นเดียวที่ตั้ง fitFront = ทั้งฉบับ) ห่อด้วย .fitseg
  // js/paginate.js วัดส่วนนี้แล้วย่อให้พอดีหนึ่งแผ่น A4 (พอดีอยู่แล้ว = ถอดตัวห่อออก ผลเหมือนเดิมทุกไบต์)
  const bi = doc.blocks.findIndex((b) => b.t === 'pagebreak');
  const n = bi > 0 ? bi : bi < 0 && doc.fitFront ? doc.blocks.length : 0;
  const parts = doc.blocks.map((b) => blockHtml(b, doc));
  const body = n ? `<div class="fitseg">${parts.slice(0, n).join('')}</div>${parts.slice(n).join('')}` : parts.join('');
  return `<section class="page" data-doc="${escRaw(doc.id)}" style="${style}">${body}</section>`;
}

export function docsHtml(docs, layout) {
  return docs.map((d) => docHtml(d, layout)).join('');
}


