/* =========================================================================
   Rostampour SWRO NV — site PFD (dashboard) + stage sub-PFDs + out-of-service simulator
   Plain script: window.SWRO_PFD = { STAGES, STAGE_ORDER, POINTS, renderMain, renderStage, simulate, simPanel, snapshot, ... }
   Drawing follows the operator's hand-drawn PFD of Desalination Plant 1:
   11 wells · chlorine · 6 filtrations · raw tank · 2 feed pumps · acid · SMBS · 5 cartridge filters ·
   5 HP pumps · 5 RO trains · product tank · 3 transfer pumps · lime · final chlorine · isolation valves
   Six sampling points (once a day, operator):
     1 after wells & chlorine, before filtration   2 after filtration & acid   3 after SMBS, before cartridge
     4 after cartridge, before RO                  5 after RO (before lime & chlorine)   6 plant output
   ========================================================================= */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const C = { feed: '#1f6fd1', prod: '#0f9d8a', chem: '#8b3fc4', tank: '#b7e35c', tankS: '#6a9a1a', vess: '#c9ee4a', pump: '#ff9a3d', pumpS: '#b85e00', ink: '#14304f', mute: '#6b7f99', vOpen: '#2fb36b', vShut: '#d43439' };
  const FA = (v) => String(v).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- sampling points ---------- */
  const POINTS = {
    1: { stage: 'wells', group: 'q_w', fa: 'بعد از چاه‌ها و تزریق کلر (قبل از فیلتراسیون)', en: 'After wells & chlorine (before filtration)' },
    2: { stage: 'acid', group: 'q_f', fa: 'بعد از فیلتراسیون و تزریق اسید', en: 'After filtration & acid' },
    3: { stage: 'smbs', group: 'q_s', fa: 'بعد از تزریق SMBS (قبل از کارتریج)', en: 'After SMBS (before cartridge)' },
    4: { stage: 'cart', group: 'q_c', fa: 'بعد از کارتریج فیلتر (قبل از RO)', en: 'After cartridge (before RO)' },
    5: { stage: 'ro', group: 'q_m', fa: 'بعد از RO — پرمیت (قبل از آهک و کلر)', en: 'After RO — permeate (before lime & chlorine)' },
    6: { stage: 'dist', group: 'q_o', fa: 'بعد از کلر و آهک — خروجی کارخانه', en: 'After chlorine & lime — plant output' }
  };

  /* ---------- stages ---------- */
  const STAGES = {
    wells:   { fa: 'چاه‌ها و هدر ورودی', en: 'Wells & inlet header', groups: ['q_w'], keys: [], pref: 'well',
               dg: { unit: { t: 'well', fa: 'چاه', en: 'Well', n: 11, pref: 'well' }, mid: { fa: 'هدر ورودی', en: 'Inlet header' }, dst: { fa: 'فیلتراسیون‌ها', en: 'Filtrations' }, marks: [{ n: 1, at: 'dst' }], vertical: true } },
    chlor:   { fa: 'تزریق کلر اولیه', en: 'Primary chlorine dosing', groups: ['q_w'], keys: ['cl'], el: 'chlor',
               dg: { src: { fa: 'مخزن کلر', en: 'Chlorine', t: 'chem' }, dst: { fa: 'هدر ورودی چاه‌ها', en: 'Inlet header' }, chem: true, chemFa: 'کلر', chemEn: 'Chlorine', valve: 'chlor', marks: [{ n: 1, at: 'dst' }] } },
    filt:    { fa: 'فیلتراسیون (۶ فیلتر)', en: 'Filtration (6 filters)', groups: ['q_w', 'q_f'], keys: [], info: [['درجه فیلتراسیون', 'Filtration grade', '۲۰ تا ۱۵۰ میکرون', '20–150 µm']],
               dg: { src: { fa: 'هدر ورودی (نقطه ۱)', en: 'Inlet header (point 1)' }, unit: { t: 'vess', fa: 'فیلتراسیون', en: 'Filtration', n: 6, pref: 'filt' }, dst: { fa: 'مخزن آب خام', en: 'Raw water tank' }, marks: [{ n: 1, at: 'src' }] } },
    rawtank: { fa: 'مخزن آب خام', en: 'Raw water tank', groups: [], keys: ['tkRaw'],
               dg: { src: { fa: 'خروجی فیلتراسیون‌ها', en: 'Filtration outlets' }, unit: { t: 'tank', fa: 'مخزن آب خام', en: 'Raw water tank', n: 1, single: 'raw' }, dst: { fa: 'پمپ‌های خوراک', en: 'Feed pumps' } } },
    feedp:   { fa: 'پمپ‌های خوراک (۲ عدد)', en: 'Feed pumps (2)', groups: [], keys: [],
               dg: { src: { fa: 'مخزن آب خام', en: 'Raw water tank' }, unit: { t: 'pump', fa: 'پمپ خوراک', en: 'Feed pump', n: 2, pref: 'feed' }, dst: { fa: 'خط خوراک', en: 'Feed line' } } },
    acid:    { fa: 'تزریق اسید و نقطه ۲', en: 'Acid dosing & point 2', groups: ['q_f'], keys: ['acid'], el: 'acid',
               dg: { src: { fa: 'خروجی پمپ‌های خوراک', en: 'Feed pump outlet' }, dst: { fa: 'تزریق SMBS ← کارتریج‌ها', en: 'SMBS → cartridges' }, chem: true, chemFa: 'اسید سولفوریک', chemEn: 'Sulfuric acid', valve: 'acid', marks: [{ n: 2, at: 'dst' }] } },
    smbs:    { fa: 'تزریق SMBS و نقطه ۳', en: 'SMBS dosing & point 3', groups: ['q_s'], keys: ['smbs'], el: 'smbs',
               dg: { src: { fa: 'خط خوراک (بعد از اسید)', en: 'Feed line (after acid)' }, dst: { fa: 'کارتریج‌ها', en: 'Cartridge filters' }, chem: true, chemFa: 'SMBS', chemEn: 'SMBS', valve: 'smbs', marks: [{ n: 3, at: 'dst' }] } },
    cart:    { fa: 'کارتریج فیلترها (۵ عدد) و نقطه ۴', en: 'Cartridge filters (5) & point 4', groups: ['q_c'], keys: ['cartDp'], info: [['درجه فیلتراسیون', 'Filtration grade', '۵ میکرون', '5 µm']],
               dg: { src: { fa: 'خط خوراک (نقطه ۳)', en: 'Feed line (point 3)' }, unit: { t: 'cart', fa: 'کارتریج', en: 'Cartridge', n: 5, pref: 'cart' }, dst: { fa: 'پمپ‌های فشار قوی', en: 'HP pumps' }, marks: [{ n: 4, at: 'dst' }] } },
    hp:      { fa: 'پمپ‌های فشار قوی (۵ عدد)', en: 'High-pressure pumps (5)', groups: [], keys: [],
               dg: { src: { fa: 'خروجی کارتریج‌ها', en: 'Cartridge outlets' }, unit: { t: 'pump', fa: 'پمپ فشار قوی', en: 'HP pump', n: 5, pref: 'hp' }, dst: { fa: 'ممبران‌های RO', en: 'RO membranes' } } },
    ro:      { fa: 'ممبران RO (۵ خط) و نقطه ۵', en: 'RO membranes (5 trains) & point 5', groups: ['q_m'], keys: ['rec', 'roFeedP', 'roConcP', 'roPermQ', 'roTemp'], info: [['اندازه منافذ ممبران', 'Membrane pore size', '۰٫۰۰۱ میکرون', '0.001 µm']],
               dg: { src: { fa: 'پمپ‌های فشار قوی', en: 'HP pumps' }, unit: { t: 'ro', fa: 'RO', en: 'RO', n: 5, pref: 'ro' }, dst: { fa: 'مخزن آب تولیدی', en: 'Product tank' }, marks: [{ n: 5, at: 'dst' }] } },
    lime:    { fa: 'بستر سنگ آهک (کف مخزن آب تولیدی)', en: 'Limestone bed (product tank floor)', groups: [], keys: ['oPh', 'oTh'], el: 'lime', note: ['سنگ آهک کف مخزن آب تولیدی است و مصرف روزانه ندارد؛ pH و سختی آب خروجی که اثر آن را نشان می‌دهند در اینجا دیده می‌شوند.', 'The limestone bed is on the product tank floor and has no daily consumption; the output pH and hardness (its effect) are shown here.'],
               dg: { src: { fa: 'خروجی RO (نقطه ۵)', en: 'RO output (point 5)' }, unit: { t: 'tank', fa: 'مخزن آب تولیدی + بستر آهک', en: 'Product tank + limestone bed', n: 1, single: 'prod' }, dst: { fa: 'پمپ‌های ارسال', en: 'Transfer pumps' }, marks: [{ n: 5, at: 'src' }] } },
    prodtank:{ fa: 'مخزن آب تولیدی', en: 'Product water tank', groups: [], keys: ['tkProd', 'prod'],
               dg: { src: { fa: 'خروجی RO + آهک', en: 'RO output + lime' }, unit: { t: 'tank', fa: 'مخزن آب تولیدی', en: 'Product water tank', n: 1, single: 'prod' }, dst: { fa: 'پمپ‌های ارسال', en: 'Transfer pumps' }, marks: [{ n: 5, at: 'src' }] } },
    outp:    { fa: 'پمپ‌های ارسال (۳ عدد)', en: 'Transfer pumps (3)', groups: [], keys: [],
               dg: { src: { fa: 'مخزن آب تولیدی', en: 'Product water tank' }, unit: { t: 'pump', fa: 'پمپ ارسال', en: 'Transfer pump', n: 3, pref: 'out' }, dst: { fa: 'کلر نهایی ← ایستگاه توزیع', en: 'Final chlorine → distribution' } } },
    outchl:  { fa: 'تزریق کلر نهایی', en: 'Final chlorine dosing', groups: [], keys: ['clf', 'oCl'], el: 'outchl',
               dg: { src: { fa: 'کلر', en: 'Chlorine', t: 'chem' }, dst: { fa: 'خط خروجی کارخانه', en: 'Plant output line' }, chem: true, chemFa: 'کلر', chemEn: 'Chlorine', valve: 'outchl', marks: [{ n: 6, at: 'dst' }] } },
    dist:    { fa: 'خروجی کارخانه و نقطه ۶', en: 'Plant output & point 6', groups: ['q_o'], keys: ['outage'],
               dg: { src: { fa: 'پمپ‌های ارسال + کلر و آهک', en: 'Transfer pumps + chlorine & lime' }, dst: { fa: 'ایستگاه توزیع پارس', en: 'Pars distribution station' }, marks: [{ n: 6, at: 'src' }] } }
  };
  const STAGE_ORDER = ['wells', 'chlor', 'filt', 'rawtank', 'feedp', 'acid', 'smbs', 'cart', 'hp', 'ro', 'lime', 'prodtank', 'outp', 'outchl', 'dist'];

  /* ---------- PFD elements (for linking equipment / repairs to a unit) ---------- */
  const ELEMENTS = [];
  (function () {
    const add = (id, stage, fa, en) => ELEMENTS.push({ id, stage, fa, en });
    for (let i = 1; i <= 11; i++) add('well' + i, 'wells', 'چاه ' + FA(i), 'Well ' + i);
    add('chlor', 'chlor', 'تزریق کلر اولیه', 'Primary chlorine dosing');
    for (let i = 1; i <= 6; i++) add('filt' + i, 'filt', 'فیلتراسیون ' + FA(i), 'Filtration ' + i);
    add('raw', 'rawtank', 'مخزن آب خام', 'Raw water tank');
    for (let i = 1; i <= 2; i++) add('feed' + i, 'feedp', 'پمپ خوراک ' + FA(i), 'Feed pump ' + i);
    add('acid', 'acid', 'تزریق اسید', 'Acid dosing'); add('smbs', 'smbs', 'تزریق SMBS', 'SMBS dosing');
    for (let i = 1; i <= 5; i++) add('cart' + i, 'cart', 'کارتریج فیلتر ' + FA(i), 'Cartridge filter ' + i);
    for (let i = 1; i <= 5; i++) add('hp' + i, 'hp', 'پمپ فشار قوی ' + FA(i), 'HP pump ' + i);
    for (let i = 1; i <= 5; i++) add('ro' + i, 'ro', 'RO ' + FA(i), 'RO ' + i);
    add('prod', 'prodtank', 'مخزن آب تولیدی', 'Product water tank'); add('lime', 'lime', 'بستر سنگ آهک', 'Limestone bed');
    for (let i = 1; i <= 3; i++) add('out' + i, 'outp', 'پمپ ارسال ' + FA(i), 'Transfer pump ' + i);
    add('outchl', 'outchl', 'تزریق کلر نهایی', 'Final chlorine dosing');
  })();
  const elInfo = (id) => ELEMENTS.find(e => e.id === id) || null;

  /* ---------- svg helpers ---------- */
  const T = (x, y, s, o) => { o = o || {}; return `<text x="${x}" y="${y}" text-anchor="${o.a || 'middle'}" font-size="${o.s || 14}" font-weight="${o.w || 700}" fill="${o.c || C.ink}" direction="rtl">${esc(s)}</text>`; };
  const PL = (pts, kind, arrow) => { const col = { f: C.feed, p: C.prod, c: C.chem }[kind]; return `<polyline points="${pts.map(q => q.join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round" ${kind === 'c' ? 'stroke-dasharray="7 5"' : 'class="flow"'} ${arrow ? `marker-end="url(#a${kind})"` : ''}/>`; };
  const DEFS = `<defs>${[['f', C.feed], ['p', C.prod], ['c', C.chem]].map(([k, c]) => `<marker id="a${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('')}</defs>`;
  const HOT = (stage, focus, name, inner, el) => `<g class="hot" data-stage="${stage}" ${focus ? `data-focus="${focus}"` : ''} ${el ? `data-el="${el}"` : ''}><title>${esc(name)}</title>${inner}</g>`;
  const pumpG = (x, y, dir) => `<circle cx="${x}" cy="${y}" r="17" fill="${C.pump}" stroke="${C.pumpS}" stroke-width="2.5"/><polygon points="${dir === 'up' ? `${x},${y - 9} ${x - 9},${y + 8} ${x + 9},${y + 8}` : `${x - 7},${y - 9} ${x - 7},${y + 9} ${x + 10},${y}`}" fill="#fff" stroke="${C.pumpS}" stroke-width="1.5"/>`;
  const circ = (x, y, r, s, fs) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.tank}" stroke="${C.tankS}" stroke-width="3"/>` + T(x, y + (fs || 16) / 2.6, s, { s: fs || 16 });
  const diamondShape = (x, y, n, fa) => `<polygon points="${x},${y - 14} ${x + 14},${y} ${x},${y + 14} ${x - 14},${y}" fill="#fff" stroke="#d6336c" stroke-width="2.6"/>${T(x, y + 5, fa ? FA(n) : n, { s: 14, c: '#d6336c' })}`;
  const diamond = (x, y, n, fa) => `<g class="hot samp" data-stage="${POINTS[n].stage}" data-focus="p${n}"><title>${esc((fa ? 'نقطه نمونه‌برداری ' : 'Sampling point ') + (fa ? FA(n) : n) + ' — ' + POINTS[n][fa ? 'fa' : 'en'])}</title>${diamondShape(x, y, n, fa)}</g>`;
  /* isolation valve (bow-tie). id = "<element>[.in|.out|.v]" ; closed → red */
  const valve = (x, y, id, shut, vert, fa) => {
    const pts = vert ? `${x - 6},${y - 7} ${x + 6},${y + 7} ${x - 6},${y + 7} ${x + 6},${y - 7}` : `${x - 7},${y - 6} ${x + 7},${y + 6} ${x + 7},${y - 6} ${x - 7},${y + 6}`;
    return `<g class="valve ${shut ? 'shut' : ''}" data-valve="${id}"><title>${esc((fa ? 'شیر قطع و وصل — ' : 'Isolation valve — ') + (shut ? (fa ? 'بسته' : 'closed') : (fa ? 'باز' : 'open')))}</title><rect x="${x - 10}" y="${y - 10}" width="20" height="20" fill="transparent"/><polygon points="${pts}" fill="${shut ? C.vShut : C.vOpen}" stroke="#0b2a1a" stroke-width="1.4"/></g>`;
  };

  /* ---------- out-of-service state ----------
     sim.off : Set of element ids (well3, filt2, raw, feed1, acid, cart4, hp2, ro5, prod, lime, out3, chlor, smbs, outchl)
               and valve ids ("filt2.in", "raw.out", "well3", "acid.v" ...). A closed valve isolates its element.            */
  const VALVE_EL = (id) => id.replace(/\.(in|out|v)$/, '');
  function elOff(off, el) { if (!off) return false; if (off.has(el)) return true; for (const v of off) if (v.indexOf('.') > -1 && VALVE_EL(v) === el) return true; return false; }
  const isShut = (off, id) => !!off && off.has(id);

  /* =====================================================================
     MAIN SITE PFD   (viewBox 1400×930)
     ctx: { fa, bad:Set, v:{latest}, sim:{on, off:Set} }
     ===================================================================== */
  function mainSVG(ctx) {
    const fa = ctx.fa, off = ctx.sim && ctx.sim.off, n = (x) => fa ? FA(x) : String(x), Lb = (a, b) => fa ? a : b, v = ctx.v || {};
    const val = (k, u, d) => { if (v[k] == null || v[k] === '') return ''; const t = Number(v[k]).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d }); return fa ? FA(t).replace(/,/g, '٬') + ' ' + (u === 'm³' ? 'مترمکعب' : u === '%' ? '٪' : u) : t + ' ' + u; };
    const V = (x, y, id, vert) => valve(x, y, id, isShut(off, id), vert, fa);
    let s = `<svg id="pfdSvg" viewBox="0 0 1400 930" xmlns="${NS}" role="img" aria-label="PFD">${DEFS}<rect width="1400" height="930" fill="#fff"/>`;
    s += T(700, 30, Lb('نقشه فرآیندی (PFD) — کارخانه آب‌شیرین‌کن شماره ۱', 'Process flow diagram (PFD) — Desalination Plant 1'), { s: 22 });
    s += T(700, 52, Lb('روی هر بخش یا نقطه نمونه‌برداری (◆) بزنید تا PFD زیرشاخه و پارامترها باز شود', 'Tap any unit or sampling point (◆) to open its sub-PFD and parameters'), { s: 12, c: C.mute, w: 400 });
    /* wells header + filtrations */
    s += PL([[1340, 720], [420, 720]], 'f');
    for (let i = 1; i <= 11; i++) {
      const x = 1340 - (i - 1) * 86;
      s += PL([[x, 764], [x, 722]], 'f', true) + V(x, 744, 'well' + i, true) + HOT('wells', 'w' + i, Lb('چاه ', 'Well ') + n(i), circ(x, 790, 25, n(i), 19) + T(x, 842, Lb('چاه ', 'Well ') + n(i), { s: 13 }), 'well' + i);
    }
    s += PL([[420, 720], [420, 215]], 'f');
    s += HOT('chlor', '', Lb('تزریق کلر اولیه', 'Primary chlorine'), circ(150, 790, 36, Lb('کلر', 'Cl₂'), 19), 'chlor') + PL([[150, 754], [150, 720], [418, 720]], 'c', true) + V(300, 720, 'chlor.v') + T(232, 708, Lb('تزریق کلر', 'Chlorine dosing'), { s: 12, c: C.chem });
    for (let k = 1; k <= 6; k++) {
      const y = 215 + (6 - k) * 80;
      s += PL([[420, y], [382, y]], 'f', true) + PL([[150, y], [70, y]], 'f', true) + V(404, y, 'filt' + k + '.in') + V(112, y, 'filt' + k + '.out');
      s += HOT('filt', 'f' + k, Lb('فیلتراسیون ', 'Filtration ') + n(k), `<rect x="150" y="${y - 26}" width="232" height="52" rx="26" fill="${C.vess}" stroke="${C.tankS}" stroke-width="3"/>` + T(266, y + 7, Lb('فیلتراسیون ', 'Filtration ') + n(k), { s: 18 }), 'filt' + k);
    }
    s += PL([[70, 615], [70, 172]], 'f', true) + V(70, 196, 'raw.in', true);
    /* raw tank, feed pumps */
    s += HOT('rawtank', '', Lb('مخزن آب خام', 'Raw water tank'), `<rect x="40" y="40" width="280" height="130" rx="10" fill="${C.tank}" stroke="${C.tankS}" stroke-width="3"/><path d="M46 90 q35 -8 70 0 t70 0 t70 0 t54 0" fill="none" stroke="#fff" opacity=".6" stroke-width="2"/>` + T(180, 112, Lb('مخزن آب خام', 'Raw water tank'), { s: 22 }) + (val('tkRaw', 'm³') ? T(180, 142, Lb('تراز: ', 'Level: ') + val('tkRaw', 'm³'), { s: 13, w: 600 }) : ''), 'raw');
    s += PL([[320, 105], [370, 105]], 'f') + V(345, 105, 'raw.out') + PL([[370, 70], [370, 140]], 'f') + PL([[370, 70], [470, 70]], 'f') + PL([[370, 140], [470, 140]], 'f') + PL([[470, 70], [470, 140]], 'f') + PL([[470, 105], [520, 105], [520, 600]], 'f');
    [[70, 1], [140, 2]].forEach(([y, i]) => { s += V(388, y, 'feed' + i + '.in') + V(453, y, 'feed' + i + '.out') + HOT('feedp', 'p' + i, Lb('پمپ خوراک ', 'Feed pump ') + n(i), pumpG(420, y), 'feed' + i); });
    s += T(420, 182, Lb('پمپ‌های خوراک (۲ عدد)', 'Feed pumps (2)'), { s: 11, c: C.mute, w: 400 });
    /* acid + SMBS */
    s += HOT('acid', '', Lb('تزریق اسید', 'Acid dosing'), circ(610, 96, 30, Lb('اسید', 'Acid'), 15), 'acid') + PL([[610, 126], [610, 150], [522, 150]], 'c', true) + V(610, 138, 'acid.v', true) + T(566, 142, Lb('تزریق اسید', 'Acid'), { s: 11, c: C.chem });
    s += HOT('smbs', '', Lb('تزریق SMBS', 'SMBS dosing'), circ(780, 100, 36, 'SMBS', 17), 'smbs') + PL([[780, 136], [780, 195], [522, 195]], 'c', true) + V(780, 166, 'smbs.v', true) + T(660, 187, Lb('تزریق متابی‌سولفیت (SMBS)', 'SMBS dosing'), { s: 12, c: C.chem });
    s += diamond(520, 172, 2, fa) + diamond(520, 218, 3, fa) + diamond(420, 690, 1, fa);
    /* RO trains */
    for (let i = 1; i <= 5; i++) {
      const y = 240 + (i - 1) * 90;
      s += PL([[520, y], [556, y]], 'f', true) + V(538, y, 'cart' + i + '.in');
      s += HOT('cart', 'c' + i, Lb('کارتریج فیلتر ', 'Cartridge filter ') + n(i), circ(580, y, 23, n(i), 19) + T(580, y - 32, Lb('کارتریج ', 'Cartridge ') + n(i), { s: 11 }), 'cart' + i);
      s += PL([[604, y], [672, y]], 'f', true) + diamond(623, y, 4, fa) + V(647, y, 'cart' + i + '.out') + V(664, y, 'hp' + i + '.in');
      s += HOT('hp', 'h' + i, Lb('پمپ فشار قوی ', 'HP pump ') + n(i), pumpG(690, y) + T(690, y + 34, Lb('پمپ ', 'Pump ') + n(i), { s: 12 }), 'hp' + i);
      s += PL([[708, y], [780, y]], 'f', true) + V(735, y, 'hp' + i + '.out');
      let ro = `<rect x="782" y="${y - 24}" width="210" height="48" rx="4" fill="${C.vess}" stroke="${C.tankS}" stroke-width="3"/>`;
      for (let j = 1; j < 4; j++) ro += `<line x1="784" x2="990" y1="${y - 24 + j * 12}" y2="${y - 24 + j * 12}" stroke="${C.tankS}" stroke-width="1.3"/>`;
      s += HOT('ro', 'r' + i, 'RO ' + n(i), ro + T(887, y - 30, 'RO' + n(i), { s: 16 }), 'ro' + i);
      s += PL([[992, y], [1050, y]], 'p');
    }
    if (val('rec', '%', 1)) s += T(887, 190, Lb('ریکاوری: ', 'Recovery: ') + val('rec', '%', 1), { s: 12, w: 600 });
    s += PL([[1050, 240], [1050, 600]], 'p') + PL([[1050, 420], [1150, 420], [1150, 518]], 'p', true) + diamond(1150, 462, 5, fa) + V(1150, 497, 'prod.in', true);
    /* product tank + lime + pumps + final chlorine + out */
    s += HOT('prodtank', '', Lb('مخزن آب تولیدی', 'Product water tank'), `<rect x="1090" y="520" width="270" height="125" rx="10" fill="${C.tank}" stroke="${C.tankS}" stroke-width="3"/><path d="M1096 570 q34 -8 67 0 t67 0 t67 0 t51 0" fill="none" stroke="#fff" opacity=".6" stroke-width="2"/>` + T(1225, 568, Lb('مخزن آب تولیدی', 'Product water tank'), { s: 21 }) + (val('tkProd', 'm³') ? T(1225, 592, Lb('تراز: ', 'Level: ') + val('tkProd', 'm³'), { s: 13, w: 600 }) : ''), 'prod');
    s += HOT('lime', '', Lb('بستر سنگ آهک (کف مخزن آب تولیدی)', 'Limestone bed (product tank floor)'), `<rect x="1100" y="612" width="250" height="26" rx="5" fill="#d9d4c7" stroke="#8a8472" stroke-width="2"/>` + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => `<circle cx="${1112 + i * 19}" cy="${i % 2 ? 620 : 630}" r="4.5" fill="#f2efe6" stroke="#8a8472"/>`).join('') + T(1225, 603, Lb('بستر سنگ آهک', 'Limestone bed'), { s: 11, c: '#5b5646' }), 'lime');
    s += PL([[1280, 520], [1280, 490]], 'p') + V(1280, 505, 'prod.out', true) + PL([[1210, 490], [1350, 490]], 'p') + PL([[1210, 360], [1350, 360]], 'p');
    [1210, 1280, 1350].forEach((x, i) => { s += PL([[x, 490], [x, 440]], 'p') + PL([[x, 400], [x, 360]], 'p') + V(x, 468, 'out' + (i + 1) + '.in', true) + V(x, 380, 'out' + (i + 1) + '.out', true) + HOT('outp', 'o' + (i + 1), Lb('پمپ ارسال ', 'Transfer pump ') + n(i + 1), pumpG(x, 420, 'up') + T(x - 31, y4(), Lb('پمپ ', 'Pump ') + n(i + 1), { s: 11 }), 'out' + (i + 1)); });
    function y4() { return 424; }
    s += PL([[1280, 360], [1280, 112]], 'p', true);
    s += HOT('outchl', '', Lb('تزریق کلر نهایی', 'Final chlorine'), circ(1090, 230, 28, Lb('کلر', 'Cl₂'), 15), 'outchl') + PL([[1118, 230], [1278, 230]], 'c', true) + V(1160, 230, 'outchl.v') + T(1215, 222, Lb('تزریق کلر نهایی', 'Final chlorine'), { s: 11, c: C.chem });
    s += diamond(1280, 168, 6, fa);
    s += HOT('dist', '', Lb('ایستگاه توزیع پارس', 'Pars distribution station'), `<rect x="1130" y="66" width="250" height="40" rx="8" fill="#fff" stroke="${C.prod}" stroke-width="2.5"/>` + T(1255, 92, Lb('آب ارسالی به ایستگاه توزیع پارس', 'Water to Pars distribution station'), { s: 14 }));
    /* legend */
    const leg = [[Lb('خط آب خام / خوراک', 'Raw / feed line'), 'f'], [Lb('خط آب تولیدی (پرمیت)', 'Product (permeate) line'), 'p'], [Lb('خط تزریق مواد شیمیایی', 'Chemical dosing line'), 'c']];
    leg.forEach((a, i) => { const x = 1360 - i * 205; s += PL([[x, 905], [x - 34, 905]], a[1], true) + T(x - 42, 909, a[0], { a: fa ? 'start' : 'end', s: 12, w: 400 }); });
    s += `<circle cx="690" cy="905" r="9" fill="${C.pump}" stroke="${C.pumpS}" stroke-width="2"/>` + T(674, 909, Lb('پمپ', 'Pump'), { a: fa ? 'start' : 'end', s: 12, w: 400 });
    s += valve(600, 905, 'legend', false, false, fa).replace('data-valve="legend"', 'data-legend="1"') + T(584, 909, Lb('شیر قطع و وصل', 'Isolation valve'), { a: fa ? 'start' : 'end', s: 12, w: 400 });
    s += `<polygon points="480,893 492,905 480,917 468,905" fill="#fff" stroke="#d6336c" stroke-width="2.4"/>` + T(454, 909, Lb('نقطه نمونه‌برداری', 'Sampling point'), { a: fa ? 'start' : 'end', s: 12, w: 400 });
    s += `<rect x="330" y="896" width="22" height="18" rx="6" fill="${C.tank}" stroke="${C.tankS}" stroke-width="2"/>` + T(320, 909, Lb('مخزن / فیلتر / چاه', 'Tank / filter / well'), { a: fa ? 'start' : 'end', s: 12, w: 400 });
    s += liveBadges(ctx);
    return s + '</svg>';
  }
  /* live value badge beside each sampling point: status colour + headline value + 7-day sparkline */
  const BADGE = { 1: [440, 679, 96], 2: [540, 156, 96], 3: [424, 208, 82], 4: [632, 199, 96], 5: [1056, 452, 80], 6: [1176, 158, 86] };
  const SCOL = { bad: '#d43439', warn: '#f5a524', ok: '#2fb36b', none: '#8a97a8' };
  function liveBadges(ctx) {
    const lv = ctx.live; if (!lv) return '';
    let s = '';
    for (let n = 1; n <= 6; n++) {
      const b = lv[n], g = BADGE[n]; if (!b) continue;
      const [x, y, w] = g, h = 20, col = SCOL[b.status] || SCOL.none;
      const sp = b.spark && b.spark.d ? `<g transform="translate(${x + 8},${y + 4})"><path d="${b.spark.d}" fill="none" stroke="${col}" stroke-width="1.4"/></g>` : '';
      s += `<g class="livebadge hot" data-stage="${POINTS[n].stage}" data-focus="p${n}"><title>${esc(b.tip || '')}</title><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#fff" stroke="${col}" stroke-width="2"/><rect x="${x}" y="${y}" width="5" height="${h}" rx="2" fill="${col}"/>${sp}<text x="${x + w - 4}" y="${y + 14}" text-anchor="end" direction="ltr" font-size="10.5" font-weight="700" fill="${C.ink}">${esc(b.text || '—')}</text></g>`;
    }
    return s;
  }

  const MAIN_CSS = `<style>
      .pfd-wrap{background:#fff;border-radius:12px;border:1px solid var(--border);overflow:auto}
      .pfd-wrap svg{display:block;width:100%;min-width:760px;height:auto}
      .pfd-wrap .hot,.pfd-wrap .valve{cursor:pointer;transition:filter .15s}.pfd-wrap .hot:hover,.pfd-wrap .valve:hover{filter:drop-shadow(0 0 5px #ff7a59) brightness(1.06)}
      .pfd-wrap .flow{stroke-dasharray:8 6;animation:pfdflow 1.2s linear infinite}
      @keyframes pfdflow{to{stroke-dashoffset:-14}}
      .pfd-wrap .hot.bad>circle,.pfd-wrap .hot.bad>rect,.pfd-wrap .hot.bad>polygon{stroke:#d43439!important;stroke-width:5!important}
      .pfd-wrap .hot.off{opacity:.38}.pfd-wrap .hot.off>circle,.pfd-wrap .hot.off>rect{stroke:#d43439!important;stroke-dasharray:6 4}
      .pfd-wrap.simon{outline:3px dashed #d6336c;outline-offset:-3px}
      .eqb{pointer-events:none}.hot.eq-bad,.hot.eq-warn{}
      .stage-chip .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-inline-end:5px}
      .stage-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      .stage-chip{border:1px solid var(--border);background:var(--panel-2);border-radius:999px;padding:6px 13px;font-size:12.5px;cursor:pointer;font-weight:600}
      .stage-chip:hover{border-color:var(--mc);color:var(--mc)}.stage-chip.bad{border-color:#d43439;color:#d43439}
      @media(prefers-reduced-motion:reduce){.pfd-wrap .flow{animation:none}}
    </style>`;

  function renderMain(mount, ctx) {
    const sim = ctx.sim || { on: false, off: new Set() };
    mount.innerHTML = MAIN_CSS + `<div class="pfd-wrap ${sim.on ? 'simon' : ''}">${mainSVG(ctx)}</div>
    <div class="stage-chips">${STAGE_ORDER.map(id => `<span class="stage-chip ${ctx.bad && ctx.bad.has(id) ? 'bad' : ''}" data-stage="${id}">${ctx.eqStage && ctx.eqStage[id] ? `<i class="dot" style="background:${ctx.eqStage[id] === 'bad' ? '#d43439' : '#f5a524'}" title="${esc(ctx.fa ? 'تجهیز دارای تعمیر باز / بازدید معوق' : 'Equipment with open repair / overdue inspection')}"></i>` : ''}${esc(ctx.fa ? STAGES[id].fa : STAGES[id].en)}</span>`).join('')}</div>`;
    mount.querySelectorAll('.hot').forEach(g => {
      if (ctx.bad && ctx.bad.has(g.dataset.stage) && !g.classList.contains('samp')) g.classList.add('bad');
      if (g.dataset.el && elOff(sim.off, g.dataset.el)) g.classList.add('off');
    });
    /* equipment health: small wrench badge on every unit that has an open repair / overdue inspection */
    if (ctx.eq) mount.querySelectorAll('.hot[data-el]').forEach(g => {
      const h = ctx.eq[g.dataset.el]; if (!h) return;
      try {
        const bb = g.getBBox(), col = h.k === 'bad' ? '#d43439' : '#f5a524';
        g.insertAdjacentHTML('beforeend', `<g class="eqb"><circle cx="${bb.x + bb.width - 2}" cy="${bb.y + 2}" r="9" fill="${col}" stroke="#fff" stroke-width="2"/><text x="${bb.x + bb.width - 2}" y="${bb.y + 6}" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">${h.k === 'bad' ? '!' : '⏱'}</text></g>`);
      } catch (e) { }
    });
    mount.onclick = (ev) => {
      const vl = ev.target.closest('[data-valve]');
      if (vl) { if (sim.on && ctx.toggle) ctx.toggle(vl.dataset.valve); else if (ctx.hint) ctx.hint(); return; }
      const el = ev.target.closest('.hot[data-el]');
      if (el && sim.on && ctx.toggle) { ctx.toggle(el.dataset.el); return; }
      if (el && ctx.openEl) { ctx.openEl(el.dataset.el, el.dataset.stage, el.dataset.focus || ''); return; }
      const t = ev.target.closest('[data-stage]'); if (!t) return;
      ctx.open(t.dataset.stage, t.dataset.focus || '');
    };
  }

  /* =====================================================================
     SIMULATOR — what happens downstream when equipment / valves are taken out of service
     Assumptions (stated to the user): parallel units have equal capacity and no spare; no bypass lines are drawn.
     ===================================================================== */
  const RULE_NAMES = { wells: ['چاه‌ها', 'Wells'], filt: ['فیلتراسیون', 'Filtration'], raw: ['مخزن آب خام', 'Raw water tank'], feed: ['پمپ‌های خوراک', 'Feed pumps'], train: ['خطوط RO (کارتریج + پمپ فشار قوی + RO)', 'RO trains (cartridge + HP pump + RO)'], prod: ['مخزن آب تولیدی', 'Product tank'], out: ['پمپ‌های ارسال', 'Transfer pumps'] };
  function simulate(off, latest) {
    off = off || new Set();
    const act = (id) => !elOff(off, id), cnt = (pref, n) => { let c = 0; for (let i = 1; i <= n; i++) if (act(pref + i)) c++; return c; };
    const trainOk = (i) => act('cart' + i) && act('hp' + i) && act('ro' + i);
    let trains = 0; for (let i = 1; i <= 5; i++) if (trainOk(i)) trains++;
    const n = { wells: cnt('well', 11), filt: cnt('filt', 6), feed: cnt('feed', 2), train: trains, out: cnt('out', 3) };
    const a = { wells: n.wells / 11, filt: n.filt / 6, raw: act('raw') ? 1 : 0, feed: n.feed / 2, train: trains / 5, prod: act('prod') ? 1 : 0, out: n.out / 3 };
    const order = ['wells', 'filt', 'raw', 'feed', 'train', 'prod', 'out'];
    const F = Math.min.apply(null, order.map(k => a[k]));
    const zero = order.filter(k => a[k] === 0), minK = order.reduce((m, k) => a[k] < a[m] ? k : m, 'wells');
    /* flow fraction at every sampling point */
    const f = {}; f[1] = a.wells; f[2] = Math.min(a.wells, a.filt, a.raw, a.feed); f[3] = f[2]; f[4] = Math.min(f[2], a.train); f[5] = f[4]; f[6] = Math.min(f[5], a.prod, a.out);
    const chlorOff = !act('chlor'), acidOff = !act('acid'), smbsOff = !act('smbs'), limeOff = !act('lime'), finOff = !act('outchl');
    const eff = [];   /* {sev:'crit'|'warn'|'info', fa, en} */
    const E = (sev, fa, en) => eff.push({ sev, fa, en });
    const pct = (x) => Math.round(x * 100);
    if (F === 0) E('crit', 'تولید کارخانه به صفر می‌رسد؛ مسیر در مرحله «' + zero.map(k => RULE_NAMES[k][0]).join('، ') + '» قطع است (در PFD مسیر کنارگذر رسم نشده).', 'Plant production drops to zero: the path is cut at “' + zero.map(k => RULE_NAMES[k][1]).join(', ') + '” (no bypass is drawn).');
    else if (F < 1) E('warn', 'ظرفیت کل کارخانه ≈ ' + FA(pct(F)) + '٪ (محدودکننده: ' + RULE_NAMES[minK][0] + ').', 'Plant capacity ≈ ' + pct(F) + '% (limiting stage: ' + RULE_NAMES[minK][1] + ').');
    if (n.wells < 11 && n.wells > 0) E('info', FA(11 - n.wells) + ' چاه خارج از مدار است؛ شوری و ترکیب آب ورودی (نقطه ۱) ممکن است تغییر کند.', (11 - n.wells) + ' well(s) out: inlet salinity / composition (point 1) may shift.');
    if (n.filt < 6 && n.filt > 0) { const x = 6 / n.filt; E(n.filt <= 4 ? 'warn' : 'info', 'فقط ' + FA(n.filt) + ' فیلتراسیون در مدار: سرعت عبور آب هر فیلتر ≈ ' + FA(x.toFixed(2)) + ' برابر؛ NTU/TSS نقطه ۲ بالا می‌رود و بار کارتریج‌ها زیاد می‌شود.', 'Only ' + n.filt + ' filtrations online: velocity ≈ ' + x.toFixed(2) + '× — NTU/TSS at point 2 rises and cartridges load up.'); }
    if (n.feed === 1) E('warn', 'فقط یک پمپ خوراک در مدار است؛ دبی/فشار خوراک کم می‌شود (ظرفیت ۵۰٪ فرض شده).', 'Only one feed pump online: feed flow / pressure falls (50% capacity assumed).');
    if (trains < 5 && trains > 0) E('warn', 'فقط ' + FA(trains) + ' خط RO فعال است؛ اگر دبی خوراک ثابت بماند شار هر RO بالا می‌رود — دبی خوراک را متناسب کم کنید.', 'Only ' + trains + ' RO train(s) active: if feed flow stays constant the flux per RO rises — reduce feed flow accordingly.');
    if (F > 0) {
      if (chlorOff) E('warn', 'تزریق کلر اولیه قطع است: ORP و کلر آزاد نقطه ۱ و ۲ پایین می‌آید، گندزدایی انجام نمی‌شود و خطر رشد بیولوژیک روی فیلترها وجود دارد؛ SMBS اضافه تزریق می‌شود.', 'Primary chlorine is off: ORP / free chlorine at points 1–2 fall, no disinfection (bio-growth risk); SMBS is now over-dosed.');
      if (acidOff) E('warn', 'تزریق اسید قطع است: pH نقاط ۲ تا ۴ به pH نقطه ۱ نزدیک می‌شود و خطر رسوب روی RO بالا می‌رود؛ pH پرمیت (نقطه ۵) هم کمی بالا می‌رود.', 'Acid is off: pH at points 2–4 rises towards point 1 and RO scaling risk grows; permeate pH (point 5) also rises.');
      if (smbsOff && !chlorOff) E('crit', 'SMBS قطع است ولی کلر اولیه برقرار است: کلر/اکسیدان بدون خنثی‌سازی به کارتریج و RO می‌رسد (ORP و کلر آزاد نقاط ۳ و ۴ ≈ نقطه ۲) — خطر آسیب دائمی ممبران؛ RO را متوقف کنید.', 'SMBS is off while chlorine is on: un-neutralised oxidant reaches cartridges and RO (ORP / free Cl at points 3–4 ≈ point 2) — permanent membrane damage risk; stop the RO.');
      else if (smbsOff) E('info', 'SMBS قطع است (کلر هم قطع است): ORP نقاط ۳ و ۴ کمی بالاتر از حالت عادی می‌شود.', 'SMBS is off (chlorine also off): ORP at points 3–4 slightly higher than normal.');
      if (limeOff) E('warn', 'بستر سنگ آهک از مدار خارج است (یا تخلیه شده): pH و سختی خروجی (نقطه ۶) به مقدار پرمیت (نقطه ۵) نزدیک می‌شود؛ آب خورنده و بی‌تعادل است.', 'Limestone bed is out: output pH and hardness (point 6) fall to permeate (point 5) values — aggressive, unbalanced water.');
      if (finOff) E('warn', 'کلر نهایی قطع است: کلر آزاد خروجی (نقطه ۶) ≈ پرمیت (تقریباً صفر) و ضدعفونی شبکه انجام نمی‌شود.', 'Final chlorine is off: output free chlorine (point 6) ≈ permeate (≈ 0) — no residual disinfection.');
    } else if (chlorOff || acidOff || smbsOff || limeOff || finOff) E('info', 'چون جریان قطع است، اثر تزریق‌ها قابل ارزیابی نیست.', 'With no flow the dosing effects are not applicable.');
    /* per-point expectations (only where a firm relationship exists with another point's recorded value) */
    const L = latest || (() => null), rows = [];
    const row = (p, key, fa, en, ref, dir) => rows.push({ p, key, fa, en, ref, dir });
    if (F > 0) {
      if (chlorOff) { row(1, 'rOrp', 'ORP پایین می‌آید', 'ORP falls', null, 'down'); row(1, 'rCl', '', '', null); row(2, 'fCl', 'کلر آزاد ≈ ۰', 'Free Cl ≈ 0', 0, 'to'); row(2, 'fOrp', 'ORP پایین می‌آید', 'ORP falls', null, 'down'); }
      if (acidOff) { [2, 3, 4].forEach(p => row(p, ['', 'rPh', 'fPh', 'sPh', 'cPh'][p === 2 ? 2 : p === 3 ? 3 : 4], 'pH ≈ pH نقطه ۱', 'pH ≈ point 1 pH', L('rPh'), 'to')); row(5, 'mPh', 'pH بالا می‌رود', 'pH rises', null, 'up'); }
      if (smbsOff && !chlorOff) { row(3, 'sOrp', 'ORP ≈ نقطه ۲', 'ORP ≈ point 2', L('fOrp'), 'to'); row(4, 'cOrp', 'ORP ≈ نقطه ۲', 'ORP ≈ point 2', L('fOrp'), 'to'); row(3, 'sCl', 'کلر آزاد ≈ نقطه ۲', 'Free Cl ≈ point 2', L('fCl'), 'to'); row(4, 'cCl', 'کلر آزاد ≈ نقطه ۲', 'Free Cl ≈ point 2', L('fCl'), 'to'); }
      if (limeOff) { row(6, 'oPh', 'pH ≈ نقطه ۵', 'pH ≈ point 5', L('mPh'), 'to'); row(6, 'oTh', 'سختی ≈ نقطه ۵', 'TH ≈ point 5', L('mTh'), 'to'); }
      if (finOff) row(6, 'oCl', 'کلر آزاد ≈ نقطه ۵', 'Free Cl ≈ point 5', L('mCl') == null ? 0 : L('mCl'), 'to');
      if (n.filt <= 4 && n.filt > 0) { row(2, 'fNtu', 'NTU بالا می‌رود', 'NTU rises', null, 'up'); }
    }
    return { F, a, n, f, eff, rows, trains, zero, blockedPoints: [1, 2, 3, 4, 5, 6].filter(p => f[p] === 0) };
  }

  function simPanel(sim, ctx) {
    const fa = ctx.fa, D = fa ? FA : (x) => x, nm = ctx.name || ((k) => k), val = ctx.val || (() => null);
    const sev = { crit: ['#d43439', fa ? 'بحرانی' : 'Critical'], warn: ['#f5a524', fa ? 'هشدار' : 'Warning'], info: ['#1f6fd1', fa ? 'توجه' : 'Note'] };
    const base = ctx.prodBase;
    const fmt = (x) => x == null ? '—' : D(Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 }));
    const effHtml = sim.eff.length ? sim.eff.map(e => `<div class="alert-item" style="align-items:flex-start;gap:8px"><span class="tag" style="background:${sev[e.sev][0]};color:#fff;white-space:nowrap">${sev[e.sev][1]}</span><span>${esc(fa ? e.fa : e.en)}</span></div>`).join('') : `<div class="empty" style="padding:12px"><h4>${fa ? 'همه تجهیزات در مدار هستند؛ تغییری در پارامترها پیش‌بینی نمی‌شود.' : 'Everything is in service; no parameter change is expected.'}</h4></div>`;
    const blocked = sim.blockedPoints.length ? `<div class="notice" style="margin-top:10px">⛔ <div>${fa ? 'جریان در نقاط نمونه‌برداری ' : 'No flow at sampling points '}${sim.blockedPoints.map(p => D(p)).join('، ')}${fa ? ' برقرار نیست؛ نمونه‌ای وجود نخواهد داشت.' : ' — no sample available.'}</div></div>` : '';
    const rowsHtml = sim.rows.filter(r => r.fa).map(r => {
      const cur = ctx.valOf(r.key), refv = r.ref;
      const exp = r.dir === 'to' && refv != null ? `≈ ${fmt(refv)}` : (r.dir === 'up' ? '▲' : r.dir === 'down' ? '▼' : '—');
      return `<tr><td class="cell-strong">${fa ? 'نقطه ' : 'Point '}${D(r.p)}</td><td>${esc(nm(r.key))}</td><td class="cell-mono">${cur == null ? '—' : fmt(cur)}</td><td class="cell-mono">${exp}</td><td>${esc(fa ? r.fa : r.en)}</td></tr>`;
    }).join('');
    const prodEst = base != null ? `<div class="pcard" style="cursor:default"><div class="pn">${fa ? 'تولید روزانه تقریبی' : 'Approx. daily production'}</div><div class="pv" style="font-family:inherit">${fmt(base * sim.F)} <small>${fa ? 'مترمکعب' : 'm³'}</small></div><div class="pm">${fa ? 'نسبت به آخرین تولید ثبت‌شده: ' : 'vs last recorded: '}${fmt(base)}</div></div>` : '';
    return `<div class="card" style="margin-top:12px"><div class="panel-title"><div><h3>${fa ? 'تحلیل اثر خروج از مدار' : 'Out-of-service impact'}</h3><div class="sub">${fa ? 'تقریبی: واحدهای موازی هم‌ظرفیت و بدون ذخیره فرض شده‌اند؛ مقادیر «≈» از آخرین ثبت همان نقطه مرجع گرفته می‌شوند.' : 'Approximate: parallel units assumed equal-capacity with no spare; “≈” values come from the latest record of the reference point.'}</div></div></div>
      <div class="pgrid" style="margin-bottom:10px"><div class="pcard" style="cursor:default"><div class="pn">${fa ? 'ظرفیت کل کارخانه' : 'Plant capacity'}</div><div class="pv" style="font-family:inherit;color:${sim.F === 0 ? '#d43439' : sim.F < 1 ? '#f5a524' : 'var(--accent-2)'}">${D(Math.round(sim.F * 100))}٪</div></div>${prodEst}
      <div class="pcard" style="cursor:default"><div class="pn">${fa ? 'در مدار' : 'In service'}</div><div class="pm" style="font-size:12px">${fa ? 'چاه' : 'Wells'} ${D(sim.n.wells)}/۱۱ · ${fa ? 'فیلتراسیون' : 'Filt.'} ${D(sim.n.filt)}/۶ · ${fa ? 'پمپ خوراک' : 'Feed'} ${D(sim.n.feed)}/۲<br>${fa ? 'خط RO' : 'RO trains'} ${D(sim.n.train)}/۵ · ${fa ? 'پمپ ارسال' : 'Transfer'} ${D(sim.n.out)}/۳</div></div></div>
      <div class="alert-list">${effHtml}</div>${blocked}
      ${rowsHtml ? `<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>${fa ? 'نقطه' : 'Point'}</th><th>${fa ? 'پارامتر' : 'Parameter'}</th><th>${fa ? 'آخرین مقدار ثبت‌شده' : 'Last recorded'}</th><th>${fa ? 'پیش‌بینی' : 'Expected'}</th><th>${fa ? 'توضیح' : 'Note'}</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>` : ''}</div>`;
  }

  /* =====================================================================
     STAGE SUB-PFD
     ===================================================================== */
  const UNIT = {
    well: (x, y, i, f) => circ(x, y, 15, f ? FA(i) : i, 12),
    vess: (x, y, i, f, l) => `<rect x="${x - 70}" y="${y - 20}" width="140" height="40" rx="20" fill="${C.vess}" stroke="${C.tankS}" stroke-width="3"/>` + T(x, y + 5, l + ' ' + (f ? FA(i) : i), { s: 14 }),
    cart: (x, y, i, f, l) => `<circle cx="${x}" cy="${y}" r="21" fill="${C.vess}" stroke="${C.tankS}" stroke-width="3"/>` + T(x, y + 6, f ? FA(i) : i, { s: 17 }) + T(x, y - 28, l, { s: 10 }),
    pump: (x, y, i, f, l) => pumpG(x, y) + T(x, y + 33, l + ' ' + (f ? FA(i) : i), { s: 11 }),
    ro: (x, y, i, f, l) => `<rect x="${x - 90}" y="${y - 22}" width="180" height="44" rx="4" fill="${C.vess}" stroke="${C.tankS}" stroke-width="3"/>` + [1, 2, 3].map(j => `<line x1="${x - 88}" x2="${x + 88}" y1="${y - 22 + j * 11}" y2="${y - 22 + j * 11}" stroke="${C.tankS}" stroke-width="1.2"/>`).join('') + T(x, y - 28, l + (f ? FA(i) : i), { s: 13 }),
    tank: (x, y, i, f, l) => `<rect x="${x - 100}" y="${y - 55}" width="200" height="110" rx="10" fill="${C.tank}" stroke="${C.tankS}" stroke-width="3"/>` + T(x, y + 6, l, { s: 18 })
  };
  const BOX = (x, y, w, h, s, fs) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#f3f7fb" stroke="${C.feed}" stroke-width="2"/>` + T(x + w / 2, y + h / 2 + 5, s, { s: fs || 14 });

  function stageSVG(id, ctx) {
    const st = STAGES[id], dg = st.dg, fa = ctx.fa, lb = (o) => fa ? o.fa : o.en, focus = ctx.focus || '', off = ctx.off;
    const un = dg.unit, nU = un ? un.n : 1;
    const rh = !un ? 62 : ({ well: 36, tank: 130, ro: 78, cart: 68, vess: 60, pump: 62 }[un.t] || 62);
    const H = Math.max(un ? nU * rh + 100 : 260, 260), cy = H / 2;
    const kind = 'f';
    const elId = (i) => un.single ? un.single : un.pref + i;
    const dim = (el, inner) => `<g ${el && elOff(off, el) ? 'opacity=".35"' : ''}>${inner}</g>`;
    let s = `<svg viewBox="0 0 900 ${H}" xmlns="${NS}" id="stageSvg">${DEFS}<rect width="900" height="${H}" fill="#fff"/>`;
    const SX = 20, SW = 170, DX = 710, DW = 170;
    const vv = (x, y, id) => valve(x, y, id, isShut(off, id), false, fa);
    if (dg.vertical) {
      s += BOX(DX, cy - 22, DW, 44, lb(dg.dst), 13);
      const top = cy - ((nU - 1) / 2) * rh;
      s += PL([[430, top - 20], [430, top + (nU - 1) * rh + 20]], 'f');
      for (let i = 1; i <= nU; i++) {
        const y = top + (i - 1) * rh; const el = un.pref + i;
        s += PL([[290, y], [430, y]], 'f') + vv(345, y, el);
        s += `<g class="${focus === 'w' + i ? 'focus' : ''}">${dim(el, UNIT.well(275, y, i, fa))}</g>` + T(246, y + 4, (fa ? 'چاه ' : 'Well ') + (fa ? FA(i) : i), { s: 11, a: fa ? 'start' : 'end', w: 600 });
      }
      s += PL([[430, cy], [DX - 2, cy]], 'f', true) + T(560, cy - 8, lb(dg.mid), { s: 12, w: 500, c: C.mute });
      (dg.marks || []).forEach(m => { s += `<g>${diamondShape(640, cy, m.n, fa)}</g>`; });
      return s + '</svg>';
    }
    s += BOX(SX, cy - 24, SW, 48, lb(dg.src), 13) + BOX(DX, cy - 24, DW, 48, lb(dg.dst), 13);
    const hx1 = 260, hx2 = 640, ux = 450;
    if (un) {
      const top = cy - ((nU - 1) / 2) * rh;
      s += PL([[SX + SW, cy], [hx1, cy]], 'f');
      if (nU > 1) s += PL([[hx1, top], [hx1, top + (nU - 1) * rh]], 'f') + PL([[hx2, top], [hx2, top + (nU - 1) * rh]], un.t === 'ro' ? 'p' : 'f');
      for (let i = 1; i <= nU; i++) {
        const y = top + (i - 1) * rh, half = un.t === 'tank' ? 100 : un.t === 'ro' ? 90 : un.t === 'vess' ? 70 : un.t === 'pump' ? 17 : 21;
        const el = elId(i), hasV = un.t !== 'ro';
        const outKind = un.t === 'ro' ? 'p' : 'f';
        s += PL([[hx1, y], [ux - half - 2, y]], 'f', true) + PL([[ux + half, y], [hx2, y]], outKind);
        if (hasV) s += vv(ux - half - 24, y, un.single ? un.single + '.in' : el + '.in') + vv(ux + half + 24, y, un.single ? un.single + '.out' : el + '.out');
        s += `<g class="${focus.slice(1) == i && focus[0] !== 'p' ? 'focus' : ''}">${dim(el, UNIT[un.t](ux, y, i, fa, lb(un)))}</g>`;
      }
      s += PL([[hx2, cy], [DX - 2, cy]], un.t === 'ro' ? 'p' : 'f', true);
      (dg.marks || []).forEach(m => { s += `<g>${diamondShape(m.at === 'src' ? (SX + SW + hx1) / 2 : (hx2 + DX) / 2, cy, m.n, fa)}</g>`; });
    } else {
      s += PL([[SX + SW, cy], [DX - 2, cy]], 'f', true);
      (dg.marks || []).forEach(m => { s += `<g>${diamondShape(m.at === 'src' ? 300 : 600, cy, m.n, fa)}</g>`; });
    }
    if (dg.chem) {
      const cx = un ? (SX + SW + hx1) / 2 : 450, ccy = cy - 110 > 50 ? cy - 110 : 52;
      const vid = dg.valve ? dg.valve + '.v' : null;
      s += dim(dg.valve, `<circle cx="${cx}" cy="${ccy}" r="44" fill="${C.tank}" stroke="${C.tankS}" stroke-width="3"/>` + T(cx, ccy + 5, fa ? (dg.chemFa || 'مواد شیمیایی') : (dg.chemEn || 'Chemical'), { s: 12 })) + PL([[cx, ccy + 44], [cx, cy - 2]], 'c', true);
      if (vid) s += valve(cx, (ccy + 44 + cy) / 2, vid, isShut(off, vid), true, fa);
    }
    return s + '</svg>';
  }

  function renderStage(mount, id, ctx) {
    mount.innerHTML = `<style>.stage-wrap{background:#fff;border-radius:12px;border:1px solid var(--border);overflow:auto}.stage-wrap svg{display:block;width:100%;min-width:620px;height:auto}.stage-wrap .flow{stroke-dasharray:8 6;animation:pfdflow 1.2s linear infinite}.stage-wrap .focus>*{filter:drop-shadow(0 0 6px #ff7a59)}@keyframes pfdflow{to{stroke-dashoffset:-14}}</style><div class="stage-wrap">${stageSVG(id, ctx)}</div>`;
  }

  /* static PNG of the site PFD (for the comprehensive report) */
  function snapshot(fa, v) {
    const svg = mainSVG({ fa, v: v || {}, sim: { on: false, off: new Set() } }).replace('<svg id="pfdSvg"', '<svg width="2100" height="1395"');
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { const cv = document.createElement('canvas'); cv.width = 2100; cv.height = 1395; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 2100, 1395); g.drawImage(img, 0, 0, 2100, 1395); try { res(cv.toDataURL('image/png')); } catch (e) { rej(e); } };
      img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  window.SWRO_PFD = { STAGES, STAGE_ORDER, POINTS, renderMain, renderStage, simulate, simPanel, snapshot, elOff, ELEMENTS, elInfo, BADGE };
})();
