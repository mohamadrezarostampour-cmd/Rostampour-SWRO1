/* Plant specifications shared by the sections (4, 5) and the shell (reports / alerts). */
(function(){
'use strict';
const P = (key, fa, en, unit, agg, o) => Object.assign({ key, fa, en, unit, agg: agg || 'avg' }, o || {});
const eff = (a, b) => (base) => (base[a] > 0 && base[b] != null) ? (base[a] - base[b]) / base[a] * 100 : null;
const pair = (k, fa, en, unit, o) => [P('r' + k, fa + ' آب خام', en + ' raw water', unit, 'avg', o), P('p' + k, fa + ' آب محصول', en + ' product water', unit, 'avg', o)];

/* helper: one sampling-point group (every parameter is entered once a day by the operator) */
const QDEF = {
  ph: ['pH', 'pH', '', { dec: 2, min: 0, max: 14 }], ec: ['EC', 'EC', 'µS/cm', { dec: 0, min: 0 }], orp: ['ORP', 'ORP', 'mV', { dec: 0 }],
  tds: ['TDS', 'TDS', 'ppm', { dec: 0, min: 0 }], th: ['TH (سختی کل)', 'TH (total hardness)', 'ppm', { dec: 1, min: 0 }], ntu: ['NTU (کدورت)', 'NTU (turbidity)', 'NTU', { dec: 2, min: 0 }],
  tss: ['TSS', 'TSS', 'ppm', { dec: 0, min: 0 }], cl: ['کلر آزاد', 'Free chlorine', 'ppm', { dec: 2, min: 0 }]
};
const qgroup = (id, fa, en, pre, list, notes, derived) => ({
  id: 'q_' + id, point: id, fa, en,
  params: list.map(k => { const d = QDEF[k]; return P(pre + k[0].toUpperCase() + k.slice(1), d[0], d[1], d[2], 'avg', Object.assign({ note: (notes || {})[k] }, d[3])); }),
  derived: derived || undefined,
  charts: list.map(k => { const d = QDEF[k]; return { title: { fa: d[0], en: d[1] }, series: [pre + k[0].toUpperCase() + k.slice(1)], zero: !(k === 'ph' || k === 'orp') }; })
    .concat(derived ? [{ title: { fa: derived[0].fa, en: derived[0].en }, series: [derived[0].key], zero: false }] : [])
});
window.PLANT_SPECS = {};
window.PLANT_SPECS.desal = {
  id: 'desal', prefix: 'ds_', color: '#1565c0', workOrders: true,
  title: { fa: 'کارخانه آبشیرین کن ۱', en: 'Desalination Plant 1' },
  subtitle: { fa: 'تولید، کیفیت، تعمیرات، بازدید و دستورکار', en: 'Production, quality, maintenance, inspections & work orders' },
  categories: [
    { key: 'hp', fa: 'پمپ فشار قوی', en: 'High-pressure pump' }, { key: 'ro', fa: 'غشا / RO', en: 'Membrane / RO' },
    { key: 'pre', fa: 'پیش‌تصفیه / فیلتر', en: 'Pre-treatment / filter' }, { key: 'dose', fa: 'تزریق مواد شیمیایی', en: 'Chemical dosing' },
    { key: 'tank', fa: 'مخزن', en: 'Tank' }, { key: 'erd', fa: 'بازیافت انرژی', en: 'Energy recovery' },
    { key: 'elec', fa: 'برق و ابزاردقیق', en: 'Electrical & instruments' }, { key: 'other', fa: 'سایر', en: 'Other' }],
  groups: [
    { id: 'prod', fa: 'تولید و مخازن', en: 'Production & tanks',
      params: [
        P('prod', 'حجم آب تولیدی کارخانه', 'Plant water production', 'm³', 'sum', { dec: 0, min: 0 }),
        P('tkRaw', 'تراز مخزن آب خام', 'Raw water tank level', 'm³', 'avg', { dec: 0, min: 0 }),
        P('tkProd', 'تراز مخزن آب محصول', 'Product water tank level', 'm³', 'avg', { dec: 0, min: 0 }),
        P('outage', 'مدت قطعی برق', 'Power outage duration', 'h', 'sum', { dec: 1, min: 0, max: 24 }),
        P('rec', 'ریکاوری', 'Recovery', '%', 'avg', { dec: 1, min: 0, max: 100 })],
      charts: [
        { title: { fa: 'تولید روزانه', en: 'Production' }, type: 'bar', series: ['prod'] },
        { title: { fa: 'تراز مخازن', en: 'Tank levels' }, series: ['tkRaw', 'tkProd'] },
        { title: { fa: 'ریکاوری', en: 'Recovery' }, series: ['rec'], colors: ['#7c5cff'] },
        { title: { fa: 'مدت قطعی برق (ساعت)', en: 'Power outage (hours)' }, type: 'bar', series: ['outage'], colors: ['#d43439'] }] },
    { id: 'chem', fa: 'تزریق مواد شیمیایی', en: 'Chemical injection',
      params: [
        P('acid', 'تزریق اسید سولفوریک', 'Sulfuric acid injection', 'L', 'sum', { dec: 1, min: 0 }),
        P('smbs', 'تزریق سدیم متابی‌سولفیت', 'Sodium metabisulfite injection', 'L', 'sum', { dec: 1, min: 0 }),
        P('cl', 'تزریق کلر اولیه', 'Primary chlorine injection', 'L', 'sum', { dec: 1, min: 0 }),
        P('clf', 'تزریق کلر نهایی', 'Final chlorine injection', 'L', 'sum', { dec: 1, min: 0 })],
      charts: [{ title: { fa: 'مصرف مواد شیمیایی', en: 'Chemical usage' }, type: 'bar', series: ['acid', 'smbs', 'cl', 'clf'] }] },
    /* ---- ۶ نقطه نمونه‌برداری (روزی یک‌بار، ثبت توسط اپراتور) ---- */
    qgroup('w', 'نقطه ۱ — بعد از چاه‌ها و تزریق کلر، قبل از فیلتراسیون', 'Point 1 — After wells & chlorine dosing, before filtration', 'r', ['ph', 'ec', 'orp', 'tds', 'tss', 'th', 'ntu', 'cl'], {
      cl: 'پس از تزریق کلر اولیه', ntu: 'به‌دلیل فیلتر طبیعی لایه‌های زمین', orp: 'پس از تزریق کلر اولیه' }),
    qgroup('f', 'نقطه ۲ — بعد از فیلتراسیون و تزریق اسید', 'Point 2 — After filtration & acid dosing', 'f', ['ph', 'ec', 'orp', 'tds', 'th', 'ntu', 'cl'], {
      ph: 'به‌دلیل تزریق اسید', orp: 'پس از کلرزنی اولیه جهت گندزدایی', tds: 'بدون تغییر عمده', ntu: 'زلال‌سازی فیزیکی', cl: 'باقی‌مانده از کلرزنی اولیه' }),
    qgroup('s', 'نقطه ۳ — بعد از تزریق SMBS، قبل از کارتریج فیلتر', 'Point 3 — After SMBS dosing, before cartridge filters', 's', ['ph', 'ec', 'orp', 'tds', 'th', 'ntu', 'cl'], {
      orp: 'پس از تزریق متابی‌سولفیت سدیم (SMBS)', cl: 'پس از خنثی‌سازی کلر باید صفر باشد' }),
    qgroup('c', 'نقطه ۴ — بعد از کارتریج فیلتر، قبل از RO', 'Point 4 — After cartridge filters, before RO', 'c', ['ph', 'ec', 'orp', 'tds', 'th', 'ntu', 'cl'], {
      ph: 'تنظیم‌شده جهت جلوگیری از رسوب', orp: 'پس از تزریق SMBS' }),
    qgroup('m', 'نقطه ۵ — بعد از RO (پرمیت)، قبل از آهک و کلر', 'Point 5 — After RO (permeate), before lime & chlorine', 'm', ['ph', 'ec', 'orp', 'tds', 'th', 'ntu', 'cl'], {
      ph: 'کمی اسیدی به‌دلیل حذف بی‌کربنات', th: 'سختی بسیار پایین' },
      [{ key: 'rej', fa: 'درصد حذف نمک (TDS: نقطه ۴ ← نقطه ۵)', en: 'TDS rejection (point 4 → point 5)', unit: '%', dec: 2, fn: b => (b.cTds > 0 && b.mTds != null) ? (b.cTds - b.mTds) / b.cTds * 100 : null }]),
    qgroup('o', 'نقطه ۶ — بعد از کلر نهایی و بستر آهک (خروجی کارخانه)', 'Point 6 — After chlorine & lime dosing (plant output)', 'o', ['ph', 'ec', 'tds', 'th', 'ntu', 'cl'], {
      ph: 'تنظیم‌شده با آهک', th: 'بازیابی سختی جهت تعادل آب', cl: 'تزریق جهت ضدعفونی' }),
    /* ---- عملکرد کارتریج و RO — اختیاری، روزی یک‌بار، بدون حد پیش‌فرض (ورودی تحلیل «سلامت RO و کارتریج») ---- */
    { id: 'perf', fa: 'عملکرد کارتریج و RO (اختیاری — برای تحلیل سلامت)', en: 'Cartridge & RO performance (optional — for health analysis)',
      params: [
        P('cartDp', 'اختلاف فشار کارتریج‌ها (ΔP)', 'Cartridge differential pressure (ΔP)', 'bar', 'avg', { dec: 2, min: 0, note: 'فشار ورودی منهای فشار خروجی کارتریج‌ها' }),
        P('roFeedP', 'فشار خوراک RO', 'RO feed pressure', 'bar', 'avg', { dec: 1, min: 0, note: 'همیشه از یک خط شاخص ثبت شود' }),
        P('roConcP', 'فشار کنسانتره RO', 'RO concentrate pressure', 'bar', 'avg', { dec: 1, min: 0, note: 'همان خط شاخص' }),
        P('roPermQ', 'دبی پرمیت RO', 'RO permeate flow', 'm³/h', 'avg', { dec: 1, min: 0, note: 'همان خط شاخص' }),
        P('roTemp', 'دمای آب خوراک', 'Feed water temperature', '°C', 'avg', { dec: 1, min: 0, max: 60 })],
      charts: [{ title: { fa: 'ΔP کارتریج‌ها', en: 'Cartridge ΔP' }, series: ['cartDp'] }, { title: { fa: 'فشار خوراک و کنسانتره', en: 'Feed & concentrate pressure' }, series: ['roFeedP', 'roConcP'] }] }
  ],
  dashParams: ['prod', 'tkRaw', 'tkProd', 'outage', 'rec', 'acid', 'smbs', 'cl', 'clf', 'mTds', 'mEc', 'oPh', 'oCl'],
  dashCharts: [
    { title: { fa: 'تولید', en: 'Production' }, type: 'bar', series: ['prod'] },
    { title: { fa: 'TDS نقاط ۱، ۳، ۴ و ۵', en: 'TDS points 1, 3, 4, 5' }, series: ['rTds', 'sTds', 'cTds', 'mTds'] }]
};
})();
