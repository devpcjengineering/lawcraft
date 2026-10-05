// ข้อมูลสมมติสำหรับทดสอบ “ด้านหน้าห้ามล้น” (test/frontfit.mjs): สร้างคดีที่มีข้อมูลสั้น/ปกติ/ยาวมาก/ยาวสุดขีด
// ฟังก์ชันนี้ต้อง self-contained (ไม่อ้างตัวแปรภายนอกโมดูล) เพราะ test/frontfit.mjs ส่งซอร์สของมันไปรันในเบราว์เซอร์ด้วย
// cs = { type: 'criminal'|'civil', form: 'person'|'item'|'summons', level: 'short'|'typical'|'long'|'xl', items?: จำนวนรายการเอกสาร (เฉพาะ form=item) }
export function makeCase(M, cs) {
  const { newCase, newParty, newWitness } = M;
  const XL = cs.level === 'xl', L = XL ? 'long' : cs.level;
  const rep = (s, n) => Array.from({ length: n }, () => s).join('');
  const c = newCase(cs.type);
  c.court = { short: 'ศาลจังหวัดธัญบุรี', typical: 'ศาลจังหวัดเชียงราย', long: 'ศาลจังหวัดนครศรีธรรมราช สาขาทุ่งสงประจำจังหวัดนครศรีธรรมราชและเขตพื้นที่ใกล้เคียง' }[L];
  const mkp = (role, first, last) => Object.assign(newParty(role), { prefix: 'นาย', first, last, idCard: '1101700230673' });
  const nm = { short: ['ทดสอบ', 'ตัวอย่าง'], typical: ['สมมติทดสอบ', 'ตัวอย่างระบบ'], long: ['ทดสอบนามสมมติยาวมากเป็นพิเศษสำหรับการตรวจการล้นหน้า', 'นามสกุลสมมติที่ยาวมากเช่นเดียวกันเพื่อทดสอบ'] }[L];
  const nPart = L === 'long' ? 3 : 1;
  const bigAddr = L === 'long';
  const addr = L === 'short' ? { no: '', moo: '', building: '', soi: '', road: '', sub: '', district: '', province: '', zip: '' }
    : { no: bigAddr ? '999/999 ห้อง 9999 ชั้น 99' : '88', moo: '9', building: bigAddr ? 'อาคารสมมติทาวเวอร์เพลสเซ็นเตอร์พลาซ่า' : '', soi: bigAddr ? 'ซอยสมมติ 99/99 แยก 9 ตรอกยาวมาก' : 'ซอยสมมติ 1', road: 'ถนนสมมติ', sub: bigAddr ? 'ตำบลสมมติยาวมากเป็นพิเศษ' : 'ตำบลสมมติ', district: bigAddr ? 'อำเภอสมมติยาวมากเป็นพิเศษพิเศษ' : 'อำเภอสมมติ', province: bigAddr ? 'จังหวัดนครศรีธรรมราชสมมติ' : 'เชียงราย', zip: '57000' };
  c.parties = [
    ...Array.from({ length: nPart }, (_, i) => mkp('plaintiff', nm[0] + (i ? 'ที่' + (i + 1) : ''), nm[1])),
    ...Array.from({ length: nPart }, (_, i) => Object.assign(mkp('defendant', 'จำเลย' + nm[0] + (i ? 'ที่' + (i + 1) : ''), nm[1]), {
      address: { ...addr, no: addr.no || '12', province: addr.province || 'เชียงราย' }, phone: '081-234-5678',
      email: bigAddr ? 'very.long.defendant.email.address.for.testing@example-domain-name.co.th' : '' })),
  ];
  c.hearing = L === 'short' ? { date: '', time: '' } : { date: '2026-12-01', time: '09.00' };
  if (L !== 'short') c.counsel = { ...c.counsel, enabled: true, prefix: 'นาย', first: L === 'long' ? 'ทนายความผู้มีชื่อยาวมากเป็นพิเศษสำหรับทดสอบ' : 'ทนาย', last: L === 'long' ? 'นามสกุลทนายความยาวมากเช่นกันเพื่อการทดสอบ' : 'สมมติ' };
  const holder = { short: '', typical: 'ผู้กำกับการสถานีตำรวจภูธรทดสอบ', long: 'บริษัท ทดสอบการค้าและการลงทุนระหว่างประเทศ (ประเทศไทย) จำกัด (มหาชน) โดยผู้มีอำนาจลงนามผูกพันบริษัทตามหนังสือรับรอง' }[L];
  const hpos = { short: '', typical: 'พนักงานสอบสวน', long: 'ผู้อำนวยการฝ่ายกฎหมายและกำกับดูแลกิจการองค์กรอาวุโสประจำสำนักงานใหญ่ ปฏิบัติหน้าที่แทนกรรมการผู้จัดการใหญ่' }[L];
  const nItems = cs.items || { short: 1, typical: 2, long: 8 }[L];
  const itemNames = Array.from({ length: nItems }, (_, i) => (L === 'long' ? `สำเนาเอกสารหลักฐานสมมติรายการที่ ${i + 1} ลงวันที่ ${i + 1} มกราคม 2568 พร้อมภาพถ่ายและบันทึกถ้อยคำประกอบรายละเอียดเพิ่มเติมจากการตรวจสอบ` : i ? 'โทรศัพท์มือถือของกลาง' : 'สำเนารายงานประจำวันเกี่ยวกับคดี เลขที่ 123/2568'));
  if (cs.form === 'person') {
    const w = newWitness('person');
    w.name = { short: 'นายพยาน หนึ่ง', typical: 'นายพยานสมมติ ตัวอย่าง', long: 'นายพยานผู้มีชื่อและนามสกุลยาวมากเป็นพิเศษสำหรับการทดสอบการล้นหน้า นามสกุลยาวเช่นกัน' }[L];
    w.position = { short: '', typical: 'ร้อยตำรวจเอก', long: 'ผู้ช่วยผู้อำนวยการสำนักงานอาวุโสฝ่ายสืบสวนสอบสวนคดีพิเศษประจำภูมิภาค และเจ้าพนักงานตามประมวลกฎหมายวิธีพิจารณาความอาญา' }[L];
    w.addr = addr; w.phone = L === 'short' ? '' : '081-234-5678';
    if (L === 'long') w.purpose = 'ข้อเท็จจริงเกี่ยวกับการตรวจพิสูจน์หลักฐานและการเก็บรักษาพยานวัตถุของกลางในคดีนี้ตั้งแต่ต้นจนจบกระบวนการ';
    c.witnesses = [w];
  } else if (cs.form === 'item') {
    c.witnesses = itemNames.map((nme, i) => { const w = newWitness(i % 2 ? 'object' : 'document'); w.name = nme; w.holder = holder; w.holderPos = hpos; w.addr = addr; w.phone = L === 'short' ? '' : '02-123-4567'; return w; });
  }
  if (XL) {
    c.court = rep(c.court + ' ', 2).trim(); c.counsel.first = rep(c.counsel.first, 3);
    c.parties.forEach((p) => { p.first = rep(p.first, 2); });
    c.witnesses.forEach((w) => {
      if (w.holder) { w.holder = rep(w.holder + ' ', 3); w.holderPos = rep(w.holderPos + ' ', 3); } else { w.name = rep(w.name + ' ', 3); w.position = rep(w.position + ' ', 4); }
      w.addr = { ...w.addr, building: rep(w.addr.building + ' ', 3), soi: rep(w.addr.soi + ' ', 3) };
    });
  }
  return c;
}

export const CASE_MATRIX = [];
for (const level of ['short', 'typical', 'long', 'xl']) {
  CASE_MATRIX.push({ type: 'criminal', form: 'person', level }, { type: 'criminal', form: 'item', level }, { type: 'civil', form: 'item', level }, { type: 'criminal', form: 'summons', level });
}
