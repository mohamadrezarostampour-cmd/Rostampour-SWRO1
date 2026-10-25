/* =========================================================================
   Rostampour SWRO NV — analysis helpers (pure functions, no DOM, no Firebase)
   window.SWRO_HEALTH = { FA, status, worst, spark, rootCause, membrane, ... }
   - status()      value vs. the limits typed in by the admin → bad | warn | ok | none
   - spark()       SVG path for a small trend line
   - rootCause()   probable upstream causes of an out-of-limit parameter (a checklist, never a certainty)
   - membrane()    salt rejection / salt passage / recovery / normalised flow / ΔP trends,
                   CIP timing and cartridge-replacement forecast
   Every number comes from the daily entries of the operator; nothing is read from a sensor.
   ========================================================================= */
(function () {
  'use strict';
  const FA = (v) => String(v).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const toD = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const addD = (iso, n) => new Date(toD(iso) + n * 864e5).toISOString().slice(0, 10);
  const diffD = (a, b) => Math.round((toD(a) - toD(b)) / 864e5);
  const num = (x) => (x === '' || x == null || isNaN(Number(x))) ? null : Number(x);
  const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const r1 = (x, d) => Number(x).toFixed(d == null ? 1 : d);

  /* ---------- limit status ---------- */
  function status(v, lim) {
    if (v == null || !lim || (lim.min == null && lim.max == null)) return 'none';
    if ((lim.max != null && v > lim.max) || (lim.min != null && v < lim.min)) return 'bad';
    const band = (lim.min != null && lim.max != null) ? (lim.max - lim.min) : Math.abs(lim.max != null ? lim.max : lim.min);
    const m = band * 0.1;
    if ((lim.max != null && v > lim.max - m) || (lim.min != null && v < lim.min + m)) return 'warn';
    return 'ok';
  }
  const RANK = { none: 0, ok: 1, warn: 2, bad: 3 };
  const worst = (arr) => arr.reduce((w, s) => RANK[s] > RANK[w] ? s : w, 'none');

  /* ---------- sparkline: values (null = gap) → svg path in a w×h box ---------- */
  function spark(vals, w, h) {
    const pts = vals.map((v, i) => v == null ? null : [i, v]).filter(Boolean);
    if (!pts.length) return { d: '', last: null };
    const lo = Math.min.apply(null, pts.map(p => p[1])), hi = Math.max.apply(null, pts.map(p => p[1]));
    const X = (i) => vals.length > 1 ? i / (vals.length - 1) * w : w / 2;
    const Y = (v) => hi === lo ? h / 2 : h - 1.5 - (v - lo) / (hi - lo) * (h - 3);
    let d = '', pen = false;
    vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; });
    const lp = pts[pts.length - 1];
    return { d, last: [X(lp[0]), Y(lp[1])] };
  }

  /* =====================================================================
     ROOT-CAUSE CHECKLIST
     ctx = { v(k), prev(k,n) → up to n earlier values (no nulls), lim(k) → {min,max}, name(k) → label }
     ===================================================================== */
  const T = (fa, en) => ({ fa, en });
  const C = (fa, en, ev) => ({ fa, en, ev: ev || null });
  const avgPrev = (c, k, n) => { const a = c.prev(k, n || 7); return a.length >= 3 ? mean(a) : null; };
  /* evidence builders — return {fa,en} or null */
  const dosedLow = (k, fa, en) => (c) => { const v = c.v(k), a = avgPrev(c, k); if (v == null || a == null || a <= 0 || v >= 0.6 * a) return null; return T(fa + ' امروز ' + r1(v) + ' لیتر ثبت شده؛ حدود ' + Math.round(v / a * 100) + '٪ میانگین ۷ روز قبل (' + r1(a) + ')', en + ' today ' + r1(v) + ' L — about ' + Math.round(v / a * 100) + '% of the previous 7-day average (' + r1(a) + ')'); };
  const dosedHigh = (k, fa, en) => (c) => { const v = c.v(k), a = avgPrev(c, k); if (v == null || a == null || a <= 0 || v <= 1.4 * a) return null; return T(fa + ' امروز ' + r1(v) + ' لیتر ثبت شده؛ حدود ' + Math.round(v / a * 100) + '٪ میانگین ۷ روز قبل (' + r1(a) + ')', en + ' today ' + r1(v) + ' L — about ' + Math.round(v / a * 100) + '% of the previous 7-day average (' + r1(a) + ')'); };
  const relUp = (k, fa, en, rel) => (c) => { const v = c.v(k), a = avgPrev(c, k); if (v == null || a == null || a <= 0 || v <= a * (1 + (rel || 0.15))) return null; return T(fa + ' افزایش یافته: ' + r1(v, 2) + ' در برابر میانگین ۷ روز قبل ' + r1(a, 2), en + ' has risen: ' + r1(v, 2) + ' vs previous 7-day average ' + r1(a, 2)); };
  const relDown = (k, fa, en, rel) => (c) => { const v = c.v(k), a = avgPrev(c, k); if (v == null || a == null || a <= 0 || v >= a * (1 - (rel || 0.15))) return null; return T(fa + ' کاهش یافته: ' + r1(v, 2) + ' در برابر میانگین ۷ روز قبل ' + r1(a, 2), en + ' has fallen: ' + r1(v, 2) + ' vs previous 7-day average ' + r1(a, 2)); };
  const absUp = (k, fa, en, d) => (c) => { const v = c.v(k), a = avgPrev(c, k); if (v == null || a == null || v < a + d) return null; return T(fa + ' بالا رفته: ' + r1(v, 2) + ' در برابر میانگین ۷ روز قبل ' + r1(a, 2), en + ' went up: ' + r1(v, 2) + ' vs previous 7-day average ' + r1(a, 2)); };
  const absDown = (k, fa, en, d) => (c) => { const v = c.v(k), a = avgPrev(c, k); if (v == null || a == null || v > a - d) return null; return T(fa + ' پایین آمده: ' + r1(v, 2) + ' در برابر میانگین ۷ روز قبل ' + r1(a, 2), en + ' went down: ' + r1(v, 2) + ' vs previous 7-day average ' + r1(a, 2)); };
  const inLimit = (k, fa, en) => (c) => { const v = c.v(k), l = c.lim(k); if (v == null || !l || (l.min == null && l.max == null)) return null; return status(v, l) === 'bad' ? null : T(fa + ' در حد مجاز است (' + r1(v, 2) + ') ← منشأ مشکل پایین‌دست آن نقطه است', en + ' is within limits (' + r1(v, 2) + ') → the cause lies downstream of that point'); };
  const outLimit = (k, fa, en) => (c) => { const v = c.v(k), l = c.lim(k); if (v == null || !l) return null; return status(v, l) === 'bad' ? T(fa + ' هم خارج از حد است (' + r1(v, 2) + ') ← مشکل از بالادست آمده', en + ' is also out of limit (' + r1(v, 2) + ') → the problem comes from upstream') : null; };
  const rejDrop = (c) => { const cT = c.v('cTds'), mT = c.v('mTds'); if (!(cT > 0) || mT == null) return null; const now = (cT - mT) / cT * 100, a = c.prev('rej', 7); if (a.length < 3) return null; const b = mean(a); return b - now >= 0.3 ? T('درصد حذف نمک افت کرده: ' + r1(now, 2) + '٪ در برابر میانگین ۷ روز قبل ' + r1(b, 2) + '٪', 'Salt rejection dropped: ' + r1(now, 2) + '% vs previous 7-day average ' + r1(b, 2) + '%') : null; };
  const lowProd = (c) => { const v = c.v('prod'), a = avgPrev(c, 'prod'); if (v == null || a == null || a <= 0 || v >= 0.85 * a) return null; return T('تولید امروز ' + r1(v, 0) + ' در برابر میانگین ۷ روز قبل ' + r1(a, 0), 'Production today ' + r1(v, 0) + ' vs previous 7-day average ' + r1(a, 0)); };
  const outageToday = (c) => { const v = c.v('outage'); return v != null && v > 0 ? T('قطعی برق امروز ' + r1(v) + ' ساعت ثبت شده', 'Power outage recorded today: ' + r1(v) + ' h') : null; };
  const same = (k) => (c) => null;

  const ORP_CRIT = (c) => (c.v('sCl') > 0.1 || c.v('cCl') > 0.1);   // oxidant that reaches the RO
  const RULES = [
    /* ---- pH ---- */
    { keys: ['fPh', 'sPh', 'cPh'], dir: 'high', causes: [
      C('کاهش یا قطع تزریق اسید سولفوریک', 'Acid dosing reduced or stopped', dosedLow('acid', 'اسید', 'Acid')),
      C('پمپ تزریق اسید، شیر یا خط تزریق دچار خرابی/گرفتگی است یا سطح مخزن اسید پایین است', 'Acid dosing pump / injection valve / line fault, or low acid tank', null),
      C('pH آب ورودی (نقطه ۱) بالا رفته است', 'Inlet pH (point 1) has risen', absUp('rPh', 'pH نقطه ۱', 'Point 1 pH', 0.2)),
      C('خطای کالیبراسیون pH‌متر یا نمونه‌گیری', 'pH meter calibration or sampling error', null)] },
    { keys: ['fPh', 'sPh', 'cPh'], dir: 'low', causes: [
      C('تزریق اسید بیش از حد', 'Acid over-dosed', dosedHigh('acid', 'اسید', 'Acid')),
      C('تنظیم دور/کورس پمپ اسید تغییر کرده یا کنترل تزریق متناسب با دبی درست کار نمی‌کند', 'Acid pump stroke / speed changed, or flow-proportional control fault', null),
      C('pH آب ورودی (نقطه ۱) پایین آمده است', 'Inlet pH (point 1) has fallen', absDown('rPh', 'pH نقطه ۱', 'Point 1 pH', 0.2)),
      C('کاهش دبی خوراک در حالی که تزریق ثابت مانده است', 'Feed flow fell while dosing stayed constant', lowProd)] },
    { keys: ['rPh'], dir: 'any', causes: [
      C('تغییر ترکیب یا تعداد چاه‌های در مدار', 'Change in the wells in service / well mix', null),
      C('تزریق کلر اولیه (هیپوکلریت قلیایی) زیاد یا کم شده', 'Primary chlorine dosing changed (hypochlorite is alkaline)', (c) => dosedHigh('cl', 'کلر اولیه', 'Primary chlorine')(c) || dosedLow('cl', 'کلر اولیه', 'Primary chlorine')(c)),
      C('خطای pH‌متر', 'pH meter error', null)] },
    { keys: ['mPh'], dir: 'high', causes: [
      C('pH خوراک RO (نقطه ۴) بالا رفته (کم‌شدن اسید)', 'RO feed pH (point 4) is higher (less acid)', absUp('cPh', 'pH نقطه ۴', 'Point 4 pH', 0.2)),
      C('افت حذف نمک غشا', 'Falling membrane salt rejection', rejDrop)] },
    { keys: ['mPh'], dir: 'low', causes: [
      C('pH خوراک RO (نقطه ۴) پایین‌تر شده (اسید زیاد)', 'RO feed pH (point 4) is lower (acid excess)', absDown('cPh', 'pH نقطه ۴', 'Point 4 pH', 0.2)),
      C('کاهش دبی/غلظت بی‌کربنات خوراک', 'Lower bicarbonate in the feed', null)] },
    { keys: ['oPh'], dir: 'low', causes: [
      C('بستر سنگ آهک تمام‌شده یا کانال‌شده است (pH خروجی ≈ pH پرمیت)', 'Limestone bed exhausted or channelled (output pH ≈ permeate pH)', (c) => { const o = c.v('oPh'), m = c.v('mPh'); return o != null && m != null && Math.abs(o - m) < 0.4 ? T('pH خروجی ' + r1(o, 2) + ' تقریباً برابر pH پرمیت ' + r1(m, 2) + ' است', 'Output pH ' + r1(o, 2) + ' is close to permeate pH ' + r1(m, 2)) : null; }),
      C('زمان ماند آب روی بستر کم است (تراز مخزن آب تولیدی پایین)', 'Short contact time on the bed (low product tank level)', relDown('tkProd', 'تراز مخزن آب تولیدی', 'Product tank level', 0.3)),
      C('pH پرمیت پایین است', 'Permeate pH is low', (c) => inLimit('mPh', 'x', 'x') && null)] },
    { keys: ['oPh'], dir: 'high', causes: [
      C('تزریق کلر نهایی (هیپوکلریت) زیاد است', 'Final chlorine (hypochlorite) over-dosed', dosedHigh('clf', 'کلر نهایی', 'Final chlorine')),
      C('pH پرمیت بالا رفته', 'Permeate pH has risen', absUp('mPh', 'pH پرمیت', 'Permeate pH', 0.3))] },
    /* ---- oxidant / ORP / chlorine ---- */
    { keys: ['sOrp', 'cOrp', 'sCl', 'cCl'], dir: 'high', crit: ORP_CRIT, causes: [
      C('کاهش یا قطع تزریق SMBS — کلر خنثی نمی‌شود', 'SMBS dosing reduced or stopped — chlorine not neutralised', dosedLow('smbs', 'SMBS', 'SMBS')),
      C('تزریق کلر اولیه زیاد شده و SMBS کافی نیست', 'Primary chlorine increased and SMBS is insufficient', dosedHigh('cl', 'کلر اولیه', 'Primary chlorine')),
      C('پمپ SMBS، شیر یا خط تزریق خراب/گرفته است یا مخزن SMBS خالی شده', 'SMBS pump / valve / line fault, or SMBS tank empty', null),
      C('محلول SMBS قدیمی یا ضعیف شده است', 'SMBS solution is old / weak', null),
      C('پروب ORP نیاز به کالیبراسیون یا تمیزکاری دارد', 'ORP probe needs calibration or cleaning', null)] },
    { keys: ['sOrp', 'cOrp'], dir: 'low', causes: [
      C('تزریق SMBS بیش از حد', 'SMBS over-dosed', dosedHigh('smbs', 'SMBS', 'SMBS')),
      C('تنظیم پمپ SMBS یا کنترل تزریق تغییر کرده است', 'SMBS pump setting / control changed', null)] },
    { keys: ['rOrp', 'fOrp', 'rCl', 'fCl'], dir: 'low', causes: [
      C('کاهش یا قطع تزریق کلر اولیه', 'Primary chlorine dosing reduced or stopped', dosedLow('cl', 'کلر اولیه', 'Primary chlorine')),
      C('پمپ تزریق کلر، خط یا مخزن کلر مشکل دارد', 'Chlorine pump / line / tank fault', null),
      C('افزایش مصرف کلر توسط آب (مواد آلی، آهن، منگنز، سولفید) به‌دلیل تغییر چاه‌ها', 'Higher chlorine demand of the water (organics, Fe, Mn, sulfide) from a change in wells', null)] },
    { keys: ['rOrp', 'fOrp', 'rCl', 'fCl'], dir: 'high', causes: [
      C('تزریق کلر اولیه بیش از حد', 'Primary chlorine over-dosed', dosedHigh('cl', 'کلر اولیه', 'Primary chlorine')),
      C('کاهش دبی ورودی در حالی که تزریق ثابت است', 'Inlet flow fell while dosing stayed constant', lowProd)] },
    { keys: ['mCl'], dir: 'high', causes: [
      C('عبور اکسیدان از غشا — احتمال آسیب اکسیداسیون غشا؛ نقطه ۳ و ۴ را بررسی کنید', 'Oxidant passing the membrane — possible oxidation damage; check points 3 and 4', (c) => (c.v('cCl') > 0 ? T('کلر آزاد نقطه ۴ برابر ' + r1(c.v('cCl'), 2) + ' است', 'Free Cl at point 4 is ' + r1(c.v('cCl'), 2)) : null)),
      C('آلودگی ظرف/نقطه نمونه‌گیری یا خطای دستگاه', 'Sample container / point contamination or instrument error', null)] },
    { keys: ['oCl'], dir: 'low', causes: [
      C('کاهش یا قطع تزریق کلر نهایی', 'Final chlorine dosing reduced or stopped', dosedLow('clf', 'کلر نهایی', 'Final chlorine')),
      C('پمپ/خط/مخزن کلر نهایی مشکل دارد', 'Final chlorine pump / line / tank fault', null),
      C('افزایش دبی ارسال (رقیق‌شدن) یا مصرف کلر در مخزن', 'Higher transfer flow (dilution) or chlorine consumed in the tank', null)] },
    { keys: ['oCl'], dir: 'high', causes: [
      C('تزریق کلر نهایی بیش از حد', 'Final chlorine over-dosed', dosedHigh('clf', 'کلر نهایی', 'Final chlorine')),
      C('کاهش دبی ارسال در حالی که تزریق ثابت است', 'Transfer flow fell while dosing stayed constant', lowProd)] },
    /* ---- turbidity / solids ---- */
    { keys: ['rNtu', 'rTss'], dir: 'high', causes: [
      C('چاه‌ها ماسه یا ذرات می‌دهند (جدار/صافی چاه یا پمپ چاه)', 'Wells producing sand / fines (screen / casing / well pump)', relUp('rNtu', 'NTU نقطه ۱', 'Point 1 NTU', 0.3)),
      C('راه‌اندازی مجدد چاهی که مدتی خاموش بوده است', 'A well that was idle has been restarted', null)] },
    { keys: ['fNtu'], dir: 'high', causes: [
      C('کدورت ورودی بالا آمده است', 'Inlet turbidity has risen', outLimit('rNtu', 'NTU نقطه ۱', 'Point 1 NTU')),
      C('فیلتراسیون‌ها نیاز به شست‌وشوی معکوس دارند یا مدیا فرسوده/کانال‌شده است', 'Filtration needs backwash, or media is exhausted / channelled', inLimit('rNtu', 'NTU نقطه ۱', 'Point 1 NTU')),
      C('تعداد فیلتراسیون در مدار کم است و سرعت عبور آب زیاد شده', 'Fewer filtrations in service — higher velocity', null)] },
    { keys: ['sNtu'], dir: 'high', causes: [
      C('کدورت پیش از تزریق SMBS (نقطه ۲) بالا بوده است', 'Turbidity was already high at point 2', outLimit('fNtu', 'NTU نقطه ۲', 'Point 2 NTU')),
      C('آلودگی یا رسوب در مخزن/خط محلول SMBS', 'Contamination / sediment in the SMBS tank or line', inLimit('fNtu', 'NTU نقطه ۲', 'Point 2 NTU'))] },
    { keys: ['cNtu'], dir: 'high', crit: () => true, causes: [
      C('کدورت پیش از کارتریج (نقطه ۳) بالا بوده است', 'Turbidity was already high at point 3', outLimit('sNtu', 'NTU نقطه ۳', 'Point 3 NTU')),
      C('کارتریج پاره/کنارگذر شده، اورینگ یا قاب کارتریج نشتی دارد، یا کارتریج‌ها بیش از زمان مقرر مانده‌اند', 'Cartridge ruptured / bypassed, O-ring or housing leaking, or cartridges left too long', inLimit('sNtu', 'NTU نقطه ۳', 'Point 3 NTU')),
      C('اختلاف فشار کارتریج‌ها بالا رفته است', 'Cartridge ΔP has risen', relUp('cartDp', 'ΔP کارتریج', 'Cartridge ΔP', 0.2))] },
    { keys: ['mNtu'], dir: 'high', causes: [
      C('نشتی اورینگ/اینترکانکتور غشا یا ترک در ممبران', 'Membrane O-ring / interconnector leak or membrane damage', rejDrop),
      C('آلودگی در خط پرمیت یا نقطه نمونه‌گیری', 'Contamination in the permeate line or sample point', null)] },
    { keys: ['oNtu'], dir: 'high', causes: [
      C('ذرات بستر سنگ آهک یا رسوب کف مخزن آب تولیدی', 'Limestone fines or sediment on the product tank floor', (c) => (c.v('mNtu') != null && c.lim('mNtu') && status(c.v('mNtu'), c.lim('mNtu')) !== 'bad' ? T('NTU پرمیت عادی است (' + r1(c.v('mNtu'), 2) + ') ← منشأ بعد از RO است', 'Permeate NTU is normal (' + r1(c.v('mNtu'), 2) + ') → the source is after the RO') : null)),
      C('نیاز به شست‌وشوی مخزن یا بستر آهک', 'Tank / bed needs cleaning', null)] },
    /* ---- salinity / hardness ---- */
    { keys: ['rTds', 'rEc'], dir: 'high', causes: [
      C('شوری چاه‌ها بالا رفته (افت سطح آب، نفوذ آب شور، تغییر چاه‌های در مدار)', 'Wells salinity increased (drawdown, saline intrusion, change of wells in service)', (c) => relUp('rTds', 'TDS نقطه ۱', 'Point 1 TDS', 0.08)(c) || relUp('rEc', 'EC نقطه ۱', 'Point 1 EC', 0.08)(c)),
      C('خطای کالیبراسیون TDS‌متر/EC‌متر', 'TDS / EC meter calibration error', null)] },
    { keys: ['fTds', 'fEc', 'sTds', 'sEc', 'cTds', 'cEc'], dir: 'high', causes: [
      C('شوری ورودی (نقطه ۱) بالا رفته', 'Inlet salinity (point 1) has risen', (c) => relUp('rTds', 'TDS نقطه ۱', 'Point 1 TDS', 0.08)(c) || outLimit('rTds', 'TDS نقطه ۱', 'Point 1 TDS')(c)),
      C('خطای دستگاه یا نمونه‌گیری در این نقطه', 'Instrument or sampling error at this point', (c) => { const a = c.v('rTds'), b = c.v('cTds'); return a != null && b != null && a > 0 && Math.abs(b - a) / a > 0.15 ? T('TDS نقطه ۱ و ۴ بیش از ۱۵٪ اختلاف دارند (' + r1(a, 0) + ' / ' + r1(b, 0) + ') در حالی که نباید تغییر عمده‌ای کند', 'Point 1 and 4 TDS differ by >15% (' + r1(a, 0) + ' / ' + r1(b, 0) + ') though little change is expected') : null; })] },
    { keys: ['mTds', 'mEc'], dir: 'high', causes: [
      C('افت حذف نمک غشا (فولینگ، رسوب، آسیب اکسیداسیون یا پیری)', 'Membrane salt rejection falling (fouling, scaling, oxidation damage or ageing)', rejDrop),
      C('شوری خوراک RO (نقطه ۴) بالا رفته است', 'RO feed salinity (point 4) has risen', relUp('cTds', 'TDS نقطه ۴', 'Point 4 TDS', 0.08)),
      C('ریکاوری زیاد است', 'Recovery is high', relUp('rec', 'ریکاوری', 'Recovery', 0.05)),
      C('نشتی اورینگ/اینترکانکتور یا ترک ممبران', 'O-ring / interconnector leak or damaged element', null),
      C('اکسیدان (کلر) بدون خنثی‌سازی به غشا رسیده است', 'Un-neutralised oxidant reached the membrane', (c) => (c.v('cCl') > 0.05 || c.v('cOrp') != null && c.lim('cOrp') && status(c.v('cOrp'), c.lim('cOrp')) === 'bad') ? T('کلر آزاد/ORP نقطه ۴ نشان‌دهنده اکسیدان است', 'Free Cl / ORP at point 4 indicates oxidant') : null)] },
    { keys: ['oTds', 'oEc'], dir: 'high', causes: [
      C('TDS پرمیت (نقطه ۵) بالا رفته است', 'Permeate TDS (point 5) has risen', outLimit('mTds', 'TDS نقطه ۵', 'Point 5 TDS')),
      C('انحلال بیش از حد بستر آهک (pH پایین پرمیت)', 'Excess limestone dissolution (low permeate pH)', (c) => { const o = c.v('oTds'), m = c.v('mTds'); return o != null && m != null && o - m > 40 ? T('TDS خروجی ' + r1(o, 0) + ' و پرمیت ' + r1(m, 0) + ' (افزایش ' + r1(o - m, 0) + ')', 'Output TDS ' + r1(o, 0) + ' vs permeate ' + r1(m, 0) + ' (+' + r1(o - m, 0) + ')') : null; })] },
    { keys: ['rTh'], dir: 'high', causes: [C('تغییر ترکیب چاه‌ها (سختی بیشتر)', 'Change in well mix (harder water)', relUp('rTh', 'سختی نقطه ۱', 'Point 1 TH', 0.1))] },
    { keys: ['mTh'], dir: 'high', causes: [
      C('افت حذف نمک/سختی غشا', 'Membrane rejection falling', rejDrop),
      C('رسوب‌دهی (scaling) روی غشا — pH یا ریکاوری را بررسی کنید', 'Scaling on the membrane — check pH and recovery', null)] },
    { keys: ['oTh'], dir: 'low', causes: [
      C('بستر سنگ آهک تمام‌شده/نیاز به شارژ مجدد', 'Limestone bed depleted — needs top-up', (c) => { const o = c.v('oTh'), m = c.v('mTh'); return o != null && m != null && o - m < 5 ? T('سختی خروجی ' + r1(o, 1) + ' تقریباً برابر پرمیت ' + r1(m, 1) + ' است', 'Output TH ' + r1(o, 1) + ' is close to permeate TH ' + r1(m, 1)) : null; }),
      C('زمان ماند آب روی بستر کم است', 'Short contact time on the bed', relDown('tkProd', 'تراز مخزن آب تولیدی', 'Product tank level', 0.3))] },
    { keys: ['oTh'], dir: 'high', causes: [
      C('سختی پرمیت بالا رفته', 'Permeate hardness has risen', outLimit('mTh', 'سختی نقطه ۵', 'Point 5 TH')),
      C('انحلال زیاد بستر آهک', 'High limestone dissolution', absDown('oPh', 'pH خروجی', 'Output pH', 0.3))] },
    /* ---- operations ---- */
    { keys: ['rec'], dir: 'low', causes: [
      C('افت عملکرد غشا (فولینگ/رسوب): بخش «سلامت RO و کارتریج» را ببینید', 'Membrane fouling / scaling — see the RO & cartridge health page', rejDrop),
      C('پمپ فشار قوی یا پمپ خوراک ضعیف شده است', 'HP pump or feed pump weak', lowProd),
      C('تنظیم شیر کنسانتره تغییر کرده است', 'Concentrate valve setting changed', null),
      C('تعداد خطوط RO در مدار کم شده', 'Fewer RO trains in service', null)] },
    { keys: ['rec'], dir: 'high', causes: [
      C('شیر کنسانتره بیش از حد بسته شده — خطر رسوب', 'Concentrate valve throttled too far — scaling risk', null),
      C('افت حذف نمک (غشا) همراه با ریکاوری بالا', 'Falling rejection together with high recovery', rejDrop)] },
    { keys: ['prod'], dir: 'low', causes: [
      C('قطعی برق', 'Power outage', outageToday),
      C('تراز مخزن آب خام پایین است (کمبود خوراک)', 'Raw tank level low (feed shortage)', relDown('tkRaw', 'تراز مخزن آب خام', 'Raw tank level', 0.25)),
      C('ریکاوری کم شده', 'Recovery has fallen', relDown('rec', 'ریکاوری', 'Recovery', 0.05)),
      C('خروج پمپ/خط RO/چاه از مدار (شبیه‌ساز PFD را ببینید)', 'A pump / RO train / well is out of service (see the PFD simulator)', null),
      C('افت عملکرد غشا یا گرفتگی کارتریج‌ها', 'Membrane fouling or cartridge clogging', rejDrop)] },
    { keys: ['tkRaw'], dir: 'low', causes: [
      C('دبی چاه‌ها کم شده یا چاهی خاموش است', 'Well output decreased or a well is off', null),
      C('برداشت پمپ‌های خوراک بیشتر از ورودی است', 'Feed pumps draw more than the inflow', relUp('prod', 'تولید', 'Production', 0.1)),
      C('قطعی برق', 'Power outage', outageToday)] },
    { keys: ['tkRaw'], dir: 'high', causes: [
      C('پمپ‌های خوراک خاموش یا تولید کم شده (خطر سرریز)', 'Feed pumps off / production low (overflow risk)', lowProd)] },
    { keys: ['tkProd'], dir: 'low', causes: [
      C('تولید کمتر از برداشت پمپ‌های ارسال است', 'Production lower than the transfer pumps draw', lowProd),
      C('قطعی برق یا خروج RO از مدار', 'Power outage or RO out of service', outageToday)] },
    { keys: ['tkProd'], dir: 'high', causes: [C('برداشت/ارسال کم شده یا پمپ ارسال خاموش است', 'Transfer pumping reduced or a pump is off', null)] },
    { keys: ['outage'], dir: 'high', causes: [
      C('اختلال شبکه برق — وضعیت ژنراتور و تابلوی برق را بررسی کنید', 'Grid disturbance — check generator and switchgear', relUp('outage', 'مدت قطعی', 'Outage hours', 0.2))] },
    { keys: ['acid', 'smbs', 'cl', 'clf'], dir: 'low', causes: [
      C('تنظیم پمپ کاهش یافته یا پمپ متوقف شده', 'Pump setting reduced or pump stopped', null),
      C('مخزن مواد خالی یا گرفتگی خط', 'Chemical tank empty or line blocked', null),
      C('تولید/دبی کم شده و تزریق متناسب کم شده است', 'Flow fell so proportional dosing fell', lowProd)] },
    { keys: ['acid', 'smbs', 'cl', 'clf'], dir: 'high', causes: [
      C('تنظیم پمپ افزایش یافته', 'Pump setting increased', null),
      C('نشتی/سیفون شدن مخزن یا خطای قرائت', 'Tank siphoning / leak or reading error', null)] }
  ];

  function rootCause(ctx) {
    const out = [];
    (ctx.keys || []).forEach(k => {
      const v = ctx.v(k), l = ctx.lim(k); if (v == null || !l) return;
      const dir = (l.max != null && v > l.max) ? 'high' : (l.min != null && v < l.min) ? 'low' : null;
      if (!dir) return;
      let causes = [], sev = 'warn';
      RULES.forEach(r => {
        if (r.keys.indexOf(k) < 0 || !(r.dir === 'any' || r.dir === dir)) return;
        r.causes.forEach(c => { let ev = null; try { ev = c.ev ? c.ev(ctx) : null; } catch (e) { ev = null; } causes.push({ fa: c.fa, en: c.en, ev, hot: !!ev }); });
        if (r.crit && r.crit(ctx)) sev = 'crit';
      });
      if (!causes.length) causes = [{ fa: 'روند ۷ روز اخیر این پارامتر و پارامترهای نقطه‌های قبلی را بررسی کنید؛ برای این پارامتر قاعده خاصی تعریف نشده است.', en: 'Check this parameter’s 7-day trend and the upstream points; no specific rule is defined for it.', ev: null, hot: false }];
      causes.sort((a, b) => (b.hot ? 1 : 0) - (a.hot ? 1 : 0));
      out.push({ key: k, dir, v, lim: l, sev, causes });
    });
    out.sort((a, b) => (b.sev === 'crit' ? 1 : 0) - (a.sev === 'crit' ? 1 : 0));
    return out;
  }

  /* =====================================================================
     RO MEMBRANE & CARTRIDGE HEALTH
     o = { dm:{date:{values}}, end:'YYYY-MM-DD', cfg:{baselineDate,lastCip,lastCart,th:{sp,npf,dp,cart}}, lim(k), span:60 }
     th defaults (general manufacturer cleaning guidance — editable by the admin):
        sp   salt passage rise  ≥ 10 %   npf  normalised permeate flow loss ≥ 10 %
        dp   membrane ΔP rise   ≥ 15 %   cart cartridge ΔP rise ≥ 1.0 bar above the clean value
     ===================================================================== */
  const TH_DEF = { sp: 10, npf: 10, dp: 15, cart: 1.0 };
  function membrane(o) {
    const th = Object.assign({}, TH_DEF, (o.cfg && o.cfg.th) || {}), cfg = o.cfg || {}, span = o.span || 60, end = o.end;
    const dm = o.dm || {}, dates = Object.keys(dm).sort();
    const val = (d, k) => { const r = dm[d]; return r && r.values ? num(r.values[k]) : null; };
    const M = {
      rej: (d) => { const c = val(d, 'cTds'), m = val(d, 'mTds'); if (c > 0 && m != null) return (c - m) / c * 100; const ce = val(d, 'cEc'), me = val(d, 'mEc'); return (ce > 0 && me != null) ? (ce - me) / ce * 100 : null; },
      sp: (d) => { const r = M.rej(d); return r == null ? null : 100 - r; },
      rec: (d) => val(d, 'rec'),
      dpm: (d) => { const a = val(d, 'roFeedP'), b = val(d, 'roConcP'); return (a != null && b != null && a > b) ? a - b : null; },
      cdp: (d) => val(d, 'cartDp'),
      npf: (d) => {   /* normalised permeate flow (raw index; relative to baseline) */
        const Q = val(d, 'roPermQ'), Tm = val(d, 'roTemp'), Pf = val(d, 'roFeedP'), Pc = val(d, 'roConcP'), Cf = val(d, 'cTds'), Cp = val(d, 'mTds'), Y = (val(d, 'rec') || 0) / 100;
        if (Q == null || Tm == null || Pf == null || Pc == null || !(Cf > 0) || Cp == null || !(Y > 0 && Y < 1) || Q <= 0) return null;
        const R = Math.min(Math.max((Cf - Cp) / Cf, 0), 0.9999), CF = (1 - (1 - R) * Y) / (1 - Y), Cavg = (Cf + Cf * CF) / 2;
        const ndp = Pf - (Pf - Pc) / 2 - 0.0007 * (Cavg - Cp);    /* osmotic pressure ≈ 0.0007 bar per ppm TDS */
        if (ndp <= 0) return null;
        const tcf = Math.exp((Tm > 25 ? 3020 : 2640) * (1 / 298.15 - 1 / (273.15 + Tm)));
        return Q / tcf / ndp;
      }
    };
    const all = (f) => dates.map(d => ({ d, v: f(d) })).filter(x => x.v != null);
    const baseOf = (pts, from) => { const p = from ? pts.filter(x => x.d >= from) : pts; const b = p.slice(0, 5); return b.length >= 2 ? { v: mean(b.map(x => x.v)), n: b.length, from: b[0].d } : null; };
    const nowOf = (pts) => { const w = pts.filter(x => diffD(end, x.d) <= 7 && diffD(end, x.d) >= 0).slice(-3); return w.length ? mean(w.map(x => x.v)) : null; };
    const slopeOf = (pts) => {   /* least squares over the last 21 days, units per day */
      const w = pts.filter(x => diffD(end, x.d) <= 21 && diffD(end, x.d) >= 0); if (w.length < 5) return null;
      const xs = w.map(x => -diffD(end, x.d)), ys = w.map(x => x.v), mx = mean(xs), my = mean(ys);
      let sxx = 0, sxy = 0; xs.forEach((x, i) => { sxx += (x - mx) * (x - mx); sxy += (x - mx) * (ys[i] - my); });
      return sxx > 0 ? sxy / sxx : null;
    };
    const days = []; for (let i = span - 1; i >= 0; i--) days.push(addD(end, -i));
    const ser = (f, scale) => days.map(d => { const x = f(d); return x == null ? null : (scale ? scale(x) : x); });
    const need = { sp: ['cTds', 'mTds'], npf: ['roPermQ', 'roTemp', 'roFeedP', 'roConcP', 'rec', 'cTds', 'mTds'], dp: ['roFeedP', 'roConcP'], cart: ['cartDp'] };
    const missingOf = (id) => need[id].filter(k => !dates.some(d => val(d, k) != null));

    /* each indicator: change relative to its baseline vs. the cleaning threshold */
    const ind = (id, f, kind, thr, fromBase) => {
      const pts = all(f), base = baseOf(pts, fromBase), now = nowOf(pts), r = { id, thr, missing: missingOf(id), n: pts.length, base: base ? base.v : null, baseN: base ? base.n : 0, baseFrom: base ? base.from : null, now, level: 'na', change: null, progress: null, daysTo: null, slope: null };
      if (!base || now == null || !base.v) return r;
      r.change = kind === 'rise' ? (now / base.v - 1) * 100 : kind === 'loss' ? (1 - now / base.v) * 100 : now - base.v;   /* % or bar */
      r.progress = Math.max(0, r.change) / thr * 100;
      r.level = r.progress >= 100 ? 'act' : r.progress >= 50 ? 'watch' : 'ok';
      const s = slopeOf(pts); r.slope = s;
      /* days until the threshold is reached (worsening direction only) */
      const target = kind === 'rise' ? base.v * (1 + thr / 100) : kind === 'loss' ? base.v * (1 - thr / 100) : base.v + thr;
      const worsening = kind === 'loss' ? (s != null && s < 0) : (s != null && s > 0);
      if (worsening && r.progress < 100) { const dd = (target - now) / s; if (isFinite(dd) && dd >= 0) r.daysTo = dd > 365 ? null : dd; }
      if (r.daysTo != null && r.daysTo <= 30 && r.level === 'ok') r.level = 'watch';
      return r;
    };
    const from = cfg.baselineDate || null;
    const sp = ind('sp', M.sp, 'rise', th.sp, from);
    const npfPts = all(M.npf), npfBase = baseOf(npfPts, from);
    const npf = ind('npf', M.npf, 'loss', th.npf, from);
    const dp = ind('dp', M.dpm, 'rise', th.dp, from);
    /* cartridge: clean value is taken after the last cartridge change when it is known */
    const cartLim = o.lim ? o.lim('cartDp') : null;
    const cartPts = all(M.cdp), cartBase = baseOf(cartPts, cfg.lastCart || null), cartNow = nowOf(cartPts);
    const cart = { id: 'cart', thr: th.cart, missing: missingOf('cart'), n: cartPts.length, base: cartBase ? cartBase.v : null, baseN: cartBase ? cartBase.n : 0, baseFrom: cartBase ? cartBase.from : null, now: cartNow, level: 'na', change: null, progress: null, daysTo: null, slope: null, target: null, byLimit: false };
    if (cartBase && cartNow != null) {
      const byLimit = !!(cartLim && cartLim.max != null);
      cart.byLimit = byLimit; cart.target = byLimit ? cartLim.max : cartBase.v + th.cart;
      cart.change = cartNow - cartBase.v; cart.progress = Math.max(0, cartNow - cartBase.v) / Math.max(cart.target - cartBase.v, 1e-9) * 100;
      cart.level = cart.progress >= 100 ? 'act' : cart.progress >= 50 ? 'watch' : 'ok';
      const cp = cfg.lastCart ? cartPts.filter(x => x.d >= cfg.lastCart) : cartPts, s = slopeOf(cp); cart.slope = s;
      if (s != null && s > 0 && cart.progress < 100) { const dd = (cart.target - cartNow) / s; if (isFinite(dd) && dd >= 0 && dd <= 365) cart.daysTo = dd; }
      if (cart.daysTo != null && cart.daysTo <= 14 && cart.level === 'ok') cart.level = 'watch';
    }
    /* recovery / rejection (plain trends, no threshold of their own) */
    const rejPts = all(M.rej), recPts = all(M.rec);
    const trend = (pts) => { const s = slopeOf(pts), now = nowOf(pts); return { now, slope: s, n: pts.length }; };
    /* CIP advice */
    const ci = [sp, npf, dp].filter(x => x.level !== 'na');
    let cip;
    if (!ci.length) cip = { kind: 'nodata' };
    else if (ci.some(x => x.level === 'act')) cip = { kind: 'now', by: ci.filter(x => x.level === 'act').map(x => x.id) };
    else {
      const soon = ci.filter(x => x.daysTo != null).sort((a, b) => a.daysTo - b.daysTo)[0];
      cip = soon ? { kind: 'plan', days: Math.ceil(soon.daysTo), date: addD(end, Math.ceil(soon.daysTo)), by: soon.id } : (ci.some(x => x.level === 'watch') ? { kind: 'watch' } : { kind: 'ok' });
    }
    const cartAdvice = cart.level === 'na' ? { kind: 'nodata' } : cart.level === 'act' ? { kind: 'now' } : cart.daysTo != null ? { kind: 'plan', days: Math.ceil(cart.daysTo), date: addD(end, Math.ceil(cart.daysTo)) } : { kind: cart.level === 'watch' ? 'watch' : 'ok' };
    return {
      th, days, series: { rej: ser(M.rej), sp: ser(M.sp), rec: ser(M.rec), dpm: ser(M.dpm), cdp: ser(M.cdp), npf: ser(M.npf, npfBase ? (x) => x / npfBase.v * 100 : () => null) },
      sp, npf, dp, cart, rej: trend(rejPts), rec: trend(recPts), cip, cartAdvice,
      sinceCip: cfg.lastCip ? diffD(end, cfg.lastCip) : null, sinceCart: cfg.lastCart ? diffD(end, cfg.lastCart) : null
    };
  }

  window.SWRO_HEALTH = { FA, TH_DEF, status, worst, spark, rootCause, membrane, addD, diffD };
})();
