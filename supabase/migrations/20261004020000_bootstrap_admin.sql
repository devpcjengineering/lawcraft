-- ตั้งผู้ดูแลระบบคนแรกด้วยตนเอง (bootstrap) และเพิ่มผู้ดูแลเพิ่ม โดยไม่ต้องแตะฐานข้อมูลตรง
-- กติกา: ผู้ที่ล็อกอินด้วย Google (อีเมลยืนยันโดย Google) เป็นคนแรกขณะที่ตาราง admins ยังว่าง ขอเป็นแอดมินคนแรกได้ครั้งเดียว
--        หลังมีแอดมินแล้ว เฉพาะแอดมินเท่านั้นที่เพิ่มคนอื่นได้ (add_admin)

create or replace function public.has_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.admins); $$;

create or replace function public.claim_first_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
  prov text := coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '');
begin
  if em = '' or prov <> 'google' then return false; end if;       -- ต้องเป็นบัญชี Google เท่านั้น
  if exists (select 1 from public.admins) then return false; end if; -- มีแอดมินแล้ว = ปิดช่องทางนี้
  insert into public.admins (email) values (em) on conflict do nothing;
  return true;
end;
$$;

create or replace function public.add_admin(new_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then return false; end if;
  if new_email is null or new_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return false; end if;
  insert into public.admins (email) values (lower(trim(new_email))) on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.has_admin() from public, anon;
revoke all on function public.claim_first_admin() from public, anon;
revoke all on function public.add_admin(text) from public, anon;
grant execute on function public.has_admin() to authenticated;
grant execute on function public.claim_first_admin() to authenticated;
grant execute on function public.add_admin(text) to authenticated;
