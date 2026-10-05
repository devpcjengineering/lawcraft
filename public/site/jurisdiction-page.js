// หน้า SEO สถิต (/jurisdiction/ และ /jurisdiction/<จังหวัด>/): ใส่เครื่องมือค้นหาเขตอำนาจศาลลงในกล่อง [data-jurisdiction-tool]
//   data-province="ชัยภูมิ"  → เลือกจังหวัดไว้ล่วงหน้าและล็อก (หน้าจังหวัด)
//   data-src / data-courts   → JSON สถิตเฉพาะจังหวัด + รายชื่อศาล (สร้างตอน build) ไม่ระบุ = โหลดทุกจังหวัดแบบหน้าแรก (หน้า hub)
// ไม่มี JavaScript ก็ยังอ่านเนื้อหาและลิงก์ไปหน้าจังหวัดได้ (ดู <noscript> ในกล่อง)
import { mountJurisdictionTool } from './jurisdiction-tool.js';

document.querySelectorAll('[data-jurisdiction-tool]').forEach((el) => {
  const d = el.dataset;
  el.classList.add('jt-mounted');
  mountJurisdictionTool(el, {
    province: d.province || '',
    lockProvince: !!d.province,
    persist: !d.province,
    dataUrl: d.src || '',
    courtsUrl: d.courts || '',
    lazy: !d.province,
  });
});
