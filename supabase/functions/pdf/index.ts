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

  const { data: row, error } = await admin.from('case_pdfs').select('path, updated_at, cases(title)').eq('share_token', token).maybeSingle();
  if (error || !row) return notFound();
  const { data: file, error: dlErr } = await admin.storage.from('case-pdfs').download(row.path);
  if (dlErr || !file) return notFound();

  const title = String((row as { cases?: { title?: string } | null }).cases?.title ?? '').trim();
  const name = `ชุดเอกสาร${title ? ' - ' + title : ''}.pdf`.replace(/[\\/:*?"<>|\r\n]+/g, ' ');
  return new Response(req.method === 'HEAD' ? null : file.stream(), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(file.size),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store', // อัปโหลดทับแล้วลิงก์เดิมต้องเห็นไฟล์ล่าสุดเสมอ
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
