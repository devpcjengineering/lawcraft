// แบ่งเอกสารเป็นแผ่น A4 จริง (ไม่ใช่หน้ากระดาษยาวไปเรื่อย ๆ)
// วิธีทำ: วัดเอกสารใน iframe ที่ซ่อนอยู่ซึ่งมีเฉพาะ css/doc.css (ไม่ให้สไตล์ของหน้าแอปมาปนทำให้ความสูงเพี้ยน) → หาจุดตัดหน้าที่
// “ไม่ตัดกลางบรรทัด/ตาราง/ช่องลงชื่อ” → สร้างแผ่น A4 แต่ละแผ่นที่เปิดหน้าต่างมองเนื้อหาชุดเดียวกันคนละช่วง
// ใช้ทั้งในตัวอย่างข้างฟอร์มและในตัวดู/พิมพ์ PDF จึงเห็นตรงกัน จำนวนแผ่นเท่ากับที่พิมพ์ออกมาจริง
const PX_PER_MM = 96 / 25.4;
const PAGE_H = 297 * PX_PER_MM;
const PAD = 2; // เผื่อขอบล่างของบรรทัดสุดท้ายในเอกสาร (px)

/** กล่องของบรรทัดข้อความทุกบรรทัดในย่อหน้า (px, พิกัดหน้าจอของ doc) จัดกลุ่มตามกึ่งกลางแนวตั้งและระยะบรรทัดจริง */
function lineBoxes(el, doc) {
  const cs = doc.defaultView.getComputedStyle(el);
  const fs = parseFloat(cs.fontSize) || 21;
  const lh = parseFloat(cs.lineHeight) || fs * 1.32;
  // เส้นฐานตัวอักษร (baseline) ของบรรทัดแรก: วัดจากตัวตรวจขนาด 0 ที่วางต้นย่อหน้าชั่วคราว
  const probe = doc.createElement('span');
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
  el.insertBefore(probe, el.firstChild);
  const baseline0 = probe.getBoundingClientRect().bottom;
  probe.remove();
  const r = doc.createRange();
  r.selectNodeContents(el);
  const rects = [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0).sort((a, b) => (a.top + a.bottom) - (b.top + b.bottom));
  const lines = [];
  for (const q of rects) {
    const cy = (q.top + q.bottom) / 2;
    const last = lines[lines.length - 1];
    if (last && cy - last.cy < lh * 0.55) { last.top = Math.min(last.top, q.top); last.bottom = Math.max(last.bottom, q.bottom); last.cy = (last.top + last.bottom) / 2; } else lines.push({ top: q.top, bottom: q.bottom, cy });
  }
  const cy0 = lines.length ? lines[0].cy : 0;
  for (const l of lines) { l.base = baseline0 + (l.cy - cy0); l.fs = fs; l.lh = lh; }
  return lines;
}

function atomsOf(sec, base, doc) {
  const atoms = [];
  let pid = 0;
  for (const el of sec.children) {
    pid++;
    const rect = el.getBoundingClientRect();
    // ตัวคั่นหน้า (.pb จากบล็อก pagebreak, เช่น ด้านหลังหมายเรียกพยาน “คำเตือน”): อะตอมสูง 0 ที่บังคับให้อะตอมถัดไปขึ้นแผ่นใหม่
    if (el.classList.contains('pb')) { const y = rect.top - base; atoms.push({ top: y, bottom: y, cy: y, line: false, brk: true, pid, k: 0, n: 1 }); continue; }
    if (el.matches('p.p') && rect.height > 0) {
      const lines = lineBoxes(el, doc);
      if (lines.length) { lines.forEach((l, k) => atoms.push({ top: l.top - base, bottom: l.bottom - base, cy: l.cy - base, line: true, base: l.base - base, fs: l.fs, lh: l.lh, pid, k, n: lines.length })); continue; }
    }
    if (rect.height > 0) atoms.push({ top: rect.top - base, bottom: rect.bottom - base, cy: (rect.top + rect.bottom) / 2 - base, line: false, pid, k: 0, n: 1 });
  }
  return atoms;
}

/**
 * ตำแหน่งตัดระหว่างอะตอม p กับ a: บรรทัดกับบรรทัดตัดในช่องว่างระหว่าง “หมึก” ของสองบรรทัด
 * (ใต้หางตัวอักษรของบรรทัดบน ≈0.36em ใต้เส้นฐาน และเหนือสระ/วรรณยุกต์ของบรรทัดล่าง ≈0.88em เหนือเส้นฐาน) บล็อกอื่นตัดกลางช่องว่างระหว่างกัน
 */
