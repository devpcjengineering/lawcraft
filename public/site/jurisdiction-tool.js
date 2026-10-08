// เครื่องมือค้นหาเขตอำนาจศาล (เลือกประเภทคดี → จังหวัด → อำเภอ/เขต → ตำบล/แขวง แล้วแสดงศาลที่มีเขตอำนาจ)
// ใช้ร่วมกันทุกที่: หน้าแรก (public/site/site.js) และหน้า SEO สถิต /jurisdiction/ + /jurisdiction/<จังหวัด>/ (public/site/jurisdiction-page.js)
//
//   mountJurisdictionTool(el, {
//     province,        // ชื่อจังหวัดที่เลือกไว้ล่วงหน้า (เช่น 'ชัยภูมิ')
//     lockProvince,    // true = แสดงจังหวัดเป็นข้อความ (ไม่ให้เปลี่ยน) + ลิงก์ "เลือกจังหวัดอื่น"
//     persist,         // จำค่าที่เลือกใน localStorage (ค่าเริ่มต้น true; หน้าจังหวัดใช้ false)
//     reveal,          // ใส่คลาส .reveal ให้การ์ด (หน้าแรกใช้กับตัวสังเกตการเลื่อน) + onRender() เรียกหลังวาดส่วนที่มี .reveal
//     rulesEl,         // (ไม่บังคับ) องค์ประกอบที่ให้วาดการ์ด "หลักเลือกศาล" ตามประเภทคดี
//     courts,          // (ไม่บังคับ) ข้อมูลศาล {groups:[…]} ที่โหลดไว้แล้ว
//     dataUrl,         // (ไม่บังคับ) JSON สถิตเฉพาะจังหวัด {province, jur} (หน้า SEO) — ไม่ระบุ = โหลดทุกจังหวัดจากฐานข้อมูลเหมือนหน้าแรก
//     courtsUrl,       // (ใช้คู่กับ dataUrl) JSON รายชื่อศาลทั้งประเทศ
//     lazy,            // true = เริ่มโหลดข้อมูลเมื่อว่าง/เมื่อผู้ใช้แตะ (ลดน้ำหนักหน้าที่ข้อมูลใหญ่)
//     moreHref,        // ลิงก์ "ค้นหาจังหวัดอื่น" ของโหมดล็อกจังหวัด
//   })  →  { ready: Promise, set({jt, prov, dist, sub}) }
// พฤติกรรมและข้อความผลลัพธ์เหมือนเดิมทุกประการกับที่เคยอยู่ใน site.js
import { JURISDICTION_RULES as RULES } from './jurisdiction-rules.js';

const LS_J = 'th-law:jurisdiction:v1';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

const THAI = '\\u0E00-\\u0E7F';
const nameHasProv = (n, p) => new RegExp(`${p}(?![${THAI}])`).test(n);
const stripPrefix = (s) => String(s).replace(/^(?:จังหวัด|อำเภอ|เขต|อ\.)\s*/, '').trim();
const wording = (p) => (p?.kind === 'bkk' ? { d: 'เขต', s: 'แขวง', prov: '' } : { d: 'อำเภอ', s: 'ตำบล', prov: 'จังหวัด' });

