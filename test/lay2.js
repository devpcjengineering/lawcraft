const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(700);
const sel = document.querySelector('select[data-onchange=setLayoutForm]');
const res = [];
for (const o of [...sel.options]) {
  const s2 = document.querySelector('select[data-onchange=setLayoutForm]');
  s2.value = o.value; s2.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(700);
  const page = document.querySelector('#pv-inner .page');
  const active = document.querySelector('#pv-bar .tab.on')?.textContent;
  res.push(`${o.value} → ${page?.dataset.doc || 'ไม่มี'} | แท็บ: ${active || '-'}`);
}
return res;
