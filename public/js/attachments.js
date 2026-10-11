import { S, esc, actions, hooks } from './store.js';
import { group, field, select, pageHead } from './ui.js';
import { icon } from './icons.js';
import { sideOf, partyLabel, partyName, plaintiffs, defendants } from '/shared/model.js';
import { toThaiDigits } from '/shared/thai.js';
import { confirmBox } from './modal.js';
import { backend } from './api.js';

// Load pdf-lib and fontkit lazily
async function loadPdfLib() {
  if (!window.PDFLib) {
    await new Promise((r) => { const s = document.createElement('script'); s.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'; s.onload = r; document.head.appendChild(s); });
    await new Promise((r) => { const s = document.createElement('script'); s.src = 'https://unpkg.com/@pdf-lib/fontkit@0.0.4/dist/fontkit.umd.js'; s.onload = r; document.head.appendChild(s); });
  }
  return window.PDFLib;
}

let fontBytes = null;
async function getFontBytes() {
  if (fontBytes) return fontBytes;
  const res = await fetch('/THSarabunIT9.ttf');
  fontBytes = await res.arrayBuffer();
  return fontBytes;
}

/** ตรวจหาผู้ลงลายมือชื่ออัตโนมัติตามฝั่งคดี (ทนายความ -> ผู้รับมอบอำนาจ -> คู่ความตัวจริง) */
export function resolveCaseSigner(c) {
  if (!c) return { name: '', role: '', full: '' };
  const isDef = sideOf(c) === 'defendant';
  const sideWord = isDef ? 'จำเลย' : 'โจทก์';

  // 1. ถ้ามีทนายความและเปิดใช้งาน
  if (c.counsel && c.counsel.enabled && (c.counsel.first || c.counsel.name)) {
    const role = `ทนายความ${sideWord}`;
    const name = `${c.counsel.prefix || ''}${c.counsel.first || c.counsel.name} ${c.counsel.last || ''}`.trim();
    return { name, role, full: `${name} (${role})` };
  }

  // 2. ถ้ามีผู้รับมอบอำนาจ
  if (c.proxy && (c.proxy.holder?.first || c.proxy.holder?.name)) {
    const p = c.proxy.holder;
    const role = `ผู้รับมอบอำนาจ${sideWord}`;
    const name = p.kind === 'juristic' ? (p.name || '').trim() : `${p.prefix || ''}${p.first || p.name} ${p.last || ''}`.trim();
    if (name) return { name, role, full: `${name} (${role})` };
  }

  // 3. คู่ความตัวจริงในฝั่ง (โจทก์ที่ 1 หรือ จำเลยที่ 1)
  const sideParties = isDef ? defendants(c) : plaintiffs(c);
  if (sideParties && sideParties.length > 0) {
    const p = sideParties[0];
    const name = partyName(p);
    const role = partyLabel(c, p);
    if (name) return { name, role, full: `${name} (${role})` };
  }

  // 4. กรณีทั่วไป
  if (c.parties && c.parties.length > 0) {
    const p = c.parties[0];
    const name = partyName(p);
    const role = partyLabel(c, p);
    if (name) return { name, role, full: `${name} (${role})` };
  }

  return { name: '', role: sideWord, full: '' };
}

/** ดึงชื่อประเภทเอกสารหลัก เช่น คำฟ้อง, คำให้การ, คำร้อง, คำแถลง, คำขอ, พยานเอกสาร */
export function getDocTypeName(c, typeRaw) {
  const isDef = sideOf(c) === 'defendant';
  if (typeRaw === 'complaint') {
    return isDef ? 'คำให้การ' : 'คำฟ้อง';
  }
  if (typeRaw.startsWith('motion_')) {
    const mid = typeRaw.replace('motion_', '');
    if (mid === 'statement') return 'คำแถลง';
    if (mid === 'petition') return 'คำขอ';
    if (mid === 'request') return 'คำร้อง';
    const m = (c?.motions || []).find(x => x.id === mid);
    if (m) {
      if (m.kind) return m.kind;
      if (m.title?.startsWith('คำแถลง')) return 'คำแถลง';
      if (m.title?.startsWith('คำขอ')) return 'คำขอ';
      if (m.title?.startsWith('คำร้อง')) return 'คำร้อง';
    }
    return 'คำร้อง';
  }
  if (typeRaw === 'motion') return 'คำร้อง';
  if (typeRaw.startsWith('evidence_') || typeRaw === 'evidence') {
    return 'พยานเอกสาร';
  }
  return 'คำฟ้อง';
}

/** ข้อความหัวเอกสารเริ่มต้นตามประเภทเอกสารที่ระบุ (คำฟ้อง / คำร้อง / คำแถลง / คำขอ) พร้อมเลขไทย */
export function getDefaultHeader(c, typeRaw, num) {
  const docType = getDocTypeName(c, typeRaw);
  const thaiNum = num ? toThaiDigits(num) : '';
  if (docType === 'พยานเอกสาร') {
    return thaiNum ? `พยานเอกสาร หมายเลข ${thaiNum}` : 'พยานเอกสาร หมายเลข ';
  }
  return thaiNum ? `เอกสารแนบท้าย${docType} หมายเลข ${thaiNum}` : `เอกสารแนบท้าย${docType} หมายเลข `;
}

/** คำอธิบายเอกสารหลักที่เอกสารนี้แนบท้าย */
function getParentLabel(c, typeRaw) {
  const isDef = sideOf(c) === 'defendant';
  if (typeRaw === 'complaint') {
    return isDef ? 'คำให้การ' : 'คำฟ้อง';
  }
  if (typeRaw.startsWith('motion_')) {
    const mid = typeRaw.replace('motion_', '');
    if (mid === 'statement') return 'คำแถลง';
    if (mid === 'petition') return 'คำขอ';
    if (mid === 'request') return 'คำร้อง';
    const m = (c.motions || []).find(x => x.id === mid);
    const kind = m?.kind || (m?.title?.startsWith('คำแถลง') ? 'คำแถลง' : m?.title?.startsWith('คำขอ') ? 'คำขอ' : 'คำร้อง');
    return m?.title ? `${kind}: ${m.title}` : kind;
  }
  if (typeRaw === 'motion') {
    return 'คำร้อง/คำแถลง';
  }
  if (typeRaw.startsWith('evidence_')) {
    const wid = typeRaw.replace('evidence_', '');
    const w = (c.witnesses || []).find(x => x.id === wid);
    const wName = (w?.name || w?.holder || 'เอกสาร').trim();
    return `พยานเอกสาร: ${wName}`;
  }
  return 'พยานเอกสาร';
}

/** ฟอร์แมตวันที่แบบไทยตามเวลาประเทศไทย (Asia/Bangkok) */
function formatThaiDateTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    const day = get('day');
    const mNum = parseInt(get('month'), 10) - 1;
    const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const month = thMonths[mNum] || '';
    const year = parseInt(get('year'), 10) + 543;
    let hour = get('hour');
    if (hour === '24') hour = '00';
    hour = String(hour).padStart(2, '0');
    const mins = String(get('minute')).padStart(2, '0');
    return `${day} ${month} ${year} ${hour}:${mins}`;
  } catch (e) {
    return d.toLocaleString('th-TH');
  }
}


