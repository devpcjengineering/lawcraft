import { S, esc, actions, hooks } from './store.js';
import { group, field, select, pageHead } from './ui.js';
import { icon } from './icons.js';
import { sideOf, partyLabel } from '/shared/model.js';

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

export function tabAttachments() {
  const c = S.c;
  if (!c) return '';
  
  // 1. Build Document Types
  const isDef = sideOf(c) === 'defendant';
  const typeOptions = [];
  typeOptions.push(['complaint', isDef ? 'เอกสารแนบท้ายคำให้การ' : 'เอกสารแนบท้ายคำฟ้อง']);
  
  if (c.motions && c.motions.length > 0) {
    c.motions.forEach(m => {
      const t = m.title || 'คำร้อง/คำแถลง';
      typeOptions.push([`motion_${m.id}`, `เอกสารแนบท้ายคำร้อง: ${t}`]);
    });
  } else {
    typeOptions.push(['motion', 'เอกสารแนบท้ายคำร้อง/คำแถลง']);
  }
  
  let docIdx = 1;
  let hasDocs = false;
  if (c.witnesses && c.witnesses.length > 0) {
    c.witnesses.forEach(w => {
      if (w.kind === 'document' || w.kind === 'object') {
        hasDocs = true;
        const name = (w.name || w.holder || (w.kind === 'document' ? 'เอกสาร' : 'วัตถุ')).trim();
        const prefix = w.kind === 'document' ? 'พยานเอกสาร' : 'พยานวัตถุ';
        typeOptions.push([`evidence_${w.id}`, `${prefix}ลำดับที่ ${docIdx}: ${name}`]);
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

  // 2. Build Signers
  const nameOptions = [];
  nameOptions.push(['', 'ไม่ระบุ (หรือเว้นว่างเพื่อเขียนด้วยมือ)']);
  
  if (c.counsel && c.counsel.enabled && c.counsel.first) {
    const counselName = `ทนายความ${isDef ? 'จำเลย' : 'โจทก์'}`;
    const n = `${c.counsel.prefix || ''}${c.counsel.first} ${c.counsel.last}`.trim();
    nameOptions.push([n, `${n} (${counselName})`]);
  }
  
  if (c.parties) {
    c.parties.forEach(p => {
      const pName = p.kind === 'juristic' ? p.name : `${p.prefix || ''}${p.first} ${p.last}`.trim();
      if (pName) {
        const label = partyLabel(c, p);
        nameOptions.push([pName, `${pName} (${label})`]);
      }
    });
  }
  if (c.proxy?.holder && (c.proxy.holder.first || c.proxy.holder.name)) {
     const p = c.proxy.holder;
     const pName = p.kind === 'juristic' ? p.name : `${p.prefix || ''}${p.first} ${p.last}`.trim();
     nameOptions.push([pName, `${pName} (ผู้รับมอบอำนาจ)`]);
  }

  return `
  ${pageHead('จัดการเอกสารแนบ', 'อัปโหลดไฟล์ PDF หรือรูปภาพ ประทับตรา "สำเนาถูกต้อง" พร้อมลงนามและหมายเลขเอกสารอัตโนมัติ')}
  
  <style>
    .attach-panel {
      background: var(--surface, #ffffff);
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.04);
      border: 1px solid var(--border, #e2e8f0);
      margin-bottom: 24px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .attach-panel:hover {
      box-shadow: 0 12px 32px rgba(0,0,0,0.08);
      border-color: #cbd5e1;
    }
    .attach-section-title {
      font-size: 1.15em;
      font-weight: 600;
      color: var(--primary, #2563eb);
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .upload-box {
      position: relative;
      border: 2px dashed var(--primary-light, #93c5fd);
      border-radius: 16px;
      padding: 48px 24px;
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
      margin-bottom: 16px;
      transition: transform 0.3s ease;
    }
    .upload-box:hover .upload-icon {
      transform: scale(1.1);
    }
    .upload-text {
      font-weight: 500;
      color: var(--text, #1e293b);
      font-size: 1.15em;
    }
    .upload-subtext {
      font-size: 0.9em;
      color: var(--text-muted, #64748b);
      margin-top: 8px;
    }
    .attach-actions {
      display: flex;
      gap: 16px;
      margin-top: 28px;
      flex-wrap: wrap;
    }
    .attach-actions .btn {
      flex: 1;
      justify-content: center;
      padding: 14px 24px;
      font-size: 1.05em;
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
  </style>

  <div class="attach-panel">
    <div class="attach-section-title">
      ${icon('settings', { size: 22 })} ตั้งค่าเอกสารและคำรับรอง
    </div>
    
    ${group('', `
      ${select('ประเภทเอกสารแนบ', 'ui.attachType', typeOptions, { cls: 's8', rerender: true })}
      ${field('หมายเลข / ลำดับที่', 'ui.attachNum', { cls: 's4', ph: 'เช่น ๑ หรือ 1' })}
    `)}
    
    ${group('', `
      ${select('ผู้ลงลายมือชื่อรับรองสำเนา (เฉพาะหน้าแรก)', 'ui.attachName', nameOptions, { cls: 's12' })}
    `)}
  </div>

  <div class="attach-panel">
    <div class="attach-section-title">
      ${icon('fileText', { size: 22 })} อัปโหลดและดำเนินการ
    </div>
    
    <div class="upload-box" id="drop-zone">
      <div class="upload-icon">${icon('upload', { size: 56, stroke: 1.5 })}</div>
      <div class="upload-text">ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</div>
      <div class="upload-subtext">รองรับไฟล์ PDF, JPG, PNG (ขนาดไม่เกิน 20MB)</div>
      <input type="file" id="attachFile" accept="application/pdf,image/png,image/jpeg" onchange="const f=this.files[0];if(f)this.previousElementSibling.previousElementSibling.innerText='เลือกไฟล์แล้ว: '+f.name;">
    </div>

    <div class="attach-actions">
      <button type="button" class="btn outline" data-act="stampAttachment" data-mode="download">
        ${icon('download', { size: 18 })} ดาวน์โหลดลงเครื่อง
      </button>
      <button type="button" class="btn primary" data-act="stampAttachment" data-mode="drive">
        ${icon('cloud', { size: 18 })} ประทับตราและอัปโหลด
      </button>
    </div>
  </div>
  <script>
    // Drag & Drop visual feedback
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', () => dropZone.classList.remove('drag-over'));
    }
  </script>
  `;
}

actions.stampAttachment = async (el) => {
  const fileInput = document.getElementById('attachFile');
  if (!fileInput || !fileInput.files.length) return hooks.toast('กรุณาเลือกไฟล์ที่ต้องการประทับตรา');
  const file = fileInput.files[0];

  const typeRaw = S.ui.attachType || 'complaint';
  const num = S.ui.attachNum || '';
  const name = S.ui.attachName || '';
  const mode = el.dataset.mode;

  let baseType = typeRaw;
  let typeName = '';
  
  if (typeRaw === 'complaint') {
    baseType = 'complaint';
    typeName = (sideOf(S.c) === 'defendant') ? 'คำให้การ' : 'คำฟ้อง';
  } else if (typeRaw.startsWith('motion_') || typeRaw === 'motion') {
    baseType = 'motion';
  } else if (typeRaw.startsWith('evidence_') || typeRaw === 'evidence') {
    baseType = 'evidence';
  }

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
    
    // ตั้งค่าขนาดและสีอักษร
    const textSize = 16;
    const color = PDFLib.rgb(0, 0, 0);

    // ประทับตราหัวกระดาษและคำรับรอง
    if (baseType === 'complaint' || baseType === 'motion') {
      const headerText = baseType === 'complaint' ? `เอกสารแนบท้าย${typeName} หมายเลข ${num}` : `เอกสารแนบท้ายคำร้อง/คำแถลง หมายเลข ${num}`;
      // หัวกระดาษ หน้าแรก (ขวาบน)
      firstPage.drawText(headerText, { x: width - customFont.widthOfTextAtSize(headerText, textSize) - 50, y: height - 50, size: textSize, font: customFont, color });
      
      // สำเนาถูกต้อง (ขวาล่างหรือกลางล่าง)
      const certY = 100;
      firstPage.drawText('สำเนาถูกต้อง', { x: width - 150, y: certY, size: textSize, font: customFont, color });
      if (name) {
        firstPage.drawText(`(${name})`, { x: width - 150 + 10, y: certY - 40, size: textSize, font: customFont, color });
      }
    } else if (baseType === 'evidence') {
      const headerText = `พยานเอกสารลำดับที่ ${num}`;
      // หัวกระดาษ ทุกหน้า
      pages.forEach(page => {
        const { width: pWidth, height: pHeight } = page.getSize();
        page.drawText(headerText, { x: pWidth - customFont.widthOfTextAtSize(headerText, textSize) - 50, y: pHeight - 50, size: textSize, font: customFont, color });
      });

      // กรอบพยานเอกสาร (หน้าแรก มุมซ้ายบนหรือมุมซ้ายล่าง ปกติมุมล่างขวาหรือซ้ายกลางๆ)
      // วางไว้มุมล่างซ้าย
      const certX = 50;
      const certY = 120;
      firstPage.drawText('พยานเอกสาร', { x: certX, y: certY, size: textSize, font: customFont, color });
      firstPage.drawText(`หมายเลข ${num}`, { x: certX, y: certY - 20, size: textSize, font: customFont, color });
      firstPage.drawText('ลงชื่อ ..........................................', { x: certX, y: certY - 50, size: textSize, font: customFont, color });
      if (name) {
        firstPage.drawText(`(${name})`, { x: certX + 30, y: certY - 70, size: textSize, font: customFont, color });
      }
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const outputName = `${typeRaw}_${num}.pdf`;

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
      uploadToGoogleDrive(blob, outputName);
    }
  } catch (err) {
    console.error(err);
    hooks.toast('เกิดข้อผิดพลาดในการประทับตรา: ' + err.message);
  }
};

// ------ Google Drive API ------
let gTokenClient;
const GOOGLE_API_KEY = window.GOOGLE_API_KEY || 'AIzaSyBIRxZF7obWCoLR4Nd7xUUjAGFxiyHHXe8';

function uploadToGoogleDrive(blob, filename) {
  if (!window.google) {
    hooks.toast('กำลังโหลด Google API...');
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => initDriveAuth(blob, filename);
    document.head.appendChild(s);
  } else {
    initDriveAuth(blob, filename);
  }
}

function initDriveAuth(blob, filename) {
  // ต้องเปลี่ยนเป็น Client ID จริงของแอปพลิเคชัน
  const CLIENT_ID = window.GOOGLE_CLIENT_ID || '101416790518-gtd3n0cptv1i9c6d4ngvstjip48bntf2.apps.googleusercontent.com'; // TODO: Update to real ID or use env var
  
  if (!gTokenClient) {
    gTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          executeDriveUpload(tokenResponse.access_token, blob, filename);
        }
      },
    });
  }
  gTokenClient.requestAccessToken({ prompt: 'consent' });
}

async function executeDriveUpload(accessToken, blob, filename) {
  hooks.toast('กำลังอัปโหลดขึ้น Google Drive...');
  const metadata = { name: filename, mimeType: 'application/pdf' };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  try {
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart${GOOGLE_API_KEY ? `&key=${GOOGLE_API_KEY}` : ''}`;
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken },
      body: form
    });
    
    if (res.ok) {
      hooks.toast('อัปโหลดขึ้น Google Drive สำเร็จ!');
    } else {
      const err = await res.json();
      hooks.toast('อัปโหลดไม่สำเร็จ: ' + (err.error?.message || 'Unknown error'));
    }
  } catch (e) {
    hooks.toast('อัปโหลดไม่สำเร็จ: ' + e.message);
  }
}
