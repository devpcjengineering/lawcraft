(() => {
  // รันภายในหน้าผลการค้นหาของ deka.supremecourt.or.th (ผ่าน CDP Runtime.evaluate) — อ่านเฉพาะ DOM ที่แสดงอยู่แล้ว
  const txt = (el) => (el ? el.textContent : '');
  const items = [...document.querySelectorAll('#deka_result_info li.clear.result')];
  const out = items.map((li) => {
    const cb = li.querySelector('input.deka-result');
    const docId = cb ? cb.value : null;
    const title = (li.querySelector('label.content-title')?.childNodes[0]?.textContent || '').replace(/^\s*\d+\.\s*/, '').trim();
    const m = title.match(/^(.*?)\s*ที่\s*(.+?)\/(\d{4})\s*$/);
    const paras = (sel) => [...li.querySelectorAll(sel + ' p.content-detail')].map((p) => p.textContent);
    const shortParas = paras('#short_text_docid_' + docId);
    const longParas = paras('#long_text_docid_' + docId);
    const laws = [...li.querySelectorAll('li.item_law > ul > li.text-option')].map((lo) => {
      const lawEl = lo.querySelector(':scope > span.word-a-href');
      const lawOn = lawEl?.getAttribute('onclick') || '';
      const lm = lawOn.match(/lawView\('([^']*)',\s*'([^']*)',\s*'([^']*)'/);
      const secs = [...lo.querySelectorAll('span.word-a-href')].slice(1).map((s) => s.textContent.trim());
      return { code: lm?.[1] ?? null, name: lm?.[2] ?? null, abbr: lm?.[3] ?? lawEl?.textContent.trim(), sections: secs };
    });
    const opt = (cls) => [...li.querySelectorAll('li.' + cls + ' > ul > li')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return {
      docId,
      titleRaw: title,
      docType: m ? m[1].trim() : null,
      caseNo: m ? m[2].trim() : null,
      year: m ? +m[3] : null,
      shortText: shortParas.join(''), // ย่อสั้น (คำพิพากษาย่อ) ตามที่ศาลเผยแพร่
      longText: longParas.join(''), // ย่อยาว ตามที่ศาลเผยแพร่ (ไม่ใช่ตัวคำพิพากษาฉบับเต็ม)
      laws,
      source: opt('item_source'),
      litigants: opt('item_litigant'),
      judges: opt('item_judge'),
      lowerCourts: opt('item_primarycourt'),
      department: opt('item_department'),
      blackNo: opt('item_deka_black_no'),
      primaryCourtNos: opt('item_primartcourt_deka_no'),
      remark: txt(li.querySelector('li.item_remark ul li')).trim(),
    };
  });
  const info = document.body.innerText.match(/พบ\s*([\d,]+)\s*(\S+)\s*จากทั้งหมด\s*([\d,]+)/);
  const pg = (document.querySelector('#pagination .info span')?.textContent || '').match(/หน้า\s*(\d+)\s*\/\s*(\d+)/);
  return {
    url: location.href,
    found: info ? +info[1].replace(/,/g, '') : null,
    allCount: info ? +info[3].replace(/,/g, '') : null,
    page: pg ? +pg[1] : null,
    totalPages: pg ? +pg[2] : null,
    bodyHead: document.body.innerText.slice(0, 400),
    n: out.length,
    items: out,
  };
})()
