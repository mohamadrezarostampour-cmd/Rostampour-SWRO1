/* =========================================================================
   Plant engine — shared by Section 4 (Wastewater Treatment Plant) and
   Section 5 (Desalination Plant 1).
   Features: dashboard · daily data entry · analytics (daily / monthly / yearly
   with charts) · equipment register · periodic inspections · repairs & failures ·
   work orders (optional) · activity log · PDF / Word / Excel export · FA/EN · light/dark
   Storage: Firebase Firestore, collections prefixed per plant (sw_… / ds_…)
   ========================================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD3BGGIX2B104SdhML7eoxcvl3CjKGfXw4",
  authDomain: "rostampour-water-billing.firebaseapp.com",
  projectId: "rostampour-water-billing",
  storageBucket: "rostampour-water-billing.firebasestorage.app",
  messagingSenderId: "790326632020",
  appId: "1:790326632020:web:91cb2da018fc5e061717c1"
};
const ADMIN_EMAIL = "rostampour@rostampour-system.local";

/* ---------------- language / theme ---------------- */
const getLang = () => { try { return localStorage.getItem('rostampour-lang') || 'fa'; } catch (e) { return 'fa'; } };
const isFa = () => getLang() === 'fa';
const L = (fa, en) => isFa() ? fa : en;
const lab = (o) => isFa() ? o.fa : o.en;
const toFa = (v) => String(v).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const toEn = (v) => String(v).replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)]).replace(/٫/g, '.').replace(/،/g, '');
const D = (v) => isFa() ? toFa(v) : String(v);
const num = (n, dec) => (n === null || n === undefined || n === '' || isNaN(Number(n))) ? '—' : D(Number(n).toLocaleString('en-US', { maximumFractionDigits: dec === undefined ? 2 : dec }));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MONTHS_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const MONTHS_EN = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'];
const mName = (m) => (isFa() ? MONTHS_FA : MONTHS_EN)[m - 1];

/* ---------------- Jalali calendar helpers (Intl persian) ---------------- */
const JFMT = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
function jParts(d) { const o = {}; JFMT.formatToParts(d).forEach(p => { if (p.type === 'year' || p.type === 'month' || p.type === 'day') o[p.type] = parseInt(p.value, 10); }); return o; }
const isoToJ = (iso) => jParts(new Date(iso + 'T00:00:00Z'));
function jToISO(jy, jm, jd) {
  let g = new Date(Date.UTC(jy + 621, jm - 1, jd));
  for (let i = 0; i < 8; i++) {
    const p = jParts(g);
    if (p.year === jy && p.month === jm && p.day === jd) return g.toISOString().slice(0, 10);
    g = new Date(g.getTime() + ((jy - p.year) * 365 + (jm - p.month) * 30 + (jd - p.day)) * 86400000);
  }
  for (let o = -5; o <= 5; o++) { const c = new Date(g.getTime() + o * 86400000), p = jParts(c); if (p.year === jy && p.month === jm && p.day === jd) return c.toISOString().slice(0, 10); }
  return g.toISOString().slice(0, 10);
}
function daysInJ(jy, jm) { for (let d = 31; d >= 28; d--) { const p = isoToJ(jToISO(jy, jm, d)); if (p.year === jy && p.month === jm && p.day === d) return d; } return 29; }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const curJY = () => isoToJ(todayISO()).year;
const jStr = (iso) => { if (!iso) return '—'; const p = isoToJ(iso); return D(`${p.year}/${String(p.month).padStart(2, '0')}/${String(p.day).padStart(2, '0')}`); };
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000);

