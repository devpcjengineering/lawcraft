// ทดสอบค่านำหมาย (ส่งหมายข้ามเขต): ค้นอัตราศาลปลายทางจากตาราง · ยอดรวมหลายวิธีส่ง · ถ้อยคำในคำร้อง
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePlace, courtKey, findProvinceFile, lookupServiceFee, loadProvinceRows, loadPlaceRows, searchServiceFeeCourts, listServiceFeeProvinces, setServiceFeeBackend, _clearServiceFeeCache } from '../shared/service-fee.js';
import { newCase, newParty, newWitness, serviceFeeInfo, suggestDeliver, officerFeeOf, EMS_FEE } from '../shared/model.js';
import { serviceMotionText, buildDocuments } from '../shared/docs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.join(here, 'fixtures', 'service-fees');
const fetchFx = async (url) => {
  const f = path.join(fx, url.split('/').pop());
  if (!fs.existsSync(f)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) };
};

// ---------- normalizePlace ----------
assert.equal(normalizePlace('ต.รอบเวียง'), 'รอบเวียง');
assert.equal(normalizePlace(' ตำบล รอบเวียง '), 'รอบเวียง');
assert.equal(normalizePlace('อ.เมืองเชียงราย'), 'เมืองเชียงราย');
assert.equal(normalizePlace('อำเภอเทิง'), 'เทิง');
assert.equal(normalizePlace('เขตคลองเตย'), 'คลองเตย');
assert.equal(normalizePlace('แขวงคลองตัน'), 'คลองตัน');
assert.equal(normalizePlace('จ.เชียงราย'), 'เชียงราย');
assert.equal(normalizePlace('จังหวัดเชียงราย'), 'เชียงราย');
assert.equal(normalizePlace('กรุงเทพฯ'), 'กรุงเทพมหานคร');
assert.equal(normalizePlace('๑๒'), '12');
assert.equal(normalizePlace(null), '');
assert.equal(normalizePlace('เทิง'), 'เทิง', 'ชื่อที่ไม่มีคำนำหน้าไม่ถูกตัด');

// ---------- findProvinceFile / loadProvinceRows (fixture) ----------
_clearServiceFeeCache();
const index = JSON.parse(fs.readFileSync(path.join(fx, 'index.json'), 'utf8'));
assert.equal(findProvinceFile(index, 'จังหวัดเชียงราย').file, 'p01.json');
assert.equal(findProvinceFile(index, 'เชียงใหม่'), null);
assert.equal(findProvinceFile(index, ''), null);
const prov = await loadProvinceRows('เชียงราย', fetchFx, '/data/service-fees/');
assert.equal(prov.province, 'เชียงราย'); assert.ok(prov.rows.length >= 9);
assert.equal(await loadProvinceRows('ภูเก็ต', fetchFx, '/data/service-fees/'), null, 'ไม่มีจังหวัดในดัชนี = null');
await assert.rejects(() => loadProvinceRows('เชียงราย', async () => { throw new Error('offline'); }, '/x/'), /offline/, 'เครือข่ายล้มต้อง throw');
{ let calls = 0; const counting = (u) => { calls++; return fetchFx(u); }; _clearServiceFeeCache();
  await loadProvinceRows('เชียงราย', counting); await loadProvinceRows('เชียงราย', counting);
  assert.equal(calls, 2, 'index + จังหวัด โหลดครั้งเดียว (แคช)'); }

// ---------- lookupServiceFee ----------
const { rows, remarks } = prov;
const L = (o) => lookupServiceFee(rows, { remarks, ...o });
// ศาลระบุ: ตำบลรอบเวียงมี 2 ศาล อัตราต่างกัน
{ const r = L({ amphur: 'อ.เมืองเชียงราย', tambon: 'ต.รอบเวียง', court: 'ศาลจังหวัดเชียงราย' });
  assert.deepEqual([r.fee, r.exact, r.court, r.remark], [800, 'tambon', 'ศาลจังหวัดเชียงราย', 'หมายเหตุศาลจังหวัด']);
  const y = L({ amphur: 'เมืองเชียงราย', tambon: 'รอบเวียง', court: 'ศาลเยาวชนและครอบครัวจังหวัดเชียงราย' }); assert.equal(y.fee, 1500); }
