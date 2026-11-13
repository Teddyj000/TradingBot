// Cloudflare Pages Function: authenticated, read-only monster-day research scanner.
import {scanMonster, MONSTER_RULES} from '../../lib/monster-core.js';
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store, max-age=0','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'};
const json=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:HEADERS});
const format=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const et=(date)=>{
 const p=Object.fromEntries(format.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return {date:p.year+'-'+p.month+'-'+p.day,time:p.hour+':'+p.minute};
};
const minute=(str)=>Number(str.slice(0,2))*60+Number(str.slice(3,5));
const daysAgo=(n)=>et(new Date(Date.now()-n*86400000)).date;
async function fetchJson(url,headers){
 const response=await fetch(url,{headers,method:'GET',cache:'no-store'});
 let body;try{body=await response.json()}catch{throw new Error('Market-data provider returned invalid JSON');}
 if(!response.ok){if(response.status===429)throw new Error('Market-data provider rate limited; retry later');
 if(response.status===401||response.status===403)throw new Error('Market-data provider authentication or entitlement problem');
 throw new Error('Market-data provider error ('+response.status+')');}
 return body;
}
function normalize(source,provider){
 const data=Array.isArray(source)?source:source && typeof source==='object'?[source]:[];
 const rows=new Map();
 for(const raw of data){
   let stamp;
   if(provider==='alpaca'){const d=new Date(raw.t);if(!Number.isFinite(d.getTime()))continue;stamp=et(d);}
   else {const m=String(raw.time||'').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);if(!m)continue;stamp={date:m[1],time:m[2]};}
   const o=Number(provider==='alpaca'?raw.o:raw.open),h=Number(provider==='alpaca'?raw.h:raw.high);
   const l=Number(provider==='alpaca'?raw.l:raw.low),c=Number(provider==='alpaca'?raw.c:raw.close);
   const volume=Number(provider==='alpaca'?raw.v:raw.volume);
   if(![o,h,l,c,volume].every(Number.isFinite)||o<=0||volume<0||h<Math.max(o,c)||l>Math.min(o,c)||h<l)continue;
   const row={...stamp,open:o,high:h,low:l,close:c,volume};
   rows.set(stamp.date+' '+stamp.time,row);
 }
 return [...rows.values()].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
}
async function tradier(env,symbol,from,to,nowEt){
 const url=new URL('https://api.tradier.com/v1/markets/timesales');
 url.searchParams.set('symbol',symbol);
 url.searchParams.set('interval','5min');
 url.searchParams.set('start',from+' 09:30');
 url.searchParams.set('end',to+' '+nowEt.time);
 // Tradier allows ~40 days for open-session five-minute series; 'all' is only ~18 days.
 url.searchParams.set('session_filter','open');
 const p=await fetchJson(url.toString(),{authorization:'Bearer '+env.TRADIER_API_TOKEN,accept:'application/json'});
 return normalize(p?.series?.data,'tradier');
}
async function alpaca(env,symbol,from){
 const url=new URL('https://data.alpaca.markets/v2/stocks/'+symbol+'/bars');
 url.searchParams.set('timeframe','5Min');
 url.searchParams.set('start',from);
 url.searchParams.set('end',new Date().toISOString());
 url.searchParams.set('limit','10000');
 url.searchParams.set('adjustment','raw');
 url.searchParams.set('feed','iex');
 const p=await fetchJson(url.toString(),{
  'APCA-API-KEY-ID':env.ALPACA_KEY_ID,'APCA-API-SECRET-KEY':env.ALPACA_SECRET_KEY,accept:'application/json'});
 // For one symbol / 40 calendar days, 10000 is comfortably above the expected 5m RTH bars.
 if(p?.next_page_token)throw new Error('Historical bars unexpectedly paginated; refusing incomplete history');
 return normalize(p.bars,'alpaca');
}
export async function onRequestGet({request,env}){
 if(!env.EDGE_VIEW_KEY)return json({ok:false,code:'SETUP_REQUIRED',message:'Configure EDGE_VIEW_KEY as a Cloudflare encrypted secret.'},503);
 if(request.headers.get('x-edge-view-key')!==env.EDGE_VIEW_KEY)return json({ok:false,code:'UNAUTHORIZED',message:'Enter the EDGE access key configured in Cloudflare.'},401);
 const provider=env.TRADIER_API_TOKEN?'Tradier':env.ALPACA_KEY_ID&&env.ALPACA_SECRET_KEY?'Alpaca IEX':null;
 if(!provider)return json({ok:false,code:'PROVIDER_NOT_CONFIGURED',message:'Configure Tradier or Alpaca secrets on Cloudflare Pages.'},503);
 const now=new Date(),clock=et(now),marketMinute=minute(clock.time);
 const isTradingDay=new Date(clock.date+'T12:00:00Z').getUTCDay();
 const sessionOpen=isTradingDay>=1&&isTradingDay<=5&&marketMinute>=570&&marketMinute<960;
 try{
  const past=daysAgo(39),get=(symbol,from)=>provider==='Tradier'?
     tradier(env,symbol,from,clock.date,clock):alpaca(env,symbol,from);
  const [spyAll,qqqAll,iwmAll]=await Promise.all([
    get('SPY',past),get('QQQ',clock.date),get('IWM',clock.date)
  ]);
  const finished=rows=>rows.filter(b=>b.date!==clock.date||minute(b.time)+5<=marketMinute);
  const spy=finished(spyAll),qqq=finished(qqqAll),iwm=finished(iwmAll);
  const analysis=scanMonster({spy,qqq,iwm,today:clock.date});
  const lastToday=spy.filter(x=>x.date===clock.date).at(-1);
  const age=lastToday?marketMinute-(minute(lastToday.time)+5):Infinity;
  const stale=sessionOpen&&age>12;
  // Free IEX-only prints may not represent consolidated SPY/QQQ/IWM prices or volume.
  // Do not promote incomplete exchange coverage into a research signal.
  const limited=provider==='Alpaca IEX';
  return json({ok:true,asOf:now.toISOString(),timeET:clock.time,dateET:clock.date,
    provider,feedQuality:limited?'LIMITED_SINGLE_EXCHANGE':'BROKERAGE_FEED',
    sessionOpen,stale,monitoringEnabled:sessionOpen&&!stale&&!limited,
    ...analysis, signal:limited||stale?null:analysis.signal,
    status:limited?'UNRELIABLE_DATA_FEED':stale?'STALE_DATA':analysis.status,
    rules:MONSTER_RULES,
    caveat:'SPY underlying research signal only; not a verified profitable strategy, options quote, trade or broker alert. Monitoring stops when the browser closes.'});
 }catch(e){return json({ok:false,code:'PROVIDER_ERROR',message:String(e?.message||'Data feed unavailable').slice(0,220)},502);}
}
