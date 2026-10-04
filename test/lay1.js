const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const img = () => document.querySelector('#pv-inner .top-c img');
const rect = () => { const r = img().getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; };
const pv = document.getElementById('preview');
const out = { previewDisplay: getComputedStyle(pv).display, workClass: document.getElementById('work').className };
await sleep(500);
out.before = rect();
const set = async (k, v) => {
  const r = document.querySelector(`input[type=range][data-k="${k}"]`);
  r.value = v; r.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(60);   // เพียง 60 มิลลิวินาที — ต้องเห็นเลื่อนแล้ว (ไม่รอ debounce)
};
await set('emblem.dx', 25); out.dx25 = rect();
await set('emblem.dy', 15); out.dy15 = rect();
await set('emblem.width', 40); out.w40 = rect();
out.numberInputSynced = document.querySelector('input[type=number][data-k="emblem.width"]').value;
out.pageStyle = document.querySelector('#pv-inner .page').getAttribute('style').slice(0, 120);
return out;
