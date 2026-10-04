// ตั้งค่าการเชื่อมต่อหลังบ้านและเว็บไซต์
// Supabase: คีย์ anon เป็นคีย์สาธารณะโดยออกแบบ (ความปลอดภัยอยู่ที่ Row Level Security) ห้ามใส่ service_role key ที่นี่
// ต้องการกลับไปใช้ไฟล์ในเครื่อง (cases/) ให้ลบ url และ anonKey ออก (เว้นว่างทั้งสองค่า)
export default {
  supabase: {
    url: 'https://rertcaxuqeuytleaqqft.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlcnRjYXh1cWV1eXRsZWFxcWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMTk2NjgsImV4cCI6MjEwNjY5NTY2OH0.CtIOkb9shagUgYXb2X5CkiZkRto-JZJpQz4xpcUpgbM',
  },
};