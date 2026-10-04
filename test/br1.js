const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(900);
document.querySelector('[data-act=togglePreview]').click();
await sleep(900);
const el = document.querySelector('#pv-inner .between');
const pvs = document.getElementById('pv-scroll');
pvs.scrollTop = el.offsetTop * 0 + 60;
const r = el.getBoundingClientRect();
return { w: Math.round(r.width), h: Math.round(r.height), braceH: Math.round(el.querySelector('.brace').getBoundingClientRect().height), parts: el.querySelectorAll('.brace > *').length, previewVisible: getComputedStyle(document.getElementById('preview')).display };
