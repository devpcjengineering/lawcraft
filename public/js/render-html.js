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
        <tbody>${rows.map((r) => `<tr>${r.map((cell, i) => {
          let val = cell;
          let cls = '';
          if (cell && typeof cell === 'object' && cell.text !== undefined) {
            val = cell.text;
            if (cell.small) cls = ' class="small"';
          }
          return `<td${cls}>${esc(val)}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table>`;
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

/** เรนเดอร์หน้าแผ่น A4 ตัวอย่างของเอกสารแนบท้าย */
export function attachmentDocHtml(att) {
  if (!att) return '';
  const headerText = att.headerText || 'เอกสารแนบท้าย';
  const headerPos = att.headerPos || 'center';
  const signPos = att.signPos || 'center';
  const signer = att.signer || '';
  const filename = att.filename || 'เอกสารแนบ.pdf';
  const pageCount = att.pageCount || 1;
  const parentLabel = att.parentLabel || '';
  const driveUrl = att.driveUrl || '';
  const blobUrl = att.blobUrl || '';

  // หากมีไฟล์ PDF ที่ประทับตราแล้วในเซสชัน ให้แสดงตัวอย่างไฟล์จริง
  if (blobUrl) {
    return `<section class="page sheet att-preview-sheet" data-doc="att-${escRaw(att.id)}" style="width: 210mm; min-height: 297mm; height: 297mm; padding: 0; margin: 0 auto 18px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,.18), 0 8px 24px rgba(0,0,0,.08); position: relative; overflow: hidden; box-sizing: border-box;">
      <iframe src="${escRaw(blobUrl)}#toolbar=0&navpanes=0" style="width: 100%; height: 100%; border: none; display: block;" title="${esc(headerText)}"></iframe>
    </section>`;
  }

  const headerAlign = headerPos === 'right' ? 'text-align: right;' : 'text-align: center;';
  const signAlign = signPos === 'right' ? 'right: 20mm;' : 'left: 50%; transform: translateX(-50%);';

  return `<section class="page sheet att-preview-sheet" data-doc="att-${escRaw(att.id)}" style="width: 210mm; height: 297mm; min-height: 297mm; margin: 0 auto 18px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,.18), 0 8px 24px rgba(0,0,0,.08); position: relative; box-sizing: border-box; overflow: hidden; font-family: 'THSarabunIT9', 'Sarabun', sans-serif;">
    <div style="position: absolute; inset: 0; padding: 25mm 20mm; box-sizing: border-box; pointer-events: none;">
      <div style="${headerAlign} font-size: 16pt; font-weight: bold; color: #000000; line-height: 1.4; margin-bottom: 24px; pointer-events: auto;">
        ${esc(headerText)}
      </div>

      <div style="border: 1px solid #e2e8f0; border-radius: 16px; background: #f8fafc; padding: 32px 24px; margin: 20px auto; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.02); max-width: 90%; pointer-events: auto;">
        <div style="width: 56px; height: 56px; border-radius: 16px; background: #eff6ff; color: #2563eb; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; box-shadow: 0 4px 12px rgba(37,99,235,0.12);">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"></path>
          </svg>
        </div>
        
        <div style="font-size: 16pt; font-weight: bold; color: #1e293b; margin-bottom: 6px; word-break: break-word; line-height: 1.3;">
          ${escRaw(filename)}
        </div>
        
        <div style="font-size: 14pt; color: #64748b; margin-bottom: 14px;">
          จำนวน ${esc(String(pageCount))} หน้า ${parentLabel ? `· แนบท้าย ${esc(parentLabel)}` : ''}
        </div>

        ${driveUrl ? `
          <a href="${escRaw(driveUrl)}" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; padding: 8px 20px; border-radius: 10px; font-size: 14pt; text-decoration: none; font-weight: 500; box-shadow: 0 4px 12px rgba(37,99,235,0.25);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
            </svg>
            เปิดดูเอกสารต้นฉบับใน Google Drive
          </a>
        ` : `
          <div style="display: inline-flex; align-items: center; gap: 6px; background: #e0f2fe; color: #0284c7; padding: 6px 16px; border-radius: 8px; font-size: 13pt; font-weight: 500;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            เอกสารแนบประทับตราแล้ว
          </div>
        `}
      </div>

      <div style="position: absolute; bottom: 25mm; ${signAlign} width: 250px; text-align: center; font-size: 16pt; color: #000000; line-height: 1.6; pointer-events: auto;">
        <div>สำเนาถูกต้อง</div>
        <div style="margin: 8px 0;">ลงชื่อ ..........................................</div>
        <div>( ${signer ? esc(signer) : '..........................................'} )</div>
      </div>
    </div>
  </section>`;
}



