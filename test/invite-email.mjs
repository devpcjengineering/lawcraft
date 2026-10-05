// ทดสอบเทมเพลตอีเมลเชิญร่วมแก้ไขคดี (supabase/functions/invite-email/template.js) — ไม่ต้องใช้เครือข่าย
//   node test/invite-email.mjs [โฟลเดอร์สำหรับเขียนไฟล์พรีวิว preview.html]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { inviteEmail } from '../supabase/functions/invite-email/template.js';

const base = { appUrl: 'https://lawcraft.pcjengineering.co.th', caseUrl: 'https://lawcraft.pcjengineering.co.th/workspace/case/abc123/case', inviter: 'owner@example.com', title: 'นายสมชาย ใจดี ฟ้อง นายสมศักดิ์ ตัวอย่าง', court: 'ศาลจังหวัดธัญบุรี', type: 'criminal', to: 'friend@gmail.com' };
const m = inviteEmail(base);
assert.match(m.subject, /owner@example\.com เชิญคุณร่วมตรวจสอบ\/แก้ไขคำฟ้อง/);
for (const s of [base.caseUrl, 'นายสมชาย ใจดี ฟ้อง', 'ศาลจังหวัดธัญบุรี', 'friend@gmail.com', 'owner@example.com', 'เปิดคดีนี้']) assert.ok(m.html.includes(s), `html ต้องมี ${s}`);
for (const s of [base.caseUrl, 'ศาลจังหวัดธัญบุรี', 'friend@gmail.com']) assert.ok(m.text.includes(s), `text ต้องมี ${s}`);
assert.match(m.html, /<html lang="th">/);
assert.ok(!/<script/i.test(m.html));
assert.ok(inviteEmail({ ...base, type: 'civil' }).html.includes('คดีแพ่ง'), 'แสดงประเภทคดีในรายละเอียด');
assert.ok(inviteEmail({ ...base, court: '' }).html.indexOf('>ศาล<') < 0, 'ไม่มีศาล = ไม่มีแถวศาล');

// ค่าจากผู้ใช้ต้องถูก escape (ชื่อคดี/ศาล/ผู้เชิญ/ลิงก์)
const evil = inviteEmail({ ...base, title: '<img src=x onerror=alert(1)>', court: '"><script>1</script>', inviter: '<b>x</b>@e.com', caseUrl: 'https://x.test/?a="><script>1</script>' });
assert.ok(!/<script/i.test(evil.html) && !evil.html.includes('<img src=x') && !evil.html.includes('<b>x</b>@e.com'), 'ต้อง escape ค่าจากผู้ใช้');
assert.ok(evil.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
console.log('invite-email OK');

const out = process.argv[2];
if (out) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'preview.html'), m.html); console.log('เขียนพรีวิวที่', path.join(out, 'preview.html')); }
