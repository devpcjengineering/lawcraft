// เตรียมรูปก่อนอัปโหลด (หลังบ้าน: ภาพปกบทความ / รูปผลงาน): ย่อให้ด้านยาวไม่เกิน max px และแปลงเป็น WebP (ไม่รองรับ = JPEG)
// รูปที่เล็กอยู่แล้วและเป็น WebP/JPEG/PNG ขนาดไม่เกิน limit จะส่งต่อตามเดิม · GIF ไม่แปลง (รักษาแอนิเมชัน) · ไฟล์ที่ไม่ใช่รูปโยน Error
// ไม่พึ่งไลบรารี: ใช้ createImageBitmap + canvas ของเบราว์เซอร์ — ทำงานบนมือถือได้ (ภาพจากกล้อง 12 MP → ~200–400 KB)
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const MAX_BYTES = 8 * 1024 * 1024; // ตรงกับ file_size_limit ของ bucket media

export const extOf = (blob) => EXT[String(blob?.type || '')] || '';
export const isImageFile = (f) => TYPES.has(String(f?.type || '')) || /\.(jpe?g|png|webp|gif|avif)$/i.test(String(f?.name || ''));

/** ย่อ/แปลงรูป → Blob พร้อมอัปโหลด (max = ด้านยาวสูงสุด, quality 0–1) */
export async function prepareImage(file, { max = 1600, quality = 0.84 } = {}) {
  if (!isImageFile(file)) throw new Error('รองรับเฉพาะไฟล์รูป JPG, PNG, WebP, GIF หรือ AVIF');
  const type = String(file.type || '');
  if (type === 'image/gif') { if (file.size > MAX_BYTES) throw new Error('ไฟล์ GIF ใหญ่เกิน 8 MB'); return file; }
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error('เปิดไฟล์รูปไม่ได้ (ไฟล์เสียหรือรูปแบบไม่รองรับ)'); }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const small = scale === 1 && file.size <= 400 * 1024 && (type === 'image/webp' || type === 'image/jpeg');
  if (small) { bmp.close?.(); return file; } // เล็กพออยู่แล้ว ไม่ต้องแปลงซ้ำ (เสียคุณภาพ)
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d');
  if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); } // JPEG ไม่มีพื้นโปร่ง
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const toBlob = (t, q) => (canvas.convertToBlob ? canvas.convertToBlob({ type: t, quality: q }) : new Promise((res) => canvas.toBlob(res, t, q)));
  let out = await toBlob('image/webp', quality);
  if (!out || out.type !== 'image/webp') out = await toBlob('image/jpeg', quality); // เบราว์เซอร์ที่เข้ารหัส WebP ไม่ได้
  if (!out) throw new Error('แปลงรูปไม่สำเร็จ');
  if (out.size > MAX_BYTES) throw new Error('รูปใหญ่เกิน 8 MB แม้ย่อแล้ว — ลองรูปที่เล็กลง');
  return out;
}

/** ขนาดไฟล์อ่านง่าย */
export const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
