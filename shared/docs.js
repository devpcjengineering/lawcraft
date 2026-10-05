// ตัวสร้างเอกสารยื่นศาลจากข้อมูลคดี → "blocks" กลาง
// แล้วให้ render-html (พรีวิว/พิมพ์ PDF) และ render-docx (ไฟล์ Word) แปลงต่อ จึงแก้เนื้อหาที่เดียวได้ผลทั้งสองแบบ
import { ft, setFormTextOverrides } from './formtext.js';
import {
  toThaiDigits, longDate, isoToThaiLong, formatCitizenId, addressText, isBkk, courtShort, THAI_MONTHS,
} from './thai.js';
import {
  indexLaw, plaintiffs, defendants, partyLabel, partyName, groupName, chargeSectionsText, chargeNamesText,
  resolveRuns, runsToText, chargeItem, reservedValue, tailFacts, serviceFeeInfo,
  witnessList, witnessSummonsPlan, witnessAddr, witnessHasAddr, witnessAddrText, witnessWantsSummons, witnessKind, isItemWitness,
} from './model.js';

// ---------- runs ----------
const t = (text, extra = {}) => ({ text, ...extra });
const val = (text) => (text ? { text, kind: 'val' } : null);
const dots = (len = 24) => ({ text: '', kind: 'dots', len });
const bold = (text) => ({ text, b: true });

/** [label, value, optional] ... → runs; dash=true: ช่องที่ว่างแสดงเป็น "-" ตามที่ใช้ในแบบพิมพ์ศาล (ช่อง optional ถ้าว่างข้ามไป) */
function fields(pairs, sep = ' ', dash = false) {
  const runs = [];
  for (const [label, value, optional] of pairs) {
    const has = !(value === undefined || value === null || String(value).trim() === '');
    if (!has && (!dash || optional)) continue;
    if (runs.length) runs.push(t(sep));
    if (label) runs.push(t(label + ' '));
    runs.push(val(has ? String(value) : '-'));
  }
  return runs;
}

/** ลำดับช่องที่อยู่ตามแบบพิมพ์ศาล: บ้านเลขที่ หมู่ที่ ถนน ตรอก/ซอย ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์ */
function addrPairs(a = {}) {
  const bkk = isBkk(a.province);
  return [
    ['อยู่บ้านเลขที่', a.no], ['หมู่ที่', a.moo], ['อาคาร', a.building, true],
    ['ถนน', a.road], ['ตรอก/ซอย', a.soi],
    [bkk ? 'แขวง' : 'ตำบล', a.sub], [bkk ? 'เขต' : 'อำเภอ', a.district],
    ['จังหวัด', a.province], ['รหัสไปรษณีย์', a.zip],
  ];
}

/**
 * ข้อความบรรยายตัวบุคคลตามแบบพิมพ์ศาล (ช่องว่างใส่ "-")
 * o.afterId: ป้ายบทบาท (โจทก์/จำเลย) ต่อท้ายเลขประจำตัวประชาชน แบบ ๔ คำฟ้อง; ไม่ตั้ง = ต่อท้ายชื่อ แบบ ๗ ฯลฯ
 * o.suffix: ต่อท้ายชื่อเมื่อมีหลายคน เช่น "ที่ 1 กับพวกรวม 3 คน"
 */
function personRuns(p, label, o = {}) {
  const { afterId = false, suffix = '' } = o;
  const nameRuns = [val(partyName(p)), ...(suffix ? [t(' ' + suffix)] : [])];
  const lbl = label ? [t(' ' + label)] : [];
  if (p.kind === 'juristic') {
    return [
      ...nameRuns,
      ...(p.repName ? [t(' โดย '), val(p.repName), t(' ' + (p.repPosition || 'ผู้มีอำนาจกระทำการแทน'))] : []),
      ...lbl, t(' '),
      ...fields([['เลขทะเบียนนิติบุคคล', p.regNo], ...addrPairs(p.address).map(([l, v, op]) => [l === 'อยู่บ้านเลขที่' ? 'สำนักงานตั้งอยู่เลขที่' : l, v, op]),
        ['โทรศัพท์', p.phone], ['โทรสาร', p.fax], ['ไปรษณีย์อิเล็กทรอนิกส์', p.email]], ' ', true),
    ];
  }
  return [
    ...nameRuns, ...(afterId ? [] : lbl), t(' เลขประจำตัวประชาชน '), val(p.idCard ? formatCitizenId(p.idCard) : '-'), ...(afterId ? lbl : []), t(' '),
    ...fields([
      ['เชื้อชาติ', p.ethnicity], ['สัญชาติ', p.nationality], ['อาชีพ', p.occupation],
      ['อายุ', p.age ? p.age + ' ปี' : ''],
      ...addrPairs(p.address),
      ['โทรศัพท์', p.phone], ['โทรสาร', p.fax], ['ไปรษณีย์อิเล็กทรอนิกส์', p.email],
    ], ' ', true),
  ];
}

function counselName(cn) {
  return [cn.prefix, cn.first].filter(Boolean).join('') + (cn.last ? ' ' + cn.last : '');
}

// ---------- blocks ----------
const p = (runs, o = {}) => ({ t: 'p', runs: runs.filter(Boolean), ...o });

function top(c, formNo, title, o = {}) {
  return { t: 'top', formNo: formNo ? `(${formNo})` : '', title, black: c.caseNoBlack, red: c.caseNoRed, year: c.caseYear, showRed: o.showRed !== false, courtUse: !!o.courtUse, noEmblem: !!o.noEmblem, kinds: o.kinds || null };
}

function courtBlock(c, kindOverride) {
  const d = c.date;
  return {
    t: 'court',
    court: courtShort(c.court),
    day: d.d, month: THAI_MONTHS[+d.m - 1] || '', year: d.y,
    kind: kindOverride || (c.type === 'civil' ? 'แพ่ง' : 'อาญา'),
  };
}

function betweenBlock(c) {
  // หลายคน: แสดงคนแรกเป็นหลัก "นาย… ที่ 1 กับพวกรวม N คน" แถวเดียวต่อฝ่าย (รายละเอียดทั้งหมดอยู่ในเอกสารแนบท้ายคำฟ้อง)
  const side = (list, role) => (list.length > 1
    ? [{ name: groupName(c, role), label: role === 'plaintiff' ? 'โจทก์' : 'จำเลย', role }]
    : list.map((x) => ({ name: partyName(x), label: partyLabel(c, x), role })));
  return { t: 'between', pl: side(plaintiffs(c), 'plaintiff'), df: side(defendants(c), 'defendant') };
}

function sigBlock(lines, compact = false) { return { t: 'sig', lines, compact }; }

