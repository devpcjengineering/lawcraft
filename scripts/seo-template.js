// แม่แบบ HTML สถิตของหน้า SEO (หัวเว็บ/เมนู/ท้ายเว็บ/JSON-LD) — ใช้โดย scripts/build-seo-pages.js
// เมนูและท้ายเว็บเป็น HTML จริงในไฟล์ (อ่านได้โดยไม่ต้องมี JS); footer.js จะ morph ทับด้วยเนื้อหาเท่าเดิมแล้วค่อยอัปเดตค่าจากหลังบ้าน
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const plain = (html) => one(String(html).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));

/** ตัดข้อความให้ไม่เกิน max ตัวอักษร (ตัดที่ช่องว่างถ้าทำได้) ต่อท้าย … */
export function trunc(s, max) {
  const t = one(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:(/\-—–]+$/, '') + '…';
}
/** เลือกข้อความรูปแบบแรกที่ยาวไม่เกิน max ถ้าไม่มีเลยให้ตัดรูปแบบสุดท้าย */
export function fit(max, ...variants) {
  const v = variants.map(one).filter(Boolean);
  return v.find((x) => x.length <= max) || trunc(v[v.length - 1] || '', max);
}

// ---- อ่านค่าจาก public/site/footer.js และ config.js เพื่อไม่ให้ท้ายเว็บสถิตเพี้ยนจากตัวจริง ----
export async function loadChrome(root) {
  const ft = fs.readFileSync(path.join(root, 'public/site/footer.js'), 'utf8');
  const arr = (name) => { const m = ft.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`)); if (!m) throw new Error(`footer.js: ไม่พบ const ${name}`); return new Function(`return ${m[1]}`)(); };
  const str = (name) => { const m = ft.match(new RegExp(`const ${name} = '((?:[^'\\\\]|\\\\.)*)';`)); if (!m) throw new Error(`footer.js: ไม่พบ const ${name}`); return m[1]; };
  const config = (await import(pathToFileURL(path.join(root, 'public/site/config.js')).href)).default;
  return { QUICK: arr('QUICK'), TOPICS: arr('TOPICS'), MARK: str('MARK'), DEFAULT_DESC: str('DEFAULT_DESC'), config };
}

export const NAV = [
  ['laws', '/laws/', 'ข้อกฎหมาย'],
  ['jurisdiction', '/jurisdiction/', 'เขตอำนาจศาล'],
  ['procedure', '/procedure/', 'ขั้นตอนฟ้องคดี'],
  ['precedents', '/precedents/', 'ฎีกา'],
  ['articles', '/articles/', 'บทความ'],
  ['contact', '/contact/', 'ติดต่อ'],
];

