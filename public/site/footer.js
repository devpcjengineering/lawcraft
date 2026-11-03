// ท้ายเว็บ (footer) ร่วมของทุกหน้าสาธารณะ — วางแค่ <footer id="siteFooter" class="foot"> แล้วโหลดโมดูลนี้
// ข้อมูลผู้ให้บริการ/ช่องทางติดต่อดึงจาก /site/config.js (ช่องทางติดต่อที่ไม่ได้ตั้งค่าจะไม่แสดง — ห้ามสมมติเบอร์/ไลน์/อีเมล)
import { cachedSite, loadSite, defaultSite } from '/site/live-config.js';
import { morphInto } from '/js/morph.js';

let config = cachedSite() || defaultSite();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// หมายเหตุ: scripts/build-seo-pages.js อ่านรายการ QUICK / TOPICS / MARK / DEFAULT_DESC จากไฟล์นี้ไปสร้างท้ายเว็บแบบ HTML สถิต — รูปแบบ const … = […]; ต้องคงไว้
const QUICK = [
  ['/laws/', 'ข้อกฎหมายและมาตรา'],
  ['/jurisdiction/', 'เขตอำนาจศาล'],
  ['/procedure/', 'ขั้นตอนฟ้องคดี'],
  ['/service-fee/', 'เช็กค่านำหมาย'],
  ['/precedents/', 'ฎีกา'],
  ['/articles/', 'บทความ'],
  ['/portfolio/', 'ผลงานที่ผ่านมา'],
  ['/#drafting', 'ร่างคำฟ้อง'],
  ['/contact/', 'ติดต่อปรึกษา'],
];
const TOPICS = [
  ['online-trading-fraud', 'ถูกหลอกซื้อขายออนไลน์'],
  ['online-trading-civil', 'ซื้อขายออนไลน์ ฟ้องเรียนคืน'],
  ['online-defamation', 'หมิ่นประมาทในโซเชียล'],
  ['online-threat-harassment', 'ข่มขู่ คุกคาม ปลอมบัญชี'],
  ['intimate-images', 'ภาพส่วนตัวถูกเผยแพร่'],
  ['digital-evidence', 'เก็บหลักฐานดิจิทัล'],
  ['takedown-and-remedies', 'ขอลบเนื้อหา และเรียกค่าเสียหาย'],
];
const MARK = '<svg class="sf-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="24" cy="7" r="2"/><path d="M24 9v29M16 41h16M13 38h22M7 14h34"/><path d="M10 14 3 28M10 14l7 14M38 14l-7 14M38 14l7 14"/><path d="M3 28h14c-.5 5-3.5 7.5-7 7.5S3.5 33 3 28zM31 28h14c-.5 5-3.5 7.5-7 7.5S31.5 33 31 28z"/></svg>';

const nameOf = () => config.legalName || config.name;

/** ข้อมูลผู้ให้บริการ: ที่อยู่/เลขทะเบียนแสดงเฉพาะเมื่อตั้งค่าไว้ (ค่าเริ่มต้นไม่แสดง) — ช่องทางติดต่อ/เวลาติดต่อจากหลังบ้าน */
function firmBlock() {
  const o = config.office && config.office.entity ? config.office : null;
  const contacts = (config.contacts || []).filter((c) => c && c.value);
  const addr = o ? `<address class="sf-addr"><b>${esc(o.label || 'ผู้ดำเนินการเว็บไซต์')}</b><span>${esc(o.entity)}</span>${[o.street, o.district, o.province].filter(Boolean).length ? `<span>${esc([o.street, o.district, o.province].filter(Boolean).join(' '))}</span>` : ''}${o.regNo ? `<span>ทะเบียนนิติบุคคลเลขที่ ${esc(o.regNo)}</span>` : ''}</address>` : '';
  const list = contacts.length
    ? `<ul class="sf-contacts">${contacts.map((c) => `<li>${c.href ? `<a href="${esc(c.href)}"><span>${esc(c.label)}</span> ${esc(c.value)}</a>` : `<span>${esc(c.label)}</span> ${esc(c.value)}`}</li>`).join('')}</ul>`
    : '';
  const hours = config.hours ? `<p class="sf-hours"><b>เวลาติดต่อ</b><br>${esc(config.hours).replace(/\n/g, '<br>')}</p>` : '';
  return `${addr}${list}${hours}`;
}

function structuredData() {
  document.querySelector('script[data-sf-ld]')?.remove();
  const ld = document.createElement('script');
  ld.type = 'application/ld+json'; ld.dataset.sfLd = '1';
  const o = config.office && config.office.entity ? config.office : null;
  const data = { '@context': 'https://schema.org', '@type': 'LegalService', name: nameOf(), alternateName: config.name, url: location.origin + '/', areaServed: 'TH' };
  if (o) { data.legalName = o.entity; if (o.regNo) data.identifier = o.regNo; if (o.street || o.district || o.province) data.address = { '@type': 'PostalAddress', streetAddress: o.street, addressLocality: o.district, addressRegion: o.province, addressCountry: 'TH' }; }
  const tel = (config.contacts || []).find((c) => /^tel:/.test(c.href || ''));
  if (tel) data.telephone = tel.href.slice(4);
  ld.textContent = JSON.stringify(data);
  document.head.appendChild(ld);
}

