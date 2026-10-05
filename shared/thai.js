// ตัวช่วยภาษาไทย: เลขไทย วันที่ พ.ศ. ชื่อบุคคล ที่อยู่ — ใช้ร่วมกันทั้งเว็บและเซิร์ฟเวอร์

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const TH_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

export function toThaiDigits(s) {
  return String(s ?? '').replace(/[0-9]/g, (d) => TH_DIGITS[+d]);
}

export function toArabicDigits(s) {
  return String(s ?? '').replace(/[๐-๙]/g, (d) => String(TH_DIGITS.indexOf(d)));
}

/** ข้อความที่ต้องคงเป็นตัวเลข/ตัวอักษรละติน: อีเมล · ที่อยู่เว็บ (http(s)://… www.… หรือโดเมนที่ลงท้าย .com .co.th ฯลฯ) */
const KEEP_ASCII_RE = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"')\]]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|edu|gov|info|biz|io|co|th|app|me|dev|asia)\b(?:\/[^\s<>"')\]]*)?/gi;

/**
 * แปลงเลขอารบิกเป็นเลขไทยในข้อความที่พิมพ์ลงเอกสาร — เว้นอีเมลและที่อยู่เว็บไว้ตามเดิม
 * ใช้ซ้ำได้ (idempotent) ; ข้อมูลที่เก็บไว้ไม่ถูกแก้ ใช้ตอนสร้าง/แสดงเอกสารเท่านั้น
 */
export function thaiDigitsDoc(s) {
  const str = String(s ?? '');
  if (!/[0-9]/.test(str)) return str;
  let out = '', last = 0, m;
  KEEP_ASCII_RE.lastIndex = 0;
  while ((m = KEEP_ASCII_RE.exec(str))) {
    out += toThaiDigits(str.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + toThaiDigits(str.slice(last));
}

/** ตัวเลขจากข้อความที่ผู้ใช้พิมพ์ (รับเลขไทย ๐–๙ และเครื่องหมายคั่นหลักพัน) — ไม่ใช่ตัวเลข = NaN */
export function toNum(v) {
  const s = toArabicDigits(v).replace(/[,\s]/g, '').trim();
  return s === '' ? NaN : Number(s);
}

/** ปีที่เป็นเลขในช่วงปี ค.ศ. → พ.ศ. (ถ้ามากกว่า 2400 ถือว่าเป็น พ.ศ. อยู่แล้ว) */
export function toBE(y) {
  y = toNum(y);
  if (!y) return '';
  return y > 2400 ? y : y + 543;
}

export function todayParts(now = new Date()) {
  return { d: String(now.getDate()), m: String(now.getMonth() + 1), y: String(now.getFullYear() + 543) };
}

/** "6 ตุลาคม 2569" จาก {d,m,y} (m เป็นเลข 1-12) */
export function longDate({ d, m, y } = {}) {
  if (!d || !m || !y) return '';
  return `${d} ${THAI_MONTHS[toNum(m) - 1] || ''} ${toBE(y)}`;
}

/** แปลงสตริงวันที่ ISO (YYYY-MM-DD, ค.ศ.) เป็น {d,m,y(พ.ศ.)} */
export function isoToParts(iso) {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!mt) return null;
  return { d: String(+mt[3]), m: String(+mt[2]), y: String(+mt[1] + 543) };
}

export function isoToThaiLong(iso) {
  const p = isoToParts(iso);
  return p ? longDate(p) : '';
}

/** 1-4-5-2-1 รูปแบบเลขประจำตัวประชาชน */
export function formatCitizenId(id) {
  const s = toArabicDigits(id).replace(/\D/g, '');
  if (s.length !== 13) return String(id ?? '').trim();
  return `${s[0]}-${s.slice(1, 5)}-${s.slice(5, 10)}-${s.slice(10, 12)}-${s[12]}`;
}

/** จัดรูปแบบระหว่างพิมพ์ x-xxxx-xxxxx-xx-x (รับเลขไทยได้ ตัดทิ้งเกิน 13 หลัก) */
export function maskCitizenId(id) {
  const s = toArabicDigits(id).replace(/\D/g, '').slice(0, 13);
  const cut = [1, 4, 5, 2, 1];
  const out = []; let i = 0;
  for (const n of cut) { if (i >= s.length) break; out.push(s.slice(i, i + n)); i += n; }
  return out.join('-');
}

export function validCitizenId(id) {
  const s = toArabicDigits(id).replace(/\D/g, '');
  if (s.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += +s[i] * (13 - i);
  return (11 - (sum % 11)) % 10 === +s[12];
}

export function ageFromBirth(iso, now = new Date()) {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!mt) return '';
  let age = now.getFullYear() - +mt[1];
  const before = now.getMonth() + 1 < +mt[2] || (now.getMonth() + 1 === +mt[2] && now.getDate() < +mt[3]);
  if (before) age--;
  return age >= 0 ? String(age) : '';
}

export const PREFIXES = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง', 'ว่าที่ร้อยตรี', 'พลตำรวจเอก', 'พันตำรวจเอก', 'ดร.', 'ศ.', 'รศ.', 'ผศ.'];

export function fullName(p) {
  if (!p) return '';
  if (p.kind === 'juristic') return (p.name || '').trim();
  // คำนำหน้าติดชื่อ (นายสมชาย ใจดี) ยกเว้นคำนำหน้าที่เป็นยศ/วิชาการที่ลงท้ายด้วยจุด ให้เว้นวรรค
  const pre = p.prefix ? (/\.$/.test(p.prefix) ? p.prefix + ' ' : p.prefix) : '';
  return `${pre}${p.first || ''}${p.last ? ' ' + p.last : ''}`.trim();
}

/** ที่อยู่เป็นส่วน ๆ ตามแบบฟอร์มศาล (บ้านเลขที่ หมู่ที่ ถนน ตรอก/ซอย ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์) */
export function addressText(a = {}, bkk = false) {
  const sub = bkk ? 'แขวง' : 'ตำบล';
  const dist = bkk ? 'เขต' : 'อำเภอ';
  const parts = [];
  if (a.no) parts.push(`บ้านเลขที่ ${a.no}`);
  if (a.moo) parts.push(`หมู่ที่ ${a.moo}`);
  if (a.building) parts.push(a.building);
  if (a.soi) parts.push(`ตรอก/ซอย ${a.soi}`);
  if (a.road) parts.push(`ถนน ${a.road}`);
  if (a.sub) parts.push(`${sub}${a.sub}`);
  if (a.district) parts.push(`${dist}${a.district}`);
  if (a.province) parts.push(`จังหวัด${a.province}`);
  if (a.zip) parts.push(`รหัสไปรษณีย์ ${a.zip}`);
  return parts.join(' ');
}

export function isBkk(province) {
  return /^กรุงเทพ/.test(province || '');
}

/** ลำดับ "ที่ ๑" สำหรับหลายคนในบทบาทเดียวกัน */
export function ordinalLabel(role, index, total) {
  const base = role === 'plaintiff' ? 'โจทก์' : role === 'defendant' ? 'จำเลย' : role;
  return total > 1 ? `${base}ที่ ${index + 1}` : base;
}

/** ตัดคำนำหน้า "ศาล" ออก เพื่อใส่ในช่อง "ศาล ......" */
export function courtShort(name) {
  return String(name || '').replace(/^ศาล\s*/, '');
}

export function sectionsJoin(list) {
  const arr = list.filter(Boolean);
  if (arr.length <= 1) return arr.join('');
  return arr.slice(0, -1).join(', ') + ' และ ' + arr[arr.length - 1];
}
