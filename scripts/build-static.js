// สร้างเว็บสถิตสำหรับ deploy (Vercel / Netlify / Cloudflare Pages / เซิร์ฟเวอร์ไฟล์ใดก็ได้) → โฟลเดอร์ dist/
// รวม public/ + shared/ (โมดูลที่เบราว์เซอร์ import จาก /shared/) + templates/ (แบบพิมพ์ศาลต้นฉบับ)
// โหมด Supabase: เว็บและหลังบ้านคุยกับ Supabase โดยตรง จึงไม่ต้องมีเซิร์ฟเวอร์ Node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const cp = (from, to) => fs.cpSync(path.join(root, from), path.join(dist, to), { recursive: true });
cp('public', '.');
cp('shared', 'shared');
if (fs.existsSync(path.join(root, 'templates'))) cp('templates', 'templates');

// บทความ: ไฟล์ JSON ต่อบทความ (รวมมาตรา/ฎีกาที่อ้างถึง) + รายการ
{
  const { packArticles } = await import('../server/articles-pack.js');
  const pack = packArticles();
  const out = path.join(dist, 'articles-data');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(pack.index));
  for (const [slug, a] of Object.entries(pack.articles)) fs.writeFileSync(path.join(out, `${slug}.json`), JSON.stringify(a));
}

// หน้าข้อมูลกฎหมายแบบ HTML สถิต (/jurisdiction/ /laws/ /procedure/ /precedents/) + dist/seo-urls.json + สารบัญบนหน้าแรก
// ต้องรันก่อนขั้นรวม CSS / ใส่ ?v= (หน้าเหล่านี้ใช้ css/bundle-seo.css ที่สร้างในขั้นนี้)
const SITE_URL = (process.env.SITE_URL || 'https://www.law-craft.co').replace(/\/$/, '');
const seo = await (await import('./build-seo-pages.js')).buildSeoPages({ root, dist, site: SITE_URL });