// ไม่ระบุศาล: หลายศาลอัตราต่างกัน → เลือกศาลจังหวัดทั่วไป (ไม่เอาศาลเยาวชน)
assert.equal(L({ amphur: 'เมืองเชียงราย', tambon: 'รอบเวียง', type: 'criminal' }).fee, 800);
// หมู่: แถวที่ระบุหมู่ชนะแถวทั้งตำบล · หมู่ไม่อยู่ในช่วง/ไม่ระบุ = ทั้งตำบล
assert.deepEqual([L({ amphur: 'เมืองเชียงราย', tambon: 'ท่าสุด', moo: '๒' }).fee, L({ amphur: 'เมืองเชียงราย', tambon: 'ท่าสุด', moo: '2' }).exact], [900, 'moo']);
assert.deepEqual([L({ amphur: 'เมืองเชียงราย', tambon: 'ท่าสุด', moo: '9' }).fee, L({ amphur: 'เมืองเชียงราย', tambon: 'ท่าสุด', moo: '9' }).exact], [700, 'tambon']);
assert.equal(L({ amphur: 'เมืองเชียงราย', tambon: 'ท่าสุด' }).fee, 700);
// ตำบลที่อัตราต่างกันตามหมู่ ไม่ทราบหมู่ → ไม่เดา
{ const r = L({ amphur: 'เทิง', tambon: 'ตับเต่า' }); assert.equal(r.fee, null); assert.equal(r.exact, null); assert.equal(r.candidates.length, 2);
  assert.equal(L({ amphur: 'เทิง', tambon: 'ตับเต่า', moo: '5' }).fee, 1200);
  assert.equal(L({ amphur: 'เทิง', tambon: 'ตับเต่า', moo: '7' }).fee, null, 'หมู่ที่ไม่มีในตาราง ไม่เดา'); }
// ทุกหมู่ค่าเท่ากัน → ถือว่าแน่นอนแม้ไม่ทราบหมู่
assert.equal(L({ amphur: 'เทิง', tambon: 'งิ้ว' }).fee, 600);
// ค่าเริ่มต้นระดับอำเภอ (เฉพาะที่ข้อมูลมีจริง) · ไม่พบตำบล/อำเภอ = null
assert.deepEqual([L({ amphur: 'เทิง', tambon: 'ไม่มีตำบลนี้' }).fee, L({ amphur: 'เทิง', tambon: 'ไม่มีตำบลนี้' }).exact], [650, 'amphur-default']);
assert.equal(L({ amphur: 'ไม่มีอำเภอ', tambon: 'รอบเวียง' }).fee, null);
assert.equal(L({ tambon: 'รอบเวียง' }).fee, null);
assert.equal(lookupServiceFee(null, { amphur: 'x' }).fee, null);
// ศาลที่ระบุไม่มีในตำบล → null
assert.equal(L({ amphur: 'เมืองเชียงราย', tambon: 'ท่าสุด', court: 'ศาลจังหวัดภูเก็ต' }).fee, null);
{ const r = L({ amphur: 'เมืองเชียงราย', tambon: 'ท่าสุด', court: 'ศาลจังหวัดภูเก็ต' }); assert.equal(r.courtMismatch, true); assert.ok(r.courts.length >= 1 && !r.ambiguous, 'ศาลไม่ตรง ≠ กำกวม — บอกศาลที่รับส่งหมายตำบลนี้'); }

