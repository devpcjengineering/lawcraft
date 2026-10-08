-- ค่านำหมาย (อัตราส่งหมายของศาลปลายทาง รายศาล × ตำบล × หมู่) — ข้อมูลสาธารณะอ่านอย่างเดียว
--
-- ที่มา: สำนักงานศาลยุติธรรม (exp.coj.co.th) ผ่าน scripts/build-service-fees.mjs (ตัดซ้ำ/ไม่จำเป็นแล้ว) → scripts/load-service-fees.mjs โหลดขึ้นตารางเหล่านี้
-- สิทธิ์: อ่านได้ทุกคน (anon + authenticated) ; ไม่มี policy เขียนเลย → เขียนได้เฉพาะ service role / CLI (postgres) เท่านั้น
-- การค้น: service_fee_lookup (จังหวัด/อำเภอ/ตำบล[/หมู่/ศาล]) · service_fee_area (ทั้งจังหวัด รูปแบบเดียวกับไฟล์ static) · service_fee_courts_search (ค้นชื่อศาล) · service_fee_provinces
-- ชื่อพื้นที่ค้นด้วยคีย์ที่ตัดคำนำหน้า (ต./อ./เขต/แขวง/จังหวัด) ช่องว่าง และแปลงเลขไทย — ตรงกับ normalizePlace() ใน shared/service-fee.js

-- ---------- ฟังก์ชันปรับชื่อ (immutable) ----------
create or replace function public.service_fee_norm(t text)
returns text
language sql immutable set search_path = ''
as $$
  select case when s ~ '^กรุงเทพ' then 'กรุงเทพมหานคร' else s end
  from (
    select regexp_replace(
             regexp_replace(
               translate(regexp_replace(coalesce(t, ''), '[\s​]+', '', 'g'), '๐๑๒๓๔๕๖๗๘๙', '0123456789'),
               '^(ตำบล|แขวง|อำเภอ|จังหวัด|เขต|ต\.|อ\.|จ\.)+', ''),
             '^(ตำบล|แขวง|อำเภอ|จังหวัด|เขต)+', '') as s
  ) x;
$$;

-- คีย์ชื่อศาล: ตัดช่องว่าง/วงเล็บ (เก็บข้อความในวงเล็บ) แปลงเลขไทย เติม 'ศาล' นำหน้าถ้าขาด — ตรงกับ courtKey() ใน shared/service-fee.js
create or replace function public.service_fee_court_key(t text)
returns text
language sql immutable set search_path = ''
as $$
  select case when s = '' or s ~ '^ศาล' then s else 'ศาล' || s end
  from (select translate(regexp_replace(coalesce(t, ''), '[\s​()（）]+', '', 'g'), '๐๑๒๓๔๕๖๗๘๙', '0123456789') as s) x;
$$;

-- หมู่ของแถวข้อมูล: '' = ทั้งตำบล · '1' · '1-3' · '1,4,6-8'
create or replace function public.service_fee_moo_match(spec text, moo text)
returns boolean
language plpgsql immutable set search_path = ''
as $$
declare m int; part text; r text[]; digits text;
begin
  digits := left(regexp_replace(translate(coalesce(moo, ''), '๐๑๒๓๔๕๖๗๘๙', '0123456789'), '\D', '', 'g'), 6);
  if digits = '' then return false; end if;
  m := digits::int;
  foreach part in array regexp_split_to_array(translate(coalesce(spec, ''), '๐๑๒๓๔๕๖๗๘๙', '0123456789'), '[,\s]+') loop
    if part ~ '^\d{1,6}\s*-\s*\d{1,6}$' then
      r := regexp_match(part, '^(\d+)\s*-\s*(\d+)$');
      if m between r[1]::int and r[2]::int then return true; end if;
    elsif part ~ '^\d{1,6}$' and part::int = m then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- ---------- ตาราง ----------
