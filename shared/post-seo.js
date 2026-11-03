// SEO ของ "โพสต์" (บทความ /articles/<slug>/ และผลงาน /portfolio/<slug>/) — ใช้ร่วมกัน 3 ที่:
//   · หลังบ้าน (js/content-articles.js, js/content-portfolio.js): ตัวอย่างผลค้นหา + รายการตรวจ SEO (seoChecks)
//   · หน้า SSR ที่เสิร์ชเอนจินอ่าน (api/post.js): หัวเรื่อง/คำอธิบาย/ภาพ/JSON-LD + เนื้อหา HTML เต็ม (renderArticleMain / renderPortfolioMain)
//   · sitemap (api/sitemap.js): รูปแบบ URL
// โมดูลนี้ไม่แตะ DOM และไม่ดึงข้อมูลเอง (ทำงานได้ทั้งในเบราว์เซอร์และ Node) · ทุกค่าจากข้อมูลผ่าน esc() ก่อนใส่ HTML เสมอ
//
// ช่อง SEO ที่เก็บในแต่ละโพสต์ (ไม่บังคับ — ว่าง = ระบบสร้างให้จากชื่อ/สรุป):
//   seo: { title, description, noindex }   image (บทความ) = ภาพปก URL · ผลงานใช้ images[0]   date (บทความ) = วันที่เผยแพร่ YYYY-MM-DD (ไม่มี = updated)

export const SITE = 'https://www.law-craft.co';
export const BRAND = 'LawCraft by PKT';
export const DEFAULT_OG = '/og-image.png';
export const LOGO = '/brand/logo/lawcraft-square-orange-512.png';
export const TITLE_MAX = 60;
export const DESC_MIN = 70;
export const DESC_MAX = 155;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,60}$/;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const arr = (x) => (Array.isArray(x) ? x : []);
const isHttp = (u) => /^https?:\/\/\S+$/i.test(String(u || ''));

/** ตัดข้อความให้ไม่เกิน max ตัวอักษร (พยายามตัดที่ช่องว่าง) ต่อท้าย … */
export function trunc(s, max) {
  const t = one(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:(/\-—–·]+$/, '') + '…';
}
/** เลือกรูปแบบแรกที่ยาวไม่เกิน max (ไม่มีเลย = ตัดรูปแบบสุดท้าย) */
export function fit(max, ...variants) {
  const v = variants.map(one).filter(Boolean);
  return v.find((x) => x.length <= max) || trunc(v[v.length - 1] || '', max);
}
export const absUrl = (site, u) => (isHttp(u) ? u : (site || SITE).replace(/\/$/, '') + (String(u || '').startsWith('/') ? u : '/' + u));

