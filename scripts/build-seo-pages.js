// สร้างหน้าข้อมูลกฎหมายแบบ HTML สถิต (ให้เสิร์ชเอนจินอ่านได้โดยไม่ต้องรัน JS) ลง dist/
//   /jurisdiction/ + /jurisdiction/<จังหวัด>/   เขตอำนาจศาล
//   /laws/ + /laws/<กฎหมาย>/ + /laws/<id ข้อหา>/   ข้อกฎหมาย (มาตรา โทษ อายุความ)
//   /procedure/ + /procedure/<id>/              ขั้นตอนฟ้องคดี / วิธีพิจารณาความ
//   /precedents/                                  ฎีกา — ฮับ+ค้นหา (ข้อมูลทั้งหมดอยู่ที่ Aiven ผ่าน api/precedents.js); หน้าเฉพาะต่อฎีกาเติมตอนเปิดโดย api/precedent.js จากแม่แบบ dist/_px/precedent.html
// ข้อมูลมาจาก data/*.json ล้วน ๆ (ไม่ดึงข้อมูลจากเว็บ ไม่แต่งตัวบท) · เรียกจาก scripts/build-static.js ก่อนรวม CSS/ใส่เวอร์ชันไฟล์
// ผลลัพธ์: dist/seo-urls.json (ให้ api/sitemap.js นำไปใส่ sitemap) + แทนที่ <!--SEO-HEAD--> / <!--SEO-DIRECTORY--> ใน dist/index.html
import fs from 'node:fs';
import path from 'node:path';
import { loadData, loadArticles } from '../server/load-data.js';
import { esc, one, plain, trunc, fit, loadChrome, makeTemplate } from './seo-template.js';
import { JURISDICTION_RULES as RULES } from '../public/site/jurisdiction-rules.js';
import { applyProcedureEdits } from '../shared/procedure-merge.js';

const BRAND = ' | Law Craft';
const MIN_MAIN_TEXT = 300; // หน้าที่ข้อความหลักสั้นกว่านี้ถือว่าบาง → ไม่เผยแพร่
const MIN_DATA = { item: 120, proc: 90 }; // ข้อความจากข้อมูลจริงขั้นต่ำ (ไม่นับข้อความแม่แบบ)
const DISCLAIMER = 'ข้อมูลเพื่อการศึกษา ไม่ใช่คำปรึกษาทางกฎหมาย และไม่รับประกันผลของคดี กฎหมายอาจถูกแก้ไขภายหลัง ควรตรวจกับตัวบทฉบับปัจจุบันและปรึกษาทนายความก่อนดำเนินคดี';

// ชื่อจังหวัด → slug ภาษาอังกฤษ (ราชบัณฑิตยสภา/ชื่อที่ใช้ทั่วไป) ใช้ใน URL แทนอักษรไทยที่ถูก percent-encode
const PROV_SLUG = {
  'กรุงเทพมหานคร': 'bangkok', 'สมุทรปราการ': 'samut-prakan', 'นนทบุรี': 'nonthaburi', 'ปทุมธานี': 'pathum-thani', 'พระนครศรีอยุธยา': 'phra-nakhon-si-ayutthaya',
  'อ่างทอง': 'ang-thong', 'ลพบุรี': 'lopburi', 'สิงห์บุรี': 'sing-buri', 'ชัยนาท': 'chai-nat', 'สระบุรี': 'saraburi', 'ชลบุรี': 'chonburi', 'ระยอง': 'rayong',
  'จันทบุรี': 'chanthaburi', 'ตราด': 'trat', 'ฉะเชิงเทรา': 'chachoengsao', 'ปราจีนบุรี': 'prachinburi', 'นครนายก': 'nakhon-nayok', 'สระแก้ว': 'sa-kaeo',
  'นครราชสีมา': 'nakhon-ratchasima', 'บุรีรัมย์': 'buriram', 'สุรินทร์': 'surin', 'ศรีสะเกษ': 'si-sa-ket', 'อุบลราชธานี': 'ubon-ratchathani', 'ยโสธร': 'yasothon',
  'ชัยภูมิ': 'chaiyaphum', 'อำนาจเจริญ': 'amnat-charoen', 'หนองบัวลำภู': 'nong-bua-lamphu', 'ขอนแก่น': 'khon-kaen', 'อุดรธานี': 'udon-thani', 'เลย': 'loei',
  'หนองคาย': 'nong-khai', 'มหาสารคาม': 'maha-sarakham', 'ร้อยเอ็ด': 'roi-et', 'กาฬสินธุ์': 'kalasin', 'สกลนคร': 'sakon-nakhon', 'นครพนม': 'nakhon-phanom',
  'มุกดาหาร': 'mukdahan', 'เชียงใหม่': 'chiang-mai', 'ลำพูน': 'lamphun', 'ลำปาง': 'lampang', 'อุตรดิตถ์': 'uttaradit', 'แพร่': 'phrae', 'น่าน': 'nan',
  'พะเยา': 'phayao', 'เชียงราย': 'chiang-rai', 'แม่ฮ่องสอน': 'mae-hong-son', 'นครสวรรค์': 'nakhon-sawan', 'อุทัยธานี': 'uthai-thani', 'กำแพงเพชร': 'kamphaeng-phet',
  'ตาก': 'tak', 'สุโขทัย': 'sukhothai', 'พิษณุโลก': 'phitsanulok', 'พิจิตร': 'phichit', 'เพชรบูรณ์': 'phetchabun', 'ราชบุรี': 'ratchaburi', 'กาญจนบุรี': 'kanchanaburi',
  'สุพรรณบุรี': 'suphan-buri', 'นครปฐม': 'nakhon-pathom', 'สมุทรสาคร': 'samut-sakhon', 'สมุทรสงคราม': 'samut-songkhram', 'เพชรบุรี': 'phetchaburi',
  'ประจวบคีรีขันธ์': 'prachuap-khiri-khan', 'นครศรีธรรมราช': 'nakhon-si-thammarat', 'กระบี่': 'krabi', 'พังงา': 'phang-nga', 'ภูเก็ต': 'phuket',
  'สุราษฎร์ธานี': 'surat-thani', 'ระนอง': 'ranong', 'ชุมพร': 'chumphon', 'สงขลา': 'songkhla', 'สตูล': 'satun', 'ตรัง': 'trang', 'พัทลุง': 'phatthalung',
  'ปัตตานี': 'pattani', 'ยะลา': 'yala', 'นราธิวาส': 'narathiwat', 'บึงกาฬ': 'bueng-kan',
};

