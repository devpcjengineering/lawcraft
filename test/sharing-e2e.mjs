// ทดสอบแชร์คดีแบบครบวงจรกับ Supabase จริง (Storage API + RLS + Edge Function `pdf`) ด้วยผู้ใช้ชั่วคราว 3 คน แล้วลบทิ้งทั้งหมดตอนจบ
//   node test/sharing-e2e.mjs [project-ref]     (ต้องล็อกอิน supabase CLI — ดึงคีย์จาก `supabase projects api-keys` ใช้ในหน่วยความจำเท่านั้น ไม่เขียนลงไฟล์)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const ref = process.argv[2] || 'rertcaxuqeuytleaqqft';
const url = `https://${ref}.supabase.co`;
const r = spawnSync('npx', ['--yes', 'supabase', 'projects', 'api-keys', '--project-ref', ref, '-o', 'json'], { encoding: 'utf8', shell: true });
const keys = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')));
const anonKey = keys.find((k) => k.id === 'anon').api_key, serviceKey = keys.find((k) => k.id === 'service_role').api_key;

const opt = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, opt);
const rnd = Math.random().toString(36).slice(2, 8);
const caseId = 'e2e' + rnd;
const mk = (n) => ({ email: `e2e-${n}-${rnd}@example.com`, password: 'Pw!' + rnd + n + 'xyZ9' });
const users = { A: mk('owner'), M: mk('member'), S: mk('stranger') };
const clients = {};
const created = [];
const pdfBytes = (tag) => new Blob([`%PDF-1.4\n% ${tag}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`], { type: 'application/pdf' });
const text = async (blob) => (blob instanceof Blob ? await blob.text() : String(blob));
let pass = 0;
const ok = (name, cond, extra = '') => { assert.ok(cond, `${name} ${extra}`); pass++; console.log('PASS ', name); };