export const articlePath = (slug) => `/articles/${encodeURIComponent(slug)}/`;
export const portfolioPath = (slug) => `/portfolio/${encodeURIComponent(slug)}/`;
export const postPath = (kind, slug) => (kind === 'portfolio' ? portfolioPath(slug) : articlePath(slug));

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
/** 2026-11-03 → 3 พฤศจิกายน 2569 (ไม่พึ่ง ICU — ผลเหมือนกันทุกเครื่อง) */
export function thDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1] || ''} ${+m[1] + 543}` : String(iso || '');
}
const isoDay = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || '')) ? String(s).slice(0, 10) : '');

// ---------- ค่า SEO ของโพสต์ (title/description/image/วันที่) ----------
/** บทความ (a = บทความเต็มตามรูปแบบ articles-data/<slug>.json หรือที่แอดมินแก้) */
export function articleSeo(a, site = SITE) {
  const seo = a?.seo && typeof a.seo === 'object' ? a.seo : {};
  const name = one(a?.title) || 'บทความ';
  const title = one(seo.title) || fit(TITLE_MAX, `${name} | ${BRAND}`, name, trunc(name, TITLE_MAX));
  const description = one(seo.description) || trunc(a?.summary || a?.subtitle || `${name} — ${BRAND}`, DESC_MAX);
  const image = isHttp(a?.image) ? a.image : absUrl(site, isHttp(a?.image) || String(a?.image || '').startsWith('/') ? a.image : DEFAULT_OG);
  const dateModified = isoDay(a?.updated) || isoDay(a?.date) || '';
  const datePublished = isoDay(a?.date) || dateModified;
  return { title, description, image, custom: !!(one(seo.title) || one(seo.description)), noindex: seo.noindex === true, datePublished, dateModified, path: articlePath(a?.slug || ''), url: absUrl(site, articlePath(a?.slug || '')) };
}
/** ผลงาน (it = ผลงานที่ผ่าน cleanItem แล้ว) */
export function portfolioSeo(it, site = SITE) {
  const seo = it?.seo && typeof it.seo === 'object' ? it.seo : {};
  const name = one(it?.title) || 'ผลงาน';
  const title = one(seo.title) || fit(TITLE_MAX, `${name} | ผลงาน ${BRAND}`, `${name} | ${BRAND}`, name, trunc(name, TITLE_MAX));
  const description = one(seo.description) || trunc(it?.summary || it?.outcome || `${name} — ผลงานที่ผ่านมาของ ${BRAND}`, DESC_MAX);
  const first = arr(it?.images).find(isHttp);
  const image = first || absUrl(site, DEFAULT_OG);
  const dateModified = isoDay(it?.updatedAt) || isoDay(it?.createdAt) || '';
  const datePublished = isoDay(it?.createdAt) || dateModified;
  return { title, description, image, custom: !!(one(seo.title) || one(seo.description)), noindex: seo.noindex === true, datePublished, dateModified, path: portfolioPath(it?.slug || ''), url: absUrl(site, portfolioPath(it?.slug || '')) };
}
export const postSeo = (kind, m, site) => (kind === 'portfolio' ? portfolioSeo(m, site) : articleSeo(m, site));

// ---------- รายการตรวจ SEO (หลังบ้าน) ----------
const articleText = (a) => [a?.summary, ...arr(a?.keyPoints), ...arr(a?.sections).flatMap((s) => [s?.heading, ...arr(s?.paragraphs), ...arr(s?.bullets), s?.callout?.text]), ...arr(a?.steps).flatMap((s) => [s?.title, s?.detail]), ...arr(a?.faq).flatMap((f) => [f?.q, f?.a])].map(one).filter(Boolean).join(' ');
const portfolioText = (it) => [it?.summary, ...arr(it?.body), it?.outcome].map(one).filter(Boolean).join(' ');
export const GUARANTEE_RE = /รับประกัน|การันตี|ชนะแน่|ชนะทุกคดี|100\s*%|ร้อยเปอร์เซ็นต์|แน่นอนว่าชนะ|รับรองผล/;

/**
 * ตรวจความพร้อมด้าน SEO ของโพสต์ → [{ id, ok, level: 'err'|'warn'|'ok', text, hint? }]
 *   level 'err' = ควรแก้ก่อนเผยแพร่ · 'warn' = แนะนำให้แก้ · ผ่าน = 'ok'
 */
export function seoChecks(kind, m, opts = {}) {
  const seo = postSeo(kind, m, opts.site);
  const out = [];
  const add = (id, ok, level, text, hint = '') => out.push({ id, ok, level: ok ? 'ok' : level, text, hint });
  const tl = seo.title.length, dl = seo.description.length;
  add('slug', SLUG_RE.test(String(m?.slug || '')), 'err', SLUG_RE.test(String(m?.slug || '')) ? `ลิงก์ ${seo.path}` : 'slug ต้องเป็น a-z 0-9 และ - (3–61 ตัว)');
  add('title', tl >= 10 && tl <= TITLE_MAX, 'warn', `หัวเรื่องในผลค้นหา ${tl} ตัวอักษร`, tl > TITLE_MAX ? `ยาวเกิน ${TITLE_MAX} — Google จะตัดท้าย (ตั้ง “หัวเรื่อง SEO” ให้สั้นลงได้)` : tl < 10 ? 'สั้นเกินไป' : '');
  add('desc', dl >= DESC_MIN && dl <= DESC_MAX, 'warn', `คำอธิบายในผลค้นหา ${dl} ตัวอักษร`, dl < DESC_MIN ? `ควรยาว ${DESC_MIN}–${DESC_MAX} ตัวอักษร (ใส่ “สรุป” หรือ “คำอธิบาย SEO” ให้ชัดว่าหน้านี้ช่วยอะไร)` : dl > DESC_MAX ? `ยาวเกิน ${DESC_MAX} — จะถูกตัด` : '');
  if (kind === 'portfolio') {
    const txt = portfolioText(m);
    add('body', txt.length >= 150, 'warn', `เนื้อหา ${txt.length.toLocaleString('th-TH')} ตัวอักษร`, txt.length < 150 ? 'เล่าข้อเท็จจริง ประเด็นกฎหมาย และสิ่งที่ทำให้ละเอียดขึ้น (อย่างน้อย ~150 ตัวอักษร)' : '');
    add('image', arr(m?.images).some(isHttp), 'warn', arr(m?.images).some(isHttp) ? 'มีรูปภาพ (ใช้เป็นภาพตอนแชร์ลิงก์)' : 'ยังไม่มีรูปภาพ', 'รูปแรกจะเป็นภาพตอนแชร์ลิงก์ (ถ้าไม่มีใช้ภาพแบรนด์)');
    add('guarantee', !GUARANTEE_RE.test(txt + ' ' + one(m?.title)), 'err', GUARANTEE_RE.test(txt + ' ' + one(m?.title)) ? 'พบข้อความที่อาจเข้าข่ายรับประกันผล' : 'ไม่มีข้อความรับประกันผล', 'ข้อบังคับว่าด้วยมรรยาททนายความ — ให้ทนายตรวจ');
    add('consent', m?.consent === true, 'err', m?.consent === true ? 'ได้รับความยินยอมแล้ว' : 'ยังไม่ได้รับความยินยอม — เผยแพร่ไม่ได้');
    add('live', m?.published === true && m?.consent === true, 'warn', m?.published === true && m?.consent === true ? 'เผยแพร่อยู่ — เสิร์ชเอนจินเข้าถึงได้' : 'ยังไม่เผยแพร่ — เสิร์ชเอนจินยังไม่เห็น');
  } else {
    const txt = articleText(m);
    const heads = arr(m?.sections).filter((s) => one(s?.heading)).length;
    add('summary', one(m?.summary).length >= 40, 'warn', one(m?.summary) ? `มีสรุป (${one(m.summary).length} ตัวอักษร)` : 'ยังไม่มีสรุป', 'สรุปใช้เป็นคำอธิบายในผลค้นหาและย่อหน้าแรกของบทความ');
    add('body', txt.length >= 600, 'warn', `เนื้อหา ${txt.length.toLocaleString('th-TH')} ตัวอักษร`, txt.length < 600 ? 'บทความที่สั้นมากมักไม่ติดอันดับ — ขยายให้ครอบคลุมคำถามของผู้อ่าน (แนะนำ 600+ ตัวอักษร)' : '');
    add('headings', heads >= 2, 'warn', `${heads} หัวข้อย่อย`, heads < 2 ? 'แบ่งเนื้อหาเป็นหัวข้อย่อยอย่างน้อย 2 หัวข้อ (ช่วยทั้งผู้อ่านและเสิร์ชเอนจิน)' : '');
    add('image', isHttp(m?.image) || String(m?.image || '').startsWith('/'), 'warn', isHttp(m?.image) || String(m?.image || '').startsWith('/') ? 'มีภาพปก (ใช้เป็นภาพตอนแชร์ลิงก์)' : 'ยังไม่มีภาพปก', 'ไม่มี = ใช้ภาพแบรนด์ตอนแชร์ลิงก์');
    add('faq', arr(m?.faq).filter((f) => one(f?.q) && one(f?.a)).length > 0, 'warn', arr(m?.faq).length ? `มีคำถามที่พบบ่อย ${arr(m.faq).length} ข้อ (แสดงเป็น FAQ ในผลค้นหาได้)` : 'ยังไม่มีคำถามที่พบบ่อย', 'FAQ ช่วยให้ติดผลค้นหาแบบคำถาม-คำตอบ');
    add('review', !/^ร่าง/.test(one(m?.reviewStatus)) && !!one(m?.reviewStatus), 'warn', one(m?.reviewStatus) || 'ร่าง', /^ร่าง|^$/.test(one(m?.reviewStatus)) ? 'บทความที่ยังเป็นร่างจะแสดงป้าย “ฉบับร่าง” บนเว็บ' : '');
    add('live', m?.published !== false, 'warn', m?.published !== false ? 'เผยแพร่อยู่ — เสิร์ชเอนจินเข้าถึงได้' : 'ซ่อนอยู่ — เสิร์ชเอนจินยังไม่เห็น');
  }
  if (seo.noindex) add('noindex', false, 'warn', 'ตั้งค่า “ไม่ให้เสิร์ชเอนจินเก็บหน้านี้” (noindex) อยู่');
  return out;
}
/** สรุปคะแนน: { ok, warn, err, total } */
export function seoScore(checks) {
  const s = { ok: 0, warn: 0, err: 0, total: checks.length };
  for (const c of checks) s[c.ok ? 'ok' : c.level === 'err' ? 'err' : 'warn']++;
  return s;
}

// ---------- JSON-LD ----------
const orgLd = (site) => ({ '@type': 'Organization', name: BRAND, url: `${site}/`, logo: { '@type': 'ImageObject', url: absUrl(site, LOGO) } });
/** โหนด JSON-LD ของบทความ (ใส่ใน @graph ของหน้า — WebPage/BreadcrumbList มาจากแม่แบบ) */
export function articleLd(a, site = SITE) {
  const s = articleSeo(a, site);
  const nodes = [{
    '@type': 'Article', '@id': `${s.url}#article`, headline: trunc(a.title, 110), description: s.description, image: [s.image], inLanguage: 'th-TH',
    ...(s.datePublished ? { datePublished: s.datePublished } : {}), ...(s.dateModified ? { dateModified: s.dateModified } : {}),
    author: orgLd(site), publisher: orgLd(site), mainEntityOfPage: { '@id': `${s.url}#webpage` }, isPartOf: { '@id': `${s.url}#webpage` },
    ...(one(a.category) ? { articleSection: one(a.category) } : {}), ...(arr(a.tags).length ? { keywords: arr(a.tags).map(one).filter(Boolean).join(', ') } : {}),
  }];
  const faq = arr(a.faq).filter((f) => one(f?.q) && one(f?.a));
  if (faq.length) nodes.push({ '@type': 'FAQPage', '@id': `${s.url}#faq`, mainEntity: faq.map((f) => ({ '@type': 'Question', name: one(f.q), acceptedAnswer: { '@type': 'Answer', text: one(f.a) } })) });
  return nodes;
}
export function portfolioLd(it, site = SITE) {
  const s = portfolioSeo(it, site);
  return [{
    '@type': 'Article', '@id': `${s.url}#article`, headline: trunc(it.title, 110), description: s.description, image: [s.image], inLanguage: 'th-TH',
    ...(s.datePublished ? { datePublished: s.datePublished } : {}), ...(s.dateModified ? { dateModified: s.dateModified } : {}),
    author: orgLd(site), publisher: orgLd(site), mainEntityOfPage: { '@id': `${s.url}#webpage` }, isPartOf: { '@id': `${s.url}#webpage` },
    ...(one(it.category) ? { articleSection: one(it.category), about: one(it.category) } : {}), ...(arr(it.tags).length ? { keywords: arr(it.tags).map(one).filter(Boolean).join(', ') } : {}),
  }];
}

