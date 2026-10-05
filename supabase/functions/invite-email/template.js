// เทมเพลตอีเมลแจ้ง “ได้รับเชิญให้ร่วมแก้ไขคดี” — HTML แบบตาราง + สไตล์อินไลน์ (ใช้ได้ทั้ง Gmail / Outlook / Apple Mail / มือถือ)
// ฟังก์ชันล้วน (ไม่แตะเครือข่าย) → ใช้ทดสอบ/พรีวิวใน Node ได้ (test/invite-email.mjs) และใช้ใน Edge Function invite-email
// ทุกค่าที่มาจากผู้ใช้ผ่าน esc() เสมอ

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// สีตามหน้าเว็บ (css/admin-base.css): น้ำเงินหลัก, หมึก, เทา
const C = { blue: '#0071e3', blueDark: '#0058b0', ink: '#1d1d1f', muted: '#6b7280', hair: '#e5e7eb', bg: '#f2f3f7', card: '#ffffff', tint: '#eef5ff', warnBg: '#fff8e6', warnInk: '#7a4b00' };
const FONT = "'Noto Sans Thai','Sarabun','Leelawadee UI','Tahoma','Thonburi',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

/**
 * @param {{appUrl:string, caseUrl:string, inviter:string, title?:string, court?:string, type?:string, to?:string}} p
 * @returns {{subject:string, html:string, text:string}}
 */