function plaintiffSigs(c, role = 'โจทก์') {
  return plaintiffs(c).map((x) => ({ label: plaintiffs(c).length > 1 ? partyLabel(c, x) : role, name: `(${partyName(x)})` }));
}

function authorLine(c, noun = 'คำฟ้อง', selfParty = null) {
  // ผู้เรียงและพิมพ์: ทนายความ (ถ้ามี) หรือโจทก์เอง
  const cn = c.counsel;
  if (cn.enabled && (cn.first || cn.last)) {
    return [
      p([t(`${noun}ฉบับนี้ ข้าพเจ้า `), val(counselName(cn)),
        ...(cn.idCard ? [t(' เลขประจำตัวประชาชน '), val(formatCitizenId(cn.idCard))] : []),
        ...(cn.license ? [t(' ทนายความใบอนุญาตที่ '), val(cn.license)] : [t(' ทนายความ')]),
        ...fields(addrPairs(cn.address), ' ').length ? [t(' '), ...fields(addrPairs(cn.address))] : [],
        ...(cn.phone ? [t(' โทรศัพท์ '), val(cn.phone)] : []),
        t(' ผู้เรียงและเขียนหรือพิมพ์')], { align: 'center', keep: true }),
      sigBlock([{ label: 'ผู้เรียงและเขียนหรือพิมพ์', name: `(${counselName(cn)})` }]),
    ];
  }
  const pl = selfParty || plaintiffs(c)[0];
  return [
    p([t(`${noun}ฉบับนี้ ข้าพเจ้า `), val(pl ? partyName(pl) : ''), t(' ผู้เรียงและเขียนหรือพิมพ์')], { align: 'center', keep: true }),
    sigBlock([{ label: 'ผู้เรียงและเขียนหรือพิมพ์', name: '' }]),
  ];
}

function numbered(runsList, prefix = 'ข้อ', gap = true) {
  return runsList.map((runs, i) => p([bold(`${prefix} ${i + 1}.`), t(' '), ...runs], { indent: 1.5, justify: true, gap }));
}

/** บรรทัดที่เป็นข้อย่อย: ๓.๑  ๓.๑.๒  (๑)  (ก)  ก.  — ขึ้นต้นบรรทัดด้วยตัวเลขข้อย่อยแล้วเว้นวรรค */
const SUB_RE = /^\s*(?:[0-9๐-๙]+(?:\.[0-9๐-๙]+)+\.?|\([0-9๐-๙ก-ฮ]+\)|[ก-ฮ]\.)(?=\s)/;
/** ย่อหน้าบรรทัดแรกของข้อย่อย (ซม.): ระดับ ๓.๑ ลึกกว่า “ข้อ” (1.5 ซม.) ประมาณ 1.75 ซม., ระดับ ๓.๑.๑ ลึกอีกขั้น */
const subIndent = (line) => ((/^\s*[0-9๐-๙]+(?:\.[0-9๐-๙]+){2,}/.test(line)) ? 4.75 : 3.25);
const bodyLineBlock = (ln, c, idx) => p(resolveRuns(ln.trim(), c, idx), { indent: SUB_RE.test(ln) ? subIndent(ln) : 0, justify: true });
/** “ข้อ N.” + ข้อความหลายบรรทัด: บรรทัดแรกต่อท้ายเลขข้อ บรรทัดถัดไปเป็นย่อหน้าแยก (ข้อย่อยย่อหน้าเข้า) */
function itemParas(no, raw, c, idx) {
  const lines = multiline(String(raw || '').replace(/^ข้อ\s*[0-9๐-๙]+[.)]?\s*/, ''));
  const first = lines.shift() || '';
  return [p([bold(`ข้อ ${no}.`), t(' '), ...resolveRuns(first, c, idx)], { indent: 1.5, justify: true }), ...lines.map((ln) => bodyLineBlock(ln, c, idx))];
}

function multiline(text) {
  return String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
}