// ---------- HTML เนื้อหาหน้า (มาร์กอัปเดียวกับหน้า JS เดิม ใช้ CSS เดิม: articles.css / portfolio.css) ----------
const RV_ICO = {
  draft: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="m14.5 7.5 3 3"/>',
  checked: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.6 2.6L16 9.5"/>',
  lawyer: '<path d="M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6l-7-3z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
};
const REVIEW = { draft: ['ร่าง', 'ฉบับร่าง ยังไม่ผ่านการตรวจ'], checked: ['ตรวจแล้ว', 'ตรวจแล้ว'], lawyer: ['ตรวจแล้วโดยนักกฎหมาย', 'ตรวจแล้วโดยนักกฎหมาย'] };
function reviewKind(status) {
  const s = one(status);
  if (!s || /^ร่าง/.test(s)) return 'draft';
  if (/^ตรวจแล้ว/.test(s) && /นักกฎหมาย|ทนาย/.test(s) && !/ไม่ผ่าน|ยังไม่/.test(s)) return 'lawyer';
  if (/^ตรวจแล้ว/.test(s) && !/ไม่ผ่าน|ยังไม่/.test(s)) return 'checked';
  return 'draft';
}
const rvHtml = (status, full = false) => {
  if (!one(status)) return '';
  const k = reviewKind(status);
  return `<span class="ar-rv ${k}${full ? ' full' : ''}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${RV_ICO[k]}</svg>${esc(full ? REVIEW[k][1] : REVIEW[k][0])}</span>`;
};
const safeUrl = (u) => (isHttp(u) ? u : '#');
const CALLOUT = { warn: 'ข้อควรระวัง', tip: 'คำแนะนำ', law: 'ตัวบทสำคัญ' };

