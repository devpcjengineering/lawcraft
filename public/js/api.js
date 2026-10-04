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
  async docx(c, docId) {
    const res = await fetch('/api/docx', jsonOpt('POST', { case: c, docId: docId || undefined }));
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
    const m = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get('Content-Disposition') || '');
    return { blob: await res.blob(), filename: m ? decodeURIComponent(m[1]) : 'ชุดเอกสารยื่นศาล.docx' };
  },
};

export let backend = localBackend;

/** เรียกครั้งเดียวตอนเริ่ม: ถ้า config.js ตั้ง Supabase ไว้ ให้โหลดโมดูล Supabase มาใช้แทน */
export async function selectBackend() {
  if (config.supabase?.url && config.supabase?.anonKey) {
    const mod = await import('./supabase-backend.js');
    backend = mod.supabaseBackend;
  }
  await backend.init();
  return backend;
}
