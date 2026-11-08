// EDGE private market-data adapter (Cloudflare Pages Functions).
// Read-only. Never places orders. Do not commit provider keys.
const OUT_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow'
};
function result(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: OUT_HEADERS});
}
const toET = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
function easternParts(date) {
  const parts = Object.fromEntries(toET.formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return {date: parts.year+'-'+parts.month+'-'+parts.day, time: parts.hour+':'+parts.minute};
}
function normalizeRow(raw, kind) {
  const time = kind === 'alpaca' ? raw.t : raw.time;
  let stamp = null;
  if (kind === 'alpaca') {
    const d = new Date(time);
    if (!Number.isFinite(d.getTime())) return null;
    stamp = easternParts(d);
  } else {
    // Tradier time sales are expressed in US Eastern for this endpoint.
    const m = String(time || '').match(/^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d)/);
    if (!m) return null;
    stamp = {date: m[1], time: m[2]};
  }
  const o = Number(kind === 'alpaca' ? raw.o : raw.open), h = Number(kind === 'alpaca' ? raw.h : raw.high);
  const l = Number(kind === 'alpaca' ? raw.l : raw.low), c = Number(kind === 'alpaca' ? raw.c : raw.close);
  const v = Number(kind === 'alpaca' ? raw.v : raw.volume);
  if (![o,h,l,c].every(n => Number.isFinite(n) && n > 0) || h < Math.max(o,c,l) || l > Math.min(o,c,h)) return null;
  if (!/^\d\d:[0-5]\d$/.test(stamp.time) || Number(stamp.time.slice(3)) % 5 !== 0) return null;
  return {...stamp, open:o, high:h, low:l, close:c, volume:Number.isFinite(v) && v >= 0 ? v : null};
}
function normalizeRows(source, kind) {
  const rows = Array.isArray(source) ? source : source && typeof source === 'object' ? [source] : [];
  const uniq = new Map();
  for (const raw of rows) {
    const parsed = normalizeRow(raw, kind);
    if (parsed) uniq.set(parsed.date+' '+parsed.time, parsed);
  }
  return [...uniq.values()].sort((a,b) => (a.date+' '+a.time).localeCompare(b.date+' '+b.time)).slice(-2600);
}
async function readJson(url, headers) {
  const response = await fetch(url, {method:'GET', headers, cache:'no-store'});
  let payload;
  try { payload = await response.json(); } catch { throw new Error('Data provider returned a non-JSON response.'); }
  if (!response.ok) {
    if ([401,403].includes(response.status)) throw new Error('Broker market-data credentials are invalid or missing required permissions.');
    if (response.status === 429) throw new Error('Market-data provider rate limit reached; try again shortly.');
    throw new Error('Market-data provider returned HTTP '+response.status+'.');
  }
  return payload;
}
function someDaysAgo(n) { const d=new Date(Date.now()-n*86400000); return d.toISOString().slice(0,10); }
async function alpaca(env) {
  const url = new URL('https://data.alpaca.markets/v2/stocks/SPY/bars');
  url.searchParams.set('timeframe','5Min');
  url.searchParams.set('start', someDaysAgo(9));
  url.searchParams.set('end', new Date().toISOString());
  url.searchParams.set('limit','10000');
  url.searchParams.set('adjustment','raw');
  url.searchParams.set('feed','iex');
  const body = await readJson(url.toString(), {
    'APCA-API-KEY-ID':env.ALPACA_KEY_ID,
    'APCA-API-SECRET-KEY':env.ALPACA_SECRET_KEY,
    'accept':'application/json'
  });
  return {bars:normalizeRows(body.bars, 'alpaca'),provider:'Alpaca Basic',coverage:'IEX only',note:'Live single-exchange SPY observations. NOT full-market SIP data. Volume and indicators may differ from consolidated markets; no live option quotes.'};
}
async function tradier(env) {
  const now = new Date();
  const begin = easternParts(new Date(now.getTime()-8*86400000));
  const end = easternParts(now);
  const url = new URL('https://api.tradier.com/v1/markets/timesales');
  url.searchParams.set('symbol','SPY');
  url.searchParams.set('interval','5min');
  url.searchParams.set('start',begin.date+' 04:00');
  url.searchParams.set('end',end.date+' '+end.time);
  url.searchParams.set('session_filter','all');
  const body = await readJson(url.toString(), {'Authorization':'Bearer '+env.TRADIER_API_TOKEN,'accept':'application/json'});
  return {bars:normalizeRows(body?.series?.data,'tradier'),provider:'Tradier brokerage',coverage:'Brokerage market-data feed',note:'Equity time-and-sales five-minute bars; no live option quotes or order execution in this version. Tradier access is for authorized brokerage account holders only.'};
}
export async function onRequestGet({request,env}) {
  const expected = env.EDGE_VIEW_KEY;
  if (!expected) return result({ok:false,code:'SETUP_REQUIRED',message:'Set EDGE_VIEW_KEY as an encrypted Cloudflare Pages secret to protect your personal data feed.'},503);
  // A long random access key prevents accidental/public use of personal market-data entitlements.
  const got = request.headers.get('x-edge-view-key') || '';
  if (!got || got !== expected) return result({ok:false,code:'UNAUTHORIZED',message:'Enter the EDGE access key configured in Cloudflare.'},401);
  if (!env.TRADIER_API_TOKEN && !(env.ALPACA_KEY_ID && env.ALPACA_SECRET_KEY))
    return result({ok:false,code:'PROVIDER_NOT_CONFIGURED',message:'Add ALPACA_KEY_ID and ALPACA_SECRET_KEY, or TRADIER_API_TOKEN, as Cloudflare Pages secrets.'},503);
  try {
    // Choose Tradier first when available, since IEX is limited for SPY signals.
    const provider = env.TRADIER_API_TOKEN ? await tradier(env) : await alpaca(env);
    if (!provider.bars.length) return result({ok:false,code:'NO_BARS',message:'Provider returned no usable five-minute SPY bars. Try again later.',provider:provider.provider},502);
    return result({ok:true, symbol:'SPY', asOf:new Date().toISOString(),barCount:provider.bars.length,...provider});
  } catch (e) { return result({ok:false,code:'PROVIDER_ERROR',message:String(e.message||'Unknown provider error').slice(0,240)},502); }
}
