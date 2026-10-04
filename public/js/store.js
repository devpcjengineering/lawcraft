// สถานะกลางของแอป + ตัวช่วย path
export const S = {
  data: { laws: [], items: [], procedure: { laws: [], sections: [], snippets: [] }, courts: { groups: [] } },
  idx: { items: new Map(), laws: new Map() },
  geo: { provinces: [] },
  people: [],
  c: null,           // คดีที่เปิดอยู่
  tab: 'case',
  ui: { law: '', q: '', pvDoc: '', pvOn: true, refQ: '', refKind: 'items' },
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function getPath(obj, path) {
  if (path[0] === '@') { obj = S; path = path.slice(1); }
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  if (path[0] === '@') { obj = S; path = path.slice(1); }
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

export const actions = {};      // data-act → fn(el, ev)
export const hooks = { changed: () => {}, rerender: () => {}, toast: () => {}, preview: () => {}, layoutLive: () => {}, api: null };
