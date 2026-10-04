// Edge Function: ออกไฟล์ Word (.docx) จากข้อมูลคดี
// เรียกโดยหลังบ้าน: POST /functions/v1/docx  body { case, docId?, only? }  header Authorization: Bearer <access_token ของแอดมิน>
// ตรวจสิทธิ์ด้วย rpc is_admin() (อยู่ในตาราง admins) — ผู้ที่ไม่ใช่แอดมินได้ 403
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildDocuments } from './shared/docs.js';
import { caseTitle } from './shared/model.js';
import { renderDocx } from './render-docx.js';
import emblem from './emblem.js';

(globalThis as any).__EMBLEM__ = Uint8Array.from(atob(emblem), (c) => c.charCodeAt(0));

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Disposition, X-Filename',
};
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// แคชข้อมูลกฎหมายใน isolate (ไม่เปลี่ยนบ่อย) — formText อ่านใหม่ทุกครั้งเพราะแอดมินแก้ได้
let lawCache: { at: number; laws: unknown; items: unknown; courtPhones: unknown } | null = null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonRes({ error: 'method not allowed' }, 405);
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: isAdmin, error: authErr } = await sb.rpc('is_admin');
    if (authErr || isAdmin !== true) return jsonRes({ error: 'ต้องเข้าสู่ระบบด้วยบัญชีแอดมิน' }, 403);

    const { case: c, docId, only } = await req.json();
    if (!c || typeof c !== 'object') return jsonRes({ error: 'ไม่มีข้อมูลคดี' }, 400);

    if (!lawCache || Date.now() - lawCache.at > 5 * 60_000) {
      const { data: rows, error } = await sb.from('law_data').select('key,data').in('key', ['laws', 'items', 'courtPhones']);
      if (error) throw error;
      const m = Object.fromEntries((rows ?? []).map((r: { key: string; data: unknown }) => [r.key, r.data]));
      lawCache = { at: Date.now(), laws: m.laws ?? [], items: m.items ?? [], courtPhones: m.courtPhones ?? {} };
    }
    const { data: fresh } = await sb.from('law_data').select('key,data').in('key', ['formText', 'layout']);
    const fm = Object.fromEntries((fresh ?? []).map((r: { key: string; data: unknown }) => [r.key, r.data]));
    const data = { laws: lawCache.laws, items: lawCache.items, courtPhones: lawCache.courtPhones, formText: fm.formText ?? {} };

    let docs = buildDocuments(c, data, only);
    if (docId) docs = docs.filter((d: { id: string }) => d.id === docId);
    if (!docs.length) return jsonRes({ error: 'ไม่มีเอกสารที่เลือก' }, 400);

    const buf = await renderDocx(docs, c.title || caseTitle(c), fm.layout ?? null);
    const name = (docId ? docs[0].title : 'ชุดเอกสารยื่นศาล') + '.docx';
    return new Response(buf, {
      headers: {
        ...cors,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        'X-Filename': encodeURIComponent(name),
      },
    });
  } catch (e) {
    console.error(e);
    return jsonRes({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
