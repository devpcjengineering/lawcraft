-- แชร์คดี: เชิญผู้อื่นเข้ามาแก้ไขคดี + เก็บ PDF ชุดเอกสารใน Storage (ไฟล์เดียวต่อคดี อัปโหลดทับไฟล์เดิม) + ลิงก์ดู PDF
--
-- สิทธิ์ต่อคดี (เพิ่มจาก 20261005000000_user_cases.sql)
--   เจ้าของ  = cases.user_id = auth.uid()   : ทำได้ทุกอย่าง รวมลบคดี เชิญ/ถอนผู้แก้ไข เปิด/ปิดลิงก์ดู PDF
--   ผู้แก้ไข = อีเมลอยู่ใน case_members      : เห็น/แก้คดี อัปโหลด PDF ได้ — ลบคดี เชิญคนอื่น เปลี่ยนเจ้าของไม่ได้ ถอนตัวเองได้
--   แอดมิน   = public.is_admin()             : ได้ทุกอย่างเหมือนเดิม
--   อื่น ๆ    = ไม่เห็นคดีนี้เลย
-- ผู้แก้ไขระบุด้วยอีเมลที่ "ยืนยันแล้ว" (บัญชี Google) — ผู้ที่ยังไม่เคยเข้าระบบก็เชิญไว้ก่อนได้ เห็นคดีทันทีที่เข้าสู่ระบบด้วยอีเมลนั้น
--
-- ลิงก์ดู PDF: share_token สุ่มยาว (ไม่เปิดเผยตัวไฟล์ใน Storage) — Edge Function `pdf` ใช้ token ดึงไฟล์ให้ดูโดยไม่ต้องล็อกอิน
-- ปิดลิงก์ = ล้าง token (ลิงก์เดิมใช้ไม่ได้ทันที) ; สร้างลิงก์ใหม่ = token ใหม่

-- ---------- ตาราง ----------
create table if not exists public.case_members (
  case_id    text not null references public.cases(id) on delete cascade,
  email      text not null check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(email) <= 254),
  invited_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (case_id, email)
);
create index if not exists case_members_email_idx on public.case_members (email);

create table if not exists public.case_pdfs (
  case_id          text primary key references public.cases(id) on delete cascade,
  path             text not null,
  size_bytes       integer,
  pages            integer,
  share_token      text unique,
  updated_at       timestamptz not null default now(),
  updated_by       uuid,
  updated_by_email text
);

-- ---------- ฟังก์ชันตรวจสิทธิ์ (security definer: อ่านตารางได้โดยไม่ติด RLS ของตัวเอง จึงไม่วนซ้ำ) ----------
create or replace function public.is_case_owner(cid text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    public.is_admin()
    or exists (select 1 from public.cases c where c.id = cid and c.user_id = auth.uid()),
    false);
$$;

create or replace function public.can_edit_case(cid text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    public.is_case_owner(cid)
    or exists (
      select 1 from public.case_members m
      join auth.users u on lower(u.email) = m.email
      where m.case_id = cid and u.id = auth.uid() and u.email_confirmed_at is not null),
    false);
$$;
revoke all on function public.is_case_owner(text), public.can_edit_case(text) from public, anon;
grant execute on function public.is_case_owner(text), public.can_edit_case(text) to authenticated;

-- ---------- ทริกเกอร์ cases/people ----------
-- เดิมทุกการแก้ไขประทับอีเมลผู้แก้เป็นเจ้าของ → ผู้แก้ไขที่ไม่ใช่เจ้าของจะแย่งชื่อเจ้าของได้ จึงประทับเฉพาะตอนสร้าง; ตอนแก้ไขห้ามเปลี่ยนเจ้าของ (ยกเว้นแอดมิน)
create or replace function public.stamp_owner_and_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cap int := case tg_table_name when 'cases' then 300 else 2000 end;
  n int;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'ไม่มีสิทธิ์โอนเจ้าของ' using errcode = '42501';
    end if;
    new.owner_email := old.owner_email;
    return new;
  end if;
  new.owner_email := auth.jwt() ->> 'email';
  -- upsert ที่ชน id เดิมจะผ่าน BEFORE INSERT ด้วย: นับเฉพาะกรณีเป็นแถวใหม่จริง (ไม่งั้นบัญชีที่เต็มโควตาจะแก้คดีเดิมไม่ได้)
  execute format('select count(*) from public.%I where user_id = $1 and id <> $2', tg_table_name) into n using auth.uid(), new.id;
  if n >= cap then raise exception 'เกินจำนวนที่เก็บได้ต่อบัญชี (%)', cap using errcode = '54000'; end if;
  return new;
end;
$$;

-- จำกัดจำนวนผู้แก้ไขต่อคดี (กันใช้เป็นที่เก็บอีเมลจำนวนมาก)
create or replace function public.limit_case_members()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.case_members where case_id = new.case_id) >= 20 then
    raise exception 'เชิญผู้แก้ไขได้ไม่เกิน 20 คนต่อคดี' using errcode = '54000';
  end if;
  return new;
end;
$$;
drop trigger if exists case_members_limit on public.case_members;
create trigger case_members_limit before insert on public.case_members for each row execute function public.limit_case_members();

-- ประทับผู้อัปโหลด/เวลา (ฝั่งไคลเอนต์ปลอมไม่ได้)
create or replace function public.stamp_case_pdf()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.updated_by_email := auth.jwt() ->> 'email';
  return new; -- share_token: ไคลเอนต์ไม่มีสิทธิ์ระดับคอลัมน์ (ดู grant ด้านล่าง) เปลี่ยนได้ทาง set_case_share() เท่านั้น
end;
$$;
drop trigger if exists case_pdfs_stamp on public.case_pdfs;
create trigger case_pdfs_stamp before insert or update on public.case_pdfs for each row execute function public.stamp_case_pdf();

