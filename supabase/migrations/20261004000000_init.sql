-- ระบบเอกสารยื่นศาล: ตารางหลัก + Row Level Security
-- หลักการ: ข้อมูลคดี/คู่ความ (ข้อมูลส่วนบุคคล) เข้าถึงได้เฉพาะแอดมินที่อยู่ในตาราง admins เท่านั้น
--          ข้อมูลกฎหมาย (law_data) อ่านได้สาธารณะ แก้ได้เฉพาะแอดมิน

create table if not exists public.admins (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.cases (
  id text primary key,
  owner uuid default auth.uid(),
  title text,
  type text,
  court text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cases_updated_idx on public.cases (updated_at desc);

create table if not exists public.people (
  id text primary key,
  owner uuid default auth.uid(),
  kind text not null,
  label text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.law_data (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- ตรวจว่าผู้ใช้ที่ล็อกอินเป็นแอดมินหรือไม่ (security definer เพื่ออ่านตาราง admins ที่ปิดสิทธิ์ไว้)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.admins   enable row level security;
alter table public.cases    enable row level security;
alter table public.people   enable row level security;
alter table public.law_data enable row level security;

-- admins: ไม่มี policy = ไม่มีใครอ่าน/เขียนผ่าน API ได้ (จัดการด้วย service_role หรือ SQL เท่านั้น)
revoke all on public.admins from anon, authenticated;

drop policy if exists cases_admin_all on public.cases;
create policy cases_admin_all on public.cases
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists people_admin_all on public.people;
create policy people_admin_all on public.people
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists law_data_read on public.law_data;
create policy law_data_read on public.law_data
  for select to anon, authenticated
  using (true);

drop policy if exists law_data_admin_write on public.law_data;
create policy law_data_admin_write on public.law_data
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- anon เข้าถึงข้อมูลคดีไม่ได้เลย
revoke all on public.cases, public.people from anon;
revoke insert, update, delete on public.law_data from anon;
