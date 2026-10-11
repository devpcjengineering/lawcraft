import { S, esc, actions, hooks } from './store.js';
import { group, field, select, pageHead } from './ui.js';
import { icon } from './icons.js';
import { sideOf, partyLabel, partyName, plaintiffs, defendants } from '/shared/model.js';
import { toThaiDigits } from '/shared/thai.js';
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

/** ตรวจหาผู้ลงลายมือชื่ออัตโนมัติจากฝั่งคดี (ทนายความ -> ผู้รับมอบอำนาจ -> คู่ความตัวจริง) */
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

/** คำนวณหมายเลขเอกสารถัดไปอัตโนมัติ */
function getAutoNum(c, typeRaw) {
  if (!c) return '๑';
  const list = c.attachments || [];
  let nextNum = 1;

  if (typeRaw.startsWith('evidence_')) {
    const wid = typeRaw.replace('evidence_', '');
    let docIdx = 1;
    let found = 1;
    (c.witnesses || []).forEach(w => {
      if (w.kind === 'document' || w.kind === 'object') {
        if (w.id === wid) found = docIdx;
        docIdx++;
      }
    });
    nextNum = found;
  } else if (typeRaw === 'evidence') {
    nextNum = list.filter(a => (a.type || '').startsWith('evidence')).length + 1;
  } else if (typeRaw.startsWith('motion_') || typeRaw === 'motion') {
    nextNum = list.filter(a => a.type === typeRaw).length + 1;
  } else {
    // complaint
    nextNum = list.filter(a => a.type === 'complaint').length + 1;
  }

  return c.options?.thaiDigits !== false ? toThaiDigits(nextNum) : String(nextNum);
}

/** ข้อความหัวเอกสารเริ่มต้น */
function getDefaultHeader(typeRaw, num) {
  if (typeRaw.startsWith('evidence_') || typeRaw === 'evidence') {
    return `พยานเอกสาร หมายเลข ${num}`;
  }
  return `เอกสารแนบท้ายหมายเลข ${num}`;
}

