// แพ็กบทความสำหรับหน้าเว็บ: รวมข้อมูลมาตรา/ฎีกาที่อ้างถึงลงในบทความ เพื่อให้หน้าเว็บโหลดเฉพาะไฟล์เล็ก ๆ ไม่ต้องดึงฐานข้อมูลกฎหมายทั้งก้อน
// ใช้ร่วมกันระหว่างเซิร์ฟเวอร์ dev (/articles-data/*) และ build สถิต (dist/articles-data/*.json)
import { loadData, loadArticles } from './load-data.js';

export function packArticles() {
  const data = loadData();
  const items = new Map(data.items.map((x) => [x.id, x]));
  const laws = new Map(data.laws.map((x) => [x.id, x]));
  const prec = new Map(data.precedents.map((x) => [x.caseNo, x]));
  const all = loadArticles();

  const articles = {};
  for (const a of all) {
    const related = (a.relatedItems || []).map((id) => items.get(id)).filter(Boolean).map((it) => ({
      id: it.id, section: it.section, name: it.name, kind: it.kind,
      law: laws.get(it.lawId)?.short || laws.get(it.lawId)?.name || '',
      penalty: it.penalty || '', limitation: it.limitation || '', privateOffence: !!it.privateOffence, verified: it.verified !== false,
    }));
    const precedents = (a.relatedPrecedents || []).map((no) => prec.get(no)).filter(Boolean).map((p) => ({
      caseNo: p.caseNo, topic: p.topic, holding: p.holding, source: p.source || '', verified: p.verified !== false,
    }));
    articles[a.slug] = { ...a, related, precedents };
  }
  const index = all.map(({ slug, title, subtitle, category, tags, readMinutes, updated, summary }) => ({ slug, title, subtitle, category, tags, readMinutes, updated, summary }));
  return { index, articles };
}
