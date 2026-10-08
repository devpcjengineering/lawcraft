// รวมไฟล์ข้อมูลกฎหมายใน data/ เป็นชุดเดียว (ใช้ร่วมกันโดยเซิร์ฟเวอร์ในเครื่อง และสคริปต์อัปโหลดขึ้น Supabase)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

export const readJson = (f) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8').replace(/^﻿/, '')); } catch { return null; }
};

/** ชื่อศาล → เบอร์โทร (จากข้อมูลเขตอำนาจทางการ) */
export function courtPhones(jur) {
  const out = {};
  for (const p of Object.values(jur?.provinces || {})) for (const arr of Object.values(p.districts || {})) for (const c of arr) if (c.phone && !out[c.name]) out[c.name] = c.phone;
  return out;
}

export function loadData() {
  const laws = new Map(), items = [];
  // criminal-code-full.json = ป.อ. ภาค ๒–๓ ที่เหลือทุกมาตรา (คัดจาก PDF กฤษฎีกา, verified:false) — ให้เลือกข้อหาได้ครบ ; ข้ามมาตราที่มีใน criminal-code.json (ฉบับคัดตรวจแล้ว) แล้ว
  // civil-code-full.json = ป.พ.พ. ทุกมาตราที่เหลือ (บรรพ ๑–๖, แก้ไขถึงฉบับที่ 25 พ.ศ. 2568, verified:false) — ข้ามมาตราที่มีใน civil-code.json แล้ว
  for (const f of ['criminal-code.json', 'criminal-code-full.json', 'criminal-special.json', 'civil-code.json', 'civil-code-full.json']) {
    const j = readJson(f);
    if (!j) continue;
    for (const l of j.laws || (j.law ? [j.law] : [])) laws.set(l.id, { ...l, file: f });
    for (const it of j.items || []) {
      const lawId = it.lawId || it.law || j.law?.id;
      items.push({ ...it, lawId, kind: it.kind || (f.startsWith('civil') ? 'civil' : 'criminal') });
    }
  }
  const procedure = readJson('procedure.json') || { laws: [], sections: [], snippets: [] };
  for (const l of procedure.laws || []) if (!laws.has(l.id)) laws.set(l.id, l);
  // ฎีกา: รวมไฟล์ precedents-*.json (ถ้ามี) เป็นรายการเดียว
  const precedents = [];
  for (const f of ['precedents-criminal.json', 'precedents-civil.json']) {
    for (const p of readJson(f)?.items || []) precedents.push(p);
  }
  return {
    laws: [...laws.values()], items, procedure, precedents,
    courts: readJson('courts.json') || { groups: [] },
    templates: readJson('templates.json') || { motions: [], answers: [], settlements: [] },
    jurisdiction: readJson('jurisdiction.json'),
    formText: readJson('form-text.json') || {},
    layout: readJson('layout.json') || { all: {}, forms: {} },
    courtPhones: courtPhones(readJson('jurisdiction.json')),
  };
}

const ARTICLE_ORDER = ['online-case-overview', 'digital-evidence', 'online-trading-fraud', 'online-trading-civil', 'online-defamation', 'online-threat-harassment', 'intimate-images', 'takedown-and-remedies'];

/** บทความทั้งหมดจาก data/articles/*.json (เรียงตามลำดับที่กำหนด ที่เหลือตามชื่อ) */
export function loadArticles() {
  const dir = path.join(DATA_DIR, 'articles');
  if (!fs.existsSync(dir)) return [];
  const list = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
    try { const a = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\uFEFF/, '')); if (a?.slug) list.push(a); } catch { /* ข้ามไฟล์เสีย */ }
  }
  const rank = (a) => { const i = ARTICLE_ORDER.indexOf(a.slug); return i < 0 ? 99 : i; };
  return list.sort((a, b) => rank(a) - rank(b) || String(a.title).localeCompare(String(b.title), 'th'));
}