// ---- จับคู่ศาลจากชื่อ ----
const compat = (c, jt) => c.scope !== 'appeal' && !(c.scope === 'criminal' && jt === 'civil') && !(c.scope === 'civil' && jt === 'criminal');
const catOf = (c) => (/เยาวชนและครอบครัว/.test(c.name) ? 'youth' : (c.type === 'ศาลแขวง' || /^ศาลแขวง/.test(c.name)) ? 'mag' : c.scope === 'special' ? 'special' : 'main');
const placeOf = (n) => n.replace(/^ศาล(?:เยาวชนและครอบครัวจังหวัด|เยาวชนและครอบครัว|จังหวัด|แขวง|แพ่ง|อาญา)/, '');
function districtMatches(courtName, distName) {
  const place = placeOf(courtName);
  if (!place) return false;
  const full = distName.trim(), bare = full.replace(/^เมือง(?=.)/, '');
  if (place === full || place === bare) return true;
  return new RegExp(`^${full}(?:เหนือ|ใต้|ตะวันออก|ตะวันตก|กลาง)$`).test(place);
}
function nameMatchCourts(allCourts, p, d, jt) {
  const bkk = p.kind === 'bkk';
  const inProv = (c) => (bkk ? (/กรุงเทพมหานคร/.test(c.group) || (c.scope === 'special' && /กลาง/.test(c.name))) : nameHasProv(c.name, p.name));
  const set = new Set(allCourts.filter((c) => compat(c, jt) && inProv(c)));
  if (d) {
    // ศาลที่ชื่อเป็นอำเภอ/เขต แต่ไม่มีชื่อจังหวัด (เช่น ศาลจังหวัดเทิง) — ค้นในภาคเดียวกันและกลุ่มศาลเพิ่มเติม
    const regions = new Set(allCourts.filter((c) => /^ศาลชั้นต้น/.test(c.group) && inProv(c)).map((c) => c.group));
    allCourts.forEach((c) => { if (!set.has(c) && compat(c, jt) && (regions.has(c.group) || /เพิ่มเติม/.test(c.group)) && districtMatches(c.name, d.name)) set.add(c); });
  }
  const list = [...set].map((c) => ({ ...c, cat: catOf(c), hl: !!d && districtMatches(c.name, d.name) }));
  return list.sort((a, b) => b.hl - a.hl);
}

// ---- jurisdiction.json ----
function jurLists(jur, p, d) {
  if (!jur?.provinces || !p) return { jp: null, jd: null };
  const key = Object.keys(jur.provinces).find((k) => stripPrefix(k) === stripPrefix(p.name));
  const jp = key ? jur.provinces[key] : null;
  if (!jp) return { jp: null, jd: null };
  let jd = null;
  if (d && jp.districts) {
    const dk = Object.keys(jp.districts).find((k) => stripPrefix(k) === stripPrefix(d.name));
    if (dk && Array.isArray(jp.districts[dk]) && jp.districts[dk].length) jd = jp.districts[dk];
  }
  return { jp: Array.isArray(jp.default) && jp.default.length ? jp : { ...jp, default: [] }, jd };
}

