// เช็กอัตราค่านำหมาย — ข้อมูลอยู่บน Supabase (RPC service_fee_*) ; โหมด local (ไม่ตั้ง Supabase) ใช้ไฟล์ /data/service-fees/ ที่ server/index.js เสิร์ฟให้ — ดู shared/service-fee.js
// แถวข้อมูล: [ศาล, อำเภอ, ตำบล, หมู่, ค่านำหมาย, ลำดับหมายเหตุ(-1=ไม่มี), วันที่เริ่ม]
import { loadProvinceRows, listServiceFeeProvinces, loadServiceFeeMeta, searchServiceFeeCourts, setServiceFeeBackend, courtKey } from '/shared/service-fee.js';
import appConfig from '/js/config.js';
setServiceFeeBackend(appConfig?.supabase);
const EMS_FEE = 80;
const ZERO_NOTE = 'อัตรา 0 บาท อาจหมายถึงศาลยังไม่ได้ตั้งค่า — ตรวจกับศาล';
const METHODS = [
  ['officer', 'เจ้าพนักงานศาลนำหมาย'],
  ['ems', 'ไปรษณีย์ตอบรับด่วนพิเศษ'],
  ['self', 'ส่งเอง (โจทก์/อัยการ)'],
];

const th = new Intl.Collator('th');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n).toLocaleString('th-TH');
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const thDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${+m[1] + 543}` : ''; };
const uniq = (a) => [...new Set(a)];

// ---- โหลดข้อมูล (lazy + cache) ----
let indexP = null;
const loadIndex = () => (indexP ||= listServiceFeeProvinces().then((provinces) => ({ provinces })).catch((e) => { indexP = null; throw e; }));
const loadProvince = (name) => loadProvinceRows(name).then((d) => { if (!d) throw new Error('no data'); return d; });

/** แยกหมายเหตุที่เป็นข้อ ๆ ("1. … 2. …") ออกเป็นรายการ — แยกเฉพาะเมื่อเลขเรียง 1,2,3… ต่อเนื่อง ไม่งั้นคืนทั้งก้อน */
function splitRemark(t) {
  const re = /(\d{1,2})\s?\.\s?(?=[^\d\s])/g;
  const cuts = [];
  let want = 1, m;
  while ((m = re.exec(t))) { if (+m[1] === want) { cuts.push(m.index); want++; } }
  if (!cuts.length || cuts[0] > 12) return [t];
  const parts = [];
  if (cuts[0] > 0) parts.push(t.slice(0, cuts[0]).trim());
  cuts.forEach((c, i) => parts.push(t.slice(c, cuts[i + 1] ?? t.length).trim()));
  return parts.filter(Boolean);
}

// ---- ตัวเลือกพื้นที่ จังหวัด → อำเภอ → ตำบล → (หมู่) → (ศาล) ----
let uid = 0;
class Picker {
  constructor(root, { onChange, prefix = 'p', compact = false } = {}) {
    this.root = root; this.onChange = onChange || (() => {}); this.id = `${prefix}${++uid}`; this.compact = compact;
    this.v = { prov: '', amphur: '', tambon: '', moo: '?', court: 0, courtName: '' };
    this.courtFilter = null;   // ศาลที่เลือกจากช่องค้นหาชื่อศาล { court, provinces } → จำกัดจังหวัด/อำเภอ/ตำบลเฉพาะที่ศาลนั้นรับส่งหมาย
    this.touched = false;      // ผู้ใช้เลือกในตัวเลือกนี้เองแล้ว (ใช้กับแถวแรกของเครื่องคำนวณที่รับค่าตั้งต้นจากตัวค้นหา)
    this.data = null; this.state = { status: 'idle', matches: [], row: null, needMoo: false };
    this.render();
    loadIndex().then((ix) => { this.index = ix; this.error = ''; this.render(); this.after(); }).catch(() => { this.error = 'โหลดรายการจังหวัดไม่สำเร็จ'; this.render(); });
  }
  sel(key, label, opts, value, placeholder, disabled) {
    const id = `${this.id}-${key}`;
    return `<div class="fee-f"><label for="${id}">${label}</label><select id="${id}" data-k="${key}"${disabled ? ' disabled' : ''}><option value="">${placeholder}</option>${opts.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
  }
  areaRows() {
    if (!this.data) return [];
    const cf = this.courtFilter && courtKey(this.courtFilter.court);
    return cf ? this.data.rows.filter((r) => courtKey(r[0]) === cf) : this.data.rows;
  }
  render() {
    const v = this.v;
    if (this.error) { this.root.innerHTML = `<p class="fee-msg err" role="alert">${esc(this.error)} <button type="button" class="fee-link" data-retry>ลองอีกครั้ง</button></p>`; this.root.querySelector('[data-retry]').onclick = () => { this.error = ''; this.root.innerHTML = '<p class="fee-msg">กำลังโหลด…</p>'; loadIndex().then((ix) => { this.index = ix; this.render(); }).catch(() => { this.error = 'โหลดรายการจังหวัดไม่สำเร็จ'; this.render(); }); }; return; }
    if (!this.index) { this.root.innerHTML = '<p class="fee-msg" role="status">กำลังโหลดรายการจังหวัด…</p>'; return; }
    const rows = this.areaRows();
    const amphurs = uniq(rows.map((r) => r[1])).sort(th.compare);
    const tambons = uniq(rows.filter((r) => r[1] === v.amphur).map((r) => r[2])).sort(th.compare);
    const rowsT = rows.filter((r) => r[1] === v.amphur && r[2] === v.tambon);
    const moos = uniq(rowsT.map((r) => r[3]).filter(Boolean)).sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
    const hasBlank = rowsT.some((r) => !r[3]);
    const loading = this.loadingProv ? '<p class="fee-msg" role="status">กำลังโหลดข้อมูลจังหวัด…</p>' : '';
    const cfp = this.courtFilter?.provinces;
    let html = this.sel('prov', 'จังหวัด', this.index.provinces.filter((p) => !cfp || cfp.includes(p.name)).map((p) => [p.name, p.name]), v.prov, '— เลือกจังหวัด —');
    html += this.sel('amphur', 'อำเภอ/เขต', amphurs.map((a) => [a, a]), v.amphur, '— เลือกอำเภอ —', !v.prov || !!this.loadingProv);
    html += this.sel('tambon', 'ตำบล/แขวง', tambons.map((a) => [a, a]), v.tambon, '— เลือกตำบล —', !v.amphur);
    if (v.tambon && moos.length) {
      const mo = [...(hasBlank ? [['__all', 'ทั้งตำบล / ไม่ระบุหมู่']] : []), ...moos.map((m) => [m, `หมู่ที่ ${m}`])];
      html += this.sel('moo', 'หมู่ที่', mo, v.moo === '?' ? '' : v.moo === '' ? '__all' : v.moo, '— เลือกหมู่ที่ —');
    }
    const st = this.state;
    if (st.courtChoice) html += this.sel('court', 'ศาลที่รับส่งหมาย', st.matches.map((r, i) => [i, `${r[0]} — ${money(r[4])} บาท`]), v.court, '— เลือกศาล —');
    this.root.innerHTML = `<div class="fee-grid${this.compact ? ' compact' : ''}">${html}</div>${loading}`;
    this.root.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => this.change(s.dataset.k, s.value)));
    this.root.removeAttribute('data-loading');
  }
  async change(k, val) {
    const v = this.v;
    this.touched = true;
    if (k === 'prov') {
      v.prov = val; v.amphur = v.tambon = ''; v.moo = '?'; v.court = 0; this.data = null; this.state = { matches: [], row: null };
      if (val) await this.loadProv(); else { this.render(); this.after(); }
      return;
    }
    if (k === 'amphur') { v.amphur = val; v.tambon = ''; v.moo = '?'; v.court = 0; }
    else if (k === 'tambon') { v.tambon = val; v.moo = '?'; v.court = 0; }
    else if (k === 'moo') { v.moo = val === '__all' ? '' : val || '?'; v.court = 0; }
    else if (k === 'court') { v.court = +val || 0; v.courtName = ''; }
    this.compute(); this.render(); this.after();
    const f = this.root.querySelector(`[data-k="${k}"]`); f?.focus();
  }
  async loadProv() {
    const p = this.index.provinces.find((x) => x.name === this.v.prov);
    if (!p) return;
    this.loadingProv = true; this.render();
    try { this.data = await loadProvince(p.name); this.error = ''; }
    catch { this.data = null; this.loadingProv = false; this.v.prov = ''; this.error = `โหลดข้อมูลจังหวัด${p.name}ไม่สำเร็จ`; this.render(); this.after(); return; }
    this.loadingProv = false; this.compute(); this.render(); this.after();
    this.root.querySelector('[data-k="amphur"]')?.focus();
  }
  compute() {
    const v = this.v, rows = this.areaRows();
    const rowsT = rows.filter((r) => r[1] === v.amphur && r[2] === v.tambon);
    const hasMoo = rowsT.some((r) => r[3]);
    let matches = [], needMoo = false;
    if (!v.tambon) matches = [];
    else if (!hasMoo) matches = rowsT;
    else if (v.moo === '?') { needMoo = true; matches = []; }
    else matches = rowsT.filter((r) => r[3] === v.moo);
    // ถ้ามีหมู่อื่นและยังไม่ได้เลือก ให้ตั้งต้นเป็น "ทั้งตำบล" เมื่อมีแถวไม่ระบุหมู่
    if (hasMoo && v.moo === '?' && rowsT.some((r) => !r[3])) { v.moo = ''; needMoo = false; matches = rowsT.filter((r) => !r[3]); }
    matches = matches.slice().sort((a, b) => th.compare(a[0], b[0]));
    const fees = uniq(matches.map((r) => r[4]));
    const courtChoice = fees.length > 1;
    if (courtChoice && v.courtName) { const i = matches.findIndex((r) => r[0] === v.courtName); if (i >= 0) v.court = i; }
    const row = matches.length ? matches[courtChoice ? Math.min(v.court, matches.length - 1) : 0] : null;
    this.state = { matches, row, needMoo, courtChoice, rowsT, fees };
  }
  value() { return { ...this.v, court: 0, courtName: this.courtFilter?.court || (this.state.courtChoice && this.state.row ? this.state.row[0] : '') }; }
  /** ตั้งค่าจากโปรแกรม (เช่น ค่าตั้งต้นจากตัวค้นหา) — ไม่นับเป็นการเลือกของผู้ใช้ */
  set(val) {
    const same = val.prov && this.v.prov === val.prov && this.data;
    Object.assign(this.v, { moo: '?', court: 0, courtName: '' }, val);
    if (!val.prov) return;
    if (same) { this.compute(); this.render(); this.after(); } else this.loadProv();
  }
  /** เลือกศาลจากช่องค้นหาชื่อศาล (null = ล้าง) */
  setCourt(c) {
    this.courtFilter = c || null;
    const v = this.v;
    if (c && v.prov && !c.provinces.includes(v.prov)) { v.prov = ''; this.data = null; }
    v.amphur = v.tambon = ''; v.moo = '?'; v.court = 0; v.courtName = ''; this.state = { matches: [], row: null };
    if (c && !v.prov && c.provinces.length === 1) { v.prov = c.provinces[0]; this.loadProv(); return; }
    this.compute(); this.render(); this.after();
  }
  after() { this.onChange(this); }
  get result() { return this.state; }
}