/** คำอธิบายเอกสารหลักที่เอกสารนี้แนบท้าย */
function getParentLabel(c, typeRaw) {
  const isDef = sideOf(c) === 'defendant';
  if (typeRaw === 'complaint') {
    return isDef ? 'คำให้การ' : 'คำฟ้อง';
  }
  if (typeRaw.startsWith('motion_')) {
    const mid = typeRaw.replace('motion_', '');
    const m = (c.motions || []).find(x => x.id === mid);
    return `คำร้อง: ${m?.title || 'คำร้อง/คำแถลง'}`;
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

/** ฟอร์แมตวันที่แบบไทย */
function formatThaiDateTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const day = d.getDate();
  const month = thMonths[d.getMonth()];
  const year = d.getFullYear() + 543;
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hours}:${mins}`;
}

export function tabAttachments() {
  const c = S.c;
  if (!c) return '';
  if (!Array.isArray(c.attachments)) c.attachments = [];

  const isDef = sideOf(c) === 'defendant';

  // 1. ตัวเลือกประเภทเอกสารแนบ
  const typeOptions = [];
  typeOptions.push(['complaint', isDef ? 'แนบท้ายคำให้การ' : 'แนบท้ายคำฟ้อง']);

  if (c.motions && c.motions.length > 0) {
    c.motions.forEach(m => {
      const t = m.title || 'คำร้อง/คำแถลง';
      typeOptions.push([`motion_${m.id}`, `แนบท้ายคำร้อง: ${t}`]);
    });
  } else {
    typeOptions.push(['motion', 'แนบท้ายคำร้อง/คำแถลง']);
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
    typeOptions.push(['evidence', 'พยานเอกสาร (ยังไม่มีในบัญชี)']);
  }

  if (!S.ui.attachType || !typeOptions.find(o => o[0] === S.ui.attachType)) {
    S.ui.attachType = typeOptions[0][0];
  }

  // 2. ตรวจหาผู้ลงชื่ออัตโนมัติตามฝั่งคดี
  const autoSigner = resolveCaseSigner(c);
  if (S.ui.attachName === undefined || S.ui.attachName === '') {
    S.ui.attachName = autoSigner.name;
  }

  // 3. ซิงก์หมายเลขและข้อความหัวเอกสารอัตโนมัติ
  if (S.ui.attachLastType !== S.ui.attachType) {
    S.ui.attachLastType = S.ui.attachType;
    S.ui.attachNum = getAutoNum(c, S.ui.attachType);
    S.ui.attachHeaderText = getDefaultHeader(S.ui.attachType, S.ui.attachNum);
  }
  if (!S.ui.attachNum) {
    S.ui.attachNum = getAutoNum(c, S.ui.attachType);
  }
  if (!S.ui.attachHeaderText) {
    S.ui.attachHeaderText = getDefaultHeader(S.ui.attachType, S.ui.attachNum);
  }

  // 4. ตำแหน่งเริ่มต้น (กึ่งกลาง หรือ มุมขวา)
  if (!S.ui.attachHeaderPos) S.ui.attachHeaderPos = 'right';
  if (!S.ui.attachSignPos) S.ui.attachSignPos = 'right';

  const headerPosOptions = [
    ['right', 'มุมขวาบน (มาตรฐาน)'],
    ['center', 'กึ่งกลางหน้ากระดาษ (ด้านบน)']
  ];

  const signPosOptions = [
    ['right', 'มุมขวาล่าง (มาตรฐาน)'],
    ['center', 'กึ่งกลางหน้ากระดาษ (ด้านล่าง)']
  ];

  // 5. รายการประวัติเอกสารแนบ
  const attachments = c.attachments || [];

  return `
  ${pageHead('จัดการเอกสารแนบ', 'อัปโหลดไฟล์ PDF หรือรูปภาพ ประทับตราหัวเอกสาร "เอกสารแนบท้ายหมายเลข..." ขนาด 16 พร้อมสำเนาถูกต้องและลงชื่ออัตโนมัติ')}
  
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
      font-size: 0.82em;
      font-weight: 600;
      color: #047857;
      text-transform: uppercase;
      letter-spacing: 0.5px;
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
      overflow-x: auto;
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 12px;
      margin-top: 12px;
    }
    .att-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95em;
      text-align: left;
    }
    .att-table th {
      background: #f8fafc;
      padding: 12px 16px;
      font-weight: 600;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
      white-space: nowrap;
    }
    .att-table td {
      padding: 14px 16px;
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
      color: #1e3a8a;
      background: #dbeafe;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.9em;
      white-space: nowrap;
    }
    .badge-att-parent {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
      color: #6b21a8;
      background: #f3e8ff;
      padding: 4px 10px;
      border-radius: 6px;
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
      font-weight: 500;
      color: #1e293b;
      margin-bottom: 2px;
      word-break: break-all;
    }
    .att-file-meta {
      font-size: 0.82em;
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
      padding: 5px 10px;
      font-size: 0.85em;
      border-radius: 6px;
    }
    .empty-attach-box {
      text-align: center;
      padding: 36px 16px;
      background: #f8fafc;
      border-radius: 12px;
      border: 1px dashed #cbd5e1;
      margin-top: 12px;
    }
    .empty-attach-icon {
      color: #94a3b8;
      margin-bottom: 10px;
    }
    .empty-attach-text {
      font-weight: 500;
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
    </div>

    <!-- บัตรระบุผู้ลงลายมือชื่ออัตโนมัติตามฝั่งคดี -->
    <div class="auto-signer-banner">
      <div class="auto-signer-icon">${icon('userCheck', { size: 24 })}</div>
      <div class="auto-signer-body">
        <div class="auto-signer-label">ผู้ลงลายมือชื่อรับรองสำเนา (ระบบระบุให้อัตโนมัติสำหรับฝั่ง${isDef ? 'จำเลย' : 'โจทก์'})</div>
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
        <input type="text" value="${esc(S.ui.attachNum)}" data-bind="@ui.attachNum" data-oninput="onAttachNumChange" placeholder="เช่น ๑ หรือ 1">
      </label>
    </div>

    ${group('', `
      ${field('ข้อความหัวเอกสาร (ขนาด 16)', '@ui.attachHeaderText', { cls: 's8', ph: 'เช่น เอกสารแนบท้ายหมายเลข ๑' })}
      ${select('ตำแหน่งหัวเอกสาร', '@ui.attachHeaderPos', headerPosOptions, { cls: 's4' })}
    `)}

    ${group('', `
      ${field('ชื่อผู้ลงนามบนเอกสาร (ปรับเปลี่ยนได้หากต้องการ)', '@ui.attachName', { cls: 's8', ph: 'ชื่อ-นามสกุล ผู้ลงลายมือชื่อ' })}
      ${select('ตำแหน่งลายมือชื่อ', '@ui.attachSignPos', signPosOptions, { cls: 's4' })}
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
      <div class="upload-subtext">รองรับไฟล์ PDF, JPG, PNG (ขนาดไม่เกิน 20MB)</div>
      <input type="file" id="attachFile" accept="application/pdf,image/png,image/jpeg" onchange="const f=this.files[0];if(f)document.getElementById('upload-status-text').innerText='เลือกไฟล์แล้ว: '+f.name;">
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
              <th style="width: 25%;">หมายเลขเอกสาร</th>
              <th style="width: 28%;">แนบท้ายเอกสารหลัก</th>
              <th style="width: 32%;">ชื่อไฟล์และรายละเอียด</th>
              <th style="text-align: right; width: 15%;">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            ${attachments.map(att => `
              <tr>
                <td>
                  <span class="badge-att-num">${esc(att.headerText || ('หมายเลข ' + att.num))}</span>
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
  S.ui.attachNum = getAutoNum(S.c, el.value);
  S.ui.attachHeaderText = getDefaultHeader(el.value, S.ui.attachNum);
  hooks.rerender();
};

actions.onAttachNumChange = (el) => {
  S.ui.attachNum = el.value;
  S.ui.attachHeaderText = getDefaultHeader(S.ui.attachType || 'complaint', el.value);
  const hInp = document.querySelector('[data-bind="@ui.attachHeaderText"]');
  if (hInp) hInp.value = S.ui.attachHeaderText;
};

actions.delAttachment = (el) => {
  const id = el.dataset.id;
  if (!confirm('ต้องการลบประวัติรายการเอกสารแนบนี้ออกจากคดีหรือไม่?')) return;
  if (S.c && Array.isArray(S.c.attachments)) {
    S.c.attachments = S.c.attachments.filter(a => a.id !== id);
    hooks.changed();
    hooks.rerender();
    hooks.toast('ลบรายการเอกสารแนบแล้ว');
  }
};

actions.stampAttachment = async (el) => {
  const fileInput = document.getElementById('attachFile');
  if (!fileInput || !fileInput.files.length) return hooks.toast('กรุณาเลือกไฟล์ที่ต้องการประทับตรา');
  const file = fileInput.files[0];

  const typeRaw = S.ui.attachType || 'complaint';
  const num = S.ui.attachNum || getAutoNum(S.c, typeRaw);
  const name = S.ui.attachName !== undefined ? S.ui.attachName : resolveCaseSigner(S.c).name;
  const headerPos = S.ui.attachHeaderPos || 'right';
  const signPos = S.ui.attachSignPos || 'right';
  const headerText = S.ui.attachHeaderText || getDefaultHeader(typeRaw, num);
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

    // 2. ประทับตราหัวกระดาษ "เอกสารแนบท้ายหมายเลข...." ขนาด 16
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
    //    สำเนาถูกต้อง
    //    ลงชื่อ ..........................................
    //    (ชื่อ)
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

    const startY = 115;
    const lineGap = 24;

    firstPage.drawText(line1, { x: x1, y: startY, size: textSize, font: customFont, color });
    firstPage.drawText(line2, { x: x2, y: startY - lineGap, size: textSize, font: customFont, color });
    firstPage.drawText(line3, { x: x3, y: startY - (lineGap * 2), size: textSize, font: customFont, color });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const outputName = `${typeRaw}_${num}.pdf`;

    // 4. บันทึกประวัติรายการเอกสารแนบท้ายลงในคดี (แสดงว่าเอกสารไหนแนบท้ายตัวไหน)
    const record = {
      id: Math.random().toString(36).slice(2, 10),
      type: typeRaw,
      parentLabel: getParentLabel(S.c, typeRaw),
      num: num,
      headerText: headerText,
      filename: file.name,
      signer: name,
      pageCount: pages.length,
      createdAt: new Date().toISOString(),
      mode: mode,
      driveUrl: '',
      driveId: '',
    };

    if (!Array.isArray(S.c.attachments)) S.c.attachments = [];
    S.c.attachments.unshift(record);
    hooks.changed();
    hooks.rerender();

    if (mode === 'download') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outputName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      hooks.toast('สร้างและดาวน์โหลดไฟล์สำเร็จ');
    } else if (mode === 'drive') {
      // เรียกใช้ฟังก์ชันอัปโหลดเข้า Drive
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
  // 1. ดึง provider_token จาก Supabase Auth (ที่ขอสิทธิ์ Google Drive ไว้ตอนล็อกอิน)
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

  // 2. ถ้ามี Google OAuth Client ID ระบุไว้ ให้ใช้ Google Identity Services
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

  // 3. ถ้าไม่มีทั้ง Provider Token และ Client ID: แจ้งเตือนผู้ใช้ให้ล็อกอินด้วย Google เพื่อเปิดสิทธิ์
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
