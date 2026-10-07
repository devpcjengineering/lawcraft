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
  // สิทธิ์ทับพาธเดิมยังทดสอบข้างบน แต่แอปไม่ทับพาธเดิมแล้ว (CDN แคชตามพาธ → อ่านกลับได้ไฟล์เก่า/ไม่ครบ): ไฟล์ใหม่ทุกครั้งใช้ชื่อใหม่ในโฟลเดอร์คดี แล้วค่อยลบตัวเก่า — ดู uploadCasePdf ใน public/js/supabase-backend.js
  const v2 = `${caseId}/bundle-v2.pdf`;
  up = await M.storage.from('case-pdfs').upload(v2, pdfBytes('v2-overwritten'), { upsert: false, contentType: 'application/pdf', cacheControl: '3600' });
  ok('member uploads new version to a fresh path', !up.error, up.error?.message);
  const dl = await A.storage.from('case-pdfs').download(v2);
  ok('owner downloads latest content', !dl.error && (await text(dl.data)).includes('v2-overwritten'));
  let cur = v2;
  up = await S.storage.from('case-pdfs').upload(path, pdfBytes('evil'), { upsert: true, contentType: 'application/pdf' });
  ok('stranger cannot overwrite pdf', !!up.error);
  const sdl = await S.storage.from('case-pdfs').download(path);
  ok('stranger cannot download pdf', !!sdl.error);
  up = await M.storage.from('case-pdfs').upload(`other${rnd}/bundle.pdf`, pdfBytes('x'), { upsert: true, contentType: 'application/pdf' });
  ok('member cannot write another case folder', !!up.error);

  // รายการ PDF + ลิงก์ดู
  res = await M.from('case_pdfs').upsert({ case_id: caseId, path: cur, size_bytes: 77, pages: 2 }, { onConflict: 'case_id' });
  ok('member registers pdf row', !res.error, res.error?.message);
  res = await M.from('case_pdfs').upsert({ case_id: caseId, path: cur, size_bytes: 88, pages: 3 }, { onConflict: 'case_id' });
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
  // ฟังก์ชันช่วย: เหมือนที่แอปทำ — อัปโหลดชื่อใหม่ → ชี้แถวในตารางไปชื่อใหม่ → ลบชื่อเก่า
  let ver = 2;
  const putVersion = async (client, blob) => {
    const next = `${caseId}/bundle-v${++ver}.pdf`;
    const u = await client.storage.from('case-pdfs').upload(next, blob, { upsert: false, contentType: 'application/pdf', cacheControl: '3600' });
    assert.ifError(u.error);
    const rr = await client.from('case_pdfs').upsert({ case_id: caseId, path: next, size_bytes: blob.size, pages: 1 }, { onConflict: 'case_id' });
    assert.ifError(rr.error);
    const old = cur; cur = next;
    const rm0 = await client.storage.from('case-pdfs').remove([old]);
    assert.ifError(rm0.error);
  };
  await putVersion(A, pdfBytes('v3-newest'));
  f = await view(tok1);
  ok('same link shows newest after another overwrite', (await f.text()).includes('v3-newest'));
  // PDF จริงจากตัวสร้าง (E2E_REAL_PDF=<path> เช่น out.pdf ของ test/pdfexport.mjs): อัปโหลดทับแล้วลิงก์ดูต้องส่งไบต์เดียวกันทุกไบต์
  if (process.env.E2E_REAL_PDF) {
    const { readFileSync } = await import('node:fs'); const { createHash } = await import('node:crypto');
    const real = readFileSync(process.env.E2E_REAL_PDF);
    await putVersion(M, new Blob([real], { type: 'application/pdf' }));
    ok('real pdf uploaded in place of existing file', cur.endsWith('.pdf'));
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

  // อีเมลแจ้งเชิญ (Edge Function invite-email → Resend) ปลายทาง delivered@resend.dev = ที่อยู่ทดสอบของ Resend (ไม่ถึงคนจริง)
  const tokenOf = async (cl) => (await cl.auth.getSession()).data.session.access_token;
  const mail = async (cl, email, withAuth = true) => {
    const r = await fetch(`${url}/functions/v1/invite-email`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anonKey, ...(withAuth ? { Authorization: `Bearer ${await tokenOf(cl)}` } : {}) }, body: JSON.stringify({ caseId, email }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const TEST_TO = 'delivered@resend.dev';
  res = await A.from('case_members').insert({ case_id: caseId, email: TEST_TO });
  assert.ifError(res.error);
  let m1 = await mail(A, TEST_TO);
  ok('owner sends invite email via Resend', m1.status === 200 && m1.body.ok === true, JSON.stringify(m1));
  res = await A.from('case_members').select('notified_at').eq('case_id', caseId).eq('email', TEST_TO).single();
  ok('notified_at recorded by function', !!res.data?.notified_at);
  m1 = await mail(A, TEST_TO);
  ok('immediate resend is rate limited (429)', m1.status === 429 && m1.body.retryAfter > 0, JSON.stringify(m1));
  // ส่งซ้ำได้หลายครั้ง: ผ่านช่วงพัก 30 วินาทีแล้วต้องส่งได้อีก (และบันทึกเวลาใหม่)
  const before = (await A.from('case_members').select('notified_at').eq('case_id', caseId).eq('email', TEST_TO).single()).data.notified_at;
  await new Promise((r) => setTimeout(r, 31_000));
  m1 = await mail(A, TEST_TO);
  ok('resend works again after the 30s gap (multiple sends allowed)', m1.status === 200 && m1.body.ok === true, JSON.stringify(m1));
  const after = (await A.from('case_members').select('notified_at').eq('case_id', caseId).eq('email', TEST_TO).single()).data.notified_at;
  ok('notified_at moves forward on resend', new Date(after) > new Date(before));
  m1 = await mail(M, TEST_TO);
  ok('member (non-owner) cannot send invite email', m1.status === 403, JSON.stringify(m1));
  m1 = await mail(S, TEST_TO);
  ok('stranger cannot send invite email', m1.status === 403, JSON.stringify(m1));
  m1 = await mail(A, 'not-invited@example.com');
  ok('cannot email an address that is not a member (404)', m1.status === 404, JSON.stringify(m1));
  m1 = await mail(A, 'bad', true);
  ok('invalid email rejected (400)', m1.status === 400, JSON.stringify(m1));
  m1 = await mail(null, TEST_TO, false);
  ok('no auth token rejected', m1.status === 401 || m1.status === 403, JSON.stringify(m1));

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
  const names = ((await A.storage.from('case-pdfs').list(caseId)).data || []).map((o) => `${caseId}/${o.name}`); // เหมือน deleteCase: ลบทุกไฟล์ในโฟลเดอร์คดี
  ok('owner lists the case folder (current + first version)', names.includes(cur) && names.includes(path), names.join(','));
  const rm = await A.storage.from('case-pdfs').remove(names);
  ok('owner removes pdf objects', !rm.error && rm.data.length === names.length);
  res = await A.from('cases').delete().eq('id', caseId).select('id');
  ok('owner deletes case', !res.error && res.data.length === 1);
  res = await admin.from('case_pdfs').select('case_id').eq('case_id', caseId);
  ok('pdf row cascaded', res.data.length === 0);
  console.log(`\n${pass} ตรวจผ่านทั้งหมด`);
} finally {
  try { const left = ((await admin.storage.from('case-pdfs').list(caseId)).data || []).map((o) => `${caseId}/${o.name}`); if (left.length) await admin.storage.from('case-pdfs').remove(left); } catch { /* ข้าม */ }
  try { await admin.from('cases').delete().eq('id', caseId); } catch { /* ข้าม */ }
  for (const id of created) { try { await admin.auth.admin.deleteUser(id); } catch { /* ข้าม */ } }
  console.log(`ลบผู้ใช้ทดสอบ ${created.length} คน และข้อมูลทดสอบแล้ว`);
}
