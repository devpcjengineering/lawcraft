-- รูปประกอบเนื้อหาเว็บ (ภาพปกบทความ / รูปผลงาน) — Storage bucket สาธารณะ `media`
--   อ่าน: ทุกคน (ลิงก์สาธารณะ /storage/v1/object/public/media/<path>) · เขียน/แก้/ลบ: เฉพาะแอดมิน (public.is_admin())
--   อัปโหลดจากหลังบ้าน public/js/supabase-backend.js uploadMedia() — ย่อรูปฝั่งเบราว์เซอร์ก่อน (js/media.js) จำกัด 8 MB เฉพาะไฟล์รูป
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists media_obj_select on storage.objects;
drop policy if exists media_obj_insert on storage.objects;
drop policy if exists media_obj_update on storage.objects;
drop policy if exists media_obj_delete on storage.objects;
create policy media_obj_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'media');
create policy media_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());
create policy media_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());
create policy media_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());