// ---- ผลลัพธ์ของการค้นหา ----
function remarkHtml(prov, matches) {
  const texts = uniq(matches.map((r) => (prov.remarks[r[5]] || '')).filter(Boolean));
  if (!texts.length) return '';
  return `<div class="fee-remarks"><h3>หมายเหตุของศาล</h3>${texts.map((t) => { const parts = splitRemark(t); return parts.length > 1 ? `<ul>${parts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : `<p>${esc(t)}</p>`; }).join('')}</div>`;
}

function renderResult(el, picker, ix) {
  const st = picker.result, v = picker.v;
  if (!v.prov) { el.innerHTML = '<p class="fee-empty">เลือกจังหวัด อำเภอ และตำบลของผู้รับหมาย เพื่อดูค่านำหมาย</p>'; return; }
  if (!v.tambon) { el.innerHTML = '<p class="fee-empty">เลือกอำเภอและตำบลของผู้รับหมายต่อ</p>'; return; }
  if (st.needMoo) {
    const fees = uniq(st.rowsT.map((r) => r[4])).sort((a, b) => a - b);
    el.innerHTML = `<p class="fee-empty">ตำบลนี้ศาลกำหนดอัตราแยกตามหมู่ที่ — เลือก <b>หมู่ที่</b> ของผู้รับหมาย${fees.length ? ` (ช่วงอัตรา ${money(fees[0])}${fees.length > 1 ? `–${money(fees[fees.length - 1])}` : ''} บาท)` : ''}</p>${fees[0] === 0 ? `<p class="fee-msg warn">${ZERO_NOTE}</p>` : ''}`;
    return;
  }
  if (!st.row) { el.innerHTML = '<p class="fee-msg err">ไม่พบอัตราสำหรับพื้นที่นี้ — ตรวจสอบกับศาลปลายทางโดยตรง</p>'; return; }
  const r = st.row, prov = picker.data;
  const courts = st.courtChoice ? [r[0]] : uniq(st.matches.map((x) => x[0]));
  const where = `ตำบล${r[2]} อำเภอ${r[1]} จังหวัด${v.prov}${r[3] ? ` หมู่ที่ ${r[3]}` : ''}`;
  const since = r[6] ? `<li><span>มีผลตั้งแต่</span><b>${esc(thDate(r[6]))}</b></li>` : '';
  el.innerHTML = `<div class="fee-out">
    <p class="fee-where">${esc(where)}</p>
    <div class="fee-big"><b>${money(r[4])}</b><span>บาท / ผู้รับหมาย 1 ราย</span></div>
    ${r[4] === 0 ? `<p class="fee-msg warn">${ZERO_NOTE}</p>` : ''}
    <ul class="fee-facts">
      <li><span>ศาลที่รับส่งหมาย</span><b>${courts.map(esc).join('<br>')}</b></li>
      ${since}
    </ul>
    <h3>เปรียบเทียบวิธีส่งหมาย</h3>
    <div class="fee-tbl" role="region" aria-label="เปรียบเทียบวิธีส่งหมาย" tabindex="0"><table>
      <thead><tr><th scope="col">วิธีส่ง</th><th scope="col">ค่านำหมาย / ราย</th><th scope="col">หมายเหตุ</th></tr></thead>
      <tbody>
        <tr class="hl"><th scope="row" data-label="วิธีส่ง">เจ้าพนักงานศาลนำหมาย</th><td data-label="ค่านำหมาย / ราย"><b>${money(r[4])} บาท</b></td><td data-label="หมายเหตุ">ตามอัตราของศาลปลายทางข้างต้น</td></tr>
        <tr><th scope="row" data-label="วิธีส่ง">ไปรษณีย์ตอบรับด่วนพิเศษ</th><td data-label="ค่านำหมาย / ราย"><b>${EMS_FEE} บาท</b></td><td data-label="หมายเหตุ">เหมาคงที่ ต่อผู้รับหมายหนึ่งราย</td></tr>
        <tr><th scope="row" data-label="วิธีส่ง">โจทก์/อัยการนำส่งเอง</th><td data-label="ค่านำหมาย / ราย"><b>ไม่มีค่านำหมาย</b></td><td data-label="หมายเหตุ">ต้องรับผิดชอบการส่งและแสดงหลักฐานการส่งต่อศาล</td></tr>
      </tbody></table></div>
    ${remarkHtml(prov, st.courtChoice ? [r] : st.matches)}
  </div>`;
}

// ---- เครื่องคำนวณหลายผู้รับหมาย ----
class Calc {
  constructor(root, getSeed) {
    this.root = root; this.getSeed = getSeed; this.rows = []; this.n = 0;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'add') this.add();
      if (b.dataset.act === 'del') this.del(b.closest('[data-row]').dataset.row);
    });
    root.addEventListener('change', (e) => {
      const row = e.target.closest('[data-row]'); if (!row) return;
      const r = this.rows.find((x) => x.id === row.dataset.row);
      if (e.target.matches('[data-m]')) { r.method = e.target.value; this.paint(r); this.total(); }
      if (e.target.matches('[data-name]')) r.name = e.target.value;
    });
    root.addEventListener('input', (e) => { if (e.target.matches('[data-name]')) { const r = this.rows.find((x) => x.id === e.target.closest('[data-row]').dataset.row); r.name = e.target.value; this.total(); } });
    this.shell(); this.add(true);
  }
  shell() {
    this.root.innerHTML = '<div class="fee-rows" id="feeRows"></div><div class="fee-addbar"><button type="button" class="btn-pill ghost" data-act="add">+ เพิ่มผู้รับหมาย</button></div><div class="fee-total" id="feeTotal" aria-live="polite"></div>';
    this.list = this.root.querySelector('#feeRows'); this.tot = this.root.querySelector('#feeTotal');
  }
  /** แถวแรก (ถ้าผู้ใช้ยังไม่ได้เลือกเอง และมีแถวเดียว) รับพื้นที่ตั้งต้นตามที่เลือกในตัวค้นหาด้านบน */
  seedFirst(seed) {
    const r = this.rows[0];
    if (!r || this.rows.length !== 1 || r.picker?.touched || !seed?.prov) return;
    if (r.picker.index) r.picker.set(seed); else loadIndex().then(() => r.picker.set(seed));
  }
  add(first) {
    const id = `r${++this.n}`;
    const r = { id, method: 'officer', name: '', picker: null };
    this.rows.push(r);
    const el = document.createElement('article'); el.className = 'fee-row'; el.dataset.row = id; r.el = el;
    this.list.appendChild(el);
    this.draw(r);
    const seed = this.getSeed();
    r.picker = new Picker(el.querySelector('.fee-rp'), { prefix: `c${id}-`, compact: true, onChange: () => { this.fee(r); this.total(); } });
    if (seed && !first) r.picker.index ? r.picker.set(seed) : loadIndex().then(() => r.picker.set(seed));
    this.renum(); this.total();
    if (!first) el.querySelector('[data-m]')?.focus();
  }
  draw(r) {
    const i = this.rows.indexOf(r) + 1;
    r.el.innerHTML = `<div class="fee-rh"><h3 data-t>ผู้รับหมายรายที่ ${i}</h3><button type="button" class="fee-del" data-act="del" aria-label="ลบผู้รับหมายรายที่ ${i}">ลบ</button></div>
      <div class="fee-rg"><div class="fee-f"><label for="${r.id}-n">ชื่อ (ไม่บังคับ)</label><input id="${r.id}-n" type="text" data-name maxlength="80" placeholder="เช่น จำเลยที่ ${i}" value="${esc(r.name)}"></div>
      <div class="fee-f"><label for="${r.id}-m">วิธีส่งหมาย</label><select id="${r.id}-m" data-m>${METHODS.map(([k, t]) => `<option value="${k}"${r.method === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <div class="fee-rp"></div><p class="fee-rf" data-f></p>`;
  }
  renum() { this.rows.forEach((r, i) => { r.el.querySelector('[data-t]').textContent = `ผู้รับหมายรายที่ ${i + 1}`; const d = r.el.querySelector('[data-act=del]'); d.setAttribute('aria-label', `ลบผู้รับหมายรายที่ ${i + 1}`); d.hidden = this.rows.length < 2; }); }
  paint(r) { r.el.querySelector('.fee-rp').hidden = r.method !== 'officer'; this.fee(r); }
  amount(r) {
    if (r.method === 'ems') return EMS_FEE;
    if (r.method === 'self') return 0;
    return r.picker?.result.row ? r.picker.result.row[4] : null;
  }
  fee(r) {
    const a = this.amount(r), f = r.el.querySelector('[data-f]');
    r.el.querySelector('.fee-rp').hidden = r.method !== 'officer';
    if (a == null) { f.className = 'fee-rf pending'; f.innerHTML = r.picker?.result.needMoo ? 'เลือกหมู่ที่เพื่อดูอัตรา' : 'เลือกพื้นที่ของผู้รับหมายให้ครบ'; return; }
    f.className = 'fee-rf';
    const court = r.method === 'officer' ? ` <small>${esc(r.picker.result.row[0])}</small>` : r.method === 'self' ? ' <small>ไม่มีค่านำหมาย</small>' : ' <small>เหมาต่อราย</small>';
    f.innerHTML = `ค่านำหมายรายนี้ <b>${money(a)} บาท</b>${court}${a === 0 && r.method === 'officer' ? ` <small class="fee-zero">${ZERO_NOTE}</small>` : ''}`;
  }
  del(id) { if (this.rows.length < 2) return; const i = this.rows.findIndex((x) => x.id === id); this.rows[i].el.remove(); this.rows.splice(i, 1); this.renum(); this.total(); this.root.querySelector('[data-act=add]').focus(); }
  total() {
    let sum = 0, done = 0;
    const lines = this.rows.map((r, i) => {
      const a = this.amount(r); if (a != null) { sum += a; done++; }
      const m = METHODS.find((x) => x[0] === r.method)[1];
      return `<li><span>${esc(r.name.trim() || `รายที่ ${i + 1}`)} <small>${m}</small></span><b>${a == null ? '—' : `${money(a)} บาท`}</b></li>`;
    });
    const miss = this.rows.length - done, zero = this.rows.filter((r) => r.method === 'officer' && this.amount(r) === 0).length;
    this.tot.innerHTML = `<ul class="fee-lines">${lines.join('')}</ul><div class="fee-sum"><span>ยอดรวมค่านำหมาย (${this.rows.length} ราย)</span><b>${money(sum)} บาท</b></div>${zero ? `<p class="fee-msg warn">${ZERO_NOTE} (${zero} ราย)</p>` : ''}${miss ? `<p class="fee-msg warn">ยังเลือกพื้นที่ไม่ครบ ${miss} ราย — ยอดรวมนี้ยังไม่รวมรายเหล่านั้น</p>` : ''}<p class="fee-fine">คิดรายผู้รับหมายเต็มอัตรา ยังไม่หักตามหมายเหตุของศาล (เช่น ผู้รับหมายอยู่บ้านเดียวกัน) และไม่รวมค่าปิดประกาศ — ตรวจสอบกับศาลก่อนวางเงิน</p>`;
  }
}

