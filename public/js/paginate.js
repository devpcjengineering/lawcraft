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
  // ฟอนต์ TH Sarabun IT๙: สระล่างที่ตามพยัญชนะ ฐ/ญ (ฐุ ญู ฐฺ) ถูกสลับเป็นรูปห้อยต่ำลงไปถึง ~0.42em ใต้เส้นฐาน (ลึกกว่ากรอบตัวอักษรที่ 0.25em) → เผื่อที่ตัดให้ลึกขึ้นเฉพาะย่อหน้าที่มีคู่นี้
  const low = /[ฐญ][ฺุู]/.test(el.textContent);
  for (const l of lines) { l.base = baseline0 + (l.cy - cy0); l.fs = fs; l.lh = lh; l.low = low; }
  return lines;
}

function atomsOf(sec, base, doc) {
  const atoms = [];
  const kids = []; // ตำแหน่งขอบบน + margin-top ของลูกแต่ละตัว (ดัชนี = pid - 1) ใช้ตอนตัดเนื้อหาให้แต่ละแผ่นเก็บเฉพาะส่วนที่เกี่ยวข้อง
  let pid = 0;
  for (const el of sec.children) {
    pid++;
    const rect = el.getBoundingClientRect();
    kids.push({ top: rect.top - base, mt: parseFloat(doc.defaultView.getComputedStyle(el).marginTop) || 0 });
    // ตัวคั่นหน้า (.pb จากบล็อก pagebreak, เช่น ด้านหลังหมายเรียกพยาน “คำเตือน”): อะตอมสูง 0 ที่บังคับให้อะตอมถัดไปขึ้นแผ่นใหม่
    if (el.classList.contains('pb')) { const y = rect.top - base; atoms.push({ top: y, bottom: y, cy: y, line: false, brk: true, pid, k: 0, n: 1 }); continue; }
    if (el.matches('p.p') && rect.height > 0) {
      const lines = lineBoxes(el, doc);
      if (lines.length) { lines.forEach((l, k) => atoms.push({ top: l.top - base, bottom: l.bottom - base, cy: l.cy - base, line: true, base: l.base - base, fs: l.fs, lh: l.lh, low: l.low, pid, k, n: lines.length })); continue; }
    }
    if (rect.height > 0) atoms.push({ top: rect.top - base, bottom: rect.bottom - base, cy: (rect.top + rect.bottom) / 2 - base, line: false, pid, k: 0, n: 1 });
  }
  return { atoms, kids };
}

/**
 * ตำแหน่งตัดระหว่างอะตอม p กับ a: บรรทัดกับบรรทัดตัดในช่องว่างระหว่าง “หมึก” ของสองบรรทัด
 * (ใต้หางตัวอักษรของบรรทัดบน ≈0.36em ใต้เส้นฐาน และเหนือสระ/วรรณยุกต์ของบรรทัดล่าง ≈0.88em เหนือเส้นฐาน) บล็อกอื่นตัดกลางช่องว่างระหว่างกัน
 */
function cutBetween(p, a) {
  // กรอบตัวอักษร (rect) ของบรรทัดบนครอบหมึกส่วนล่างทั้งหมดอยู่แล้ว (หางตัวอักษร/สระล่าง) จึงตัดใต้ขอบล่างของ rect เล็กน้อย
  // ส่วนวรรณยุกต์/สระบนของบรรทัดล่างอาจยื่นเหนือขอบบน rect ได้ ~3px จึงเหลือช่องว่างเหนือ rect ของบรรทัดล่างไว้ด้านบน
  if (p.line && a.line) {
    // ตัดกึ่งกลางช่องว่างระหว่าง “หมึก” ล่างสุดของบรรทัดบน (กรอบตัวอักษร ≈0.25em ใต้เส้นฐาน; ฐุ/ญู ห้อยถึง 0.43em) กับหมึกบนสุดของบรรทัดล่าง (วรรณยุกต์ ≈0.84em เหนือเส้นฐาน)
    // กึ่งกลางพอดี = เผื่อเท่ากันทั้งสองด้าน เพราะตอนพรีวิวถูกซูม (CSS zoom) ตัวอักษรเลื่อนขึ้น/ลงได้ราว ±1px จากที่วัดไว้
    const lo = Math.max(p.bottom, p.base + (p.low ? 0.43 : 0.25) * p.fs), hi = Math.min(a.top + 0.02 * a.fs, a.base - 0.84 * a.fs);
    return (lo + hi) / 2;
  }
  return a.top >= p.bottom ? (p.bottom + a.top) / 2 : (p.cy + a.cy) / 2;
}

