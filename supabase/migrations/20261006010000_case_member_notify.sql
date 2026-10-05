-- อีเมลแจ้งผู้ร่วมแก้ไข (Edge Function invite-email): บันทึกเวลาที่ส่งล่าสุดไว้กันส่งซ้ำรัว ๆ และแสดงในหน้าแชร์
-- notified_at เขียนได้เฉพาะ Edge Function (service role) — ไคลเอนต์ใส่เองตอนเชิญไม่ได้ (ถอนสิทธิ์ insert ระดับตารางแล้วให้เฉพาะ 2 คอลัมน์)
alter table public.case_members add column if not exists notified_at timestamptz;

revoke insert on public.case_members from authenticated;
grant insert (case_id, email) on public.case_members to authenticated;

notify pgrst, 'reload schema';