function sectionHtml(s) {
  const call = s.callout?.type && one(s.callout.text) ? `<aside class="ar-callout ${esc(s.callout.type)}" role="note"><b>${esc(CALLOUT[s.callout.type] || 'หมายเหตุ')}</b><p>${esc(s.callout.text)}</p></aside>` : '';
  const head = arr(s.table?.head);
  const tbl = head.length ? `<div class="ar-table"><table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${arr(s.table.rows).map((r) => `<tr>${arr(r).map((c, i) => `<td data-label="${esc(head[i] || '')}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  return `<section id="${esc(s.id)}" class="ar-sec"><h2>${esc(s.heading)}</h2>
    ${arr(s.paragraphs).map((p) => `<p>${esc(p)}</p>`).join('')}
    ${arr(s.bullets).length ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    ${tbl}${call}</section>`;
}
function relatedHtml(a) {
  const rel = arr(a.related);
  if (!rel.length) return '';
  return `<section id="r-items" class="ar-sec"><h2>มาตราที่เกี่ยวข้อง</h2>
    <div class="ar-rel">${rel.map((it) => `<article class="ar-rel-card">
      <div><b>${esc(it.law)} ม.${esc(it.section)}</b> <span class="ar-rel-name">${esc(it.name)}</span></div>
      ${it.penalty ? `<p><span>ระวางโทษ</span> ${esc(it.penalty)}</p>` : ''}
      ${it.limitation ? `<p><span>อายุความ</span> ${esc(it.limitation)}</p>` : ''}
      ${it.privateOffence ? '<p class="ar-flag">ความผิดต่อส่วนตัว — ต้องร้องทุกข์/ฟ้องภายใน 3 เดือนนับแต่รู้เรื่องและรู้ตัวผู้กระทำผิด</p>' : ''}
      ${it.verified ? '' : '<p class="ar-flag warn">ข้อมูลมาตรานี้ยังไม่ผ่านการตรวจกับแหล่งทางการ — ตรวจสอบตัวบทก่อนใช้</p>'}
      <a class="btn-pill ghost sm" href="/workspace/new/${it.kind === 'civil' ? 'civil' : 'criminal'}?charge=${encodeURIComponent(it.id || '')}">ร่างคำฟ้องข้อหานี้</a>
    </article>`).join('')}</div></section>`;
}

/**
 * HTML ส่วนเนื้อหาของหน้าบทความ (วางใน <main class="ar-main"><div class="wrap ar-read">…) — a ต้องผ่าน normArticle แล้ว
 * opts.list = รายการบทความที่แสดงบนเว็บ (ใช้หา ก่อนหน้า/ถัดไป) · opts.noCrumb = ไม่ใส่ลิงก์ "← บทความทั้งหมด" (แม่แบบมี breadcrumb อยู่แล้ว)
 */
export function renderArticleMain(a, opts = {}) {
  const list = arr(opts.list);
  const i = list.findIndex((x) => x.slug === a.slug);
  const prev = i > 0 ? list[i - 1] : null, next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  const sections = arr(a.sections);
  const checklist = a.checklist && arr(a.checklist.items).length ? a.checklist : null;
  const toc = [
    ...sections.map((s) => [s.id, s.heading]),
    ...(arr(a.steps).length ? [['r-steps', 'ขั้นตอนปฏิบัติ']] : []),
    ...(checklist ? [['r-check', checklist.title || 'รายการที่ควรเตรียม']] : []),
    ...(arr(a.related).length ? [['r-items', 'มาตราที่เกี่ยวข้อง']] : []),
    ...(arr(a.faq).length ? [['r-faq', 'คำถามที่พบบ่อย']] : []),
    ...(arr(a.sources).length ? [['r-src', 'แหล่งอ้างอิง']] : []),
  ];
  const cover = isHttp(a.image) || String(a.image || '').startsWith('/') ? `<figure class="ar-cover"><img src="${esc(a.image)}" alt="${esc(a.imageAlt || a.title)}" loading="eager" decoding="async"></figure>` : '';
  return `${opts.noCrumb ? '' : '<p class="ar-crumb"><a href="/articles/">← บทความทั้งหมด</a></p>'}
    <header class="ar-head">
      <span class="ar-cat">${esc(a.category)}</span>
      <h1>${esc(a.title)}</h1>
      ${one(a.subtitle) ? `<p class="ar-sub">${esc(a.subtitle)}</p>` : ''}
      <p class="ar-meta">อ่านประมาณ ${esc(a.readMinutes || 1)} นาที${a.updated ? ` · ปรับปรุงล่าสุด ${esc(thDate(a.updated))}` : ''}</p>
      ${one(a.reviewStatus) ? `<p class="ar-review">${rvHtml(a.reviewStatus, true)}</p>` : ''}
    </header>
    ${cover}
    <div class="ar-cols">
      <nav class="ar-toc" aria-label="สารบัญ"><details open><summary>สารบัญ</summary><ol>${toc.map(([id, h]) => `<li><a href="#${esc(id)}">${esc(h)}</a></li>`).join('')}</ol></details></nav>
      <article class="ar-body">
        ${one(a.summary) ? `<p class="ar-summary">${esc(a.summary)}</p>` : ''}
        ${arr(a.keyPoints).length ? `<div class="ar-key"><b>ใจความสำคัญ</b><ul>${a.keyPoints.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></div>` : ''}
        ${sections.map(sectionHtml).join('')}
        ${arr(a.steps).length ? `<section id="r-steps" class="ar-sec"><h2>ขั้นตอนปฏิบัติ</h2><ol class="ar-steps">${a.steps.map((s) => `<li><b>${esc(s.title)}</b><p>${esc(s.detail)}</p></li>`).join('')}</ol></section>` : ''}
        ${checklist ? `<section id="r-check" class="ar-sec"><h2>${esc(checklist.title || 'รายการที่ควรเตรียม')}</h2><ul class="ar-check">${checklist.items.map((x) => `<li><label><input type="checkbox"> <span>${esc(x)}</span></label></li>`).join('')}</ul></section>` : ''}
        ${relatedHtml(a)}
        ${arr(a.faq).length ? `<section id="r-faq" class="ar-sec"><h2>คำถามที่พบบ่อย</h2>${a.faq.map((f) => `<details class="ar-faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>` : ''}
        ${arr(a.sources).length ? `<section id="r-src" class="ar-sec"><h2>แหล่งอ้างอิง</h2><ul class="ar-sources">${a.sources.map((s) => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>${s.verified ? '' : ' <span class="ar-flag warn inline">ยังไม่ได้ตรวจเปิดอ่าน</span>'}</li>`).join('')}</ul></section>` : ''}
        <aside class="ar-disclaimer" role="note"><b>ข้อมูลทั่วไป ไม่ใช่คำปรึกษากฎหมาย</b><p>บทความนี้เขียนเพื่อให้ความรู้เบื้องต้น แต่ละคดีมีข้อเท็จจริงและกำหนดเวลาแตกต่างกัน กฎหมายและแนวคำพิพากษาอาจเปลี่ยนแปลง ควรตรวจสอบตัวบทฉบับปัจจุบันและปรึกษาทนายความหรือพนักงานสอบสวนก่อนตัดสินใจดำเนินการ</p></aside>
        <div class="ar-cta"><div><b>ปรึกษาทีมทนาย LawCraft ฟรี</b><p>เล่าเหตุการณ์ให้ทีมทนายประเมินเบื้องต้น ฟ้องคดี รับว่าความ หรือใช้ระบบร่างคำฟ้องตามแบบพิมพ์ศาล</p></div><a class="btn-pill primary" href="/contact/">ปรึกษาฟรี</a></div>
        ${prev || next ? `<nav class="ar-pn" aria-label="บทความอื่น">
          ${prev ? `<a href="${articlePath(prev.slug)}"><small>← ก่อนหน้า</small>${esc(prev.title)}</a>` : '<span></span>'}
          ${next ? `<a href="${articlePath(next.slug)}" class="r"><small>ถัดไป →</small>${esc(next.title)}</a>` : '<span></span>'}
        </nav>` : ''}
      </article>
    </div>
    <script>if(matchMedia('(max-width: 900px)').matches){var d=document.querySelector('.ar-toc details');if(d)d.removeAttribute('open')}</script>`;
}

const PF_DISCLAIMER = 'ผลงานที่แสดงเป็นตัวอย่างจากข้อเท็จจริงของแต่ละเรื่อง ผลของคดีขึ้นอยู่กับพยานหลักฐานและข้อเท็จจริงเฉพาะกรณี ไม่ใช่การรับประกันว่าเรื่องของคุณจะได้ผลเช่นเดียวกัน ข้อมูลผู้รับบริการถูกปกปิดและเผยแพร่โดยได้รับความยินยอมแล้ว';
const pfAnon = (it) => (it.anonymized ? '<span class="pf-anon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.5 10.5 0 0 1 12 5c5 0 9 4 10 7a11 11 0 0 1-2.4 3.6M6.5 6.5C4.2 7.9 2.7 9.9 2 12c1 3 5 7 10 7 1.5 0 2.9-.3 4.1-.9"/></svg>ปกปิดข้อมูลผู้รับบริการ</span>' : '');
const yearLabel = (y) => (y ? `พ.ศ. ${y}` : '');
const pfCta = () => `<div class="pf-cta"><div><b>มีเรื่องคล้ายกัน?</b><p>เล่าเรื่องโดยย่อให้เราตรวจสอบเบื้องต้น แล้วติดต่อกลับตามช่องทางที่คุณให้ไว้ — การส่งข้อความไม่ใช่การว่าจ้างทนายความ และไม่ใช่การรับประกันผลของคดี</p></div><a class="btn-pill light" href="/contact/">ปรึกษาเรื่องคล้ายกัน</a></div>`;

/** HTML ส่วนเนื้อหาของหน้าผลงาน (วางใน <main class="pf-main"><div class="wrap pf-read">…) — it ผ่าน cleanItem แล้ว · opts.list = รายการสาธารณะ (publicItems) */
export function renderPortfolioMain(it, opts = {}) {
  const list = arr(opts.list);
  const i = list.findIndex((x) => x.slug === it.slug);
  const prev = i > 0 ? list[i - 1] : null, next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  const images = arr(it.images).filter(isHttp);
  const meta = [it.role, it.court, yearLabel(it.year)].filter(Boolean).map(esc).join(' · ');
  return `${opts.noCrumb ? '' : '<p class="pf-crumb"><a href="/portfolio/">← ผลงานทั้งหมด</a></p>'}
    <header class="pf-head">
      <span class="pf-top"><span class="pf-cat">${esc(it.category || 'ผลงาน')}</span>${it.featured ? '<span class="pf-feat">ผลงานแนะนำ</span>' : ''}</span>
      <h1>${esc(it.title)}</h1>
      ${one(it.summary) ? `<p class="pf-sub">${esc(it.summary)}</p>` : ''}
      ${meta ? `<p class="pf-meta">${meta}</p>` : ''}
      ${pfAnon(it)}
    </header>
    <article class="pf-body">
      ${images.length ? `<div class="pf-gallery">${images.map((u, k) => `<img src="${esc(u)}" alt="${esc(k === 0 ? it.title : '')}" loading="${k === 0 ? 'eager' : 'lazy'}" decoding="async">`).join('')}</div>` : ''}
      ${arr(it.body).map((p) => `<p>${esc(p)}</p>`).join('')}
      ${one(it.outcome) ? `<section class="pf-outcome"><h2>ผลลัพธ์</h2><p>${esc(it.outcome)}</p></section>` : ''}
      ${arr(it.tags).length ? `<p class="pf-tags">${it.tags.map((x) => `<i>${esc(x)}</i>`).join('')}</p>` : ''}
      <aside class="pf-note" role="note"><b>ข้อมูลทั่วไป ไม่ใช่การรับประกันผล</b><p>${esc(PF_DISCLAIMER)}</p></aside>
      ${pfCta()}
      ${prev || next ? `<nav class="pf-pn" aria-label="ผลงานอื่น">
        ${prev ? `<a href="${portfolioPath(prev.slug)}"><small>← ก่อนหน้า</small>${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a href="${portfolioPath(next.slug)}" class="r"><small>ถัดไป →</small>${esc(next.title)}</a>` : '<span></span>'}
      </nav>` : ''}
    </article>`;
}