try {
  for (const [k, u] of Object.entries(users)) {
    const { data, error } = await admin.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true });
    assert.ifError(error); created.push(data.user.id); u.id = data.user.id;
    const c = createClient(url, anonKey, opt);
    const s = await c.auth.signInWithPassword({ email: u.email, password: u.password });
    assert.ifError(s.error); clients[k] = c;
  }
  const { A, M, S } = clients;

  // เจ้าของสร้างคดี
  let res = await A.from('cases').insert({ id: caseId, title: 'e2e', type: 'criminal', data: { v: 1 }, updated_at: new Date().toISOString() }).select('id,user_id,owner_email,updated_at');
  assert.ifError(res.error);
  ok('owner creates case (stamped owner)', res.data[0].user_id === users.A.id && res.data[0].owner_email === users.A.email);
  const t0 = res.data[0].updated_at;

  // แปลกหน้ายังไม่เห็น ; เชิญผู้แก้ไข ; ผู้แก้ไขเห็น
  res = await S.from('cases').select('id').eq('id', caseId);
  ok('stranger cannot see case', !res.error && res.data.length === 0);
  res = await A.from('case_members').insert({ case_id: caseId, email: users.M.email });
  ok('owner invites member', !res.error, res.error?.message);
  res = await S.from('case_members').insert({ case_id: caseId, email: users.S.email });
  ok('stranger cannot self-invite', !!res.error);
  res = await M.from('cases').select('id,owner_email').eq('id', caseId);
  ok('member sees case', !res.error && res.data.length === 1 && res.data[0].owner_email === users.A.email);

  // แก้ไขพร้อมกัน (compare-and-swap เหมือน saveCase): ผู้แก้ไขบันทึกก่อน → เจ้าของที่ถือเวอร์ชันเก่าต้องไม่ผ่าน
  const t1 = new Date(Date.now() + 5).toISOString();
  res = await M.from('cases').update({ data: { v: 2 }, updated_at: t1 }).eq('id', caseId).eq('updated_at', t0).select('id');
  ok('member CAS update succeeds', !res.error && res.data.length === 1, res.error?.message);
  res = await A.from('cases').update({ data: { v: 3 }, updated_at: new Date(Date.now() + 10).toISOString() }).eq('id', caseId).eq('updated_at', t0).select('id');
  ok('stale owner CAS update affects 0 rows (conflict detected)', !res.error && res.data.length === 0);
  res = await M.from('cases').delete().eq('id', caseId).select('id');
  ok('member cannot delete case', !res.error && res.data.length === 0);

  // Storage: ผู้แก้ไขอัปโหลดทับได้ ; แปลกหน้าไม่ได้
  const path = `${caseId}/bundle.pdf`;
  let up = await M.storage.from('case-pdfs').upload(path, pdfBytes('v1'), { upsert: true, contentType: 'application/pdf', cacheControl: '0' });
  ok('member uploads pdf', !up.error, up.error?.message);
  up = await M.storage.from('case-pdfs').upload(path, pdfBytes('v2-overwritten'), { upsert: true, contentType: 'application/pdf', cacheControl: '0' });
  ok('member overwrites same path (upsert)', !up.error, up.error?.message);
  const dl = await A.storage.from('case-pdfs').download(path);
  ok('owner downloads latest (overwritten) content', !dl.error && (await text(dl.data)).includes('v2-overwritten'));
  up = await S.storage.from('case-pdfs').upload(path, pdfBytes('evil'), { upsert: true, contentType: 'application/pdf' });
  ok('stranger cannot overwrite pdf', !!up.error);
  const sdl = await S.storage.from('case-pdfs').download(path);
  ok('stranger cannot download pdf', !!sdl.error);
  up = await M.storage.from('case-pdfs').upload(`other${rnd}/bundle.pdf`, pdfBytes('x'), { upsert: true, contentType: 'application/pdf' });
  ok('member cannot write another case folder', !!up.error);

  // รายการ PDF + ลิงก์ดู
  res = await M.from('case_pdfs').upsert({ case_id: caseId, path, size_bytes: 77, pages: 2 }, { onConflict: 'case_id' });
  ok('member registers pdf row', !res.error, res.error?.message);
  res = await M.from('case_pdfs').upsert({ case_id: caseId, path, size_bytes: 88, pages: 3 }, { onConflict: 'case_id' });
  ok('registering again (overwrite) works', !res.error, res.error?.message);
  res = await M.from('case_pdfs').update({ share_token: 'forged' }).eq('case_id', caseId);
  ok('client cannot forge share_token', !!res.error);
  res = await S.rpc('set_case_share', { cid: caseId, mode: 'on' });
  ok('stranger cannot open share link', !!res.error);

  const view = (tok) => fetch(`${url}/functions/v1/pdf/${tok}.pdf`);
  res = await M.rpc('set_case_share', { cid: caseId, mode: 'on' });
  assert.ifError(res.error); const tok1 = res.data;
  ok('share token is 64 hex', /^[a-f0-9]{64}$/.test(tok1));
  let f = await view(tok1);
  ok('public link serves pdf without login', f.status === 200 && /application\/pdf/.test(f.headers.get('content-type')) && /inline/.test(f.headers.get('content-disposition') || ''), `${f.status} ${f.headers.get('content-type')}`);
  ok('public link serves LATEST overwritten file', (await f.text()).includes('v2-overwritten'));
  up = await A.storage.from('case-pdfs').upload(path, pdfBytes('v3-newest'), { upsert: true, contentType: 'application/pdf', cacheControl: '0' });
  assert.ifError(up.error);
  f = await view(tok1);
  ok('same link shows newest after another overwrite', (await f.text()).includes('v3-newest'));
  // PDF จริงจากตัวสร้าง (E2E_REAL_PDF=<path> เช่น out.pdf ของ test/pdfexport.mjs): อัปโหลดทับแล้วลิงก์ดูต้องส่งไบต์เดียวกันทุกไบต์
  if (process.env.E2E_REAL_PDF) {
    const { readFileSync } = await import('node:fs'); const { createHash } = await import('node:crypto');
    const real = readFileSync(process.env.E2E_REAL_PDF);
    up = await M.storage.from('case-pdfs').upload(path, new Blob([real], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf', cacheControl: '0' });
    ok('real pdf uploaded over existing file', !up.error, up.error?.message);
    f = await view(tok1);
    const got = Buffer.from(await f.arrayBuffer());
    ok(`public link returns the real pdf byte-for-byte (${Math.round(real.length / 1024)} KB)`, f.status === 200 && createHash('sha256').update(got).digest('hex') === createHash('sha256').update(real).digest('hex') && got.subarray(0, 5).toString() === '%PDF-');
    ok('content-length matches', Number(f.headers.get('content-length')) === real.length);
  }
  res = await A.rpc('set_case_share', { cid: caseId, mode: 'new' });
  const tok2 = res.data;
  ok('new link differs and old link is dead', tok2 !== tok1 && (await view(tok1)).status === 404 && (await view(tok2)).status === 200);
  res = await A.rpc('set_case_share', { cid: caseId, mode: 'off' });
  ok('closing the link kills it', !res.error && (await view(tok2)).status === 404);
  ok('garbage token gives 404', (await view('z'.repeat(64))).status === 404 && (await view('abc')).status === 404);

  // ผู้แก้ไขออกจากคดีเอง → ไม่เห็นอีก
  res = await M.from('case_members').delete().eq('case_id', caseId).eq('email', users.M.email).select('email');
  ok('member can leave', !res.error && res.data.length === 1);
  res = await M.from('cases').select('id').eq('id', caseId);
  ok('after leaving member cannot see case', !res.error && res.data.length === 0);
  up = await M.storage.from('case-pdfs').upload(path, pdfBytes('after-leave'), { upsert: true, contentType: 'application/pdf' });
  ok('after leaving member cannot upload', !!up.error);

  // เจ้าของลบคดี (ลบไฟล์ใน Storage ก่อนตามที่แอปทำ)
  const own = await A.rpc('is_case_owner', { cid: caseId });
  ok('is_case_owner true for owner', own.data === true);
  const rm = await A.storage.from('case-pdfs').remove([path]);
  ok('owner removes pdf object', !rm.error && rm.data.length === 1);
  res = await A.from('cases').delete().eq('id', caseId).select('id');
  ok('owner deletes case', !res.error && res.data.length === 1);
  res = await admin.from('case_pdfs').select('case_id').eq('case_id', caseId);
  ok('pdf row cascaded', res.data.length === 0);
  console.log(`\n${pass} ตรวจผ่านทั้งหมด`);
} finally {
  try { await admin.storage.from('case-pdfs').remove([`${caseId}/bundle.pdf`]); } catch { /* ข้าม */ }
  try { await admin.from('cases').delete().eq('id', caseId); } catch { /* ข้าม */ }
  for (const id of created) { try { await admin.auth.admin.deleteUser(id); } catch { /* ข้าม */ } }
  console.log(`ลบผู้ใช้ทดสอบ ${created.length} คน และข้อมูลทดสอบแล้ว`);
}
