const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(900);
const steps = document.getElementById('steps');
const out = { navScroll: steps.scrollHeight - steps.clientHeight, navItems: steps.querySelectorAll('.nav-item').length, viewport: innerHeight };
out.items = [...steps.querySelectorAll('.nav-item')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()).join(' | ');
const main = document.getElementById('main');
out.mainOverflowX = main.scrollWidth - main.clientWidth;
out.docOverflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
return out;