// ---- ค้นหาจากชื่อศาล ----
class CourtSearch {
  constructor(root, onPick) {
    this.root = root; this.onPick = onPick; this.picked = null; this.seq = 0;
    root.innerHTML = `<div class="fee-f"><label for="feeCourtQ">ค้นหาจากชื่อศาล (ไม่บังคับ)</label>
      <input id="feeCourtQ" type="search" autocomplete="off" maxlength="60" placeholder="เช่น เบตง · ปัว · ตลิ่งชัน · ศาลแขวงเชียงใหม่" role="combobox" aria-expanded="false" aria-controls="feeCourtL" aria-autocomplete="list"></div>
      <ul id="feeCourtL" class="fee-court-list" role="listbox" hidden></ul><p class="fee-court-chip" hidden></p><p class="fee-msg err" role="alert" hidden></p>`;
    this.q = root.querySelector('input'); this.list = root.querySelector('ul'); this.chip = root.querySelector('.fee-court-chip'); this.err = root.querySelector('.fee-msg');
    let t; this.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => this.search(), 250); });
    this.q.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    this.list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) this.pick(this.items[+b.dataset.i]); });
    this.chip.addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) this.clear(); });
  }
  close() { this.list.hidden = true; this.q.setAttribute('aria-expanded', 'false'); }
  async search() {
    const text = this.q.value.trim(), seq = ++this.seq;
    this.err.hidden = true;
    if (courtKey(text).replace(/^ศาล/, '').length < 1) { this.close(); return; }
    try {
      const items = await searchServiceFeeCourts(text);
      if (seq !== this.seq) return;
      this.items = items;
      this.list.innerHTML = items.length
        ? items.map((c, i) => `<li role="option"><button type="button" data-i="${i}"><b>${esc(c.court)}</b><small>${esc(c.kind)} · ${c.provinces.length > 2 ? `${esc(c.provinces.slice(0, 2).join(', '))} +${c.provinces.length - 2}` : esc(c.provinces.join(', '))} · ${c.n_places.toLocaleString('th-TH')} รายการ</small></button></li>`).join('')
        : '<li class="empty">ไม่พบศาลที่ชื่อตรงกับที่พิมพ์</li>';
      this.list.hidden = false; this.q.setAttribute('aria-expanded', 'true');
    } catch { if (seq === this.seq) { this.close(); this.err.textContent = 'ค้นหาศาลไม่สำเร็จ ลองอีกครั้ง'; this.err.hidden = false; } }
  }
  pick(c) {
    if (!c) return;
    this.picked = c; this.close(); this.q.value = '';
    this.chip.innerHTML = `ดูเฉพาะ <b>${esc(c.court)}</b> <button type="button" class="fee-link" data-clear>ล้าง</button>`; this.chip.hidden = false;
    this.onPick(c);
  }
  clear() { this.picked = null; this.chip.hidden = true; this.onPick(null); this.q.focus(); }
}

// ---- เริ่มทำงาน ----
const finder = document.getElementById('feeFinder');
const resultEl = document.getElementById('feeResult');
if (finder && resultEl) {
  let calc;
  const main = new Picker(finder, { prefix: 'f', onChange: (p) => { renderResult(resultEl, p); const s = p.value(); if (s.prov) calc?.seedFirst(s); } });
  renderResult(resultEl, main);
  calc = new Calc(document.getElementById('feeCalc'), () => { const s = main.value(); return s.prov ? s : null; });
  const courtEl = document.getElementById('feeCourt');
  if (courtEl) new CourtSearch(courtEl, (c) => main.setCourt(c));
  loadServiceFeeMeta().then((m) => {
    const src = document.getElementById('feeSrc');
    if (src && m.asOf) src.textContent = `ที่มา: สำนักงานศาลยุติธรรม (exp.coj.co.th) · ข้อมูลล่าสุดที่ตรวจพบ ${thDate(m.asOf)}`;
  }).catch(() => {});
}
