-- คดี/สมุดรายชื่อแยกตามเจ้าของบัญชี: ประชาชนที่ล็อกอินร่างคำฟ้องเองได้, แอดมินเห็นและจัดการได้ทุกอย่าง
--
-- บทบาท
--   anon   = ยังไม่ล็อกอิน (โหมดทดลองเก็บข้อมูลในเบราว์เซอร์ ไม่แตะฐานข้อมูล) อ่านได้เฉพาะ law_data และส่ง inquiries
--   user   = ผู้ใช้ที่ล็อกอิน (Google ฯลฯ) ที่ไม่อยู่ในตาราง admins เห็น/แก้/ลบเฉพาะแถวของตนเอง (user_id = auth.uid())
--   admin  = อีเมลอยู่ในตาราง admins (public.is_admin()) เห็น/แก้/ลบได้ทุกแถว + เขียน law_data (แม่แบบ/เลย์เอาต์/ข้อความฟอร์ม)
--
-- ตารางทดสอบ RLS (A, B = ผู้ใช้ทั่วไปคนละคน; "—" = ถูกปฏิเสธ/มองไม่เห็นแถว)
--   การกระทำ                                              anon   user A         user B         admin
--   SELECT cases/people ของ A                              —      เห็น           —(0 แถว)       เห็น
--   SELECT cases/people ของ B                              —      —(0 แถว)       เห็น           เห็น
--   SELECT แถวเก่าที่ user_id เป็น null                    —      —              —              เห็น
--   INSERT user_id = ตนเอง (หรือไม่ส่ง = default uid)      —      ได้            ได้            ได้
--   INSERT user_id = คนอื่น / null                         —      — (check)      — (check)      ได้
--   UPDATE แถวของตนเอง                                     —      ได้            ได้            ได้
--   UPDATE แถวของคนอื่น (รวม upsert ชน id เดิม)            —      — (using)      — (using)      ได้
--   UPDATE แถวตนเองโดยเปลี่ยน user_id เป็นคนอื่น           —      — (check)      — (check)      ได้ (โอนเจ้าของ)
--   DELETE แถวของตนเอง / ของคนอื่น                         —      ได้ / —        ได้ / —        ได้ / ได้
--   SELECT law_data                                        ได้    ได้            ได้            ได้
--   INSERT/UPDATE/DELETE law_data (formText, layout,       —      —              —              ได้
--     templates, laws, geo ฯลฯ)
--   INSERT inquiries                                       ได้    ได้            ได้            ได้
--   SELECT/UPDATE/DELETE inquiries                         —      —              —              ได้
--   SELECT admins / เรียก add_admin()                      —      —              —              add_admin ได้เท่านั้น
--
-- วิธีตั้งแอดมินที่ปลอดภัยที่สุด: เจ้าของระบบรัน  select public.add_admin('you@example.com');  (หรือ insert into public.admins)
-- ใน SQL editor เอง แล้วหน้าเว็บจะไม่เสนอปุ่ม "ตั้งเป็นแอดมินคนแรก" (เสนอเฉพาะเมื่อเปิด /workspace/setup)

-- ---------- คอลัมน์เจ้าของ ----------
-- เพิ่มแบบไม่มี default ก่อน เพื่อให้แถวเดิมเป็น null (ไม่ถูกเติมเป็นผู้ใช้ที่รัน migration) แล้วค่อยตั้ง default สำหรับแถวใหม่
alter table public.cases  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.cases  add column if not exists owner_email text;
alter table public.people add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.people add column if not exists owner_email text;

alter table public.cases  alter column user_id set default auth.uid();
alter table public.cases  alter column owner_email set default (auth.jwt() ->> 'email');
alter table public.people alter column user_id set default auth.uid();
alter table public.people alter column owner_email set default (auth.jwt() ->> 'email');

-- แถวเดิม: ย้ายเจ้าของจากคอลัมน์ owner (ถ้ามีบัญชีอยู่จริง) และเติมอีเมล; แถวที่ไม่มีเจ้าของ (null) = เห็นเฉพาะแอดมิน
update public.cases c set user_id = c.owner
  where c.user_id is null and c.owner is not null and exists (select 1 from auth.users u where u.id = c.owner);
update public.people p set user_id = p.owner
  where p.user_id is null and p.owner is not null and exists (select 1 from auth.users u where u.id = p.owner);
update public.cases c set owner_email = u.email from auth.users u where c.user_id = u.id and c.owner_email is null;
update public.people p set owner_email = u.email from auth.users u where p.user_id = u.id and p.owner_email is null;

create index if not exists cases_user_updated_idx on public.cases (user_id, updated_at desc);
create index if not exists people_user_idx on public.people (user_id);