// sitemap.xml + robots.txt สำหรับเสิร์ชเอนจิน: หน้าสาธารณะทั้งหมด + บทความทุกบท (หลังบ้าน /workspace/ ไม่ใส่)
{
  const SITE = SITE_URL;
  const { packArticles } = await import('../server/articles-pack.js');
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ['/', today, 'weekly', '1.0'], ['/articles/', today, 'weekly', '0.8'], ['/contact/', today, 'monthly', '0.6'], ['/privacy/', today, 'yearly', '0.3'], ['/service-fee/', today, 'monthly', '0.7'],
    ...packArticles().index.map((a) => [`/articles/?a=${encodeURIComponent(a.slug)}`, /^\d{4}-\d{2}-\d{2}$/.test(a.updated || '') ? a.updated : today, 'monthly', '0.7']),
    ...seo.urls.map((u) => [u.path, u.lastmod, 'monthly', u.priority]),
  ];
  const x = (s) => s.replace(/&/g, '&amp;');
  // ปกติ /sitemap.xml มาจากฟังก์ชัน api/sitemap.js (รวมบทความที่แอดมินเพิ่มสด ๆ) — ตั้ง STATIC_SITEMAP=1 ถ้าต้องการไฟล์สถิตแทน
  if (process.env.STATIC_SITEMAP) fs.writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, m, f, pr]) => `  <url><loc>${x(SITE + p)}</loc><lastmod>${m}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`);
  const rp = path.join(dist, 'robots.txt');
  let rb = fs.readFileSync(rp, 'utf8').replace(/\r?\n?Sitemap:.*$/gim, '').trimEnd();
  fs.writeFileSync(rp, `${rb}\n\nSitemap: ${SITE}/sitemap.xml\n`);
  console.log(`sitemap.xml: ${urls.length} หน้า`);
}
// ย่อ CSS ด้วย csso (ไม่มีไลบรารี = ใช้ไฟล์เดิม) — ใช้ทั้งไฟล์รวมของหน้าสาธารณะและ bundle-seo.css
const minifyCss = await (async () => { try { const { minify } = await import('csso'); return (s) => minify(s).css; } catch { console.warn('csso ไม่พร้อม — ใช้ CSS ไม่ย่อ'); return (s) => s; } })();
// เร่งความเร็วหน้าสาธารณะ: รวมไฟล์ CSS หลายไฟล์ที่ <head> เป็นไฟล์เดียวต่อหน้า (ลดคำขอที่บล็อกการแสดงผล)
{
  const crypto = await import('node:crypto');
  for (const page of ['index.html', 'articles/index.html', 'contact/index.html', 'privacy/index.html', 'service-fee/index.html']) {
    const hp = path.join(dist, page);
    let html = fs.readFileSync(hp, 'utf8');
    const re = /<link rel="stylesheet" href="(\/[^"?#]+\.css)">\r?\n?/g;
    const hrefs = [...html.matchAll(re)].map((m) => m[1]);
    if (hrefs.length < 2) continue;
    const raw = hrefs.map((h) => fs.readFileSync(path.join(dist, h), 'utf8').replace(/^\uFEFF/, '').replace(/\/\*# sourceMappingURL=.*?\*\//g, '')).join('\n');
    const css = minifyCss(raw); // \u0E22\u0E48\u0E2D CSS (\u0E15\u0E31\u0E14\u0E04\u0E2D\u0E21\u0E40\u0E21\u0E19\u0E15\u0E4C/\u0E0A\u0E48\u0E2D\u0E07\u0E27\u0E48\u0E32\u0E07 \u0E23\u0E27\u0E21\u0E01\u0E0E\u0E0B\u0E49\u0E33) \u2014 \u0E44\u0E1F\u0E25\u0E4C\u0E40\u0E25\u0E47\u0E01\u0E25\u0E07 ~20% \u0E0A\u0E48\u0E27\u0E22 FCP/LCP
    const name = `css/bundle-${page.replace(/\/?index\.html$/, '') || 'home'}.css`.replace('//', '/');
    fs.writeFileSync(path.join(dist, name), css);
    let first = true;
    html = html.replace(re, () => { if (!first) return ''; first = false; return `<link rel="stylesheet" href="/${name}">\n`; });
    fs.writeFileSync(hp, html);
    console.log(`รวม CSS ${page}: ${hrefs.length} ไฟล์ → ${name}`);
  }
}

// llms.txt (สำหรับ AI/LLM อ่านภาพรวมเว็บ) + ai-catalog.json (/.well-known/) — สร้างจากรายการหน้า/บทความตอน build
{
  const SITE = (process.env.SITE_URL || 'https://www.law-craft.co').replace(/\/$/, '');
  const { packArticles } = await import('../server/articles-pack.js');
  const arts = packArticles().index;
  const one = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const llms = `# Law Craft Legal Consultants (สำนักงานกฎหมาย ลอว์คราฟต์)

> เว็บไซต์ภาษาไทยให้ความรู้กฎหมายไทยสำหรับผู้เสียหายและประชาชน (คดีออนไลน์ ซื้อขายออนไลน์ ฉ้อโกง หมิ่นประมาท ข่มขู่ ภาพส่วนตัว) พร้อมเครื่องมือร่างคำฟ้อง คำร้อง และเอกสารยื่นศาลตามแบบพิมพ์ของศาลยุติธรรม เนื้อหาเป็นข้อมูลทั่วไปเพื่อการศึกษา ไม่ใช่คำปรึกษาทางกฎหมายหรือการรับประกันผลของคดี ควรตรวจสอบกับแหล่งทางการและนักกฎหมายก่อนยื่นต่อศาล

## หน้าหลัก

- [หน้าแรก](${SITE}/): ค้นหามาตราและข้อกฎหมาย ตรวจเขตอำนาจศาล ขั้นตอนฟ้องคดี และทางเข้าระบบร่างคำฟ้อง
- [บทความกฎหมายคดีออนไลน์](${SITE}/articles/): รวมบทความอธิบายสิทธิ ขั้นตอน และการเก็บหลักฐาน
- [ติดต่อปรึกษากฎหมาย](${SITE}/contact/): ส่งเรื่องให้เจ้าหน้าที่ตรวจสอบเบื้องต้น
- [นโยบายความเป็นส่วนตัว](${SITE}/privacy/): ข้อมูลที่เก็บ วัตถุประสงค์ และสิทธิของเจ้าของข้อมูลตาม PDPA

## ข้อมูลกฎหมาย (หน้า HTML แยกรายการ)

- [ข้อกฎหมายไทย: มาตรา ระวางโทษ อายุความ](${SITE}/laws/): ${seo.counts.items} มาตราและมูลคดี (คดีอาญา/คดีแพ่ง) ตัวบท องค์ประกอบ ระวางโทษ อายุความ สถานะการตรวจแหล่งอ้างอิง — แต่ละฉบับอยู่ที่ ${SITE}/laws/<ฉบับ>/ และแต่ละมาตราที่ ${SITE}/laws/<รหัสข้อหา>/ เช่น ${SITE}/laws/pc-326/
- [เขตอำนาจศาล ฟ้องคดีแพ่ง อาญาที่ศาลไหน](${SITE}/jurisdiction/): ศาลที่มีเขตอำนาจรายอำเภอ/เขต พร้อมเบอร์โทรศัพท์ศาล ครบ ${seo.counts.provinces} จังหวัด (${SITE}/jurisdiction/<จังหวัดภาษาอังกฤษ>/ เช่น ${SITE}/jurisdiction/bangkok/)
- [ขั้นตอนฟ้องคดีและวิธีพิจารณาความ](${SITE}/procedure/): ขั้นตอนฟ้องคดีอาญาโดยราษฎร ค่าธรรมเนียมศาล และ ${seo.counts.procedure} มาตราวิธีพิจารณาที่ใช้บ่อย
- [ฎีกา: ค้นหาและอ่านคำพิพากษาศาลฎีกา](${SITE}/precedents/): คลังคำพิพากษาย่อที่ศาลฎีกาเผยแพร่ ค้นด้วยคำ เลขฎีกา ปี ประเภทคดี กฎหมายที่อ้าง — แต่ละฎีกามีหน้าของตัวเองที่ ${SITE}/precedents/<เลขฎีกา>-<ปี>-<รหัสศาล>/ (ไม่ใช่ฉบับเต็ม ควรตรวจกับต้นฉบับ)

## บทความ

${arts.map((a) => `- [${one(a.title)}](${SITE}/articles/?a=${encodeURIComponent(a.slug)}): ${one(a.summary || a.subtitle).slice(0, 160)}`).join('\n')}

## Optional

- [เนื้อหาเต็มทุกบทความ (Markdown)](${SITE}/llms-full.txt): ข้อความบทความทั้งหมดในไฟล์เดียวสำหรับ AI
- [Sitemap](${SITE}/sitemap.xml): รายการหน้าทั้งหมดสำหรับเสิร์ชเอนจิน
`;
  fs.writeFileSync(path.join(dist, 'llms.txt'), llms);
  // llms-full.txt: เนื้อหาทุกบทความเป็น Markdown ไฟล์เดียว (อนุญาตให้ AI ดึง/อ้างอิง/นำไปฝึกได้ — ดู robots.txt)
  {
    const all = packArticles().articles;
    const md = [];
    md.push(`# Law Craft Legal Consultants — เนื้อหาบทความฉบับเต็ม\n\n> ข้อมูลทั่วไปเพื่อการศึกษา ไม่ใช่คำปรึกษาทางกฎหมาย บทความทุกบทเป็นฉบับร่างหรือผ่านการตรวจตามสถานะที่ระบุ ควรตรวจกับแหล่งทางการและนักกฎหมายก่อนนำไปใช้ · ภาพรวมเว็บ: ${SITE}/llms.txt\n`);
    for (const a of Object.values(all)) {
      md.push(`\n---\n\n# ${one(a.title)}\n\nURL: ${SITE}/articles/?a=${encodeURIComponent(a.slug)}\nหมวด: ${one(a.category)} · ปรับปรุง: ${one(a.updated)} · สถานะการตรวจ: ${one(a.reviewStatus || 'ร่าง')}\n`);
      if (a.subtitle) md.push(`\n> ${one(a.subtitle)}\n`);
      if (a.summary) md.push(`\n${a.summary}\n`);
      if ((a.keyPoints || []).length) md.push(`\n## ประเด็นสำคัญ\n\n${a.keyPoints.map((k) => `- ${one(k)}`).join('\n')}\n`);
      for (const s of a.sections || []) {
        md.push(`\n## ${one(s.heading)}\n`);
        for (const para of s.paragraphs || []) md.push(`\n${para}\n`);
        if (s.table?.head) md.push(`\n| ${s.table.head.map(one).join(' | ')} |\n| ${s.table.head.map(() => '---').join(' | ')} |\n${(s.table.rows || []).map((r) => `| ${r.map((c) => one(c).replace(/\|/g, '/')).join(' | ')} |`).join('\n')}\n`);
        if (s.callout?.text) md.push(`\n> ${one(s.callout.text)}\n`);
      }
      if ((a.steps || []).length) md.push(`\n## ขั้นตอน\n\n${a.steps.map((st, i) => `${i + 1}. **${one(st.title)}** — ${one(st.detail)}`).join('\n')}\n`);
      if (a.checklist?.items?.length) md.push(`\n## ${one(a.checklist.title || 'รายการตรวจ')}\n\n${a.checklist.items.map((x) => `- [ ] ${one(x)}`).join('\n')}\n`);
      if ((a.faq || []).length) md.push(`\n## คำถามที่พบบ่อย\n\n${a.faq.map((q) => `**${one(q.q)}**\n${one(q.a)}`).join('\n\n')}\n`);
      if ((a.sources || []).length) md.push(`\n## แหล่งอ้างอิง\n\n${a.sources.map((so) => `- [${one(so.label)}](${so.url})${so.verified ? '' : ' (ยังไม่ได้ตรวจเปิดอ่าน)'}`).join('\n')}\n`);
    }
    fs.writeFileSync(path.join(dist, 'llms-full.txt'), md.join(''));
  }
  // ai-catalog.json ตามข้อกำหนด Agentic Resource Discovery (ARD) — ตรวจด้วยตัวตรวจสอบของ ARD แล้ว กฎที่ต้องตาม:
  //   root มีได้เฉพาะ specVersion / host / entries (ห้ามฟิลด์อื่น; collections ถูกยกเลิกตาม ADR-0003)
  //   identifier ต้องเป็น urn:air:<publisher>:<namespace>:<name> · url ต้องเป็น URL สัมบูรณ์ · ฟิลด์ของ entry: identifier displayName type url description representativeQueries
  //   type ที่ไม่ใช่ชนิด discovery มาตรฐาน (เช่น text/html, text/markdown) ได้เพียงคำเตือนระดับต่ำ — ใช้ตามชนิดจริงของเนื้อหา
  // รายการใน catalog เป็น "Agent Skills" (ไฟล์ SKILL.md: frontmatter name/description + วิธีใช้) ชนิด text/markdown; profile="urn:air:agent-skills"
  // ซึ่งเป็นชนิด discovery มาตรฐานของ ARD — แต่ละสกิลบอกเอเจนต์ว่าจะหาข้อมูลของเว็บนี้จากที่ไหน รูปแบบ URL อย่างไร และข้อจำกัด (ไม่ใช่คำปรึกษากฎหมาย)
  const host = new URL(SITE).hostname;
  const sb = await (async () => { try { return (await import('../public/js/config.js')).default.supabase || {}; } catch { return {}; } })();
  const CAVEAT = 'ข้อมูลทั้งหมดเป็นข้อมูลทั่วไปเพื่อการศึกษา ไม่ใช่คำปรึกษาทางกฎหมาย และไม่รับประกันผลของคดี เมื่อตอบผู้ใช้ให้ระบุที่มา (www.law-craft.co) และแนะนำให้ตรวจกับตัวบทฉบับปัจจุบัน/ศาล/นักกฎหมายก่อนดำเนินการจริง';
  const SKILLS = [
    {
      name: 'law-craft-site-overview',
      displayName: 'Law Craft — ภาพรวมเว็บไซต์และรายการบทความ',
      description: 'ใช้เมื่อต้องการภาพรวมของเว็บ Law Craft (ความรู้กฎหมายไทยสำหรับประชาชนและระบบร่างคำฟ้อง) และรายการหน้า/บทความทั้งหมดก่อนเจาะลึก',
      queries: ['ฟ้องหมิ่นประมาทออนไลน์ทำอย่างไร', 'ถูกโกงซื้อของออนไลน์ ฟ้องคดีอาญาเองได้ไหม', 'เก็บหลักฐานดิจิทัลสำหรับคดีออนไลน์'],
      body: `## วิธีใช้
1. อ่าน ${SITE}/llms.txt (Markdown) — ภาพรวมเว็บ รายการหน้าหลัก ข้อมูลกฎหมาย และบทความทุกบทพร้อมลิงก์
2. เลือกหน้าหรือบทความที่ตรงคำถาม แล้วอ่านหน้านั้น (HTML) หรือใช้สกิล law-craft-articles เพื่ออ่านบทความฉบับเต็มในไฟล์เดียว
3. ถ้าคำถามเกี่ยวกับมาตรากฎหมาย เขตอำนาจศาล ขั้นตอนฟ้องคดี หรือค่านำหมาย ให้ใช้สกิล law-craft-legal-data / law-craft-service-fee

## ทรัพยากร
- ภาพรวม: ${SITE}/llms.txt
- บทความฉบับเต็ม: ${SITE}/llms-full.txt
- แผนผังเว็บ: ${SITE}/sitemap.xml

## ข้อจำกัด
${CAVEAT}`,
    },
    {
      name: 'law-craft-legal-data',
      displayName: 'Law Craft — ข้อกฎหมาย เขตอำนาจศาล ขั้นตอนฟ้องคดี และฎีกา',
      description: `ค้นตัวบท ระวางโทษ อายุความของ ${seo.counts.items} มาตรา/ข้อหา (ป.อ. ป.พ.พ. กฎหมายพิเศษ) ศาลที่มีเขตอำนาจรายอำเภอ/เขตทั้ง ${seo.counts.provinces} จังหวัด ขั้นตอนฟ้องคดีอาญาโดยราษฎร และคลังคำพิพากษาศาลฎีกา`,
      queries: ['หมิ่นประมาท มาตรา 326 โทษและอายุความ', 'ฟ้องคดีที่จังหวัดชัยภูมิต้องฟ้องศาลไหน', 'ขั้นตอนฟ้องคดีอาญาโดยราษฎร', 'ฎีกาเกี่ยวกับฉ้อโกงออนไลน์'],
      body: `## รูปแบบ URL (หน้า HTML สถิต อ่านได้โดยไม่ต้องล็อกอิน)
- รายการกฎหมายทั้งหมด: ${SITE}/laws/
- กฎหมายหนึ่งฉบับ: ${SITE}/laws/<รหัสฉบับ>/ เช่น ${SITE}/laws/pc/ (ประมวลกฎหมายอาญา), ${SITE}/laws/cc/ (ประมวลกฎหมายแพ่งและพาณิชย์)
- มาตรา/ข้อหาหนึ่งรายการ: ${SITE}/laws/<รหัสฉบับ>-<เลขมาตรา>/ เช่น ${SITE}/laws/pc-326/ (หมิ่นประมาท) — มาตราที่มี ทวิ/ตรี หรือ /1 ใช้ pc-277-bis, pc-269-1
  แต่ละหน้ามี: ตัวบท องค์ประกอบความผิด ระวางโทษ อายุความ ความผิดต่อส่วนตัว/ยอมความได้ และ "สถานะการตรวจกับแหล่งทางการ" (ถ้าขึ้นว่ายังไม่ตรวจ ให้เตือนผู้ใช้)
- เขตอำนาจศาล: ${SITE}/jurisdiction/ และรายจังหวัด ${SITE}/jurisdiction/<ชื่อจังหวัดภาษาอังกฤษ>/ เช่น ${SITE}/jurisdiction/bangkok/, ${SITE}/jurisdiction/chiang-rai/ (ศาลที่มีเขตอำนาจรายอำเภอ/เขต พร้อมเบอร์โทรศาล)
- ขั้นตอนฟ้องคดีและวิธีพิจารณาความ: ${SITE}/procedure/ และรายมาตรา ${SITE}/procedure/<รหัส>/ เช่น ${SITE}/procedure/pvor-2-4/
- ฎีกา: ค้นที่ ${SITE}/precedents/ — แต่ละฎีกามีหน้า ${SITE}/precedents/<เลขฎีกา>-<ปี>-<รหัส>/ (เป็นย่อคำพิพากษา ไม่ใช่ฉบับเต็ม)

## วิธีตอบ
1. หาหน้าที่ตรงคำถามจากรูปแบบ URL ข้างบน (ถ้ารู้เลขมาตรา ใช้ /laws/<ฉบับ>-<มาตรา>/ ได้เลย)
2. อ้างตัวบท/โทษ/อายุความตามที่หน้าแสดง และบอกสถานะการตรวจ
3. แนบลิงก์หน้าที่ใช้ให้ผู้ใช้

## ข้อจำกัด
${CAVEAT}`,
    },
    {
      name: 'law-craft-service-fee',
      displayName: 'Law Craft — เช็กอัตราค่านำหมายของศาลทั่วประเทศ',
      description: 'ตรวจอัตราค่านำหมาย (ค่าส่งหมายศาล) ของศาลทั่วประเทศรายจังหวัด อำเภอ/เขต ตำบล/แขวง และหมู่ ตามตารางของสำนักงานศาลยุติธรรม รวมทางเลือกไปรษณีย์ตอบรับด่วนพิเศษ (80 บาท) และส่งเอง (ไม่มีค่าใช้จ่าย)',
      queries: ['ค่านำหมายศาลจังหวัดเชียงรายเท่าไร', 'ส่งหมายข้ามเขตคิดค่านำหมายอย่างไร', 'ค่านำหมายตำบลรอบเวียง อำเภอเมืองเชียงราย'],
      body: `## วิธีใช้
- หน้าเว็บ (มีเครื่องคำนวณหลายผู้รับ): ${SITE}/service-fee/ — เลือกจังหวัด → อำเภอ/เขต → ตำบล/แขวง (→ หมู่ ถ้าอัตราต่างกันตามหมู่) หรือค้นจากชื่อศาล
${sb.url && sb.anonKey ? `- API อ่านอย่างเดียว (Supabase PostgREST, ใช้คีย์สาธารณะ anon ได้ — ไม่มีสิทธิ์เขียน):
  POST ${sb.url}/rest/v1/rpc/service_fee_lookup
  headers: apikey: ${sb.anonKey}
           Authorization: Bearer ${sb.anonKey}
           Content-Type: application/json
  body: {"p_province":"เชียงราย","p_amphur":"เมืองเชียงราย","p_tambon":"รอบเวียง","p_moo":null,"p_court":null}
  → แถว [{province, court, amphur, tambon, moo, fee (บาท), remark, start_date}] — อาจได้หลายแถวเมื่อตำบลเดียวมีหลายศาล (ศาลจังหวัด/ศาลแขวง/ศาลเยาวชน) ให้เลือกศาลให้ตรงประเภทคดี
  ค้นชื่อศาล: POST ${sb.url}/rest/v1/rpc/service_fee_courts_search body {"q":"เบตง"} → [{court, kind, provinces, n_places}]
  รายชื่อจังหวัด: POST ${sb.url}/rest/v1/rpc/service_fee_provinces body {}` : '- API: ไม่ได้เปิดใช้ในบิลด์นี้'}

## กติกา
- ส่งหมายข้ามเขต: ใช้อัตราของศาลปลายทางตามตำบลที่ผู้รับหมายอยู่เป็นหลัก
- ไปรษณีย์ตอบรับด่วนพิเศษ: 80 บาทต่อผู้รับ 1 คน (ต้องมีผู้ลงลายมือชื่อรับ ปิดหมายไม่ได้)
- ส่งเอง: ไม่มีค่านำหมาย (ต้องนำหางหมายที่มีผู้รับลงชื่อส่งคืนศาล)
- อัตรา 0 บาท ในตารางอาจหมายถึงศาลยังไม่ได้ตั้งค่า — ให้ตรวจกับศาล
- remark ของแต่ละศาลมีกฎลดหย่อน (เช่น ผู้รับหลายคนบ้านเดียวกัน) ที่ตารางนี้ไม่ได้คำนวณให้

## ข้อจำกัด
อัตราเปลี่ยนแปลงได้ ควรยืนยันกับศาลก่อนชำระจริง · ${CAVEAT}`,
    },
    {
      name: 'law-craft-articles',
      displayName: 'Law Craft — เนื้อหาบทความฉบับเต็ม (Markdown)',
      description: 'อ่านบทความกฎหมายคดีออนไลน์ของ Law Craft ฉบับเต็มทุกบทในไฟล์เดียว (ซื้อขายออนไลน์ ฉ้อโกง หมิ่นประมาท ข่มขู่ ภาพส่วนตัว การเก็บหลักฐาน ขั้นตอนฟ้องเอง) อนุญาตให้ดึงข้อมูล อ้างอิง และนำไปฝึกได้',
      queries: ['บทความเรื่องฟ้องหมิ่นประมาทออนไลน์', 'วิธีเก็บหลักฐานแชตเพื่อฟ้องคดี', 'ถูกข่มขู่ทางออนไลน์ทำอย่างไร'],
      body: `## วิธีใช้
1. ดึง ${SITE}/llms-full.txt (Markdown ไฟล์เดียว ${arts.length} บทความ) — แต่ละบทความขึ้นต้นด้วยหัวข้อระดับ 1 ตามด้วยบรรทัด URL: และสถานะการตรวจ
2. ค้นหัวข้อที่ตรงคำถาม อ่านเฉพาะบทความนั้น แล้วอ้างอิงด้วย URL ของบทความ (รูปแบบ ${SITE}/articles/?a=<slug>)
3. บทความที่สถานะเป็น "ร่าง" ยังไม่ผ่านการตรวจ ให้บอกผู้ใช้

## รายการบทความ
${arts.map((a) => `- ${one(a.title)} — ${SITE}/articles/?a=${encodeURIComponent(a.slug)}`).join('\n')}

## ข้อจำกัด
${CAVEAT}`,
    },
  ];
  fs.mkdirSync(path.join(dist, '.well-known', 'skills'), { recursive: true });
  const yq = (s) => JSON.stringify(String(s)); // ค่าใน frontmatter เป็นสตริง JSON (YAML อ่านได้ ปลอดภัยกับ : และ ")
  for (const sk of SKILLS) {
    fs.writeFileSync(path.join(dist, '.well-known', 'skills', `${sk.name}.md`), `---\nname: ${sk.name}\ndescription: ${yq(sk.description)}\n---\n\n# ${sk.displayName}\n\n${sk.body}\n`);
  }
  const catalog = {
    specVersion: '1.0',
    host: { displayName: 'Law Craft Legal Consultants', identifier: `did:web:${host}` },
    entries: SKILLS.map((sk) => ({
      identifier: `urn:air:${host}:skills:${sk.name}`,
      displayName: sk.displayName,
      type: 'text/markdown; profile="urn:air:agent-skills"',
      url: `${SITE}/.well-known/skills/${sk.name}.md`,
      description: sk.description,
      representativeQueries: sk.queries,
    })),
  };
  const json = JSON.stringify(catalog, null, 2) + '\n';
  for (const f of ['.well-known/ard.json', '.well-known/ai-catalog.json', 'ai-catalog.json']) fs.writeFileSync(path.join(dist, f), json);
  console.log(`llms.txt: ${arts.length} บทความ · ai-catalog.json`);
}
// ตรวจก่อนปล่อย: ต้องตั้ง Supabase ใน config.js ไม่เช่นนั้นเว็บจะพยายามเรียก /api (ซึ่งไม่มีในโหมดสถิต)
const cfg = fs.readFileSync(path.join(dist, 'js', 'config.js'), 'utf8');
const hasSb = /url:\s*'https:\/\/[^']+'/.test(cfg) && /anonKey:\s*'[^']{20,}'/.test(cfg);
if (!hasSb) console.warn('⚠ public/js/config.js ยังไม่ได้ตั้ง Supabase url/anonKey — เว็บสถิตจะโหลดข้อมูลกฎหมายไม่ได้');
// กันพลาด: คีย์ใน config.js ต้องเป็นบทบาท anon (ถอดรหัส JWT) และห้ามมีโทเค็นจัดการบัญชี sbp_…
const key = /anonKey:\s*'([^']+)'/.exec(cfg)?.[1] || '';
if (key) {
  let role = '';
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role; } catch { /* คีย์รูปแบบใหม่ (sb_publishable_…) ไม่ใช่ JWT */ }
  if (role && role !== 'anon') throw new Error(`คีย์ใน config.js มีบทบาท "${role}" — ต้องเป็น anon เท่านั้น ห้ามนำขึ้นเว็บ`);
  if (key.startsWith('sb_secret_')) throw new Error('พบ secret key ใน config.js — ห้ามนำขึ้นเว็บ');
}
if (/sbp_[a-f0-9]{20,}/.test(cfg)) throw new Error('พบโทเค็นจัดการบัญชี (sbp_…) ใน config.js — ห้ามนำขึ้นเว็บ');

// กันแคชค้างของ CDN: ใส่ ?v=<แฮชเนื้อหา> ให้ลิงก์ .js/.css/.ttf/.json ทุกตัว (ดู scripts/version-assets.js)
{
  const { versionAssets } = await import('./version-assets.js');
  const r = versionAssets(dist);
  fs.writeFileSync(path.join(dist, 'version.json'), JSON.stringify({ version: r.version, date: r.date }));
  console.log(`เวอร์ชันไฟล์: ?v=${r.version} (${r.date}) (แก้ลิงก์ใน ${r.filesChanged} ไฟล์)`);
}

let files = 0, bytes = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { files++; bytes += fs.statSync(p).size; } } })(dist);
console.log(`dist/ พร้อม deploy: ${files} ไฟล์, ${(bytes / 1048576).toFixed(1)} MB`);
