import { S, esc, actions, hooks } from './store.js';
import { group, field, select, pageHead } from './ui.js';
import { icon } from './icons.js';

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
  if (!S.ui.attachType) S.ui.attachType = 'complaint';
  return `
  ${pageHead('เอกสารแนบ', 'อัปโหลดไฟล์ PDF หรือรูปภาพ เพื่อประทับตรา "สำเนาถูกต้อง" และจัดการหมายเลขเอกสาร')}
  <div class="panel">
    <h3>ตั้งค่าการประทับตรา</h3>
    ${group('ประเภทและหมายเลข', `
      ${select('ประเภทเอกสารแนบ', 'ui.attachType', [
        ['complaint', 'เอกสารแนบท้ายคำฟ้อง'],
        ['motion', 'เอกสารแนบท้ายคำร้อง/คำแถลง'],
        ['evidence', 'พยานเอกสาร']
      ], { cls: 's6', rerender: true })}
      ${field('หมายเลข / ลำดับที่', 'ui.attachNum', { cls: 's6', ph: 'เช่น ๑ หรือ 1' })}
    `)}
    ${group('การรับรอง (เฉพาะหน้าแรก)', `
      ${field('ชื่อผู้ลงลายมือชื่อในวงเล็บ', 'ui.attachName', { cls: 's12', ph: 'เช่น นายโจทก์ ใจดี (หรือเว้นว่างถ้าจะเขียนด้วยมือ)' })}
    `)}
    ${group('เลือกไฟล์ต้นฉบับ', `
      <div class="f s12">
        <input type="file" id="attachFile" accept="application/pdf,image/png,image/jpeg" style="padding: 12px; width: 100%; border: 1px dashed #cbd5e1; border-radius: 8px;">
      </div>
    `)}
    <div class="toolbar pf-go" style="margin-top: 24px;">
      <button type="button" class="btn outline" data-act="stampAttachment" data-mode="download">${icon('download', { size: 16 })} ดาวน์โหลดลงเครื่อง</button>
      <button type="button" class="btn" data-act="stampAttachment" data-mode="drive">${icon('cloud', { size: 16 })} อัปโหลดขึ้น Google Drive</button>
    </div>
  </div>
  `;
}

actions.stampAttachment = async (el) => {
  const fileInput = document.getElementById('attachFile');
  if (!fileInput || !fileInput.files.length) return hooks.toast('กรุณาเลือกไฟล์ที่ต้องการประทับตรา');
  const file = fileInput.files[0];

  const type = S.ui.attachType || 'complaint';
  const num = S.ui.attachNum || '';
  const name = S.ui.attachName || '';
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
    
    // ตั้งค่าขนาดและสีอักษร
    const textSize = 16;
    const color = PDFLib.rgb(0, 0, 0);

    // ประทับตราหัวกระดาษและคำรับรอง
    if (type === 'complaint' || type === 'motion') {
      const headerText = type === 'complaint' ? `เอกสารแนบท้ายคำฟ้อง หมายเลข ${num}` : `เอกสารแนบท้ายคำร้อง/คำแถลง หมายเลข ${num}`;
      // หัวกระดาษ หน้าแรก (ขวาบน)
      firstPage.drawText(headerText, { x: width - customFont.widthOfTextAtSize(headerText, textSize) - 50, y: height - 50, size: textSize, font: customFont, color });
      
      // สำเนาถูกต้อง (ขวาล่างหรือกลางล่าง)
      const certY = 100;
      firstPage.drawText('สำเนาถูกต้อง', { x: width - 150, y: certY, size: textSize, font: customFont, color });
      if (name) {
        firstPage.drawText(`(${name})`, { x: width - 150 + 10, y: certY - 40, size: textSize, font: customFont, color });
      }
    } else if (type === 'evidence') {
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
    const outputName = `${type}_${num}.pdf`;

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
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
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
