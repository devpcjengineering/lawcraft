// ตั้งค่าเนื้อหาของเว็บไซต์ — แก้ที่นี่ได้เลย (ชื่อเว็บ ช่องทางติดต่อ)
export default {
  name: 'LawCraft',
  legalName: 'LawCraft by PKT',                     // ลอว์คราฟต์ โดยสำนักงานกฎหมาย PKT
  tagline: 'เพราะทุกปัญหามีทางออก ปรึกษาฟรี',
  // ผู้ดำเนินการเว็บไซต์: ไม่แสดงที่อยู่/เลขทะเบียนนิติบุคคลบนเว็บ (ตั้งจากหลังบ้านได้ภายหลังถ้าต้องการ — ค่าว่าง = ไม่แสดงส่วนนี้)
  office: null,
  contacts: [
    // { label: 'โทรศัพท์', value: '02-xxx-xxxx', href: 'tel:02xxxxxxx' },
    // { label: 'LINE', value: '@yourid', href: 'https://line.me/R/ti/p/@yourid' },
    // { label: 'อีเมล', value: 'contact@example.com', href: 'mailto:contact@example.com' },
  ],
};