// ---------- จับคู่ชื่อศาล: ปรับรูปแบบ (วงเล็บ/ช่องว่าง/ไม่มีคำนำหน้า/ชื่อแทนกรุงเทพ) แต่ไม่เดาข้ามศาลที่ต่างกันจริง ----------
{ const mkRows = (...names) => names.map((n, i) => [n, 'เมืองทดสอบ', 'บ้านทดสอบ', '', 100 * (i + 1), -1, '2025-01-01']);
  const F = (rs, court, type) => lookupServiceFee(rs, { amphur: 'เมืองทดสอบ', tambon: 'บ้านทดสอบ', court, type });
  assert.equal(courtKey('ศาลจังหวัดน่าน (สาขาปัว)'), courtKey('ศาลจังหวัดน่าน สาขาปัว'), 'วงเล็บ = ช่องว่าง');
  assert.equal(F(mkRows('ศาลจังหวัดน่าน', 'ศาลจังหวัดน่าน สาขาปัว'), 'ศาลจังหวัดน่าน (สาขาปัว)').fee, 200, 'สาขา ≠ ศาลจังหวัดหลัก');
  assert.equal(F(mkRows('ศาลจังหวัดน่าน', 'ศาลจังหวัดน่าน สาขาปัว'), 'ศาลจังหวัดน่าน').fee, 100);
  assert.equal(F(mkRows('ศาลอาญาตลิ่งชัน', 'ศาลแพ่งตลิ่งชัน'), 'ศาลจังหวัดตลิ่งชัน', 'criminal').fee, 100, 'ชื่อแทน กทม. ตามประเภทคดี');
  assert.equal(F(mkRows('ศาลอาญาตลิ่งชัน', 'ศาลแพ่งตลิ่งชัน'), 'ศาลจังหวัดตลิ่งชัน', 'civil').fee, 200);
  assert.equal(F(mkRows('ศาลแพ่ง', 'ศาลอาญา'), 'ศาลแพ่งมีนบุรี').fee, null, 'ศาลแพ่ง ≠ ศาลแพ่งมีนบุรี (ไม่เดาแบบ substring)');
  assert.equal(F(mkRows('ศาลแขวงเชียงราย', 'ศาลจังหวัดเชียงราย'), 'ศาลจังหวัดเชียงราย').fee, 200, 'ศาลแขวง ≠ ศาลจังหวัด');
  assert.equal(F(mkRows('ศาลแขวงเชียงราย'), 'ศาลจังหวัดเชียงราย').fee, null);
  assert.equal(F(mkRows('ศาลจังหวัดเชียงราย'), 'จังหวัดเชียงราย').fee, 100, 'ไม่มีคำนำหน้า ศาล'); }

// ---------- ข้อมูลจริง (ถ้ามี) : ดัชนีครบและไฟล์จังหวัดอ่านได้ ----------
{ const dir = path.join(here, '..', 'data', 'service-fees'); const ip = path.join(dir, 'index.json');
  if (fs.existsSync(ip)) {
    const real = JSON.parse(fs.readFileSync(ip, 'utf8'));
    assert.ok(real.provinces.length >= 70);
    const p = JSON.parse(fs.readFileSync(path.join(dir, real.provinces[0].file), 'utf8'));
    assert.ok(p.rows.every((r) => r.length === 7 && Number.isFinite(r[4])), 'แถวต้องมี 7 ช่อง ค่าธรรมเนียมเป็นตัวเลข');
    const r0 = p.rows[0];
    assert.equal(lookupServiceFee(p.rows, { amphur: r0[1], tambon: r0[2], court: r0[0], moo: r0[3] || undefined }).court, r0[0]);
  } }