function textToItems(txt) {
  return String(txt || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
}

// ---------- ตัวช่วยข้อความตายตัว ----------
/** ข้อความจากแม่แบบ ที่มี {n} → แทนด้วยค่า (ขีดจุดถ้าว่าง) */
function nRuns(key, n) {
  const parts = ft(key, { n: '\u0000' }).split('\u0000');
  const runs = [];
  parts.forEach((x, i) => { if (i) runs.push(n ? val(String(n)) : dots(10)); runs.push(t(x)); });
  return runs;
}

/** คำขอให้ศาลออกหมาย…ตามที่เลือกใน summonKind */
function summonRuns(c, dfWord, dfNames) {
  const k = c.summonKind || '';
  const key = /ไต่สวน/.test(k) ? 'prayer.criminal.summon.preliminary' : /จับ/.test(k) ? 'prayer.criminal.summon.arrest' : 'prayer.criminal.summon.summon';
  const parts = ft(key, { def: dfWord, names: '\u0000' }).split('\u0000');
  const runs = [];
  parts.forEach((x, i) => { if (i) runs.push(dfNames ? val(dfNames) : dots(20)); runs.push(t(x)); });
  return runs;
}

// ---------- แต่ละเอกสาร ----------
/**
 * ย่อหน้าแนะนำคู่ความของฝ่ายหนึ่ง: ถ้ามีหลายคนใช้คนแรกเป็นหลัก "ข้าพเจ้า นาย… ที่ 1 กับพวกรวม N คน โจทก์ …"
 * และอ้างถึงเอกสารแนบท้ายคำฟ้อง
 */
function sideIntro(c, role, afterId = false) {
  const list = role === 'plaintiff' ? plaintiffs(c) : defendants(c);
  if (!list.length) return [];
  const word = role === 'plaintiff' ? 'โจทก์' : 'จำเลย';
  const lead = role === 'plaintiff' ? 'ข้าพเจ้า ' : 'ขอยื่นฟ้อง ';
  const suffix = list.length > 1 ? `ที่ 1 กับพวกรวม ${list.length} คน` : '';
  const out = [p([t(lead), ...personRuns(list[0], word, { afterId, suffix })], { indent: 1.5, justify: true })];
  if (list.length > 1) out.push(p([t(`(รายละเอียดของ${word}ทั้งหมดปรากฏตามเอกสารแนบท้ายคำฟ้อง)`)], { indent: 1.5, small: true }));
  return out;
}

/** เอกสารแนบท้ายคำฟ้อง: รายละเอียดคู่ความทุกคนของฝ่ายที่มีมากกว่าหนึ่งคน */
function attachmentDoc(c) {
  const pl = plaintiffs(c), df = defendants(c);
  if (pl.length < 2 && df.length < 2) return null;
  const blocks = [top(c, '', 'เอกสารแนบท้ายคำฟ้อง', { showRed: false }), courtBlock(c), betweenBlock(c)];
  const section = (list, word) => {
    blocks.push(p([bold(`รายละเอียดของ${word}ทั้งหมด (รวม ${list.length} คน)`)], { indent: 0, gap: true }));
    list.forEach((x, i) => blocks.push(p([bold(`${i + 1}.`), t(' '), ...personRuns(x, `${word}ที่ ${i + 1}`)], { indent: 1.5, justify: true, gap: true })));
  };
  if (pl.length > 1) section(pl, 'โจทก์');
  if (df.length > 1) section(df, 'จำเลย');
  blocks.push(
    p([t('เอกสารนี้เป็นส่วนหนึ่งของคำฟ้อง')], { indent: 1.5, gap: true }),
    sigBlock(pl.length > 1 ? plaintiffSigs(c) : [{ label: 'โจทก์', name: pl[0] ? `(${partyName(pl[0])})` : '' }]),
  );
  return { id: 'attachment', title: 'เอกสารแนบท้ายคำฟ้อง', blocks };
}

function complaintDoc(c, idx) {
  const civil = c.type === 'civil';
  const pl = plaintiffs(c), df = defendants(c);
  const charges = (c.chargeText || '').trim() || chargeNamesText(c, idx) || c.civilCause;
  const blocks = [
    top(c, '๔', 'คำฟ้อง'),
    courtBlock(c),
    betweenBlock(c),
    charges ? p([t('ข้อหาหรือฐานความผิด '), val(charges)], { gap: false }) : { t: 'leader', label: 'ข้อหาหรือฐานความผิด' },
  ];
  {
    // แบบ ๔ มีช่อง “จำนวนทุนทรัพย์” ทั้งคดีแพ่งและคดีอาญา — ไม่มีให้ขีดจุด
    blocks.push({ t: 'amount', baht: c.amount.baht ? Number(c.amount.baht).toLocaleString('en-US') : '', satang: c.amount.baht ? String(c.amount.satang || '00') : '' });
  }
  blocks.push(...sideIntro(c, 'plaintiff', true), ...sideIntro(c, 'defendant', true));
  blocks.push(p([t('มีข้อความตามที่จะกล่าวต่อไปนี้')], { indent: 0 }));
  const facts = [...c.facts.filter((f) => (f.text || '').trim()), ...tailFacts(c).map((text) => ({ text, tail: true }))];
  if (facts.length) {
    facts.forEach((f, i) => {
      const lines = multiline(f.text);
      const first = lines.shift() || '';
      blocks.push(p([bold(`ข้อ ${i + 1}.`), t(' '), ...resolveRuns(first, c, idx)], { indent: 1.5, justify: true }));
      lines.forEach((ln) => blocks.push(bodyLineBlock(ln, c, idx)));
    });
  } else {
    blocks.push(p([bold('ข้อ 1.'), t(' '), dots(60)], { indent: 1.5 }), { t: 'lines', n: 12 });
  }
  blocks.push(p([t(ft('motion.closing.2'))], { align: 'right', gap: true }));
  return { id: 'complaint', title: civil ? 'คำฟ้อง (แพ่ง)' : 'คำฟ้อง (อาญา)', blocks };
}

function prayerDoc(c, idx) {
  const civil = c.type === 'civil';
  const df = defendants(c);
  const dfNames = df.length ? groupName(c, 'defendant') : '';
  const dfWord = df.length > 1 ? 'จำเลยทั้งหมด' : 'จำเลย';
  const prayers = c.prayers.filter((x) => (x.text || '').trim());
  const blocks = [top(c, civil ? '๕' : '๖', civil ? 'คำขอท้ายคำฟ้องแพ่ง' : 'คำขอท้ายคำฟ้องอาญา', { showRed: false, noEmblem: true })];
  if (civil) {
    blocks.push(p([t(ft('prayer.civil.intro', { def: dfWord }))], { indent: 1.5, justify: true }));
  } else {
    const secs = chargeSectionsText(c, idx);
    blocks.push(
      p([t(ft('prayer.criminal.intro', { def: dfWord })), secs ? val(secs) : dots(50)], { indent: 1.5, justify: true }),
      p(summonRuns(c, dfWord, dfNames), { indent: 1.5, justify: true }),
    );
  }
  if (prayers.length) {
    prayers.forEach((x, i) => blocks.push(p([t(`${i + 1}. `), ...resolveRuns(x.text, c, idx)], { indent: 3, justify: true, hang: 0.9 })));
  } else {
    for (let i = 1; i <= 4; i++) blocks.push(p([t(`${i}. `), dots(60)], { indent: 3 }));
  }
  blocks.push(p([...nRuns('prayer.copies', c.copies)], { indent: 1.5, justify: true }));
  blocks.push(sigBlock(plaintiffSigs(c)));
  blocks.push({ t: 'flip' });
  blocks.push(...authorLine(c, 'คำฟ้อง'));
  return { id: 'prayer', title: civil ? 'คำขอท้ายคำฟ้อง (แพ่ง)' : 'คำขอท้ายคำฟ้อง (อาญา)', blocks };
}

function firstPlaintiffIntro(c) {
  const pl = plaintiffs(c);
  return pl.map((x, i) => p([t(i === 0 ? 'ข้าพเจ้า ' : 'และ '), ...personRuns(x, plaintiffs(c).length > 1 ? partyLabel(c, x) : 'โจทก์')], { indent: 1.5, justify: true }));
}

export const MOTION_KINDS = ['คำร้อง', 'คำแถลง', 'คำขอ'];
export const MOTION_KINDS_ALL = [...MOTION_KINDS, 'คำบอกกล่าว'];
function motionDoc(c, idx, m, n) {
  const pl = plaintiffs(c);
  const items = textToItems(m.text);
  const blocks = [
    top(c, '๗', m.title || '', { courtUse: false, kinds: m.kind === 'คำบอกกล่าว' ? { all: ['คำบอกกล่าว'], on: 'คำบอกกล่าว' } : { all: MOTION_KINDS, on: MOTION_KINDS.includes(m.kind) ? m.kind : 'คำร้อง' } }),
    courtBlock(c),
    betweenBlock(c),
    ...sideIntro(c, 'plaintiff'),
    p([t(ft('motion.intro'))], { indent: 0 }),
  ];
  if (items.length) {
    items.forEach((it, i) => blocks.push(...itemParas(i + 1, it, c, idx)));
  } else blocks.push(p([bold('ข้อ 1.'), t(' '), dots(60)], { indent: 1.5 }), { t: 'lines', n: 6 });
  blocks.push(
    p([t(ft('motion.closing.1'))], { indent: 1.5, gap: true }),
    p([t(ft('motion.closing.2'))], { align: 'right' }),
    { t: 'rule' },
    p([{ text: 'หมายเหตุ', b: true, u: true }, t('   ' + ft('note.waiting'))], { indent: 0 }),
    sigBlock(pl.map((x) => ({ label: 'ผู้ร้อง', name: `(${partyName(x)})` }))),
    ...authorLine(c, 'คำร้อง').map((b) => (b.t === 'p' ? { ...b, runs: b.runs.map((r) => (r.text === 'คำฟ้องฉบับนี้ ข้าพเจ้า ' ? { ...r, text: 'คำร้องฉบับนี้ ข้าพเจ้า ' } : r)) } : b)),
  );
  return { id: `motion-${m.id || n}`, title: `คำร้อง${m.title ? ' – ' + m.title : ' ' + (n + 1)}`, blocks };
}

function witnessDoc(c, idx) {
  // ตามตัวอย่างบัญชีพยานของศาล: ตารางเดียว รวมพยานบุคคล/เอกสาร/วัตถุเรียงตามอันดับ หมายเหตุ = "นำ" หรือ "หมายเรียก"
  const pl = plaintiffs(c);
  // พยานเอกสาร/วัตถุ: คอลัมน์ที่อยู่ = ผู้ครอบครอง + ที่อยู่/ที่เก็บ · หมายเหตุว่าง = “หมายเรียก” (ระบบออกหมายให้) หรือ “นำ” (ปิดหมายรายนี้)
  const all = witnessList(c).map(({ w }) => {
    const item = isItemWitness(w), holder = String(w.holder || '').trim();
    const address = item ? [holder, witnessAddrText(w)].filter(Boolean).join(' ') : witnessAddrText(w);
    const auto = c.docs?.witnessSummons === false || w.self ? '' : witnessWantsSummons(w) ? 'หมายเรียก' : 'นำ';
    return { kind: witnessKind(w), name: w.name, address, note: String(w.note || '').trim() || auto };
  });
  const blocks = [
    top(c, '๑๕', 'บัญชีพยาน', { courtUse: true }),
    courtBlock(c),
    betweenBlock(c),
    p([t('ข้าพเจ้า '), val(groupName(c, 'plaintiff')), t(` ${pl.length > 1 ? 'โจทก์ทั้งหมด' : 'โจทก์'}`)], { indent: 1.5 }),
    p(nRuns('witness.intro', all.length ? String(all.length) : ''), { indent: 0 }),
    {
      t: 'table', head: ['อันดับ', 'ชื่อและสกุลพยาน', 'บ้านเลขที่ หมู่ที่ ถนน ซอย ตำบล/แขวง อำเภอ/เขต จังหวัด', 'หมายเหตุ'],
      widths: [9, 34, 39, 18],
      rows: all.map((w, i) => [String(i + 1), w.name + (w.kind === 'object' ? ' (พยานวัตถุ)' : w.kind === 'document' ? ' (พยานเอกสาร)' : ''), w.address || '', w.note || '']),
      minRows: 6,
    },
    sigBlock([{ label: 'ผู้ระบุ', name: pl.length === 1 ? `(${partyName(pl[0])})` : '' }]),
    { t: 'rule' },
    p([{ text: 'หมายเหตุ', u: true }, t(' ' + ft('witness.child'))], { indent: 0, small: true }),
  ];
  return { id: 'witness', title: 'บัญชีพยาน', blocks };
}

function attorneyDoc(c, idx) {
  const cn = c.counsel;
  const pl = plaintiffs(c);
  const blocks = [
    top(c, '๙', 'ใบแต่งทนายความ'),
    courtBlock(c),
    betweenBlock(c),
    ...pl.map((x, i) => p([t(i === 0 ? 'ข้าพเจ้า ' : 'และ '), ...personRuns(x, pl.length > 1 ? partyLabel(c, x) : 'โจทก์')], { indent: 1.5, justify: true })),
    p([t('ขอแต่งให้ '), val(counselName(cn)), ...(cn.license ? [t(' ทนายความใบอนุญาตที่ '), val(cn.license)] : []),
      ...fields(addrPairs(cn.address).map(([l, v]) => [l === 'อยู่บ้านเลขที่' ? 'สำนักงานอยู่เลขที่' : l, v]), ' ').length
        ? [t(' '), ...fields(addrPairs(cn.address).map(([l, v]) => [l === 'อยู่บ้านเลขที่' ? 'สำนักงานอยู่เลขที่' : l, v]))] : [],
    ], { indent: 0, justify: true }),
    p([t('เป็นทนายความของข้าพเจ้าในคดีนี้ และให้มีอำนาจ * '), ...(cn.powers || c.powers ? [val(cn.powers || c.powers)] : [dots(40)])], { indent: 0, justify: true }),
    p([t('ข้าพเจ้ายอมรับผิดชอบตามที่ '), val(counselName(cn)), t(' ทนายความจะได้ดำเนินกระบวนพิจารณาต่อไปตามกฎหมาย')], { indent: 1.5, justify: true }),
    sigBlock(pl.map((x) => ({ label: 'ผู้แต่งทนายความ', name: `(${partyName(x)})` }))),
    { t: 'flip' },
    { t: 'rule' },
    p([{ text: 'หมายเหตุ', b: true, u: true }, t(' ' + ft('attorney.note'))], { indent: 0, small: true, justify: true }),
  ];
  return { id: 'attorney', title: 'ใบแต่งทนายความ', blocks };
}

function proxyDoc(c, idx) {
  const pl = plaintiffs(c);
  const h = c.proxy?.holder || {};
  return {
    id: 'proxy', title: 'ใบมอบอำนาจ',
    blocks: [
      top(c, '๑๐', 'ใบมอบอำนาจ'),
      courtBlock(c),
      betweenBlock(c),
      ...pl.slice(0, 1).map((x) => p([t('ข้าพเจ้า '), ...personRuns(x, pl.length > 1 ? partyLabel(c, x) : 'โจทก์')], { indent: 1.5, justify: true })),
      p([t('ขอมอบอำนาจให้ '), ...personRuns(h, '')], { indent: 0, justify: true }),
      p([t('ทำการแทน โดยข้าพเจ้ายอมรับผิดชอบในการที่ผู้รับมอบอำนาจของข้าพเจ้าได้ทำการไปนั้นทุกประการ ในกิจการดังที่จะกล่าวต่อไปนี้ '), ...(c.proxy?.purpose ? [val(c.proxy.purpose)] : [dots(50)])], { indent: 0, justify: true }),
      sigBlock([
        { label: 'ผู้มอบอำนาจ', name: pl[0] ? `(${partyName(pl[0])})` : '' },
        { label: 'ผู้รับมอบอำนาจ', name: h.first || h.last ? `(${partyName(h)})` : '' },
        { label: 'พยาน', name: '' }, { label: 'พยาน', name: '' },
      ]),
    ],
  };
}

/** “วันที่ … เวลา … นาฬิกา” — ไม่ระบุวันนัด ให้เว้นเป็น วันที่ ........ เดือน ................ พ.ศ. .................. */
function whenRuns(hd, time, tw = 10) {
  return [hd ? t(' วันที่ ') : t(' วันที่ ........ เดือน ................ พ.ศ. ..................'), ...(hd ? [val(hd)] : []), t(' เวลา '), time ? val(time) : dots(tw), t(' นาฬิกา')];
}

/** หมายนัดไต่สวนมูลฟ้อง — จำเลยหลายคนออกแยกเป็นฉบับต่อคน (target = จำเลยที่รับหมาย) */
function summonsDoc(c, idx, data = {}, target = null) {
  const df = defendants(c);
  const multi = df.length > 1 && !!target;
  const h = c.hearing || {};
  const hd = h.date ? longDate({ d: +h.date.slice(8), m: +h.date.slice(5, 7), y: +h.date.slice(0, 4) + 543 }) : '';
  const d0 = target || df[0];
  const phone = (data.courtPhones || {})[c.court] || '';
  const dName = multi ? partyName(d0) : groupName(c, 'defendant'), allD = groupName(c, 'defendant'), pName = groupName(c, 'plaintiff');
  const dWord = multi ? partyLabel(c, d0) : (df.length > 1 ? 'จำเลยทั้งหมด' : 'จำเลย');
  return {
    id: multi ? `summons-${d0.id}` : 'summons',
    title: multi ? `หมายนัดไต่สวนมูลฟ้อง – ${partyLabel(c, d0)} ${partyName(d0)}` : 'หมายนัดไต่สวนมูลฟ้อง (ร่าง)',
    blocks: [
      top(c, '๑๙ ตรี', 'หมายนัด\nไต่สวนมูลฟ้อง', { courtUse: true }),
      { t: 'center', text: 'ในพระปรมาภิไธยพระมหากษัตริย์', b: true, big: true },
      courtBlock(c, 'อาญา'),
      betweenBlock(c),
      p([t('หมายถึง '), val(dName), t(' ' + dWord)], { indent: 0 }),
      p([t(ft('summons.body')), ...whenRuns(hd, h.time, 10)], { indent: 1.5, justify: true }),
      p([t('เพราะฉะนั้น จึงแจ้งมาเพื่อทราบ')], { indent: 1.5 }),
      sigBlock([{ label: 'ผู้พิพากษา', name: '' }], true),
      p([t('ศาล '), val(courtShort(c.court))], { indent: 0 }),
      p([t('โทรศัพท์ '), phone ? val(phone) : dots(14)], { indent: 0 }),
      { t: 'rule' },
      p([t('ผู้รับหมาย '), ...(d0 ? fields([...addrPairs(d0.address), ['โทรศัพท์', d0.phone]], ' ', true) : [dots(40)])], { indent: 0, fit: true }),
      { t: 'center', text: 'ใบรับหมายนัดไต่สวนมูลฟ้อง', u: true, b: false },
      p([t('วันที่ ........ เดือน ................ พ.ศ. .................. ข้าพเจ้า '), val(dName), t(' ได้รับหมายนัดไต่สวนมูลฟ้องของศาล'), val(courtShort(c.court)), t(' ในคดีระหว่าง '), val(pName), t(' โจทก์ '), val(allD), t(' จำเลย ซึ่งนัดไต่สวนมูลฟ้อง'), ...whenRuns(hd, h.time, 8), t(' ไว้แล้ว')], { indent: 1.5, justify: true }),
      sigBlock([{ label: 'ผู้รับหมาย', name: '' }, { label: 'ผู้ส่งหมาย', name: '' }], true),
      p([{ text: 'หมายเหตุ', u: true }, t(' ' + ft('summons.note'))], { indent: 0, small: true, fit: true }),
    ],
  };
}

// ---------- หมายเรียกพยาน: แบบ ๑๖ (พยานบุคคล) · แบบ ๑๗ (เอกสาร/วัตถุ คดีอาญา) · แบบ ๑๘ (คำสั่งเรียก เอกสาร/วัตถุ คดีแพ่ง) ----------
function hearingParts(c) {
  const h = c.hearing || {};
  const hd = h.date ? longDate({ d: +h.date.slice(8), m: +h.date.slice(5, 7), y: +h.date.slice(0, 4) + 543 }) : '';
  return { hd, time: h.time || '' };
}
const BLANK_DATE = 'วันที่ ........ เดือน ................ พ.ศ. ..................';
const dateRuns = (hd) => (hd ? [t('วันที่ '), val(hd)] : [t(BLANK_DATE)]);

/** ข้อความแม่แบบ {ตัวแปร} → runs (ค่าเป็นข้อความ = ค่าที่กรอก, เป็นอาร์เรย์ = runs สำเร็จรูป, ว่าง = ขีดจุด) */
function tplRuns(raw, vars) {
  const out = [];
  String(raw).split(/(\{\w+\})/).forEach((part) => {
    const m = /^\{(\w+)\}$/.exec(part);
    if (!m) { if (part) out.push(t(part)); return; }
    const v = vars[m[1]];
    if (Array.isArray(v)) out.push(...v); else out.push(v ? val(String(v)) : dots(14));
  });
  return out;
}

/** แม่แบบหลายบรรทัด → ย่อหน้า (บรรทัดแรกย่อหน้า 1.5 ซม. บรรทัดถัดไปชิดซ้ายตามแบบพิมพ์ศาล); lead = runs นำหน้าย่อหน้าแรก */
function tplParas(raw, vars, lead = []) {
  return String(raw).split(/\n+/).map((s) => s.trim()).filter(Boolean)
    .map((s, i) => p([...(i ? [] : lead), ...tplRuns(s, vars)], { indent: i ? 0 : 1.5, justify: true }));
}

/** ที่อยู่ผู้รับหมายตามช่องของแบบพิมพ์ศาล — ไม่มีข้อมูลเลยให้เว้นเป็นจุดไข่ปลาให้เขียนเติม */
function witnessAddrRuns(w, useLegacy = true) {
  const phone = String(w.phone || '').trim(), legacy = useLegacy ? String(w.address || '').trim() : '';
  if (witnessHasAddr(w)) return fields([...addrPairs(witnessAddr(w)), ['โทรศัพท์', phone]], ' ', true);
  if (legacy) return [t('อยู่ '), val(legacy), ...(phone ? [t(' โทรศัพท์ '), val(phone)] : [])];
  if (phone) return fields([...addrPairs(witnessAddr(w)), ['โทรศัพท์', phone]], ' ', true);
  return [t('อยู่บ้านเลขที่ '), dots(8), t(' หมู่ที่ '), dots(5), t(' ถนน '), dots(12), t(' ตรอก/ซอย '), dots(12), t(' ตำบล/แขวง '), dots(12),
    t(' อำเภอ/เขต '), dots(12), t(' จังหวัด '), dots(12), t(' รหัสไปรษณีย์ '), dots(7), t(' โทรศัพท์ '), dots(12)];
}

/** “ด้วย โจทก์ โดย … ทนายความ …” — ไม่มีทนายความ = “ด้วย โจทก์” (โจทก์อ้างพยานเอง) */
function citeByRuns(c) {
  const cn = c.counsel, side = plaintiffs(c).length > 1 ? 'โจทก์ทั้งหมด' : 'โจทก์';
  return [t('ด้วย '), val(side), ...(cn?.enabled && (cn.first || cn.last) ? [t(' โดย '), val(counselName(cn)), t(' ทนายความ '), val(side)] : [])];
}

function witnessSummonsDoc(c, data, g) {
  const crim = c.type !== 'civil', person = g.kind === 'person';
  const h = hearingParts(c);
  const phone = (data.courtPhones || {})[c.court] || '', court = courtShort(c.court);
  const pName = groupName(c, 'plaintiff'), allD = groupName(c, 'defendant');
  const w0 = g.rows[0].w;
  const courtVal = court ? val(court) : dots(18);
  const blocks = [
    top(c, person ? '๑๖' : crim ? '๑๗' : '๑๘', person ? 'หมายเรียก\nพยานบุคคล' : crim ? 'หมายเรียกพยานเอกสาร\nหรือพยานวัตถุ (คดีอาญา)' : 'คำสั่งเรียกพยานเอกสาร\nหรือพยานวัตถุ (คดีแพ่ง)', { courtUse: true }),
    { t: 'center', text: 'ในพระปรมาภิไธยพระมหากษัตริย์', b: true, big: true },
    courtBlock(c),
    betweenBlock(c),
  ];
  if (person) {
    const name = w0.name.trim();
    blocks.push(
      p([t('หมายถึง '), val(name)], { indent: 0 }),
      p(witnessAddrRuns(w0), { indent: 0, justify: true }),
      ...tplParas(ft('wsum.person.cite'), { when: whenRuns(h.hd, h.time, 10) }, [...citeByRuns(c), t(' ')]),
      sigBlock([{ label: 'ผู้พิพากษา', name: '' }], true),
      p([t('ศาล '), courtVal], { indent: 0 }),
      p([t('โทรศัพท์ '), phone ? val(phone) : dots(14)], { indent: 0 }),
      { t: 'flip' },
      { t: 'rule' },
      { t: 'center', text: 'ใบรับหมายเรียกพยานบุคคล', u: true },
      p([t(BLANK_DATE + ' ข้าพเจ้า '), val(name), t(' ได้รับหมายเรียกพยานของศาล'), courtVal, t(' ซึ่งได้กำหนดให้ข้าพเจ้าไปเบิกความเป็นพยาน ในคดีระหว่าง '), val(pName), t(' โจทก์ '), val(allD), t(' จำเลย'), ...whenRuns(h.hd, h.time, 8), t(' ไว้แล้ว')], { indent: 1.5, justify: true }),
      sigBlock([{ label: 'ผู้รับหมาย', name: '' }, { label: 'ผู้ส่งหมาย', name: '' }], true),
      { t: 'pagebreak' },
      { t: 'center', text: 'คำเตือนพยาน', u: true, b: true },
      p([t(ft('wsum.person.warn.1'))], { indent: 1.5, justify: true }),
      p([t(ft('wsum.person.warn.2'))], { indent: 1.5, justify: true, gap: true }),
    );
    const purpose = String(w0.purpose || '').trim();
    if (purpose) blocks.push(p([t('ข้อเท็จจริงที่พยานอาจถูกซักถาม  '), val(purpose)], { indent: 0, justify: true }));
    blocks.push(
      { t: 'lines', n: purpose ? 15 : 17 },
      { t: 'rule' },
      p([{ text: 'หมายเหตุ', b: true, u: true }, t('  ' + ft('wsum.person.note'))], { indent: 0, small: true, justify: true }),
    );
    return { id: g.id, title: g.title, blocks };
  }
  // เอกสาร/วัตถุ — ผู้ครอบครองรายเดียวกันรวมเป็นฉบับเดียว
  const legacyOnly = !g.holder && !witnessHasAddr(w0) && String(w0.address || '').trim();
  const holderName = g.holder || legacyOnly || '';
  const items = g.rows.map((r) => r.w.name.trim());
  const itemsText = items.length > 1 ? items.map((x, i) => `(${i + 1}) ${x}`).join(' ') : items[0];
  const mark = crim ? 'หมาย' : 'คำสั่ง';
  blocks.push(
    p([t(crim ? 'หมายถึง ' : 'ถึง '), holderName ? val(holderName) : dots(60)], { indent: 0 }),
    ...(legacyOnly && !String(w0.phone || '').trim() ? [] : [p(witnessAddrRuns(w0, !legacyOnly), { indent: 0, justify: true })]),
    ...tplParas(ft('wsum.item.cite'), { items: itemsText }, [...citeByRuns(c), t(' ')]),
    ...tplParas(ft(crim ? 'wsum.item.deliver.criminal' : 'wsum.item.deliver.civil'), { items: itemsText, court, date: dateRuns(h.hd) }),
    sigBlock([{ label: 'ผู้พิพากษา', name: '' }], true),
    p([t('ศาล '), courtVal], { indent: 0 }),
    p([t('โทรศัพท์ '), phone ? val(phone) : dots(14)], { indent: 0 }),
    { t: 'flip' },
    { t: 'rule' },
    { t: 'center', text: `ใบรับ${crim ? 'หมายเรียก' : 'คำสั่งเรียก'}พยานเอกสารหรือพยานวัตถุ`, u: true },
    p([t(BLANK_DATE + ' ข้าพเจ้า '), holderName ? val(holderName) : dots(24), t(` ได้รับ${crim ? 'หมายเรียก' : 'คำสั่งเรียก'}พยานเอกสารหรือพยานวัตถุของศาล`), courtVal, t(' ซึ่งได้กำหนดให้ข้าพเจ้าส่ง '),
      ...(itemsText.length > 110 ? [t(`ตามรายการที่ระบุใน${mark}นี้`)] : [val(itemsText)]),
      t(' ไปประกอบการพิจารณา ในคดีระหว่าง '), val(pName), t(' โจทก์ '), val(allD), t(' จำเลย ก่อน'), ...dateRuns(h.hd), t(' ไว้แล้ว')], { indent: 1.5, justify: true }),
    sigBlock([{ label: `ผู้รับ${mark}`, name: '' }, { label: `ผู้ส่ง${mark}`, name: '' }], true),
    { t: 'pagebreak' },
    { t: 'center', text: 'คำเตือน', u: true, b: true },
    p([t(ft(crim ? 'wsum.item.warn.criminal' : 'wsum.item.warn.civil'))], { indent: 1.5, justify: true }),
  );
  return { id: g.id, title: g.title, blocks };
}

/** คำให้การจำเลย (แบบ ๑๑) */
function answerDoc(c, idx) {
  const df = defendants(c);
  const d = df.find((x) => x.id === c.answer?.defendantId) || df[0];
  if (!d) return null;
  const items = textToItems(c.answer?.text);
  const blocks = [
    top(c, '๑๑', 'คำให้การจำเลย', { courtUse: true }),
    courtBlock(c),
    betweenBlock(c),
    p([t('ข้าพเจ้า '), ...personRuns(d, df.length > 1 ? partyLabel(c, d) : 'จำเลย')], { indent: 1.5, justify: true }),
    p([t(ft('answer.intro'))], { indent: 0 }),
  ];
  if (items.length) {
    items.forEach((it, i) => blocks.push(...itemParas(i + 1, it, c, idx)));
  } else blocks.push(p([bold('ข้อ 1.'), t(' '), dots(60)], { indent: 1.5 }), { t: 'lines', n: 6 });
  blocks.push(
    p([t(ft('motion.closing.2'))], { align: 'right' }),
    { t: 'rule' },
    p([{ text: 'หมายเหตุ', b: true, u: true }, t('   ' + ft('note.waiting'))], { indent: 0 }),
    sigBlock([{ label: df.length > 1 ? partyLabel(c, d) : 'จำเลย', name: `(${partyName(d)})` }]),
    ...authorLine(c, 'คำให้การ', d),
  );
  return { id: 'answer', title: 'คำให้การจำเลย', blocks };
}

/** สัญญาประนีประนอมยอมความ (แบบ ๒๙) */
function settlementDoc(c, idx) {
  const pl = plaintiffs(c), df = defendants(c);
  const clauses = (c.settlement?.clauses || []).map((x) => (x.text || '').trim()).filter(Boolean);
  const names = (list) => list.map(partyName).filter(Boolean).join(' และ ');
  const blocks = [
    top(c, '๒๙', 'สัญญาประนีประนอมยอมความ'),
    courtBlock(c),
    betweenBlock(c),
    p([t('เรื่อง '), c.settlement?.subject ? val(c.settlement.subject) : dots(40)], { indent: 0 }),
    p([t('ข้าพเจ้า '), val(names(pl)), t(` ${pl.length > 1 ? 'โจทก์ทั้งหมด' : 'โจทก์'} กับ `), val(names(df)), t(` ${df.length > 1 ? 'จำเลยทั้งหมด' : 'จำเลย'}`)], { indent: 1.5, justify: true }),
    p([t('ขอทำสัญญาประนีประนอมยอมความต่อหน้าศาล มีข้อความตามที่จะกล่าวต่อไปนี้')], { indent: 0 }),
  ];
  if (clauses.length) clauses.forEach((cl, i) => blocks.push(...itemParas(i + 1, cl, c, idx)));
  else blocks.push(p([bold('ข้อ 1.'), t(' '), dots(60)], { indent: 1.5 }), { t: 'lines', n: 8 });
  blocks.push(
    p([t(ft('settlement.closing'))], { indent: 1.5, justify: true, gap: true }),
    sigBlock([
      ...pl.map((x) => ({ label: pl.length > 1 ? partyLabel(c, x) : 'โจทก์', name: `(${partyName(x)})` })),
      ...df.map((x) => ({ label: df.length > 1 ? partyLabel(c, x) : 'จำเลย', name: `(${partyName(x)})` })),
      { label: 'พยาน', name: '' },
    ]),
  );
  return { id: 'settlement', title: 'สัญญาประนีประนอมยอมความ', blocks };
}

/** โหมดการส่งหมาย: cross-post | post | cross | none (รองรับข้อมูลเก่าที่เป็น boolean) */
export function serviceMode(c) {
  const svc = c.service || {};
  if (svc.mode) return svc.mode;
  return svc.crossDistrict && svc.postNotice ? 'cross-post' : svc.crossDistrict ? 'cross' : svc.postNotice ? 'post' : 'none';
}

const SERVICE_TITLES = { 'cross-post': 'ขอส่งหมายนอกเขตและปิดหมาย', post: 'ขอปิดหมาย', cross: 'ขอส่งหมายนอกเขต' };

/** คำร้องส่งหมาย/ปิดหมาย — เอกสารขั้นต่ำของชุดฟ้อง สร้างอัตโนมัติจากข้อมูลคดี (แก้ข้อความเองได้) */
function serviceDoc(c, data, idx) {
  const mode = serviceMode(c);
  if (mode === 'none') return null;
  const svc = c.service || {};
  const text = svc.custom && (svc.text || '').trim() ? svc.text : serviceMotionText(c, data);
  const d = motionDoc(c, idx, { id: 'service', title: SERVICE_TITLES[mode], text }, 0);
  return { ...d, id: 'service', title: 'คำร้อง – ' + SERVICE_TITLES[mode] };
}

/** ข้อความคำร้องขอส่งหมายนอกเขต/ปิดหมาย สร้างจากข้อมูลคดี (ตามแนวคำร้องที่ใช้จริงในศาล) */
export function serviceMotionText(c, data) {
  const idx = indexLaw(data);
  const df = defendants(c);
  const dfWord = df.length > 1 ? 'จำเลยทั้งหมด' : 'จำเลย';
  const secs = chargeSectionsText(c, idx);
  const names = (c.chargeText || '').trim() || chargeNamesText(c, idx);
  const d0 = df[0];
  const addr = d0 ? addressText(d0.address, isBkk(d0.address.province)) : '';
  const svc = c.service || {};
  const mode = serviceMode(c);
  const out = [];
  const hd = c.hearing?.date ? isoToThaiLong(c.hearing.date) : '';
  const crim = c.type !== 'civil';
  const dayTxt = hd || '........ เดือน ................ พ.ศ. ..................';  // ไม่ระบุวันนัด → เว้นว่างให้เขียนเติมเอง
  out.push(`โจทก์ได้ยื่นฟ้อง${groupName(c, 'defendant') || dfWord} เป็นจำเลยต่อศาลนี้${crim ? `ในความผิดฐาน${names || '...'}${secs ? ' ตาม' + secs : ''}` : (names ? ` เรื่อง${names}` : '')} และศาลนัด${crim ? 'ไต่สวนมูลฟ้อง' : 'พิจารณา'}ในวันที่ ${dayTxt}`);
  if (mode.includes('cross')) {
    const dom = df.length > 1
      ? df.map((d) => `${partyLabel(c, d)}มีภูมิลำเนาอยู่${addressText(d.address, isBkk(d.address.province)) || '…'}`).join(' ')
      : `${dfWord}มีภูมิลำเนาอยู่${addr ? addr + ' ' : ''}`;
    out.push(`${dom.trim()} ซึ่งอยู่นอกเขตอำนาจของศาลนี้ โจทก์จึงขอให้ศาลอนุญาตให้ส่งสำเนาคำฟ้องและหมายแจ้งวันนัดไต่สวนมูลฟ้องไปยัง${svc.court || 'ศาลที่มีเขตอำนาจ'} เพื่อจัดการส่งให้แก่${dfWord} ณ ภูมิลำเนาดังกล่าว`);
  }
  if (mode.includes('post')) {
    const fi = serviceFeeInfo(c);
    const money = (n) => n.toLocaleString('en-US');
    const feePhrase = fi.multi && fi.unit ? `อัตราค่านำหมายรวม ${money(fi.total)} บาท (จำเลยคนละ ${money(fi.unit)} บาท จำนวน ${fi.n} คน)` : `อัตราค่านำหมาย ${svc.fee || '...'} บาท`;
    const base = c.type === 'civil' ? 'ประมวลกฎหมายวิธีพิจารณาความแพ่ง มาตรา 79' : 'ประมวลกฎหมายวิธีพิจารณาความแพ่ง มาตรา 79 ประกอบประมวลกฎหมายวิธีพิจารณาความอาญา มาตรา 15';
    out.push(`หากเจ้าพนักงานเดินหมายไปส่งแล้วไม่พบ${dfWord} หรือไม่มีผู้ใดยอมรับไว้แทน โจทก์ขอให้ศาลอนุญาตให้ส่งโดยวิธีปิดหมาย ณ ภูมิลำเนาของ${dfWord}ดังกล่าว ตาม${base} โดยมี${feePhrase} โจทก์จะเป็นผู้ชำระแก่ศาลตามระเบียบต่อไป`);
  }
  return out.join('\n\n');
}

// ---------- ประกอบชุดเอกสาร ----------
export const DOC_TYPES = [
  { key: 'complaint', label: 'คำฟ้อง (แบบ ๔)' },
  { key: 'prayer', label: 'คำขอท้ายคำฟ้อง (แบบ ๕/๖)' },
  { key: 'attachment', label: 'เอกสารแนบท้ายคำฟ้อง (รายละเอียดโจทก์/จำเลยหลายคน — สร้างเมื่อมีมากกว่าหนึ่งคน)' },
  { key: 'service', label: 'คำร้องส่งหมายนอกเขต / ปิดหมาย (แบบ ๗)' },
  { key: 'motions', label: 'คำร้อง / คำแถลง / คำขออื่น ๆ (แบบ ๗)' },
  { key: 'witness', label: 'บัญชีพยาน (แบบ ๑๕)' },
  { key: 'witnessSummons', label: 'หมายเรียกพยานบุคคล / เอกสาร / วัตถุ (แบบ ๑๖ · ๑๗ · ๑๘ — สร้างอัตโนมัติจากบัญชีพยาน ฉบับละพยาน)' },
  { key: 'attorney', label: 'ใบแต่งทนายความ (แบบ ๙)' },
  { key: 'proxy', label: 'ใบมอบอำนาจ (แบบ ๑๐)' },
  { key: 'summons', label: 'ร่างหมายนัดไต่สวนมูลฟ้อง (แบบ ๑๙ ตรี)' },
  { key: 'answer', label: 'คำให้การจำเลย (แบบ ๑๑)' },
  { key: 'settlement', label: 'สัญญาประนีประนอมยอมความ (แบบ ๒๙)' },
];

function deepDigits(o) {
  if (typeof o === 'string') return /@/.test(o) ? o : toThaiDigits(o);
  if (Array.isArray(o)) return o.map(deepDigits);
  if (o && typeof o === 'object') {
    const r = {};
    for (const k of Object.keys(o)) r[k] = k === 't' || k === 'kind' || k === 'id' ? o[k] : deepDigits(o[k]);
    return r;
  }
  return o;
}

export function buildDocuments(c, data, only) {
  setFormTextOverrides(data.formText);
  const idx = indexLaw(data);
  const want = (k) => (only ? only.includes(k) : c.docs[k]);
  const docs = [];
  if (want('complaint')) docs.push(complaintDoc(c, idx));
  if (want('prayer')) docs.push(prayerDoc(c, idx));
  if (want('attachment')) { const at = attachmentDoc(c); if (at) docs.push(at); }
  if (want('service')) { const sv = serviceDoc(c, data, idx); if (sv) docs.push(sv); }
  if (want('motions')) c.motions.forEach((m, i) => docs.push(motionDoc(c, idx, m, i)));
  if (want('witness')) docs.push(witnessDoc(c, idx));
  // หมายเรียกพยาน: เปิดโดยปริยายเมื่อมีพยานที่ต้องเรียก (ปิดได้ด้วย docs.witnessSummons = false)
  if (only ? only.includes('witnessSummons') : c.docs.witnessSummons !== false) witnessSummonsPlan(c, !!only).forEach((g) => docs.push(witnessSummonsDoc(c, data, g)));
  if (want('summons') && c.type === 'criminal') {
    const df = defendants(c);
    if (df.length > 1) df.forEach((d) => docs.push(summonsDoc(c, idx, data, d)));
    else docs.push(summonsDoc(c, idx, data));
  }
  if (want('attorney')) docs.push(attorneyDoc(c, idx));
  if (want('proxy')) docs.push(proxyDoc(c, idx));
  if (want('answer')) { const a = answerDoc(c, idx); if (a) docs.push(a); }
  if (want('settlement')) docs.push(settlementDoc(c, idx));
  const clean = docs.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.runs ? { ...b, runs: b.runs.filter(Boolean) } : b)) }));
  return c.options?.thaiDigits === false ? clean : clean.map(deepDigits);
}