function cutBetween(p, a) {
  // กรอบตัวอักษร (rect) ของบรรทัดบนครอบหมึกส่วนล่างทั้งหมดอยู่แล้ว (หางตัวอักษร/สระล่าง) จึงตัดใต้ขอบล่างของ rect เล็กน้อย
  // ส่วนวรรณยุกต์/สระบนของบรรทัดล่างอาจยื่นเหนือขอบบน rect ได้ ~3px จึงเหลือช่องว่างเหนือ rect ของบรรทัดล่างไว้ด้านบน
  if (p.line && a.line) {
    const gap = a.top - p.bottom;
    if (gap >= 4) return p.bottom + gap * 0.35;
    const lo = p.base + 0.36 * p.fs, hi = a.base - 0.88 * a.fs; // rect ซ้อนทับกัน: ใช้เส้นฐานตัดแทน
    return hi > lo ? (lo + hi) / 2 : (p.base + a.base) / 2 - 0.2 * p.fs;
  }
  return a.top >= p.bottom ? (p.bottom + a.top) / 2 : (p.cy + a.cy) / 2;
}

/** คืนช่วงเนื้อหาของแต่ละแผ่น [{start,end}] (px จากขอบบนของเนื้อหา) — ควบคุมบรรทัดเดี่ยว: ไม่ทิ้งบรรทัดแรก/บรรทัดสุดท้ายของย่อหน้าไว้โดดเดี่ยวต่างหน้า */
function breakPoints(atoms, H) {
  if (!atoms.length) return [{ start: 0, end: H }];
  const startOf = (ps) => (ps === 0 ? 0 : cutBetween(atoms[ps - 1], atoms[ps]));
  const endOf = (i) => (i + 1 < atoms.length ? cutBetween(atoms[i], atoms[i + 1]) : atoms[i].bottom + PAD);
  const starts = [0];
  let i = 0, ps = 0; // ps = ดัชนีอะตอมแรกของแผ่นปัจจุบัน
  while (i < atoms.length) {
    if (i - 1 > ps && atoms[i - 1].brk) { starts.push(i); ps = i; continue; } // ตัวคั่นหน้า: อะตอมนี้ขึ้นแผ่นใหม่
    // แผ่นที่ลงถึงอะตอม i ยังพอดีหรือไม่
    if (i > ps && endOf(i) - startOf(ps) > H) {
      let b = i; // อะตอม i ต้องขึ้นแผ่นใหม่
      const a = atoms[b], prev = atoms[b - 1];
      if (prev && a.pid === prev.pid && a.n >= 3 && b - 1 > ps) {
        if (a.k === a.n - 1) b -= 1; // บรรทัดสุดท้ายของย่อหน้าจะไปแผ่นใหม่คนเดียว → พาบรรทัดก่อนหน้าไปด้วย
        else if (a.k === 1) b -= 1; // บรรทัดแรกจะค้างท้ายแผ่นคนเดียว → ย้ายไปแผ่นใหม่ด้วย
      }
      starts.push(b); ps = b; i = b; continue;
    }
    i++;
  }
  return starts.map((b, s) => {
    const e = (starts[s + 1] ?? atoms.length) - 1;
    const top = startOf(b);
    return { start: top, end: Math.min(endOf(e), top + H) };
  });
}

function sheetsOf(sec, doc) {
  const cs = doc.defaultView.getComputedStyle(sec);
  const padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
  const H = PAGE_H - padT - padB;
  const base = sec.getBoundingClientRect().top + padT;
  const pages = breakPoints(atomsOf(sec, base, doc), H);
  return pages.map((pg, i) => {
    const sheet = doc.createElement('section');
    sheet.className = (sec.className + ' sheet').trim();
    for (const { name, value } of [...sec.attributes]) if (name !== 'class') sheet.setAttribute(name, value);
    sheet.dataset.pg = String(i + 1);
    sheet.dataset.of = String(pages.length);
    const clip = doc.createElement('div');
    clip.className = 'flow-clip';
    const bodyH = Math.max(1, Math.round(pg.end - pg.start));
    if (i === 0) { clip.style.top = '0'; clip.style.paddingTop = `${padT}px`; clip.style.height = `${bodyH + Math.round(padT)}px`; } // แผ่นแรก: เห็นขอบบนกระดาษด้วย (ตราครุฑเลื่อนขึ้นไปในขอบได้)
    else clip.style.height = `${bodyH}px`;
    const flow = doc.createElement('div');
    flow.className = 'flow';
    flow.style.marginTop = `-${Math.round(pg.start * 100) / 100}px`;
    for (const ch of sec.children) {
      const cl = ch.cloneNode(true);
      if (cl.classList?.contains('pb')) cl.style.breakAfter = 'auto'; // แบ่งหน้าแล้ว ไม่ต้องให้ตัวพิมพ์แบ่งซ้ำ
      flow.appendChild(cl);
    }
    clip.appendChild(flow);
    sheet.appendChild(clip);
    return sheet;
  });
}