// ---------- แหล่งข้อมูล Supabase (RPC) : โครงสร้างผลลัพธ์ → แถวรูปแบบเดียวกับ static (จำลอง fetch) ----------
{ const realFetch = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, o) => {
    calls.push([url, JSON.parse(o?.body || '{}')]);
    if (url.endsWith('/rpc/service_fee_lookup')) return { ok: true, status: 200, json: async () => [
      { province: 'เชียงราย', court: 'ศาลจังหวัดเชียงราย', amphur: 'เมืองเชียงราย', tambon: 'รอบเวียง', moo: '', fee: 600, remark: 'ก', start_date: '2026-07-01' },
      { province: 'เชียงราย', court: 'ศาลแขวงเชียงราย', amphur: 'เมืองเชียงราย', tambon: 'รอบเวียง', moo: '', fee: 600, remark: 'ก', start_date: '2026-06-15' }] };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  setServiceFeeBackend({ url: 'https://x.supabase.test/', anonKey: 'anon-key' });
  const d = await loadPlaceRows({ province: 'จ.เชียงราย', amphur: 'อ.เมืองเชียงราย', tambon: 'ต.รอบเวียง' });
  assert.equal(calls[0][0], 'https://x.supabase.test/rest/v1/rpc/service_fee_lookup'); assert.deepEqual(calls[0][1], { p_province: 'จ.เชียงราย', p_amphur: 'อ.เมืองเชียงราย', p_tambon: 'ต.รอบเวียง' });
  assert.deepEqual(d.remarks, ['ก']); assert.deepEqual(d.rows[0], ['ศาลจังหวัดเชียงราย', 'เมืองเชียงราย', 'รอบเวียง', '', 600, 0, '2026-07-01']);
  assert.equal(lookupServiceFee(d.rows, { amphur: 'เมืองเชียงราย', tambon: 'รอบเวียง', remarks: d.remarks, court: 'ศาลแขวงเชียงราย' }).court, 'ศาลแขวงเชียงราย');
  await loadPlaceRows({ province: 'เชียงราย', amphur: 'เมืองเชียงราย', tambon: 'รอบเวียง' }); assert.equal(calls.length, 1, 'ผลค้นแคชในหน่วยความจำ');
  assert.deepEqual(await searchServiceFeeCourts('  '), [], 'คำค้นว่าง = ไม่เรียก RPC');
  await assert.rejects(() => searchServiceFeeCourts('เบตง'), /HTTP 404/, 'RPC ล้ม = throw ให้ UI แจ้ง');
  setServiceFeeBackend(null); globalThis.fetch = realFetch; _clearServiceFeeCache(); }

// ---------- ข้อมูลจริง: ค้นชื่อศาล (static) + เทียบ Supabase RPC กับตรรกะ local (ข้ามเมื่อออฟไลน์) ----------
{ const dir = path.join(here, '..', 'data', 'service-fees');
  if (fs.existsSync(path.join(dir, 'courts.json'))) {
    const fsFetch = async (u) => ({ ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(path.join(dir, u.split('/').pop()), 'utf8')) });
    const hits = await searchServiceFeeCourts('เบตง', fsFetch, '/real/'); assert.equal(hits[0].court, 'ศาลจังหวัดเบตง'); assert.ok(hits.every((h) => /เบตง/.test(h.court)));
    assert.equal((await searchServiceFeeCourts('จังหวัดน่าน  (สาขา ปัว)', fsFetch, '/real/'))[0].court, 'ศาลจังหวัดน่าน สาขาปัว', 'ไม่สนช่องว่าง/วงเล็บ');
    assert.equal((await searchServiceFeeCourts('สาขาปัว', fsFetch, '/real/'))[0].court, 'ศาลจังหวัดน่าน สาขาปัว');
    assert.equal((await searchServiceFeeCourts('ที่ไม่มีศาลนี้แน่ๆ', fsFetch, '/real/')).length, 0);
    assert.ok((await searchServiceFeeCourts('x'.repeat(1), fsFetch, '/real/')).length <= 30);
    _clearServiceFeeCache();
    const cfg = (await import('../public/js/config.js').catch(() => null))?.default?.supabase;
    let live = false;
    if (cfg?.url && cfg?.anonKey) {
      const realFetch = globalThis.fetch; globalThis.fetch = (u, o) => realFetch(u, { ...o, signal: AbortSignal.timeout(10000) });
      try { setServiceFeeBackend(cfg); live = (await listServiceFeeProvinces()).length > 0; } catch { live = false; }
      if (live) {
        const ix = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
        let seed = 20261008; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
        let compared = 0;
        for (let k = 0; k < 50; k++) {
          const p = ix.provinces[rnd(ix.provinces.length)], st = JSON.parse(fs.readFileSync(path.join(dir, p.file), 'utf8'));
          const row = st.rows[rnd(st.rows.length)];
          const moo = String(row[3] || '').match(/\d+/)?.[0] || (rnd(2) ? '1' : undefined);
          const local = lookupServiceFee(st.rows, { amphur: row[1], tambon: row[2], moo, court: row[0], remarks: st.remarks, type: 'criminal' });
          const rem = await loadPlaceRows({ province: p.name, amphur: row[1], tambon: row[2] });
          const remote = lookupServiceFee(rem.rows, { amphur: row[1], tambon: row[2], moo, court: row[0], remarks: rem.remarks, type: 'criminal' });
          assert.deepEqual([remote.fee, remote.court, remote.remark, remote.exact, remote.startDate], [local.fee, local.court, local.remark, local.exact, local.startDate], `RPC ≠ local: ${p.name}/${row[1]}/${row[2]}/${moo}/${row[0]}`);
          compared++;
        }
        const area = await loadProvinceRows('เชียงราย'); const stc = JSON.parse(fs.readFileSync(path.join(dir, ix.provinces.find((x) => x.name === 'เชียงราย').file), 'utf8'));
        assert.equal(area.rows.length, stc.rows.length, 'service_fee_area จำนวนแถวตรงกับไฟล์'); assert.equal(area.rows.reduce((a, r) => a + r[4], 0), stc.rows.reduce((a, r) => a + r[4], 0));
        assert.equal((await searchServiceFeeCourts('เบตง'))[0].court, 'ศาลจังหวัดเบตง');
        console.log(`  RPC เทียบ local ${compared} สถานที่ตรงกัน`);
      } else console.log('  (ข้ามการเทียบ Supabase: ออฟไลน์/เข้าถึงไม่ได้)');
      setServiceFeeBackend(null); globalThis.fetch = realFetch; _clearServiceFeeCache();
    }
  } }