export function inviteEmail({ appUrl, caseUrl, inviter, title = '', court = '', type = '', to = '' }) {
  const kind = type === 'civil' ? 'คดีแพ่ง' : type === 'criminal' ? 'คดีอาญา' : 'คดี';
  const caseName = String(title || '').trim() || 'คดีที่ยังไม่ตั้งชื่อ';
  const subject = `${inviter} เชิญคุณร่วมตรวจสอบ/แก้ไขคำฟ้อง — Law Craft`;
  const logo = `${appUrl}/apple-touch-icon.png`;
  const pre = `${inviter} เชิญคุณเข้ามาร่วมตรวจสอบ/แก้ไขคำฟ้อง "${caseName}" ในระบบร่างคำฟ้อง`;

  const row = (label, value) => (value ? `<tr>
      <td style="padding:10px 0;border-top:1px solid ${C.hair};font:400 14px/1.5 ${FONT};color:${C.muted};width:96px;vertical-align:top">${esc(label)}</td>
      <td style="padding:10px 0;border-top:1px solid ${C.hair};font:500 15px/1.5 ${FONT};color:${C.ink};vertical-align:top;word-break:break-word">${esc(value)}</td></tr>` : '');
  const step = (n, head, body) => `<tr>
      <td style="padding:6px 14px 6px 0;vertical-align:top;width:30px"><div style="width:26px;height:26px;border-radius:13px;background:${C.tint};color:${C.blue};font:700 14px/26px ${FONT};text-align:center">${n}</div></td>
      <td style="padding:6px 0;font:400 15px/1.6 ${FONT};color:${C.ink};vertical-align:top"><b style="font-weight:600">${esc(head)}</b><br><span style="color:${C.muted};font-size:14px">${body}</span></td></tr>`;

  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${esc(pre)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
    <tr><td style="padding:0 4px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle;padding-right:12px"><img src="${esc(logo)}" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px;background:#fff"></td>
        <td style="vertical-align:middle"><div style="font:700 16px/1.3 ${FONT};color:${C.ink}">Law Craft</div><div style="font:400 12.5px/1.4 ${FONT};color:${C.muted}">ระบบร่างคำฟ้อง · สำนักงานกฎหมาย ลอว์คราฟต์</div></td>
      </tr></table>
    </td></tr>
    <tr><td style="background:${C.card};border-radius:20px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:6px;background:${C.blue};background-image:linear-gradient(90deg,${C.blue},#5ac8fa);font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:32px 32px 8px">
          <div style="display:inline-block;padding:5px 12px;border-radius:999px;background:${C.tint};color:${C.blue};font:600 13px/1.4 ${FONT}">คำเชิญร่วมตรวจสอบ/แก้ไขคำฟ้อง</div>
          <h1 style="margin:16px 0 10px;font:700 26px/1.35 ${FONT};color:${C.ink}">คุณได้รับเชิญให้ร่วมตรวจสอบ/แก้ไขคำฟ้อง</h1>
          <p style="margin:0;font:400 16px/1.7 ${FONT};color:${C.ink}"><b style="font-weight:600">${esc(inviter)}</b> เชิญคุณร่วมตรวจสอบและแก้ไขคำฟ้องของคดีนี้ในระบบร่างคำฟ้อง คุณจะเห็นและแก้ไขข้อมูลกับเอกสารในชุดคำฟ้อง และอัปโหลด PDF ชุดเอกสารได้ (ลบคดีหรือเชิญผู้อื่นเพิ่มไม่ได้ — เป็นสิทธิ์ของเจ้าของ)</p>
        </td></tr>
        <tr><td style="padding:20px 32px 4px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafbfc;border:1px solid ${C.hair};border-radius:14px"><tr><td style="padding:6px 20px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td colspan="2" style="padding:12px 0 4px;font:700 17px/1.5 ${FONT};color:${C.ink};word-break:break-word">${esc(caseName)}</td></tr>
              ${row('ประเภท', kind)}${row('ศาล', court)}${row('ผู้เชิญ', inviter)}
            </table>
          </td></tr></table>
        </td></tr>
        <tr><td align="center" style="padding:28px 32px 8px">
          <a href="${esc(caseUrl)}" target="_blank" style="display:inline-block;background:${C.blue};color:#ffffff;text-decoration:none;font:600 17px/1 ${FONT};padding:16px 36px;border-radius:12px;mso-padding-alt:0">เปิดคดีนี้</a>
          <div style="margin-top:12px;font:400 12.5px/1.6 ${FONT};color:${C.muted}">ปุ่มใช้ไม่ได้? คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์<br><a href="${esc(caseUrl)}" target="_blank" style="color:${C.blue};word-break:break-all;text-decoration:none">${esc(caseUrl)}</a></div>
        </td></tr>
        <tr><td style="padding:24px 32px 8px">
          <div style="font:600 15px/1.5 ${FONT};color:${C.ink};margin-bottom:6px">วิธีเริ่มใช้งาน</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${step(1, 'เปิดลิงก์ด้านบน', 'ระบบจะพาไปหน้าเข้าสู่ระบบ')}
            ${step(2, 'เข้าสู่ระบบด้วย Google', `ใช้บัญชี Google ที่เป็นอีเมล <b style="color:${C.ink};font-weight:600">${esc(to || 'นี้')}</b> เท่านั้น (อีเมลอื่นจะไม่เห็นคดี)`)}
            ${step(3, 'เริ่มแก้ไขได้ทันที', 'คดีจะอยู่ในรายการ “คดีที่บันทึกไว้” พร้อมป้าย “แชร์ให้คุณแก้ไข”')}
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px 32px">
          <div style="background:${C.warnBg};border-radius:12px;padding:14px 16px;font:400 13.5px/1.65 ${FONT};color:${C.warnInk}">คดีมีข้อมูลส่วนบุคคลของคู่ความ กรุณาอย่าส่งต่ออีเมลหรือลิงก์นี้ให้ผู้อื่น หากคุณไม่รู้จักผู้เชิญหรือไม่ได้คาดหมายอีเมลฉบับนี้ ไม่ต้องดำเนินการใดๆ และสามารถเพิกเฉยได้</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:22px 12px 6px;font:400 12.5px/1.7 ${FONT};color:${C.muted}">อีเมลนี้ส่งโดยอัตโนมัติจากระบบร่างคำฟ้อง Law Craft เพราะ ${esc(inviter)} เชิญอีเมลของคุณ<br>ระบบนี้เป็นเครื่องมือช่วยร่างเอกสาร ไม่ใช่คำปรึกษาทางกฎหมาย · <a href="${esc(appUrl)}" target="_blank" style="color:${C.muted}">${esc(appUrl.replace(/^https?:\/\//, ''))}</a></td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    `${inviter} เชิญคุณร่วมตรวจสอบ/แก้ไขคำฟ้อง ในระบบร่างคำฟ้อง Law Craft`,
    '',
    `คดี: ${caseName}`,
    court ? `ศาล: ${court}` : '',
    `ผู้เชิญ: ${inviter}`,
    '',
    'เปิดคดีนี้:',
    caseUrl,
    '',
    `วิธีเริ่มใช้งาน: เปิดลิงก์ → เข้าสู่ระบบด้วย Google ด้วยอีเมล ${to || 'ที่ได้รับเชิญ'} เท่านั้น → คดีจะอยู่ในรายการคดี พร้อมป้าย “แชร์ให้คุณแก้ไข”`,
    '',
    'คดีมีข้อมูลส่วนบุคคลของคู่ความ กรุณาอย่าส่งต่ออีเมลหรือลิงก์นี้ให้ผู้อื่น หากไม่รู้จักผู้เชิญหรือไม่ได้คาดหมายอีเมลฉบับนี้ สามารถเพิกเฉยได้',
    '— ระบบร่างคำฟ้อง Law Craft',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');

  return { subject, html, text };
}
