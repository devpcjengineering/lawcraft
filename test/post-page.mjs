// ทดสอบหน้าโพสต์ SSR (api/post.js) + โมดูล SEO ร่วม (shared/post-seo.js) แบบไม่ใช้เครือข่าย:
//   แม่แบบจาก dist/_px/{article,portfolio}.html · บทความตั้งต้นจาก dist/articles-data · ชั้นที่แอดมินแก้จากไฟล์ fixture ชั่วคราว (PX_CONTENT_DIR)
// ต้อง build ก่อน (dist/) ; ไม่มีแม่แบบ = ข้าม
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, '_px', 'article.html')) || !fs.existsSync(path.join(dist, '_px', 'portfolio.html'))) { console.log('post-page: ไม่พบ dist/_px/article.html|portfolio.html (ยังไม่ build) — ข้าม'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-post-'));
process.env.PX_SHELL_DIR = path.join(dist, '_px');
process.env.PX_DATA_DIR = dist;
process.env.PX_CONTENT_DIR = tmp;

const { seoChecks, seoScore, articleSeo, portfolioSeo, renderArticleMain, renderPortfolioMain, articleLd, articlePath, portfolioPath, thDate, TITLE_MAX, DESC_MAX } = await import('../shared/post-seo.js');
const { default: handler, fillShell, buildArticle, buildPortfolio } = await import('../api/post.js');
const { cleanItem } = await import('../public/portfolio/model.js');

// ---------- โมดูลร่วม ----------
assert.equal(articlePath('a-b'), '/articles/a-b/'); assert.equal(portfolioPath('x1'), '/portfolio/x1/');
assert.equal(thDate('2026-11-03'), '3 พฤศจิกายน 2569');
const evilA = { slug: 'evil-one', title: 'ชื่อ <b>x</b> & "y"', subtitle: "s'ub", category: 'หมวด', summary: 'สรุป <script>alert(1)</script> ' + 'ก'.repeat(200), readMinutes: 3, updated: '2026-11-01', image: 'https://img.example/x.jpg', tags: ['a', 'b'],
  keyPoints: ['k1'], sections: [{ id: 'sec-1', heading: 'หัวข้อ <i>1</i>', paragraphs: ['ย่อหน้า'.repeat(40)], bullets: ['b'], table: { head: ['ก', 'ข'], rows: [['1', '<x>']] }, callout: { type: 'tip', text: 'tip' } }, { id: 'sec-2', heading: 'หัวข้อ 2', paragraphs: ['p'] }],
  steps: [{ title: 't', detail: 'd' }], checklist: { title: 'เตรียม', items: ['i1'] }, faq: [{ q: 'ถาม?', a: 'ตอบ <u>' }], sources: [{ label: 'src', url: 'javascript:alert(1)', verified: false }], related: [{ id: 'pc-326', law: 'ป.อ.', section: '326', name: 'หมิ่นประมาท', kind: 'criminal', penalty: 'จำคุก', limitation: '3 เดือน', privateOffence: true, verified: true }], reviewStatus: 'ตรวจแล้ว' };
const s1 = articleSeo(evilA);
assert.ok(s1.title.length <= TITLE_MAX && s1.description.length <= DESC_MAX && s1.image === 'https://img.example/x.jpg' && s1.datePublished === '2026-11-01');
assert.ok(articleSeo({ ...evilA, seo: { title: 'กำหนดเอง', description: 'คำอธิบายเอง', noindex: true } }).title === 'กำหนดเอง');
assert.ok(articleSeo({ slug: 'x', title: 'ไม่มีภาพ' }).image === 'https://www.law-craft.co/og-image.png');
const mainA = renderArticleMain(evilA, { list: [{ slug: 'p', title: 'ก่อน' }, { slug: 'evil-one', title: 'นี่' }, { slug: 'n', title: 'ถัด <b>' }] });
assert.ok(!mainA.includes('<script>alert') && !mainA.includes('<b>x</b>') && mainA.includes('&lt;b&gt;x&lt;/b&gt;') && !mainA.includes('<u>') && mainA.includes('href="#"'), 'ค่าจากข้อมูลต้อง escape และ URL แปลกถูกตัด');
assert.ok(mainA.includes('/articles/p/') && mainA.includes('/articles/n/') && mainA.includes('ถัด &lt;b&gt;'), 'ก่อนหน้า/ถัดไปเป็น URL ใหม่');
assert.ok(mainA.includes('class="ar-cover"') && mainA.includes('data-label="ข"') && mainA.includes('id="r-faq"') && mainA.includes('ม.326') && mainA.includes('ar-check'));
const ld = articleLd(evilA);
assert.equal(ld[0]['@type'], 'Article'); assert.equal(ld[1]['@type'], 'FAQPage'); assert.equal(ld[0].datePublished, '2026-11-01');
const ck = seoChecks('article', evilA), sc = seoScore(ck);
assert.ok(ck.length >= 8 && sc.total === ck.length && ck.find((c) => c.id === 'slug').ok && ck.find((c) => c.id === 'image').ok && ck.find((c) => c.id === 'faq').ok);
assert.ok(!seoChecks('article', { slug: 'BAD SLUG', title: 'x' }).find((c) => c.id === 'slug').ok);
const pf = cleanItem({ id: 'pf-1', slug: 'win-case', title: 'คดี <b>ตัวอย่าง</b>', category: 'ฉ้อโกง', summary: 'สรุป'.repeat(30), body: ['ย่อหน้า'.repeat(30)], outcome: 'ผล', year: 2568, role: 'ทนายโจทก์', tags: ['t'], images: ['https://img.example/p.jpg', 'javascript:x'], consent: true, published: true, anonymized: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z', seo: { title: 'SEO ผลงาน' } });
assert.equal(portfolioSeo(pf).title, 'SEO ผลงาน'); assert.equal(portfolioSeo(pf).image, 'https://img.example/p.jpg'); assert.equal(portfolioSeo(pf).dateModified, '2026-10-02');
const mainP = renderPortfolioMain(pf, { list: [pf] });
assert.ok(!mainP.includes('<b>ตัวอย่าง</b>') && mainP.includes('pf-gallery') && !mainP.includes('javascript:x') && mainP.includes('ปกปิดข้อมูลผู้รับบริการ'));
assert.ok(seoChecks('portfolio', pf).find((c) => c.id === 'consent').ok && !seoChecks('portfolio', { ...pf, consent: false }).find((c) => c.id === 'consent').ok);
assert.ok(!seoChecks('portfolio', { ...pf, outcome: 'ชนะแน่ 100%' }).find((c) => c.id === 'guarantee').ok, 'ต้องจับคำรับประกันผล');

// ---------- แม่แบบ ----------
const shellA = fs.readFileSync(path.join(dist, '_px', 'article.html'), 'utf8');
for (const t of ['@@PX_MAIN@@', '@@PX_TITLE@@', '@@PX_IMAGE@@', '@@PX_ROBOTS@@', '@@PX_META@@', '"@@PX_LD@@"', '@@PX_MOD@@']) assert.ok(shellA.includes(t), 'แม่แบบต้องมี ' + t);
assert.ok(shellA.includes('og:type" content="article"') && shellA.includes('/articles/articles.css') && shellA.includes('class="ar-main"') && shellA.includes('class="wrap ar-read"'));
const filled = fillShell(shellA, { slug: 'x-1', title: '"><script>alert(1)</script>', desc: "d'", crumb: '</script>', image: 'https://i/x.png', robots: 'index,follow', mod: '2026-01-02', meta: '<meta property="article:tag" content="t">', main: '<h1>ok</h1>', ld: [{ '@type': 'Article', headline: 'h<' }] });
assert.ok(!filled.includes('@@PX_') && !/<script>alert/.test(filled) && filled.includes('<h1>ok</h1>') && filled.includes('article:tag'));
const g = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(filled)[1])['@graph'];
assert.ok(g.some((n) => n['@type'] === 'Article' && n.headline === 'h<') && g.some((n) => n['@type'] === 'WebPage' && n.dateModified === '2026-01-02'), 'JSON-LD ต้องมีโหนดโพสต์และวันที่');
const noMod = fillShell(shellA, { slug: 'x', title: 't', desc: 'd', crumb: 'c', image: 'https://i/x.png', robots: 'index,follow', mod: '', meta: '', main: '', ld: [] });
assert.ok(!noMod.includes('dateModified') && JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(noMod)[1])['@graph'].length === 2);

// ---------- ประกอบหน้า (ไม่มี I/O) ----------
const idx = JSON.parse(fs.readFileSync(path.join(dist, 'articles-data', 'index.json'), 'utf8'));
const first = idx[0];
const sa = JSON.parse(fs.readFileSync(path.join(dist, 'articles-data', `${first.slug}.json`), 'utf8'));
let b = buildArticle({ slug: first.slug, sa, sIdx: idx, live: {}, law: null });
assert.equal(b.status, 200); assert.ok(b.fill.main.includes('<h1>') && b.fill.ld[0]['@type'] === 'Article' && b.fill.robots === 'index,follow');
b = buildArticle({ slug: first.slug, sa, sIdx: idx, live: { hidden: [first.slug] }, law: null });
assert.equal(b.status, 404, 'บทความที่ซ่อน = 404');
b = buildArticle({ slug: 'brand-new', sa: null, sIdx: idx, live: { items: { 'brand-new': { title: 'ใหม่จากหลังบ้าน', summary: 'สรุป', sections: [{ heading: 'h', paragraphs: ['p'] }], seo: { noindex: true } } } }, law: null });
assert.equal(b.status, 200); assert.ok(b.fill.main.includes('ใหม่จากหลังบ้าน') && b.fill.robots === 'noindex,follow');
b = buildArticle({ slug: 'brand-new', sa: null, sIdx: idx, live: { items: { 'brand-new': { title: 'x', published: false } } }, law: null });
assert.equal(b.status, 404, 'บทความใหม่ที่ยังไม่เผยแพร่ = 404');
const livePf = { items: [pf, { ...pf, id: 'pf-2', slug: 'draft-one', published: false }, { ...pf, id: 'pf-3', slug: 'no-consent', consent: false }] };
assert.equal(buildPortfolio({ slug: 'win-case', live: livePf }).status, 200);
assert.equal(buildPortfolio({ slug: 'draft-one', live: livePf }).status, 404);
assert.equal(buildPortfolio({ slug: 'no-consent', live: livePf }).status, 404);

// ---------- handler (อ่านไฟล์ทั้งหมด ไม่มีเครือข่าย) ----------
fs.writeFileSync(path.join(tmp, 'articles.json'), JSON.stringify({ items: { 'brand-new': { title: 'ใหม่จากหลังบ้าน', summary: 'สรุปของบทความใหม่ที่แอดมินเพิ่ม', category: 'ภาพรวม', sections: [{ id: 'sec-1', heading: 'หัวข้อ', paragraphs: ['เนื้อหา'] }], updated: '2026-11-03', date: '2026-11-02', image: 'https://img.example/c.webp' } }, hidden: [idx[1]?.slug].filter(Boolean) }));
fs.writeFileSync(path.join(tmp, 'portfolio.json'), JSON.stringify(livePf));
const call = (url, method = 'GET') => new Promise((resolve) => {
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(bd) { resolve({ status: this.statusCode, headers: this.headers, body: bd || '' }); } };
  handler({ method, url, headers: { host: 'localhost:4950' } }, res);
});
let r = await call(`/api/post?kind=article&slug=${first.slug}`);
assert.equal(r.status, 200); assert.ok(!r.body.includes('@@PX_') && r.body.includes(`rel="canonical" href="https://www.law-craft.co/articles/${first.slug}/"`) && r.body.includes('<h1>') && r.body.includes('class="nav"') && !/noindex/.test(r.body));
assert.match(r.headers['cache-control'], /s-maxage=300/);
assert.ok(JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(r.body)[1])['@graph'].some((n) => n['@type'] === 'Article'));
r = await call('/api/post?kind=article&slug=brand-new&v=1');
assert.equal(r.status, 200); assert.ok(r.body.includes('ใหม่จากหลังบ้าน') && r.body.includes('article:published_time" content="2026-11-02"') && r.body.includes('og:image" content="https://img.example/c.webp"'));
assert.equal(r.headers['cache-control'], 'no-store', '?v= = ไม่แคช');
if (idx[1]) { r = await call(`/api/post?kind=article&slug=${idx[1].slug}`); assert.equal(r.status, 404); assert.ok(r.body.includes('noindex') && r.body.includes('ไม่พบบทความนี้')); }
r = await call('/api/post?kind=portfolio&slug=win-case');
assert.equal(r.status, 200); assert.ok(r.body.includes('SEO ผลงาน') && r.body.includes('/portfolio/portfolio.css') && r.body.includes('class="wrap pf-read"') && r.body.includes('rel="canonical" href="https://www.law-craft.co/portfolio/win-case/"'));
assert.equal((await call('/api/post?kind=portfolio&slug=draft-one')).status, 404);
assert.equal((await call('/api/post?kind=article&slug=no-such-article-xyz')).status, 404);
assert.equal((await call('/api/post?kind=article&slug=' + encodeURIComponent('../x'))).status, 404);
assert.equal((await call('/api/post?kind=other&slug=abc')).status, 404);
assert.equal((await call('/api/post?kind=article&slug=abc', 'POST')).status, 405);
assert.equal((await call(`/api/post?kind=article&slug=${first.slug}`, 'HEAD')).body, '');
fs.rmSync(tmp, { recursive: true, force: true });
console.log('post-page OK');
process.exit(0);
