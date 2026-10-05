-- ทดสอบสิทธิ์การแชร์คดี (RLS + Storage) — รันหลัง 20261006000000_case_sharing.sql ในธุรกรรมเดียวแล้ว "ยกเลิกเอง" ด้วย exception ท้ายบล็อก
-- (ไม่ทิ้งข้อมูลทดสอบ/ไม่แก้ฐานข้อมูลจริง): ผลลัพธ์อยู่ในข้อความ error ที่ขึ้นต้น RESULTS:
--   node test/sharing-rls.mjs   (สคริปต์นั้นต่อไฟล์ไมเกรชัน + ไฟล์นี้ แล้วเรียก supabase db query --linked)
do $test$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); s uuid := gen_random_uuid(); x uuid := gen_random_uuid(); ad uuid := gen_random_uuid();
  res jsonb := '[]'::jsonb;
  n int; t text; ok boolean;
  tok text;
  oe text; ou uuid;
  denied boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
    (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local', now(), now(), now()),
    (m, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@test.local', now(), now(), now()),
    (s, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@test.local', now(), now(), now()),
    (x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unconfirmed@test.local', null, now(), now()),
    (ad, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local', now(), now(), now());
  insert into public.admins (email) values ('admin@test.local');

  -- ===== เจ้าของสร้างคดี =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'owner@test.local', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.cases (id, title, type, data) values ('tshare1', 'คดีทดสอบ', 'criminal', '{"k":1}') returning id into t;
  res := res || jsonb_build_array(jsonb_build_object('t', 'owner insert ... returning sees new row', 'ok', t = 'tshare1'));
  select count(*) into n from public.cases where id = 'tshare1';
  res := res || jsonb_build_array(jsonb_build_object('t', 'owner sees own case', 'ok', n = 1));
  select user_id, owner_email into ou, oe from public.cases where id = 'tshare1';
  res := res || jsonb_build_array(jsonb_build_object('t', 'owner stamped', 'ok', ou = a and oe = 'owner@test.local'));
  reset role;

  -- ===== คนแปลกหน้า: ไม่เห็น/แก้/ลบไม่ได้ =====
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'email', 'stranger@test.local', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.cases where id = 'tshare1';
  res := res || jsonb_build_array(jsonb_build_object('t', 'stranger cannot see case', 'ok', n = 0));
  update public.cases set title = 'hack' where id = 'tshare1';
  get diagnostics n = row_count;
  res := res || jsonb_build_array(jsonb_build_object('t', 'stranger cannot update', 'ok', n = 0));
  delete from public.cases where id = 'tshare1';
  get diagnostics n = row_count;
  res := res || jsonb_build_array(jsonb_build_object('t', 'stranger cannot delete', 'ok', n = 0));
  denied := false;
  begin insert into public.cases (id, title, type, data) values ('tshare1', 'hack', 'criminal', '{}') on conflict (id) do update set title = excluded.title; exception when others then denied := true; end;
  res := res || jsonb_build_array(jsonb_build_object('t', 'stranger upsert onto others case denied', 'ok', denied));
  denied := false;
  begin insert into public.case_members (case_id, email) values ('tshare1', 'stranger@test.local'); exception when others then denied := true; end;
  res := res || jsonb_build_array(jsonb_build_object('t', 'stranger cannot add self as member', 'ok', denied));
  denied := false;
  begin perform public.set_case_share('tshare1', 'on'); exception when others then denied := true; end;
  res := res || jsonb_build_array(jsonb_build_object('t', 'stranger cannot share', 'ok', denied));
  reset role;

  -- ===== เจ้าของเชิญผู้แก้ไข =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'owner@test.local', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.case_members (case_id, email) values ('tshare1', 'member@test.local'), ('tshare1', 'unconfirmed@test.local');
  denied := false;
  begin insert into public.case_members (case_id, email) values ('tshare1', 'Bad Case@x.com'); exception when others then denied := true; end;
  res := res || jsonb_build_array(jsonb_build_object('t', 'invalid/non-lowercase email rejected', 'ok', denied));
  reset role;

  -- ===== ผู้แก้ไข =====
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'email', 'member@test.local', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.cases where id = 'tshare1';
  res := res || jsonb_build_array(jsonb_build_object('t', 'member sees shared case', 'ok', n = 1));
  update public.cases set title = 'แก้โดยผู้แก้ไข', data = '{"k":2}' where id = 'tshare1';
  get diagnostics n = row_count;
  res := res || jsonb_build_array(jsonb_build_object('t', 'member can update', 'ok', n = 1));
  select user_id, owner_email into ou, oe from public.cases where id = 'tshare1';
  res := res || jsonb_build_array(jsonb_build_object('t', 'owner unchanged after member update', 'ok', ou = a and oe = 'owner@test.local'));
  -- เหมือน saveCase: upsert ทั้งแถว (ไม่ส่ง user_id/owner_email)
  insert into public.cases (id, title, type, court, data, updated_at) values ('tshare1', 'upsert โดยผู้แก้ไข', 'criminal', null, '{"k":3}', now())
    on conflict (id) do update set title = excluded.title, type = excluded.type, court = excluded.court, data = excluded.data, updated_at = excluded.updated_at;
  select user_id, owner_email, title into ou, oe, t from public.cases where id = 'tshare1';
  res := res || jsonb_build_array(jsonb_build_object('t', 'member upsert keeps owner', 'ok', ou = a and oe = 'owner@test.local' and t = 'upsert โดยผู้แก้ไข'));
  denied := false;
  begin update public.cases set user_id = m where id = 'tshare1'; exception when others then denied := true; end;
  res := res || jsonb_build_array(jsonb_build_object('t', 'member cannot take ownership', 'ok', denied));
  delete from public.cases where id = 'tshare1';
  get diagnostics n = row_count;
  res := res || jsonb_build_array(jsonb_build_object('t', 'member cannot delete case', 'ok', n = 0));
  denied := false;
  begin insert into public.case_members (case_id, email) values ('tshare1', 'friend@test.local'); exception when others then denied := true; end;
  res := res || jsonb_build_array(jsonb_build_object('t', 'member cannot invite others', 'ok', denied));
  -- PDF
  insert into public.case_pdfs (case_id, path, size_bytes, pages) values ('tshare1', 'tshare1/bundle.pdf', 1234, 5)
    on conflict (case_id) do update set path = excluded.path, size_bytes = excluded.size_bytes, pages = excluded.pages;
  insert into public.case_pdfs (case_id, path, size_bytes, pages) values ('tshare1', 'tshare1/bundle.pdf', 2345, 6)
    on conflict (case_id) do update set case_id = excluded.case_id, path = excluded.path, size_bytes = excluded.size_bytes, pages = excluded.pages;
  select count(*) into n from public.case_pdfs where case_id = 'tshare1' and size_bytes = 2345 and updated_by = m and updated_by_email = 'member@test.local';
  res := res || jsonb_build_array(jsonb_build_object('t', 'member uploads pdf record (upsert twice, stamped)', 'ok', n = 1));
  denied := false;
  begin update public.case_pdfs set share_token = 'forged' where case_id = 'tshare1'; exception when others then denied := true; end;
  res := res || jsonb_build_array(jsonb_build_object('t', 'client cannot set share_token directly', 'ok', denied));
  tok := public.set_case_share('tshare1', 'on');
  res := res || jsonb_build_array(jsonb_build_object('t', 'share on returns long token', 'ok', tok is not null and length(tok) >= 60));
  ok := public.set_case_share('tshare1', 'on') = tok;
  res := res || jsonb_build_array(jsonb_build_object('t', 'share on is idempotent', 'ok', ok));
  ok := public.set_case_share('tshare1', 'new') <> tok;
  res := res || jsonb_build_array(jsonb_build_object('t', 'share new rotates token', 'ok', ok));
  -- ผู้แก้ไขต้องอัปโหลดทับไฟล์ใน Storage ได้
  insert into storage.objects (bucket_id, name, owner, metadata) values ('case-pdfs', 'tshare1/bundle.pdf', m, '{}'::jsonb);
  select count(*) into n from storage.objects where bucket_id = 'case-pdfs' and name = 'tshare1/bundle.pdf';
  res := res || jsonb_build_array(jsonb_build_object('t', 'member can write+read storage object', 'ok', n = 1));
  update storage.objects set metadata = '{"v":2}'::jsonb where bucket_id = 'case-pdfs' and name = 'tshare1/bundle.pdf';
  get diagnostics n = row_count;
  res := res || jsonb_build_array(jsonb_build_object('t', 'member can overwrite storage object', 'ok', n = 1));
  denied := false;
  begin insert into storage.objects (bucket_id, name, owner, metadata) values ('case-pdfs', 'otherCase/bundle.pdf', m, '{}'::jsonb); exception when others then denied := true; end;
  res := res || jsonb_build_array(jsonb_build_object('t', 'member cannot write another case folder', 'ok', denied));
  reset role;

  -- ===== คนแปลกหน้า/ผู้ถูกเชิญที่ยังไม่ยืนยันอีเมล =====
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'email', 'stranger@test.local', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.case_pdfs where case_id = 'tshare1';
  res := res || jsonb_build_array(jsonb_build_object('t', 'stranger cannot see pdf record', 'ok', n = 0));
  select count(*) into n from storage.objects where bucket_id = 'case-pdfs' and name = 'tshare1/bundle.pdf';
  res := res || jsonb_build_array(jsonb_build_object('t', 'stranger cannot see storage object', 'ok', n = 0));
  select count(*) into n from public.case_members where case_id = 'tshare1';
  res := res || jsonb_build_array(jsonb_build_object('t', 'stranger cannot list members', 'ok', n = 0));
  denied := false;
  begin insert into storage.objects (bucket_id, name, owner, metadata) values ('case-pdfs', 'tshare1/evil.pdf', s, '{}'::jsonb); exception when others then denied := true; end;
  res := res || jsonb_build_array(jsonb_build_object('t', 'stranger cannot write storage', 'ok', denied));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'email', 'unconfirmed@test.local', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.cases where id = 'tshare1';
  res := res || jsonb_build_array(jsonb_build_object('t', 'invited but unconfirmed email sees nothing', 'ok', n = 0));
  reset role;

  -- ===== ผู้แก้ไขออกจากคดีเอง / เจ้าของถอน =====
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'email', 'member@test.local', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.case_members where case_id = 'tshare1' and email = 'member@test.local';
  get diagnostics n = row_count;
  res := res || jsonb_build_array(jsonb_build_object('t', 'member can leave', 'ok', n = 1));
  select count(*) into n from public.cases where id = 'tshare1';
  res := res || jsonb_build_array(jsonb_build_object('t', 'after leaving cannot see case', 'ok', n = 0));
  reset role;

  -- ===== แอดมิน =====
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'email', 'admin@test.local', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.cases where id = 'tshare1';
  res := res || jsonb_build_array(jsonb_build_object('t', 'admin sees all', 'ok', n = 1));
  update public.cases set title = 'admin edit' where id = 'tshare1';
  get diagnostics n = row_count;
  res := res || jsonb_build_array(jsonb_build_object('t', 'admin can update', 'ok', n = 1));
  select user_id into ou from public.cases where id = 'tshare1';
  res := res || jsonb_build_array(jsonb_build_object('t', 'admin edit keeps owner', 'ok', ou = a));
  reset role;

  -- ===== เจ้าของลบคดี → ตารางลูกหายตาม =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'owner@test.local', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.cases where id = 'tshare1';
  get diagnostics n = row_count;
  res := res || jsonb_build_array(jsonb_build_object('t', 'owner can delete', 'ok', n = 1));
  reset role;
  select count(*) into n from public.case_pdfs where case_id = 'tshare1';
  res := res || jsonb_build_array(jsonb_build_object('t', 'case_pdfs cascade on delete', 'ok', n = 0));
  select count(*) into n from public.case_members where case_id = 'tshare1';
  res := res || jsonb_build_array(jsonb_build_object('t', 'case_members cascade on delete', 'ok', n = 0));

  -- ===== anon เข้าถึงตารางใหม่ไม่ได้ =====
  execute 'set local role anon';
  denied := false;
  begin perform 1 from public.case_pdfs limit 1; exception when others then denied := true; end;
  res := res || jsonb_build_array(jsonb_build_object('t', 'anon cannot read case_pdfs', 'ok', denied));
  denied := false;
  begin perform 1 from public.case_members limit 1; exception when others then denied := true; end;
  res := res || jsonb_build_array(jsonb_build_object('t', 'anon cannot read case_members', 'ok', denied));
  denied := false;
  begin perform public.can_edit_case('x'); exception when others then denied := true; end;
  res := res || jsonb_build_array(jsonb_build_object('t', 'anon cannot call can_edit_case', 'ok', denied));
  reset role;

  raise exception 'RESULTS:%', res::text;
end
$test$;