/* ---------------- icons ---------------- */
const ICON = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  entry: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.4 7.4 0 000-3l1.7-1.3-1.5-2.6-2 .7a7.6 7.6 0 00-2.6-1.5L14.6 3h-3l-.4 2.3a7.6 7.6 0 00-2.6 1.5l-2-.7-1.5 2.6 1.7 1.3a7.4 7.4 0 000 3l-1.7 1.3 1.5 2.6 2-.7a7.6 7.6 0 002.6 1.5l.4 2.3h3l.4-2.3a7.6 7.6 0 002.6-1.5l2 .7 1.5-2.6-1.7-1.3z"/>',
  cal: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3"/>',
  wrench: '<path d="M14.7 6.3a3.5 3.5 0 01-4.4 4.4L4 17l3 3 6.3-6.3a3.5 3.5 0 014.4-4.4l-2.6 2.6-2-2 2.6-2.6z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5l3 2"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  doc: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/>'
};
const svg = (k, s) => `<svg width="${s || 17}" height="${s || 17}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

/* =========================================================================
   startPlant(spec)
   ========================================================================= */
export function startPlant(spec) {
  const fbApp = initializeApp(firebaseConfig);
  const auth = getAuth(fbApp);
  let db;
  try { db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }   // offline cache + queued writes
  catch (e) { db = getFirestore(fbApp); }
  const P = spec.prefix;
  const SP = window.SWRO_PFD, HL = window.SWRO_HEALTH;
  const COLS = ['daily', 'equipment', 'pm', 'cm', 'log'].concat(spec.workOrders ? ['wo'] : []);
  const S = { daily: [], equipment: [], pm: [], cm: [], wo: [], log: [], view: 'dashboard', ready: false, online: true, alerts: {} };
  const PEND = {};
  const UI = { charts: {}, an: { scope: null, mode: 'monthly', jy: curJY(), jm: isoToJ(todayISO()).month }, search: {}, filters: {} };
  let unsubs = [];

  document.documentElement.style.setProperty('--mc', spec.color);
  const root = document.getElementById('root');

  /* ---------------- persistence ---------------- */
  const colRef = (n) => collection(db, P + n);
  /* ---- access level (the real enforcement is in the Firestore rules) ---- */
  const roleNow = () => (window.Role ? window.Role.forUser(auth.currentUser) : null);
  const isAdminR = () => roleNow() === 'admin';
  const canDailyR = () => { const r = roleNow(); return r === 'admin' || r === 'operator'; };
  const allowedView = (v) => { const r = roleNow(); if (r === 'admin') return true; if (r === 'operator') return ['dashboard', 'stage', 'health', 'entry', 'equipment', 'pm', 'cm', 'wo'].includes(v); if (r === 'viewer') return ['dashboard', 'stage', 'health', 'equipment', 'pm', 'cm', 'wo'].includes(v); return false; };
  const guard = (n, kind) => {
    const r = roleNow();
    if (r === 'admin') return;
    if (r === 'operator' && ((n === 'daily' && kind !== 'del') || (n === 'log' && kind === 'add'))) return;
    throw new Error('forbidden');
  };
  /* offline: Firestore applies the write locally at once and syncs later, but the promise only resolves on server
     acknowledgement — do not keep the UI waiting forever */
  const quick = (p) => Promise.race([p, new Promise((res) => setTimeout(res, 4500))]);
  const fbAdd = (n, data) => { guard(n, 'add'); return quick(addDoc(colRef(n), JSON.parse(JSON.stringify(data)))); };
  const fbSet = (n, id, data) => { guard(n, 'set'); return quick(setDoc(doc(db, P + n, id), JSON.parse(JSON.stringify(data)), { merge: true })); };
  const fbUpd = (n, id, data) => { guard(n, 'upd'); return quick(updateDoc(doc(db, P + n, id), JSON.parse(JSON.stringify(data)))); };
  const fbDel = (n, id) => { guard(n, 'del'); return quick(deleteDoc(doc(db, P + n, id))); };
  const postSync = () => { try { parent.postMessage({ rostampourSync: { src: spec.id, pending: Object.values(PEND).some(Boolean) } }, '*'); } catch (e) { } };
  let renderTimer = null;
  const scheduleRender = () => { clearTimeout(renderTimer); renderTimer = setTimeout(() => { if (S.ready) renderCurrent(); }, 80); };
  function attach() {
    unsubs.forEach(u => { try { u(); } catch (e) { } }); unsubs = [];
    COLS.forEach(n => {
      unsubs.push(onSnapshot(colRef(n), (snap) => {
        const arr = []; snap.forEach(d => arr.push(Object.assign({ id: d.id }, d.data())));
        const pend = !!snap.metadata.hasPendingWrites; if (PEND[n] !== pend) { PEND[n] = pend; postSync(); }
        S[n] = arr; S.online = true; setStatus(); scheduleRender();
      }, (err) => { console.error('snapshot', n, err); S.online = false; setStatus(); }));
    });
    unsubs.push(onSnapshot(doc(db, 'settings', 'alerts'), (s) => { S.alerts = s.exists() ? s.data() : {}; scheduleRender(); }, () => { }));
  }
  function setStatus() {
    const dot = document.getElementById('stDot'), tx = document.getElementById('stTxt');
    if (!dot) return;
    const pend = Object.values(PEND).some(Boolean);
    dot.className = 'dot-live' + (S.online && !pend && navigator.onLine ? '' : ' off');
    tx.textContent = !navigator.onLine ? L('آفلاین — تغییرات در صف همگام‌سازی', 'Offline — changes are queued') : pend ? L('در حال همگام‌سازی…', 'Syncing…') : S.online ? L('داده‌ها به‌صورت آنلاین ذخیره می‌شود', 'Data is stored online') : L('اتصال به حافظه آنلاین برقرار نیست', 'Online storage not reachable');
  }
  async function logAct(action, detail) { try { await fbAdd('log', { at: new Date().toISOString(), action, detail: detail || '' }); } catch (e) { } }

  /* ---------------- toast / modal ---------------- */
  function toast(msg) {
    let t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function modal(title, bodyHtml, onSave, opts) {
    const ov = document.getElementById('overlay'), m = ov.querySelector('.modal');
    m.innerHTML = `<div class="modal-head"><h3>${esc(title)}</h3><div class="close-x" id="mClose">✕</div></div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-foot">${onSave ? `<button class="btn btn-primary" id="mSave">${(opts && opts.saveLabel) || L('ذخیره', 'Save')}</button>` : ''}<button class="btn btn-ghost" id="mCancel">${onSave ? L('انصراف', 'Cancel') : L('بستن', 'Close')}</button></div>`;
    ov.classList.add('active');
    const close = () => ov.classList.remove('active');
    m.querySelector('#mClose').onclick = close; m.querySelector('#mCancel').onclick = close;
    if (onSave) m.querySelector('#mSave').onclick = async () => {
      const b = m.querySelector('#mSave'); b.disabled = true;
      try { const ok = await onSave(m); if (ok !== false) close(); } catch (e) { console.error(e); toast(L('خطا در ذخیره‌سازی؛ اتصال اینترنت را بررسی کنید', 'Save failed — check your connection')); }
      b.disabled = false;
    };
  }
  const confirmDel = (msg, fn) => modal(L('تأیید حذف', 'Confirm delete'), `<div style="font-size:14px;">${esc(msg)}</div>`, async () => { await fn(); }, { saveLabel: L('حذف', 'Delete') });

  /* ---------------- form helpers ---------------- */
  function dateField(id, label, iso, withFuture) {
    const p = isoToJ(iso || todayISO()), cy = curJY();
    const ys = []; for (let y = cy - 6; y <= cy + (withFuture ? 3 : 1); y++) ys.push(y);
    return `<div class="field"><label>${label}</label><div class="dateline" id="${id}">
      <select data-p="y">${ys.map(y => `<option value="${y}" ${y === p.year ? 'selected' : ''}>${D(y)}</option>`).join('')}</select>
      <select data-p="m">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === p.month ? 'selected' : ''}>${mName(i + 1)}</option>`).join('')}</select>
      <select data-p="d">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${i + 1 === p.day ? 'selected' : ''}>${D(i + 1)}</option>`).join('')}</select></div></div>`;
  }
  function dateVal(m, id) {
    const w = m.querySelector('#' + id); const y = +w.querySelector('[data-p=y]').value, mo = +w.querySelector('[data-p=m]').value;
    let d = +w.querySelector('[data-p=d]').value; d = Math.min(d, daysInJ(y, mo)); return jToISO(y, mo, d);
  }
  const fText = (id, label, v, ph) => `<div class="field"><label>${label}</label><input type="text" id="${id}" value="${esc(v || '')}" placeholder="${esc(ph || '')}"></div>`;
  const fNum = (id, label, v, extra) => `<div class="field"><label>${label}</label><input type="number" inputmode="decimal" step="any" id="${id}" value="${v == null ? '' : esc(v)}" ${extra || ''}></div>`;
  const fArea = (id, label, v) => `<div class="field"><label>${label}</label><textarea id="${id}">${esc(v || '')}</textarea></div>`;
  const fSel = (id, label, opts, v) => `<div class="field"><label>${label}</label><select id="${id}">${opts.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></div>`;
  const gv = (m, id) => (m.querySelector('#' + id) || {}).value || '';

  /* =====================================================================
     Layout
     ===================================================================== */
  const NAV = [
    ['dashboard', 'dash', ['داشبورد', 'Dashboard']],
    ['entry', 'entry', ['ثبت و ویرایش اطلاعات روزانه', 'Daily data entry']],
    ['reports', 'chart', ['گزارش‌ها و آمار', 'Reports & statistics']],
    ['qreport', 'doc', ['گزارش جامع ۶ نقطه', 'Six-point full report']],
    ['health', 'chart', ['سلامت RO و کارتریج', 'RO & cartridge health']],
    ['limits', 'sliders', ['حدود مجاز پارامترها', 'Parameter limits']],
    ['equipment', 'gear', ['تجهیزات', 'Equipment']],
    ['pm', 'cal', ['بازدید دوره‌ای', 'Periodic inspections']],
    ['cm', 'wrench', ['تعمیرات و خرابی‌ها', 'Repairs & failures']]
  ];
  if (spec.workOrders) NAV.push(['wo', 'list', ['دستورکار', 'Work orders']]);
  NAV.push(['log', 'clock', ['لاگ فعالیت', 'Activity log']]);

  let shownLang = getLang();
  function shell() {
    shownLang = getLang();
    const fa = isFa();
    document.documentElement.lang = fa ? 'fa' : 'en'; document.documentElement.dir = fa ? 'rtl' : 'ltr';
    document.title = lab(spec.title);
    root.innerHTML = `<div class="app">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><div class="brand-logo wide"><img src="banner-logo.png" alt="Rostampour Engineering Co."></div>
          <div class="brand-name">${esc(lab(spec.title))}<small>${esc(lab(spec.subtitle))}</small></div></div>
        <nav class="nav">${NAV.filter(([id]) => allowedView(id)).map(([id, ic, t]) => `<div class="nav-item ${S.view === id ? 'active' : ''}" data-view="${id}">${svg(ic)}<span>${esc(L(t[0], t[1]))}</span><span class="nav-count" id="cnt_${id}" style="display:none"></span></div>`).join('')}</nav>
        <div class="sidebar-foot"><span class="dot-live" id="stDot"></span><span id="stTxt"></span></div>
      </aside>
      <div class="scrim" id="scrim"></div>
      <div class="main">
        <div class="topbar"><div style="display:flex;align-items:center;gap:12px;"><button class="menu-btn" id="menuBtn">☰</button>
          <div><h1 id="pgTitle"></h1><div class="sub" id="pgSub"></div></div></div></div>
        <div class="content" id="content"></div>
      </div></div>
      <div class="overlay" id="overlay"><div class="modal"></div></div><div class="toast" id="toast"></div>`;
    root.querySelectorAll('.nav-item').forEach(n => n.onclick = () => go(n.dataset.view));
    document.getElementById('menuBtn').onclick = () => { document.getElementById('sidebar').classList.add('open'); document.getElementById('scrim').classList.add('show'); };
    document.getElementById('scrim').onclick = closeSide;
    setStatus();
  }
  function closeSide() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('scrim').classList.remove('show'); }
  function go(v) { if (!allowedView(v)) { v = 'dashboard'; } S.view = v; closeSide(); root.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === (v === 'stage' ? 'dashboard' : v))); renderCurrent(); try { document.getElementById('content').scrollTop = 0; window.scrollTo(0, 0); } catch (e) { } }
  function setTitle(t, s) { document.getElementById('pgTitle').textContent = t; document.getElementById('pgSub').textContent = s || ''; }
  function destroyCharts() { Object.values(UI.charts).forEach(c => { try { c.destroy(); } catch (e) { } }); UI.charts = {}; }
  function lockUI(c) {   // remove management controls for non-admin users
    if (isAdminR()) return;
    c.querySelectorAll('.rk-exportbar').forEach(el => el.remove());
    if (S.view === 'entry') { c.querySelectorAll('[data-d]').forEach(el => el.remove()); return; }
    if (S.view === 'stage' || S.view === 'dashboard') return;
    c.querySelectorAll('#add').forEach(el => el.remove());
    const hasActions = !!c.querySelector('.row-actions');
    c.querySelectorAll('.row-actions').forEach(el => { const td = el.closest('td'); (td || el).remove(); });
    if (hasActions) c.querySelectorAll('thead tr').forEach(tr => { const th = tr.lastElementChild; if (th && th.tagName === 'TH' && !th.textContent.trim()) th.remove(); });
  }
  function renderCurrent() {
    if (!allowedView(S.view)) S.view = 'dashboard';
    destroyCharts();
    const f = { dashboard: vDash, stage: vStage, health: vHealth, qreport: vQReport, limits: vLimits, entry: vEntry, reports: vReports, equipment: vEquip, pm: vPm, cm: vCm, wo: vWo, log: vLog }[S.view];
    if (!f) return;
    f(document.getElementById('content'));
    lockUI(document.getElementById('content'));
    [['equipment', S.equipment.length], ['pm', S.pm.length], ['cm', S.cm.filter(c => c.status === 'open').length], ['wo', S.wo.filter(w => w.status !== 'done' && w.status !== 'cancelled').length]].forEach(([id, n]) => {
      const e = document.getElementById('cnt_' + id); if (e) { e.style.display = n ? '' : 'none'; e.textContent = D(n); }
    });
  }

  /* ---------------- chart helpers ---------------- */
  const dark = () => document.body.classList.contains('dark-theme');
  const axisC = () => dark() ? '#8db3c2' : '#52708a', gridC = () => dark() ? 'rgba(255,255,255,0.07)' : 'rgba(10,50,65,0.08)';
  const PAL = ['#1565c0', '#00a896', '#ff7a59', '#f5a524', '#7c5cff', '#1f9d76', '#d43439', '#00b8d9'];
  function chartCfg(type, labels, sets, o) {
    o = o || {};
    return { type, data: { labels, datasets: sets }, options: Object.assign({ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: axisC(), font: { size: 11 } } } },
      scales: { x: { stacked: !!o.stacked, ticks: { color: axisC(), font: { size: 10 } }, grid: { display: false } }, y: { stacked: !!o.stacked, beginAtZero: o.zero !== false, ticks: { color: axisC() }, grid: { color: gridC() } } } }, o.options || {}) };
  }
  const line = (label, data, color, extra) => Object.assign({ label, data, borderColor: color, backgroundColor: color + '33', tension: .3, spanGaps: true, pointRadius: 2.5, borderWidth: 2 }, extra || {});
  const bar = (label, data, color) => ({ label, data, backgroundColor: color, borderRadius: 3 });
  function mkChart(id, cfg) {
    const cv = document.getElementById(id); if (!cv || typeof Chart === 'undefined') return;
    if (UI.charts[id]) UI.charts[id].destroy();
    UI.charts[id] = new Chart(cv.getContext('2d'), cfg);
  }
  async function ensureChart() { if (typeof Chart === 'undefined') { try { await RK.ensure.chart(); } catch (e) { } } }

  /* ---------------- param aggregation ---------------- */
  const ALLP = []; spec.groups.forEach(g => g.params.forEach(p => ALLP.push(p)));
  const PBY = {}; ALLP.forEach(p => PBY[p.key] = p);
  const dailyMap = () => { const m = {}; S.daily.forEach(r => m[r.date || r.id] = r); return m; };
  function aggregate(p, recs) {
    const vals = recs.map(r => (r.values || {})[p.key]).filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))).map(Number);
    if (!vals.length) return null;
    const st = RK.stats(vals);
    return { n: vals.length, sum: st.sum, avg: st.avg, min: st.min, max: st.max, last: vals[vals.length - 1],
      v: p.agg === 'sum' ? st.sum : p.agg === 'last' ? vals[vals.length - 1] : st.avg };
  }
  function buckets(mode, jy, jm) {
    const out = [];
    if (mode === 'daily') { const n = daysInJ(jy, jm); for (let d = 1; d <= n; d++) { const iso = jToISO(jy, jm, d); out.push({ label: D(d), full: jStr(iso), from: iso, to: iso }); } }
    else if (mode === 'monthly') { for (let m = 1; m <= 12; m++) out.push({ label: mName(m), full: mName(m) + ' ' + D(jy), from: jToISO(jy, m, 1), to: jToISO(jy, m, daysInJ(jy, m)) }); }
    else { const ys = new Set([curJY()]); S.daily.forEach(r => ys.add(isoToJ(r.date || r.id).year)); [...ys].sort((a, b) => a - b).forEach(y => out.push({ label: D(y), full: D(y), from: jToISO(y, 1, 1), to: jToISO(y, 12, daysInJ(y, 12)) })); }
    return out;
  }
  const recsIn = (b) => S.daily.filter(r => { const d = r.date || r.id; return d >= b.from && d <= b.to; }).sort((a, c) => (a.date || a.id).localeCompare(c.date || c.id));
  const fmtP = (p, v) => v === null || v === undefined ? '—' : num(v, p.dec !== undefined ? p.dec : (p.unit === '' ? 2 : 1));
  const unitOf = (p) => p.unit || '';

  /* =====================================================================
     DASHBOARD
     ===================================================================== */
  function vDash(c) {
    setTitle(lab(spec.title), lab(spec.subtitle));
    const dm = dailyMap(), dates = Object.keys(dm).sort(), last = dates[dates.length - 1];
    const today = todayISO(), rec = last ? dm[last] : null;
    const pmS = { overdue: 0, soon: 0, ok: 0 }; S.pm.forEach(p => pmS[pmStat(p).k]++);
    const openCm = S.cm.filter(x => x.status === 'open').length;
    const openWo = S.wo.filter(w => w.status !== 'done' && w.status !== 'cancelled').length;
    const kp = (label, val, sub, color) => `<div class="card kpi" style="--k:${color || 'var(--mc)'};margin:0;"><div class="kpi-label">${label}</div><div class="kpi-value">${val}</div><div class="kpi-sub">${sub || ''}</div></div>`;
    const todayDone = !!dm[today];
    c.innerHTML = `
      ${todayDone ? '' : `<div class="notice">⚠️ <div>${L('اطلاعات امروز هنوز ثبت نشده است.', "Today's data has not been entered yet.")} <a href="#" id="goEntry" style="color:var(--accent-2);font-weight:700;">${L('ثبت اطلاعات روز', 'Enter data')}</a></div></div>`}
      <style>.replay{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--panel-2)}.replay.past{border-color:#d6336c;background:rgba(214,51,108,.07)}.rp-t{font-weight:700;font-size:13px}.rp-d{font-size:12.5px;min-width:150px}
        .live-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:10px}.live-card{border:2px solid var(--border);border-radius:12px;padding:10px 12px;background:var(--panel-2)}.lc-h{display:flex;align-items:center;gap:7px;font-size:14px}.lc-dot{width:11px;height:11px;border-radius:50%}.lc-s{margin-inline-start:auto;font-size:11px;color:var(--text-muted)}.lc-n{font-size:11px;color:var(--text-dim);margin:2px 0 6px;min-height:28px}.lc-r{display:flex;align-items:center;gap:6px;padding:3px 0;border-top:1px dashed var(--border);cursor:pointer;font-size:12px}.lc-p{flex:1;color:var(--text-muted)}.lc-v{font-family:var(--mono);font-weight:800;min-width:48px;text-align:end}.lc-d{font-size:10.5px;color:var(--text-dim);margin-top:6px}
        .rc-item{border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:var(--panel-2)}.rc-h{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.rc-l{margin:8px 0 0;padding-inline-start:22px;font-size:13px;line-height:1.8}.rc-l li.hot{font-weight:700}.rc-ev{font-size:12px;font-weight:500;color:var(--accent-2)}</style>
      <div class="card" style="padding:12px"><div id="simBar"></div><div id="pfdMount"></div><div id="replayBar"></div></div>
      <div id="simPanel"></div>
      <div id="livePanel"></div>
      <div id="rootPanel"></div>
      <div id="healthMini"></div>
      <div class="grid kpi-row">
        ${kp(L('آخرین ثبت اطلاعات', 'Last data entry'), last ? jStr(last) : '—', last ? (diffDays(today, last) === 0 ? L('امروز', 'today') : D(diffDays(today, last)) + ' ' + L('روز پیش', 'days ago')) : L('بدون ثبت', 'no data'), 'var(--accent-2)')}
        ${kp(L('تعداد تجهیزات', 'Equipment'), D(S.equipment.length), '', 'var(--violet)')}
        ${kp(L('بازدید معوق', 'Overdue inspections'), D(pmS.overdue), L('نزدیک موعد: ', 'Due soon: ') + D(pmS.soon), pmS.overdue ? 'var(--red)' : 'var(--green)')}
        ${kp(L('تعمیرات باز', 'Open repairs'), D(openCm), '', openCm ? 'var(--amber)' : 'var(--green)')}
        ${spec.workOrders ? kp(L('دستورکار باز', 'Open work orders'), D(openWo), '', openWo ? 'var(--coral)' : 'var(--green)') : ''}
      </div>
      <div class="card" id="valsCard">${valsHTML()}</div>
      <div class="charts-grid" id="dashCharts"></div>
      <div class="charts-grid">
        <div class="card" style="margin:0;"><div class="panel-title"><h3>${L('بازدیدهای نیازمند توجه', 'Inspections needing attention')}</h3></div><div class="alert-list">${(() => { const a = S.pm.map(p => ({ p, s: pmStat(p) })).filter(x => x.s.k !== 'ok').sort((x, y) => x.s.d - y.s.d).slice(0, 6); return a.length ? a.map(({ p, s }) => `<div class="alert-item"><span class="tag ${s.k === 'overdue' ? 'tag-red' : 'tag-amber'}">${s.k === 'overdue' ? L('معوق', 'Overdue') : L('نزدیک موعد', 'Due soon')}</span><b>${esc(eqName(p.equipmentId))}</b><span style="color:var(--text-muted)">${esc(p.title)}</span><span style="margin-inline-start:auto" class="cell-mono">${jStr(s.due)}</span></div>`).join('') : `<div class="empty" style="padding:14px"><h4>${L('همه بازدیدها به‌روز است', 'All inspections are up to date')}</h4></div>`; })()}</div></div>
        <div class="card" style="margin:0;"><div class="panel-title"><h3>${L('تعمیرات و خرابی‌های باز', 'Open repairs & failures')}</h3></div><div class="alert-list">${(() => { const a = S.cm.filter(x => x.status === 'open').sort((x, y) => y.date.localeCompare(x.date)).slice(0, 6); return a.length ? a.map(x => `<div class="alert-item"><span class="tag tag-amber">${L('باز', 'Open')}</span><b>${esc(eqName(x.equipmentId))}</b><span style="color:var(--text-muted)">${esc((x.issue || '').slice(0, 60))}</span><span style="margin-inline-start:auto" class="cell-mono">${jStr(x.date)}</span></div>`).join('') : `<div class="empty" style="padding:14px"><h4>${L('مورد بازی وجود ندارد', 'No open items')}</h4></div>`; })()}</div></div>
      </div>`;
    const ge = document.getElementById('goEntry'); if (ge) ge.onclick = (e) => { e.preventDefault(); go('entry'); };
    drawReplay(); drawMainPfd(); drawLive(); drawRoot(); drawHealthMini();
    drawDashCharts();
  }
  async function drawDashCharts() {
    await ensureChart();
    const wrap = document.getElementById('dashCharts'); if (!wrap || S.view !== 'dashboard') return;
    const end = todayISO(), days = []; for (let i = 13; i >= 0; i--) days.push(addDays(end, -i));
    const dm = dailyMap();
    wrap.innerHTML = spec.dashCharts.map((c, i) => `<div class="chart-card"><div class="ct">${esc(lab(c.title))} — ${L('۱۴ روز اخیر', 'last 14 days')}</div><div class="chart-box" style="height:210px"><canvas id="dc_${i}"></canvas></div></div>`).join('');
    spec.dashCharts.forEach((c, i) => {
      const sets = c.series.map((k, j) => { const p = PBY[k]; const data = days.map(d => { const v = dm[d] && (dm[d].values || {})[k]; return (v === undefined || v === null || v === '') ? null : Number(v); }); return c.type === 'bar' ? bar(lab(p), data, PAL[j % PAL.length]) : line(lab(p), data, PAL[j % PAL.length]); });
      mkChart('dc_' + i, chartCfg(c.type || 'line', days.map(d => { const p = isoToJ(d); return D(p.month + '/' + p.day); }), sets));
    });
  }


  /* =====================================================================
     PFD — site dashboard + stage sub-PFD pages
     ===================================================================== */
  const limOf = (k) => ((((S.alerts || {}).limits || {})[spec.prefix.replace('_', '')]) || {})[k] || {};
  const outOf = (k, v) => { const l = limOf(k); return v != null && ((l.max != null && v > l.max) || (l.min != null && v < l.min)); };
  const stKeys = (id) => { const st = SP.STAGES[id], ks = []; (st.groups || []).forEach(gid => { const g = spec.groups.find(x => x.id === gid); if (g) g.params.forEach(p => ks.push(p.key)); }); (st.keys || []).forEach(k => { if (PBY[k] && !ks.includes(k)) ks.push(k); }); return ks; };
  function latestAt(k, asOf) {   // newest record (on or before asOf) that holds a value for k
    const rows = [...S.daily].sort((a, b) => (b.date || b.id).localeCompare(a.date || a.id));
    for (const r of rows) { const d = r.date || r.id; if (asOf && d > asOf) continue; const v = (r.values || {})[k]; if (v !== null && v !== undefined && v !== '' && !isNaN(Number(v))) return { v: Number(v), date: d }; }
    return null;
  }
  const latestOf = (k) => latestAt(k, null);
  function badStages(asOf) {
    const out = new Set(); SP.STAGE_ORDER.forEach(id => { if (stKeys(id).some(k => { const l = latestAt(k, asOf || null); return l && outOf(k, l.v); })) out.add(id); }); return out;
  }
  UI.sim = UI.sim || { on: false, off: new Set() };
  UI.back = UI.back || 0;                                   /* replay: days back from today (0 = live) */
  const asOfNow = () => UI.back > 0 ? addDays(todayISO(), -UI.back) : null;
  const vAt = (k) => { const l = latestAt(k, asOfNow()); return l ? l.v : null; };
  const simLatest = vAt;
  const hcfg = () => (S.alerts || {}).dsHealth || {};

  /* ---------- equipment health (open repair = red, overdue inspection = amber) ---------- */
  function pmStatAt(p, asOf) {
    if (!asOf) return pmStat(p);
    const hist = (Array.isArray(p.history) ? p.history : []).concat(p.lastDone ? [p.lastDone] : []).filter(d => d <= asOf).sort();
    if (!hist.length && (p.createdAt || asOf) > asOf) return null;
    const base = hist.length ? hist[hist.length - 1] : (p.createdAt || asOf), due = addDays(base, Number(p.freqDays) || 30), d = diffDays(due, asOf);
    return { k: d < 0 ? 'overdue' : d <= 7 ? 'soon' : 'ok', d, due };
  }
  const cmOpenAt = (x, asOf) => !asOf ? x.status === 'open' : ((x.date || '') <= asOf && (x.status === 'open' || (x.closedAt && x.closedAt > asOf)));
  function eqHealth(asOf) {
    const el = {}, stage = {}, rank = { bad: 2, warn: 1 };
    S.equipment.forEach(e => {
      const cms = S.cm.filter(x => x.equipmentId === e.id && cmOpenAt(x, asOf));
      const pms = S.pm.filter(p => p.equipmentId === e.id).map(p => ({ p, s: pmStatAt(p, asOf) })).filter(x => x.s && x.s.k === 'overdue');
      const k = cms.length ? 'bad' : pms.length ? 'warn' : null; if (!k) return;
      const info = SP.elInfo(e.pfdEl), st = e.stage || (info && info.stage);
      if (e.pfdEl && info) { const o = el[e.pfdEl] = el[e.pfdEl] || { k: 'warn', cm: 0, pm: 0 }; o.cm += cms.length; o.pm += pms.length; if (rank[k] > rank[o.k]) o.k = k; }
      if (st) { if (!stage[st] || rank[k] > rank[stage[st]]) stage[st] = k; }
    });
    return { el, stage };
  }

  /* ---------- live values of the six sampling points ---------- */
  const HEAD = { 1: ['rTds', 'TDS'], 2: ['fPh', 'pH'], 3: ['sOrp', 'ORP'], 4: ['cNtu', 'NTU'], 5: ['mTds', 'TDS'], 6: ['oCl', 'Cl'] };
  const pointKeys = (n) => { const g = spec.groups.find(x => x.id === SP.POINTS[n].group); return g ? g.params.map(p => p.key) : []; };
  function series7(k, endISO) {
    const dm = dailyMap(), out = [];
    for (let i = 6; i >= 0; i--) { const r = dm[addDays(endISO, -i)], v = r && r.values ? r.values[k] : null; out.push(v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v)); }
    return out;
  }
  function livePoints() {
    const asOf = asOfNow(), end = asOf || todayISO(), out = {};
    for (let n = 1; n <= 6; n++) {
      const items = pointKeys(n).map(k => { const l = latestAt(k, asOf), st = HL.status(l ? l.v : null, limOf(k)); return { k, l, st, ser: series7(k, end) }; });
      const status = HL.worst(items.map(i => i.st)), hk = HEAD[n][0], hp = PBY[hk], hi = items.find(i => i.k === hk);
      const sp = HL.spark(hi ? hi.ser : [], SP.BADGE[n][2] - 62, 12);
      const dts = items.map(i => i.l && i.l.date).filter(Boolean).sort(), dt = dts[dts.length - 1];
      out[n] = { n, items, status, spark: sp, date: dt || null,
        text: hi && hi.l ? HEAD[n][1] + ' ' + fmtP(hp, hi.l.v) : HEAD[n][1] + ' —',
        tip: (isFa() ? 'نقطه ' : 'Point ') + D(n) + ' — ' + (dt ? jStr(dt) : L('بدون ثبت', 'no data')) };
    }
    return out;
  }
  const SCOLR = { bad: '#d43439', warn: '#f5a524', ok: '#2fb36b', none: '#8a97a8' };
  const STXT = () => ({ bad: L('خارج از حد', 'out of limit'), warn: L('نزدیک حد', 'near limit'), ok: L('در حد مجاز', 'within limit'), none: L('حد تعریف نشده', 'no limit set') });
  function sparkSvg(ser, col, w, h) { const s = HL.spark(ser, w, h); return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="vertical-align:middle">${s.d ? `<path d="${s.d}" fill="none" stroke="${col}" stroke-width="1.5"/>${s.last ? `<circle cx="${s.last[0]}" cy="${s.last[1]}" r="2" fill="${col}"/>` : ''}` : ''}</svg>`; }
  function drawLive() {
    const el = document.getElementById('livePanel'); if (!el) return;
    const lv = livePoints(), tx = STXT();
    el.innerHTML = `<div class="card"><div class="panel-title"><div><h3>${L('مقادیر زنده نقاط نمونه‌برداری و روند ۷ روز', 'Live sampling-point values & 7-day trend')}</h3><div class="sub">${L('رنگ: سبز = در حد مجاز · زرد = نزدیک حد (۱۰٪ انتهای بازه) · قرمز = خارج از حد · خاکستری = حد تعریف نشده. مقادیر از ثبت روزانه اپراتور می‌آیند، نه سنسور.', 'Green = within limit · amber = within 10% of a limit · red = out of limit · grey = no limit set. Values come from the operator’s daily entry, not from sensors.')}</div></div></div>
      <div class="live-grid">${[1, 2, 3, 4, 5, 6].map(n => { const b = lv[n]; return `<div class="live-card" style="border-color:${SCOLR[b.status]}"><div class="lc-h"><span class="lc-dot" style="background:${SCOLR[b.status]}"></span><b>${L('نقطه ', 'Point ')}${D(n)}</b><span class="lc-s">${tx[b.status]}</span></div><div class="lc-n">${esc(SP.POINTS[n][isFa() ? 'fa' : 'en'])}</div>
        ${b.items.map(i => { const p = PBY[i.k]; return `<div class="lc-r" data-st="${SP.POINTS[n].stage}" data-f="p${n}"><span class="lc-p">${esc(lab(p))}</span><span class="lc-v" style="color:${SCOLR[i.st]}">${i.l ? fmtP(p, i.l.v) : '—'}</span>${sparkSvg(i.ser, SCOLR[i.st], 52, 16)}</div>`; }).join('')}
        <div class="lc-d">${b.date ? L('آخرین ثبت: ', 'Last entry: ') + jStr(b.date) : L('ثبت نشده', 'no data')}</div></div>`; }).join('')}</div></div>`;
    el.querySelectorAll('.lc-r').forEach(r => r.onclick = () => openStage(r.dataset.st, r.dataset.f));
  }

  /* ---------- root-cause panel ---------- */
  function drawRoot() {
    const el = document.getElementById('rootPanel'); if (!el) return;
    const asOf = asOfNow(), dm = dailyMap(), dates = Object.keys(dm).sort();
    const rejAt = (d) => { const r = dm[d] && dm[d].values; if (!r) return null; const c = Number(r.cTds), m = Number(r.mTds); return (c > 0 && r.mTds !== '' && r.mTds != null && !isNaN(m)) ? (c - m) / c * 100 : null; };
    const ctx = {
      keys: ALLP.map(p => p.key), v: vAt, lim: limOf, name: (k) => PBY[k] ? lab(PBY[k]) : k,
      prev: (k, n) => { const l = k === 'rej' ? { date: asOf || todayISO() } : latestAt(k, asOf); if (!l) return []; const o = []; for (let i = dates.length - 1; i >= 0 && o.length < n; i--) { const d = dates[i]; if (d >= l.date || (asOf && d > asOf)) continue; const x = k === 'rej' ? rejAt(d) : (dm[d].values || {})[k]; if (x !== null && x !== undefined && x !== '' && !isNaN(Number(x))) o.push(Number(x)); } return o; }
    };
    const raw = HL.rootCause(ctx), res = [];
    raw.forEach(r => { const sig = r.dir + '|' + r.causes.map(c => c.fa).join('|'), g = res.find(x => x.sig === sig); if (g) g.more.push(r); else res.push(Object.assign({ sig, more: [] }, r)); });
    if (!res.length) { el.innerHTML = ''; return; }
    const stOf = (k) => { for (const id of SP.STAGE_ORDER) if (stKeys(id).includes(k)) return id; return null; };
    el.innerHTML = `<div class="card"><div class="panel-title"><div><h3>🔎 ${L('ریشه‌یابی پارامترهای خارج از حد', 'Root-cause checklist for out-of-limit parameters')}${asOf ? ' — ' + jStr(asOf) : ''}</h3><div class="sub">${L('فهرست علت‌های محتمل برای بررسی در محل؛ قطعی نیست. موارد دارای «شاهد» با داده‌های ثبت‌شده شما تأیید شده‌اند و اول آمده‌اند.', 'Probable causes to check on site — not a diagnosis. Items with “evidence” are supported by your recorded data and come first.')}</div></div></div>
      <div class="alert-list">${res.map(r => { const p = PBY[r.key], sid = stOf(r.key); return `<div class="rc-item"><div class="rc-h"><span class="tag ${r.sev === 'crit' ? 'tag-red' : 'tag-amber'}">${r.sev === 'crit' ? L('بحرانی', 'Critical') : L('خارج از حد', 'Out of limit')}</span><b>${esc(lab(p))}</b><span class="cell-mono">${fmtP(p, r.v)} ${esc(unitOf(p))} ${r.dir === 'high' ? '▲' : '▼'} ${esc(limTxt(r.key))}</span>${r.more.map(q => `<span class="tag tag-amber">${esc(lab(PBY[q.key]))}: ${fmtP(PBY[q.key], q.v)}</span>`).join('')}${sid ? `<button class="btn btn-sm btn-ghost rc-go" data-st="${sid}" data-f="">${L('باز کردن مرحله', 'Open stage')}</button>` : ''}</div>
        <ol class="rc-l">${r.causes.map(c => `<li class="${c.hot ? 'hot' : ''}">${esc(L(c.fa, c.en))}${c.ev ? `<div class="rc-ev">📌 ${L('شاهد: ', 'Evidence: ')}${esc(D(L(c.ev.fa, c.ev.en)))}</div>` : ''}</li>`).join('')}</ol></div>`; }).join('')}</div></div>`;
    el.querySelectorAll('.rc-go').forEach(b => b.onclick = () => openStage(b.dataset.st, b.dataset.f));
  }

  /* ---------- cartridge / membrane summary on the dashboard ---------- */
  function healthData(endISO) { return HL.membrane({ dm: dailyMap(), end: endISO || todayISO(), cfg: hcfg(), lim: limOf, span: 60 }); }
  const lvTag = (l) => l === 'act' ? ['tag-red', L('اقدام لازم', 'Action needed')] : l === 'watch' ? ['tag-amber', L('تحت نظر', 'Watch')] : l === 'ok' ? ['tag-green', L('مطلوب', 'Good')] : ['tag-blue', L('داده کافی نیست', 'Not enough data')];
  function cipText(h) {
    const c = h.cip, nm = { sp: L('عبور نمک', 'salt passage'), npf: L('شار نرمال‌شده', 'normalised flow'), dp: L('ΔP غشاها', 'membrane ΔP') };
    if (c.kind === 'now') return L('همین حالا شست‌وشوی شیمیایی (CIP) توصیه می‌شود — شاخص: ', 'Chemical cleaning (CIP) is recommended now — indicator: ') + c.by.map(x => nm[x]).join('، ');
    if (c.kind === 'plan') return L('CIP پیشنهادی حدود ', 'Suggested CIP around ') + jStr(c.date) + L(' (حدود ', ' (about ') + D(c.days) + L(' روز دیگر، بر اساس روند ', ' days, from the trend of ') + nm[c.by] + ')';
    if (c.kind === 'watch') return L('فعلاً CIP لازم نیست؛ شاخص‌ها را زیر نظر داشته باشید.', 'No CIP needed yet; keep watching the indicators.');
    if (c.kind === 'ok') return L('عملکرد غشا نسبت به مبنا پایدار است؛ CIP لازم نیست.', 'Membrane performance is stable versus baseline; no CIP needed.');
    return L('برای این تحلیل، پارامترهای «عملکرد کارتریج و RO» (فشارها، دبی، دما) را چند روز ثبت کنید.', 'Record the “Cartridge & RO performance” parameters (pressures, flow, temperature) for a few days to enable this.');
  }
  function cartText(h) {
    const a = h.cartAdvice;
    if (a.kind === 'now') return L('اختلاف فشار کارتریج‌ها به آستانه رسیده؛ تعویض کارتریج‌ها توصیه می‌شود.', 'Cartridge ΔP reached the threshold — replace the cartridges.');
    if (a.kind === 'plan') return L('تعویض کارتریج‌ها حدود ', 'Cartridge replacement around ') + jStr(a.date) + L(' (حدود ', ' (about ') + D(a.days) + L(' روز دیگر)', ' days)');
    if (a.kind === 'watch') return L('ΔP کارتریج‌ها در حال افزایش است؛ زیر نظر بگیرید.', 'Cartridge ΔP is rising — watch it.');
    if (a.kind === 'ok') return L('اختلاف فشار کارتریج‌ها پایدار است.', 'Cartridge ΔP is stable.');
    return L('برای پیش‌بینی تعویض کارتریج، «ΔP کارتریج‌ها» را روزانه ثبت کنید.', 'Record cartridge ΔP daily to forecast replacement.');
  }
  function drawHealthMini() {
    const el = document.getElementById('healthMini'); if (!el) return;
    const h = healthData(asOfNow() || todayISO()), t1 = lvTag(h.cip.kind === 'now' ? 'act' : h.cip.kind === 'plan' || h.cip.kind === 'watch' ? 'watch' : h.cip.kind === 'ok' ? 'ok' : 'na'), t2 = lvTag(h.cart.level);
    el.innerHTML = `<div class="card"><div class="panel-title"><div><h3>${L('سلامت ممبران و کارتریج', 'Membrane & cartridge health')}</h3></div><button class="btn btn-sm btn-ghost" id="hmGo">${L('جزئیات و نمودارها', 'Details & charts')}</button></div>
      <div class="alert-list"><div class="alert-item"><span class="tag ${t1[0]}">${t1[1]}</span><b>${L('ممبران RO', 'RO membranes')}</b><span style="color:var(--text-muted)">${esc(cipText(h))}</span></div>
      <div class="alert-item"><span class="tag ${t2[0]}">${t2[1]}</span><b>${L('کارتریج‌ها', 'Cartridges')}</b><span style="color:var(--text-muted)">${esc(cartText(h))}</span></div></div></div>`;
    document.getElementById('hmGo').onclick = () => go('health');
  }

  /* ---------- time replay ---------- */
  function replayRange() { const ds = S.daily.map(r => r.date || r.id).sort(); if (!ds.length) return 0; return Math.min(365, Math.max(0, diffDays(todayISO(), ds[0]))); }
  function drawReplay() {
    const bar = document.getElementById('replayBar'); if (!bar) return;
    const N = replayRange(); if (N < 1) { bar.innerHTML = ''; return; }
    UI.back = Math.min(UI.back, N);
    bar.innerHTML = `<div class="replay"><span class="rp-t">⏪ ${L('بازپخش زمانی', 'Time replay')}</span><button class="btn btn-sm btn-ghost" id="rpPrev" title="${L('یک روز قبل', 'Previous day')}">◀</button><input type="range" id="rpSl" min="0" max="${N}" step="1" value="${N - UI.back}" style="flex:1;min-width:120px"><button class="btn btn-sm btn-ghost" id="rpNext" title="${L('یک روز بعد', 'Next day')}">▶</button><span class="rp-d" id="rpD"></span><button class="btn btn-sm btn-ghost" id="rpLive">↺ ${L('امروز', 'Today')}</button></div>`;
    const sl = document.getElementById('rpSl'), set = (back) => { UI.back = Math.max(0, Math.min(N, back)); sl.value = N - UI.back; refreshInsight(); };
    sl.oninput = () => set(N - Number(sl.value));
    document.getElementById('rpPrev').onclick = () => set(UI.back + 1);
    document.getElementById('rpNext').onclick = () => set(UI.back - 1);
    document.getElementById('rpLive').onclick = () => set(0);
    rpLabel();
  }
  function rpLabel() { const d = document.getElementById('rpD'), pm = document.getElementById('pfdMount'); if (d) d.innerHTML = UI.back ? `<b>${jStr(asOfNow())}</b> · ${D(UI.back)} ${L('روز پیش', 'days ago')}` : `<b>${L('وضعیت فعلی (زنده)', 'Current (live)')}</b>`; const w = document.getElementById('replayBar'); if (w) w.classList.toggle('past', !!UI.back); }
  function refreshInsight() { rpLabel(); drawMainPfd(); drawLive(); drawRoot(); drawHealthMini(); const v = document.getElementById('valsCard'); if (v) v.innerHTML = valsHTML(); }

  function valsHTML() {
    const dm = dailyMap(), asOf = asOfNow(), dates = Object.keys(dm).filter(d => !asOf || d <= asOf).sort(), last = dates[dates.length - 1], rec = last ? dm[last] : null;
    return `<div class="panel-title"><div><h3>${asOf ? L('مقادیر ثبت‌شده تا تاریخ انتخابی', 'Values recorded up to the chosen date') : L('آخرین مقادیر ثبت‌شده', 'Latest recorded values')}</h3><div class="sub">${last ? jStr(last) : ''}</div></div></div>
      ${rec ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));">${spec.dashParams.map(k => { const p = PBY[k]; const v = (rec.values || {})[k]; return `<div style="border:1px solid var(--border);border-radius:10px;padding:9px 12px;background:var(--panel-2);"><div style="font-size:11px;color:var(--text-muted)">${esc(lab(p))}</div><div style="font-family:var(--mono);font-size:17px;font-weight:800;color:var(--accent-2)">${v == null || v === '' ? '—' : fmtP(p, Number(v))} <small style="font-size:10px;color:var(--text-dim);font-weight:500">${esc(unitOf(p))}</small></div></div>`; }).join('')}</div>` : `<div class="empty"><h4>${L('هنوز داده‌ای ثبت نشده است', 'No data recorded yet')}</h4></div>`}`;
  }

  function drawMainPfd() {
    const m = document.getElementById('pfdMount'); if (!m) return;
    const asOf = asOfNow(), v = {}; ['tkRaw', 'tkProd', 'rec'].forEach(k => { const l = latestAt(k, asOf); if (l) v[k] = l.v; });
    const sim = UI.sim, eh = eqHealth(asOf), lv = livePoints(), live = {}; for (let n = 1; n <= 6; n++) live[n] = { status: lv[n].status, text: D(lv[n].text), spark: lv[n].spark, tip: lv[n].tip };
    SP.renderMain(m, { fa: isFa(), bad: badStages(asOf), v, sim, live, eq: eh.el, eqStage: eh.stage, open: (id, f) => openStage(id, f), openEl,
      toggle: (id) => { if (sim.off.has(id)) sim.off.delete(id); else sim.off.add(id); drawMainPfd(); },
      hint: () => toast(L('برای باز/بسته کردن شیرها و خارج‌کردن تجهیز، «حالت شبیه‌سازی» را روشن کنید', 'Turn on simulation mode to open / close valves and take equipment out of service')) });
    drawSim();
  }
  function drawSim() {
    const bar = document.getElementById('simBar'), pn = document.getElementById('simPanel'); if (!bar) return;
    const sim = UI.sim;
    bar.innerHTML = `<div class="toolbar" style="margin:0 0 10px"><button class="btn ${sim.on ? 'btn-primary' : 'btn-ghost'}" id="simTg">${sim.on ? '⏻ ' + L('حالت شبیه‌سازی روشن است', 'Simulation mode ON') : '⏻ ' + L('شبیه‌سازی خروج از مدار', 'Out-of-service simulation')}</button>
      ${sim.off.size ? `<button class="btn btn-ghost" id="simRs">↺ ${L('همه را در مدار بگذار', 'Put everything back in service')}</button>` : ''}
      <span style="font-size:12px;color:var(--text-muted)">${sim.on ? L('روی شیر (دو مثلث سبز/قرمز) یا هر تجهیز بزنید تا از مدار خارج/وارد شود. فقط شبیه‌سازی است و روی کارخانه یا داده‌ها اثری ندارد.', 'Tap a valve (green / red bow-tie) or any unit to take it out / put it in. Simulation only — nothing is sent to the plant or saved.') : L('شیرهای قطع و وصل روی PFD رسم شده‌اند؛ برای دیدن اثر بستن شیر یا خروج تجهیز بر پارامترهای بعدی، این حالت را روشن کنید.', 'Isolation valves are drawn on the PFD; switch this mode on to see how closing a valve or removing a unit affects downstream parameters.')}</span></div>`;
    document.getElementById('simTg').onclick = () => { sim.on = !sim.on; drawMainPfd(); };
    const rs = document.getElementById('simRs'); if (rs) rs.onclick = () => { sim.off.clear(); drawMainPfd(); };
    if (sim.on || sim.off.size) {
      const res = SP.simulate(sim.off, simLatest);
      pn.innerHTML = SP.simPanel(res, { fa: isFa(), name: (k) => PBY[k] ? lab(PBY[k]) : k, valOf: simLatest, prodBase: simLatest('prod') });
    } else pn.innerHTML = '';
  }
  /* ---------- click on a unit of the PFD: status + quick actions ---------- */
  function openEl(elId, stage, focus) {
    const info = SP.elInfo(elId); if (!info) { openStage(stage, focus); return; }
    const asOf = null, eqs = S.equipment.filter(e => e.pfdEl === elId), adm = isAdminR();
    const eqLine = (e) => {
      const cms = S.cm.filter(x => x.equipmentId === e.id && cmOpenAt(x, asOf)), pms = S.pm.filter(p => p.equipmentId === e.id).map(p => ({ p, s: pmStat(p) })).filter(x => x.s.k !== 'ok');
      return `<div class="alert-item" style="align-items:flex-start;flex-wrap:wrap"><span class="tag tag-blue">${esc(catLab(e.category))}</span><b>${esc(e.name)}</b>${cms.map(x => `<span class="tag tag-amber">${L('تعمیر باز: ', 'Open repair: ')}${esc((x.issue || '').slice(0, 40))}</span>`).join('')}${pms.map(({ p, s }) => `<span class="tag ${s.k === 'overdue' ? 'tag-red' : 'tag-amber'}">${s.k === 'overdue' ? L('بازدید معوق: ', 'Overdue: ') : L('نزدیک موعد: ', 'Due soon: ')}${esc(p.title)}</span>`).join('')}${!cms.length && !pms.length ? `<span class="tag tag-green">${L('بدون مورد باز', 'nothing open')}</span>` : ''}</div>`;
    };
    const html = `<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">${esc(L('مرحله: ', 'Stage: ') + (isFa() ? SP.STAGES[info.stage].fa : SP.STAGES[info.stage].en))}</div>
      ${eqs.length ? `<div class="alert-list">${eqs.map(eqLine).join('')}</div>` : `<div class="notice" style="margin:0">ℹ️ <div>${L('هنوز تجهیزی به این واحد وصل نشده است. در صفحه «تجهیزات» گزینه «واحد روی PFD» را انتخاب کنید تا وضعیت سلامت آن روی PFD دیده شود.', 'No equipment is linked to this unit yet. Pick “PFD unit” in the equipment form so its health shows on the PFD.')}</div></div>`}
      ${eqs.length > 1 ? `<div style="margin-top:10px">${fSel('o_eq', L('تجهیز مورد نظر', 'Equipment'), eqs.map(e => ({ v: e.id, l: e.name })), eqs[0].id)}</div>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px"><button class="btn btn-primary" id="oStage">${L('باز کردن مرحله و پارامترها', 'Open stage & parameters')}</button>
      ${adm ? (eqs.length ? `<button class="btn btn-ghost" id="oCm">🔧 ${L('ثبت خرابی / تعمیر', 'Log failure / repair')}</button><button class="btn btn-ghost" id="oWo">📋 ${L('صدور دستورکار', 'New work order')}</button>` : `<button class="btn btn-ghost" id="oAdd">＋ ${L('افزودن تجهیز برای این واحد', 'Add equipment for this unit')}</button>`) : `<span style="font-size:12px;color:var(--text-dim);align-self:center">${L('ثبت خرابی و دستورکار فقط برای مدیر فعال است.', 'Failures and work orders can be created by the administrator only.')}</span>`}</div>`;
    modal(isFa() ? info.fa : info.en, html, null);
    const m = document.querySelector('.modal'), pick = () => (m.querySelector('#o_eq') ? m.querySelector('#o_eq').value : (eqs[0] && eqs[0].id));
    m.querySelector('#oStage').onclick = () => { document.getElementById('overlay').classList.remove('active'); openStage(stage, focus); };
    const bc = m.querySelector('#oCm'); if (bc) bc.onclick = () => cmForm(null, { equipmentId: pick(), issue: (isFa() ? info.fa : info.en) + ': ' });
    const bw = m.querySelector('#oWo'); if (bw) bw.onclick = () => woForm(null, { equipmentId: pick(), type: 'corrective', description: (isFa() ? info.fa : info.en) + ': ' });
    const ba = m.querySelector('#oAdd'); if (ba) ba.onclick = () => equipForm(null, { stage: info.stage, pfdEl: elId, name: isFa() ? info.fa : info.en });
  }

  /* =====================================================================
     RO MEMBRANE & CARTRIDGE HEALTH page
     ===================================================================== */
  function healthSettings() {
    const c = hcfg(), th = Object.assign({}, HL.TH_DEF, c.th || {});
    const sel = (id, v) => fSel('hs_' + id, L('تاریخ ', 'Date ') + '', [{ v: 'keep', l: v ? L('بدون تغییر (', 'Keep (') + jStr(v) + ')' : L('تعریف نشده', 'Not set') }, { v: 'set', l: L('ثبت / تغییر با تاریخ زیر', 'Set to the date below') }, { v: 'clear', l: L('پاک کردن', 'Clear') }], 'keep');
    const html = `<div class="notice" style="margin:0 0 10px">ℹ️ <div>${L('«تاریخ مبنا» روزی است که ممبران تمیز/نو یا بعد از CIP بوده؛ شاخص‌ها نسبت به ۵ ثبت اول بعد از آن تاریخ سنجیده می‌شوند. اگر تعریف نشود، ۵ ثبت اول تاریخچه مبنا می‌شود.', 'The baseline date is a day when the membranes were clean (new or just after CIP); indicators are compared with the first 5 entries after it. If unset, the first 5 entries in history are used.')}</div></div>
      <b>${L('تاریخ مبنا', 'Baseline date')}</b>${sel('base', c.baselineDate)}<b>${L('آخرین CIP', 'Last CIP')}</b>${sel('cip', c.lastCip)}<b>${L('آخرین تعویض کارتریج', 'Last cartridge change')}</b>${sel('cart', c.lastCart)}
      ${dateField('hs_date', L('تاریخ برای گزینه‌های «ثبت / تغییر» (شمسی)', 'Date for the “Set” choices (Jalali)'), todayISO())}
      <div class="notice" style="margin:10px 0">⚠️ <div>${L('آستانه‌های زیر پیش‌فرضِ راهنمای عمومی سازندگان غشا هستند (نه حد مجاز کارخانه‌ی شما). با دستورالعمل سازنده‌ی ممبران خود هماهنگ کنید.', 'Thresholds below are general membrane-manufacturer guidance defaults, not your plant limits. Align them with your membrane manufacturer’s manual.')}</div></div>
      <div class="field-row">${fNum('hs_thsp', L('افزایش عبور نمک (٪)', 'Salt passage rise (%)'), th.sp)}${fNum('hs_thnpf', L('افت شار نرمال‌شده (٪)', 'Normalised flow loss (%)'), th.npf)}</div>
      <div class="field-row">${fNum('hs_thdp', L('افزایش ΔP غشاها (٪)', 'Membrane ΔP rise (%)'), th.dp)}${fNum('hs_thcart', L('افزایش ΔP کارتریج (bar)', 'Cartridge ΔP rise (bar)'), th.cart)}</div>`;
    modal(L('تنظیمات سلامت RO و کارتریج', 'RO & cartridge health settings'), html, async (m) => {
      if (!isAdminR()) throw new Error('forbidden');
      const n = (id) => Number(toEn(gv(m, 'hs_th' + id)).trim()), thv = { sp: n('sp'), npf: n('npf'), dp: n('dp'), cart: n('cart') };
      if (Object.values(thv).some(x => !isFinite(x) || x <= 0)) { toast(L('آستانه‌ها باید عدد مثبت باشند', 'Thresholds must be positive numbers')); return false; }
      const dt = dateVal(m, 'hs_date'), out = { baselineDate: c.baselineDate || null, lastCip: c.lastCip || null, lastCart: c.lastCart || null, th: thv };
      [['base', 'baselineDate'], ['cip', 'lastCip'], ['cart', 'lastCart']].forEach(([id, f]) => { const a = gv(m, 'hs_' + id); if (a === 'set') out[f] = dt; else if (a === 'clear') out[f] = null; });
      await quick(setDoc(doc(db, 'settings', 'alerts'), { dsHealth: out, updatedAt: new Date().toISOString() }, { merge: true }));
      S.alerts = Object.assign({}, S.alerts, { dsHealth: out });
      logAct(L('تنظیمات سلامت RO و کارتریج', 'RO & cartridge health settings'), ''); toast(L('ذخیره شد', 'Saved')); renderCurrent();
    });
  }
  function vHealth(c) {
    setTitle(L('سلامت RO و کارتریج', 'RO & cartridge health'), L('روند عملکرد، هشدار زودهنگام، زمان‌بندی CIP و پیش‌بینی تعویض کارتریج', 'Performance trends, early warning, CIP timing and cartridge replacement forecast'));
    const h = healthData(todayISO()), cf = hcfg(), adm = isAdminR();
    const fp = (x, d) => x == null ? '—' : num(x, d == null ? 1 : d);
    const card = (title, r, unit, extra) => { const t = lvTag(r.level); return `<div class="card" style="margin:0"><div class="panel-title"><h3>${title}</h3><span class="tag ${t[0]}">${t[1]}</span></div>
      ${r.level === 'na' ? `<div style="font-size:12px;color:var(--text-muted)">${L('برای محاسبه لازم است: ', 'Needed: ')}${r.missing.length ? r.missing.map(k => esc(lab(PBY[k]))).join('، ') : L('حداقل ۲ ثبت برای مبنا و ثبت جدید', 'at least 2 entries for the baseline plus recent data')}</div>`
        : `<div class="pgrid"><div class="pcard" style="cursor:default"><div class="pn">${L('اکنون', 'Now')}</div><div class="pv">${fp(r.now, 2)} <small>${unit}</small></div></div><div class="pcard" style="cursor:default"><div class="pn">${L('مبنا', 'Baseline')}</div><div class="pv">${fp(r.base, 2)} <small>${unit}</small></div><div class="pm">${r.baseFrom ? jStr(r.baseFrom) : ''}</div></div></div>
        <div style="font-size:12px;margin-top:8px">${extra}</div><div class="bar-track"><i style="width:${Math.min(100, r.progress)}%;background:${r.level === 'act' ? '#d43439' : r.level === 'watch' ? '#f5a524' : '#2fb36b'}"></i></div>
        <div style="font-size:11px;color:var(--text-dim)">${L('پیشرفت تا آستانه: ', 'Progress to threshold: ')}${D(Math.round(r.progress))}٪${r.daysTo != null ? ' · ' + L('رسیدن به آستانه حدود ', 'threshold in about ') + D(Math.ceil(r.daysTo)) + L(' روز دیگر', ' days') : ''}</div>`}</div>`; };
    c.innerHTML = `<style>.bar-track{height:8px;border-radius:6px;background:var(--panel-2);border:1px solid var(--border);margin-top:8px;overflow:hidden}.bar-track i{display:block;height:100%}</style>
      <div class="toolbar">${adm ? `<button class="btn btn-primary" id="hsSet">⚙ ${L('تنظیمات: تاریخ مبنا، CIP، تعویض کارتریج، آستانه‌ها', 'Settings: baseline, CIP, cartridge change, thresholds')}</button>` : ''}<button class="btn btn-ghost" id="hsEntry">＋ ${L('ثبت پارامترهای عملکرد', 'Enter performance parameters')}</button></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">
        <div class="card" style="margin:0"><div class="panel-title"><h3>${L('توصیه ممبران RO (CIP)', 'RO membranes (CIP advice)')}</h3></div><div style="font-size:14px;font-weight:600">${esc(cipText(h))}</div><div style="font-size:12px;color:var(--text-muted);margin-top:8px">${cf.lastCip ? L('آخرین CIP: ', 'Last CIP: ') + jStr(cf.lastCip) + ' (' + D(h.sinceCip) + L(' روز پیش)', ' days ago)') : L('تاریخ آخرین CIP ثبت نشده است.', 'Last CIP date not recorded.')}</div></div>
        <div class="card" style="margin:0"><div class="panel-title"><h3>${L('توصیه کارتریج‌ها', 'Cartridge advice')}</h3></div><div style="font-size:14px;font-weight:600">${esc(cartText(h))}</div><div style="font-size:12px;color:var(--text-muted);margin-top:8px">${cf.lastCart ? L('آخرین تعویض: ', 'Last change: ') + jStr(cf.lastCart) + ' (' + D(h.sinceCart) + L(' روز پیش)', ' days ago)') : L('تاریخ آخرین تعویض ثبت نشده است.', 'Last change date not recorded.')}</div></div></div>
      <div style="height:12px"></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">
        ${card(L('عبور نمک (٪ = ۱۰۰ − درصد حذف)', 'Salt passage (% = 100 − rejection)'), h.sp, '%', L('تغییر نسبت به مبنا: ', 'Change vs baseline: ') + (h.sp.change == null ? '—' : D((h.sp.change >= 0 ? '+' : '') + h.sp.change.toFixed(1)) + '٪') + ' · ' + L('آستانه: ', 'threshold: ') + D(h.th.sp) + '٪')}
        ${card(L('شار نرمال‌شده پرمیت (تقریبی)', 'Normalised permeate flow (approx.)'), h.npf, L('واحد نسبی', 'rel. units'), L('افت نسبت به مبنا: ', 'Loss vs baseline: ') + (h.npf.change == null ? '—' : D(h.npf.change.toFixed(1)) + '٪') + ' · ' + L('آستانه: ', 'threshold: ') + D(h.th.npf) + '٪')}
        ${card(L('اختلاف فشار غشاها (فشار خوراک − کنسانتره)', 'Membrane ΔP (feed − concentrate pressure)'), h.dp, 'bar', L('افزایش نسبت به مبنا: ', 'Rise vs baseline: ') + (h.dp.change == null ? '—' : D((h.dp.change >= 0 ? '+' : '') + h.dp.change.toFixed(1)) + '٪') + ' · ' + L('آستانه: ', 'threshold: ') + D(h.th.dp) + '٪')}
        ${card(L('اختلاف فشار کارتریج‌ها', 'Cartridge ΔP'), h.cart, 'bar', L('افزایش نسبت به حالت تمیز: ', 'Rise vs clean value: ') + (h.cart.change == null ? '—' : D(h.cart.change.toFixed(2)) + ' bar') + ' · ' + (h.cart.target != null ? L('آستانه تعویض: ', 'replace at: ') + D((h.cart.target).toFixed(2)) + ' bar ' + (h.cart.byLimit ? L('(حد مجاز شما)', '(your limit)') : L('(پیش‌فرض: مبنا + ', '(default: base + ') + D(h.th.cart) + ' bar)') : ''))}
      </div>
      <div class="charts-grid" style="margin-top:12px">${[['hc_rej', L('درصد حذف نمک (TDS نقطه ۴ ← ۵)', 'Salt rejection (TDS point 4 → 5)')], ['hc_rec', L('ریکاوری (٪)', 'Recovery (%)')], ['hc_npf', L('شار نرمال‌شده (٪ مبنا = ۱۰۰)', 'Normalised flow (% of baseline = 100)')], ['hc_dpm', L('ΔP غشاها (bar)', 'Membrane ΔP (bar)')], ['hc_cdp', L('ΔP کارتریج‌ها (bar)', 'Cartridge ΔP (bar)')]].map(([id, t]) => `<div class="chart-card"><div class="ct">${t} — ${L('۶۰ روز اخیر', 'last 60 days')}</div><div class="chart-box" style="height:210px"><canvas id="${id}"></canvas></div></div>`).join('')}</div>
      <div class="card"><div class="panel-title"><h3>${L('روش محاسبه و محدودیت‌ها', 'Method & limitations')}</h3></div><div style="font-size:12.5px;line-height:1.9;color:var(--text-muted)">
        ${L('• همه‌ی اعداد از ثبت روزانه‌ی اپراتور می‌آیند (حسگر زنده وجود ندارد). هر شاخص به‌صورت میانگین ۳ ثبت اخیر در ۷ روز گذشته با «مبنا» (۵ ثبت اول بعد از تاریخ مبنا) مقایسه می‌شود.', '• All numbers come from the operator’s daily entries (no live sensors). Each indicator is the mean of the last 3 entries within 7 days compared with the baseline (first 5 entries after the baseline date).')}<br>
        ${L('• عبور نمک = ۱۰۰ − درصد حذف؛ شار نرمال‌شده = دبی پرمیت ÷ ضریب دما ÷ فشار محرک خالص (فشار خوراک − نصف افت فشار − فشار اسمزی تقریبی ۰٫۰۰۰۷ bar به‌ازای هر ppm TDS) نسبت به مبنا. چون فشار اسمزی تقریبی است، فقط «روند» معتبر است نه عدد مطلق.', '• Salt passage = 100 − rejection; normalised flow = permeate flow ÷ temperature factor ÷ net driving pressure (feed − ½ΔP − approx. osmotic pressure 0.0007 bar per ppm TDS) relative to baseline. Osmotic pressure is approximate, so only the trend is meaningful.')}<br>
        ${L('• فشارها و دبی باید همیشه از همان خط شاخص RO و در همان ساعت روز ثبت شوند.', '• Record pressures and flow always from the same reference RO train at the same time of day.')}<br>
        ${L('• پیش‌بینی روز باقی‌مانده با رگرسیون خطی ۲۱ روز اخیر است (حداقل ۵ ثبت)؛ نوسان داده‌ها آن را نامطمئن می‌کند. تصمیم نهایی CIP/تعویض با شماست.', '• Days remaining use a linear fit of the last 21 days (min. 5 entries); noisy data makes it unreliable. The final CIP / replacement decision is yours.')}</div></div>`;
    const hs = document.getElementById('hsSet'); if (hs) hs.onclick = healthSettings;
    document.getElementById('hsEntry').onclick = () => { UI.filters.entryGroup = 'perf'; go('entry'); };
    drawHealthCharts(h);
  }
  async function drawHealthCharts(h) {
    await ensureChart(); if (S.view !== 'health' || !document.getElementById('hc_rej')) return;
    const lb = h.days.map(d => { const q = isoToJ(d); return D(q.month + '/' + q.day); }), cf = (id, label, data, col, extra, o) => mkChart(id, chartCfg('line', lb, [line(label, data, col)].concat(extra || []), o || { zero: false }));
    const flat = (v, label, col) => ({ label, data: h.days.map(() => v), borderColor: col, borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 });
    cf('hc_rej', L('درصد حذف نمک', 'Salt rejection'), h.series.rej, PAL[0]);
    cf('hc_rec', L('ریکاوری', 'Recovery'), h.series.rec, PAL[4]);
    cf('hc_npf', L('شار نرمال‌شده', 'Normalised flow'), h.series.npf, PAL[1], h.npf.base != null ? [flat(100 - h.th.npf, L('آستانه CIP', 'CIP threshold'), '#d43439')] : []);
    cf('hc_dpm', L('ΔP غشاها', 'Membrane ΔP'), h.series.dpm, PAL[2], h.dp.base != null ? [flat(h.dp.base * (1 + h.th.dp / 100), L('آستانه CIP', 'CIP threshold'), '#d43439')] : []);
    cf('hc_cdp', L('ΔP کارتریج‌ها', 'Cartridge ΔP'), h.series.cdp, PAL[3], h.cart.target != null ? [flat(h.cart.target, L('آستانه تعویض', 'Replace at'), '#d43439')] : []);
  }
  function openStage(id, focus) { UI.stageId = id; UI.stageFocus = focus || ''; UI.stageKey = null; go('stage'); }
  function limTxt(k) { const l = limOf(k); if (l.min == null && l.max == null) return L('حد مجاز تعریف نشده', 'no limit set'); return L('حد مجاز: ', 'Limit: ') + (l.min != null ? D(l.min) : '…') + ' – ' + (l.max != null ? D(l.max) : '…'); }
  function vStage(c) {
    const id = UI.stageId; if (!id || !SP.STAGES[id]) { go('dashboard'); return; }
    const st = SP.STAGES[id], keys = stKeys(id), fa = isFa();
    setTitle(fa ? st.fa : st.en, L('PFD زیرشاخه و پارامترهای این مرحله', 'Sub-PFD and parameters of this stage'));
    const eqs = S.equipment.filter(e => e.stage === id);
    const card = (k) => {
      const p = PBY[k], l = latestOf(k), bad = l && outOf(k, l.v);
      return `<div class="pcard ${bad ? 'bad' : ''} ${UI.stageKey === k ? 'sel' : ''}" data-k="${k}"><div class="pn">${esc(lab(p))}</div>
        <div class="pv">${l ? fmtP(p, l.v) : '—'} <small>${esc(unitOf(p))}</small></div>
        <div class="pm">${l ? jStr(l.date) : L('ثبت نشده', 'no data')}${bad ? ' · <b style="color:var(--red)">' + L('خارج از حد', 'out of limit') + '</b>' : ''}</div>
        <div class="pl">${esc(limTxt(k))}</div>${p.note ? `<div class="pnote">${esc(p.note)}</div>` : ''}</div>`;
    };
    const blocks = (st.groups || []).map(gid => { const g = spec.groups.find(x => x.id === gid); if (!g) return ''; const rejHtml = (g.derived || []).map(d => { const base = {}; ALLP.forEach(p => { const l = latestOf(p.key); base[p.key] = l ? l.v : null; }); const val = d.fn(base); return val == null || !isFinite(val) ? '' : `<div class="pcard"><div class="pn">${esc(lab(d))}</div><div class="pv">${num(val, d.dec)} <small>${esc(d.unit || '')}</small></div><div class="pm">${L('محاسبه از آخرین مقادیر', 'from latest values')}</div></div>`; }).join('');
      return `<div class="card"><div class="panel-title"><h3>${esc(lab(g))}</h3></div><div class="pgrid">${g.params.map(p => card(p.key)).join('')}${rejHtml}</div></div>`; }).join('');
    const extra = (st.keys || []).filter(k => PBY[k]);
    c.innerHTML = `<style>
      .pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}
      .pcard{border:1px solid var(--border);border-radius:10px;padding:9px 12px;background:var(--panel-2);cursor:pointer}
      .pcard.sel{border-color:var(--mc);box-shadow:0 0 0 2px var(--mc) inset}.pcard.bad{border-color:#d43439;background:rgba(212,52,57,.08)}
      .pn{font-size:12px;color:var(--text-muted)}.pv{font-family:var(--mono);font-size:20px;font-weight:800;color:var(--accent-2)}.pv small{font-size:11px;color:var(--text-dim);font-weight:500}
      .pm{font-size:11px;color:var(--text-dim)}.pl{font-size:11px;color:var(--text-muted);margin-top:3px}.pnote{font-size:11px;color:var(--text-dim);margin-top:3px;font-style:italic}
    </style>
      <div class="toolbar"><button class="btn btn-ghost" id="stBack">${fa ? '→' : '←'} ${L('PFD کارخانه', 'Plant PFD')}</button>
        ${canDailyR() && keys.length ? `<button class="btn btn-primary" id="stEntry">＋ ${L('ثبت پارامترهای این مرحله', 'Enter this stage')}</button>` : ''}
        ${isAdminR() && keys.length ? `<button class="btn btn-ghost" id="stLim">⚙ ${L('تعیین حدود مجاز', 'Set limits')}</button>` : ''}
        <div style="flex:1"></div></div>
      <div id="stDiag"></div>
      ${st.note ? `<div class="notice" style="margin-top:12px">ℹ️ <div>${esc(L(st.note[0], st.note[1]))}</div></div>` : ''}
      ${st.info ? `<div class="card" style="margin-top:12px"><div class="panel-title"><h3>${L('مشخصات ثابت مرحله', 'Fixed stage data')}</h3></div><div class="pgrid">${st.info.map(i => `<div class="pcard" style="cursor:default"><div class="pn">${esc(L(i[0], i[1]))}</div><div class="pv" style="font-size:16px;font-family:inherit">${esc(L(i[2], i[3]))}</div></div>`).join('')}</div></div>` : ''}
      <div style="height:12px"></div>${blocks}
      ${extra.length ? `<div class="card"><div class="panel-title"><h3>${L('پارامترهای مرتبط', 'Related parameters')}</h3></div><div class="pgrid">${extra.map(card).join('')}</div></div>` : ''}
      ${keys.length ? `<div class="chart-card"><div class="ct" id="stCt"></div><div class="chart-box" style="height:250px"><canvas id="stc"></canvas></div></div>` : `<div class="card"><div class="empty"><h4>${L('برای این مرحله پارامتر روزانه‌ای تعریف نشده است', 'No daily parameter is defined for this stage')}</h4></div></div>`}
      <div class="card"><div class="panel-title"><h3>${L('تجهیزات این مرحله', 'Equipment of this stage')}</h3></div>${eqs.length ? `<div class="alert-list">${eqs.map(e => { const o = S.cm.filter(x => x.equipmentId === e.id && x.status === 'open').length; return `<div class="alert-item"><span class="tag tag-blue">${esc(catLab(e.category))}</span><b>${esc(e.name)}</b><span style="color:var(--text-muted)">${esc(e.location || '')}</span>${o ? `<span class="tag tag-amber" style="margin-inline-start:auto">${L('تعمیر باز: ', 'Open repairs: ')}${D(o)}</span>` : ''}</div>`; }).join('')}</div>` : `<div class="empty" style="padding:14px"><h4>${L('تجهیزی به این مرحله وصل نشده', 'No equipment linked to this stage')}</h4><div style="font-size:12px;color:var(--text-muted)">${L('در صفحه «تجهیزات»، هنگام افزودن/ویرایش تجهیز، گزینه «مرحله در PFD» را انتخاب کنید.', 'In “Equipment”, pick “PFD stage” when adding / editing equipment.')}</div></div>`}</div>`;
    SP.renderStage(document.getElementById('stDiag'), id, { fa, focus: UI.stageFocus, off: UI.sim.off });
    document.getElementById('stBack').onclick = () => go('dashboard');
    const be = document.getElementById('stEntry'); if (be) be.onclick = () => stageEntry(id);
    const bl = document.getElementById('stLim'); if (bl) bl.onclick = () => stageLimits(id);
    c.querySelectorAll('.pcard[data-k]').forEach(el => el.onclick = () => { UI.stageKey = el.dataset.k; c.querySelectorAll('.pcard').forEach(x => x.classList.toggle('sel', x.dataset.k === UI.stageKey)); drawStageChart(keys); });
    drawStageChart(keys);
  }
  async function drawStageChart(keys) {
    if (!keys.length) return; await ensureChart();
    if (S.view !== 'stage' || !document.getElementById('stc')) return;
    const k = keys.includes(UI.stageKey) ? UI.stageKey : keys[0], p = PBY[k];
    const end = todayISO(), days = []; for (let i = 29; i >= 0; i--) days.push(addDays(end, -i));
    const dm = dailyMap(), l = limOf(k);
    const data = days.map(d => { const v = dm[d] && (dm[d].values || {})[k]; return (v === undefined || v === null || v === '') ? null : Number(v); });
    const sets = [line(lab(p) + (p.unit ? ` (${p.unit})` : ''), data, PAL[0])];
    if (l.max != null) sets.push({ label: L('حد بالا', 'Max'), data: days.map(() => l.max), borderColor: '#d43439', borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 });
    if (l.min != null) sets.push({ label: L('حد پایین', 'Min'), data: days.map(() => l.min), borderColor: '#f5a524', borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 });
    document.getElementById('stCt').textContent = lab(p) + ' — ' + L('۳۰ روز اخیر (برای تغییر، روی پارامتر بالا بزنید)', 'last 30 days (tap a parameter above to change)');
    mkChart('stc', chartCfg('line', days.map(d => { const q = isoToJ(d); return D(q.month + '/' + q.day); }), sets, { zero: false }));
  }
  function stageEntry(id) {
    const st = SP.STAGES[id], keys = stKeys(id);
    const fill = (m) => { const d = dateVal(m, 'f_date'), ex = S.daily.find(r => (r.date || r.id) === d); keys.forEach(k => { const el = m.querySelector('#f_' + k); if (el) el.value = ex && ex.values && ex.values[k] != null ? ex.values[k] : ''; }); m.querySelector('#dayHint').style.display = ex ? '' : 'none'; };
    const html = dateField('f_date', L('تاریخ (شمسی)', 'Date (Jalali)'), todayISO()) + `<div id="dayHint" class="notice" style="display:none;margin:0;">ℹ️ ${L('برای این تاریخ قبلاً اطلاعات ثبت شده؛ ذخیره، مقادیر این مرحله را ویرایش می‌کند.', 'A record already exists for this date; saving updates these values.')}</div>` +
      `<div class="fgroup"><div class="field-row">${keys.map(k => { const p = PBY[k]; return fNum('f_' + k, `${esc(lab(p))}${p.unit ? `<span class="u">(${esc(p.unit)})</span>` : ''}`, '', `${p.min !== undefined ? `min="${p.min}"` : ''} ${p.max !== undefined ? `max="${p.max}"` : ''}`); }).join('')}</div></div>`;
    modal(L('ثبت پارامترهای ', 'Enter ') + (isFa() ? st.fa : st.en), html, async (m) => {
      const date = dateVal(m, 'f_date'), vals = {}; let bad = null;
      keys.forEach(k => { const p = PBY[k], raw = toEn(gv(m, 'f_' + k)).trim(); if (raw === '') return; const n = Number(raw); if (isNaN(n) || (p.min !== undefined && n < p.min) || (p.max !== undefined && n > p.max)) { bad = lab(p); return; } vals[k] = n; });
      if (bad) { toast(L('مقدار نامعتبر: ', 'Invalid value: ') + bad); return false; }
      if (!Object.keys(vals).length) { toast(L('حداقل یک مقدار وارد کنید', 'Enter at least one value')); return false; }
      const old = S.daily.find(r => (r.date || r.id) === date);
      const merged = Object.assign({}, old && old.values ? old.values : {}, vals);
      await fbSet('daily', date, { date, values: merged, updatedAt: new Date().toISOString() });
      logAct(L('ثبت پارامترهای مرحله: ', 'Stage entry: ') + (isFa() ? st.fa : st.en), jStr(date));
      const out = keys.filter(k => k in vals && outOf(k, vals[k])).map(k => lab(PBY[k]));
      toast(out.length ? L('ذخیره شد — ⚠ خارج از حد مجاز: ', 'Saved — ⚠ outside limit: ') + out.join('، ') : L('ذخیره شد', 'Saved'));
    });
    document.querySelectorAll('#f_date select').forEach(sel => sel.addEventListener('change', () => fill(document.querySelector('.modal')))); fill(document.querySelector('.modal'));
  }
  function stageLimits(id) {
    const st = SP.STAGES[id], keys = stKeys(id);
    const html = `<div class="notice" style="margin:0 0 10px">ℹ️ <div>${L('حداقل و حداکثر مجاز هر پارامتر را بنویسید؛ خالی بگذارید یعنی بدون حد. اگر مقدار ثبت‌شده خارج از حد باشد، در PFD قرمز می‌شود و در هشدارها می‌آید.', 'Enter the allowed min / max of each parameter; empty means no limit. Out-of-limit values turn red in the PFD and raise alerts.')}</div></div>
      <div class="table-wrap"><table><thead><tr><th>${L('پارامتر', 'Parameter')}</th><th style="width:100px">${L('حداقل', 'Min')}</th><th style="width:100px">${L('حداکثر', 'Max')}</th></tr></thead><tbody>${keys.map(k => { const p = PBY[k], l = limOf(k); return `<tr><td>${esc(lab(p))} <span style="color:var(--text-dim)">${esc(unitOf(p))}</span></td><td><input type="number" step="any" id="lmin_${k}" value="${l.min != null ? l.min : ''}" style="width:90px"></td><td><input type="number" step="any" id="lmax_${k}" value="${l.max != null ? l.max : ''}" style="width:90px"></td></tr>`; }).join('')}</tbody></table></div>`;
    modal(L('تعیین حدود مجاز — ', 'Set limits — ') + (isFa() ? st.fa : st.en), html, async (m) => {
      const o = {};
      for (const k of keys) {
        const a = toEn(gv(m, 'lmin_' + k)).trim(), b = toEn(gv(m, 'lmax_' + k)).trim();
        const mn = a === '' ? null : Number(a), mx = b === '' ? null : Number(b);
        if ((mn !== null && isNaN(mn)) || (mx !== null && isNaN(mx)) || (mn !== null && mx !== null && mn > mx)) { toast(L('حد نامعتبر: ', 'Invalid limit: ') + lab(PBY[k])); return false; }
        o[k] = { min: mn, max: mx };
      }
      if (!isAdminR()) throw new Error('forbidden');
      const key = spec.prefix.replace('_', '');
      await quick(setDoc(doc(db, 'settings', 'alerts'), { limits: { [key]: o }, updatedAt: new Date().toISOString() }, { merge: true }));
      S.alerts = Object.assign({}, S.alerts, { limits: Object.assign({}, (S.alerts || {}).limits, { [key]: Object.assign({}, ((S.alerts || {}).limits || {})[key], o) }) });
      logAct(L('تعیین حدود مجاز: ', 'Limits set: ') + (isFa() ? st.fa : st.en), '');
      toast(L('حدود ذخیره شد', 'Limits saved')); renderCurrent();
    });
  }


  /* =====================================================================
     PARAMETER LIMITS (all parameters, set manually by the admin)
     ===================================================================== */
  function vLimits(c) {
    setTitle(L('حدود مجاز پارامترها', 'Parameter limits'), L('حداقل و حداکثر مجاز هر پارامتر را خودتان تعیین کنید؛ خالی = بدون حد', 'Set the allowed min / max of each parameter yourself; empty = no limit'));
    c.innerHTML = `<div class="notice">ℹ️ <div>${L('پس از تعریف حد، هر مقدار ثبت‌شده‌ای که خارج از آن باشد: هنگام ثبت هشدار می‌دهد، مرحله مربوط را در PFD قرمز می‌کند و در مرکز هشدارها می‌آید. حدود از پیش پر نشده‌اند.', 'Once a limit is set, an out-of-range value warns on entry, turns the stage red in the PFD and appears in the alert centre. Nothing is pre-filled.')}</div></div>
      <div class="toolbar"><button class="btn btn-primary" id="limSave">💾 ${L('ذخیره همه حدود', 'Save all limits')}</button><button class="btn btn-ghost" id="limClr">${L('پاک‌کردن همه', 'Clear all')}</button></div>
      ${spec.groups.map(g => `<div class="card"><div class="panel-title"><h3>${esc(lab(g))}</h3></div><div class="table-wrap"><table><thead><tr><th>${L('پارامتر', 'Parameter')}</th><th>${L('واحد', 'Unit')}</th><th style="width:110px">${L('حداقل', 'Min')}</th><th style="width:110px">${L('حداکثر', 'Max')}</th></tr></thead><tbody>${g.params.map(p => { const l = limOf(p.key); return `<tr><td class="cell-strong">${esc(lab(p))}</td><td>${esc(unitOf(p))}</td><td><input type="number" step="any" class="lim" data-k="${p.key}" data-w="min" value="${l.min != null ? l.min : ''}" style="width:96px"></td><td><input type="number" step="any" class="lim" data-k="${p.key}" data-w="max" value="${l.max != null ? l.max : ''}" style="width:96px"></td></tr>`; }).join('')}</tbody></table></div></div>`).join('')}`;
    document.getElementById('limClr').onclick = () => c.querySelectorAll('input.lim').forEach(i => i.value = '');
    document.getElementById('limSave').onclick = async () => {
      const o = {}; let bad = null;
      c.querySelectorAll('input.lim').forEach(i => { const raw = toEn(i.value).trim(); const k = i.dataset.k; o[k] = o[k] || { min: null, max: null }; if (raw === '') return; const n = Number(raw); if (isNaN(n)) { bad = lab(PBY[k]); return; } o[k][i.dataset.w] = n; });
      Object.keys(o).forEach(k => { if (o[k].min != null && o[k].max != null && o[k].min > o[k].max) bad = lab(PBY[k]); });
      if (bad) { toast(L('حد نامعتبر: ', 'Invalid limit: ') + bad); return; }
      try {
        if (!isAdminR()) throw new Error('forbidden');
        const key = spec.prefix.replace('_', '');
        await quick(setDoc(doc(db, 'settings', 'alerts'), { limits: { [key]: o }, updatedAt: new Date().toISOString() }, { merge: true }));
        S.alerts = Object.assign({}, S.alerts, { limits: Object.assign({}, (S.alerts || {}).limits, { [key]: o }) });
        logAct(L('تعیین حدود مجاز پارامترها', 'Parameter limits set'), '');
        toast(L('حدود ذخیره شد', 'Limits saved'));
      } catch (e) { console.error(e); toast(L('ذخیره نشد؛ اتصال یا سطح دسترسی را بررسی کنید', 'Not saved — check connection / access')); }
    };
  }

  /* =====================================================================
     SIX-POINT FULL REPORT (archive / presentation)
     ===================================================================== */
  const QPOINTS = [1, 2, 3, 4, 5, 6];
  const QBASE = [['Ph', 'pH', ''], ['Ec', 'EC', 'µS/cm'], ['Orp', 'ORP', 'mV'], ['Tds', 'TDS', 'ppm'], ['Th', 'TH', 'ppm'], ['Ntu', 'NTU', 'NTU'], ['Cl', L('کلر آزاد', 'Free chlorine'), 'ppm'], ['Tss', 'TSS', 'ppm']];
  const QPRE = { 1: 'r', 2: 'f', 3: 's', 4: 'c', 5: 'm', 6: 'o' };
  function qRange() {
    const q = UI.qr = UI.qr || { mode: 'month', jy: curJY(), jm: isoToJ(todayISO()).month, jd: isoToJ(todayISO()).day };
    if (q.mode === 'day') { const iso = jToISO(q.jy, q.jm, Math.min(q.jd, daysInJ(q.jy, q.jm))); return { from: iso, to: iso, label: jStr(iso) }; }
    if (q.mode === 'month') return { from: jToISO(q.jy, q.jm, 1), to: jToISO(q.jy, q.jm, daysInJ(q.jy, q.jm)), label: mName(q.jm) + ' ' + D(q.jy) };
    return { from: jToISO(q.jy, 1, 1), to: jToISO(q.jy, 12, daysInJ(q.jy, 12)), label: L('سال ', 'Year ') + D(q.jy) };
  }
  function qData(rg) {
    const recs = S.daily.filter(r => { const d = r.date || r.id; return d >= rg.from && d <= rg.to; }).sort((a, b) => (a.date || a.id).localeCompare(b.date || b.id));
    const agg = (k) => aggregate(PBY[k], recs);
    const out = (k) => { let n = 0; recs.forEach(r => { const v = (r.values || {})[k]; if (v != null && v !== '' && outOf(k, Number(v))) n++; }); return n; };
    const pointTables = QPOINTS.map(pt => {
      const g = spec.groups.find(x => x.id === SP.POINTS[pt].group);
      const rows = g.params.map(p => { const a = agg(p.key), l = limOf(p.key);
        return [lab(p), unitOf(p) || '—', l.min != null ? num(l.min, 2) : '—', l.max != null ? num(l.max, 2) : '—', a ? fmtP(p, a.last) : '—', a ? fmtP(p, a.avg) : '—', a ? fmtP(p, a.min) : '—', a ? fmtP(p, a.max) : '—', a ? D(a.n) : '—', a ? D(out(p.key)) : '—']; });
      const rej = (g.derived || []).map(d => { const base = {}; ALLP.forEach(p => { const a = agg(p.key); base[p.key] = a ? a.avg : null; }); const v = d.fn(base); return [lab(d), d.unit || '', '—', '—', '—', v == null || !isFinite(v) ? '—' : num(v, d.dec), '—', '—', '—', '—']; });
      return { pt, title: L('نقطه ', 'Point ') + D(pt) + ' — ' + SP.POINTS[pt][isFa() ? 'fa' : 'en'], rows: rows.concat(rej) };
    });
    const mHead = [L('پارامتر', 'Parameter'), ...QPOINTS.map(pt => L('نقطه ', 'Pt ') + D(pt))];
    const mRows = QBASE.map(([suf, name, u]) => [name + (u ? ` (${u})` : ''), ...QPOINTS.map(pt => { const k = QPRE[pt] + suf; if (!PBY[k]) return '—'; const a = agg(k); return a ? fmtP(PBY[k], a.avg) : '—'; })]);
    const kp = ['prod', 'tkRaw', 'tkProd', 'rec', 'acid', 'smbs', 'cl', 'outage'].map(k => { const p = PBY[k], a = agg(k); return { label: lab(p) + (p.agg === 'sum' ? ' — ' + L('مجموع', 'total') : ' — ' + L('میانگین', 'average')), value: a ? fmtP(p, p.agg === 'sum' ? a.sum : a.avg) : '—', unit: unitOf(p) }; });
    return { recs, pointTables, mHead, mRows, kp, outTotal: Object.keys(PBY).reduce((s2, k) => s2 + (limOf(k).min != null || limOf(k).max != null ? out(k) : 0), 0) };
  }
  const qHead = () => [L('پارامتر', 'Parameter'), L('واحد', 'Unit'), L('حد پایین', 'Min limit'), L('حد بالا', 'Max limit'), L('آخرین', 'Last'), L('میانگین', 'Average'), L('کمینه', 'Min'), L('بیشینه', 'Max'), L('تعداد ثبت', 'Records'), L('خارج از حد', 'Out of limit')];
  function vQReport(c) {
    setTitle(L('گزارش جامع ۶ نقطه نمونه‌برداری', 'Six-point full report'), L('همه پارامترهای ۶ مرحله در یک گزارش برای بایگانی و ارائه', 'All parameters of the six points in one report for archive & presentation'));
    const q = UI.qr = UI.qr || { mode: 'month', jy: curJY(), jm: isoToJ(todayISO()).month, jd: isoToJ(todayISO()).day };
    const rg = qRange(), d = qData(rg), cy = curJY();
    const sel = (id, opts, v) => `<select id="${id}">${opts.map(o => `<option value="${o[0]}" ${String(o[0]) === String(v) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    c.innerHTML = `<div class="toolbar">
        ${sel('qMode', [['day', L('روزانه', 'Daily')], ['month', L('ماهانه', 'Monthly')], ['year', L('سالانه', 'Yearly')]], q.mode)}
        ${sel('qY', Array.from({ length: 8 }, (_, i) => [cy - 6 + i, D(cy - 6 + i)]), q.jy)}
        ${q.mode !== 'year' ? sel('qM', Array.from({ length: 12 }, (_, i) => [i + 1, mName(i + 1)]), q.jm) : ''}
        ${q.mode === 'day' ? sel('qD', Array.from({ length: daysInJ(q.jy, q.jm) }, (_, i) => [i + 1, D(i + 1)]), q.jd) : ''}
        <div style="flex:1"></div><div id="qExp">${RK.exportBarHTML()}</div></div>
      <div class="notice" style="margin-top:0">ℹ️ <div>${L('بازه گزارش: ', 'Report period: ')}<b>${esc(rg.label)}</b> — ${L('روزهای دارای ثبت: ', 'days with data: ')}<b>${D(d.recs.length)}</b>${d.outTotal ? ` — <b style="color:var(--red)">${L('موارد خارج از حد: ', 'out-of-limit values: ')}${D(d.outTotal)}</b>` : ''}. ${L('فایل شامل نقشه PFD، جدول هر ۶ نقطه، جدول مقایسه‌ای نقاط و خلاصه تولید و مواد شیمیایی است.', 'The file contains the PFD, a table per point, a point-by-point comparison and production / chemicals summary.')}</div></div>
      <div class="card"><div class="panel-title"><h3>${L('مقایسه میانگین پارامترها در ۶ نقطه', 'Average of each parameter across the six points')}</h3></div><div class="table-wrap"><table><thead><tr>${d.mHead.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${d.mRows.map(r => `<tr>${r.map((x, i) => `<td class="${i ? 'cell-mono' : 'cell-strong'}">${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>
      ${d.pointTables.map(t => `<div class="card"><div class="panel-title"><h3>${esc(t.title)}</h3></div><div class="table-wrap"><table><thead><tr>${qHead().map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map((x, i) => `<td class="${i ? 'cell-mono' : 'cell-strong'}">${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`).join('')}`;
    const rr = () => vQReport(c);
    c.querySelector('#qMode').onchange = (e) => { q.mode = e.target.value; rr(); };
    c.querySelector('#qY').onchange = (e) => { q.jy = +e.target.value; rr(); };
    const m = c.querySelector('#qM'); if (m) m.onchange = (e) => { q.jm = +e.target.value; rr(); };
    const dd = c.querySelector('#qD'); if (dd) dd.onchange = (e) => { q.jd = +e.target.value; rr(); };
    RK.bindExport(document.getElementById('qExp'), async () => {
      const rg2 = qRange(), dd2 = qData(rg2); let img = null;
      try { const v = {}; ['tkRaw', 'tkProd', 'rec'].forEach(k => { const l = latestOf(k); if (l) v[k] = l.v; }); img = await SP.snapshot(isFa(), v); } catch (e) { console.warn('pfd snapshot', e); }
      const secs = [];
      if (img) secs.push({ title: L('نقشه فرآیندی (PFD) و نقاط نمونه‌برداری ◆۱ تا ◆۶', 'Process flow diagram and sampling points 1–6'), chart: img });
      secs.push({ title: L('محل نقاط نمونه‌برداری', 'Sampling point locations'), table: { head: [L('نقطه', 'Point'), L('محل', 'Location')], rows: QPOINTS.map(pt => [D(pt), SP.POINTS[pt][isFa() ? 'fa' : 'en']]) } });
      secs.push({ title: L('خلاصه تولید، تراز مخازن و مصرف مواد شیمیایی', 'Production, tank levels & chemicals summary'), kpis: dd2.kp });
      secs.push({ title: L('مقایسه میانگین پارامترها در ۶ نقطه', 'Average of each parameter across the six points'), table: { head: dd2.mHead, rows: dd2.mRows } });
      dd2.pointTables.forEach(t => secs.push({ title: t.title, table: { head: qHead(), rows: t.rows } }));
      return { title: lab(spec.title) + ' — ' + L('گزارش جامع ۶ نقطه نمونه‌برداری', 'six-point full report'), subtitle: rg2.label,
        meta: [[L('بازه گزارش', 'Period'), rg2.label], [L('روزهای دارای ثبت', 'Days with data'), D(dd2.recs.length)], [L('مقادیر خارج از حد', 'Out-of-limit values'), D(dd2.outTotal)]], sections: secs };
    }, () => spec.id + '-six-point-' + qRange().from, toast);
  }

  /* =====================================================================
     DAILY ENTRY
     ===================================================================== */
  function vEntry(c) {
    setTitle(L('ثبت و ویرایش اطلاعات روزانه', 'Daily data entry'), L('یک رکورد برای هر روز؛ ثبت مجدد همان تاریخ، رکورد را ویرایش می‌کند', 'One record per day; saving the same date again updates that record'));
    const gsel = UI.filters.entryGroup || spec.groups[0].id;
    const g = spec.groups.find(x => x.id === gsel) || spec.groups[0];
    const rows = [...S.daily].sort((a, b) => (b.date || b.id).localeCompare(a.date || a.id));
    c.innerHTML = `
      <div class="toolbar"><button class="btn btn-primary" id="addDay">＋ ${L('ثبت اطلاعات روز', 'Enter day data')}</button>
        <div class="seg" id="entG">${spec.groups.map(x => `<button class="btn btn-sm ${x.id === g.id ? 'btn-primary' : 'btn-ghost'}" data-g="${x.id}">${esc(lab(x))}</button>`).join('')}</div>
        <div style="flex:1"></div><div id="entExp">${RK.exportBarHTML()}</div></div>
      <div class="card" style="padding:0;"><div class="table-wrap" style="max-height:62vh;overflow:auto;border:none;"><table>
        <thead><tr><th>${L('تاریخ', 'Date')}</th>${g.params.map(p => `<th>${esc(lab(p))} ${p.unit ? `<span style="font-weight:400">(${esc(p.unit)})</span>` : ''}</th>`).join('')}<th></th></tr></thead>
        <tbody>${rows.length ? rows.map(r => `<tr><td class="cell-strong cell-mono">${jStr(r.date || r.id)}</td>${g.params.map(p => { const v = (r.values || {})[p.key]; return `<td class="cell-mono">${v === null || v === undefined || v === '' ? '—' : fmtP(p, Number(v))}</td>`; }).join('')}
          <td><div class="row-actions"><span class="icon-sm" data-e="${r.id}" title="${L('ویرایش', 'Edit')}">✎</span><span class="icon-sm" data-d="${r.id}" title="${L('حذف', 'Delete')}">🗑</span></div></td></tr>`).join('') : `<tr><td colspan="${g.params.length + 2}"><div class="empty"><h4>${L('رکوردی ثبت نشده است', 'No records yet')}</h4></div></td></tr>`}</tbody></table></div></div>`;
    document.getElementById('addDay').onclick = () => dayForm(null);
    c.querySelectorAll('#entG [data-g]').forEach(b => b.onclick = () => { UI.filters.entryGroup = b.dataset.g; vEntry(c); });
    c.querySelectorAll('[data-e]').forEach(b => b.onclick = () => dayForm(S.daily.find(r => r.id === b.dataset.e)));
    c.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const r = S.daily.find(x => x.id === b.dataset.d); confirmDel(L('رکورد روز ', 'Delete record of ') + jStr(r.date || r.id) + L(' حذف شود؟', '?'), async () => { await fbDel('daily', r.id); logAct(L('حذف اطلاعات روزانه', 'Deleted daily data'), jStr(r.date || r.id)); toast(L('حذف شد', 'Deleted')); }); });
    RK.bindExport(document.getElementById('entExp'), async () => ({ title: lab(spec.title) + ' — ' + L('اطلاعات روزانه', 'Daily data'), subtitle: lab(g), meta: [[L('تعداد رکورد', 'Records'), D(rows.length)]],
      sections: [{ title: lab(g), table: { head: [L('تاریخ', 'Date'), ...g.params.map(p => lab(p) + (p.unit ? ` (${p.unit})` : ''))], rows: rows.map(r => [jStr(r.date || r.id), ...g.params.map(p => { const v = (r.values || {})[p.key]; return v === null || v === undefined || v === '' ? '—' : fmtP(p, Number(v)); })]) } }] }),
      () => spec.id + '-daily-' + g.id, toast);
  }
  function dayForm(existing) {
    const iso = existing ? (existing.date || existing.id) : todayISO();
    const html = dateField('f_date', L('تاریخ (شمسی)', 'Date (Jalali)'), iso) +
      `<div id="dayHint" class="notice" style="display:none;margin:0;">ℹ️ ${L('برای این تاریخ قبلاً اطلاعات ثبت شده؛ ذخیره، آن را ویرایش می‌کند.', 'A record already exists for this date; saving will update it.')}</div>` +
      spec.groups.map(g => `<div class="fgroup"><div class="fg-title">${esc(lab(g))}</div><div class="field-row">${g.params.map(p => {
        const v = existing && existing.values ? existing.values[p.key] : '';
        return fNum('f_' + p.key, `${esc(lab(p))}${p.unit ? `<span class="u">(${esc(p.unit)})</span>` : ''}`, v === undefined || v === null ? '' : v, `${p.min !== undefined ? `min="${p.min}"` : ''} ${p.max !== undefined ? `max="${p.max}"` : ''}`);
      }).join('')}</div></div>`).join('');
    modal(existing ? L('ویرایش اطلاعات روز', 'Edit day data') : L('ثبت اطلاعات روز', 'Enter day data'), html, async (m) => {
      const date = dateVal(m, 'f_date'); const values = {}; let bad = null;
      ALLP.forEach(p => {
        const raw = toEn(gv(m, 'f_' + p.key)).trim();
        if (raw === '') { values[p.key] = null; return; }
        const n = Number(raw); if (isNaN(n)) { bad = lab(p); return; }
        if ((p.min !== undefined && n < p.min) || (p.max !== undefined && n > p.max)) { bad = lab(p) + ` (${p.min !== undefined ? p.min : ''}–${p.max !== undefined ? p.max : ''})`; return; }
        values[p.key] = n;
      });
      if (bad) { toast(L('مقدار نامعتبر: ', 'Invalid value: ') + bad); return false; }
      if (Object.values(values).every(v => v === null)) { toast(L('حداقل یک مقدار وارد کنید', 'Enter at least one value')); return false; }
      const old = S.daily.find(r => (r.date || r.id) === date);
      const merged = Object.assign({}, old && old.values ? old.values : {}, existing || !old ? values : values);
      await fbSet('daily', date, { date, values: merged, updatedAt: new Date().toISOString() });
      logAct(old ? L('ویرایش اطلاعات روزانه', 'Updated daily data') : L('ثبت اطلاعات روزانه', 'Entered daily data'), jStr(date));
      const lim = ((S.alerts && S.alerts.limits) || {})[spec.prefix.replace('_', '')] || {};
      const out = ALLP.filter(p => { const l = lim[p.key], v = merged[p.key]; return l && v != null && ((l.max != null && v > l.max) || (l.min != null && v < l.min)); }).map(p => lab(p));
      toast(out.length ? L('ذخیره شد — ⚠ خارج از حد مجاز: ', 'Saved — ⚠ outside limit: ') + out.join('، ') : L('ذخیره شد', 'Saved'));
    });
    const chk = () => { const m = document.querySelector('.modal'); if (!m || !m.querySelector('#f_date')) return; const d = dateVal(m, 'f_date'); const ex = S.daily.find(r => (r.date || r.id) === d); m.querySelector('#dayHint').style.display = (ex && !existing) ? '' : 'none'; if (ex && !existing) { ALLP.forEach(p => { const el = m.querySelector('#f_' + p.key); if (el && el.value === '' && ex.values && ex.values[p.key] != null) el.value = ex.values[p.key]; }); } };
    document.querySelectorAll('#f_date select').forEach(s => s.addEventListener('change', chk)); chk();
  }

  /* =====================================================================
     REPORTS / ANALYTICS
     ===================================================================== */
  function groupStats(g) {
    const A = UI.an, bk = buckets(A.mode, A.jy, A.jm);
    const gp = g.derived ? ALLP : g.params;
    const per = bk.map(b => { const rs = recsIn(b); const o = {}; gp.forEach(p => o[p.key] = aggregate(p, rs)); o._days = rs.length; return o; });
    const allRecs = S.daily.filter(r => { const d = r.date || r.id; return d >= bk[0].from && d <= bk[bk.length - 1].to; }).sort((a, b) => (a.date || a.id).localeCompare(b.date || b.id));
    const tot = {}; gp.forEach(p => tot[p.key] = aggregate(p, allRecs));
    const derivedVals = per.map(o => { const dv = {}; (g.derived || []).forEach(d => { const base = {}; g.params.forEach(p => base[p.key] = o[p.key] ? o[p.key].v : null); ALLP.forEach(p => { if (!(p.key in base)) { base[p.key] = null; } }); const val = d.fn(base); dv[d.key] = (val === null || val === undefined || !isFinite(val)) ? null : val; }); return dv; });
    const derivedTot = {}; (g.derived || []).forEach(d => { const base = {}; ALLP.forEach(p => base[p.key] = tot[p.key] ? tot[p.key].v : null); const val = d.fn(base); derivedTot[d.key] = (val === null || val === undefined || !isFinite(val)) ? null : val; });
    return { bk, per, tot, derivedVals, derivedTot, allRecs };
  }
  function buildGroup(g) {
    const st = groupStats(g), labels = st.bk.map(b => b.label);
    const kpis = [];
    g.params.forEach(p => {
      const t = st.tot[p.key]; if (!t) { kpis.push({ label: lab(p), value: '—', unit: unitOf(p) }); return; }
      if (p.agg === 'sum') kpis.push({ label: lab(p) + ' — ' + L('مجموع', 'Total'), value: fmtP(p, t.sum), unit: unitOf(p) }, { label: lab(p) + ' — ' + L('میانگین روزانه', 'Daily avg'), value: fmtP(p, t.avg), unit: unitOf(p) });
      else kpis.push({ label: lab(p) + ' — ' + L('میانگین', 'Average'), value: fmtP(p, t.avg), unit: unitOf(p) }, { label: lab(p) + ' — ' + L('کمینه / بیشینه', 'Min / Max'), value: fmtP(p, t.min) + ' / ' + fmtP(p, t.max), unit: unitOf(p) });
    });
    (g.derived || []).forEach(d => kpis.push({ label: lab(d), value: st.derivedTot[d.key] == null ? '—' : num(st.derivedTot[d.key], d.dec !== undefined ? d.dec : 1), unit: d.unit || '' }));
    const head = [L('بازه', 'Period'), ...g.params.map(p => lab(p) + (p.unit ? ` (${p.unit})` : '') + (p.agg === 'sum' ? ' Σ' : p.agg === 'last' ? ' ⟲' : ' ⌀')), ...(g.derived || []).map(d => lab(d) + (d.unit ? ` (${d.unit})` : '')), L('روزهای ثبت‌شده', 'Days')];
    const rows = st.bk.map((b, i) => [b.full, ...g.params.map(p => st.per[i][p.key] ? fmtP(p, st.per[i][p.key].v) : '—'), ...(g.derived || []).map(d => st.derivedVals[i][d.key] == null ? '—' : num(st.derivedVals[i][d.key], d.dec !== undefined ? d.dec : 1)), D(st.per[i]._days)]);
    const charts = (g.charts || []).map(cd => ({ title: lab(cd.title), type: cd.type || 'line', cfg: () => {
      const sets = cd.series.map((k, j) => {
        const isDer = (g.derived || []).some(d => d.key === k);
        const p = isDer ? g.derived.find(d => d.key === k) : PBY[k];
        const data = st.per.map((o, i) => isDer ? st.derivedVals[i][k] : (o[k] ? Number(o[k].v.toFixed(3)) : null));
        const color = (cd.colors && cd.colors[j]) || PAL[j % PAL.length];
        return cd.type === 'bar' ? bar(lab(p) + (p.unit ? ` (${p.unit})` : ''), data, color) : line(lab(p) + (p.unit ? ` (${p.unit})` : ''), data, color);
      });
      return chartCfg(cd.type || 'line', labels, sets, { stacked: cd.stacked, zero: cd.zero });
    } }));
    return { title: lab(g), kpis, head, rows, charts };
  }
  /* --- maintenance statistics --- */
  const catLab = (k) => { const c = spec.categories.find(x => x.key === k); return c ? lab(c) : (k || '—'); };
  function buildMaint() {
    const A = UI.an, bk = buckets(A.mode, A.jy, A.jm), rg = { from: bk[0].from, to: bk[bk.length - 1].to };
    const eqBy = {}; S.equipment.forEach(e => eqBy[e.id] = e);
    const cms = S.cm.filter(c => c.date >= rg.from && c.date <= rg.to);
    const open = cms.filter(c => c.status === 'open').length;
    const durs = cms.filter(c => c.status === 'closed' && c.closedAt).map(c => Math.max(0, diffDays(c.closedAt, c.date)));
    const ds = RK.stats(durs);
    const pmS = { overdue: 0, soon: 0, ok: 0 }; S.pm.forEach(p => pmS[pmStat(p).k]++);
    const compl = S.pm.length ? Math.round((pmS.ok + pmS.soon) / S.pm.length * 100) : 0;
    const pmDone = []; S.pm.forEach(p => { const h = new Set(Array.isArray(p.history) ? p.history : []); if (p.lastDone) h.add(p.lastDone); h.forEach(d => { if (d >= rg.from && d <= rg.to) pmDone.push(d); }); });
    const woIn = S.wo.filter(w => w.date >= rg.from && w.date <= rg.to);
    const kpis = [
      { label: L('تعداد تجهیزات', 'Equipment'), value: D(S.equipment.length), unit: '' },
      { label: L('تعمیرات ثبت‌شده', 'Repairs logged'), value: D(cms.length), unit: '' },
      { label: L('تعمیرات باز', 'Open repairs'), value: D(open), unit: '' },
      { label: L('میانگین زمان رفع خرابی', 'Avg time to repair'), value: ds.n ? num(ds.avg, 1) : '—', unit: L('روز', 'days') },
      { label: L('بازدیدهای انجام‌شده', 'Inspections done'), value: D(pmDone.length), unit: '' },
      { label: L('بازدید معوق', 'Overdue inspections'), value: D(pmS.overdue), unit: '' },
      { label: L('نرخ انطباق بازدید', 'Inspection compliance'), value: D(compl) + '٪', unit: '' }
    ];
    if (spec.workOrders) kpis.push({ label: L('دستورکارها', 'Work orders'), value: D(woIn.length), unit: '' }, { label: L('دستورکار تکمیل‌شده', 'Completed work orders'), value: D(woIn.filter(w => w.status === 'done').length), unit: '' });
    const labels = bk.map(b => b.label);
    const cmN = bk.map(b => S.cm.filter(c => c.date >= b.from && c.date <= b.to).length);
    const pmN = bk.map(b => { let n = 0; S.pm.forEach(p => { const h = new Set(Array.isArray(p.history) ? p.history : []); if (p.lastDone) h.add(p.lastDone); h.forEach(d => { if (d >= b.from && d <= b.to) n++; }); }); return n; });
    const woN = bk.map(b => S.wo.filter(w => w.date >= b.from && w.date <= b.to).length);
    const byEq = {}; cms.forEach(c => { const n = (eqBy[c.equipmentId] || {}).name || '—'; byEq[n] = (byEq[n] || 0) + 1; });
    const stL = (s) => s === 'open' ? L('باز', 'Open') : L('بسته‌شده', 'Closed');
    const tables = [
      { title: L('ریز تعمیرات و خرابی‌ها', 'Repairs & failures log'), head: [L('تاریخ', 'Date'), L('تجهیز', 'Equipment'), L('شرح', 'Issue'), L('اقدام', 'Action'), L('تکنسین', 'Technician'), L('وضعیت', 'Status'), L('روز تا رفع', 'Days to fix')], rows: [...cms].sort((a, b) => a.date.localeCompare(b.date)).map(c => [jStr(c.date), (eqBy[c.equipmentId] || {}).name || '—', c.issue || '', c.action || '', c.technician || '—', stL(c.status), c.closedAt ? D(Math.max(0, diffDays(c.closedAt, c.date))) : '—']) },
      { title: L('وضعیت بازدیدهای دوره‌ای', 'Periodic inspection status'), head: [L('وضعیت', 'Status'), L('تجهیز', 'Equipment'), L('بازدید', 'Inspection'), L('تناوب (روز)', 'Interval'), L('آخرین انجام', 'Last done'), L('موعد بعدی', 'Next due')], rows: S.pm.map(p => { const s = pmStat(p); return [s.k === 'overdue' ? L('معوق', 'Overdue') : s.k === 'soon' ? L('نزدیک موعد', 'Due soon') : L('به‌روز', 'On time'), eqName(p.equipmentId), p.title, D(p.freqDays), p.lastDone ? jStr(p.lastDone) : '—', jStr(s.due)]; }) },
      { title: L('تجهیزات پرخرابی', 'Most failure-prone equipment'), head: [L('تجهیز', 'Equipment'), L('تعداد خرابی', 'Failures')], rows: Object.entries(byEq).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k, D(v)]) },
      { title: L('فهرست تجهیزات', 'Equipment register'), head: [L('نام', 'Name'), L('دسته', 'Category'), L('سریال / پلاک', 'Serial'), L('محل نصب', 'Location'), L('تاریخ نصب', 'Install date')], rows: S.equipment.map(e => [e.name, catLab(e.category), e.serial || '—', e.location || '—', e.installDate ? jStr(e.installDate) : '—']) }
    ];
    if (spec.workOrders) tables.splice(2, 0, { title: L('فهرست دستورکارها', 'Work orders'), head: [L('شماره', 'No.'), L('تاریخ', 'Date'), L('تجهیز', 'Equipment'), L('نوع', 'Type'), L('اولویت', 'Priority'), L('شرح', 'Description'), L('مسئول', 'Assignee'), L('وضعیت', 'Status')], rows: [...woIn].sort((a, b) => a.date.localeCompare(b.date)).map(w => [w.no || '—', jStr(w.date), eqName(w.equipmentId), woTypeL(w.type), woPrioL(w.priority), w.description || '', w.assignee || '—', woStatL(w.status)]) });
    const sets = [{ label: L('تعمیرات', 'Repairs'), data: cmN, backgroundColor: '#ff7a59', borderRadius: 3 }, { label: L('بازدیدها', 'Inspections'), data: pmN, backgroundColor: '#00a896', borderRadius: 3 }];
    if (spec.workOrders) sets.push({ label: L('دستورکارها', 'Work orders'), data: woN, backgroundColor: '#1565c0', borderRadius: 3 });
    return { title: L('آمار تعمیرات، بازدید و دستورکار', 'Maintenance, inspections & work orders'), kpis, head: null, rows: null, extraTables: tables,
      charts: [{ title: L('تعمیرات / بازدیدها در هر بازه', 'Repairs / inspections per period'), type: 'bar', cfg: () => chartCfg('bar', labels, sets) },
        { title: L('وضعیت بازدیدها', 'Inspection status'), type: 'doughnut', cfg: () => ({ type: 'doughnut', data: { labels: [L('به‌روز', 'On time'), L('نزدیک موعد', 'Due soon'), L('معوق', 'Overdue')], datasets: [{ data: [pmS.ok, pmS.soon, pmS.overdue], backgroundColor: ['#1f9d76', '#f5a524', '#d43439'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: axisC() } } } } }) }] };
  }

  /* =====================================================================
     COMPREHENSIVE DAILY / MONTHLY REPORT (every recorded input & output)
     ===================================================================== */
  async function buildFull(r) {
    const days = r.days, rng = { from: r.from, to: r.to };
    const inR = (d) => RK.J.inRange(d, rng);
    const recs = S.daily.filter(x => inR(x.date || x.id)).sort((a, b) => (a.date || a.id).localeCompare(b.date || b.id));
    const byDate = {}; recs.forEach(x => { byDate[x.date || x.id] = x; });
    const sections = [];
    const missing = days.filter(d => !byDate[d] && d <= todayISO());
    sections.push({ title: L('خلاصه', 'Summary'), kpis: [
      { label: L('روزهای ثبت‌شده', 'Days recorded'), value: D(recs.length), unit: L('از ', 'of ') + D(days.length) },
      { label: L('روزهای بدون ثبت', 'Days without data'), value: D(missing.length), unit: '' },
      { label: L('تعمیرات ثبت‌شده', 'Repairs logged'), value: D(S.cm.filter(c => inR(c.date)).length), unit: '' },
      { label: L('تعمیرات باز', 'Open repairs'), value: D(S.cm.filter(c => c.status === 'open').length), unit: '' }],
      note: missing.length && r.kind === 'monthly' ? L('روزهای بدون ثبت: ', 'Days without data: ') + missing.map(d => isoToJ(d).day).map(D).join('، ') : '' });
    spec.groups.forEach(g => {
      const params = g.params, der = g.derived || [];
      const cols = params.map(p => ({ k: p.key, head: lab(p) + (p.unit ? ` (${p.unit})` : ''), p })).concat(der.map(d => ({ k: d.key, head: lab(d) + (d.unit ? ` (${d.unit})` : ''), d })));
      const CH = 6;
      for (let i = 0; i < cols.length; i += CH) {
        const part = cols.slice(i, i + CH);
        const rows = recs.map(x => [jStr(x.date || x.id), ...part.map(c => {
          if (c.p) { const v = (x.values || {})[c.k]; return v === null || v === undefined || v === '' ? '—' : fmtP(c.p, Number(v)); }
          const base = {}; ALLP.forEach(p => { const v = (x.values || {})[p.key]; base[p.key] = v === null || v === undefined || v === '' ? null : Number(v); });
          let v = null; try { v = c.d.fn(base); } catch (e) { } return v == null || !isFinite(v) ? '—' : num(v, c.d.dec !== undefined ? c.d.dec : 1);
        })]);
        if (r.kind === 'monthly' && recs.length > 1) {
          rows.push([L('مجموع / میانگین', 'Total / Avg'), ...part.map(c => {
            if (!c.p) return '';
            const vs = recs.map(x => (x.values || {})[c.k]).filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))).map(Number);
            if (!vs.length) return '—';
            const sum = vs.reduce((a, b) => a + b, 0); return c.p.agg === 'sum' ? 'Σ ' + fmtP(c.p, sum) : '⌀ ' + fmtP(c.p, sum / vs.length);
          })]);
        }
        sections.push({ title: lab(g) + (cols.length > CH ? ` (${D(Math.floor(i / CH) + 1)}/${D(Math.ceil(cols.length / CH))})` : ''), table: { head: [L('تاریخ', 'Date'), ...part.map(c => c.head)], rows } });
      }
    });
    // maintenance events in the period
    const cms = S.cm.filter(c => inR(c.date)).sort((a, b) => a.date.localeCompare(b.date));
    sections.push({ title: L('تعمیرات و خرابی‌های ثبت‌شده', 'Repairs & failures logged'), table: { head: [L('تاریخ', 'Date'), L('تجهیز', 'Equipment'), L('شرح', 'Issue'), L('اقدام', 'Action'), L('تکنسین', 'Technician'), L('وضعیت', 'Status')], rows: cms.map(c => [jStr(c.date), eqName(c.equipmentId), c.issue || '', c.action || '', c.technician || '', c.status === 'open' ? L('باز', 'Open') : L('بسته‌شده', 'Closed')]) } });
    const pmRows = []; S.pm.forEach(p => { const h = new Set(Array.isArray(p.history) ? p.history : []); if (p.lastDone) h.add(p.lastDone); [...h].filter(inR).sort().forEach(d => pmRows.push([jStr(d), eqName(p.equipmentId), p.title || '', freqL(p.freqDays)])); });
    sections.push({ title: L('بازدیدهای دوره‌ای انجام‌شده', 'Inspections performed'), table: { head: [L('تاریخ', 'Date'), L('تجهیز', 'Equipment'), L('بازدید', 'Inspection'), L('تناوب', 'Interval')], rows: pmRows } });
    if (spec.workOrders) {
      const wos = S.wo.filter(w => inR(w.date)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      sections.push({ title: L('دستورکارها', 'Work orders'), table: { head: [L('شماره', 'No.'), L('تاریخ', 'Date'), L('تجهیز', 'Equipment'), L('نوع', 'Type'), L('اولویت', 'Priority'), L('شرح', 'Description'), L('مسئول', 'Assignee'), L('وضعیت', 'Status')], rows: wos.map(w => [w.no || '', jStr(w.date), w.equipmentId ? eqName(w.equipmentId) : '—', woTypeL(w.type), woPrioL(w.priority), w.description || '', w.assignee || '', woStatL(w.status)]) } });
    }
    if (isAdminR()) {
      const lg = S.log.filter(l => inR((l.at || '').slice(0, 10))).sort((a, b) => (a.at || '').localeCompare(b.at || ''));
      sections.push({ title: L('لاگ فعالیت کاربران', 'User activity log'), table: { head: [L('تاریخ و ساعت', 'Date & time'), L('عملیات', 'Action'), L('جزئیات', 'Details')], rows: lg.map(l => [jStr((l.at || '').slice(0, 10)) + ' ' + D((l.at || '').slice(11, 16)), l.action || '', l.detail || '']) } });
    }
    return { title: lab(spec.title) + ' — ' + (r.kind === 'daily' ? L('گزارش جامع روزانه', 'Comprehensive daily report') : L('گزارش جامع ماهانه', 'Comprehensive monthly report')), subtitle: r.label, meta: [[L('بخش', 'Section'), lab(spec.title)], [L('بازه', 'Period'), jStr(r.from) + (r.from !== r.to ? ' — ' + jStr(r.to) : '')]], sections };
  }
  const scopes = () => spec.groups.map(g => [g.id, lab(g)]).concat([['maint', L('تعمیرات و بازدید', 'Maintenance')], ['all', L('گزارش جامع (همه)', 'Full report (all)')]]);
  const build = (id) => id === 'maint' ? buildMaint() : buildGroup(spec.groups.find(g => g.id === id));
  const scopeIds = () => UI.an.scope === 'all' ? spec.groups.map(g => g.id).concat(['maint']) : [UI.an.scope];
  const periodTitle = () => { const A = UI.an; return A.mode === 'daily' ? L('روزانه', 'Daily') + ' — ' + mName(A.jm) + ' ' + D(A.jy) : A.mode === 'monthly' ? L('ماهانه', 'Monthly') + ' — ' + D(A.jy) : L('سالانه', 'Yearly'); };

  function vReports(c) {
    const A = UI.an; if (!A.scope) A.scope = spec.groups[0].id;
    setTitle(L('گزارش‌ها و آمار', 'Reports & statistics'), L('آمار روزانه، ماهانه و سالانه با نمودار و خروجی PDF / Word / Excel', 'Daily, monthly & yearly statistics with charts and PDF / Word / Excel export'));
    const ys = new Set([curJY()]); S.daily.forEach(r => ys.add(isoToJ(r.date || r.id).year)); S.cm.forEach(r => r.date && ys.add(isoToJ(r.date).year));
    c.innerHTML = `<div id="fullHost"></div><div class="card"><div class="seg" id="anSc" style="margin-bottom:12px;">${scopes().map(([k, l]) => `<button class="btn btn-sm ${A.scope === k ? 'btn-primary' : 'btn-ghost'}" data-s="${k}">${esc(l)}</button>`).join('')}</div>
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div class="seg" id="anMo">${[['daily', L('روزانه', 'Daily')], ['monthly', L('ماهانه', 'Monthly')], ['yearly', L('سالانه', 'Yearly')]].map(([k, l]) => `<button class="btn btn-sm ${A.mode === k ? 'btn-primary' : 'btn-ghost'}" data-m="${k}">${l}</button>`).join('')}</div>
        <div class="field" style="min-width:100px;${A.mode === 'yearly' ? 'display:none' : ''}"><label>${L('سال', 'Year')}</label><select id="anY">${[...ys].sort((a, b) => b - a).map(y => `<option value="${y}" ${y === A.jy ? 'selected' : ''}>${D(y)}</option>`).join('')}</select></div>
        <div class="field" style="min-width:120px;${A.mode === 'daily' ? '' : 'display:none'}"><label>${L('ماه', 'Month')}</label><select id="anM">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === A.jm ? 'selected' : ''}>${mName(i + 1)}</option>`).join('')}</select></div>
        <div style="flex:1"></div><div id="anExp">${RK.exportBarHTML()}</div></div></div><div id="anBody"></div>`;
    RK.fullBar(document.getElementById('fullHost'), buildFull, () => spec.id + '-full', toast);
    c.querySelectorAll('#anSc [data-s]').forEach(b => b.onclick = () => { A.scope = b.dataset.s; vReports(c); });
    c.querySelectorAll('#anMo [data-m]').forEach(b => b.onclick = () => { A.mode = b.dataset.m; vReports(c); });
    document.getElementById('anY').onchange = (e) => { A.jy = +e.target.value; renderAnBody(); };
    document.getElementById('anM').onchange = (e) => { A.jm = +e.target.value; renderAnBody(); };
    RK.bindExport(document.getElementById('anExp'), getReport, () => spec.id + '-' + A.scope + '-' + A.mode + '-' + (A.mode === 'yearly' ? 'all' : A.jy), toast);
    renderAnBody();
  }
  async function renderAnBody() {
    destroyCharts(); await ensureChart();
    const body = document.getElementById('anBody'); if (!body) return;
    const built = scopeIds().map(id => ({ id, d: build(id) }));
    body.innerHTML = built.map(({ id, d }) => `<div class="card"><div class="panel-title"><div><h3>${esc(d.title)}</h3><div class="sub">${esc(periodTitle())}</div></div></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr));margin-bottom:14px;">${d.kpis.map(k => `<div style="border:1px solid var(--border);border-radius:10px;padding:8px 11px;background:var(--panel-2);"><div style="font-size:10.5px;color:var(--text-muted)">${esc(k.label)}</div><div style="font-family:var(--mono);font-size:15.5px;font-weight:800;color:var(--accent-2)">${esc(k.value)} <small style="font-size:10px;color:var(--text-dim);font-weight:500">${esc(k.unit || '')}</small></div></div>`).join('')}</div>
      <div class="charts-grid">${d.charts.map((ch, i) => `<div class="chart-card"><div class="ct">${esc(ch.title)}</div><div class="chart-box"><canvas id="an_${id}_${i}"></canvas></div></div>`).join('')}</div>
      ${d.rows ? `<div class="table-wrap" style="max-height:440px;overflow:auto;"><table><thead><tr>${d.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${d.rows.map(r => `<tr>${r.map((x, i) => `<td class="${i ? 'cell-mono' : 'cell-strong'}">${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
      ${(d.extraTables || []).map(t => `<div style="margin-top:16px;"><div style="font-weight:800;font-size:13px;margin-bottom:6px;">${esc(t.title)}</div><div class="table-wrap" style="max-height:340px;overflow:auto;"><table><thead><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.length ? t.rows.map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${t.head.length}" style="text-align:center;color:var(--text-dim)">${L('داده‌ای ثبت نشده', 'No data')}</td></tr>`}</tbody></table></div></div>`).join('')}</div>`).join('');
    if (typeof Chart !== 'undefined') built.forEach(({ id, d }) => d.charts.forEach((ch, i) => mkChart(`an_${id}_${i}`, ch.cfg())));
    else body.insertAdjacentHTML('afterbegin', `<div class="notice">⚠️ ${L('نمایش نمودارها نیاز به اتصال اینترنت دارد.', 'Charts need an internet connection.')}</div>`);
  }
  async function getReport() {
    const sections = [];
    for (const id of scopeIds()) {
      const d = build(id);
      for (let i = 0; i < d.charts.length; i++) {
        const ch = d.charts[i]; let img = '';
        try { const cfg = JSON.parse(JSON.stringify(ch.cfg(), (k, v) => (v === '#8db3c2' ? '#52708a' : v === 'rgba(255,255,255,0.07)' ? 'rgba(10,50,65,0.08)' : v))); img = await RK.chartImage(cfg, ch.type === 'doughnut' ? 520 : 900, ch.type === 'doughnut' ? 330 : 350); } catch (e) { }
        sections.push({ title: i === 0 ? d.title + ' — ' + ch.title : ch.title, kpis: i === 0 ? d.kpis : null, chart: img });
      }
      if (!d.charts.length) sections.push({ title: d.title, kpis: d.kpis });
      if (d.rows) sections.push({ title: d.title + ' — ' + L('جدول تفصیلی', 'Detailed table'), table: { head: d.head, rows: d.rows } });
      (d.extraTables || []).forEach(t => sections.push({ title: t.title, table: { head: t.head, rows: t.rows } }));
    }
    return { title: lab(spec.title) + ' — ' + L('گزارش جامع', 'Comprehensive report'), subtitle: periodTitle(), meta: [[L('بخش', 'Section'), lab(spec.title)], [L('بازه', 'Scope'), periodTitle()]], sections };
  }

  /* =====================================================================
     EQUIPMENT
     ===================================================================== */
  const eqName = (id) => (S.equipment.find(e => e.id === id) || {}).name || '—';
  function listExport(containerId, titleFn, headFn, rowsFn, base) {
    RK.bindExport(document.getElementById(containerId), async () => ({ title: lab(spec.title) + ' — ' + titleFn(), subtitle: '', meta: [], sections: [{ title: titleFn(), table: { head: headFn(), rows: rowsFn() } }] }), () => spec.id + '-' + base, toast);
  }
  function vEquip(c) {
    setTitle(L('تجهیزات', 'Equipment'), L('فهرست تجهیزات و ماشین‌آلات', 'Register of equipment and machinery'));
    const q = (UI.search.eq || '').toLowerCase(), cat = UI.filters.eqCat || '';
    const rows = S.equipment.filter(e => (!cat || e.category === cat) && (!q || (e.name + (e.serial || '') + (e.location || '')).toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
    c.innerHTML = `<div class="toolbar"><button class="btn btn-primary" id="add">＋ ${L('افزودن تجهیز', 'Add equipment')}</button>
      <div class="search">🔍<input id="q" placeholder="${L('جستجو...', 'Search...')}" value="${esc(UI.search.eq || '')}"></div>
      <select id="cat"><option value="">${L('همه دسته‌ها', 'All categories')}</option>${spec.categories.map(k => `<option value="${k.key}" ${cat === k.key ? 'selected' : ''}>${esc(lab(k))}</option>`).join('')}</select><div id="exp">${RK.exportBarHTML()}</div></div>
      <div class="card" style="padding:0"><div class="table-wrap" style="border:none"><table><thead><tr><th>${L('دسته', 'Category')}</th><th>${L('نام تجهیز', 'Name')}</th><th>${L('شماره سریال / پلاک', 'Serial / tag')}</th><th>${L('محل نصب', 'Location')}</th><th>${L('تاریخ نصب', 'Install date')}</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(e => `<tr><td><span class="tag tag-blue">${esc(catLab(e.category))}</span></td><td class="cell-strong">${esc(e.name)}</td><td class="cell-mono">${esc(e.serial || '—')}</td><td>${esc(e.location || '—')}</td><td class="cell-mono">${e.installDate ? jStr(e.installDate) : '—'}</td>
        <td><div class="row-actions"><span class="icon-sm" data-e="${e.id}">✎</span><span class="icon-sm" data-d="${e.id}">🗑</span></div></td></tr>`).join('') : `<tr><td colspan="6"><div class="empty"><h4>${L('تجهیزی ثبت نشده است', 'No equipment yet')}</h4><p>${L('با دکمه «افزودن تجهیز» شروع کنید.', 'Start with “Add equipment”.')}</p></div></td></tr>`}</tbody></table></div></div>`;
    document.getElementById('add').onclick = () => equipForm(null);
    document.getElementById('q').oninput = (e) => { UI.search.eq = e.target.value; const p = e.target.selectionStart; vEquip(c); const el = document.getElementById('q'); el.focus(); el.setSelectionRange(p, p); };
    document.getElementById('cat').onchange = (e) => { UI.filters.eqCat = e.target.value; vEquip(c); };
    c.querySelectorAll('[data-e]').forEach(b => b.onclick = () => equipForm(S.equipment.find(e => e.id === b.dataset.e)));
    c.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const e = S.equipment.find(x => x.id === b.dataset.d); confirmDel(L('تجهیز «', 'Delete equipment “') + e.name + L('» حذف شود؟', '”?'), async () => { await fbDel('equipment', e.id); logAct(L('حذف تجهیز', 'Deleted equipment'), e.name); toast(L('حذف شد', 'Deleted')); }); });
    listExport('exp', () => L('فهرست تجهیزات', 'Equipment register'), () => [L('دسته', 'Category'), L('نام', 'Name'), L('سریال / پلاک', 'Serial'), L('محل نصب', 'Location'), L('تاریخ نصب', 'Install date')], () => rows.map(e => [catLab(e.category), e.name, e.serial || '—', e.location || '—', e.installDate ? jStr(e.installDate) : '—']), 'equipment');
  }
  function equipForm(ex, pre) {
    ex = ex || null; const pf = ex || pre || {};
    modal(ex ? L('ویرایش تجهیز', 'Edit equipment') : L('افزودن تجهیز', 'Add equipment'),
      fSel('f_cat', L('دسته تجهیز', 'Category'), spec.categories.map(k => ({ v: k.key, l: lab(k) })), ex && ex.category) + fSel('f_stage', L('مرحله در PFD (اختیاری)', 'PFD stage (optional)'), [{ v: '', l: '—' }].concat(SP.STAGE_ORDER.map(k => ({ v: k, l: isFa() ? SP.STAGES[k].fa : SP.STAGES[k].en }))), pf.stage) + fSel('f_pfdel', L('واحد روی PFD (اختیاری — برای رنگ‌شدن سلامت روی PFD)', 'PFD unit (optional — shows health on the PFD)'), [{ v: '', l: '—' }].concat(SP.ELEMENTS.map(e => ({ v: e.id, l: isFa() ? e.fa : e.en }))), pf.pfdEl) + fText('f_name', L('نام تجهیز', 'Equipment name'), pf.name) + fText('f_serial', L('شماره سریال / پلاک', 'Serial / tag number'), ex && ex.serial) + fText('f_loc', L('محل نصب', 'Install location'), ex && ex.location) + dateField('f_inst', L('تاریخ نصب (شمسی)', 'Install date (Jalali)'), ex && ex.installDate) + fArea('f_notes', L('توضیحات', 'Notes'), ex && ex.notes),
      async (m) => {
        const name = gv(m, 'f_name').trim(); if (!name) { toast(L('نام تجهیز را وارد کنید', 'Enter the equipment name')); return false; }
        const rec = { category: gv(m, 'f_cat'), stage: (SP.elInfo(gv(m, 'f_pfdel')) || { stage: gv(m, 'f_stage') }).stage, pfdEl: gv(m, 'f_pfdel'), name, serial: gv(m, 'f_serial').trim(), location: gv(m, 'f_loc').trim(), installDate: dateVal(m, 'f_inst'), notes: gv(m, 'f_notes').trim() };
        if (ex) await fbUpd('equipment', ex.id, rec); else await fbAdd('equipment', Object.assign({ createdAt: todayISO() }, rec));
        logAct(ex ? L('ویرایش تجهیز', 'Edited equipment') : L('افزودن تجهیز', 'Added equipment'), name); toast(L('ذخیره شد', 'Saved'));
      });
  }

  /* =====================================================================
     PERIODIC INSPECTIONS (PM)
     ===================================================================== */
  const FREQS = [[1, ['روزانه', 'Daily']], [7, ['هفتگی', 'Weekly']], [14, ['دو هفته', 'Bi-weekly']], [30, ['ماهانه', 'Monthly']], [90, ['سه‌ماهه', 'Quarterly']], [180, ['شش‌ماهه', 'Semi-annual']], [365, ['سالانه', 'Annual']]];
  function pmStat(p) { const base = p.lastDone || p.createdAt || todayISO(); const due = addDays(base, Number(p.freqDays) || 30); const d = diffDays(due, todayISO()); return { k: d < 0 ? 'overdue' : d <= 7 ? 'soon' : 'ok', d, due }; }
  function vPm(c) {
    setTitle(L('بازدید دوره‌ای', 'Periodic inspections'), L('برنامه‌ریزی و پایش بازدیدهای پیشگیرانه', 'Planning and monitoring preventive inspections'));
    const f = UI.filters.pm || '';
    const rows = S.pm.map(p => ({ p, s: pmStat(p) })).filter(x => !f || x.s.k === f).sort((a, b) => a.s.d - b.s.d);
    c.innerHTML = `<div class="toolbar"><button class="btn btn-primary" id="add">＋ ${L('تعریف بازدید', 'Define inspection')}</button>
      <select id="st"><option value="">${L('همه وضعیت‌ها', 'All statuses')}</option><option value="overdue" ${f === 'overdue' ? 'selected' : ''}>${L('معوق', 'Overdue')}</option><option value="soon" ${f === 'soon' ? 'selected' : ''}>${L('نزدیک موعد', 'Due soon')}</option><option value="ok" ${f === 'ok' ? 'selected' : ''}>${L('به‌روز', 'On time')}</option></select><div style="flex:1"></div><div id="exp">${RK.exportBarHTML()}</div></div>
      <div class="card" style="padding:0"><div class="table-wrap" style="border:none"><table><thead><tr><th>${L('وضعیت', 'Status')}</th><th>${L('تجهیز', 'Equipment')}</th><th>${L('عنوان بازدید', 'Inspection')}</th><th>${L('تناوب', 'Interval')}</th><th>${L('آخرین انجام', 'Last done')}</th><th>${L('موعد بعدی', 'Next due')}</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(({ p, s }) => `<tr><td><span class="tag ${s.k === 'overdue' ? 'tag-red' : s.k === 'soon' ? 'tag-amber' : 'tag-green'}">${s.k === 'overdue' ? L('معوق', 'Overdue') : s.k === 'soon' ? L('نزدیک موعد', 'Due soon') : L('به‌روز', 'On time')}</span></td><td class="cell-strong">${esc(eqName(p.equipmentId))}</td><td>${esc(p.title)}</td><td>${esc(freqL(p.freqDays))}</td><td class="cell-mono">${p.lastDone ? jStr(p.lastDone) : '—'}</td><td class="cell-mono">${jStr(s.due)}</td>
        <td><div class="row-actions"><button class="btn btn-sm" data-ok="${p.id}">✓ ${L('انجام شد', 'Done')}</button><span class="icon-sm" data-e="${p.id}">✎</span><span class="icon-sm" data-d="${p.id}">🗑</span></div></td></tr>`).join('') : `<tr><td colspan="7"><div class="empty"><h4>${L('بازدیدی تعریف نشده است', 'No inspections defined')}</h4></div></td></tr>`}</tbody></table></div></div>`;
    document.getElementById('add').onclick = () => pmForm(null);
    document.getElementById('st').onchange = (e) => { UI.filters.pm = e.target.value; vPm(c); };
    c.querySelectorAll('[data-e]').forEach(b => b.onclick = () => pmForm(S.pm.find(x => x.id === b.dataset.e)));
    c.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const p = S.pm.find(x => x.id === b.dataset.d); confirmDel(L('این بازدید حذف شود؟', 'Delete this inspection?'), async () => { await fbDel('pm', p.id); logAct(L('حذف بازدید', 'Deleted inspection'), p.title); toast(L('حذف شد', 'Deleted')); }); });
    c.querySelectorAll('[data-ok]').forEach(b => b.onclick = async () => { const p = S.pm.find(x => x.id === b.dataset.ok); const h = Array.isArray(p.history) ? [...p.history] : []; h.push(todayISO()); await fbUpd('pm', p.id, { lastDone: todayISO(), history: h }); logAct(L('ثبت انجام بازدید', 'Inspection done'), p.title); toast(L('بازدید امروز ثبت شد', 'Inspection recorded for today')); });
    listExport('exp', () => L('بازدیدهای دوره‌ای', 'Periodic inspections'), () => [L('وضعیت', 'Status'), L('تجهیز', 'Equipment'), L('بازدید', 'Inspection'), L('تناوب', 'Interval'), L('آخرین انجام', 'Last done'), L('موعد بعدی', 'Next due')], () => rows.map(({ p, s }) => [s.k === 'overdue' ? L('معوق', 'Overdue') : s.k === 'soon' ? L('نزدیک موعد', 'Due soon') : L('به‌روز', 'On time'), eqName(p.equipmentId), p.title, freqL(p.freqDays), p.lastDone ? jStr(p.lastDone) : '—', jStr(s.due)]), 'inspections');
  }
  const freqL = (d) => { const f = FREQS.find(x => x[0] === Number(d)); return f ? L(f[1][0], f[1][1]) : D(d) + ' ' + L('روز', 'days'); };
  function needEq() { if (!S.equipment.length) { toast(L('ابتدا یک تجهیز اضافه کنید', 'Add equipment first')); return true; } return false; }
  const eqOpts = () => S.equipment.map(e => ({ v: e.id, l: e.name }));
  function pmForm(ex) {
    if (needEq()) return;
    modal(ex ? L('ویرایش بازدید', 'Edit inspection') : L('تعریف بازدید دوره‌ای', 'Define periodic inspection'),
      fSel('f_eq', L('تجهیز', 'Equipment'), eqOpts(), ex && ex.equipmentId) + fText('f_title', L('عنوان بازدید', 'Inspection title'), ex && ex.title) + fSel('f_freq', L('دوره تناوب', 'Interval'), FREQS.map(f => ({ v: f[0], l: L(f[1][0], f[1][1]) })), ex ? ex.freqDays : 30) + dateField('f_last', L('آخرین تاریخ انجام (شمسی)', 'Last done (Jalali)'), ex && ex.lastDone) + fArea('f_notes', L('یادداشت', 'Notes'), ex && ex.notes),
      async (m) => {
        const title = gv(m, 'f_title').trim(); if (!title) { toast(L('عنوان بازدید را وارد کنید', 'Enter the inspection title')); return false; }
        const rec = { equipmentId: gv(m, 'f_eq'), title, freqDays: Number(gv(m, 'f_freq')), lastDone: dateVal(m, 'f_last'), notes: gv(m, 'f_notes').trim() };
        if (ex) await fbUpd('pm', ex.id, rec); else await fbAdd('pm', Object.assign({ createdAt: todayISO() }, rec));
        logAct(ex ? L('ویرایش بازدید', 'Edited inspection') : L('تعریف بازدید', 'Defined inspection'), title); toast(L('ذخیره شد', 'Saved'));
      });
  }

  /* =====================================================================
     REPAIRS & FAILURES (CM)
     ===================================================================== */
  function vCm(c) {
    setTitle(L('تعمیرات و خرابی‌ها', 'Repairs & failures'), L('ثبت و پیگیری خرابی‌ها و تعمیرات اصلاحی', 'Log and follow up failures and corrective repairs'));
    const f = UI.filters.cm || '', q = (UI.search.cm || '').toLowerCase();
    const rows = S.cm.filter(x => (!f || x.status === f) && (!q || ((x.issue || '') + (x.technician || '') + eqName(x.equipmentId)).toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date));
    c.innerHTML = `<div class="toolbar"><button class="btn btn-primary" id="add">＋ ${L('ثبت خرابی / تعمیر', 'Log failure / repair')}</button><div class="search">🔍<input id="q" placeholder="${L('جستجو...', 'Search...')}" value="${esc(UI.search.cm || '')}"></div>
      <select id="st"><option value="">${L('همه', 'All')}</option><option value="open" ${f === 'open' ? 'selected' : ''}>${L('باز', 'Open')}</option><option value="closed" ${f === 'closed' ? 'selected' : ''}>${L('بسته‌شده', 'Closed')}</option></select><div id="exp">${RK.exportBarHTML()}</div></div>
      <div class="card" style="padding:0"><div class="table-wrap" style="border:none"><table><thead><tr><th>${L('وضعیت', 'Status')}</th><th>${L('تاریخ', 'Date')}</th><th>${L('تجهیز', 'Equipment')}</th><th>${L('شرح خرابی', 'Issue')}</th><th>${L('اقدام انجام‌شده', 'Action taken')}</th><th>${L('تکنسین', 'Technician')}</th><th>${L('قطعات / متریال', 'Parts / materials')}</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(x => `<tr><td><span class="tag ${x.status === 'open' ? 'tag-amber' : 'tag-green'}">${x.status === 'open' ? L('باز', 'Open') : L('بسته‌شده', 'Closed')}</span></td><td class="cell-mono">${jStr(x.date)}</td><td class="cell-strong">${esc(eqName(x.equipmentId))}</td><td>${esc(x.issue)}</td><td>${esc(x.action || '—')}</td><td>${esc(x.technician || '—')}</td><td>${esc(x.materials || '—')}</td>
        <td><div class="row-actions"><span class="icon-sm" data-e="${x.id}">✎</span><span class="icon-sm" data-d="${x.id}">🗑</span></div></td></tr>`).join('') : `<tr><td colspan="8"><div class="empty"><h4>${L('رکوردی ثبت نشده است', 'No records yet')}</h4></div></td></tr>`}</tbody></table></div></div>`;
    document.getElementById('add').onclick = () => cmForm(null);
    document.getElementById('st').onchange = (e) => { UI.filters.cm = e.target.value; vCm(c); };
    document.getElementById('q').oninput = (e) => { UI.search.cm = e.target.value; const p = e.target.selectionStart; vCm(c); const el = document.getElementById('q'); el.focus(); el.setSelectionRange(p, p); };
    c.querySelectorAll('[data-e]').forEach(b => b.onclick = () => cmForm(S.cm.find(x => x.id === b.dataset.e)));
    c.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const x = S.cm.find(y => y.id === b.dataset.d); confirmDel(L('این رکورد حذف شود؟', 'Delete this record?'), async () => { await fbDel('cm', x.id); logAct(L('حذف تعمیر', 'Deleted repair'), x.issue); toast(L('حذف شد', 'Deleted')); }); });
    listExport('exp', () => L('تعمیرات و خرابی‌ها', 'Repairs & failures'), () => [L('وضعیت', 'Status'), L('تاریخ', 'Date'), L('تجهیز', 'Equipment'), L('شرح', 'Issue'), L('اقدام', 'Action'), L('تکنسین', 'Technician'), L('متریال', 'Materials')], () => rows.map(x => [x.status === 'open' ? L('باز', 'Open') : L('بسته‌شده', 'Closed'), jStr(x.date), eqName(x.equipmentId), x.issue || '', x.action || '', x.technician || '—', x.materials || '—']), 'repairs');
  }
  function cmForm(ex, pre) {
    if (needEq()) return;
    modal(ex ? L('ویرایش رکورد', 'Edit record') : L('ثبت خرابی / تعمیر', 'Log failure / repair'),
      fSel('f_eq', L('تجهیز', 'Equipment'), eqOpts(), (ex || pre || {}).equipmentId) + dateField('f_date', L('تاریخ وقوع (شمسی)', 'Date (Jalali)'), ex && ex.date) + fArea('f_issue', L('شرح خرابی / مشکل', 'Issue description'), (ex || pre || {}).issue) + fArea('f_action', L('اقدام انجام‌شده', 'Action taken'), ex && ex.action) + fText('f_tech', L('نام تکنسین', 'Technician'), ex && ex.technician) + fText('f_mat', L('قطعات / متریال مصرفی', 'Parts / materials used'), ex && ex.materials) + fSel('f_status', L('وضعیت', 'Status'), [{ v: 'open', l: L('باز', 'Open') }, { v: 'closed', l: L('بسته‌شده', 'Closed') }], ex ? ex.status : 'open'),
      async (m) => {
        const issue = gv(m, 'f_issue').trim(); if (!issue) { toast(L('شرح خرابی را وارد کنید', 'Describe the issue')); return false; }
        const status = gv(m, 'f_status');
        const rec = { equipmentId: gv(m, 'f_eq'), date: dateVal(m, 'f_date'), issue, action: gv(m, 'f_action').trim(), technician: gv(m, 'f_tech').trim(), materials: gv(m, 'f_mat').trim(), status, closedAt: status === 'closed' ? ((ex && ex.status === 'closed' && ex.closedAt) || todayISO()) : null };
        if (ex) await fbUpd('cm', ex.id, rec); else await fbAdd('cm', Object.assign({ createdAt: todayISO() }, rec));
        logAct(ex ? L('ویرایش تعمیر', 'Edited repair') : L('ثبت تعمیر', 'Logged repair'), eqName(rec.equipmentId) + ' — ' + issue); toast(L('ذخیره شد', 'Saved'));
      });
  }

  /* =====================================================================
     WORK ORDERS
     ===================================================================== */
  const WO_TYPES = [['preventive', ['پیشگیرانه', 'Preventive']], ['corrective', ['اصلاحی', 'Corrective']], ['inspection', ['بازرسی', 'Inspection']], ['improvement', ['اصلاح و بهبود', 'Improvement']], ['calibration', ['کالیبراسیون', 'Calibration']], ['cleaning', ['شست‌وشو / سرویس', 'Cleaning / service']]];
  const WO_PRIO = [['low', ['کم', 'Low'], 'tag-muted'], ['normal', ['عادی', 'Normal'], 'tag-blue'], ['high', ['بالا', 'High'], 'tag-amber'], ['urgent', ['اضطراری', 'Urgent'], 'tag-red']];
  const WO_STAT = [['new', ['جدید', 'New'], 'tag-blue'], ['progress', ['در حال انجام', 'In progress'], 'tag-amber'], ['done', ['انجام‌شده', 'Done'], 'tag-green'], ['cancelled', ['لغو‌شده', 'Cancelled'], 'tag-muted']];
  const woTypeL = (k) => { const x = WO_TYPES.find(t => t[0] === k); return x ? L(x[1][0], x[1][1]) : (k || '—'); };
  const woPrioL = (k) => { const x = WO_PRIO.find(t => t[0] === k); return x ? L(x[1][0], x[1][1]) : (k || '—'); };
  const woStatL = (k) => { const x = WO_STAT.find(t => t[0] === k); return x ? L(x[1][0], x[1][1]) : (k || '—'); };
  const nextWoNo = () => { const y = isoToJ(todayISO()).year; const n = S.wo.map(w => parseInt(String(w.no || '').split('-').pop(), 10)).filter(x => !isNaN(x)); return `WO-${y}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0')}`; };
  function vWo(c) {
    setTitle(L('دستورکار', 'Work orders'), L('صدور، پیگیری و تکمیل دستورکارهای نگهداری و تعمیرات', 'Issue, track and complete maintenance work orders'));
    const f = UI.filters.wo || '', q = (UI.search.wo || '').toLowerCase();
    const rows = S.wo.filter(w => (!f || w.status === f) && (!q || ((w.description || '') + (w.assignee || '') + (w.no || '') + eqName(w.equipmentId)).toLowerCase().includes(q))).sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.no).localeCompare(String(a.no)));
    const cnt = (k) => S.wo.filter(w => w.status === k).length;
    c.innerHTML = `<div class="grid kpi-row">${WO_STAT.map(([k, l]) => `<div class="card kpi" style="--k:${k === 'done' ? 'var(--green)' : k === 'progress' ? 'var(--amber)' : k === 'new' ? 'var(--accent-2)' : 'var(--text-dim)'};margin:0;"><div class="kpi-label">${L(l[0], l[1])}</div><div class="kpi-value">${D(cnt(k))}</div></div>`).join('')}</div>
      <div class="toolbar"><button class="btn btn-primary" id="add">＋ ${L('صدور دستورکار', 'New work order')}</button><div class="search">🔍<input id="q" placeholder="${L('جستجو...', 'Search...')}" value="${esc(UI.search.wo || '')}"></div>
      <select id="st"><option value="">${L('همه وضعیت‌ها', 'All statuses')}</option>${WO_STAT.map(([k, l]) => `<option value="${k}" ${f === k ? 'selected' : ''}>${L(l[0], l[1])}</option>`).join('')}</select><div id="exp">${RK.exportBarHTML()}</div></div>
      <div class="card" style="padding:0"><div class="table-wrap" style="border:none"><table><thead><tr><th>${L('شماره', 'No.')}</th><th>${L('وضعیت', 'Status')}</th><th>${L('اولویت', 'Priority')}</th><th>${L('تاریخ صدور', 'Issued')}</th><th>${L('تجهیز', 'Equipment')}</th><th>${L('نوع', 'Type')}</th><th>${L('شرح کار', 'Description')}</th><th>${L('مسئول انجام', 'Assignee')}</th><th>${L('مهلت', 'Due')}</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(w => { const st = WO_STAT.find(x => x[0] === w.status) || WO_STAT[0], pr = WO_PRIO.find(x => x[0] === w.priority) || WO_PRIO[1]; const late = w.dueDate && w.status !== 'done' && w.status !== 'cancelled' && w.dueDate < todayISO(); return `<tr><td class="cell-strong cell-mono">${esc(w.no || '—')}</td><td><span class="tag ${st[2]}">${L(st[1][0], st[1][1])}</span></td><td><span class="tag ${pr[2]}">${L(pr[1][0], pr[1][1])}</span></td><td class="cell-mono">${jStr(w.date)}</td><td class="cell-strong">${esc(eqName(w.equipmentId))}</td><td>${esc(woTypeL(w.type))}</td><td>${esc(w.description || '')}</td><td>${esc(w.assignee || '—')}</td><td class="cell-mono" style="${late ? 'color:var(--red);font-weight:700' : ''}">${w.dueDate ? jStr(w.dueDate) : '—'}</td>
        <td><div class="row-actions">${w.status === 'new' ? `<button class="btn btn-sm" data-go="${w.id}">▶ ${L('شروع', 'Start')}</button>` : ''}${w.status === 'progress' ? `<button class="btn btn-sm" data-fin="${w.id}">✓ ${L('تکمیل', 'Complete')}</button>` : ''}<span class="icon-sm" data-e="${w.id}">✎</span><span class="icon-sm" data-d="${w.id}">🗑</span></div></td></tr>`; }).join('') : `<tr><td colspan="10"><div class="empty"><h4>${L('دستورکاری ثبت نشده است', 'No work orders yet')}</h4></div></td></tr>`}</tbody></table></div></div>`;
    document.getElementById('add').onclick = () => woForm(null);
    document.getElementById('st').onchange = (e) => { UI.filters.wo = e.target.value; vWo(c); };
    document.getElementById('q').oninput = (e) => { UI.search.wo = e.target.value; const p = e.target.selectionStart; vWo(c); const el = document.getElementById('q'); el.focus(); el.setSelectionRange(p, p); };
    c.querySelectorAll('[data-e]').forEach(b => b.onclick = () => woForm(S.wo.find(x => x.id === b.dataset.e)));
    c.querySelectorAll('[data-go]').forEach(b => b.onclick = async () => { const w = S.wo.find(x => x.id === b.dataset.go); await fbUpd('wo', w.id, { status: 'progress', startedAt: todayISO() }); logAct(L('شروع دستورکار', 'Work order started'), w.no); toast(L('دستورکار در حال انجام است', 'Work order in progress')); });
    c.querySelectorAll('[data-fin]').forEach(b => b.onclick = () => { const w = S.wo.find(x => x.id === b.dataset.fin); modal(L('تکمیل دستورکار ', 'Complete work order ') + w.no, fNum('f_hrs', L('ساعت کار انجام‌شده', 'Hours spent'), w.hours) + fArea('f_note', L('گزارش انجام کار', 'Completion notes'), w.completionNote), async (m) => { await fbUpd('wo', w.id, { status: 'done', completedAt: todayISO(), hours: gv(m, 'f_hrs') === '' ? null : Number(toEn(gv(m, 'f_hrs'))), completionNote: gv(m, 'f_note').trim() }); logAct(L('تکمیل دستورکار', 'Work order completed'), w.no); toast(L('دستورکار تکمیل شد', 'Work order completed')); }, { saveLabel: L('ثبت تکمیل', 'Mark complete') }); });
    c.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const w = S.wo.find(x => x.id === b.dataset.d); confirmDel(L('دستورکار ', 'Delete work order ') + w.no + L(' حذف شود؟', '?'), async () => { await fbDel('wo', w.id); logAct(L('حذف دستورکار', 'Deleted work order'), w.no); toast(L('حذف شد', 'Deleted')); }); });
    listExport('exp', () => L('دستورکارها', 'Work orders'), () => [L('شماره', 'No.'), L('وضعیت', 'Status'), L('اولویت', 'Priority'), L('تاریخ', 'Date'), L('تجهیز', 'Equipment'), L('نوع', 'Type'), L('شرح', 'Description'), L('مسئول', 'Assignee'), L('مهلت', 'Due'), L('ساعت کار', 'Hours')], () => rows.map(w => [w.no || '—', woStatL(w.status), woPrioL(w.priority), jStr(w.date), eqName(w.equipmentId), woTypeL(w.type), w.description || '', w.assignee || '—', w.dueDate ? jStr(w.dueDate) : '—', w.hours == null ? '—' : num(w.hours, 1)]), 'work-orders');
  }
  function woForm(ex, pre) {
    modal(ex ? L('ویرایش دستورکار ', 'Edit work order ') + (ex.no || '') : L('صدور دستورکار جدید', 'New work order'),
      fText('f_no', L('شماره دستورکار', 'Work order no.'), ex ? ex.no : nextWoNo()) + dateField('f_date', L('تاریخ صدور (شمسی)', 'Issue date (Jalali)'), ex && ex.date) +
      fSel('f_eq', L('تجهیز (اختیاری)', 'Equipment (optional)'), [{ v: '', l: '—' }].concat(eqOpts()), (ex || pre || {}).equipmentId) +
      `<div class="field-row">${fSel('f_type', L('نوع کار', 'Work type'), WO_TYPES.map(t => ({ v: t[0], l: L(t[1][0], t[1][1]) })), ex ? ex.type : ((pre && pre.type) || 'preventive'))}${fSel('f_prio', L('اولویت', 'Priority'), WO_PRIO.map(t => ({ v: t[0], l: L(t[1][0], t[1][1]) })), ex ? ex.priority : 'normal')}</div>` +
      fArea('f_desc', L('شرح کار', 'Work description'), (ex || pre || {}).description) + fText('f_asg', L('مسئول انجام', 'Assignee'), ex && ex.assignee) + dateField('f_due', L('مهلت انجام (شمسی)', 'Due date (Jalali)'), ex && ex.dueDate ? ex.dueDate : addDays(todayISO(), 7), true) +
      fSel('f_status', L('وضعیت', 'Status'), WO_STAT.map(t => ({ v: t[0], l: L(t[1][0], t[1][1]) })), ex ? ex.status : 'new'),
      async (m) => {
        const desc = gv(m, 'f_desc').trim(); if (!desc) { toast(L('شرح کار را وارد کنید', 'Describe the work')); return false; }
        const status = gv(m, 'f_status');
        const rec = { no: gv(m, 'f_no').trim() || nextWoNo(), date: dateVal(m, 'f_date'), equipmentId: gv(m, 'f_eq'), type: gv(m, 'f_type'), priority: gv(m, 'f_prio'), description: desc, assignee: gv(m, 'f_asg').trim(), dueDate: dateVal(m, 'f_due'), status };
        if (status === 'done' && !(ex && ex.completedAt)) rec.completedAt = todayISO();
        if (ex) await fbUpd('wo', ex.id, rec); else await fbAdd('wo', Object.assign({ createdAt: todayISO() }, rec));
        logAct(ex ? L('ویرایش دستورکار', 'Edited work order') : L('صدور دستورکار', 'Issued work order'), rec.no + ' — ' + desc); toast(L('ذخیره شد', 'Saved'));
      });
  }

  /* =====================================================================
     ACTIVITY LOG
     ===================================================================== */
  function vLog(c) {
    setTitle(L('لاگ فعالیت', 'Activity log'), L('تاریخچه ثبت و ویرایش‌ها', 'History of entries and edits'));
    const rows = [...S.log].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 400);
    c.innerHTML = `<div class="toolbar"><div style="flex:1"></div><div id="exp">${RK.exportBarHTML()}</div></div><div class="card" style="padding:0"><div class="table-wrap" style="border:none;max-height:70vh;overflow:auto"><table><thead><tr><th>${L('تاریخ و ساعت', 'Date & time')}</th><th>${L('عملیات', 'Action')}</th><th>${L('جزئیات', 'Details')}</th></tr></thead><tbody>${rows.length ? rows.map(r => `<tr><td class="cell-mono">${jStr((r.at || '').slice(0, 10))} ${D((r.at || '').slice(11, 16))}</td><td class="cell-strong">${esc(r.action)}</td><td>${esc(r.detail || '')}</td></tr>`).join('') : `<tr><td colspan="3"><div class="empty"><h4>${L('رویدادی ثبت نشده', 'No events yet')}</h4></div></td></tr>`}</tbody></table></div></div>`;
    listExport('exp', () => L('لاگ فعالیت', 'Activity log'), () => [L('تاریخ و ساعت', 'Date & time'), L('عملیات', 'Action'), L('جزئیات', 'Details')], () => rows.map(r => [jStr((r.at || '').slice(0, 10)) + ' ' + D((r.at || '').slice(11, 16)), r.action, r.detail || '']), 'activity-log');
  }

  /* =====================================================================
     boot: auth gate, language/theme sync
     ===================================================================== */
  function applyTheme(m) { document.body.classList.toggle('dark-theme', m === 'dark'); }
  try { if (localStorage.getItem('rostampour-theme') === 'dark') applyTheme('dark'); } catch (e) { }
  window.addEventListener('message', (ev) => {
    const d = ev.data || {};
    if (d.rostampourTheme) { applyTheme(d.rostampourTheme); try { localStorage.setItem('rostampour-theme', d.rostampourTheme); } catch (e) { } if (S.ready) renderCurrent(); }
    if (d.rostampourNav) applyNav(d.rostampourNav);
    if (d.rostampourLang) { try { localStorage.setItem('rostampour-lang', d.rostampourLang); } catch (e) { } if (d.rostampourLang !== shownLang) { if (S.ready) { shell(); renderCurrent(); } else noAuth(); } }
  });
  function noAuth() {
    shownLang = getLang();
    document.documentElement.lang = isFa() ? 'fa' : 'en'; document.documentElement.dir = isFa() ? 'rtl' : 'ltr';
    root.innerHTML = `<div class="card login-note"><h3 style="margin-bottom:8px">${L('ابتدا وارد سامانه شوید', 'Please sign in first')}</h3><p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">${L('این بخش فقط از داخل سامانه‌ی اصلی در دسترس است.', 'This section is available from inside the main application.')}</p><a class="btn btn-primary" href="index.html" target="_top">${L('رفتن به صفحه ورود', 'Go to sign-in')}</a></div>`;
  }
  /* navigation requests from the shell (alert centre / global search) */
  let navTry = 0;
  function applyNav(n) {
    const v = n && n.view;
    if (!v) return;
    const ok = () => { if (S.ready && ['dashboard', 'entry', 'reports', 'qreport', 'health', 'limits', 'equipment', 'pm', 'cm', 'wo', 'log'].includes(v)) { if (allowedView(v)) go(v); return true; } return false; };
    if (ok()) return;
    clearTimeout(applyNav._t); navTry = 0;
    (function retry() { if (ok() || ++navTry > 40) return; applyNav._t = setTimeout(retry, 300); })();
  }
  onAuthStateChanged(auth, (user) => {
    if (user && window.Role && window.Role.forUser(user)) {
      if (!S.ready) { S.ready = true; spec.groups.forEach(g => { }); if (!UI.an.scope) UI.an.scope = spec.groups[0].id; shell(); attach(); renderCurrent(); try { parent.postMessage({ rostampourReady: spec.id }, '*'); } catch (e) { } }
    } else { S.ready = false; unsubs.forEach(u => { try { u(); } catch (e) { } }); unsubs = []; noAuth(); }
  });
  noAuth();
}