create table if not exists public.service_fee_courts (
  id   smallint primary key,
  name text not null unique,
  key  text not null,
  kind text not null check (kind in ('จังหวัด', 'แขวง', 'แพ่ง', 'อาญา', 'เยาวชนและครอบครัว', 'ชำนัญพิเศษ', 'สาขา', 'อื่น ๆ'))
);
create index if not exists service_fee_courts_key_idx on public.service_fee_courts (key text_pattern_ops);

create table if not exists public.service_fee_remarks (
  id   integer primary key,
  text text not null unique
);

create table if not exists public.service_fees (
  id           integer primary key,
  province     text not null,
  province_key text not null,
  amphur       text not null,
  amphur_key   text not null,
  tambon       text not null,           -- '' = ระดับอำเภอ (ไม่ระบุตำบล)
  tambon_key   text not null,
  moo          text not null default '',  -- '' = ทั้งตำบล · '1' · '1-3' · '1,4,6-8'
  court_id     smallint not null references public.service_fee_courts (id),
  fee          integer not null check (fee >= 0),
  remark_id    integer references public.service_fee_remarks (id),
  start_date   date
);
create index if not exists service_fees_place_idx on public.service_fees (province_key, amphur_key, tambon_key);
create index if not exists service_fees_court_idx on public.service_fees (court_id);

create table if not exists public.service_fee_meta (
  k text primary key,
  v text not null
);

-- ---------- RLS: อ่านอย่างเดียว ----------
alter table public.service_fee_courts  enable row level security;
alter table public.service_fee_remarks enable row level security;
alter table public.service_fees        enable row level security;
alter table public.service_fee_meta    enable row level security;

drop policy if exists service_fee_courts_read  on public.service_fee_courts;
drop policy if exists service_fee_remarks_read on public.service_fee_remarks;
drop policy if exists service_fees_read        on public.service_fees;
drop policy if exists service_fee_meta_read    on public.service_fee_meta;
create policy service_fee_courts_read  on public.service_fee_courts  for select to anon, authenticated using (true);
create policy service_fee_remarks_read on public.service_fee_remarks for select to anon, authenticated using (true);
create policy service_fees_read        on public.service_fees        for select to anon, authenticated using (true);
create policy service_fee_meta_read    on public.service_fee_meta    for select to anon, authenticated using (true);

revoke all on public.service_fee_courts, public.service_fee_remarks, public.service_fees, public.service_fee_meta from anon, authenticated;
grant select on public.service_fee_courts, public.service_fee_remarks, public.service_fees, public.service_fee_meta to anon, authenticated;

-- ---------- RPC อ่านข้อมูล (stable, security invoker — ผ่าน RLS ตามปกติ) ----------
-- ค้นรายแถว: จังหวัด [+ อำเภอ] [+ ตำบล (รวมแถวระดับอำเภอ)] [+ หมู่ (เฉพาะแถวทั้งตำบลหรือหมู่ที่ครอบคลุม)] [+ ชื่อศาลที่ตรงกันเต็มชื่อ]
-- หมายเหตุ: PostgREST จำกัดแถวต่อคำขอ (ปกติ 1000) — ใช้ service_fee_area สำหรับทั้งจังหวัด
create or replace function public.service_fee_lookup(
  p_province text, p_amphur text default null, p_tambon text default null, p_moo text default null, p_court text default null)
returns table (province text, court text, amphur text, tambon text, moo text, fee integer, remark text, start_date date)
language sql stable security invoker set search_path = public
as $$
  select f.province, c.name, f.amphur, f.tambon, f.moo, f.fee, r.text, f.start_date
  from public.service_fees f
  join public.service_fee_courts c on c.id = f.court_id
  left join public.service_fee_remarks r on r.id = f.remark_id
  where f.province_key = public.service_fee_norm(p_province)
    and (coalesce(public.service_fee_norm(p_amphur), '') = '' or f.amphur_key = public.service_fee_norm(p_amphur))
    and (coalesce(public.service_fee_norm(p_tambon), '') = '' or f.tambon_key in (public.service_fee_norm(p_tambon), ''))
    and (p_court is null or p_court = '' or c.key = public.service_fee_court_key(p_court))
    and (p_moo is null or p_moo = '' or f.moo = '' or public.service_fee_moo_match(f.moo, p_moo))
  order by f.amphur, f.tambon, f.moo, c.name;