// ---- สร้างผลลัพธ์ ----
const SCOPE_TXT = { criminal: 'รับคดีอาญา', civil: 'รับคดีแพ่ง' };
function courtCard(c, i, W) {
  const badges = [];
  if (c.verified === true) badges.push('<span class="badge ok">✓ ยืนยันแล้ว</span>');
  else if (c.verified === false) badges.push('<span class="badge pending">ยังไม่ยืนยัน</span>');
  if (c.hl) badges.push(`<span class="badge match">ชื่อตรงกับ${W.d}ที่เลือก</span>`);
  const sub = [c.phone ? `โทร ${c.phone}` : '', SCOPE_TXT[c.scope], c.note].filter(Boolean);
  return `<div class="court${c.hl ? ' hl' : ''}" style="--i:${i}"><span class="cn">${esc(c.name)}</span>${badges.length ? `<span>${badges.join(' ')}</span>` : ''}${sub.map((s) => `<small>${esc(s)}</small>`).join('')}</div>`;
}
function section(title, list, W, ctx) {
  if (!list.length) return '';
  const i = ctx.n++;
  return `<section class="jsec${ctx.minor ? ' minor' : ''}" style="--i:${i}"><h3>${esc(title)}</h3><div class="court-list">${list.map((c, k) => courtCard(c, k, W)).join('')}</div></section>`;
}
function buildBody({ jur, allCourts, jt }, p, d) {
  const W = wording(p), where = p.kind === 'bkk' ? p.name : `จังหวัด${p.name}`;
  const caseTxt = jt === 'criminal' ? 'คดีอาญา' : 'คดีแพ่ง';
  const { jp, jd } = jurLists(jur, p, d);
  const named = nameMatchCourts(allCourts, p, d, jt);
  const ctx = { n: 0, minor: false };
  let html = '', count = 0;

  const jurFiltered = (arr) => arr.filter((c) => compat(c, jt)).map((c) => ({ ...c, cat: catOf(c) }));
  const minors = (exclude) => {
    const skip = new Set(exclude.map((c) => c.name));
    const pick = (cat) => named.filter((c) => c.cat === cat && !skip.has(c.name));
    ctx.minor = true;
    const mag = pick('mag'), youth = pick('youth'), sp = pick('special');
    count += mag.length + youth.length + sp.length;
    return section(`ศาลแขวงใน${where}`, mag, W, ctx) + section('ศาลเยาวชนและครอบครัว', youth, W, ctx) + section('ศาลชำนัญพิเศษ', sp, W, ctx);
  };

  const jdAll = jd ? jd.map((c) => ({ ...c, cat: c.scope === 'appeal' || c.type === 'appeal' ? 'appeal' : catOf(c) })).filter((c) => c.cat === 'appeal' || compat(c, jt)) : [];
  if (jdAll.length) {
    // 1) มีข้อมูลรายอำเภอ (ระบบสืบค้นเขตอำนาจศาลของสำนักงานศาลยุติธรรม) — แสดงตามหมวดศาล ไม่เติมศาลจากการเทียบชื่อ
    count += jdAll.length;
    const by = (cat) => jdAll.filter((c) => c.cat === cat);
    html += section(`ศาลชั้นต้นที่มีเขตอำนาจใน${W.d}นี้`, by('main'), W, ctx);
    ctx.minor = true;
    html += section('ศาลแขวง', by('mag'), W, ctx) + section('ศาลเยาวชนและครอบครัว', by('youth'), W, ctx)
      + section('ศาลชำนัญพิเศษ', by('special'), W, ctx) + section('ศาลอุทธรณ์', by('appeal'), W, ctx);
    const asOf = jur?.asOf ? new Date(jur.asOf + 'T00:00:00').toLocaleDateString('th-TH', { dateStyle: 'long' }) : '';
    html += `<div class="jwarn">ข้อมูลจากระบบสืบค้นเขตอำนาจศาลของสำนักงานศาลยุติธรรม${asOf ? ` ยืนยันข้อมูลอัปเดตล่าสุด ${asOf}` : ''} ตรวจสอบกับศาลหรือสำนักงานศาลยุติธรรมก่อนยื่นฟ้องทุกครั้ง</div>`;
  } else if (jp?.default?.length) {
    // 2) มีเฉพาะศาลหลักของจังหวัด
    const def = jurFiltered(jp.default);
    count += def.length;
    html += section('ศาลหลักของจังหวัด', def, W, ctx);
    const hasDistData = jp.districts && Object.keys(jp.districts).length;
    html += `<div class="jwarn">${d
      ? `ยังไม่มีข้อมูลเขตอำนาจรายอำเภอสำหรับ${W.d}${esc(d.name)} ศาลข้างต้นเป็นศาลหลักของจังหวัด ศาลอื่นในจังหวัดอาจมีเขตอำนาจเหนือ${W.d}นี้ โปรดตรวจสอบกับสำนักงานศาลยุติธรรม`
      : hasDistData ? `เลือก${W.d}เพื่อดูศาลที่มีเขตอำนาจเฉพาะพื้นที่ ข้อมูลข้างต้นเป็นศาลหลักของจังหวัดเท่านั้น` : 'ยังไม่มีข้อมูลเขตอำนาจรายอำเภอ ข้อมูลข้างต้นเป็นศาลหลักของจังหวัดเท่านั้น'}</div>`;
    html += minors(def);
  } else {
    // 3) fallback: จับคู่ชื่อศาล
    const main = named.filter((c) => c.cat === 'main');
    count += main.length;
    html += main.length
      ? section(`ศาลชั้นต้นที่รับฟ้อง${caseTxt}ในพื้นที่`, main, W, ctx)
      : `<p class="fine" style="margin:18px 0 0">ไม่พบศาลในรายการสำหรับ${esc(where)} — โปรดตรวจสอบกับสำนักงานศาลยุติธรรม</p>`;
    const hits = named.filter((c) => c.hl).length;
    html += `<div class="jwarn">ยังไม่มีข้อมูลเขตอำนาจรายอำเภอ ระบบจับคู่จากชื่อศาลในจังหวัดเท่านั้น${d ? (hits ? ` ศาลที่ชื่อตรงกับ${W.d}${esc(d.name)}ถูกไฮไลต์ไว้ก่อน แต่ไม่ได้ยืนยันว่า${W.d}นี้อยู่ในเขตศาลนั้น` : ` ไม่พบศาลที่ชื่อตรงกับ${W.d}${esc(d.name)}`) : ` เลือก${W.d}เพื่อไฮไลต์ศาลที่ชื่อตรงกับพื้นที่`} โปรดตรวจสอบกับสำนักงานศาลยุติธรรม</div>`;
    html += minors([]);
  }
  return { html, count };
}

