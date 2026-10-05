// ค้นหา/อ่านฎีกาบนหน้า /precedents/ — เรียก /api/precedents (อ่านจาก Aiven ด้วยบทบาทอ่านอย่างเดียว) ใครก็ใช้ได้ ไม่ต้องสมัคร
// ไม่มีไลบรารีภายนอก; สถานะค้นหาอยู่ใน URL (?q=&year=&type=&page=&id=) แชร์ลิงก์/ย้อนกลับได้
const root = document.getElementById('pxSearch');
if (root) init();

function init() {
  const form = root.querySelector('.px-form');
  const out = root.querySelector('#pxResults');
  const yearSel = form.elements.year, typeSel = form.elements.type, qIn = form.elements.q;
  for (let y = 2569; y >= 2519; y--) yearSel.add(new Option(`พ.ศ. ${y}`, String(y)));

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n).toLocaleString('th-TH');
  /** ไฮไลต์คำค้นในข้อความ (ตัดข้อความเป็นชิ้นก่อนค่อย escape → ปลอดภัยต่อ XSS) */
  const hl = (text, tokens) => {
    const t = String(text ?? '');
    const words = (tokens || []).filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!words.length) return esc(t);
    return t.split(new RegExp(`(${words.join('|')})`, 'gi')).map((p, i) => (i % 2 ? `<mark>${esc(p)}</mark>` : esc(p))).join('');
  };
  const para = (s) => String(s ?? '').split(/\n{2,}/).map((x) => `<p>${esc(x).replace(/\n/g, '<br>')}</p>`).join('');

  let seq = 0;
  const state = () => ({ q: qIn.value.trim(), year: yearSel.value, type: typeSel.value, page: 1 });
  const qs = (s) => { const p = new URLSearchParams(); for (const k of ['q', 'year', 'type']) if (s[k]) p.set(k, s[k]); if (s.page > 1) p.set('page', String(s.page)); if (s.id) p.set('id', String(s.id)); return p; };
  const push = (s) => { const q = qs(s).toString(); history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + '#pxSearch'); };

  async function api(params) {
    const r = await fetch('/api/precedents?' + params.toString(), { headers: { Accept: 'application/json' } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(body.error || `ผิดพลาด (${r.status})`), { status: r.status });
    return body;
  }
  const fail = (e) => { out.innerHTML = `<div class="note warn" role="alert"><p>${esc(e.message || 'ค้นหาไม่สำเร็จ')}</p></div>`; };

  async function search(s) {
    const my = ++seq;
    out.innerHTML = '<p class="px-load" role="status">กำลังค้นหา…</p>';
    try {
      const d = await api(qs(s));
      if (my !== seq) return;
      push(s);
      render(d, s);
    } catch (e) { if (my === seq) fail(e); }
  }

  function render(d, s) {
    if (!d.items.length) {
      out.innerHTML = `<div class="note"><p><b>ไม่พบฎีกาที่ตรงกับคำค้น</b> — ลองใช้คำที่สั้นลง เปลี่ยนคำ หรือค้นด้วยเลขฎีกา เช่น <b>10029/2560</b></p></div>`;
      return;
    }
    const lastPage = d.hasMore;
    out.innerHTML = `<p class="px-count" role="status">พบ ${d.totalCapped ? num(d.total) + '+' : num(d.total)} รายการ${s.q ? ` สำหรับ “${esc(s.q)}”` : ''} · หน้า ${num(d.page)}</p>
      <ol class="px-list">${d.items.map((x) => `<li class="px-item" data-id="${x.id}">
        <div class="px-head"><b>ฎีกาที่ ${esc(x.caseNo)}/${esc(x.year)}</b>${x.caseType ? `<span class="tag ${x.caseType === 'แพ่ง' ? 'civil' : 'crim'}">${esc(x.caseType)}</span>` : ''}</div>
        <p class="px-snip">${x.snippet ? hl(x.snippet, d.tokens) + (x.snippet.length >= 359 ? '…' : '') : '<span class="fine">ไม่มีคำพิพากษาย่อสั้นในแหล่งข้อมูล</span>'}</p>
        ${x.sections?.length ? `<p class="px-secs">${x.sections.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</p>` : ''}
        <button type="button" class="btn-pill sm ghost px-open" aria-expanded="false">อ่านรายละเอียด</button>
        <div class="px-detail" hidden></div></li>`).join('')}</ol>
      <nav class="px-pager" aria-label="เปลี่ยนหน้าผลค้นหา">
        <button type="button" class="btn-pill sm ghost" data-p="${d.page - 1}" ${d.page <= 1 ? 'disabled' : ''}>‹ ก่อนหน้า</button>
        <span class="fine">หน้า ${num(d.page)}</span>
        <button type="button" class="btn-pill sm ghost" data-p="${d.page + 1}" ${lastPage ? '' : 'disabled'}>ถัดไป ›</button></nav>
      <p class="fine px-note">${esc(d.notice)}</p>`;
    out.dataset.tokens = JSON.stringify(d.tokens || []);
  }

  async function openDetail(li, btn) {
    const box = li.querySelector('.px-detail');
    if (!box.hidden) { box.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.textContent = 'อ่านรายละเอียด'; return; }
    btn.setAttribute('aria-expanded', 'true'); btn.textContent = 'ซ่อนรายละเอียด'; box.hidden = false;
    if (box.dataset.loaded) return;
    box.innerHTML = '<p class="px-load">กำลังโหลด…</p>';
    try {
      const { item: it } = await api(new URLSearchParams({ id: li.dataset.id }));
      const tokens = JSON.parse(out.dataset.tokens || '[]');
      const fact = (k, v) => (v && (!Array.isArray(v) || v.length) ? `<dt>${k}</dt><dd>${Array.isArray(v) ? v.map(esc).join('<br>') : esc(v)}</dd>` : '');
      const laws = (it.laws || []).map((l) => `${l.name || l.abbr || ''}${l.sections?.length ? ` — ${l.sections.join(', ')}` : ''}`); // ข้อความล้วน — fact() เป็นผู้ escape
      box.innerHTML = `
        ${it.headnote ? `<h4>คำพิพากษาย่อ (ย่อสั้น)</h4><div class="px-text">${tokens.length ? `<p>${hl(it.headnote, tokens).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>` : para(it.headnote)}</div>` : ''}
        ${it.fullText ? `<details class="px-full"><summary>อ่านย่อยาว (${num(it.fullText.length)} ตัวอักษร)</summary><div class="px-text">${para(it.fullText)}</div></details>` : ''}
        <dl class="facts">${fact('คู่ความ', it.litigants)}${fact('กฎหมายที่อ้าง', laws)}${fact('องค์คณะ', it.judges)}${fact('ศาลชั้นต้น/อุทธรณ์', it.lowerCourts)}${fact('หมายเลขคดี', it.primaryCourtNos)}${fact('แผนก', it.departments)}</dl>
        <p class="fine">แหล่งที่มา: <a href="https://deka.supremecourt.or.th/" rel="noopener noreferrer" target="_blank">ระบบสืบค้นคำพิพากษาศาลฎีกา</a> · ${esc(d_notice())}</p>`;
      box.dataset.loaded = '1';
      push({ ...state(), id: it.id });
    } catch (e) { box.innerHTML = `<p class="note warn">${esc(e.message)}</p>`; }
  }
  const d_notice = () => out.querySelector('.px-note')?.textContent || 'ข้อมูลเป็นคำพิพากษาย่อที่ศาลเผยแพร่ ไม่ใช่ฉบับเต็ม';

  form.addEventListener('submit', (e) => { e.preventDefault(); search(state()); });
  yearSel.addEventListener('change', () => search(state()));
  typeSel.addEventListener('change', () => search(state()));
  root.querySelectorAll('.px-chip').forEach((b) => b.addEventListener('click', () => { qIn.value = b.dataset.q; search(state()); }));
  out.addEventListener('click', (e) => {
    const open = e.target.closest('.px-open');
    if (open) return openDetail(open.closest('.px-item'), open);
    const pg = e.target.closest('.px-pager button[data-p]');
    if (pg && !pg.disabled) { const s = state(); s.page = +pg.dataset.p; search(s); root.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  // เริ่มต้นจาก URL
  const p = new URLSearchParams(location.search);
  qIn.value = p.get('q') || ''; if (p.get('year')) yearSel.value = p.get('year'); if (p.get('type')) typeSel.value = p.get('type');
  if (qIn.value || yearSel.value || typeSel.value) {
    const s = state(); s.page = Math.max(1, +p.get('page') || 1);
    search(s).then(() => { const id = p.get('id'); const li = id && out.querySelector(`.px-item[data-id="${CSS.escape(id)}"]`); if (li) openDetail(li, li.querySelector('.px-open')); });
  }
}