// หลักเลือกศาล — แหล่งเดียวกับเครื่องมือบนหน้าแรก/หน้าเขตอำนาจศาล (public/site/jurisdiction-rules.js)
const DOC_LABEL = {
  'complaint-criminal': 'คำฟ้องคดีอาญา', 'prayer-criminal': 'คำขอท้ายฟ้องคดีอาญา', 'complaint-civil': 'คำฟ้องคดีแพ่ง', 'prayer-civil': 'คำขอท้ายฟ้องคดีแพ่ง',
  'motion': 'คำร้อง/คำแถลง', 'power-of-attorney': 'ใบแต่งทนายความ/หนังสือมอบอำนาจ', 'summons-service': 'การส่งหมาย', 'witness-list': 'บัญชีระบุพยาน',
};
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const thaiDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${+m[1] + 543}` : ''; };

const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const secParts = (s) => String(s).split(/[^0-9]+/).filter(Boolean).map(Number);
const cmpSec = (a, b) => { const x = secParts(a), y = secParts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? -1) - (y[i] ?? -1); if (d) return d; } return String(a).localeCompare(String(b), 'th'); };
const normSec = (s) => String(s).replace(/\s+/g, '').replace(/[()]/g, (c) => c);
const cleanLaw = (n) => one(String(n).replace(/\s*\([^)]*\)/g, ''));
const fmt = (n) => Number(n).toLocaleString('th-TH');
const THAI = '\\u0E00-\\u0E7F';
const nameHasProv = (n, p) => new RegExp(`${p}(?![${THAI}])`).test(n);
const isHttp = (u) => /^https?:\/\//i.test(u || '');
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

export async function buildSeoPages({ root, dist, site }) {
  const t0 = Date.now();
  const D = loadData();
  // ขั้นตอนฟ้องคดี/ค่าธรรมเนียม/มาตราวิธีพิจารณาที่แอดมินแก้จากหลังบ้าน (law_data key 'content-procedure', anon อ่านได้) — อ่านไม่ได้/SEO_OFFLINE=1 = ใช้ data/procedure.json ล้วน
  if (process.env.SEO_OFFLINE !== '1') {
    try {
      const { url, anonKey } = (await import('../public/js/config.js')).default.supabase || {};
      if (url && anonKey) {
        const r = await fetch(`${url}/rest/v1/law_data?select=data&key=eq.content-procedure`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, signal: AbortSignal.timeout(6000) });
        const edits = r.ok ? (await r.json())[0]?.data : null;
        if (edits && typeof edits === 'object') { D.procedure = applyProcedureEdits(D.procedure, edits); console.log('หน้า SEO: ใช้ข้อมูลขั้นตอน/วิธีพิจารณาที่แก้จากหลังบ้าน'); }
      }
    } catch (e) { console.warn('หน้า SEO: อ่านข้อมูลขั้นตอนที่แก้จากหลังบ้านไม่ได้ ใช้ข้อมูลต้นฉบับ —', e.message || e); }
  }
  const articles = loadArticles();
  const chrome = await loadChrome(root);
  const T = makeTemplate({ site, chrome });

  // ---------- CSS รวมไฟล์เดียวสำหรับทุกหน้า SEO (ไม่สร้างสำเนาต่อหน้า) ----------
  {
    const rd = (f) => fs.readFileSync(path.join(dist, f), 'utf8').replace(/^﻿/, '').replace(/\/\*# sourceMappingURL=.*?\*\//g, '');
    fs.mkdirSync(path.join(dist, 'css'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'css', 'bundle-seo.css'), ['site/site.css', 'css/smooth.css', 'site/seo.css'].map(rd).join('\n'));
  }

  // ---------- ข้อมูลพื้นฐาน ----------
  const lawById = new Map(D.laws.map((l) => [l.id, l]));
  const lawShort = (id) => lawById.get(id)?.short || id;
  const lawName = (id) => lawById.get(id)?.name || id;
  const lawClean = (id) => cleanLaw(lawName(id));

  const usedSlug = new Set();
  const uniq = (base, tag) => { let s = base || tag, n = 2; while (usedSlug.has(tag + '/' + s)) s = `${base}-${n++}`; usedSlug.add(tag + '/' + s); return s; };

  const items = D.items.filter((i) => i.id && i.section != null && String(i.section).trim() && i.name)
    .map((i) => ({ ...i, section: String(i.section).trim(), slug: uniq(slugOf(i.id), 'item') }));
  const itemById = new Map(items.map((i) => [i.id, i]));
  const itemsByLaw = new Map();
  for (const it of items) { if (!itemsByLaw.has(it.lawId)) itemsByLaw.set(it.lawId, []); itemsByLaw.get(it.lawId).push(it); }
  for (const arr of itemsByLaw.values()) arr.sort((a, b) => cmpSec(a.section, b.section));
  const lawIds = [...itemsByLaw.keys()];
  if (lawIds.some((l) => itemById.has(l))) throw new Error('seo: รหัสกฎหมายชนกับรหัสข้อหา');
  const lawSlug = new Map(lawIds.map((l) => [l, slugOf(l)]));

  const procSections = (D.procedure.sections || []).filter((s) => s.id && s.section != null && s.title)
    .map((s) => ({ ...s, section: String(s.section), slug: uniq(slugOf(s.id), 'proc') }));
  const procById = new Map(procSections.map((s) => [s.id, s]));
  const procLawOrder = ['pvor', 'pvpe', 'pc', 'cc'];
  const procLaws = D.procedure.laws || [];
  const procLawRank = (id) => { const i = procLawOrder.indexOf(id); return i < 0 ? 99 : i; };
  procSections.sort((a, b) => procLawRank(a.law) - procLawRank(b.law) || String(a.law).localeCompare(String(b.law)) || cmpSec(a.section, b.section));
  const procByLaw = new Map();
  for (const s of procSections) { if (!procByLaw.has(s.law)) procByLaw.set(s.law, []); procByLaw.get(s.law).push(s); }

  // ฎีกา: ไม่ใช้ข้อมูลที่เก็บใน Supabase/data อีกแล้ว — ฎีกาทั้งหมดอยู่ที่ฐาน Aiven (ค้นหา+หน้าเฉพาะต่อฎีกา: api/precedents.js, api/precedent.js)

  // บทความ ↔ ข้อหา
  const artsByItem = new Map();
  const artFreq = new Map();
  for (const a of articles) for (const id of a.relatedItems || []) {
    if (!artsByItem.has(id)) artsByItem.set(id, []);
    artsByItem.get(id).push(a); artFreq.set(id, (artFreq.get(id) || 0) + 1);
  }

  // อ้างอิง "ป.อ. มาตรา 328" → หน้าข้อหา/มาตราวิธีพิจารณา
  const refIndex = new Map();
  for (const it of items) refIndex.set(`${lawShort(it.lawId)}|${normSec(it.section)}`, `/laws/${it.slug}/`);
  for (const s of procSections) { const k = `${(procLaws.find((l) => l.id === s.law) || lawById.get(s.law) || {}).short || s.law}|${normSec(s.section)}`; if (!refIndex.has(k)) refIndex.set(k, `/procedure/${s.slug}/`); }
  const resolveRef = (ref) => { const m = /^(.+?)\s*มาตรา\s*(.+)$/.exec(one(ref)); return m ? refIndex.get(`${m[1].trim()}|${normSec(m[2])}`) : null; };

  const DATA_DATE = [D.procedure.meta?.checkedOn, D.courts.fetchedAt, D.jurisdiction?.fetchedAt].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '')).sort().pop() || new Date().toISOString().slice(0, 10);
  const JUR_DATE = /^\d{4}-\d{2}-\d{2}$/.test(D.jurisdiction?.fetchedAt || '') ? D.jurisdiction.fetchedAt : DATA_DATE;

  // ---------- เขตอำนาจศาล: เตรียมข้อมูลรายจังหวัด ----------
  const geo = JSON.parse(fs.readFileSync(path.join(root, 'data', 'geo.json'), 'utf8').replace(/^﻿/, ''));
  const jurP = D.jurisdiction?.provinces || {};
  const allCourtsFlat = (D.courts.groups || []).flatMap((g) => (g.courts || []).map((c) => ({ ...c, group: g.group || '', gverified: g.verified })));
  const regionGroups = (D.courts.groups || []).filter((g) => /^ศาลชั้นต้น - ภาค \d/.test(g.group));
  const catOf = (c) => (c.type === 'appeal' ? 'appeal' : c.type === 'juvenile' ? 'juv' : c.type === 'specialized' ? 'spec' : (/^ศาลแขวง/.test(c.name) || c.magistrate) ? 'mag' : 'main');
  const CAT_LABEL = { main: 'ศาลชั้นต้น', mag: 'ศาลแขวง', juv: 'ศาลเยาวชนและครอบครัว', spec: 'ศาลชำนัญพิเศษ', appeal: 'ศาลอุทธรณ์' };
  const CAT_ORDER = ['main', 'mag', 'juv', 'spec', 'appeal'];
  const scopeTag = (c) => (c.scope === 'criminal' ? 'อาญา' : c.scope === 'civil' ? 'แพ่ง' : '');

  const provs = geo.provinces.map((gp, idx) => {
    const bkk = gp.kind === 'bkk';
    const slug = PROV_SLUG[gp.name] || `p${idx + 1}`;
    if (!PROV_SLUG[gp.name]) console.warn(`seo: ไม่มี slug อังกฤษของจังหวัด ${gp.name} ใช้ ${slug}`);
    const jp = jurP[gp.name] || { districts: {}, default: [] };
    const dNames = Object.keys(jp.districts || {}).sort((a, b) => a.localeCompare(b, 'th'));
    const W = bkk ? { d: 'เขต', s: 'แขวง' } : { d: 'อำเภอ', s: 'ตำบล' };
    const where = bkk ? gp.name : `จังหวัด${gp.name}`;
    const dir = new Map(); // ชื่อศาล → ข้อมูลรวม
    const rows = dNames.map((dn) => {
      const cs = jp.districts[dn] || [];
      const by = { main: [], mag: [], juv: [] };
      for (const c of cs) {
        const cat = catOf(c);
        let e = dir.get(c.name);
        if (!e) { e = { name: c.name, phone: c.phone || '', cat, scope: c.scope, verified: c.verified, districts: new Set() }; dir.set(c.name, e); }
        e.districts.add(dn);
        if (by[cat] && !by[cat].some((x) => x.name === c.name)) by[cat].push(c);
      }
      return { name: dn, ...by };
    });
    const dirList = [...dir.values()].sort((a, b) => CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat) || a.name.localeCompare(b.name, 'th'));
    // ศาลอื่นในจังหวัดจากรายชื่อศาลทั่วประเทศ (courts.json) ที่ยังไม่อยู่ในข้อมูลรายอำเภอ
    const inProv = (c) => (bkk ? /กรุงเทพมหานคร/.test(c.group) : nameHasProv(c.name, gp.name));
    const extra = allCourtsFlat.filter((c) => c.scope !== 'appeal' && inProv(c) && !dir.has(c.name));
    const region = bkk ? 'กรุงเทพมหานคร' : (regionGroups.find((g) => g.courts.some((c) => nameHasProv(c.name, gp.name)))?.group.replace(/^ศาลชั้นต้น - /, '') || '');
    const defNames = (jp.default || []).map((c) => c.name);
    return { name: gp.name, slug, bkk, W, where, rows, dirList, extra, region, defNames, nDist: rows.length, geoDistricts: gp.districts.length };
  });
  const provSlugSet = new Set(provs.map((p) => p.slug));
  if (provSlugSet.size !== provs.length) throw new Error('seo: slug จังหวัดซ้ำ');
  const regionsOrder = ['กรุงเทพมหานคร', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `ภาค ${n}`)];
  const provsNoRegion = provs.filter((p) => !p.region);
  if (provsNoRegion.length) console.warn(`seo: จังหวัดที่หาภาคของศาลไม่ได้ ${provsNoRegion.length}: ${provsNoRegion.map((p) => p.name).join(', ')}`);

  // ---------- ตัวช่วยประกอบหน้า ----------
  const badgeV = (v) => (v === false ? '<span class="badge pending">ยังไม่ผ่านการตรวจกับแหล่งทางการ</span>' : '<span class="badge ok">✓ ตรวจกับแหล่งอ้างอิงแล้ว</span>');
  const srcHtml = (s) => (!s ? '' : isHttp(s) ? `<a href="${esc(s)}" target="_blank" rel="noopener nofollow">${esc(host(s))}</a>` : esc(trunc(s, 400)));
  const noteEdu = `<div class="note"><p><b>ข้อมูลเพื่อการศึกษา ไม่ใช่คำปรึกษา</b> — ${esc(DISCLAIMER)}</p></div>`;
  const ctaBox = (title, text, buttons) => `<aside class="sp-cta" aria-label="${esc(title)}"><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div><div class="btns">${buttons}</div></aside>`;
  const btn = (href, label, cls = 'light') => `<a class="btn-pill ${cls} sm" href="${href}">${esc(label)}</a>`;
  const qaHtml = (faq) => `<div class="qa">${faq.map(([q, a]) => `<div><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join('')}</div>`;
  const kindTag = (k) => `<span class="tag ${k === 'civil' ? 'civil' : 'crim'}">${k === 'civil' ? 'คดีแพ่ง' : 'คดีอาญา'}</span>`;

  // ====================================================================================
  // สร้างทุกหน้า (exists = ชุดพาธที่ยังเผยแพร่ ใช้ตัดสินว่าลิงก์ไหนทำเป็นลิงก์ได้)
  // ====================================================================================
  function buildAll(exists) {
    const has = (p) => exists.has(p);
    const A = (p, html, cls = '') => (has(p) ? `<a${cls ? ` class="${cls}"` : ''} href="${p}">${html}</a>` : html);
    const pages = [];
    const add = (p) => { pages.push(p); return p; };

    // ---------------- ข้อกฎหมาย: หน้าข้อหา/มาตรา ----------------
    const itemPath = (it) => `/laws/${it.slug}/`;
    for (const it of items) {
      const crim = it.kind !== 'civil';
      const short = lawShort(it.lawId), lname = lawClean(it.lawId);
      const pathI = itemPath(it);
      const nameNoPre = it.name;
      const h1 = crim ? `${/^(ความผิด|ฐาน)/.test(nameNoPre) ? '' : 'ความผิดฐาน'}${nameNoPre} มาตรา ${it.section} ${lname}` : `${nameNoPre} มาตรา ${it.section} ${lname}`;
      const title = fit(60,
        `${nameNoPre} มาตรา ${it.section} ${short} ${crim ? 'โทษ อายุความ' : 'อายุความ'}${BRAND}`,
        `${nameNoPre} มาตรา ${it.section} ${short} ${crim ? 'โทษ อายุความ' : 'อายุความ'}`,
        `${nameNoPre} มาตรา ${it.section} ${short}`, `${trunc(nameNoPre, 40)} ม.${it.section} ${short}`);
      const descParts = [`มาตรา ${it.section} ${short} ${nameNoPre}:`];
      if (crim && it.penalty) descParts.push(`ระวางโทษ ${it.penalty}.`); else if (it.text) descParts.push(`${one(it.text)}`);
      if (it.limitation) descParts.push(`อายุความ ${one(it.limitation)}`);
      const description = trunc(descParts.join(' '), 155);

      const rel = [];
      for (const r of it.relatedSections || []) {
        const ref = typeof r === 'string' ? r : r.ref, why = typeof r === 'string' ? '' : r.why;
        if (!ref) continue;
        const to = resolveRef(ref);
        rel.push(`<li>${to && has(to) ? `<a href="${to}">${esc(ref)}</a>` : esc(ref)}${why ? ` — ${esc(why)}` : ''}</li>`);
      }
      const artL = artsByItem.get(it.id) || [];
      const lawArr = itemsByLaw.get(it.lawId) || [];
      const pos = lawArr.indexOf(it);
      const prev = lawArr[pos - 1], next = lawArr[pos + 1];
      const sameCat = lawArr.filter((x) => x !== it && x.category && x.category === it.category && has(itemPath(x))).slice(0, 8);
      const lawPath = `/laws/${lawSlug.get(it.lawId)}/`;

      const faq = [];
      if (crim && it.penalty) faq.push([`ความผิดฐาน${nameNoPre} (มาตรา ${it.section} ${short}) มีระวางโทษอย่างไร?`, `ระวางโทษตามข้อมูลของเว็บไซต์: ${one(it.penalty)}`]);
      if (it.limitation) faq.push([`${nameNoPre} (มาตรา ${it.section} ${short}) มีอายุความกี่ปี?`, one(it.limitation)]);
      let privTxt = '';
      if (crim && typeof it.privateOffence === 'boolean') {
        privTxt = it.privateOffence
          ? 'เป็นความผิดต่อส่วนตัว ผู้เสียหายต้องร้องทุกข์หรือฟ้องภายใน 3 เดือนนับแต่รู้เรื่องความผิดและรู้ตัวผู้กระทำผิด (ป.อ. มาตรา 96)'
          : 'ตามข้อมูลของเว็บไซต์ ไม่จัดเป็นความผิดต่อส่วนตัว จึงไม่ติดกำหนดร้องทุกข์ 3 เดือนตามป.อ. มาตรา 96';
        if (typeof it.compoundable === 'boolean') privTxt += it.compoundable ? ' และเป็นความผิดที่ยอมความได้' : ' และไม่จัดเป็นความผิดที่ยอมความได้';
        privTxt += ' (ตรวจกับตัวบทฉบับปัจจุบันก่อนดำเนินการ)';
        faq.push([`${nameNoPre} เป็นความผิดต่อส่วนตัวและยอมความได้หรือไม่?`, privTxt]);
      }

      const facts = [['ประเภทคดี', crim ? 'คดีอาญา' : 'คดีแพ่ง'], ['กฎหมาย', has(lawPath) ? `<a href="${lawPath}">${esc(lawName(it.lawId))}</a>` : esc(lawName(it.lawId)), true], ['มาตรา', `${it.section} (${short})`]];
      if (it.category) facts.push(['หมวด', it.category]);
      if (it.claimType) facts.push(['ประเภทคำขอ', it.claimType]);
      const factsHtml = `<dl class="facts">${facts.map(([k, v, raw]) => `<dt>${esc(k)}</dt><dd>${raw ? v : esc(v)}</dd>`).join('')}</dl>`;

      const civilExtra = (!crim && (it.interest || it.courtFeeNote || it.prerequisites?.length || it.evidenceChecklist?.length)) ? `
    <h2>ข้อมูลประกอบการฟ้องคดีแพ่ง</h2>
    ${it.prerequisites?.length ? `<h3>ก่อนฟ้องต้องทำอะไร</h3><ul>${it.prerequisites.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${it.evidenceChecklist?.length ? `<h3>หลักฐานที่ควรมี</h3><ul>${it.evidenceChecklist.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${it.interest ? `<h3>ดอกเบี้ย</h3><p>${esc(it.interest)}</p>` : ''}
    ${it.courtFeeNote ? `<h3>ค่าขึ้นศาล</h3><p>${esc(it.courtFeeNote)}</p>` : ''}` : '';

      const main = `
    <p class="sp-eyebrow">${kindTag(it.kind)} <span>${esc(lname)}</span> ${badgeV(it.verified)}</p>
    <h1>${esc(h1)}</h1>
    <p class="sp-lead">มาตรา ${esc(it.section)} ${esc(lname)} ว่าด้วย${esc(nameNoPre)}${it.category ? ` อยู่ในหมวด “${esc(it.category)}”` : ''} — สรุปตัวบท องค์ประกอบ ${crim ? 'ระวางโทษ ' : ''}อายุความ${crim ? ' และข้อควรรู้เรื่องความผิดต่อส่วนตัว/การยอมความ' : ''}</p>
    ${it.verified === false ? '<div class="note warn"><p><b>ยังไม่ผ่านการตรวจกับแหล่งทางการ</b> — ข้อมูลของมาตรานี้ยังไม่ได้ตรวจเทียบกับตัวบทฉบับทางการ โปรดตรวจสอบเลขมาตรา ตัวบท และอัตราโทษก่อนนำไปใช้</p></div>' : ''}
    ${factsHtml}
    ${it.text ? `<h2>ตัวบทหรือสรุปสาระของมาตรา ${esc(it.section)}</h2><p class="sp-hl">${esc(it.text)}</p>` : ''}
    ${it.elements?.length ? `<h2>${crim ? 'องค์ประกอบความผิด' : 'องค์ประกอบของมูลคดี'}</h2><ol>${it.elements.map((e) => `<li>${esc(e)}</li>`).join('')}</ol>` : ''}
    ${crim && it.penalty ? `<h2>ระวางโทษ</h2><p>${esc(it.penalty)}</p>` : ''}
    ${it.limitation ? `<h2>อายุความ</h2><p>${esc(it.limitation)}</p>` : ''}
    ${privTxt ? `<h2>ความผิดต่อส่วนตัวและการยอมความ</h2><p>${esc(privTxt)}</p>` : ''}
    ${civilExtra}
    ${it.caution ? `<h2>ข้อควรระวัง</h2><div class="note warn"><p>${esc(it.caution)}</p></div>` : ''}
    ${rel.length ? `<h2>มาตราที่เกี่ยวข้อง</h2><ul>${rel.join('')}</ul>` : ''}
    ${artL.length ? `<h2>บทความที่เกี่ยวข้อง</h2><ul>${artL.map((a) => `<li><a href="/articles/?a=${esc(a.slug)}">${esc(a.title)}</a></li>`).join('')}</ul>` : ''}
    <h2>แหล่งอ้างอิงและสถานะการตรวจ</h2>
    <p class="sp-src">${badgeV(it.verified)}${it.source ? ` · แหล่งอ้างอิง: ${srcHtml(it.source)}` : ''}</p>
    ${faq.length ? `<h2>คำถามที่พบบ่อย</h2>${qaHtml(faq)}` : ''}
    ${ctaBox('ร่างคำฟ้องข้อหานี้', `เลือกข้อหา “${nameNoPre}” แล้วให้ระบบเติมตัวบท ระวางโทษ และร่างข้อเท็จจริงให้ตามแบบพิมพ์ศาลยุติธรรม (ต้องเข้าสู่ระบบ)`, `${btn(`/workspace/new/${crim ? 'criminal' : 'civil'}?charge=${encodeURIComponent(it.id)}`, 'ร่างคำฟ้องข้อหานี้')}${btn('/#library', 'ค้นหามาตราอื่น', 'ghost')}`)}
    ${prev || next ? `<nav class="sp-prevnext" aria-label="มาตราก่อนหน้าและถัดไป">${prev && has(itemPath(prev)) ? `<a href="${itemPath(prev)}"><small>‹ มาตราก่อนหน้า</small>มาตรา ${esc(prev.section)} ${esc(trunc(prev.name, 50))}</a>` : ''}${next && has(itemPath(next)) ? `<a href="${itemPath(next)}"><small>มาตราถัดไป ›</small>มาตรา ${esc(next.section)} ${esc(trunc(next.name, 50))}</a>` : ''}</nav>` : ''}
    ${sameCat.length ? `<h2>ข้อหาใกล้เคียงในหมวดเดียวกัน</h2><ul class="sp-links">${sameCat.map((x) => `<li><a href="${itemPath(x)}"><b>ม.${esc(x.section)}</b><span>${esc(trunc(x.name, 70))}</span></a></li>`).join('')}</ul>` : ''}
    ${noteEdu}`;
      const crumbs = [['ข้อกฎหมาย', '/laws/']];
      if (has(lawPath)) crumbs.push([short, lawPath]);
      crumbs.push([`มาตรา ${it.section} ${trunc(nameNoPre, 30)}`, pathI]);
      const dataLen = [it.text, (it.elements || []).join(' '), it.penalty, it.limitation, it.caution, it.interest, it.courtFeeNote, (it.prerequisites || []).join(' '), (it.evidenceChecklist || []).join(' ')].map((x) => one(x).length).reduce((a, b) => a + b, 0);
      add({ type: 'item', path: pathI, title, description, crumbs, nav: 'laws', main, faq, dataLen, lastmod: DATA_DATE, priority: artFreq.has(it.id) ? '0.7' : '0.6' });
    }

    // ---------------- ข้อกฎหมาย: หน้ากฎหมายแต่ละฉบับ ----------------
    for (const lid of lawIds) {
      const arr = itemsByLaw.get(lid), law = lawById.get(lid) || {};
      const lp = `/laws/${lawSlug.get(lid)}/`;
      const crimN = arr.filter((i) => i.kind !== 'civil').length;
      const kindWord = crimN === arr.length ? 'ความผิดและระวางโทษ' : crimN === 0 ? 'มูลคดีและอายุความ' : 'ความผิด มูลคดี และอายุความ';
      const verifiedN = arr.filter((i) => i.verified !== false).length;
      const cats = [];
      for (const it of arr) { const c = it.category || 'อื่น ๆ'; let g = cats.find((x) => x.c === c); if (!g) { g = { c, list: [] }; cats.push(g); } g.list.push(it); }
      const crimLaw = crimN > 0;
      const tables = cats.map((g) => `<h2>${esc(g.c)}</h2>
    <div class="tw"><table><thead><tr><th scope="col">มาตรา</th><th scope="col">${crimLaw ? 'ฐานความผิด / มูลคดี' : 'มูลคดี'}</th><th scope="col">${crimLaw ? 'ระวางโทษ / ประเภทคำขอ' : 'ประเภทคำขอ'}</th><th scope="col">สถานะ</th></tr></thead><tbody>
${g.list.map((it) => `<tr><th scope="row" class="num">${esc(it.section)}</th><td>${A(itemPath(it), esc(it.name))}</td><td>${esc(trunc(it.kind === 'civil' ? (it.claimType || it.limitation || '') : (it.penalty || ''), 120)) || '—'}</td><td>${it.verified === false ? '<span class="badge pending">ยังไม่ตรวจกับแหล่งทางการ</span>' : '<span class="badge ok">✓ ตรวจแล้ว</span>'}${it.privateOffence ? ' <span class="badge">ความผิดต่อส่วนตัว</span>' : ''}</td></tr>`).join('\n')}
</tbody></table></div>`).join('\n');
      const title = fit(60, `${lawClean(lid)} มาตราและ${kindWord}${BRAND}`, `${lawClean(lid)} มาตรา${kindWord}`, `${lawClean(lid)} รายการมาตรา`, trunc(lawClean(lid), 58));
      const description = trunc(`รวม ${arr.length} มาตรา/ฐานความผิดจาก${lawClean(lid)}: ตัวบท องค์ประกอบ ${crimLaw ? 'ระวางโทษ ' : ''}อายุความ และข้อควรระวัง พร้อมลิงก์ไปยังแต่ละมาตรา`, 155);
      const main = `
    <p class="sp-eyebrow">${crimLaw ? kindTag('criminal') : ''}${arr.some((i) => i.kind === 'civil') ? kindTag('civil') : ''} <span>${esc(lawShort(lid))}</span></p>
    <h1>${esc(lawClean(lid))}: ${kindWord}</h1>
    <p class="sp-lead">รวบรวม ${fmt(arr.length)} มาตรา/ฐานความผิดจาก${esc(lawClean(lid))} (${esc(lawShort(lid))}) ที่ระบบร่างคำฟ้องของเรามีข้อมูล แต่ละรายการมีตัวบทหรือสรุปสาระ องค์ประกอบ ${crimLaw ? 'ระวางโทษ ' : ''}อายุความ และข้อควรระวัง — ตรวจกับแหล่งอ้างอิงแล้ว ${fmt(verifiedN)} จาก ${fmt(arr.length)} รายการ</p>
    ${verifiedN < arr.length ? `<div class="note warn"><p><b>มี ${fmt(arr.length - verifiedN)} รายการที่ยังไม่ผ่านการตรวจกับแหล่งทางการ</b> ระบุสถานะไว้ในตารางด้านล่างและในหน้าของแต่ละมาตรา</p></div>` : ''}
    ${law.note ? `<div class="note"><p><b>หมายเหตุเกี่ยวกับข้อมูลของกฎหมายฉบับนี้</b> — ${esc(law.note)}</p></div>` : ''}
    ${tables}
    ${ctaBox('ใช้ข้อหาเหล่านี้ร่างคำฟ้อง', 'เลือกข้อหาจากรายการ แล้วให้ระบบเติมตัวบทและร่างข้อเท็จจริงตามแบบพิมพ์ศาลยุติธรรม', `${btn('/workspace/', 'เข้าสู่ระบบร่างคำฟ้อง')}${btn('/laws/', 'ดูกฎหมายฉบับอื่น', 'ghost')}`)}
    ${noteEdu}`;
      add({ type: 'law', path: lp, title, description, crumbs: [['ข้อกฎหมาย', '/laws/'], [lawShort(lid), lp]], nav: 'laws', main, dataLen: arr.length * 60, lastmod: DATA_DATE, priority: '0.7' });
    }

    // ---------------- ข้อกฎหมาย: hub ----------------
    {
      const crimLaws = lawIds.filter((l) => itemsByLaw.get(l).some((i) => i.kind !== 'civil'));
      const civLaws = lawIds.filter((l) => !crimLaws.includes(l));
      const popular = [...artFreq.entries()].filter(([id]) => itemById.has(id)).sort((a, b) => b[1] - a[1] || cmpSec(itemById.get(a[0]).section, itemById.get(b[0]).section)).slice(0, 18).map(([id]) => itemById.get(id));
      const lawBlock = (lid) => {
        const arr = itemsByLaw.get(lid), lp = `/laws/${lawSlug.get(lid)}/`;
        return `<h3 id="law-${esc(lawSlug.get(lid))}">${A(lp, esc(lawClean(lid)))} <small class="fine">(${esc(lawShort(lid))} · ${fmt(arr.length)} มาตรา)</small></h3>
    <ul class="sp-links">${arr.map((it) => `<li>${A(itemPath(it), `<b>ม.${esc(it.section)}</b><span>${esc(trunc(it.name, 80))}</span>`)}</li>`).join('')}</ul>`;
      };
      const nVerified = items.filter((i) => i.verified !== false).length;
      const faq = [
        ['ข้อกฎหมายในเว็บไซต์นี้เชื่อถือได้แค่ไหน?', `ข้อมูลทุกรายการระบุแหล่งอ้างอิงและสถานะการตรวจไว้ ขณะนี้ตรวจกับแหล่งอ้างอิงแล้ว ${fmt(nVerified)} จาก ${fmt(items.length)} รายการ รายการที่ยังไม่ผ่านการตรวจจะแสดงป้ายเตือนชัดเจน ข้อมูลเป็นการสรุปเพื่อการศึกษา ควรตรวจกับตัวบทฉบับปัจจุบันของสำนักงานคณะกรรมการกฤษฎีกาและปรึกษาทนายความก่อนดำเนินคดี`],
        ['ความผิดต่อส่วนตัวต่างจากความผิดอาญาทั่วไปอย่างไร?', 'ความผิดต่อส่วนตัว เช่น หมิ่นประมาทและฉ้อโกงทั่วไป ผู้เสียหายต้องร้องทุกข์หรือฟ้องภายใน 3 เดือนนับแต่รู้เรื่องความผิดและรู้ตัวผู้กระทำผิด (ป.อ. มาตรา 96) ในหน้าของแต่ละมาตราเรามีระบุว่าข้อหานั้นเป็นความผิดต่อส่วนตัวหรือไม่'],
      ];
      const main = `
    <p class="sp-eyebrow">ฐานข้อมูลกฎหมาย</p>
    <h1>ข้อกฎหมายไทย: มาตรา ระวางโทษ อายุความ</h1>
    <p class="sp-lead">รวม ${fmt(items.length)} มาตราและมูลคดีจาก ${fmt(lawIds.length)} ฉบับ ทั้งคดีอาญา (ประมวลกฎหมายอาญาและกฎหมายพิเศษ) และคดีแพ่ง (ประมวลกฎหมายแพ่งและพาณิชย์และกฎหมายเฉพาะ) แต่ละมาตรามีตัวบทหรือสรุปสาระ องค์ประกอบ ระวางโทษ อายุความ และสถานะการตรวจกับแหล่งอ้างอิง</p>
    <p class="sp-bar"><a class="link-arrow" href="/#library">ค้นหามาตราแบบโต้ตอบ</a><a class="link-arrow" href="/jurisdiction/">ตรวจเขตอำนาจศาล</a><a class="link-arrow" href="/procedure/">ขั้นตอนฟ้องคดี</a></p>
    ${noteEdu}
    ${popular.length ? `<h2>ข้อหาที่ค้นหาบ่อย</h2><ul class="sp-links">${popular.map((it) => `<li>${A(itemPath(it), `<b>ม.${esc(it.section)}</b><span>${esc(trunc(it.name, 70))} <small class="fine">${esc(lawShort(it.lawId))}</small></span>`)}</li>`).join('')}</ul>` : ''}
    <h2>กฎหมายอาญา</h2>
    <p>ความผิดตามประมวลกฎหมายอาญาและกฎหมายพิเศษ ${fmt(crimLaws.reduce((n, l) => n + itemsByLaw.get(l).length, 0))} มาตรา — เลือกฉบับเพื่อดูตารางสรุป หรือเลือกมาตราจากรายการ</p>
    ${crimLaws.map(lawBlock).join('\n')}
    <h2>กฎหมายแพ่งและมูลคดีแพ่ง</h2>
    <p>มูลคดีตามประมวลกฎหมายแพ่งและพาณิชย์และกฎหมายแพ่งเฉพาะเรื่อง ${fmt(civLaws.reduce((n, l) => n + itemsByLaw.get(l).length, 0))} มาตรา</p>
    ${civLaws.map(lawBlock).join('\n')}
    <h2>คำถามที่พบบ่อย</h2>
    ${qaHtml(faq)}
    ${ctaBox('ต้องการร่างคำฟ้อง?', 'เลือกข้อหาจากรายการ ที่เหลือระบบเติมให้ตามแบบพิมพ์ศาลยุติธรรม', `${btn('/workspace/', 'เข้าสู่ระบบร่างคำฟ้อง')}${btn('/contact/', 'ติดต่อปรึกษา', 'ghost')}`)}`;
      add({
        type: 'hub', path: '/laws/', title: fit(60, `ข้อกฎหมายไทย มาตรา ระวางโทษ อายุความ${BRAND}`, 'ข้อกฎหมายไทย มาตรา ระวางโทษ อายุความ'),
        description: trunc(`ค้นข้อกฎหมายไทย ${fmt(items.length)} มาตรา ทั้งคดีอาญาและคดีแพ่ง: ตัวบท องค์ประกอบ ระวางโทษ อายุความ ความผิดต่อส่วนตัว พร้อมสถานะการตรวจแหล่งอ้างอิง`, 155),
        crumbs: [['ข้อกฎหมาย', '/laws/']], nav: 'laws', main, faq, lastmod: DATA_DATE, priority: '0.9'
      });
    }

    // ---------------- ขั้นตอนฟ้องคดี ----------------
    const procPath = (s) => `/procedure/${s.slug}/`;
    for (const s of procSections) {
      const pl = procLaws.find((l) => l.id === s.law) || lawById.get(s.law) || {};
      const short = pl.short || s.law, lname = cleanLaw(pl.name || s.law);
      const pp = procPath(s);
      const arr = procByLaw.get(s.law) || [];
      const pos = arr.indexOf(s), prev = arr[pos - 1], next = arr[pos + 1];
      const itemTwin = itemById.get(s.id) && itemById.get(s.id).section === s.section ? itemById.get(s.id) : null;
      const title = fit(60, `มาตรา ${s.section} ${short} ${s.title}${BRAND}`, `มาตรา ${s.section} ${short} ${s.title}`, `ม.${s.section} ${short} ${trunc(s.title, 40)}`);
      const description = trunc(`มาตรา ${s.section} ${short} ${s.title}: ${one(s.summary)}`, 155);
      const used = (s.usedIn || []).map((d) => DOC_LABEL[d]).filter(Boolean);
      const main = `
    <p class="sp-eyebrow"><span class="tag">วิธีพิจารณาความ</span> <span>${esc(lname)}</span> ${badgeV(s.verified)}</p>
    <h1>${esc(s.title)} (มาตรา ${esc(s.section)} ${esc(lname)})</h1>
    <p class="sp-lead">สาระสำคัญของมาตรา ${esc(s.section)} ${esc(short)} ที่ใช้ประกอบการฟ้องคดีและการเตรียมเอกสารยื่นศาล</p>
    ${s.verified === false ? '<div class="note warn"><p><b>ยังไม่ผ่านการตรวจกับแหล่งทางการ</b> — โปรดตรวจเลขมาตราและสาระกับตัวบทฉบับปัจจุบันก่อนใช้</p></div>' : ''}
    <h2>สาระสำคัญ</h2><p class="sp-hl">${esc(s.summary)}</p>
    ${s.caution ? `<h2>ข้อควรระวัง</h2><div class="note warn"><p>${esc(s.caution)}</p></div>` : ''}
    ${used.length ? `<h2>มักใช้อ้างในเอกสาร</h2><ul>${used.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}
    ${itemTwin && has(itemPath(itemTwin)) ? `<p>ดูรายละเอียดฐานความผิด/มูลคดีของมาตรานี้: <a href="${itemPath(itemTwin)}">${esc(itemTwin.name)} มาตรา ${esc(itemTwin.section)}</a></p>` : ''}
    <h2>แหล่งอ้างอิงและสถานะการตรวจ</h2>
    <p class="sp-src">${badgeV(s.verified)}${s.source ? ` · แหล่งอ้างอิง: ${srcHtml(s.source)}` : ''}</p>
    ${prev || next ? `<nav class="sp-prevnext" aria-label="มาตราก่อนหน้าและถัดไป">${prev && has(procPath(prev)) ? `<a href="${procPath(prev)}"><small>‹ ก่อนหน้า</small>มาตรา ${esc(prev.section)} ${esc(trunc(prev.title, 50))}</a>` : ''}${next && has(procPath(next)) ? `<a href="${procPath(next)}"><small>ถัดไป ›</small>มาตรา ${esc(next.section)} ${esc(trunc(next.title, 50))}</a>` : ''}</nav>` : ''}
    <p class="sp-bar"><a class="link-arrow" href="/procedure/">ขั้นตอนฟ้องคดีทั้งหมด</a><a class="link-arrow" href="/jurisdiction/">เขตอำนาจศาล</a></p>
    ${noteEdu}`;
      add({
        type: 'proc', path: pp, title, description, crumbs: [['ขั้นตอนฟ้องคดี', '/procedure/'], [`มาตรา ${s.section} ${short}`, pp]], nav: 'procedure', main,
        dataLen: [s.summary, s.caution, s.title].map((x) => one(x).length).reduce((a, b) => a + b, 0) + used.join(' ').length, lastmod: DATA_DATE, priority: '0.5'
      });
    }
    {
      const path0 = D.procedure.criminalCasePath || {};
      const steps = Array.isArray(path0) ? path0 : path0.steps || [];
      const fees = D.procedure.fees || {};
      const main = `
    <p class="sp-eyebrow">วิธีพิจารณาความ</p>
    <h1>ขั้นตอนฟ้องคดี และวิธีพิจารณาความอาญา-แพ่ง</h1>
    <p class="sp-lead">ตั้งแต่ตรวจสิทธิฟ้อง เลือกศาลที่มีเขตอำนาจ ร่างคำฟ้อง ยื่นฟ้อง ไต่สวนมูลฟ้อง สืบพยาน จนถึงพิพากษา อุทธรณ์ และฎีกา — พร้อมสรุปมาตราวิธีพิจารณา ${fmt(procSections.length)} มาตราที่ใช้บ่อย</p>
    <p class="sp-bar"><a class="link-arrow" href="/#process">ดูขั้นตอนบนหน้าแรก</a><a class="link-arrow" href="/jurisdiction/">ตรวจเขตอำนาจศาล</a><a class="link-arrow" href="/laws/">ข้อกฎหมายและมาตรา</a></p>
    ${steps.length ? `<h2 id="steps">${esc((path0.title || 'ขั้นตอนฟ้องคดีอาญาโดยราษฎร').replace(/^ขั้นตอน/, 'ขั้นตอน'))}</h2>
    ${path0.note ? `<p>${esc(path0.note)}${path0.checkedOn ? ` (ตรวจข้อมูลเมื่อ ${esc(thaiDate(path0.checkedOn))})` : ''}</p>` : ''}
    <ol class="sp-steps">${steps.map((st) => `<li><h3>${esc(String(st.title).replace(/^\d+\.\s*/, ''))}</h3><p>${esc(st.detail || '')}</p>${st.ref ? `<p class="ref">${esc(st.ref)}</p>` : ''}${st.verified === false ? '<p><span class="badge pending">ยังไม่ผ่านการตรวจกับแหล่งทางการ</span></p>' : ''}</li>`).join('')}</ol>` : ''}
    ${noteEdu}
    ${fees.items?.length ? `<h2 id="fees">ค่าธรรมเนียมศาลและอากรที่เกี่ยวข้อง</h2>${fees.note ? `<p>${esc(fees.note)}${fees.checkedOn ? ` (ตรวจข้อมูลเมื่อ ${esc(thaiDate(fees.checkedOn))})` : ''}</p>` : ''}
    <div class="tw"><table><thead><tr><th scope="col">รายการ</th><th scope="col">รายละเอียด</th><th scope="col">อ้างอิง</th></tr></thead><tbody>
${fees.items.map((f) => `<tr><th scope="row">${esc(f.title)}${f.verified === false ? '<span class="s"><span class="badge pending">ยังไม่ผ่านการตรวจ</span></span>' : ''}</th><td>${esc(f.detail)}${f.caution ? `<span class="s">${esc(f.caution)}</span>` : ''}</td><td>${esc(f.ref || '')}</td></tr>`).join('\n')}
</tbody></table></div>` : ''}
    <h2 id="sections">มาตราวิธีพิจารณาที่ใช้บ่อย</h2>
    ${[...procByLaw.entries()].map(([lid, arr]) => {
        const pl = procLaws.find((l) => l.id === lid) || lawById.get(lid) || {}; return `<h3>${esc(cleanLaw(pl.name || lid))} <small class="fine">(${esc(pl.short || lid)} · ${fmt(arr.length)} มาตรา)</small></h3>
    <ul class="sp-links">${arr.map((s) => `<li>${A(procPath(s), `<b>ม.${esc(s.section)}</b><span>${esc(trunc(s.title, 80))}</span>`)}</li>`).join('')}</ul>`;
      }).join('\n')}
    ${ctaBox('ร่างคำฟ้องตามขั้นตอน', 'ให้ระบบช่วยเตรียมคำฟ้อง คำขอท้ายฟ้อง บัญชีพยาน และใบแต่งทนายความตามแบบพิมพ์ศาลยุติธรรม', `${btn('/workspace/', 'เข้าสู่ระบบร่างคำฟ้อง')}${btn('/contact/', 'ติดต่อปรึกษา', 'ghost')}`)}`;
      add({
        type: 'hub', path: '/procedure/', title: fit(60, `ขั้นตอนฟ้องคดี วิธีพิจารณาความอาญา แพ่ง${BRAND}`, 'ขั้นตอนฟ้องคดี วิธีพิจารณาความอาญา แพ่ง'),
        description: trunc(`ขั้นตอนฟ้องคดีอาญาโดยราษฎรตั้งแต่ยื่นฟ้อง ไต่สวนมูลฟ้อง สืบพยาน ถึงอุทธรณ์ฎีกา พร้อมค่าธรรมเนียมศาล และสรุป ${procSections.length} มาตรา ป.วิ.อ. ป.วิ.พ.`, 155),
        crumbs: [['ขั้นตอนฟ้องคดี', '/procedure/']], nav: 'procedure', main, lastmod: DATA_DATE, priority: '0.9'
      });
    }

    // ---------------- ฎีกา: ข้อมูลทั้งหมดมาจากฐาน Aiven ----------------
    // ฮับนี้เป็นหน้าสถิต + ช่องค้นหา/รายการ (public/site/precedent-search.js เรียก /api/precedents); แต่ละฎีกามีหน้าของตัวเอง /precedents/<เลข>-<ปี>-<docId>/ (api/precedent.js, แม่แบบ dist/_px/precedent.html)
    {
      const main = `
    <p class="sp-eyebrow">ฎีกา</p>
    <h1>ค้นหาและอ่านคำพิพากษาศาลฎีกา</h1>
    <p class="sp-lead">คลังคำพิพากษาศาลฎีกาจากศูนย์เทคโนโลยีสารสนเทศและการสื่อสารในศาลฎีกา ค้นด้วยคำสำคัญ เลขฎีกา ปี ประเภทคดี หรือกฎหมายที่อ้าง และเปิดอ่านหน้าของแต่ละฎีกาได้ทุกคน ไม่ต้องสมัครสมาชิก</p>
    <p class="sp-bar"><a class="link-arrow" href="/laws/">ข้อกฎหมายและมาตรา</a><a class="link-arrow" href="/articles/">บทความ</a></p>
    <section class="px" id="pxSearch" aria-labelledby="pxT">
      <h2 id="pxT">ค้นหาฎีกาจากคลังคำพิพากษาศาลฎีกา</h2>
      <p class="fine">ค้นจากคำพิพากษาย่อที่ศาลเผยแพร่ ด้วยคำสำคัญ เลขฎีกา (เช่น 10029/2560) หรือกรองตามปี ประเภทคดี และกฎหมายที่อ้าง</p>
      <form class="px-form" role="search" action="/precedents/" method="get">
        <input type="search" name="q" maxlength="200" autocomplete="off" placeholder="เช่น มรดก · ฉ้อโกง · เช็ค · 10029/2560" aria-label="คำค้นฎีกา">
        <button class="btn-pill primary" type="submit">ค้นหา</button>
        <div class="px-filters">
          <select name="year" aria-label="ปี พ.ศ."><option value="">ทุกปี</option></select>
          <select name="type" aria-label="ประเภทคดี"><option value="">ทุกประเภท</option><option>อาญา</option><option>แพ่ง</option><option>แพ่งและอาญา</option></select>
          <select name="law" aria-label="กฎหมายที่อ้าง"><option value="">ทุกกฎหมาย</option></select>
        </div>
      </form>
      <p class="px-chips">ลองค้น: ${['มรดก', 'ที่ดิน', 'ฉ้อโกง', 'ยักยอก', 'หมิ่นประมาท', 'เช็ค', 'ละเมิด', 'ค่าจ้าง'].map((w) => `<button type="button" class="px-chip" data-q="${w}">${w}</button>`).join('')}</p>
      <div id="pxResults" aria-live="polite" aria-busy="true"><div class="px-skel" aria-hidden="true"><i></i><i></i><i></i></div><noscript><style>.px-skel{display:none}</style><p class="fine">การค้นหาฎีกาต้องเปิดใช้ JavaScript</p></noscript></div>
    </section>
    <script type="module" src="/site/precedent-search.js"></script>
    <div class="note src"><p><b>ที่มาของข้อมูล</b> — ศูนย์เทคโนโลยีสารสนเทศและการสื่อสารในศาลฎีกา<br>ศาลฎีกา เลขที่ 6 ถนนราชดำเนินใน แขวงพระบรมมหาราชวัง เขตพระนคร กรุงเทพมหานคร 10200 <span class="tag ok">✓ ตรวจสอบแล้ว</span></p></div>
    ${noteEdu}`;
      add({
        type: 'hub', path: '/precedents/', title: fit(60, `ฎีกา ค้นหาและอ่านคำพิพากษาศาลฎีกา${BRAND}`, 'ฎีกา ค้นหาคำพิพากษาศาลฎีกา'),
        description: trunc('ค้นหาและอ่านคำพิพากษาศาลฎีกา (คำพิพากษาย่อที่ศาลเผยแพร่) ด้วยคำสำคัญ เลขฎีกา ปี ประเภทคดี หรือกฎหมายที่อ้าง พร้อมหน้าของแต่ละฎีกา อ่านได้ทุกคน', 155),
        crumbs: [['ฎีกา', '/precedents/']], nav: 'precedents', main, lastmod: DATA_DATE, priority: '0.8'
      });
    }
    // ---------------- เขตอำนาจศาล ----------------
    const provPath = (p) => `/jurisdiction/${p.slug}/`;
    const asOf = thaiDate(D.jurisdiction?.asOf);
    const asOfWarn = `ข้อมูลรายอำเภอ/เขตมาจากระบบสืบค้นเขตอำนาจศาลของสำนักงานศาลยุติธรรม${asOf ? ` ยืนยันข้อมูลอัปเดตล่าสุด ${asOf}` : ''} โปรดตรวจสอบกับศาลหรือสำนักงานศาลยุติธรรมก่อนยื่นฟ้องทุกครั้ง`;
    const listCourts = (cs, p, scopeNeed) => {
      const sel = cs.filter((c) => (c.cat === 'main' && (c.scope === 'both' || c.scope === scopeNeed || !c.scope)) || c.cat === 'mag');
      return sel.map((c) => {
        const n = c.districts.size;
        const dn = [...c.districts];
        const cover = n === p.nDist ? `ทุก${p.W.d}` : `${p.W.d}${dn.slice(0, 5).join(', ')}${n > 5 ? ` และอีก ${n - 5} ${p.W.d}` : ''}`;
        return `${c.name} (${cover})`;
      }).join('; ');
    };
    for (const p of provs) {
      const mainN = p.dirList.filter((c) => c.cat === 'main'), magN = p.dirList.filter((c) => c.cat === 'mag'), juvN = p.dirList.filter((c) => c.cat === 'juv');
      const speci = p.dirList.filter((c) => c.cat === 'spec' || c.cat === 'appeal');
      const crimList = listCourts(p.dirList, p, 'criminal'), civList = listCourts(p.dirList, p, 'civil');
      const faq = [
        [`ฟ้องคดีอาญาที่เกิดเหตุใน${p.where} ต้องฟ้องที่ศาลใด?`, `${RULES.criminal[0][1]} (${RULES.criminal[0][2]}) สำหรับ${p.where} ตามข้อมูลของสำนักงานศาลยุติธรรม ศาลที่มีเขตอำนาจได้แก่ ${crimList || 'ดูตารางด้านบน'} ${RULES.criminal[1][1]}`],
        [`ฟ้องคดีแพ่งที่จำเลยอยู่ใน${p.where} ต้องฟ้องที่ศาลใด?`, `${RULES.civil[0][1]} (${RULES.civil[0][2]}) สำหรับ${p.where} ศาลที่มีเขตอำนาจได้แก่ ${civList || 'ดูตารางด้านบน'} ${RULES.civil[2][1]}`],
        [`${p.where}มีศาลอะไรบ้าง?`, `ตามข้อมูลที่เว็บไซต์มี ${p.where}มีศาลชั้นต้น ${mainN.length} แห่ง${magN.length ? ` ศาลแขวง ${magN.length} แห่ง` : ''}${juvN.length ? ` ศาลเยาวชนและครอบครัว ${juvN.length} แห่ง` : ''}: ${[...mainN, ...magN, ...juvN].map((c) => c.name).join(', ')}`],
        ['ข้อมูลเขตอำนาจศาลนี้เชื่อถือได้แค่ไหน?', asOfWarn],
      ];
      const nbr = provs.filter((x) => x !== p && p.region && x.region === p.region);
      const hasMag = p.rows.some((r) => r.mag.length), hasJuv = p.rows.some((r) => r.juv.length); // ซ่อนคอลัมน์ที่ว่างทั้งจังหวัด
      const tbl = `<div class="tw"><table><caption>ศาลที่มีเขตอำนาจแยกตาม${p.W.d} (${fmt(p.nDist)} ${p.W.d})</caption><thead><tr><th scope="col">${p.W.d}</th><th scope="col">ศาลชั้นต้น</th>${hasMag ? '<th scope="col">ศาลแขวง</th>' : ''}${hasJuv ? '<th scope="col">ศาลเยาวชนและครอบครัว</th>' : ''}</tr></thead><tbody>
${p.rows.map((r) => { const cell = (arr) => (arr.length ? `<ul>${arr.map((c) => `<li>${esc(c.name)}${scopeTag(c) ? ` <span class="s">คดี${scopeTag(c)}</span>` : ''}</li>`).join('')}</ul>` : '—'); return `<tr><th scope="row">${esc(r.name)}</th><td>${cell(r.main)}</td>${hasMag ? `<td>${cell(r.mag)}</td>` : ''}${hasJuv ? `<td>${cell(r.juv)}</td>` : ''}</tr>`; }).join('\n')}
</tbody></table></div>`;
      const dirTbl = `<div class="tw"><table><caption>รายชื่อศาลและเบอร์โทรศัพท์</caption><thead><tr><th scope="col">ศาล</th><th scope="col">ประเภท</th><th scope="col">โทรศัพท์</th><th scope="col">ครอบคลุม</th></tr></thead><tbody>
${p.dirList.map((c) => `<tr><th scope="row">${esc(c.name)}</th><td>${esc(CAT_LABEL[c.cat])}${scopeTag(c) ? ` <span class="s">คดี${scopeTag(c)}</span>` : ''}</td><td class="num">${esc(c.phone) || '—'}</td><td>${c.districts.size === p.nDist ? `ทุก${p.W.d}` : `${fmt(c.districts.size)} ${p.W.d}`}</td></tr>`).join('\n')}
</tbody></table></div>`;
      const extraHtml = p.extra.length ? `<h2>ศาลอื่นในพื้นที่จากรายชื่อศาลทั่วประเทศ</h2><p>ศาลต่อไปนี้ปรากฏในรายชื่อศาลทั่วประเทศที่เว็บไซต์รวบรวม แต่ไม่ได้อยู่ในข้อมูลเขตอำนาจรายอำเภอ/เขตข้างต้น ตรวจสอบเขตอำนาจกับสำนักงานศาลยุติธรรมก่อนใช้</p><ul>${p.extra.map((c) => `<li>${esc(c.name)}${c.type ? ` (${esc(c.type)})` : ''}${c.note ? ` — ${esc(c.note)}` : ''}${c.verified === false || c.gverified === false ? ' <span class="badge pending">ยังไม่ยืนยัน</span>' : ''}</li>`).join('')}</ul>` : '';
      const mainCourtsNames = [...mainN, ...magN].map((c) => c.name);
      const main = `
    <p class="sp-eyebrow">เขตอำนาจศาล${p.region ? ` · ${esc(p.region)}` : ''}</p>
    <h1>ศาลที่มีเขตอำนาจใน${esc(p.where)}</h1>
    <p class="sp-lead">${esc(p.where)}มี ${fmt(p.nDist)} ${p.W.d} ศาลชั้นต้นที่มีเขตอำนาจรับฟ้องคดีอาญาและคดีแพ่งในพื้นที่ ได้แก่ ${esc(mainCourtsNames.slice(0, 6).join(', '))}${mainCourtsNames.length > 6 ? ` และอีก ${mainCourtsNames.length - 6} ศาล` : ''}${p.defNames.some((n) => !mainCourtsNames.includes(n)) ? ` (ศาลหลักของ${esc(p.where)}ตามข้อมูลคือ ${esc(p.defNames.join(', '))})` : ''} — เลือกประเภทคดีและ${p.W.d}ที่เกิดเหตุหรือที่จำเลยอยู่ในเครื่องมือด้านล่าง เพื่อดูศาลที่ต้องฟ้องและเบอร์โทรศัพท์ หรือดูตารางแยกตาม${p.W.d}ต่อจากนั้น</p>
    <p class="sp-bar"><a class="link-arrow" href="/jurisdiction/#civil">หลักเลือกศาลคดีแพ่ง</a><a class="link-arrow" href="/jurisdiction/#criminal">หลักเลือกศาลคดีอาญา</a><a class="link-arrow" href="/jurisdiction/">เขตอำนาจศาลทั้งประเทศ</a><a class="link-arrow" href="/procedure/">ขั้นตอนฟ้องคดี</a></p>
    <h2 id="search">ค้นหาศาลที่รับฟ้องใน${esc(p.where)}</h2>
    <div class="jt-mount" data-jurisdiction-tool data-province="${esc(p.name)}" data-src="/jurisdiction-data/${p.slug}.json" data-courts="/jurisdiction-data/courts.json"><noscript><div class="note"><p>เครื่องมือค้นหาต้องเปิดใช้ JavaScript — ดู<a href="#court-table">ตารางศาลแยกตาม${p.W.d}</a>ด้านล่างแทน</p></div></noscript></div>
    <div class="note warn"><p>${esc(asOfWarn)}</p></div>
    <h2 id="court-table">ศาลที่มีเขตอำนาจในพื้นที่${esc(p.where)}แยกตาม${p.W.d}</h2>
    ${tbl}
    <h2>รายชื่อศาลและเบอร์โทรศัพท์ที่เกี่ยวข้อง</h2>
    ${dirTbl}
    ${extraHtml}
    <h2>คำถามที่พบบ่อยเรื่องการฟ้องคดีใน${esc(p.where)}</h2>
    ${qaHtml(faq)}
    ${nbr.length ? `<h2>จังหวัดในเขตศาล${esc(p.region)}เดียวกัน</h2><ul class="provgrid">${nbr.map((x) => `<li><a href="${provPath(x)}"><span>${esc(x.name)}</span><small>${fmt(x.nDist)} ${x.W.d}</small></a></li>`).join('')}</ul>` : ''}
    ${ctaBox('ร่างคำฟ้องถึงศาลที่ถูกต้อง', `เตรียมคำฟ้องและเอกสารยื่นศาลตามแบบพิมพ์ศาลยุติธรรม หรือส่งเรื่องให้เจ้าหน้าที่ตรวจสอบเบื้องต้นก่อนเลือกศาลที่${p.where}`, `${btn('/#drafting', 'ดูระบบร่างคำฟ้อง')}${btn('/contact/', 'ติดต่อปรึกษา', 'ghost')}`)}
    ${noteEdu}`;
      const title = fit(60, `เขตอำนาจศาล${p.where} ศาลที่รับฟ้องคดีแพ่ง อาญา${BRAND}`, `เขตอำนาจศาล${p.where} ศาลที่รับฟ้องคดีแพ่ง อาญา`, `เขตอำนาจศาล${p.where} ฟ้องที่ศาลไหน`);
      const description = trunc(`ฟ้องคดีใน${p.where}ต้องฟ้องศาลไหน: ศาลชั้นต้น ศาลแขวง ศาลเยาวชนฯ ที่มีเขตอำนาจ ${fmt(p.nDist)} ${p.W.d} พร้อมเบอร์โทรศัพท์ศาลและวิธีเลือกศาล`, 155);
      add({ type: 'prov', path: provPath(p), title, description, crumbs: [['เขตอำนาจศาล', '/jurisdiction/'], [p.name, provPath(p)]], nav: 'jurisdiction', main, faq, scripts: ['/site/jurisdiction-page.js'], lastmod: JUR_DATE, priority: '0.6' });
    }
    {
      const byRegion = new Map();
      for (const p of provs) { const r = p.region || 'อื่น ๆ'; if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(p); }
      const regs = [...byRegion.keys()].sort((a, b) => { const x = regionsOrder.indexOf(a), y = regionsOrder.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
      const nCourts = allCourtsFlat.length;
      const nDistAll = provs.reduce((n, p) => n + p.nDist, 0);
      // ลิงก์ไปหน้ามาตราวิธีพิจารณา (เฉพาะที่หน้ามีจริง)
      const ref = (id, label) => { const s = procById.get(id); const to = s && `/procedure/${s.slug}/`; return to && has(to) ? `<a href="${to}">${esc(label)}</a>` : esc(label); };
      const magNames = (D.courts.groups || []).filter((g) => /^ศาลชั้นต้น - กรุงเทพมหานคร$/.test(g.group)).flatMap((g) => g.courts).filter((c) => c.type === 'ศาลแขวง').map((c) => c.name);
      const bkkCivil = (D.courts.groups || []).filter((g) => /^ศาลชั้นต้น - กรุงเทพมหานคร$/.test(g.group)).flatMap((g) => g.courts).filter((c) => c.type === 'ศาลแพ่ง').map((c) => c.name);
      const bkkCrim = (D.courts.groups || []).filter((g) => /^ศาลชั้นต้น - กรุงเทพมหานคร$/.test(g.group)).flatMap((g) => g.courts).filter((c) => c.type === 'ศาลอาญา').map((c) => c.name);
      const specTypes = [...new Set((D.courts.groups || []).filter((g) => g.group === 'ศาลชำนัญพิเศษ').flatMap((g) => g.courts).map((c) => c.type))];

      // ตารางตัวอย่าง: จังหวัดใหญ่ 8 แห่ง × อำเภอ/เขต (เมือง + อำเภอที่ชุดศาลต่างกัน) — ดึงจากข้อมูลเขตอำนาจรายอำเภอ
      const SAMPLE = ['กรุงเทพมหานคร', 'เชียงใหม่', 'ขอนแก่น', 'นครราชสีมา', 'ชลบุรี', 'สงขลา', 'ภูเก็ต', 'นนทบุรี'];
      const sig = (r) => `${r.main.map((c) => c.name).join('|')}#${r.mag.map((c) => c.name).join('|')}`;
      const names = (arr, max) => { const n = arr.map((c) => c.name); return n.length > max ? `${n.slice(0, max).join(', ')} และอีก ${n.length - max} ศาล` : n.join(', '); };
      const sampleRows = [];
      for (const n of SAMPLE) {
        const p = provs.find((x) => x.name === n);
        if (!p || !p.rows.length) continue;
        const first = p.rows.find((r) => /^เมือง/.test(r.name)) || p.rows[0];
        const diff = p.rows.find((r) => sig(r) !== sig(first));
        for (const r of [first, diff].filter(Boolean)) sampleRows.push([p, r]);
      }
      const exTbl = `<div class="tw"><table><caption>ตัวอย่างศาลที่มีเขตอำนาจ แยกตามอำเภอ/เขต (ข้อมูลยืนยันอัปเดตล่าสุด ${esc(asOf)})</caption><thead><tr><th scope="col">จังหวัด</th><th scope="col">อำเภอ/เขต</th><th scope="col">ศาลชั้นต้น</th><th scope="col">ศาลแขวง</th></tr></thead><tbody>
${sampleRows.map(([p, r]) => `<tr><th scope="row">${A(provPath(p), esc(p.name))}</th><td>${p.W.d}${esc(r.name)}</td><td>${esc(names(r.main, 3)) || '—'}</td><td>${esc(names(r.mag, 2)) || '—'}</td></tr>`).join('\n')}
</tbody></table></div>`;

      const faq = [
        ['ฟ้องคดีแพ่งต้องฟ้องที่ศาลไหน?', `คำฟ้องคดีแพ่งเสนอต่อศาลที่จำเลยมีภูมิลำเนาอยู่ในเขตศาล หรือศาลที่มูลคดีเกิดขึ้นในเขตศาล (ป.วิ.พ. มาตรา 4) ถ้าเป็นคดีเกี่ยวกับอสังหาริมทรัพย์ ให้เสนอต่อศาลที่ทรัพย์ตั้งอยู่ในเขต หรือศาลที่จำเลยมีภูมิลำเนาในเขต (ป.วิ.พ. มาตรา 4 ทวิ) ส่วนจะเป็นศาลแขวงหรือศาลจังหวัด/ศาลแพ่ง ดูจากทุนทรัพย์และประเภทคดี`],
        ['ฟ้องคดีอาญาต้องฟ้องที่ศาลไหน?', `คดีอาญาให้ชำระที่ศาลที่ความผิดเกิดขึ้นในเขตอำนาจ แต่ถ้าจำเลยมีที่อยู่ ถูกจับ หรือมีการสอบสวนในท้องที่อื่น ก็ชำระที่ศาลของท้องที่นั้นได้ (ป.วิ.อ. มาตรา 22) และให้ยื่นฟ้องต่อศาลใดศาลหนึ่งที่มีอำนาจ (ป.วิ.อ. มาตรา 157)`],
        ['สถานีตำรวจที่แจ้งความอยู่คนละเขตกับศาล ต้องฟ้องที่ศาลเดียวกับสถานีตำรวจหรือไม่?', `ไม่จำเป็นต้องเป็นเขตเดียวกัน เขตอำนาจสอบสวนของพนักงานสอบสวน (ที่เกิดเหตุ ที่อยู่ผู้ต้องหา หรือที่จับ) เป็นเรื่องการสอบสวน ไม่ใช่เขตอำนาจศาลที่รับฟ้อง เขตอำนาจศาลที่รับฟ้องดูตาม ป.วิ.อ. มาตรา 22 ไม่ใช่มาตรา 18`],
        ['ราษฎรฟ้องคดีอาญาเองต้องผ่านขั้นตอนอะไร?', `ผู้เสียหายมีอำนาจฟ้องคดีอาญาต่อศาลได้เอง (ป.วิ.อ. มาตรา 28(2)) โดยเลือกศาลตามหลักเดียวกับข้างต้น เมื่อราษฎรเป็นโจทก์ ศาลต้องไต่สวนมูลฟ้องก่อนว่าคดีมีมูลหรือไม่ แล้วจึงประทับฟ้อง (ป.วิ.อ. มาตรา 162) ถ้าศาลเห็นว่าฟ้องโดยไม่สุจริตหรือบิดเบือนข้อเท็จจริง อาจยกฟ้องและห้ามฟ้องเรื่องเดียวกันอีก (ป.วิ.อ. มาตรา 161/1)`],
        ['ศาลแขวงรับคดีแบบไหน?', `คดีแพ่งที่มีทุนทรัพย์ไม่เกิน 300,000 บาท และคดีอาญาที่มีอัตราโทษจำคุกไม่เกิน 3 ปี หรือปรับไม่เกิน 60,000 บาท หรือทั้งจำทั้งปรับ อยู่ในอำนาจศาลแขวง (ตามข้อมูลในรายชื่อศาลของเว็บไซต์ ซึ่งส่วนของคดีอาญายังไม่ได้ยืนยันกับตัวบท ควรตรวจเกณฑ์ปัจจุบันก่อนยื่นฟ้อง)`],
        ['คดีแพ่งที่เกี่ยวเนื่องกับคดีอาญา ฟ้องที่ศาลไหน?', `ฟ้องคดีแพ่งที่เกี่ยวเนื่องกับคดีอาญาต่อศาลที่พิจารณาคดีอาญา หรือต่อศาลที่มีอำนาจชำระคดีแพ่งก็ได้ (ป.วิ.อ. มาตรา 40) และการฟ้องคดีอาญาไม่ตัดสิทธิผู้เสียหายที่จะฟ้องคดีแพ่งอีก (ป.วิ.อ. มาตรา 45)`],
        ['ฟ้องผิดศาลจะเป็นอย่างไร?', `กฎหมายห้ามเสนอคำฟ้องต่อศาลที่ไม่มีอำนาจ (ป.วิ.พ. มาตรา 2) ข้อมูลของเว็บไซต์ยังไม่ได้สรุปผลของการฟ้องผิดศาลไว้ละเอียด จึงควรตรวจเขตอำนาจให้แน่ใจก่อนยื่น หากไม่แน่ใจให้สอบถามศาลหรือทนายความ ในคดีอาญา เมื่อมีศาลหลายศาลที่มีอำนาจ โจทก์หรือจำเลยร้องขอให้โอนคดีไปศาลที่ความผิดเกิดในเขตได้ ศาลมีดุลพินิจ (ป.วิ.อ. มาตรา 23)`],
        ['ข้อมูลเขตอำนาจศาลนี้เชื่อถือได้แค่ไหน?', asOfWarn],
      ];
      const arts = ['online-case-overview', 'online-trading-fraud', 'online-defamation', 'online-trading-civil'].map((s) => articles.find((a) => a.slug === s)).filter(Boolean);

      const main = `
    <p class="sp-eyebrow">เขตอำนาจศาล</p>
    <h1>เขตอำนาจศาล: ฟ้องคดีแพ่ง คดีอาญา ที่ศาลไหน ค้นหาศาลที่รับฟ้องตามอำเภอ/เขต</h1>
    <p class="sp-lead">จะฟ้องคดีแพ่งหรือคดีอาญาต้องยื่นฟ้องที่ศาลไหน? เลือกประเภทคดี จังหวัด และอำเภอ/เขตด้านล่าง เพื่อค้นหาศาลชั้นต้น ศาลแขวง และศาลเยาวชนและครอบครัวที่มีเขตอำนาจในพื้นที่นั้น พร้อมเบอร์โทรศัพท์ศาล ข้อมูลครอบคลุม ${fmt(provs.length)} จังหวัด ${fmt(nDistAll)} อำเภอ/เขต</p>
    <h2 id="search" class="sp-tool-h">ค้นหาเขตอำนาจศาลตามอำเภอ/เขต</h2>
    <div class="jt-mount" data-jurisdiction-tool><noscript><div class="note"><p>เครื่องมือค้นหาต้องเปิดใช้ JavaScript — ดูรายชื่อ<a href="#provinces">${fmt(provs.length)} จังหวัด</a>แล้วเลือกจังหวัดเพื่อดูตารางศาลแยกตามอำเภอ/เขต และอ่านหลักเลือกศาลด้านล่าง</p></div></noscript></div>
    <p class="sp-toc"><a href="#civil">ฟ้องคดีแพ่ง</a><a href="#criminal">ฟ้องคดีอาญา</a><a href="#magistrate">ศาลแขวง/ศาลจังหวัด</a><a href="#wrong-court">ฟ้องผิดศาล</a><a href="#examples">ตัวอย่างรายจังหวัด</a><a href="#provinces">ทั้ง ${fmt(provs.length)} จังหวัด</a><a href="#faq">คำถามที่พบบ่อย</a></p>
    <div class="note warn"><p>${esc(asOfWarn)}</p></div>

    <h2 id="civil">ฟ้องคดีแพ่งที่ศาลไหน</h2>
    <p>คดีแพ่งคือข้อพิพาทเกี่ยวกับสิทธิหรือหน้าที่ตามกฎหมายแพ่ง ผู้ที่มีข้อโต้แย้งดังกล่าวเสนอคดีต่อศาลที่มีเขตอำนาจได้ (${ref('pvpe-55', 'ป.วิ.พ. มาตรา 55')}) และห้ามเสนอคำฟ้องต่อศาลใด เว้นแต่ศาลนั้นมีอำนาจพิจารณาพิพากษาตามกฎหมายพระธรรมนูญศาลยุติธรรม และคดีอยู่ในเขตศาลนั้น (${ref('pvpe-2', 'ป.วิ.พ. มาตรา 2')}) ก่อนยื่นคำฟ้องจึงต้องเลือกศาลให้ถูกทั้งพื้นที่และประเภทศาล</p>
    <h3>หลักทั่วไป: ภูมิลำเนาจำเลย มูลคดีเกิด และที่ตั้งทรัพย์</h3>
    <ul>
      <li><b>ศาลที่จำเลยมีภูมิลำเนา หรือศาลที่มูลคดีเกิดขึ้น</b> — คำฟ้องเสนอต่อศาลที่จำเลยมีภูมิลำเนาอยู่ในเขตศาล หรือศาลที่มูลคดีเกิดขึ้นในเขตศาล ไม่ว่าจำเลยจะมีภูมิลำเนาในประเทศไทยหรือไม่ (${ref('pvpe-4', 'ป.วิ.พ. มาตรา 4')}) ส่วนคำร้องขอเสนอต่อศาลที่มูลคดีเกิดในเขต หรือศาลที่ผู้ร้องมีภูมิลำเนา</li>
      <li><b>คดีเกี่ยวกับอสังหาริมทรัพย์</b> — เสนอต่อศาลที่อสังหาริมทรัพย์ตั้งอยู่ในเขต หรือศาลที่จำเลยมีภูมิลำเนาในเขต (${ref('pvpe-4-bis', 'ป.วิ.พ. มาตรา 4 ทวิ')})</li>
      <li><b>จำเลยไม่มีภูมิลำเนาในประเทศไทยและมูลคดีเกิดนอกประเทศ</b> — ถ้าโจทก์มีสัญชาติไทยหรือมีภูมิลำเนาในประเทศไทย เสนอต่อศาลแพ่งหรือศาลที่โจทก์มีภูมิลำเนาในเขตได้ และถ้าจำเลยมีทรัพย์สินที่บังคับคดีได้ในประเทศไทย เสนอต่อศาลที่ทรัพย์นั้นอยู่ในเขตได้ (${ref('pvpe-4-tri', 'ป.วิ.พ. มาตรา 4 ตรี')})</li>
    </ul>
    <p>ตัวอย่าง: ทำสัญญากันที่นนทบุรี แต่จำเลยมีภูมิลำเนาอยู่ที่เชียงใหม่ ตามหลักข้างต้นฟ้องได้ที่ศาลซึ่งมีเขตอำนาจเหนือภูมิลำเนาจำเลยที่เชียงใหม่ หรือศาลซึ่งมีเขตอำนาจเหนือที่มูลคดีเกิดที่นนทบุรี ใช้เครื่องมือด้านบนเลือกอำเภอ/เขตของแต่ละที่เพื่อดูว่าศาลใดมีเขตอำนาจ</p>
    <h3>ศาลแขวง ศาลจังหวัด ศาลแพ่ง และศาลชำนัญพิเศษ แยกตามทุนทรัพย์และประเภทคดี</h3>
    <ul>
      <li><b>ศาลแขวง</b> — คดีแพ่งที่มีทุนทรัพย์ไม่เกิน 300,000 บาท (ตามข้อมูลศาลแขวงในรายชื่อศาลของเว็บไซต์ ควรตรวจเกณฑ์ปัจจุบันก่อนยื่น)</li>
      <li><b>ศาลจังหวัด / ศาลแพ่ง</b> — คดีที่ไม่อยู่ในอำนาจศาลแขวงหรือศาลชำนัญพิเศษ ยื่นที่ศาลชั้นต้นทั่วไป คือศาลจังหวัดในต่างจังหวัด${bkkCivil.length ? ` และในกรุงเทพมหานครคือ ${esc(bkkCivil.join(', '))}` : ''}</li>
      <li><b>ศาลชำนัญพิเศษ</b> — ตามรายชื่อศาลที่เว็บไซต์รวบรวม ได้แก่ ${esc(specTypes.join(', '))} ซึ่งรับเฉพาะคดีประเภทนั้น ขอบเขตอำนาจของแต่ละศาลเป็นไปตามกฎหมายเฉพาะ ตรวจสอบก่อนยื่น</li>
    </ul>

    <h2 id="criminal">ฟ้องคดีอาญาที่ศาลไหน</h2>
    <p>ผู้มีอำนาจฟ้องคดีอาญาต่อศาลคือพนักงานอัยการและผู้เสียหาย (${ref('pvor-28', 'ป.วิ.อ. มาตรา 28')}) การฟ้องคดีอาญาให้ยื่นฟ้องต่อศาลใดศาลหนึ่งที่มีอำนาจ (${ref('pvor-157', 'ป.วิ.อ. มาตรา 157')})</p>
    <h3>หลักทั่วไป: ที่เกิดเหตุ ที่จำเลยอยู่ และที่จับ</h3>
    <ul>
      <li><b>ศาลที่ความผิดเกิดขึ้น</b> — คดีอาญาให้ชำระที่ศาลที่ความผิดเกิดขึ้น อ้างหรือเชื่อว่าเกิดขึ้นในเขตอำนาจ (${ref('pvor-22', 'ป.วิ.อ. มาตรา 22')})</li>
      <li><b>ศาลของท้องที่ที่จำเลยอยู่ หรือถูกจับ หรือมีการสอบสวน</b> — ถ้าจำเลยมีที่อยู่หรือถูกจับ หรือมีการสอบสวนในท้องที่อื่น ก็ชำระที่ศาลของท้องที่นั้นได้ (${ref('pvor-22', 'ป.วิ.อ. มาตรา 22')})</li>
      <li><b>ความผิดนอกราชอาณาจักร</b> — ชำระที่ศาลอาญา (${ref('pvor-22', 'ป.วิ.อ. มาตรา 22')})${bkkCrim.length ? ` ศาลอาญาในกรุงเทพมหานครตามรายชื่อศาลของเว็บไซต์ ได้แก่ ${esc(bkkCrim.join(', '))}` : ''}</li>
      <li><b>มีศาลมีอำนาจหลายศาล</b> — โจทก์หรือจำเลยร้องขอให้โอนไปศาลที่ความผิดเกิดในเขตได้ และโจทก์ร้องขอโอนไปศาลอื่นที่มีอำนาจเพื่อความสะดวกได้ ศาลมีดุลพินิจ (${ref('pvor-23', 'ป.วิ.อ. มาตรา 23')})</li>
      <li><b>ความผิดหลายฐานที่เกี่ยวพันกัน</b> — ฟ้องรวมต่อศาลที่มีอำนาจชำระความผิดที่มีโทษสูงกว่าได้ (${ref('pvor-24', 'ป.วิ.อ. มาตรา 24')})</li>
    </ul>
    <div class="note"><p><b>สถานีตำรวจที่แจ้งความไม่ใช่ตัวกำหนดศาล</b> — เขตอำนาจสอบสวนของพนักงานสอบสวนเป็นเรื่องการสอบสวน ไม่ใช่เขตอำนาจศาลที่รับฟ้อง ให้ดูศาลตาม ${ref('pvor-22', 'ป.วิ.อ. มาตรา 22')} ไม่ใช่ ${ref('pvor-18', 'มาตรา 18')}</p></div>
    <h3>ราษฎรฟ้องเอง: ไต่สวนมูลฟ้อง</h3>
    <p>ผู้เสียหายฟ้องคดีอาญาเองได้ โดยเลือกศาลตามหลักเดียวกับข้างต้น แต่เมื่อราษฎรเป็นโจทก์ ศาลต้องไต่สวนมูลฟ้องก่อนว่าคดีมีมูลหรือไม่ แล้วจึงประทับฟ้อง (${ref('pvor-162', 'ป.วิ.อ. มาตรา 162')}) ถ้าศาลเห็นว่าโจทก์ฟ้องโดยไม่สุจริต ศาลยกฟ้องและห้ามฟ้องเรื่องเดียวกันอีก (${ref('pvor-161-1', 'ป.วิ.อ. มาตรา 161/1')}) ส่วนอาญาไม่ต้องเสียค่าขึ้นศาล แต่ส่วนแพ่งที่ติดมากับฟ้องอาญาเรียกค่าธรรมเนียมเหมือนคดีแพ่ง และขอยกเว้นได้ตามเงื่อนไข (${ref('pvor-252', 'ป.วิ.อ. มาตรา 252')} และ ${ref('pvor-254', '254')}) ดูขั้นตอนทั้งหมดที่ <a href="/procedure/">ขั้นตอนฟ้องคดี</a></p>
    <h3>ศาลที่รับคดีอาญาตามประเภทคดีและตัวจำเลย</h3>
    <ul>
      <li><b>ศาลแขวง</b> — คดีอาญาที่มีอัตราโทษจำคุกไม่เกิน 3 ปี หรือปรับไม่เกิน 60,000 บาท หรือทั้งจำทั้งปรับ (ข้อมูลส่วนนี้ยังไม่ได้ยืนยันกับตัวบท ตรวจก่อนใช้)</li>
      <li><b>ศาลจังหวัด / ศาลอาญา</b> — คดีที่เกินเกณฑ์ศาลแขวง ยื่นที่ศาลจังหวัดในต่างจังหวัด และศาลอาญาในกรุงเทพมหานคร</li>
      <li><b>ศาลเยาวชนและครอบครัว</b> — ใช้เมื่อจำเลยเป็นเด็กหรือเยาวชน (ต่ำกว่า 18 ปีขณะกระทำผิด) ข้อมูลส่วนนี้ยังไม่ได้ตรวจเลขมาตรากับตัวบท</li>
      <li><b>ศาลอาญาคดีทุจริตและประพฤติมิชอบ</b> — โดยทั่วไปรับฟ้องโดยพนักงานอัยการหรือ ป.ป.ช. ไม่ใช่ช่องทางสำหรับราษฎรฟ้องเอง</li>
    </ul>

    <h2 id="magistrate">ศาลแขวง กับ ศาลจังหวัด ต่างกันอย่างไร</h2>
    <div class="tw"><table><caption>เปรียบเทียบตามข้อมูลของเว็บไซต์ (ตรวจเกณฑ์ปัจจุบันก่อนยื่นฟ้อง)</caption><thead><tr><th scope="col">หัวข้อ</th><th scope="col">ศาลแขวง</th><th scope="col">ศาลจังหวัด / ศาลแพ่ง / ศาลอาญา</th></tr></thead><tbody>
<tr><th scope="row">คดีแพ่ง</th><td>ทุนทรัพย์ไม่เกิน 300,000 บาท</td><td>คดีที่เกินเกณฑ์ศาลแขวง</td></tr>
<tr><th scope="row">คดีอาญา</th><td>อัตราโทษจำคุกไม่เกิน 3 ปี หรือปรับไม่เกิน 60,000 บาท หรือทั้งจำทั้งปรับ</td><td>คดีที่มีอัตราโทษสูงกว่าเกณฑ์ศาลแขวง</td></tr>
<tr><th scope="row">วิธีฟ้อง</th><td>คดีอาญา ผู้เสียหายหรืออัยการฟ้องด้วยวาจาหรือเป็นหนังสือก็ได้ (${ref('szk-19', 'พ.ร.บ.ศาลแขวงฯ มาตรา 19')} — ยังไม่ได้ยืนยันกับตัวบท)</td><td>คดีแพ่งฟ้องเป็นหนังสือ (${ref('pvpe-172', 'ป.วิ.พ. มาตรา 172')}) คดีอาญาต้องมีรายการตาม ${ref('pvor-158', 'ป.วิ.อ. มาตรา 158')}</td></tr>
<tr><th scope="row">ตัวอย่างในกรุงเทพมหานคร</th><td>${esc(magNames.join(', ')) || '—'}</td><td>${esc([...bkkCivil, ...bkkCrim].join(', ')) || '—'}</td></tr>
</tbody></table></div>
    <p>ศาลเยาวชนและครอบครัวและศาลชำนัญพิเศษ (แรงงาน ภาษีอากร ล้มละลาย ทรัพย์สินทางปัญญาและการค้าระหว่างประเทศ ฯลฯ) เป็นศาลอีกกลุ่มหนึ่งที่รับเฉพาะคดีตามกฎหมายจัดตั้ง เครื่องมือด้านบนแสดงศาลกลุ่มนี้ที่เกี่ยวข้องกับพื้นที่ที่เลือกไว้ด้วย</p>

    <h2 id="wrong-court">ฟ้องผิดศาลจะเป็นอย่างไร</h2>
    <p>กฎหมายห้ามเสนอคำฟ้องต่อศาลที่ไม่มีอำนาจพิจารณาพิพากษาหรือคดีไม่อยู่ในเขตศาลนั้น (${ref('pvpe-2', 'ป.วิ.พ. มาตรา 2')}) ข้อมูลของเว็บไซต์ยังไม่ได้สรุปผลของการฟ้องผิดศาลไว้ละเอียด ผลที่เกิดขึ้นจริงขึ้นอยู่กับประเภทคดีและคำสั่งของศาล จึงควรตรวจเขตอำนาจให้แน่ใจก่อนยื่น ถ้าไม่แน่ใจให้โทรสอบถามศาลตามเบอร์ที่แสดงในผลค้นหา หรือปรึกษาทนายความ ในคดีอาญา เมื่อมีศาลหลายศาลที่มีอำนาจ มีทางขอโอนคดีได้ตาม ${ref('pvor-23', 'ป.วิ.อ. มาตรา 23')} แต่ศาลมีดุลพินิจ ไม่ใช่สิทธิที่แน่นอน</p>

    <h2 id="examples">ตารางตัวอย่างค้นหาเขตอำนาจศาลตามจังหวัด</h2>
    <p>ตัวอย่างจากข้อมูลรายอำเภอ/เขต: ศาลที่มีเขตอำนาจต่างกันไปตามพื้นที่ แม้อยู่จังหวัดเดียวกัน เลือกจังหวัดเพื่อดูตารางครบทุกอำเภอ/เขต</p>
    ${exTbl}

    <h2 id="provinces">เลือกจังหวัดเพื่อดูศาลรายอำเภอ/เขต (ครบ ${fmt(provs.length)} จังหวัด)</h2>
    <p>แต่ละจังหวัดมีตารางศาลที่มีเขตอำนาจแยกตามอำเภอ/เขต และรายชื่อศาลพร้อมเบอร์โทรศัพท์ รายชื่อรวมศาลทั่วประเทศ ${fmt(nCourts)} แห่ง</p>
    ${regs.map((r) => `<h3>${esc(r === 'กรุงเทพมหานคร' ? r : `ศาลชั้นต้น${r}`)}</h3><ul class="provgrid">${byRegion.get(r).map((p) => `<li><a href="${provPath(p)}"><span>${esc(p.name)}</span><small>${fmt(p.nDist)} ${p.W.d}</small></a></li>`).join('')}</ul>`).join('\n')}

    <h2 id="faq">คำถามที่พบบ่อยเรื่องเขตอำนาจศาล</h2>
    ${qaHtml(faq)}

    <h2>อ่านต่อและเครื่องมือที่เกี่ยวข้อง</h2>
    <ul>
      <li><a href="/procedure/">ขั้นตอนฟ้องคดีและวิธีพิจารณาความ</a> — จากยื่นฟ้องถึงคำพิพากษา</li>
      <li><a href="/laws/">ข้อกฎหมายและมาตรา</a> — ระวางโทษ อายุความ องค์ประกอบความผิด</li>
      ${arts.map((a) => `<li><a href="/articles/?a=${esc(a.slug)}">${esc(a.title)}</a></li>`).join('\n      ')}
    </ul>
    ${ctaBox('เลือกศาลแล้ว ร่างคำฟ้องต่อได้เลย', 'เตรียมคำฟ้องและเอกสารยื่นศาลตามแบบพิมพ์ศาลยุติธรรมในระบบร่างคำฟ้อง หรือส่งเรื่องให้เจ้าหน้าที่ตรวจสอบเบื้องต้นก่อน การส่งข้อความไม่ใช่การว่าจ้างทนายความ', `${btn('/workspace/', 'เข้าสู่ระบบร่างคำฟ้อง')}${btn('/contact/', 'ติดต่อปรึกษากฎหมาย', 'ghost')}`)}
    <div class="note warn"><p><b>ข้อมูลรายอำเภอ/เขตยืนยันอัปเดตล่าสุด ${esc(asOf)}</b> — โปรดตรวจสอบกับศาลหรือสำนักงานศาลยุติธรรมก่อนยื่นฟ้องทุกครั้ง</p></div>
    ${noteEdu}`;
      add({
        type: 'hub', path: '/jurisdiction/', title: fit(60, `เขตอำนาจศาล ฟ้องคดีแพ่ง คดีอาญา ศาลไหน ค้นหาศาล${BRAND}`, 'เขตอำนาจศาล ฟ้องคดีแพ่ง คดีอาญา ศาลไหน ค้นหาศาล', 'เขตอำนาจศาล ฟ้องที่ศาลไหน ค้นหาศาล'),
        description: trunc(`ฟ้องคดีแพ่ง คดีอาญาที่ศาลไหน? ค้นหาเขตอำนาจศาลรายอำเภอ/เขต ${provs.length} จังหวัด พร้อมหลักเลือกศาล ศาลแขวงต่างจากศาลจังหวัดอย่างไร และเบอร์โทรศัพท์ศาล`, 155),
        crumbs: [['เขตอำนาจศาล', '/jurisdiction/']], nav: 'jurisdiction', main, faq, scripts: ['/site/jurisdiction-page.js'], lastmod: JUR_DATE, priority: '0.9'
      });
    }
    return pages;
  }

  // ---------- วนจนไม่มีหน้าบาง (หน้าบางไม่เผยแพร่และไม่ถูกลิงก์) ----------
  // รอบแรก: ส่งชุดว่าง (ไม่มีลิงก์) เพื่อรวบรวมพาธทั้งหมดที่เป็นไปได้ แล้วเริ่มวนด้วยชุดเต็ม
  let exists = new Set(buildAll(new Set()).map((p) => p.path));
  let pages, skipped = [];
  for (let pass = 0; pass < 6; pass++) {
    pages = buildAll(exists);
    const thin = pages.filter((p) => exists.has(p.path)).filter((p) => {
      const t = plain(p.main).length;
      return t < MIN_MAIN_TEXT || (p.dataLen != null && p.dataLen < (MIN_DATA[p.type] ?? 0));
    });
    if (!thin.length) break;
    for (const p of thin) { exists.delete(p.path); skipped.push(p.path); }
  }
  pages = pages.filter((p) => exists.has(p.path));
  const pathSet = new Set(pages.map((p) => p.path));
  if (pathSet.size !== pages.length) throw new Error('seo: พาธหน้าซ้ำกัน');

  // ---------- ข้อมูลสถิตของเครื่องมือค้นหาเขตอำนาจศาลบนหน้าจังหวัด (โหลดเฉพาะจังหวัดนั้น + รายชื่อศาลที่แคชร่วมกันทุกหน้า) ----------
  {
    const dd = path.join(dist, 'jurisdiction-data');
    fs.mkdirSync(dd, { recursive: true });
    for (const p of provs) {
      if (!pathSet.has(`/jurisdiction/${p.slug}/`)) continue;
      const gp = geo.provinces.find((x) => x.name === p.name);
      fs.writeFileSync(path.join(dd, `${p.slug}.json`), JSON.stringify({ province: gp, jur: { asOf: D.jurisdiction?.asOf, provinces: jurP[p.name] ? { [p.name]: jurP[p.name] } : {} } }));
    }
    fs.writeFileSync(path.join(dd, 'courts.json'), JSON.stringify(D.courts));
  }

  // ---------- เขียนไฟล์ ----------
  const urls = [];
  for (const p of pages) {
    const dir = path.join(dist, ...p.path.split('/').filter(Boolean));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), T.layout(p));
    urls.push({ path: p.path, lastmod: p.lastmod, priority: p.priority });
  }
  urls.sort((a, b) => Number(b.priority) - Number(a.priority) || a.path.localeCompare(b.path));
  fs.writeFileSync(path.join(dist, 'seo-urls.json'), JSON.stringify(urls));

  // ---------- แม่แบบหน้าเฉพาะต่อฎีกา (ไม่ใช่หน้าใน sitemap; api/precedent.js แทนค่า @@PX_*@@ ด้วยข้อมูลจาก Aiven ตอนมีคนเปิด) ----------
  {
    const shell = T.layout({ path: '/precedents/@@PX_SLUG@@/', title: '@@PX_TITLE@@', description: '@@PX_DESC@@', crumbs: [['ฎีกา', '/precedents/'], ['@@PX_CRUMB@@', '/precedents/@@PX_SLUG@@/']], nav: 'precedents', main: '@@PX_MAIN@@', lastmod: DATA_DATE });
    fs.mkdirSync(path.join(dist, '_px'), { recursive: true });
    fs.writeFileSync(path.join(dist, '_px', 'precedent.html'), shell);
  }
  const count = (t) => pages.filter((p) => p.type === t).length;
  const counts = { jurisdictionHub: 1, provinces: count('prov'), lawsHub: 1, laws: count('law'), items: count('item'), procedureHub: 1, procedure: count('proc'), precedentsHub: 1, total: pages.length, skipped: skipped.length };

  // ---------- หน้าแรก: แทนที่จุดแทรก (หัวเว็บ + สารบัญข้อมูลกฎหมายที่เป็น HTML จริง) ----------
  injectHome({ dist, site, items, provs, lawIds, lawSlug, lawClean, lawShort, itemsByLaw, itemById, artFreq, procSections, pathSet, counts, itemSlugPath: (it) => `/laws/${it.slug}/`, provPath: (p) => `/jurisdiction/${p.slug}/` });

  const hubs = pages.filter((p) => p.type === 'hub').map((p) => ({ path: p.path, title: p.title, description: p.description }));
  console.log(`หน้า SEO: ${counts.total} หน้า (จังหวัด ${counts.provinces} · กฎหมาย ${counts.laws} · ข้อหา/มาตรา ${counts.items} · มาตราวิธีพิจารณา ${counts.procedure} · hub 4) ข้าม ${skipped.length} หน้าที่เนื้อหาบาง · ${Date.now() - t0} ms`);
  return { counts, hubs, urls, skipped };
}

function injectHome({ dist, site, items, provs, lawIds, lawSlug, lawClean, lawShort, itemsByLaw, itemById, artFreq, procSections, pathSet, counts, itemSlugPath, provPath }) {
  const hp = path.join(dist, 'index.html');
  let html = fs.readFileSync(hp, 'utf8');
  const popular = [...artFreq.entries()].filter(([id]) => itemById.has(id) && pathSet.has(itemSlugPath(itemById.get(id)))).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => itemById.get(id));
  const lawsWithPage = lawIds.filter((l) => pathSet.has(`/laws/${lawSlug.get(l)}/`));
  const directory = `<!-- สารบัญข้อมูลกฎหมาย: HTML สถิตที่สร้างตอน build (scripts/build-seo-pages.js) ให้เสิร์ชเอนจินอ่านได้โดยไม่ต้องรัน JS -->
  <section class="sec alt dir" id="directory" aria-labelledby="dirTitle">
    <div class="wrap">
      <header class="sec-head">
        <p class="eyebrow">สารบัญข้อมูลกฎหมาย</p>
        <h2 id="dirTitle">ข้อมูลกฎหมายทั้งหมด.<br>แยกเป็นหน้า ค้นง่าย.</h2>
        <p class="lead">มาตรา ระวางโทษ อายุความ เขตอำนาจศาลรายจังหวัด ขั้นตอนฟ้องคดี และฎีกา — เปิดอ่านได้ทุกหน้า แชร์ลิงก์ได้</p>
      </header>
      <div class="sp-grid">
        <a class="sp-card" href="/laws/"><b>ข้อกฎหมายและมาตรา</b><span>${fmt(items.length)} มาตรา จาก ${fmt(lawIds.length)} ฉบับ พร้อมระวางโทษ อายุความ</span><small>ดูทั้งหมด ›</small></a>
        <a class="sp-card" href="/jurisdiction/"><b>เขตอำนาจศาล</b><span>ศาลที่รับฟ้องรายอำเภอ/เขต ${fmt(provs.length)} จังหวัด พร้อมเบอร์โทรศัพท์ศาล</span><small>ดูทั้งหมด ›</small></a>
        <a class="sp-card" href="/procedure/"><b>ขั้นตอนฟ้องคดี</b><span>จากยื่นฟ้องถึงคำพิพากษา และ ${fmt(procSections.length)} มาตราวิธีพิจารณาที่ใช้บ่อย</span><small>ดูทั้งหมด ›</small></a>
        <a class="sp-card" href="/precedents/"><b>ฎีกา</b><span>ค้นหาและอ่านคำพิพากษาศาลฎีกา พร้อมหน้าของแต่ละฎีกา</span><small>ดูทั้งหมด ›</small></a>
      </div>
      ${popular.length ? `<h3>ข้อหาที่ค้นหาบ่อย</h3>
      <ul class="sp-links">${popular.map((it) => `<li><a href="${itemSlugPath(it)}"><b>ม.${esc(it.section)}</b><span>${esc(trunc(it.name, 60))} <small class="fine">${esc(lawShort(it.lawId))}</small></span></a></li>`).join('')}</ul>` : ''}
      <h3>กฎหมายแต่ละฉบับ</h3>
      <ul class="provgrid">${lawsWithPage.map((l) => `<li><a href="/laws/${lawSlug.get(l)}/"><span>${esc(lawShort(l))}</span><small>${fmt(itemsByLaw.get(l).length)} มาตรา</small></a></li>`).join('')}</ul>
      <h3>เขตอำนาจศาลตามจังหวัด</h3>
      <ul class="provgrid">${provs.map((p) => `<li><a href="${provPath(p)}"><span>${esc(p.name)}</span><small>${fmt(p.nDist)} ${p.W.d}</small></a></li>`).join('')}</ul>
      <p class="actions" style="justify-content:flex-start"><a class="link-arrow" href="/jurisdiction/">เขตอำนาจศาลทุกจังหวัด</a><a class="link-arrow" href="/laws/">ข้อกฎหมายทั้งหมด</a><a class="link-arrow" href="/procedure/">ขั้นตอนฟ้องคดี</a><a class="link-arrow" href="/precedents/">ฎีกาทั้งหมด</a></p>
    </div>
  </section>`;
  const title = 'Law Craft · สำนักงานกฎหมาย ลอว์คราฟต์ Law Craft Legal Consultants';
  const desc = 'ฐานความรู้กฎหมายไทย ประมวลกฎหมาย เขตอำนาจศาล ขั้นตอนฟ้องคดี และบริการร่างคำฟ้องตามแบบพิมพ์ศาลยุติธรรม';
  const head = `<link rel="canonical" href="${site}/">
<meta name="robots" content="index,follow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Law Craft Legal Consultants">
<meta property="og:locale" content="th_TH">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${site}/">
<meta property="og:image" content="${site}/apple-touch-icon.png">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Law Craft Legal Consultants', alternateName: 'สำนักงานกฎหมาย ลอว์คราฟต์', url: `${site}/`, inLanguage: 'th-TH' })}</script>`;
  const had = html.includes('<!--SEO-DIRECTORY-->') && html.includes('<!--SEO-HEAD-->');
  if (!had) console.warn('seo: public/index.html ไม่มีจุดแทรก <!--SEO-HEAD--> / <!--SEO-DIRECTORY-->');
  html = html.replace('<!--SEO-HEAD-->', () => head).replace('<!--SEO-DIRECTORY-->', () => directory);
  fs.writeFileSync(hp, html);
}
