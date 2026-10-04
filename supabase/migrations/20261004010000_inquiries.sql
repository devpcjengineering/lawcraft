-- ข้อความปรึกษาคดีจากหน้าเว็บ: ผู้เยี่ยมชม (anon) ส่งได้อย่างเดียว ไม่สามารถอ่าน/แก้/ลบ — แอดมินเท่านั้นที่อ่านและจัดการได้
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 120),
  contact text not null check (char_length(contact) between 5 and 200),
  topic text check (topic is null or char_length(topic) <= 80),
  message text not null check (char_length(message) between 10 and 4000),
  consent boolean not null check (consent = true),
  status text not null default 'new' check (status in ('new', 'handled'))
);
create index if not exists inquiries_created_idx on public.inquiries (created_at desc);

alter table public.inquiries enable row level security;

drop policy if exists inquiries_insert_public on public.inquiries;
create policy inquiries_insert_public on public.inquiries
  for insert to anon, authenticated
  with check (status = 'new' and consent = true);

drop policy if exists inquiries_admin_all on public.inquiries;
create policy inquiries_admin_all on public.inquiries
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- anon: เพิ่มได้อย่างเดียว
revoke all on public.inquiries from anon;
grant insert on public.inquiries to anon;