export function tabAttachments() {
  const c = S.c;
  if (!c) return '';
  if (!Array.isArray(c.attachments)) c.attachments = [];

  const isDef = sideOf(c) === 'defendant';

  // 1. ตัวเลือกประเภทเอกสารแนบ (คำฟ้อง, คำร้อง, คำแถลง, คำขอ, พยานเอกสาร)
  const typeOptions = [];
  typeOptions.push(['complaint', isDef ? 'แนบท้ายคำให้การ' : 'แนบท้ายคำฟ้อง']);

  if (c.motions && c.motions.length > 0) {
    c.motions.forEach(m => {
      const kind = m.kind || (m.title?.startsWith('คำแถลง') ? 'คำแถลง' : m.title?.startsWith('คำขอ') ? 'คำขอ' : 'คำร้อง');
      const t = m.title ? `${kind}: ${m.title}` : kind;
      typeOptions.push([`motion_${m.id}`, `แนบท้าย${t}`]);
    });
  } else {
    typeOptions.push(['motion_request', 'แนบท้ายคำร้อง']);
    typeOptions.push(['motion_statement', 'แนบท้ายคำแถลง']);
    typeOptions.push(['motion_petition', 'แนบท้ายคำขอ']);
  }

  let docIdx = 1;
  let hasDocs = false;
  if (c.witnesses && c.witnesses.length > 0) {
    c.witnesses.forEach(w => {
      if (w.kind === 'document' || w.kind === 'object') {
        hasDocs = true;
        const name = (w.name || w.holder || (w.kind === 'document' ? 'เอกสาร' : 'วัตถุ')).trim();
        const prefix = w.kind === 'document' ? 'พยานเอกสาร' : 'พยานวัตถุ';
        typeOptions.push([`evidence_${w.id}`, `${prefix} ลำดับที่ ${docIdx}: ${name}`]);
        docIdx++;
      }
    });
  }
  if (!hasDocs) {
    typeOptions.push(['evidence', 'พยานเอกสาร']);
  }

  if (!S.ui.attachType || !typeOptions.find(o => o[0] === S.ui.attachType)) {
    S.ui.attachType = typeOptions[0][0];
  }

  // 2. ตรวจหาผู้ลงชื่ออัตโนมัติตามฝั่งคดี
  const autoSigner = resolveCaseSigner(c);
  if (S.ui.attachName === undefined || S.ui.attachName === '') {
    S.ui.attachName = autoSigner.name;
  }

  // 3. หมายเลขเอกสาร (ไม่ต้องขึ้นอัตโนมัติ ให้เป็นช่องว่างไว้รอผู้ใช้กรอก)
  if (S.ui.attachNum === undefined) {
    S.ui.attachNum = '';
  }

  // 4. ซิงก์ข้อความหัวเอกสารเริ่มต้น
  if (S.ui.attachLastType !== S.ui.attachType) {
    S.ui.attachLastType = S.ui.attachType;
    S.ui.attachHeaderText = getDefaultHeader(c, S.ui.attachType, S.ui.attachNum);
  }
  if (!S.ui.attachHeaderText) {
    S.ui.attachHeaderText = getDefaultHeader(c, S.ui.attachType, S.ui.attachNum);
  }

  // 5. ตำแหน่งเริ่มต้น: กึ่งกลางหน้ากระดาษ หรือ มุมขวาบน
  if (!S.ui.attachHeaderPos) S.ui.attachHeaderPos = 'center';
  if (!S.ui.attachSignPos) S.ui.attachSignPos = 'top-right';

  const headerPosOptions = [
    ['center', 'กึ่งกลางหน้ากระดาษ'],
    ['right', 'มุมขวาบน']
  ];

  const signPosOptions = [
    ['top-right', 'มุมขวาบน'],
    ['center', 'กึ่งกลางหน้ากระดาษ'],
    ['right', 'มุมขวาล่าง']
  ];

  // 6. รายการประวัติเอกสารแนบ
  const attachments = c.attachments || [];

  return `
  ${pageHead('จัดการเอกสารแนบ', 'อัปโหลดไฟล์ PDF หรือรูปภาพ ประทับตราหัวเอกสาร "เอกสารแนบท้าย..." ขนาด 16 พร้อมสำเนาถูกต้องและลงชื่อ')}
  
  <style>
    .attach-panel {
      background: var(--surface, #ffffff);
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.04);
      border: 1px solid var(--border, #e2e8f0);
      margin-bottom: 24px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .attach-panel:hover {
      box-shadow: 0 10px 28px rgba(0,0,0,0.06);
      border-color: #cbd5e1;
    }
    .attach-section-title {
      font-size: 1.15em;
      font-weight: 600;
      color: var(--primary, #2563eb);
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .attach-title-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .attach-badge-count {
      font-size: 0.8em;
      font-weight: 500;
      background: #eff6ff;
      color: #2563eb;
      padding: 4px 12px;
      border-radius: 999px;
      border: 1px solid #bfdbfe;
    }
    .auto-signer-banner {
      display: flex;
      align-items: center;
      gap: 16px;
      background: linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%);
      border: 1px solid #bbf7d0;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
    }
    .auto-signer-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #16a34a;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      flex-shrink: 0;
    }
    .auto-signer-body {
      flex: 1;
    }
    .auto-signer-label {
      font-size: 0.86em;
      font-weight: 600;
      color: #047857;
      margin-bottom: 2px;
    }
    .auto-signer-name {
      font-size: 1.1em;
      font-weight: 600;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .auto-signer-role-tag {
      font-size: 0.78em;
      font-weight: 500;
      background: #dcfce7;
      color: #15803d;
      padding: 2px 10px;
      border-radius: 6px;
      border: 1px solid #86efac;
    }
    .upload-box {
      position: relative;
      border: 2px dashed var(--primary-light, #93c5fd);
      border-radius: 16px;
      padding: 40px 24px;
      text-align: center;
      background: var(--bg-50, #eff6ff);
      cursor: pointer;
      transition: all 0.25s ease;
      overflow: hidden;
    }
    .upload-box:hover, .upload-box.drag-over {
      background: #dbeafe;
      border-color: var(--primary, #2563eb);
      transform: translateY(-2px);
    }
    .upload-box input[type="file"] {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      opacity: 0; cursor: pointer;
    }
    .upload-icon {
      color: var(--primary, #2563eb);
      margin-bottom: 12px;
      transition: transform 0.3s ease;
    }
    .upload-box:hover .upload-icon {
      transform: scale(1.08);
    }
    .upload-text {
      font-weight: 500;
      color: var(--text, #1e293b);
      font-size: 1.1em;
    }
    .upload-subtext {
      font-size: 0.88em;
      color: var(--text-muted, #64748b);
      margin-top: 6px;
    }
    .attach-actions {
      display: flex;
      gap: 16px;
      margin-top: 24px;
      flex-wrap: wrap;
    }
    .attach-actions .btn {
      flex: 1;
      justify-content: center;
      padding: 13px 20px;
      font-size: 1.02em;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      transition: all 0.2s ease;
    }
    .attach-actions .btn.primary {
      background: linear-gradient(135deg, var(--primary, #2563eb), #1d4ed8);
      color: white;
      border: none;
    }
    .attach-actions .btn.primary:hover {
      box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3);
      transform: translateY(-2px);
    }
    .attach-actions .btn.outline:hover {
      background: var(--bg-50, #f8fafc);
      transform: translateY(-2px);
    }
    
    /* รายการเอกสารแนบ */
    .att-table-wrap {
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 12px;
      margin-top: 12px;
      background: #ffffff;
    }
    .att-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95em;
      text-align: left;
    }
    .att-table th {
      background: #f8fafc;
      padding: 14px 16px;
      font-weight: 600;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
      white-space: nowrap;
    }
    .att-table td {
      padding: 16px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .att-table tr:last-child td {
      border-bottom: none;
    }
    .att-table tr:hover td {
      background: #f8fafc;
    }
    .badge-att-num {
      display: inline-block;
      font-weight: 600;
      color: #1e40af;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 0.92em;
      white-space: nowrap;
    }
    .badge-att-parent {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
      color: #6b21a8;
      background: #f3e8ff;
      border: 1px solid #e9d5ff;
      padding: 5px 12px;
      border-radius: 8px;
      font-size: 0.88em;
      white-space: nowrap;
    }
    .badge-att-parent-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #9333ea;
    }
    .att-file-title {
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 4px;
      word-break: break-word;
      overflow-wrap: break-word;
      line-height: 1.4;
    }
    .att-file-meta {
      font-size: 0.84em;
      color: #64748b;
    }
    .att-actions-col {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: flex-end;
      white-space: nowrap;
    }
    .btn-xs {
      padding: 6px 12px;
      font-size: 0.88em;
      border-radius: 6px;
    }
    .empty-attach-box {
      text-align: center;
      padding: 40px 16px;
      background: #f8fafc;
      border-radius: 12px;
      border: 1px dashed #cbd5e1;
      margin-top: 12px;
    }
    .empty-attach-icon {
      color: #94a3b8;
      margin-bottom: 12px;
    }
    .empty-attach-text {
      font-weight: 600;
      color: #334155;
      font-size: 1.05em;
    }
    .empty-attach-sub {
      font-size: 0.88em;
      color: #64748b;
      margin-top: 4px;
      max-width: 480px;
      margin-left: auto;
      margin-right: auto;
    }
  </style>

  <div class="attach-panel">
    <div class="attach-section-title">
      <div class="attach-title-left">
        ${icon('settings', { size: 22 })} ตั้งค่าเอกสารและคำรับรอง
      </div>
      <div class="attach-title-right" style="font-size: 14px; color: var(--text-muted, #64748b); font-weight: 500;">
        ชื่อผู้ลงนามบนเอกสาร: <b style="color: var(--text, #1e293b);">${esc(autoSigner.name || 'ยังไม่ได้ระบุ')}</b> ${autoSigner.role ? `<span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 6px; font-size: 12px; margin-left: 4px;">${esc(autoSigner.role)}</span>` : ''}
      </div>
    </div>

    <!-- บัตรระบุผู้ลงลายมือชื่อ -->
    <div class="auto-signer-banner">
      <div class="auto-signer-icon">${icon('userCheck', { size: 24 })}</div>
      <div class="auto-signer-body">
        <div class="auto-signer-label">ผู้ลงลายมือชื่อรับรองสำเนา</div>
        <div class="auto-signer-name">
          ${esc(autoSigner.name || 'ยังไม่ได้ระบุชื่อในข้อมูลคดี')}
          ${autoSigner.role ? `<span class="auto-signer-role-tag">${esc(autoSigner.role)}</span>` : ''}
        </div>
      </div>
    </div>

    <div class="grid">
      <label class="f s8">
        <span>ประเภทเอกสารแนบ</span>
        <select data-bind="@ui.attachType" data-onchange="onAttachTypeChange">
          ${typeOptions.map(([val, text]) => `<option value="${esc(val)}" ${String(val) === String(S.ui.attachType) ? 'selected' : ''}>${esc(text)}</option>`).join('')}
        </select>
      </label>

      <label class="f s4">
        <span>หมายเลข</span>
        <input type="text" value="${esc(S.ui.attachNum || '')}" data-bind="@ui.attachNum" data-oninput="onAttachNumChange" placeholder="เช่น 1">
      </label>
    </div>

    ${group('', `
      ${field('ข้อความหัวเอกสาร (ขนาด 16)', '@ui.attachHeaderText', { cls: 's8', ph: 'เช่น เอกสารแนบท้ายคำฟ้อง หมายเลข ๑', oninput: 'onAttachSettingChange' })}
      ${select('ตำแหน่งหัวเอกสาร', '@ui.attachHeaderPos', headerPosOptions, { cls: 's4', onchange: 'onAttachSettingChange' })}
    `)}

    ${group('', `
      ${field('ชื่อผู้ลงนามบนเอกสาร', '@ui.attachName', { cls: 's8', ph: 'ชื่อ-นามสกุล ผู้ลงลายมือชื่อ', oninput: 'onAttachSettingChange' })}
      ${select('ตำแหน่งลายมือชื่อ', '@ui.attachSignPos', signPosOptions, { cls: 's4', onchange: 'onAttachSettingChange' })}
    `)}
  </div>

  <div class="attach-panel">
    <div class="attach-section-title">
      <div class="attach-title-left">
        ${icon('fileText', { size: 22 })} อัปโหลดและประทับตรา
      </div>
    </div>
    
    <div class="upload-box" id="drop-zone">
      <div class="upload-icon">${icon('upload', { size: 50, stroke: 1.5 })}</div>
      <div class="upload-text" id="upload-status-text">ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</div>
      <div class="upload-subtext">รองรับไฟล์ PDF, JPG, PNG (ขนาดไม่เกิน 20MB) — เลือกแล้วแสดงตัวอย่างทันที</div>
      <input type="file" id="attachFile" accept="application/pdf,image/png,image/jpeg" onchange="actions.onFileSelected(this)">
    </div>

    <div class="attach-actions">
      <button type="button" class="btn outline" data-act="stampAttachment" data-mode="download">
        ${icon('download', { size: 18 })} ดาวน์โหลดลงเครื่อง
      </button>
      <button type="button" class="btn primary" data-act="stampAttachment" data-mode="drive">
        ${icon('cloud', { size: 18 })} ประทับตราและอัปโหลดขึ้น Google Drive
      </button>
    </div>
  </div>

  <!-- ส่วนแสดงรายการเอกสารแนบท้ายทั้งหมดที่แนบไปแล้ว -->
  <div class="attach-panel">
    <div class="attach-section-title">
      <div class="attach-title-left">
        ${icon('paperclip', { size: 22 })} รายการเอกสารแนบท้ายในคดีนี้
      </div>
      <span class="attach-badge-count">${attachments.length} รายการ</span>
    </div>

    ${attachments.length === 0 ? `
      <div class="empty-attach-box">
        <div class="empty-attach-icon">${icon('paperclip', { size: 36 })}</div>
        <div class="empty-attach-text">ยังไม่มีประวัติเอกสารแนบท้ายในคดีนี้</div>
        <div class="empty-attach-sub">เมื่อท่านประทับตราและดาวน์โหลดหรืออัปโหลดขึ้น Google Drive ระบบจะบันทึกลงในรายการนี้อัตโนมัติ เพื่อให้ทราบว่าเอกสารใดแนบท้ายเอกสารใด</div>
      </div>
    ` : `
      <div class="att-table-wrap">
        <table class="att-table">
          <thead>
            <tr>
              <th style="width: 28%;">หมายเลขเอกสาร</th>
              <th style="width: 25%;">แนบท้ายเอกสารหลัก</th>
              <th style="width: 32%;">ชื่อไฟล์และรายละเอียด</th>
              <th style="text-align: right; width: 15%;">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            ${attachments.map(att => `
              <tr>
                <td>
                  <span class="badge-att-num">${esc(att.headerText || ('หมายเลข ' + toThaiDigits(att.num || '')))}</span>
                </td>
                <td>
                  <span class="badge-att-parent">
                    <span class="badge-att-parent-dot"></span>
                    ${esc(att.parentLabel || 'เอกสารแนบท้าย')}
                  </span>
                </td>
                <td>
                  <div class="att-file-title">${esc(att.filename || 'เอกสาร.pdf')}</div>
                  <div class="att-file-meta">
                    ${att.pageCount ? `${att.pageCount} หน้า · ` : ''}
                    ลงชื่อ: ${esc(att.signer || 'ไม่ระบุ')} · 
                    ${formatThaiDateTime(att.createdAt)}
                  </div>
                </td>
                <td>
                  <div class="att-actions-col">
                    ${att.driveUrl ? `
                      <a href="${esc(att.driveUrl)}" target="_blank" rel="noopener" class="btn btn-xs primary" title="เปิดดูใน Google Drive">
                        ${icon('cloud', { size: 14 })} เปิดใน Drive
                      </a>
                    ` : ''}
                    <button type="button" class="btn btn-xs outline text-danger" data-act="delAttachment" data-id="${esc(att.id)}" title="ลบรายการนี้ออกจากประวัติ">
                      ${icon('trash', { size: 14 })} ลบ
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  </div>

  <script>
    // Drag & Drop visual feedback
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length) {
          const inp = document.getElementById('attachFile');
          if (inp) {
            inp.files = dt.files;
            document.getElementById('upload-status-text').innerText = 'เลือกไฟล์แล้ว: ' + dt.files[0].name;
            actions.onFileSelected(inp);
          }
        }
      });
    }
  </script>
  `;
}

// ---------------- Actions ----------------

actions.onAttachTypeChange = (el) => {
  S.ui.attachType = el.value;
  S.ui.attachHeaderText = getDefaultHeader(S.c, el.value, S.ui.attachNum);
  const hInp = document.querySelector('[data-bind="@ui.attachHeaderText"]');
  if (hInp) hInp.value = S.ui.attachHeaderText;
  if (S.ui.attachCurrentFile) updateAttachPreview(S.ui.attachCurrentFile);
  hooks.rerender();
};

actions.onAttachNumChange = (el) => {
  S.ui.attachNum = el.value;
  S.ui.attachHeaderText = getDefaultHeader(S.c, S.ui.attachType || 'complaint', el.value);
  const hInp = document.querySelector('[data-bind="@ui.attachHeaderText"]');
  if (hInp) hInp.value = S.ui.attachHeaderText;
  if (S.ui.attachCurrentFile) updateAttachPreview(S.ui.attachCurrentFile);
};

let settingTimer = null;
actions.onAttachSettingChange = () => {
  clearTimeout(settingTimer);
  settingTimer = setTimeout(() => {
    if (S.ui.attachCurrentFile) updateAttachPreview(S.ui.attachCurrentFile);
    else if (S.ui.attachCurrentPreview) {
      updateAttachPreview(null);
    }
  }, 200);
};

actions.onFileSelected = async (el) => {
  const file = el.files?.[0];
  if (!file) return;

  const statusEl = document.getElementById('upload-status-text');
  if (statusEl) statusEl.innerText = 'เลือกไฟล์แล้ว: ' + file.name;

  S.ui.attachCurrentFile = file;
  await updateAttachPreview(file);
};

export async function updateAttachPreview(file) {
  const typeRaw = S.ui.attachType || 'complaint';
  const num = S.ui.attachNum || '';
  const autoSigner = resolveCaseSigner(S.c);
  const name = S.ui.attachName !== undefined ? S.ui.attachName : autoSigner.name;
  const headerPos = S.ui.attachHeaderPos || 'center';
  const signPos = S.ui.attachSignPos || 'top-right';
  const rawHeaderText = S.ui.attachHeaderText || getDefaultHeader(S.c, typeRaw, num);
  const headerText = toThaiDigits(rawHeaderText);

  // 1. เด้ง preview ขึ้นมาทันที
  S.ui.pvOn = true;
  S.ui.pvDoc = 'att-current';

  if (!S.ui.attachCurrentPreview) {
    S.ui.attachCurrentPreview = {
      id: 'current',
      type: typeRaw,
      parentLabel: getParentLabel(S.c, typeRaw),
      num: num,
      headerText: headerText,
      headerPos: headerPos,
      signPos: signPos,
      filename: file?.name || 'เอกสารแนบ.pdf',
      signer: name,
      pageCount: 1,
      createdAt: new Date().toISOString(),
      blobUrl: '',
    };
  } else {
    S.ui.attachCurrentPreview.headerText = headerText;
    S.ui.attachCurrentPreview.headerPos = headerPos;
    S.ui.attachCurrentPreview.signPos = signPos;
    S.ui.attachCurrentPreview.signer = name;
    S.ui.attachCurrentPreview.num = num;
    S.ui.attachCurrentPreview.parentLabel = getParentLabel(S.c, typeRaw);
    if (file) S.ui.attachCurrentPreview.filename = file.name;
  }

  hooks.preview();

  // 2. ถ้ามีไฟล์ ให้ประทับตราสดในหน่วยความจำ เพื่อให้แสดงตัวอย่างไฟล์จริงทันที
  if (file) {
    try {
      const PDFLib = await loadPdfLib();
      let pdfDoc;
      if (file.type === 'application/pdf') {
        const fileBytes = await file.arrayBuffer();
        pdfDoc = await PDFLib.PDFDocument.load(fileBytes);
      } else if (file.type.startsWith('image/')) {
        pdfDoc = await PDFLib.PDFDocument.create();
        const imageBytes = await file.arrayBuffer();
        let image;
        if (file.type === 'image/jpeg') image = await pdfDoc.embedJpg(imageBytes);
        else if (file.type === 'image/png') image = await pdfDoc.embedPng(imageBytes);
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }

      if (pdfDoc) {
        pdfDoc.registerFontkit(window.fontkit);
        const customFont = await pdfDoc.embedFont(await getFontBytes());
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();
        const textSize = 16;
        const color = PDFLib.rgb(0, 0, 0);

        const hw = customFont.widthOfTextAtSize(headerText, textSize);
        const hX = headerPos === 'center' ? (width - hw) / 2 : width - hw - 54;
        const hY = height - 54;
        firstPage.drawText(headerText, { x: hX, y: hY, size: textSize, font: customFont, color });

        const line1 = 'สำเนาถูกต้อง';
        const line2 = 'ลงชื่อ ..........................................';
        const line3 = name ? `( ${name} )` : '( .......................................... )';
        const w1 = customFont.widthOfTextAtSize(line1, textSize);
        const w2 = customFont.widthOfTextAtSize(line2, textSize);
        const w3 = customFont.widthOfTextAtSize(line3, textSize);
        const blockW = Math.max(w1, w2, w3);

        const baseX = signPos === 'center' ? (width - blockW) / 2 : width - blockW - 54;
        const x1 = baseX + (blockW - w1) / 2;
        const x2 = baseX + (blockW - w2) / 2;
        const x3 = baseX + (blockW - w3) / 2;

        const lineGap = 24;
        const startY = signPos === 'top-right' ? (headerPos === 'right' ? hY - 30 : hY) : 115;

        firstPage.drawText(line1, { x: x1, y: startY, size: textSize, font: customFont, color });
        firstPage.drawText(line2, { x: x2, y: startY - lineGap, size: textSize, font: customFont, color });
        firstPage.drawText(line3, { x: x3, y: startY - (lineGap * 2), size: textSize, font: customFont, color });

        for (let pIdx = 1; pIdx < pages.length; pIdx++) {
          const page = pages[pIdx];
          const pSize = page.getSize();
          const pBaseX = signPos === 'center' ? (pSize.width - blockW) / 2 : pSize.width - blockW - 54;
          const px1 = pBaseX + (blockW - w1) / 2;
          const px2 = pBaseX + (blockW - w2) / 2;
          const px3 = pBaseX + (blockW - w3) / 2;
          const pStartY = signPos === 'top-right' ? pSize.height - 54 : 115;
          page.drawText(line1, { x: px1, y: pStartY, size: textSize, font: customFont, color });
          page.drawText(line2, { x: px2, y: pStartY - lineGap, size: textSize, font: customFont, color });
          page.drawText(line3, { x: px3, y: pStartY - (lineGap * 2), size: textSize, font: customFont, color });
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        if (S.ui.attachCurrentPreview?.blobUrl) {
          try { URL.revokeObjectURL(S.ui.attachCurrentPreview.blobUrl); } catch (_) {}
        }
        const blobUrl = URL.createObjectURL(blob);
        if (S.ui.attachCurrentPreview) {
          S.ui.attachCurrentPreview.blobUrl = blobUrl;
          S.ui.attachCurrentPreview.pageCount = pages.length;
          hooks.preview();
        }
      }
    } catch (err) {
      console.warn('Live preview stamp error:', err);
    }
  }
}

actions.delAttachment = async (el) => {
  const id = el.dataset.id;
  const att = (S.c?.attachments || []).find(a => a.id === id);
  const name = att ? (att.headerText || att.filename || 'เอกสารนี้') : 'เอกสารนี้';

  const ok = await confirmBox(`ต้องการลบประวัติรายการ "${name}" ออกจากคดีหรือไม่?`, {
    title: 'ยืนยันการลบเอกสารแนบ',
    okText: 'ลบรายการ',
    cancelText: 'ยกเลิก',
    danger: true,
  });

  if (!ok) return;

  if (S.c && Array.isArray(S.c.attachments)) {
    const target = S.c.attachments.find(a => a.id === id);
    if (target?.blobUrl) {
      try { URL.revokeObjectURL(target.blobUrl); } catch (_) { }
    }
    S.c.attachments = S.c.attachments.filter(a => a.id !== id);
    if (S.ui.pvDoc === `att-${id}`) {
      S.ui.pvDoc = 'complaint';
    }
    hooks.changed();
    hooks.rerender();
    hooks.preview();
    hooks.toast('ลบรายการเอกสารแนบแล้ว');
  }
};

actions.stampAttachment = async (el) => {
  const fileInput = document.getElementById('attachFile');
  if (!fileInput || !fileInput.files.length) return hooks.toast('กรุณาเลือกไฟล์ที่ต้องการประทับตรา');
  const file = fileInput.files[0];

  const typeRaw = S.ui.attachType || 'complaint';
  const num = S.ui.attachNum || '';
  const name = S.ui.attachName !== undefined ? S.ui.attachName : resolveCaseSigner(S.c).name;
  const headerPos = S.ui.attachHeaderPos || 'center';
  const signPos = S.ui.attachSignPos || 'top-right';
  const rawHeaderText = S.ui.attachHeaderText || getDefaultHeader(S.c, typeRaw, num);
  const headerText = toThaiDigits(rawHeaderText);
  const mode = el.dataset.mode;

  hooks.toast('กำลังประมวลผลไฟล์...');

  try {
    const PDFLib = await loadPdfLib();
    let pdfDoc;

    if (file.type === 'application/pdf') {
      const fileBytes = await file.arrayBuffer();
      pdfDoc = await PDFLib.PDFDocument.load(fileBytes);
    } else if (file.type.startsWith('image/')) {
      pdfDoc = await PDFLib.PDFDocument.create();
      const imageBytes = await file.arrayBuffer();
      let image;
      if (file.type === 'image/jpeg') image = await pdfDoc.embedJpg(imageBytes);
      else if (file.type === 'image/png') image = await pdfDoc.embedPng(imageBytes);

      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    } else {
      return hooks.toast('รองรับเฉพาะไฟล์ PDF, JPG และ PNG');
    }

    pdfDoc.registerFontkit(window.fontkit);
    const customFont = await pdfDoc.embedFont(await getFontBytes());
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // 1. ขนาดตัวอักษร 16 ตามแบบศาล
    const textSize = 16;
    const color = PDFLib.rgb(0, 0, 0);

    // 2. ประทับตราหัวกระดาษ "เอกสารแนบท้าย..." ขนาด 16
    const hw = customFont.widthOfTextAtSize(headerText, textSize);
    let hX;
    if (headerPos === 'center') {
      hX = (width - hw) / 2;
    } else {
      hX = width - hw - 54;
    }
    const hY = height - 54;
    firstPage.drawText(headerText, { x: hX, y: hY, size: textSize, font: customFont, color });

    // 3. ประทับตราคำรับรองสำเนาถูกต้องและลงชื่อ (ขนาด 16)
    const line1 = 'สำเนาถูกต้อง';
    const line2 = 'ลงชื่อ ..........................................';
    const line3 = name ? `( ${name} )` : '( .......................................... )';

    const w1 = customFont.widthOfTextAtSize(line1, textSize);
    const w2 = customFont.widthOfTextAtSize(line2, textSize);
    const w3 = customFont.widthOfTextAtSize(line3, textSize);
    const blockW = Math.max(w1, w2, w3);

    let baseX;
    if (signPos === 'center') {
      baseX = (width - blockW) / 2;
    } else {
      baseX = width - blockW - 54;
    }

    const x1 = baseX + (blockW - w1) / 2;
    const x2 = baseX + (blockW - w2) / 2;
    const x3 = baseX + (blockW - w3) / 2;

    const lineGap = 24;
    let startY;
    if (signPos === 'top-right') {
      startY = headerPos === 'right' ? hY - 30 : hY;
    } else {
      startY = 115;
    }

    firstPage.drawText(line1, { x: x1, y: startY, size: textSize, font: customFont, color });
    firstPage.drawText(line2, { x: x2, y: startY - lineGap, size: textSize, font: customFont, color });
    firstPage.drawText(line3, { x: x3, y: startY - (lineGap * 2), size: textSize, font: customFont, color });

    for (let pIdx = 1; pIdx < pages.length; pIdx++) {
      const page = pages[pIdx];
      const pSize = page.getSize();
      const pBaseX = signPos === 'center' ? (pSize.width - blockW) / 2 : pSize.width - blockW - 54;
      const px1 = pBaseX + (blockW - w1) / 2;
      const px2 = pBaseX + (blockW - w2) / 2;
      const px3 = pBaseX + (blockW - w3) / 2;
      const pStartY = signPos === 'top-right' ? pSize.height - 54 : 115;
      page.drawText(line1, { x: px1, y: pStartY, size: textSize, font: customFont, color });
      page.drawText(line2, { x: px2, y: pStartY - lineGap, size: textSize, font: customFont, color });
      page.drawText(line3, { x: px3, y: pStartY - (lineGap * 2), size: textSize, font: customFont, color });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const outputName = `${typeRaw}_${num || '1'}.pdf`;
    const blobUrl = URL.createObjectURL(blob);

    // 4. บันทึกประวัติรายการเอกสารแนบท้ายลงในคดี (แสดงว่าเอกสารไหนแนบท้ายตัวไหน)
    const record = {
      id: Math.random().toString(36).slice(2, 10),
      type: typeRaw,
      parentLabel: getParentLabel(S.c, typeRaw),
      num: num,
      headerText: headerText,
      headerPos: headerPos,
      signPos: signPos,
      filename: file.name,
      signer: name,
      pageCount: pages.length,
      createdAt: new Date().toISOString(),
      mode: mode,
      driveUrl: '',
      driveId: '',
      blobUrl: blobUrl,
    };

    if (!Array.isArray(S.c.attachments)) S.c.attachments = [];
    S.c.attachments.unshift(record);
    if (S.ui.attachCurrentPreview?.blobUrl) {
      try { URL.revokeObjectURL(S.ui.attachCurrentPreview.blobUrl); } catch (_) {}
    }
    S.ui.attachCurrentPreview = null;
    S.ui.attachCurrentFile = null;
    S.ui.pvDoc = `att-${record.id}`;
    hooks.changed();
    hooks.rerender();
    hooks.preview();

    if (mode === 'download') {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = outputName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // ไม่ revoke ทันที เพื่อให้ preview pane ยังคงแสดงผลไฟล์จริงในเซสชันได้
      hooks.toast('สร้างและดาวน์โหลดไฟล์สำเร็จ');
    } else if (mode === 'drive') {
      uploadToGoogleDrive(blob, outputName, record);
    }
  } catch (err) {
    console.error(err);
    hooks.toast('เกิดข้อผิดพลาดในการประทับตรา: ' + err.message);
  }
};

// ------ Google Drive API ------
let gTokenClient;
const GOOGLE_API_KEY = window.GOOGLE_API_KEY || 'AIzaSyBIRxZF7obWCoLR4Nd7xUUjAGFxiyHHXe8';

async function uploadToGoogleDrive(blob, filename, record) {
  // 1. ดึง provider_token จาก Supabase Auth
  let token = null;
  try {
    if (backend && backend.providerToken) {
      token = await backend.providerToken();
    }
  } catch (err) {
    console.warn('Error reading providerToken:', err);
  }

  if (token) {
    return executeDriveUpload(token, blob, filename, record);
  }

  // 2. ถ้ามี Google OAuth Client ID
  if (window.GOOGLE_CLIENT_ID) {
    if (!window.google) {
      hooks.toast('กำลังโหลด Google API...');
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = () => initDriveAuth(blob, filename, record);
      document.head.appendChild(s);
    } else {
      initDriveAuth(blob, filename, record);
    }
    return;
  }

  // 3. ขอสิทธิ์ผ่าน Google
  hooks.toast('ยังไม่ได้รับสิทธิ์เข้าถึง Google Drive');
  const relogin = confirm('ยังไม่พบสิทธิ์ Google Drive สำหรับบัญชีนี้ (หรือเซสชันหมดอายุ)\n\nต้องการเข้าสู่ระบบด้วย Google อีกครั้งเพื่ออนุญาตสิทธิ์เข้าถึง Google Drive ทันทีหรือไม่?');
  if (relogin && backend && backend.signInWithGoogle) {
    await backend.signInWithGoogle();
  }
}

function initDriveAuth(blob, filename, record) {
  const CLIENT_ID = window.GOOGLE_CLIENT_ID;
  if (!CLIENT_ID) {
    hooks.toast('กรุณาระบุ Google Client ID หรือเข้าสู่ระบบด้วย Google ใหม่');
    return;
  }

  if (!gTokenClient) {
    gTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          executeDriveUpload(tokenResponse.access_token, blob, filename, record);
        }
      },
    });
  }
  gTokenClient.requestAccessToken({ prompt: 'consent' });
}

async function executeDriveUpload(accessToken, blob, filename, record) {
  hooks.toast('กำลังอัปโหลดขึ้น Google Drive...');
  const metadata = { name: filename, mimeType: 'application/pdf' };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  try {
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart${GOOGLE_API_KEY ? `&key=${GOOGLE_API_KEY}` : ''}&fields=id,name,webViewLink`;
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken },
      body: form
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.id && record) {
        record.driveId = data.id;
        record.driveUrl = data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`;
        hooks.changed();
        hooks.rerender();
        hooks.preview();
      }
      hooks.toast('อัปโหลดขึ้น Google Drive สำเร็จ!');
    } else {
      const err = await res.json();
      hooks.toast('อัปโหลดไม่สำเร็จ: ' + (err.error?.message || 'Unknown error'));
    }
  } catch (e) {
    hooks.toast('อัปโหลดไม่สำเร็จ: ' + e.message);
  }
}
