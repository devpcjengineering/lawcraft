-- schema.sql — ตาราง precedents_full สำหรับคำพิพากษาศาลฎีกาจาก deka.supremecourt.or.th
-- *** แผนเท่านั้น: ยังไม่ได้รันกับฐานข้อมูลใดๆ — ทบทวนก่อน แล้วค่อยย้ายไป supabase/migrations/ ***
--
-- ข้อเท็จจริงจากการนำร่อง (ตุลาคม 2569): เว็บศาลเผยแพร่ "ย่อสั้น" (คำพิพากษาย่อ) และ "ย่อยาว" ต่อคดี
-- ไม่ใช่ตัวคำพิพากษาฉบับเต็ม และไม่มีวันที่พิพากษา / ประเภทคดี / คำสำคัญ ให้ในหน้าเว็บ
--   headnote  = ย่อสั้น (shortText)      full_text = ย่อยาว (longText) ตามที่ศาลเผยแพร่ ไม่ตัดต่อ
--   decided_on = NULL เสมอ (ไม่มีข้อมูล) ; case_type อนุมานจากรหัสกฎหมาย (ป.อ./ป.วิ.อ. → อาญา ฯลฯ) หรือ NULL
--   keywords   = NULL/ว่าง (ไม่มีข้อมูล)

create extension if not exists pg_trgm;

create table if not exists public.precedents_full (
  id            bigint generated always as identity primary key,
  source_doc_id text        not null unique,   -- docId ภายในระบบศาล (คีย์จริง: caseNo+year ซ้ำได้ — คดีเดียวมีหลายระเบียน/คดีรวมเลขช่วง)
  case_no       text        not null,          -- เช่น '10029' หรือ '9996 - 9997' (ตามที่แสดง)
  year          int         not null,          -- พ.ศ. ของเลขฎีกา
  doc_type      text        not null default 'คำพิพากษาศาลฎีกา',
  court         text        not null default 'ศาลฎีกา',
  case_type     text,                          -- แพ่ง/อาญา/... (อนุมาน ไม่ใช่ข้อมูลศาล)
  decided_on    date,                          -- ไม่มีในแหล่งข้อมูล
  headnote      text,                          -- ย่อสั้น
  full_text     text,                          -- ย่อยาว (อาจว่างในคดีเก่า ~30%)
  sections      text[]      not null default '{}',  -- เช่น {'ป.พ.พ. ม. 11','ป.วิ.พ. ม. 142'}
  keywords      text[]      not null default '{}',
  laws          jsonb,                         -- [{code,name,abbr,sections[]}]
  litigants     jsonb,                         -- ['โจทก์ - ...','จำเลย - ...'] ตามที่ศาลเผยแพร่ (ศาลปิดชื่อบางคดี เช่น 'นาย ข.')
  judges        text[]      not null default '{}',
  lower_courts  text[]      not null default '{}',
  black_no      text,
  source_url    text        not null,
  retrieved_at  timestamptz not null,
  -- ค้นหาภาษาไทย: ดูหัวข้อ "แนวทางค้นหาภาษาไทย" ด้านล่าง
  search_tokens text,                          -- ข้อความที่ตัดคำแล้ว (คั่นช่องว่าง) สร้างตอน load ด้วย Intl.Segmenter('th')
  fts           tsvector generated always as (
                  setweight(to_tsvector('simple', coalesce(case_no, '') || ' ' || year::text || ' ' || coalesce(array_to_string(sections, ' '), '')), 'A') ||
                  setweight(to_tsvector('simple', coalesce(search_tokens, '')), 'B')
                ) stored,
  created_at    timestamptz not null default now()
);

create index if not exists precedents_full_year_case_idx on public.precedents_full (year desc, case_no);
create index if not exists precedents_full_fts_idx       on public.precedents_full using gin (fts);
create index if not exists precedents_full_sections_idx  on public.precedents_full using gin (sections);
-- ค้นหาแบบ "มีคำนี้อยู่" / พิมพ์ผิดเล็กน้อย บนย่อสั้นเท่านั้น (trigram บน full_text ใหญ่เกินไป)
create index if not exists precedents_full_headnote_trgm on public.precedents_full using gin (headnote gin_trgm_ops);

-- ---------- RLS: ทุกคนอ่านได้, เฉพาะแอดมินเขียน (ใช้ public.is_admin() เดียวกับ user_cases) ----------
alter table public.precedents_full enable row level security;

create policy precedents_full_read  on public.precedents_full for select to anon, authenticated using (true);
create policy precedents_full_ins   on public.precedents_full for insert to authenticated with check (public.is_admin());
create policy precedents_full_upd   on public.precedents_full for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy precedents_full_del   on public.precedents_full for delete to authenticated using (public.is_admin());
-- การโหลดจำนวนมากให้ใช้ service_role key จากเครื่องแอดมิน (ข้าม RLS) — ห้ามใส่ key นี้ในเว็บ/ฝั่งไคลเอนต์

-- ---------- แนวทางค้นหาภาษาไทย (pragmatic) ----------
-- Postgres ไม่มี parser ภาษาไทยในตัว (to_tsvector('thai') ใช้ไม่ได้) จึงทำ 2 ชั้น:
--  1) ตัดคำตอน LOAD: ใน Node ใช้ new Intl.Segmenter('th', {granularity:'word'}) ตัดคำ headnote+full_text
--     เก็บ search_tokens = คำคั่นช่องว่าง → fts ใช้ config 'simple' (ไม่ stem) — ฝั่งค้นหา (API route/Edge Function)
--     ต้องตัดคำคำค้นด้วย Segmenter เดียวกัน แล้วเรียก to_tsquery('simple', 'คำ1 & คำ2')
--  2) pg_trgm (ด้านบน) สำหรับ ILIKE '%คำ%' / similarity บน headnote เป็น fallback เมื่อตัดคำไม่ตรง
--  ทางเลือกภายนอก (ถ้าต้องการคุณภาพสูงขึ้น): Typesense/Meilisearch (รองรับไทย), หรือส่วนขยาย pgroonga (Supabase ไม่มีให้ใช้)
-- เลขฎีกา/มาตราค้นตรงๆ ได้จาก case_no/year/sections (index ด้านบน) ไม่ต้องพึ่ง FTS

-- ตัวอย่างค้นหา (หลังตัดคำคำค้นแล้ว):
--   select case_no, year, headnote from public.precedents_full
--   where fts @@ to_tsquery('simple', 'มรดก & ที่ดิน') order by year desc limit 20;
--   select case_no, year from public.precedents_full where sections @> array['ป.พ.พ. ม. 1336'];

-- ---------- ขนาด (ประมาณ) ----------
-- 133,210 คดี × ~15 KB (ย่อสั้น+ย่อยาว+เมทาดาทา, UTF-8) ≈ 2.0 GB ดิบ → Postgres TOAST บีบอัดแล้ว ~0.8–1.0 GB + ดัชนี ~0.5–0.8 GB
-- เกินโควตา Supabase Free (500 MB) → ต้องใช้ Pro (8 GB) หรือโหลดเฉพาะบางปี/บางหมวดก่อน
