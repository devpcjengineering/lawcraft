// Edge Function: ลิงก์ดู PDF ชุดเอกสารของคดี (ไม่ต้องล็อกอิน — ใช้ token สุ่มยาว 256 บิตที่เจ้าของ/ผู้แก้ไขเปิดไว้)
// GET /functions/v1/pdf/<token>.pdf  (หรือ ?t=<token>) → ส่งไฟล์ล่าสุดของคดีนั้นแบบ inline
// ไฟล์จริงอยู่ใน bucket ส่วนตัว case-pdfs (ไม่มีลิงก์ตรงไปที่ไฟล์) ; ปิดลิงก์ = ล้าง share_token ในตาราง case_pdfs → ลิงก์เดิมได้ 404 ทันที
// deploy ด้วย --no-verify-jwt (ผู้ชมไม่มีบัญชี) : npx supabase functions deploy pdf --project-ref <ref> --use-api --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

const notFound = () => new Response('ไม่พบลิงก์นี้ หรือลิงก์ถูกยกเลิกแล้ว', {
  status: 404,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
});

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
  const url = new URL(req.url);
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '').replace(/\.pdf$/i, '');
  const token = (url.searchParams.get('t') || last).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) return notFound();

  const { data: row, error } = await admin.from('case_pdfs').select('case_id, path, updated_at, cases(title)').eq('share_token', token).maybeSingle();
  if (error || !row) return notFound();
  // พาธต้องอยู่ในโฟลเดอร์ของคดีนี้เท่านั้น (ผู้แก้ไขเขียนคอลัมน์ path เองได้ — กันชี้ไปไฟล์ของคดีอื่นแล้วเปิดลิงก์แชร์ดึงไปดู)
  // ไฟล์ใหม่ทุกครั้งที่อัปโหลดใช้ชื่อใหม่ (ไม่ทับพาธเดิม เพราะ CDN หน้า Storage แคชตามพาธ จึงอาจส่งไฟล์เก่า/ไบต์ไม่ครบ) → ที่นี่ดาวน์โหลดตามพาธล่าสุดในตารางเสมอ
  if (typeof row.path !== 'string' || !row.path.startsWith(`${row.case_id}/`) || row.path.includes('..')) return notFound();
  const { data: file, error: dlErr } = await admin.storage.from('case-pdfs').download(row.path);
  if (dlErr || !file) return notFound();

  const title = String((row as { cases?: { title?: string } | null }).cases?.title ?? '').trim();
  const name = `ชุดเอกสาร${title ? ' - ' + title : ''}.pdf`.replace(/[\\/:*?"<>|\r\n]+/g, ' ');
  return new Response(req.method === 'HEAD' ? null : file.stream(), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(file.size),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name.toWellFormed()).replace(/['()*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase())}`, // RFC 5987: ' ( ) * ต้องเข้ารหัสด้วย (ชื่อคดีมีอักขระเหล่านี้ได้)
      'Cache-Control': 'private, no-store', // อัปโหลดใหม่แล้วลิงก์เดิมต้องเห็นไฟล์ล่าสุดเสมอ
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