// ---------- iframe สำหรับวัด (มีเฉพาะ css/doc.css) ----------
let measure = null, measureLoading = null;

/** เตรียม iframe วัดขนาด + ฟอนต์เอกสาร (เรียกครั้งเดียวตอนเริ่ม; คืน Promise เมื่อพร้อม) */
export function initMeasureFrame() {
  if (measure) return Promise.resolve(measure);
  if (measureLoading) return measureLoading;
  measureLoading = new Promise((resolve) => {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.style.cssText = 'position:absolute;left:-10000px;top:0;width:900px;height:1200px;border:0;visibility:hidden;pointer-events:none;';
    f.srcdoc = `<!doctype html><html lang="th"><head><meta charset="utf-8"><base href="${location.origin}/"><link rel="stylesheet" href="css/doc.css"></head><body style="margin:0"></body></html>`;
    f.onload = async () => {
      const d = f.contentDocument;
      try { await Promise.all([d.fonts.load('16px THSarabunIT9', 'ก'), d.fonts.load('bold 16px THSarabunIT9', 'ก')]); } catch { /* ใช้ฟอนต์สำรอง */ }
      measure = { frame: f, doc: d };
      resolve(measure);
    };
    document.body.appendChild(f);
  });
  return measureLoading;
}

/**
 * ย่อตัวอักษรของย่อหน้า .fit1 (หมายเหตุท้ายหมาย / ที่อยู่ผู้รับหมาย) ให้ข้อความทั้งหมดอยู่บรรทัดเดียวพอดีความกว้าง — ยิ่งยาวยิ่งเล็ก
 * ย่อได้ไม่เกิน 60% ของขนาดเดิม ถ้ายาวกว่านั้นให้ตัดขึ้นบรรทัดใหม่ตามปกติ (ยังอ่านได้) ผลฝังเป็น font-size ในแท็ก จึงตรงกันทั้งตัวอย่างและ PDF
 */
function fitOneLineParagraphs(host, doc) {
  for (const el of host.querySelectorAll('.p.fit1')) {
    const avail = el.clientWidth, need = el.scrollWidth;
    if (!avail || need <= avail + 1) continue;
    const fs0 = parseFloat(doc.defaultView.getComputedStyle(el).fontSize) || 21;
    const k = avail / need;
    if (k < 0.6) { el.style.fontSize = `${(fs0 * 0.6).toFixed(2)}px`; el.style.whiteSpace = 'normal'; } else el.style.fontSize = `${(fs0 * k * 0.995).toFixed(2)}px`; // 0.995 กันเศษทศนิยมล้นขอบ
  }
}

/** รับ HTML ของเอกสาร (หนึ่งหรือหลาย <section class="page">) คืน HTML ที่แบ่งเป็นแผ่น A4 แล้ว — ต้องเรียก initMeasureFrame() ให้เสร็จก่อนเพื่อผลที่ตรงกับตัวพิมพ์ */
export function paginateHtml(html) {
  const doc = measure?.doc || document;
  const host = doc.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;left:0;top:0;width:210mm;visibility:hidden;pointer-events:none;zoom:1;';
  host.innerHTML = html;
  doc.body.appendChild(host);
  try {
    fitOneLineParagraphs(host, doc);
    const out = [];
    for (const sec of [...host.children]) {
      if (sec.matches('section.page')) for (const s of sheetsOf(sec, doc)) out.push(s.outerHTML); else out.push(sec.outerHTML);
    }
    return out.join('');
  } finally { host.remove(); }
}

/** จำนวนแผ่นในผลลัพธ์ที่แบ่งหน้าแล้ว */
export const countSheets = (html) => (html.match(/<section class="[^"]*\bsheet\b/g) || []).length;

/** (เดิม) โหลดฟอนต์เอกสาร — ตอนนี้รวมอยู่ใน initMeasureFrame */
export const documentFontsReady = () => initMeasureFrame().then(() => {});