// ---------- serviceFeeInfo: หลายวิธีส่งรวมกัน ----------
const mk = () => {
  const c = newCase('criminal'); c.court = 'ศาลจังหวัดธัญบุรี';
  c.parties = [Object.assign(newParty('plaintiff'), { first: 'ก' }), ...['ข', 'ค', 'ง', 'จ'].map((f) => Object.assign(newParty('defendant'), { first: f }))];
  return c;
};
{ const c = mk(); const d = c.parties.filter((p) => p.role === 'defendant');
  d[0].deliver = 'ems'; d[1].deliver = 'officer'; d[1].officerFee = 800; d[1].officerCourt = 'ศาลจังหวัดเชียงราย';
  d[2].deliver = 'officer'; d[2].officerFee = '1,200';   // พิมพ์เอง (สตริง)
  d[3].deliver = 'self'; d[3].officerFee = 999;           // ส่งเอง: ไม่นับ officerFee
  const fi = serviceFeeInfo(c);
  assert.equal(fi.total, EMS_FEE + 800 + 1200); assert.equal(fi.emsTotal, 80); assert.equal(fi.officerTotal, 2000); assert.equal(fi.nOfficer, 2); assert.equal(fi.unknownOfficer, false);
  assert.equal(fi.deliver, 'mixed'); assert.equal(fi.per[1].court, 'ศาลจังหวัดเชียงราย'); assert.ok(fi.per[1].known && !fi.per[3].unknown);
  d[2].officerFee = ''; const f2 = serviceFeeInfo(c);
  assert.equal(f2.total, 80 + 800); assert.equal(f2.per[2].unknown, true); assert.equal(f2.per[2].known, false); assert.equal(f2.unknownOfficer, true);
  d[2].officerFee = 'abc'; assert.equal(serviceFeeInfo(c).per[2].unknown, true); assert.equal(officerFeeOf({ officerFee: -5 }), null); assert.equal(officerFeeOf({ officerFee: 0 }), 0); }

// ---------- suggestDeliver: แนะนำเฉพาะส่งข้ามเขต + จำเลยอยู่นอกเขต ไม่เปลี่ยนค่าที่บันทึก ----------
{ const c = mk(); const [d1, d2] = c.parties.filter((p) => p.role === 'defendant');
  const adv = { rows: [{ party: d1, known: true, inside: false }, { party: d2, known: true, inside: true }] };
  c.service.mode = 'cross-post'; assert.equal(suggestDeliver(c, d1, adv), 'officer'); assert.equal(suggestDeliver(c, d2, adv), 'ems');
  c.service.mode = 'post'; assert.equal(suggestDeliver(c, d1, adv), 'ems');
  c.service.mode = 'cross-post'; assert.equal(d1.deliver ?? '', '', 'ไม่เขียนทับค่าที่บันทึก'); assert.equal(suggestDeliver(c, d1, null), 'ems'); }

