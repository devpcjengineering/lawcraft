// ตัวบอกสถานะการเชื่อมต่อฐานข้อมูล: จุดเขียว = Supabase ออนไลน์ / แดง = ออฟไลน์ / เทา = กำลังตรวจ
let state = 'check', ms = 0, getB = null, timer = 0;

const text = () => (state === 'on' ? `Supabase ออนไลน์${ms ? ` · ${ms} ms` : ''}` : state === 'off' ? 'Supabase ออฟไลน์' : 'กำลังตรวจ Supabase…');

export function connHtml() {
  const b = getB?.();
  if (!b?.ping) return '';
  return `<span class="conn" data-state="${state}" role="status" title="${text()}"><i aria-hidden="true"></i><span class="conn-t">${text()}</span></span>`;
}

function paint() {
  document.querySelectorAll('.conn').forEach((el) => {
    el.dataset.state = state;
    el.title = text();
    const t = el.querySelector('.conn-t'); if (t) t.textContent = text();
  });
}

export async function checkConn() {
  const b = getB?.();
  if (!b?.ping) return;
  try { ms = await b.ping(); state = 'on'; } catch { state = 'off'; ms = 0; }
  paint();
}

/** เริ่มตรวจทันทีและทุก 30 วินาที + ตามสถานะออนไลน์/ออฟไลน์ของเบราว์เซอร์ */
export function startConn(getBackend) {
  getB = getBackend;
  clearInterval(timer);
  checkConn();
  timer = setInterval(checkConn, 30000);
  if (!startConn.bound) {
    startConn.bound = true;
    window.addEventListener('online', checkConn);
    window.addEventListener('offline', () => { state = 'off'; ms = 0; paint(); });
  }
}
