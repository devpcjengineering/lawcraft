// Edge Function: ส่งอีเมลแจ้งผู้ที่ถูกเชิญให้ร่วมแก้ไขคดี (ผ่าน Resend)
// POST /functions/v1/invite-email  body { caseId, email }  header Authorization: Bearer <access_token ของเจ้าของคดี/แอดมิน>
// ป้องกันการใช้เป็นเครื่องส่งสแปม: ต้องเป็นเจ้าของคดี (is_case_owner) + อีเมลปลายทางต้องอยู่ในรายชื่อผู้ร่วมแก้ไขของคดีนั้นแล้ว
// + ส่งซ้ำถึงคนเดิมได้ไม่เกิน 1 ครั้งต่อ 2 นาที ; ลิงก์ในอีเมลมาจาก APP_URL (secret) ไม่รับจากไคลเอนต์ (กันแปะลิงก์ฟิชชิง)
// secrets: RESEND_API_KEY (จำเป็น) · MAIL_FROM (ค่าเริ่มต้น alert@law-craft.co) · MAIL_FROM_FALLBACK (ผู้ส่งสำรองที่ยืนยันใน Resend แล้ว ใช้เมื่อโดเมน MAIL_FROM ยังไม่ยืนยัน) · MAIL_FROM_NAME (Law Craft) · APP_URL (https://www.law-craft.co)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { inviteEmail } from './template.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const COOLDOWN_MS = 2 * 60_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) return json({ error: 'ยังไม่ได้ตั้งค่าบริการส่งอีเมล (RESEND_API_KEY)' }, 500);
    const appUrl = (Deno.env.get('APP_URL') || 'https://www.law-craft.co').replace(/\/$/, '');
    const from = Deno.env.get('MAIL_FROM') || 'alert@law-craft.co';
    const fallback = Deno.env.get('MAIL_FROM_FALLBACK') || '';
    const fromName = Deno.env.get('MAIL_FROM_NAME') || 'Law Craft';

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: u } = await sb.auth.getUser();
    const inviter = u?.user?.email;
    if (!inviter) return json({ error: 'ต้องเข้าสู่ระบบ' }, 401);

    const body = await req.json().catch(() => ({}));
    const caseId = typeof body.caseId === 'string' ? body.caseId.slice(0, 64) : '';
    const to = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
    if (!caseId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400);

    const { data: owner } = await sb.rpc('is_case_owner', { cid: caseId });
    if (owner !== true) return json({ error: 'เฉพาะเจ้าของคดีหรือผู้ดูแลระบบเท่านั้นที่ส่งอีเมลเชิญได้' }, 403);
    const { data: c } = await sb.from('cases').select('title,type,court').eq('id', caseId).maybeSingle();
    if (!c) return json({ error: 'ไม่พบคดี' }, 404);
    const { data: mem } = await sb.from('case_members').select('email,notified_at').eq('case_id', caseId).eq('email', to).maybeSingle();
    if (!mem) return json({ error: 'ยังไม่ได้เชิญอีเมลนี้เป็นผู้ร่วมแก้ไข' }, 404);
    if (mem.notified_at) {
      const wait = COOLDOWN_MS - (Date.now() - new Date(mem.notified_at).getTime());
      if (wait > 0) return json({ error: `เพิ่งส่งอีเมลถึงผู้นี้ไป รออีก ${Math.ceil(wait / 1000)} วินาทีแล้วลองใหม่`, retryAfter: Math.ceil(wait / 1000) }, 429);
    }

    const mail = inviteEmail({ appUrl, caseUrl: `${appUrl}/workspace/case/${encodeURIComponent(caseId)}/case`, inviter, title: c.title ?? '', court: c.court ?? '', type: c.type ?? '', to });
    const send = (sender: string) => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${sender}>`, to: [to], reply_to: inviter, subject: mail.subject, html: mail.html, text: mail.text }),
    });
    let res = await send(from);
    let out = await res.json().catch(() => ({}));
    // โดเมนผู้ส่งใหม่ยังไม่ยืนยันใน Resend → ถอยไปใช้ผู้ส่งสำรอง (MAIL_FROM_FALLBACK) ที่ยืนยันแล้ว ; ยืนยันโดเมนใหม่แล้วจะใช้ MAIL_FROM โดยอัตโนมัติ
    if (!res.ok && fallback && fallback !== from && /not verified/i.test(JSON.stringify(out))) {
      console.warn('sender domain not verified, falling back to', fallback);
      res = await send(fallback);
      out = await res.json().catch(() => ({}));
    }
    if (!res.ok) {
      console.error('resend error', res.status, JSON.stringify(out));
      const hint = /not verified|domain/i.test(JSON.stringify(out)) ? ' (โดเมนผู้ส่งยังไม่ได้ยืนยันใน Resend)' : '';
      return json({ error: `ส่งอีเมลไม่สำเร็จ${hint}`, detail: out?.message ?? null }, 502);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    await admin.from('case_members').update({ notified_at: new Date().toISOString() }).eq('case_id', caseId).eq('email', to);
    return json({ ok: true, id: out?.id ?? null });
  } catch (e) {
    console.error(e);
    return json({ error: 'เกิดข้อผิดพลาดในการส่งอีเมล' }, 500);
  }
});