// ---------- ถ้อยคำในคำร้อง ----------
{ const c = mk(); c.service.mode = 'cross-post'; c.service.court = 'ศาลจังหวัดเชียงราย';
  const d = c.parties.filter((p) => p.role === 'defendant'); d.slice(1).forEach((x) => { x.deliver = 'ems'; });
  // จำเลยคนเดียวส่งโดยเจ้าพนักงาน: ทราบอัตรา
  c.parties = [c.parties[0], d[0]]; d[0].deliver = 'officer'; d[0].officerFee = 800; d[0].officerCourt = 'ศาลจังหวัดเชียงราย';
  let t = serviceMotionText(c, { laws: [], items: [] });
  assert.match(t, /ตามอัตราของศาลปลายทาง \(ศาลจังหวัดเชียงราย\) อัตราค่านำหมาย 800 บาท/);
  // ไม่ทราบอัตรา: ถ้อยคำเดิม ไม่มีตัวเลข
  d[0].officerFee = ''; t = serviceMotionText(c, { laws: [], items: [] });
  assert.match(t, /ตามอัตราของศาลปลายทาง โจทก์จะเป็นผู้ชำระ/); assert.ok(!/อัตราค่านำหมาย \d/.test(t));
  // หลายคน: ems 80 และเจ้าพนักงานตามที่ค้น แสดงชัดเจน ; ส่งเอง = ไม่มีค่านำหมาย
  const e = newParty('defendant'), s = newParty('defendant'), o = newParty('defendant');
  Object.assign(e, { first: 'อี', deliver: 'ems' }); Object.assign(o, { first: 'โอ', deliver: 'officer', officerFee: 1000, officerCourt: 'เทิง' }); Object.assign(s, { first: 'เอส', deliver: 'self' });
  c.parties = [c.parties[0], e, o, s]; t = serviceMotionText(c, { laws: [], items: [] });
  assert.match(t, /อัตราค่านำหมาย 80 บาท/); assert.match(t, /1,000 บาท/); assert.match(t, /\(ศาลเทิง\)/); assert.match(t, /ไม่มีค่านำหมายในส่วนนี้/); }

// ---------- คำร้องขอหมายเรียกพยาน: ระบุอัตราเมื่อทราบ ----------
{ const c = mk(); c.parties = c.parties.slice(0, 2);
  const addr = { no: '9', moo: '', building: '', soi: '', road: '', sub: 'รอบเวียง', district: 'เมืองเชียงราย', province: 'เชียงราย', zip: '57000' };
  c.witnesses = [{ ...newWitness('person'), name: 'พยานหนึ่ง', addr, deliver: 'officer', officerFee: 800, officerCourt: 'ศาลจังหวัดเชียงราย' }, { ...newWitness('person'), name: 'พยานสอง', addr, deliver: 'officer' }];
  const d = buildDocuments(c, { laws: [], items: [], courtPhones: {}, formText: {} }).find((x) => x.id === 'witnessRequest');
  const items = d.blocks.filter((b) => b.t === 'p' && b.runs?.[0]?.b && /^ข้อ/.test(b.runs[0].text)).map((b) => b.runs.map((r) => r.text || '').join('').replace(/[๐-๙]/g, (ch) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(ch)));   // เอกสารแสดงเลขไทย
  assert.equal(items.length, 2);
  assert.match(items[0], /ตามอัตราของศาลปลายทาง \(ศาลจังหวัดเชียงราย\) อัตราค่านำหมาย 800 บาท/);
  assert.ok(!/อัตราค่านำหมาย/.test(items[1]), 'ไม่ทราบอัตรา = ไม่ใส่ตัวเลข'); }

console.log('service-fee OK');