let uidSeq = 0;
const once = (fn) => { let p; return () => (p ||= fn()); };

export function mountJurisdictionTool(root, opts = {}) {
  const uid = ++uidSeq;
  const o = { persist: true, moreHref: '/jurisdiction/', ...opts };
  const locked = !!(o.lockProvince && o.province);
  const J = { jt: 'criminal', prov: '', dist: '', sub: '' };
  let provinces = [], jur = null, allCourts = [], bodyKey = '';

  root.innerHTML = `<div class="finder${o.reveal ? ' reveal' : ''}" data-jt>
    <div class="finder-top">
      <div class="seg" role="radiogroup" aria-label="ประเภทคดี">
        <label><input type="radio" name="jt-${uid}" value="criminal" checked><span>คดีอาญา</span></label>
        <label><input type="radio" name="jt-${uid}" value="civil"><span>คดีแพ่ง</span></label>
      </div>
      <button type="button" class="btn-pill ghost sm" data-r="reset" hidden>ล้างค่า</button>
    </div>
    <div class="fields">
      ${locked
    ? `<div class="sel"><span>จังหวัด<small data-r="provHint">ที่เกิดเหตุ / ภูมิลำเนาจำเลย</small></span><div class="sel-fixed"><b>${esc(o.province)}</b><a href="${esc(o.moreHref)}">เลือกจังหวัดอื่น</a></div></div>`
    : `<label class="sel"><span>จังหวัด<small data-r="provHint">ที่เกิดเหตุ / ภูมิลำเนาจำเลย</small></span><select data-r="prov" disabled><option value="">กำลังโหลดรายชื่อจังหวัด…</option></select></label>`}
      <label class="sel"><span><b data-r="distLabel">อำเภอ/เขต</b><small>ใช้กำหนดศาลที่มีเขตอำนาจ</small></span><select data-r="dist" disabled><option value="">เลือกจังหวัดก่อน</option></select></label>
      <label class="sel"><span><b data-r="subLabel">ตำบล/แขวง</b><small>ไม่บังคับ — ใช้แสดงรหัสไปรษณีย์</small></span><select data-r="sub" disabled><option value="">เลือกอำเภอ/เขตก่อน</option></select></label>
    </div>
    <div class="court-out" data-r="out"></div>
    <p class="sr-only" data-r="status" role="status" aria-live="polite"></p>
  </div>`;
  const $ = (k) => root.querySelector(`[data-r=${k}]`);
  const provSel = $('prov'), distSel = $('dist'), subSel = $('sub'), resetBtn = $('reset'), out = $('out');
  const radios = [...root.querySelectorAll('input[type=radio]')];

  const curProv = () => provinces.find((p) => p.name === J.prov);
  const curDist = () => curProv()?.districts.find((d) => d.name === J.dist);
  const curSub = () => curDist()?.subs.find((s) => s.name === J.sub);
  const saveJ = () => { if (o.persist) store.set(LS_J, { jt: J.jt, prov: J.prov, dist: J.dist, sub: J.sub }); };
  const notify = () => { try { o.onRender?.(); } catch { /* ignore */ } };

  function renderRules() {
    if (o.rulesEl) {
      o.rulesEl.innerHTML = RULES[J.jt].map(([h, p, r]) => `<div class="rule${o.reveal ? ' reveal' : ''}"><h3>${esc(h)}</h3><p>${esc(p)}</p><p class="fine" style="margin-top:8px">${esc(r)}</p></div>`).join('');
      notify();
    }
    $('provHint').textContent = J.jt === 'criminal' ? 'ที่เกิดเหตุ / ที่อยู่จำเลย' : 'ภูมิลำเนาจำเลย / ที่เกิดมูลคดี';
  }

  function setSel(sel, placeholder, names, current, disabled) {
    sel.innerHTML = `<option value="">${esc(placeholder)}</option>` + names.map((n, i) => `<option value="${i}"${n === current ? ' selected' : ''}>${esc(n)}</option>`).join('');
    sel.disabled = disabled;
    if (!current) sel.value = '';
  }
  function syncSelects() {
    const p = curProv(), W = wording(p), d = curDist();
    // หัวช่องเขียนเต็ม “อำเภอ/เขต” และ “ตำบล/แขวง” เสมอ (ในผลลัพธ์ใช้คำที่ถูกต้องตามจังหวัด: กรุงเทพฯ = เขต/แขวง)
    $('distLabel').textContent = 'อำเภอ/เขต';
    $('subLabel').textContent = 'ตำบล/แขวง';
    if (!p) setSel(distSel, 'เลือกจังหวัดก่อน', [], '', true);
    else setSel(distSel, `เลือก${W.d}…`, p.districts.map((x) => x.name), J.dist, false);
    if (!d) setSel(subSel, p ? `เลือก${W.d}ก่อน` : 'เลือกอำเภอ / เขตก่อน', [], '', true);
    else setSel(subSel, `ไม่ระบุ${W.s}`, d.subs.map((x) => x.name), J.sub, false);
    resetBtn.hidden = locked ? !J.dist : !J.prov;
  }

  let loading = true;
  function renderResult() {
    const p = curProv();
    if (!p) {
      bodyKey = '';
      out.innerHTML = `<p class="jhint">${provinces.length ? 'เริ่มจากเลือกจังหวัด แล้วเลือกอำเภอ / เขต เพื่อดูศาลที่มีเขตอำนาจ' : loading ? 'กำลังโหลดข้อมูลศาล…' : ''}</p>`;
      $('status').textContent = '';
      return;
    }
    const W = wording(p), d = curDist(), s = curSub();
    const where = p.kind === 'bkk' ? p.name : `จังหวัด${p.name}`;
    const addr = [s && `${W.s}${s.name}`, d && `${W.d}${d.name}`, where].filter(Boolean).join(' ');
    let zip = '';
    if (s?.zip) zip = s.zip;
    else if (d) { const z = [...new Set(d.subs.map((x) => x.zip).filter(Boolean))]; zip = z.length > 3 ? `${z.slice(0, 3).join(', ')} …` : z.join(', '); }

    let card = $('card');
    if (!card) {
      out.innerHTML = '<div class="jcard" data-r="card"><div class="jhead" data-r="head"></div><div data-r="body"></div></div>';
      card = $('card'); bodyKey = '';
    }
    $('head').innerHTML = `<div><span class="k">ที่อยู่ที่เลือก · ${J.jt === 'criminal' ? 'คดีอาญา' : 'คดีแพ่ง'}</span>
    <p class="addr">${s ? `<span class="muted">${esc(W.s)}</span>${esc(s.name)} ` : ''}${d ? `<span class="muted">${esc(W.d)}</span>${esc(d.name)} ` : ''}${p.kind === 'bkk' ? '' : '<span class="muted">จังหวัด</span>'}${esc(p.name)}</p></div>${zip ? `<span class="zip">รหัสไปรษณีย์ <b>${esc(zip)}</b></span>` : ''}`;

    const { html, count } = buildBody({ jur, allCourts, jt: J.jt }, p, d);
    const key = `${J.jt}|${J.prov}|${J.dist}|${html}`;
    if (key !== bodyKey) { bodyKey = key; $('body').innerHTML = html; }
    $('status').textContent = `${addr} — แสดงศาล ${count} รายการ`;
  }

  function onChange() { syncSelects(); renderResult(); saveJ(); }
  radios.forEach((r) => r.addEventListener('change', () => { if (!r.checked) return; J.jt = r.value; renderRules(); renderResult(); saveJ(); }));
  const pick = (sel, arr) => (sel.value === '' ? '' : arr?.[+sel.value]?.name ?? '');
  provSel?.addEventListener('change', () => { J.prov = pick(provSel, provinces); J.dist = ''; J.sub = ''; onChange(); });
  distSel.addEventListener('change', () => { J.dist = pick(distSel, curProv()?.districts); J.sub = ''; onChange(); });
  subSel.addEventListener('change', () => { J.sub = pick(subSel, curDist()?.subs); onChange(); });
  resetBtn.addEventListener('click', () => {
    if (locked) { J.dist = J.sub = ''; onChange(); distSel.focus(); return; }
    J.prov = J.dist = J.sub = ''; setProvOptions(); onChange(); provSel.focus();
  });

  function setProvOptions() {
    if (!provSel) return;
    provSel.innerHTML = '<option value="">เลือกจังหวัด…</option>' + provinces.map((p, i) => `<option value="${i}"${p.name === J.prov ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    provSel.disabled = !provinces.length;
    if (!J.prov) provSel.value = '';
  }

  async function fetchJson(u) { const r = await fetch(u); if (!r.ok) throw new Error(r.status); return r.json(); }
  async function loadAll() {
    if (o.dataUrl) {
      const [d, courts] = await Promise.all([fetchJson(o.dataUrl), o.courts ? o.courts : o.courtsUrl ? fetchJson(o.courtsUrl).catch(() => null) : null]);
      return { geo: { provinces: d.province ? [d.province] : [] }, jur: d.jur || null, courts };
    }
    const { loadGeo, loadJurisdiction, loadCourts } = await import('/js/public-data.js');
    const [geo, jr, courts] = await Promise.all([loadGeo().catch(() => null), loadJurisdiction(), o.courts ? o.courts : loadCourts()]);
    return { geo, jur: jr, courts };
  }

  async function init() {
    if (provSel) provSel.disabled = true;
    let d;
    try { d = await loadAll(); } catch { d = { geo: null, jur: null, courts: null }; }
    loading = false;
    jur = d.jur;
    allCourts = (d.courts?.groups || []).flatMap((g) => (g.courts || []).map((c) => ({ ...c, group: g.group || '' })));
    provinces = Array.isArray(d.geo?.provinces) ? d.geo.provinces : [];
    if (!provinces.length) {
      if (provSel) provSel.innerHTML = '<option value="">โหลดรายชื่อจังหวัดไม่สำเร็จ</option>';
      out.innerHTML = '<div class="jhint"><p style="margin:0 0 10px">โหลดข้อมูลจังหวัดไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองใหม่</p><button type="button" class="btn-pill ghost sm" data-r="retry">ลองใหม่</button></div>';
      $('retry').addEventListener('click', () => { loading = true; started = once(init); started(); });
      return;
    }
    // คืนค่าล่าสุด (ตรวจว่ายังมีอยู่ในข้อมูล) — หน้าจังหวัดล็อกจังหวัดไว้ จึงอ่านเฉพาะประเภทคดี
    const saved = store.get(LS_J);
    if (saved.jt === 'criminal' || saved.jt === 'civil') J.jt = saved.jt;
    const want = o.province || (o.persist ? saved.prov : '');
    const sp = provinces.find((p) => p.name === want);
    if (sp) {
      J.prov = sp.name;
      if (!o.province && o.persist) {
        const sd = sp.districts.find((x) => x.name === saved.dist);
        if (sd) { J.dist = sd.name; if (sd.subs.some((s) => s.name === saved.sub)) J.sub = saved.sub; }
      }
    }
    if (o.dist && sp) { const sd = sp.districts.find((x) => x.name === o.dist); if (sd) J.dist = sd.name; }
    radios.forEach((r) => { r.checked = r.value === J.jt; });
    renderRules(); setProvOptions(); syncSelects(); renderResult();
  }

  let started = once(init);
  renderRules();
  renderResult();
  if (o.lazy) {
    const go = () => started();
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 2500 }); else setTimeout(go, 1200);
    root.addEventListener('pointerover', go, { once: true });
    root.addEventListener('focusin', go, { once: true });
  } else started();

  const api = {
    get ready() { return started(); },
    set(v = {}) {
      if (v.jt === 'criminal' || v.jt === 'civil') { J.jt = v.jt; radios.forEach((r) => { r.checked = r.value === J.jt; }); }
      if (!locked && v.prov !== undefined) { J.prov = v.prov; J.dist = ''; J.sub = ''; setProvOptions(); }
      if (v.dist !== undefined) { J.dist = v.dist; J.sub = ''; }
      if (v.sub !== undefined) J.sub = v.sub;
      renderRules(); onChange();
    },
  };
  root._jurisdictionTool = api;
  return api;
}