$$;

-- ทั้งจังหวัดในรูปแบบเดียวกับไฟล์ static: { province, asOf, remarks:[], rows:[[ศาล, อำเภอ, ตำบล, หมู่, ค่า, remarkIndex(-1), 'YYYY-MM-DD']] } ; ไม่พบจังหวัด = null
create or replace function public.service_fee_area(p_province text)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with f as (
    select f.*, c.name as court
    from public.service_fees f join public.service_fee_courts c on c.id = f.court_id
    where f.province_key = public.service_fee_norm(p_province)
  ),
  rm as (
    select remark_id, (row_number() over (order by remark_id) - 1)::int as idx
    from (select distinct remark_id from f where remark_id is not null) d
  )
  select case when count(*) = 0 then null else jsonb_build_object(
    'province', max(f.province),
    'asOf', coalesce((select v from public.service_fee_meta where k = 'as_of'), ''),
    'remarks', coalesce((select jsonb_agg(r.text order by rm2.idx) from rm rm2 join public.service_fee_remarks r on r.id = rm2.remark_id), '[]'::jsonb),
    'rows', jsonb_agg(jsonb_build_array(f.court, f.amphur, f.tambon, f.moo, f.fee, coalesce(rm.idx, -1), coalesce(f.start_date::text, '')) order by f.amphur, f.tambon, f.moo, f.court)
  ) end
  from f left join rm on rm.remark_id = f.remark_id;
$$;

create or replace function public.service_fee_provinces()
returns table (name text, n integer)
language sql stable security invoker set search_path = public
as $$
  select province, count(*)::int from public.service_fees group by province order by province;
$$;

-- ค้นหาจากชื่อศาล (ตัดช่องว่าง/วงเล็บ/คำนำหน้า 'ศาล' แล้วค้นแบบมีคำนี้อยู่ในชื่อ ไม่สนตัวพิมพ์) — คืนศาล จังหวัดที่ครอบคลุม และจำนวนแถว
create or replace function public.service_fee_courts_search(q text)
returns table (court text, kind text, provinces text[], n_places integer)
language sql stable security invoker set search_path = public
as $$
  with k as (
    select regexp_replace(
             replace(replace(replace(public.service_fee_court_key(q), '\', '\\'), '%', '\%'), '_', '\_'),
             '^ศาล', '') as s
  )
  select c.name, c.kind, s.provinces, s.n
  from public.service_fee_courts c
  cross join k
  cross join lateral (
    select array_agg(distinct f.province order by f.province) as provinces, count(*)::int as n
    from public.service_fees f where f.court_id = c.id
  ) s
  where k.s <> '' and c.key ilike '%' || k.s || '%'
  order by (c.key ilike 'ศาล%' || k.s || '%') desc, (c.key ilike '%จังหวัด' || k.s || '%') desc, length(c.name), c.name
  limit 30;
$$;

revoke all on function public.service_fee_norm(text), public.service_fee_court_key(text), public.service_fee_moo_match(text, text),
  public.service_fee_lookup(text, text, text, text, text), public.service_fee_area(text), public.service_fee_provinces(),
  public.service_fee_courts_search(text) from public;
grant execute on function public.service_fee_norm(text), public.service_fee_court_key(text), public.service_fee_moo_match(text, text),
  public.service_fee_lookup(text, text, text, text, text), public.service_fee_area(text), public.service_fee_provinces(),
  public.service_fee_courts_search(text) to anon, authenticated;
