// อ่านเนื้อหาที่แอดมินจัดการจากหลังบ้าน (key = 'articles' | 'laws' | 'pages' …) สำหรับหน้าเว็บสาธารณะ
// Supabase: แถว law_data key='content-<key>' (anon อ่านได้) · โหมดไฟล์ในเครื่อง: /api/content/<key>
// ไม่เคยโยนข้อผิดพลาด — ถ้าอ่านไม่ได้/ยังไม่มีข้อมูล คืน {} เพื่อให้หน้าเว็บใช้ข้อมูลตั้งต้นที่ build ไว้
import app from '/js/config.js';

export async function loadContent(key, timeoutMs = 5000) {
  const sb = app?.supabase || {};
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    if (sb.url && sb.anonKey) {
      const r = await fetch(`${sb.url}/rest/v1/law_data?select=data&key=eq.${encodeURIComponent('content-' + key)}`, { headers: { apikey: sb.anonKey, Authorization: `Bearer ${sb.anonKey}` }, signal: ctl.signal });
      return r.ok ? ((await r.json())[0]?.data || {}) : {};
    }
    const r = await fetch('/api/content/' + encodeURIComponent(key), { signal: ctl.signal });
    return r.ok ? await r.json() : {};
  } catch { return {}; } finally { clearTimeout(to); }
}
