-- schema-aiven.sql — ตาราง precedents_full สำหรับคำพิพากษาศาลฎีกา บน Aiven for PostgreSQL (เก็บเฉพาะข้อมูลฎีกา; ข้อมูลคดี/ผู้ใช้อยู่ Supabase ตามเดิม)
-- Postgres ธรรมดา: ไม่มี RLS/role ของ Supabase — สิทธิ์ใช้ role แยก (ดู load-aiven.mjs --create-reader): คนโหลด = avnadmin, เว็บ = lawcraft_reader (SELECT อย่างเดียว)
-- รัน: node scripts/deka/load-aiven.mjs --schema-only   (ใช้ไฟล์นี้; ส่วนหลังบรรทัด "-- @@INDEXES" สร้างด้วย --build-indexes หลังโหลดเสร็จ เพราะเร็วกว่าสร้างระหว่างโหลดมาก)
--
-- ข้อเท็จจริงของแหล่งข้อมูล (deka.supremecourt.or.th): เว็บศาลเผยแพร่ "ย่อสั้น" (headnote) และ "ย่อยาว" (full_text) ไม่ใช่คำพิพากษาฉบับเต็ม
-- ไม่มีวันที่พิพากษา/ประเภทคดี/คำสำคัญ ให้ — case_type อนุมานจากกฎหมายที่อ้าง (ป.อ./ป.วิ.อ. = อาญา, ป.พ.พ./ป.วิ.พ. = แพ่ง) หรือ NULL

create extension if not exists pg_trgm;

create table if not exists precedents_full (
  id                bigint generated always as identity primary key,
  source_doc_id     text        not null unique,   -- docId ในระบบศาล (คีย์จริง: เลขฎีกา+ปี ซ้ำได้ เพราะคดีเดียวมีหลายระเบียน/คดีรวมเลขช่วง)
  title_raw         text,                          -- เช่น 'คำพิพากษาศาลฎีกาที่ 2942/2519'
  case_no           text        not null,          -- เช่น '10029' หรือ '9996 - 9997'
  year              int         not null,          -- พ.ศ. ของเลขฎีกา
  doc_type          text        not null default 'คำพิพากษาศาลฎีกา',
  court             text        not null default 'ศาลฎีกา',
  case_type         text,                          -- แพ่ง/อาญา/แพ่งและอาญา (อนุมาน) หรือ NULL
  headnote          text,                          -- ย่อสั้น
  full_text         text,                          -- ย่อยาว (ว่างได้ ~13% โดยเฉพาะคดีเก่า)
  sections          text[]      not null default '{}',  -- {'ป.อ. ม. 288','ป.วิ.อ. ม. 158'}
  laws              jsonb,                         -- [{code,name,abbr,sections[]}]
  litigants         text[]      not null default '{}',  -- 'โจทก์ - …' / 'จำเลย - …' ตามที่ศาลเผยแพร่ (ศาลปิดชื่อบางคดี)
  judges            text[]      not null default '{}',
  lower_courts      text[]      not null default '{}',
  primary_court_nos text[]      not null default '{}',
  departments       text[]      not null default '{}',
  black_no          text[]      not null default '{}',
  sources           text[]      not null default '{}',
  remark            text,
  source_url        text        not null,
  retrieved_at      timestamptz not null,
  -- ค้นหา: โทเค็นที่ตัดคำไทยแล้วตอนโหลด (scripts/deka/precedent-map.mjs) น้ำหนัก A = เลขฎีกา/ปี/มาตรา/ศาลล่าง · B = ย่อสั้น · C = ย่อยาว
  fts               tsvector    not null,
  created_at        timestamptz not null default now()
);

create index if not exists precedents_full_year_case_idx on precedents_full (year desc, case_no);

-- @@INDEXES
create index if not exists precedents_full_fts_idx      on precedents_full using gin (fts);
create index if not exists precedents_full_sections_idx on precedents_full using gin (sections);
create index if not exists precedents_full_type_idx     on precedents_full (case_type, year desc);
-- ค้นแบบ “มีข้อความนี้อยู่” / พิมพ์ผิดเล็กน้อย บนย่อสั้นเท่านั้น (trigram บน full_text ใหญ่เกินไป)
create index if not exists precedents_full_headnote_trgm on precedents_full using gin (headnote gin_trgm_ops);
analyze precedents_full;

-- ตัวอย่างค้นหา (คำค้นต้องตัดคำด้วย tokenize() ตัวเดียวกัน แล้ว AND กัน):
--   select case_no, year, headnote from precedents_full where fts @@ to_tsquery('simple', 'มรดก & ที่ดิน') order by ts_rank(fts, to_tsquery('simple','มรดก & ที่ดิน')) desc limit 20;
--   select case_no, year from precedents_full where sections @> array['ป.พ.พ. ม. 1336'];