-- กันแถวใหญ่ผิดปกติจากบัญชีสาธารณะ (NOT VALID = ไม่ตรวจแถวเดิม ตรวจเฉพาะที่เขียนใหม่)
do $$ begin
  alter table public.cases  add constraint cases_data_size  check (octet_length(data::text) <= 2000000) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.people add constraint people_data_size check (octet_length(data::text) <= 200000) not valid;
exception when duplicate_object then null; end $$;

-- ทริกเกอร์: (1) ผู้ใช้ทั่วไปปลอมอีเมลเจ้าของไม่ได้ (2) จำกัดจำนวนแถวต่อบัญชี (กันเต็มฐานข้อมูล) — แอดมินและ SQL editor ไม่ถูกจำกัด
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
  new.owner_email := auth.jwt() ->> 'email';
  if tg_op = 'INSERT' then
    -- upsert ที่ชน id เดิมจะผ่าน BEFORE INSERT ด้วย: นับเฉพาะกรณีเป็นแถวใหม่จริง (ไม่งั้นบัญชีที่เต็มโควตาจะแก้คดีเดิมไม่ได้)
    execute format('select count(*) from public.%I where user_id = $1 and id <> $2', tg_table_name) into n using auth.uid(), new.id;
    if n >= cap then raise exception 'เกินจำนวนที่เก็บได้ต่อบัญชี (%)', cap using errcode = '54000'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists cases_stamp_owner on public.cases;
create trigger cases_stamp_owner before insert or update on public.cases for each row execute function public.stamp_owner_and_limit();
drop trigger if exists people_stamp_owner on public.people;
create trigger people_stamp_owner before insert or update on public.people for each row execute function public.stamp_owner_and_limit();

-- ---------- แอดมิน: ต้องเป็นอีเมลที่ "ยืนยันแล้ว" ----------
-- เดิมเทียบอีเมลใน JWT อย่างเดียว เมื่อเปิดให้คนทั่วไปสมัครได้ ผู้ไม่หวังดีอาจสมัครด้วยอีเมลของแอดมินโดยไม่ยืนยันอีเมล
-- จึงเปลี่ยนไปเทียบกับ auth.users ที่ email_confirmed_at ไม่ว่าง (บัญชี Google ยืนยันแล้วเสมอ)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.admins a on lower(a.email) = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Row Level Security ----------
alter table public.cases  enable row level security;
alter table public.people enable row level security;

-- นโยบายเดิม (admin-only) และชื่อใหม่ (ให้รันซ้ำได้)
drop policy if exists cases_admin_all on public.cases;
drop policy if exists people_admin_all on public.people;
drop policy if exists cases_select on public.cases;
drop policy if exists cases_insert on public.cases;
drop policy if exists cases_update on public.cases;
drop policy if exists cases_delete on public.cases;
drop policy if exists people_select on public.people;
drop policy if exists people_insert on public.people;
drop policy if exists people_update on public.people;
drop policy if exists people_delete on public.people;

-- user_id = auth.uid() เป็น false/null เมื่อ user_id เป็น null หรือ anon (auth.uid() null) → แถวไม่มีเจ้าของเห็นเฉพาะแอดมิน
create policy cases_select on public.cases for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy cases_insert on public.cases for insert to authenticated
  with check (user_id = (select auth.uid()) or public.is_admin());
create policy cases_update on public.cases for update to authenticated
  using (user_id = (select auth.uid()) or public.is_admin())
  with check (user_id = (select auth.uid()) or public.is_admin());
create policy cases_delete on public.cases for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy people_select on public.people for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy people_insert on public.people for insert to authenticated
  with check (user_id = (select auth.uid()) or public.is_admin());
create policy people_update on public.people for update to authenticated
  using (user_id = (select auth.uid()) or public.is_admin())
  with check (user_id = (select auth.uid()) or public.is_admin());
create policy people_delete on public.people for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- law_data: อ่านได้สาธารณะ เขียนได้เฉพาะแอดมิน (ยืนยันซ้ำให้ชัด — ครอบคลุม formText, layout, templates, laws, geo ทุกคีย์)
alter table public.law_data enable row level security;
drop policy if exists law_data_read on public.law_data;
create policy law_data_read on public.law_data for select to anon, authenticated using (true);
drop policy if exists law_data_admin_write on public.law_data;
create policy law_data_admin_write on public.law_data for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- inquiries: คงเดิม (anon เพิ่มได้อย่างเดียว, แอดมินอ่าน/แก้/ลบ) — ไม่แตะนโยบาย

-- ---------- สิทธิ์ระดับตาราง ----------
revoke all on public.cases, public.people from anon;
revoke all on public.cases, public.people from public;
grant select, insert, update, delete on public.cases, public.people to authenticated;
revoke insert, update, delete on public.law_data from anon;
grant select on public.law_data to anon;

notify pgrst, 'reload schema';