export function makeTemplate({ site, chrome }) {
  const { QUICK, TOPICS, MARK, DEFAULT_DESC, config } = chrome;
  const siteName = 'Law Craft สำนักงานกฎหมาย ลอว์คราฟต์';

  const nav = (cur) => `<nav class="nav" id="nav" aria-label="เมนูหลัก">
  <div class="nav-in">
    <a class="logo" href="/" aria-label="${siteName}">
      <svg class="logo-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${MARK.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>
      <span class="logo-text"><span class="lt-th">สำนักงานกฎหมาย ลอว์คราฟต์</span><span class="lt-en">Law Craft Legal Consultants</span></span>
    </a>
    <div class="nav-links" id="navLinks">
      ${NAV.map(([k, h, t]) => `<a href="${h}"${k === cur ? ' aria-current="page"' : ''}>${t}</a>`).join('\n      ')}
    </div>
    <a class="nav-cta" href="/workspace/">เข้าสู่ระบบ</a>
    <button class="nav-burger" id="burger" aria-label="เปิดเมนู" aria-expanded="false" aria-controls="navLinks"><span></span><span></span></button>
  </div>
</nav>`;

  // ต้องตรงกับ footerHtml() ใน public/site/footer.js (ค่าเริ่มต้นจาก config.js)
  const footer = () => {
    const o = config.office;
    const name = config.legalName || config.name;
    const contacts = (config.contacts || []).filter((c) => c && c.value);
    const addr = o ? `<address class="sf-addr"><b>${esc(o.label)}</b><span>${esc(o.entity)}</span><span>${esc([o.street, o.district, o.province].filter(Boolean).join(' '))}</span>${o.regNo ? `<span>ทะเบียนนิติบุคคลเลขที่ ${esc(o.regNo)}</span>` : ''}</address>` : '';
    const list = contacts.length ? `<ul class="sf-contacts">${contacts.map((c) => `<li>${c.href ? `<a href="${esc(c.href)}"><span>${esc(c.label)}</span> ${esc(c.value)}</a>` : `<span>${esc(c.label)}</span> ${esc(c.value)}`}</li>`).join('')}</ul>` : '';
    const hours = config.hours ? `<p class="sf-hours"><b>เวลาทำการ</b><br>${esc(config.hours).replace(/\n/g, '<br>')}</p>` : '';
    return `<footer class="foot sf" id="siteFooter"><div class="wrap">
    <div class="sf-grid">
      <section class="sf-brand" aria-label="เกี่ยวกับสำนักงาน">
        <a class="sf-logo" href="/" aria-label="${esc(name)}">${MARK}<span class="logo-text"><span class="lt-th">สำนักงานกฎหมาย ลอว์คราฟต์</span><span class="lt-en">Law Craft Legal Consultants</span></span></a>
        <p class="sf-desc">${esc(config.footerDesc || DEFAULT_DESC)}</p>
        <a class="btn-pill primary sm sf-cta" href="/contact/">ติดต่อปรึกษากฎหมาย</a>
      </section>
      <nav class="sf-col" aria-label="ลิงก์ด่วน">
        <h2 class="sf-h">ลิงก์ด่วน</h2>
        <ul>${QUICK.map(([h, t]) => `<li><a href="${h}">${esc(t)}</a></li>`).join('')}</ul>
      </nav>
      <nav class="sf-col" aria-label="หัวข้อกฎหมายออนไลน์">
        <h2 class="sf-h">คดีออนไลน์</h2>
        <ul>${TOPICS.map(([s, t]) => `<li><a href="/articles/?a=${s}">${esc(t)}</a></li>`).join('')}</ul>
      </nav>
      <section class="sf-col sf-firm" aria-label="ข้อมูลสำนักงาน">
        <h2 class="sf-h">ข้อมูลสำนักงาน</h2>
        ${addr}${list}${hours}
      </section>
    </div>
    <div class="sf-bottom">
      <p class="sf-copy">© ${new Date().getFullYear()} Law Craft Legal Consultants</p>
      <p class="sf-legal">ข้อมูลในเว็บไซต์นี้เป็นข้อมูลทั่วไปเพื่อการศึกษา ไม่ใช่คำปรึกษาทางกฎหมาย และอาจไม่ทันต่อการแก้ไขกฎหมายล่าสุด ควรตรวจสอบตัวบทฉบับปัจจุบันและปรึกษาทนายความก่อนดำเนินคดี แบบพิมพ์อ้างอิงจากแบบพิมพ์ศาลยุติธรรม สำนักงานศาลยุติธรรม</p>
      <p class="sf-links"><a href="/privacy/">นโยบายความเป็นส่วนตัว</a><a href="/workspace/" class="sf-admin">เข้าสู่ระบบร่างคำฟ้อง</a></p>
    </div>
  </div></footer>`;
  };

  const breadcrumbHtml = (crumbs) => `<nav class="bc" aria-label="เส้นทางหน้า"><ol>${crumbs.map(([n, p], i) => (i === crumbs.length - 1 ? `<li><span aria-current="page">${esc(n)}</span></li>` : `<li><a href="${p}">${esc(n)}</a></li>`)).join('')}</ol></nav>`;

  /** หน้าเต็ม — page: {path,title,description,crumbs,nav,main,faq?,lastmod} */
  /** ตาราง → ใส่ data-label ให้ทุกเซลล์ (ชื่อคอลัมน์) เพื่อให้มือถือแสดงเป็นการ์ดซ้อนแนวตั้งแทนการเลื่อนซ้ายขวา (CSS ใน site/seo.css) */
  const stackTables = (html) => html.replace(/<table[\s\S]*?<\/table>/g, (t) => {
    const thead = /<thead[\s\S]*?<\/thead>/.exec(t)?.[0] || '';
    const head = [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    if (!head.length) return t;
    const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return t.replace(/<tbody[\s\S]*?<\/tbody>/g, (b) => b.replace(/<tr[^>]*>[\s\S]*?<\/tr>/g, (tr) => {
      let i = 0;
      return tr.replace(/<(td|th)([^>]*)>/g, (m, tag, attrs) => {
        const span = +(/colspan="?(\d+)/.exec(attrs)?.[1] || 1);
        const lab = head[i] || '';
        i += span;
        return `<${tag}${attrs} data-label="${attr(lab)}">`;
      });
    }));
  });

  const layout = (page) => {
    const url = site + page.path;
    const crumbs = [['หน้าแรก', '/'], ...page.crumbs];
    const graph = [
      {
        '@type': page.ldType || 'WebPage', '@id': `${url}#webpage`, url, name: page.title, description: page.description, inLanguage: 'th-TH',
        isPartOf: { '@type': 'WebSite', name: 'Law Craft Legal Consultants', url: `${site}/` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
        ...(page.lastmod ? { dateModified: page.lastmod } : {}),
      },
      {
        '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
        itemListElement: crumbs.map(([n, p], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: site + p })),
      },
    ];
    if (page.faq?.length) graph.push({ '@type': 'FAQPage', mainEntity: page.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
    const ld = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
    const t = esc(page.title), d = esc(page.description);
    return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<title>${t}</title>
<meta name="description" content="${d}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Law Craft Legal Consultants">
<meta property="og:locale" content="th_TH">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${site}/apple-touch-icon.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="alternate icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap"></noscript>
<link rel="stylesheet" href="/css/bundle-seo.css">
<script type="application/ld+json">${ld}</script>
</head>
<body>
<a class="skip" href="#main">ข้ามไปยังเนื้อหา</a>
${nav(page.nav)}

<main id="main" class="sp">
  <div class="wrap">
    ${breadcrumbHtml(crumbs)}
    ${stackTables(page.main)}
  </div>
</main>

${footer()}

<script type="module" src="/site/nav.js"></script>
<script type="module" src="/site/footer.js"></script>
<script type="module" src="/site/live-pages.js"></script>${(page.scripts || []).map((s) => `\n<script type="module" src="${s}"></script>`).join('')}
<script src="/js/smooth.js" defer></script>
</body>
</html>
`;
  };

  return { layout, nav, footer, breadcrumbHtml };
}