/** คืนช่วงเนื้อหาของแต่ละแผ่น [{start,end}] (px จากขอบบนของเนื้อหา) — ควบคุมบรรทัดเดี่ยว: ไม่ทิ้งบรรทัดแรก/บรรทัดสุดท้ายของย่อหน้าไว้โดดเดี่ยวต่างหน้า */
function breakPoints(atoms, H) {
  if (!atoms.length) return [{ start: 0, end: H }];
  const startOf = (ps) => (ps === 0 ? 0 : cutBetween(atoms[ps - 1], atoms[ps]));
  const endOf = (i) => (i + 1 < atoms.length ? cutBetween(atoms[i], atoms[i + 1]) : Math.max(atoms[i].bottom + PAD, atoms[i].low ? atoms[i].base + 0.43 * atoms[i].fs + 1 : 0));
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
    return { start: top, end: Math.min(endOf(e), top + H), b, e }; // b..e = ช่วงอะตอมของแผ่นนี้
  });
}

function sheetsOf(sec, doc) {
  const cs = doc.defaultView.getComputedStyle(sec);
  const padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
  const H = PAGE_H - padT - padB;
  const base = sec.getBoundingClientRect().top + padT;
  const { atoms, kids } = atomsOf(sec, base, doc);
  const pages = breakPoints(atoms, H);
  const round2 = (v) => Math.round(v * 100) / 100;
  return pages.map((pg, i) => {
    const sheet = doc.createElement('section');
    sheet.className = (sec.className + ' sheet').trim();
    for (const { name, value } of [...sec.attributes]) if (name !== 'class') sheet.setAttribute(name, value);
    sheet.dataset.pg = String(i + 1);
    sheet.dataset.of = String(pages.length);
    const clip = doc.createElement('div');
    clip.className = 'flow-clip';
    const bodyH = Math.max(1, round2(pg.end - pg.start)); // ไม่ปัดเป็นจำนวนเต็ม: ปัดแล้วหน้าต่างตัดเลื่อนได้ถึง 0.5px ซึ่งกินช่องว่างระหว่างบรรทัดที่มีแค่ ~5px
    if (i === 0) { clip.style.top = '0'; clip.style.paddingTop = `${padT}px`; clip.style.height = `${round2(bodyH + padT)}px`; } // แผ่นแรก: เห็นขอบบนกระดาษด้วย (ตราครุฑเลื่อนขึ้นไปในขอบได้)
    else clip.style.height = `${bodyH}px`;
    const flow = doc.createElement('div');
    flow.className = 'flow';
    // สาเหตุที่เคยตัดผ่ากลางบรรทัด: เดิมทุกแผ่นใส่ทั้งเอกสารแล้วเลื่อนด้วย margin-top ติดลบ → ตอนพรีวิวถูกซูม (CSS zoom ที่ไม่ใช่ 1) ความสูงบรรทัด/ย่อหน้าถูกปัดเศษทีละ ~1/64px
    // ในทุกบรรทัดที่อยู่เหนือหน้าต่างมอง ยิ่งแผ่นท้าย ๆ ยิ่งสะสมจนเหลื่อมหลายพิกเซล (วัดได้ 3.5px ที่แผ่น 7 ซูม 0.9) ทำให้หน้าต่างที่วางไว้กลางช่องว่างไปตกกลางบรรทัด
    // จึง (1) ใส่เฉพาะบล็อกที่มีบรรทัดอยู่ในแผ่นนั้น (2) วางแต่ละบล็อกด้วย top ที่วัดไว้ (doc.css: .flow > * เป็น absolute) ความคลาดเคลื่อนไม่สะสมข้ามบล็อก/ข้ามแผ่น
    const a0 = atoms.length ? atoms[pg.b].pid : 1, a1 = atoms.length ? atoms[pg.e].pid : kids.length;
    for (const [ci, ch] of [...sec.children].entries()) {
      if (ci + 1 < a0 || ci + 1 > a1) continue;
      const cl = ch.cloneNode(true);
      cl.style.top = `${round2(kids[ci].top - kids[ci].mt - pg.start)}px`; // ขอบบนของกล่อง = top + margin-top → หัก margin-top ออกให้ขอบบนตรงตำแหน่งที่วัดไว้
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