function footerHtml() {
  const name = nameOf();
  return `<div class="wrap">
    <div class="sf-grid">
      <section class="sf-brand" aria-label="เกี่ยวกับ LawCraft">
        <a class="sf-logo" href="/" aria-label="${esc(name)}">${MARK}<span class="logo-text"><span class="lt-th">LawCraft</span><span class="lt-en">by PKT (เพ็ช ไพศาณ)</span></span></a>
        <p class="sf-desc">${esc(config.footerDesc || DEFAULT_DESC)}</p>
        <a class="btn-pill primary sm sf-cta" href="/contact/">ปรึกษาทีมทนายฟรี</a>
      </section>
      <nav class="sf-col" aria-label="ลิงก์">
        <h2 class="sf-h">ลิงก์</h2>
        <ul>${QUICK.map(([h, t]) => `<li><a href="${h}">${esc(t)}</a></li>`).join('')}</ul>
      </nav>
      <nav class="sf-col" aria-label="หัวข้อกฎหมายออนไลน์">
        <h2 class="sf-h">คดีออนไลน์</h2>
        <ul>${TOPICS.map(([s, t]) => `<li><a href="/articles/${s}/">${esc(t)}</a></li>`).join('')}</ul>
      </nav>
      ${firmBlock() ? `<section class="sf-col sf-firm" aria-label="ข้อมูลผู้ให้บริการ">
        <h2 class="sf-h">ติดต่อเรา</h2>
        ${firmBlock()}
      </section>` : ''}
    </div>
    <div class="sf-bottom">
      <p class="sf-copy">© ${new Date().getFullYear()} ${esc(name)} — ลอว์คราฟต์ โดยสำนักงานกฎหมาย PKT</p>
      <p class="sf-legal">ข้อมูลในเว็บไซต์นี้เป็นข้อมูลทั่วไปเพื่อการศึกษา ไม่ใช่คำปรึกษาทางกฎหมาย และอาจไม่ทันต่อการแก้ไขกฎหมายล่าสุด ควรตรวจสอบตัวบทฉบับปัจจุบันและปรึกษาทนายความก่อนดำเนินคดี แบบพิมพ์อ้างอิงจากแบบพิมพ์ศาลยุติธรรม สำนักงานศาลยุติธรรม</p>
      <p class="sf-links"><a href="/privacy/">นโยบายความเป็นส่วนตัว</a><a href="/workspace/" class="sf-admin">เข้าสู่ระบบร่างคำฟ้อง</a></p>
    </div>
  </div>`;
}

const DEFAULT_DESC = 'สำนักงานกฎหมาย LawCraft by PKT — ปรึกษาฟรี ปัญหามีทางออก และทุกทางออกเราออกแบบให้รอบคอบ ให้คำปรึกษากฎหมายฟรี ฟ้องคดี รับว่าความ ทั้งคดีอาญา คดีแพ่ง และคดีออนไลน์ ตั้งแต่ประเมินความเสี่ยง วางกลยุทธ์ ร่างคำฟ้องและเอกสารยื่นศาลตามแบบพิมพ์ศาลยุติธรรม ไปจนถึงติดตามคดีจนถึงคำพิพากษา พร้อมฐานความรู้กฎหมายไทยให้ค้นมาตรา เขตอำนาจศาล และฎีกาได้เอง';

/** ประกาศบนหัวเว็บ (ตั้งจากหลังบ้าน: เช่น วันหยุด/แจ้งข่าว) ปิดได้และจำไว้ในแท็บนี้ */
function announce() {
  const a = config.announcement;
  let bar = document.getElementById('siteAnnounce');
  const closed = (() => { try { return sessionStorage.getItem('lawcraft:announce') === (a?.text || ''); } catch { return false; } })();
  if (!a?.text || closed) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'siteAnnounce'; bar.className = 'announce'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'ประกาศ'); document.body.prepend(bar); }
  bar.innerHTML = `<p>${esc(a.text)}${a.link ? ` <a href="${esc(a.link)}">${esc(a.linkText || 'รายละเอียด')}</a>` : ''}</p><button type="button" aria-label="ปิดประกาศ">✕</button>`;
  bar.querySelector('button').onclick = () => { try { sessionStorage.setItem('lawcraft:announce', a.text); } catch { /* ข้าม */ } bar.remove(); };
}

export function mountFooter() {
  const el = document.getElementById('siteFooter');
  if (!el) return;
  el.classList.add('foot', 'sf');
  if (el.querySelector('.sf-grid')) morphInto(el, footerHtml(), { mark: false }); else el.innerHTML = footerHtml();
  structuredData();
  announce();
}

mountFooter();
// โหลดค่าล่าสุดจากฐานข้อมูล แล้วอัปเดตเฉพาะส่วนที่เปลี่ยน (ไม่กะพริบ)
loadSite().then((fresh) => { config = fresh; mountFooter(); });
