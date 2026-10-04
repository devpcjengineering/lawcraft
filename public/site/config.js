// ตั้งค่าเนื้อหาของเว็บไซต์ — แก้ที่นี่ได้เลย (ชื่อเว็บ ช่องทางติดต่อ)
export default {
  name: 'Law Craft',
  legalName: 'สำนักงานกฎหมาย ลอว์คราฟต์ Law Craft Legal Consultants',
  // ข้อมูลสำนักงาน แสดงท้ายเว็บและใช้เป็นข้อมูลโครงสร้างสำหรับเสิร์ชเอนจิน
  office: {
    label: 'สำนักงานแห่งใหญ่',
    entity: 'ห้างหุ้นส่วนจำกัด พีซีเจ เอ็นจิเนียริ่ง',
    street: '173 หมู่ที่ 7 ตำบลคูเมือง',
    district: 'อำเภอหนองบัวแดง',
    province: 'จังหวัดชัยภูมิ',
    regNo: '0363569001102', // ทะเบียนนิติบุคคลเลขที่
  },
  contacts: [
    // { label: 'โทรศัพท์', value: '02-xxx-xxxx', href: 'tel:02xxxxxxx' },
    // { label: 'LINE', value: '@yourid', href: 'https://line.me/R/ti/p/@yourid' },
    // { label: 'อีเมล', value: 'contact@example.com', href: 'mailto:contact@example.com' },
  ],
};
