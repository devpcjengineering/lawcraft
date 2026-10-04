// ชั้นเก็บข้อมูลของหลังบ้าน: เลือกใช้เซิร์ฟเวอร์ Node ในเครื่อง (local) หรือ Supabase (ถ้าตั้งค่าใน config.js)
import config from './config.js';

const http = (url, opt) => fetch(url, opt).then(async (r) => {
  if (!r.ok) { const e = new Error(String(r.status)); e.status = r.status; throw e; }
  return r.json();
});
const jsonOpt = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const localBackend = {
  mode: 'local',
  label: 'เครื่องนี้ (ไฟล์ในโฟลเดอร์ cases)',
  needsLogin: false,
  role: () => 'admin', // โหมดไฟล์ในเครื่อง = เครื่องของเจ้าของระบบ ไม่มีบัญชี
  async init() {},
  async loadAll() {
    const [data, geo, people] = await Promise.all([http('/api/data'), http('/api/geo').catch(() => ({ provinces: [] })), http('/api/people').catch(() => [])]);
    return { data, geo, people };
  },
  listCases: () => http('/api/cases'),
  getCase: (id) => http(`/api/cases/${id}`),
  saveCase: (c) => http(`/api/cases/${c.id}`, jsonOpt('PUT', c)),
  deleteCase: (id) => http(`/api/cases/${id}`, { method: 'DELETE' }),
  deletePerson: (id) => http(`/api/people/${id}`, { method: 'DELETE' }),
  savePerson: (rec) => http(`/api/people/${rec.id}`, jsonOpt('PUT', rec)),
  saveLayout: (obj) => http('/api/layout', jsonOpt('PUT', obj)),
  saveFormText: (obj) => http('/api/formtext', jsonOpt('PUT', obj)),
  // กล่องข้อความปรึกษาจากหน้าเว็บ
  listInquiries: () => http('/api/inquiries'),
  setInquiryStatus: (id, status) => http(`/api/inquiries/${encodeURIComponent(id)}`, jsonOpt('PATCH', { status })),
  deleteInquiry: (id) => http(`/api/inquiries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  async docx(c, docId) {
    const res = await fetch('/api/docx', jsonOpt('POST', { case: c, docId: docId || undefined }));
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
    const m = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get('Content-Disposition') || '');
    return { blob: await res.blob(), filename: m ? decodeURIComponent(m[1]) : 'ชุดเอกสารยื่นศาล.docx' };
  },
};

export let backend = localBackend;

/**
 * เรียกครั้งเดียวตอนเริ่ม:
 *  - ไม่ได้ตั้ง Supabase → ใช้ไฟล์ในเครื่อง (ผู้ใช้คนเดียว = ผู้ดูแล)
 *  - ตั้ง Supabase แล้ว: มี session → Supabase (แอดมินหรือผู้ใช้ทั่วไป) | ไม่มี session แต่เลือกโหมดทดลองไว้ → เก็บในเบราว์เซอร์ | นอกนั้น → Supabase (app.js จะแสดงหน้าเข้าสู่ระบบ)
 */
export async function selectBackend() {
  if (config.supabase?.url && config.supabase?.anonKey) {
    const mod = await import('./supabase-backend.js');
    backend = mod.supabaseBackend;
    if (!(await backend.hasSession())) {
      const g = await import('./guest-backend.js');
      if (g.guestFlag()) backend = g.guestBackend;
    }
  }
  await backend.init();
  return backend;
}

/** สลับเป็นโหมดทดลอง (เก็บในเบราว์เซอร์) โดยไม่โหลดหน้าใหม่ */
export async function useGuestBackend() {
  const g = await import('./guest-backend.js');
  g.setGuestFlag(true);
  backend = g.guestBackend;
  await backend.init();
  return backend;
}
