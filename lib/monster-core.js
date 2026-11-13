// EDGE Monster Day detector. Research-only; never creates orders.
// Pure signal math so historical tests and live evaluation use the same rules.
const toMinute = (s) => {
  if (typeof s !== 'string' || !/^\d{2}:\d{2}$/.test(s)) return -1;
  const h = Number(s.slice(0, 2)), m = Number(s.slice(3));
  return h < 24 && m < 60 ? h * 60 + m : -1;
};
const med = (items) => {
  if (!items.length) return null;
  const v = [...items].sort((a, b) => a - b);
  return (v[Math.floor((v.length - 1) / 2)] + v[Math.floor(v.length / 2)]) / 2;
};
const round = (n, digits = 3) => Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
const regular = (r) => r && typeof r.date === 'string' && Number.isFinite(toMinute(r.time)) &&
  toMinute(r.time) >= 570 && toMinute(r.time) <= 955 &&
  (toMinute(r.time) - 570) % 5 === 0 &&
  [r.open, r.high, r.low, r.close, r.volume].every(Number.isFinite) &&
  r.high >= Math.max(r.open, r.close) && r.low <= Math.min(r.open, r.close) &&
  r.high >= r.low && r.volume >= 0;
function group(bars) {
  const buckets = new Map();
  for (const b of bars || []) {
    if (!regular(b)) continue;
    if (!buckets.has(b.date)) buckets.set(b.date, new Map());
    buckets.get(b.date).set(b.time, b);
  }
  return new Map([...buckets].map(([date, v]) => [date, [...v.values()].sort((a, b) => a.time.localeCompare(b.time))]));
}
function contiguous(bars, minimum = 1) {
  return bars?.length >= minimum && bars.every((b, j) => toMinute(b.time) === 570 + j * 5);
}
function series(bars) {
  const range = [], volume = [], vwap = [];
  let high = -Infinity, low = Infinity, cumVol = 0, cumTypical = 0;
  for (const b of bars) {
    high = Math.max(high, b.high); low = Math.min(low, b.low);
    cumVol += b.volume;
    cumTypical += b.volume * (b.high + b.low + b.close) / 3;
    range.push(high - low); volume.push(cumVol);
    vwap.push(cumVol > 0 ? cumTypical / cumVol : NaN);
  }
  return { range, volume, vwap };
}
const atTime = j => {
  const n = 570 + 5 * (j + 1);
  return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
};
export const MONSTER_RULES = Object.freeze({
  lookbackSessions: 20, openingRangeMultiplier: 1.5, openingVolumeMultiplier: 1.5,
  openingDirectionalEfficiency: 0.6, expansionRangeMultiplier: 1.25,
  expansionVolumeMultiplier: 1.2, expansionDirectionalEfficiency: 0.35,
  expansionLastBarIndex: 53
});
export function scanMonster({ spy = [], qqq = [], iwm = [], today } = {}) {
  const grouped = group(spy), sessions = [...grouped.keys()].sort();
  const history = sessions.filter(d => d < today).map(d => ({date: d, bars: grouped.get(d)}))
    .filter(x => x.bars.length === 78 && contiguous(x.bars, 78)).slice(-20);
  const current = grouped.get(today) || [];
  const blank = {today, status:'WAITING_FOR_HISTORY', signal:null, metrics:null,
    coverage:{validHistory:history.length, requiredHistory:20, currentBars:current.length}};
  if (history.length < 20) return blank;
  if (!contiguous(current, Math.max(1, current.length))) {
    return {...blank, status:'INCOMPLETE_SPY_BARS'};
  }
  const past = history.map(h => series(h.bars)), v = series(current);
  const medianDaily = med(past.map(p => p.range[77]));
  const median30Range = med(past.map(p => p.range[5]));
  const median30Volume = med(past.map(p => p.volume[5]));
  const start = current[0];
  const last = current.at(-1);
  const qToday = group(qqq).get(today) || [], iToday = group(iwm).get(today) || [];
  const qMap = new Map(qToday.map(b => [b.time, b]));
  const iMap = new Map(iToday.map(b => [b.time, b]));
  const lastIndex = current.length - 1;
  const openingHigh = current.length >= 6 ? Math.max(...current.slice(0,6).map(x => x.high)) : null;
  const openingLow = current.length >= 6 ? Math.min(...current.slice(0,6).map(x => x.low)) : null;
  const metrics = {spyClose:round(last.close,2),vwap:round(v.vwap[lastIndex],2),
    openingHigh:round(openingHigh,2),openingLow:round(openingLow,2),
    openingRange:current.length >= 6 ? round(v.range[5],2) : null,
    medianOpeningRange:round(median30Range,2),
    openingVolumeRatio:current.length>=6 ? round(v.volume[5]/median30Volume,2) : null,
    openingRangeRatio:current.length>=6 ? round(v.range[5]/median30Range,2) : null,
    currentRange:round(v.range[lastIndex],2),
    medianCurrentRange:round(med(past.map(p=>p.range[Math.min(lastIndex,77)])),2),
    currentVolumeRatio:round(v.volume[lastIndex] / med(past.map(p=>p.volume[Math.min(lastIndex,77)])),2),
    baselineMedianDailyRange:round(medianDaily,2), illustrativeUnderlyingStopDistance:round(Math.max(1.5,Math.min(3,0.35*medianDaily)),2),
    mostRecentCandle: last.time, dataFeedAlignment:'SPY/QQQ/IWM' };
  const confirm = (j, dir) => {
    if (!dir) return false;
    const row=current[j],q=qMap.get(row.time),w=iMap.get(row.time);
    const qStart=qMap.get('09:30'),wStart=iMap.get('09:30');
    return !!(q&&w&&qStart&&wStart &&
      dir*(row.close - start.open)>0 &&
      dir*(q.close - qStart.open)>0 &&
      dir*(w.close - wStart.open)>0 &&
      dir*(row.close - v.vwap[j])>0);
  };
  const signalFor = (j, dir, type) => ({
    type, side: dir===1?'BULLISH':'BEARISH', observedAt:atTime(j),
    candleTime:current[j].time, signalPrice:round(current[j].close,2),
    index:j, confidence:type==='SHOCK'?'RARE_OBSERVATION':'UNVALIDATED_EXPANSION',
    note:type==='SHOCK'?'Rare opening shock: only four examples in the 2026 backtest. Not validated.' :
      'Broad expansion signals lost money in the historical holdout. Watch-only.' });
  let signal = null;
  if (current.length >= 6 && median30Range > 0 && median30Volume > 0) {
    const direction = Math.sign(current[5].close-start.open);
    if (v.range[5] >= 1.5*median30Range &&
        v.volume[5] >= 1.5*median30Volume &&
        Math.abs(current[5].close-start.open) >= 0.6*v.range[5] &&
        confirm(5,direction)) signal=signalFor(5,direction,'SHOCK');
  }
  if (!signal && current.length >= 7) {
    for(let j=6;j<=Math.min(53,lastIndex);j++){
      const close=current[j].close;
      const dir=close>openingHigh?1:close<openingLow?-1:0;
      if (!dir || v.range[j] < 1.25*med(past.map(x=>x.range[j])) ||
          v.volume[j] < 1.2*med(past.map(x=>x.volume[j])) ||
          Math.abs(close-start.open) < 0.35*v.range[j] || !confirm(j,dir)) continue;
      signal=signalFor(j,dir,'EXPANSION');
      break;
    }
  }
  const aligned = current.length ? qMap.has(last.time) && iMap.has(last.time) : false;
  return {today, status:signal ? 'SIGNAL_FOUND' : current.length<6?'OPENING_RANGE_BUILDING':
    !aligned?'MISSING_CONFIRMATION_BARS':'WATCHING', signal, metrics,
    coverage:{validHistory:history.length, requiredHistory:20, currentBars:current.length,
      qqqBars:qToday.length, iwmBars:iToday.length}};
}