-- ---------- เปิด/ปิด/ออกลิงก์ใหม่ ของลิงก์ดู PDF (คืน token หรือ null เมื่อปิด) ----------
create or replace function public.set_case_share(cid text, mode text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  tok text;
begin
  if not public.can_edit_case(cid) then raise exception 'ไม่มีสิทธิ์ทำรายการนี้' using errcode = '42501'; end if;
  if not exists (select 1 from public.case_pdfs where case_id = cid) then raise exception 'ยังไม่ได้อัปโหลด PDF ของคดีนี้' using errcode = 'P0002'; end if;
  if mode = 'off' then
    update public.case_pdfs set share_token = null where case_id = cid;
    return null;
  elsif mode = 'on' then
    update public.case_pdfs set share_token = coalesce(share_token, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) where case_id = cid returning share_token into tok;
  elsif mode = 'new' then
    update public.case_pdfs set share_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where case_id = cid returning share_token into tok;
  else
    raise exception 'mode ไม่ถูกต้อง' using errcode = '22023';
  end if;
  return tok;
end;
$$;
revoke all on function public.set_case_share(text, text) from public, anon;
grant execute on function public.set_case_share(text, text) to authenticated;

-- ---------- Row Level Security: cases ----------
drop policy if exists cases_select on public.cases;
drop policy if exists cases_update on public.cases;
drop policy if exists cases_delete on public.cases;
-- เห็น/แก้ได้: เจ้าของ แอดมิน และผู้แก้ไขที่ถูกเชิญ (can_edit_case) ; ลบได้เฉพาะเจ้าของ/แอดมิน
-- เช็ก user_id ที่แถวนั้นโดยตรงก่อน (ไม่ต้องค้นตาราง) : insert ... returning ของเจ้าของต้องเห็นแถวที่เพิ่งสร้างในคำสั่งเดียวกัน
-- (ฟังก์ชันที่ค้น cases เองมองไม่เห็นแถวนั้น) ; ผู้แก้ไข/แอดมินผ่านทาง can_edit_case
create policy cases_select on public.cases for select to authenticated
  using (user_id = (select auth.uid()) or public.can_edit_case(id));
create policy cases_update on public.cases for update to authenticated
  using (user_id = (select auth.uid()) or public.can_edit_case(id))
  with check (user_id = (select auth.uid()) or public.can_edit_case(id));
create policy cases_delete on public.cases for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
-- cases_insert คงเดิม (user_id = auth.uid() หรือแอดมิน) ; การเปลี่ยน user_id ตอนแก้ไขถูกทริกเกอร์ stamp_owner_and_limit ปฏิเสธ

-- ---------- Row Level Security: case_members / case_pdfs ----------
alter table public.case_members enable row level security;
alter table public.case_pdfs    enable row level security;
revoke all on public.case_members, public.case_pdfs from anon, authenticated, public; -- Supabase ให้สิทธิ์ตารางใหม่แก่ authenticated ล่วงหน้า (default privileges) → ถอนก่อนแล้วให้เฉพาะที่ต้องใช้
grant select, insert, delete on public.case_members to authenticated;
grant select, delete on public.case_pdfs to authenticated;
grant insert (case_id, path, size_bytes, pages), update (case_id, path, size_bytes, pages) on public.case_pdfs to authenticated; -- upsert ส่งทุกคอลัมน์ที่ระบุ (รวม case_id); share_token/updated_* แก้ผ่านไคลเอนต์ไม่ได้

drop policy if exists case_members_select on public.case_members;
drop policy if exists case_members_insert on public.case_members;
drop policy if exists case_members_delete on public.case_members;
create policy case_members_select on public.case_members for select to authenticated
  using (public.can_edit_case(case_id));
create policy case_members_insert on public.case_members for insert to authenticated
  with check (public.is_case_owner(case_id));
create policy case_members_delete on public.case_members for delete to authenticated
  using (public.is_case_owner(case_id) or email = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists case_pdfs_select on public.case_pdfs;
drop policy if exists case_pdfs_insert on public.case_pdfs;
drop policy if exists case_pdfs_update on public.case_pdfs;
drop policy if exists case_pdfs_delete on public.case_pdfs;
create policy case_pdfs_select on public.case_pdfs for select to authenticated using (public.can_edit_case(case_id));
create policy case_pdfs_insert on public.case_pdfs for insert to authenticated with check (public.can_edit_case(case_id));
create policy case_pdfs_update on public.case_pdfs for update to authenticated using (public.can_edit_case(case_id)) with check (public.can_edit_case(case_id));
create policy case_pdfs_delete on public.case_pdfs for delete to authenticated using (public.can_edit_case(case_id));

-- ---------- Storage: bucket ส่วนตัว case-pdfs (ไฟล์ <case_id>/bundle.pdf) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('case-pdfs', 'case-pdfs', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists case_pdfs_obj_select on storage.objects;
drop policy if exists case_pdfs_obj_insert on storage.objects;
drop policy if exists case_pdfs_obj_update on storage.objects;
drop policy if exists case_pdfs_obj_delete on storage.objects;
create policy case_pdfs_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'case-pdfs' and public.can_edit_case((storage.foldername(name))[1]));
create policy case_pdfs_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'case-pdfs' and public.can_edit_case((storage.foldername(name))[1]));
create policy case_pdfs_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'case-pdfs' and public.can_edit_case((storage.foldername(name))[1]))
  with check (bucket_id = 'case-pdfs' and public.can_edit_case((storage.foldername(name))[1]));
create policy case_pdfs_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'case-pdfs' and public.can_edit_case((storage.foldername(name))[1]));

notify pgrst, 'reload schema';
