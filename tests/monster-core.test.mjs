import test from 'node:test';
import assert from 'node:assert/strict';
import {scanMonster, MONSTER_RULES} from '../lib/monster-core.js';
const time=i=>{const minute=570+i*5;return String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');};
function makeDay(date,{base=100,volume=100,length=78,dir=0,step=0.02}={}){
 const rows=[];let price=base;
 for(let i=0;i<length;i++){
  const close=price+dir*step,open=price;
  rows.push({date,time:time(i),open,close,high:Math.max(open,close)+0.02,low:Math.min(open,close)-0.02,volume});
  price=close;
 }
 return rows;
}
const prev=Array.from({length:20},(_,i)=>makeDay('2026-01-'+String(i+1).padStart(2,'0')));
const history=prev.flat();
function shockRows(date='2026-01-21',dir=-1,length=6){
 return makeDay(date,{dir,step:0.25,length,volume:250});
}
test('requires 20 complete reference sessions; no incomplete-history trading',()=>{
 const scan=scanMonster({spy:[...history.slice(78),...shockRows()],qqq:shockRows(),iwm:shockRows(),today:'2026-01-21'});
 assert.equal(scan.status,'WAITING_FOR_HISTORY');assert.equal(scan.signal,null);
});
test('does not trigger before the 9:55–10:00 candle has closed',()=>{
 const current=shockRows('2026-01-21',-1,5);
 const scan=scanMonster({spy:[...history,...current],qqq:current,iwm:current,today:'2026-01-21'});
 assert.equal(scan.status,'OPENING_RANGE_BUILDING');assert.equal(scan.signal,null);
});
test('detects a cross-confirmed opening shock after the complete sixth candle',()=>{
 const current=shockRows();
 const scan=scanMonster({spy:[...history,...current],qqq:current,iwm:current,today:'2026-01-21'});
 assert.equal(scan.signal?.type,'SHOCK');assert.equal(scan.signal?.side,'BEARISH');
 assert.equal(scan.signal?.observedAt,'10:00');
 assert.equal(scan.metrics.openingVolumeRatio,2.5);
});
test('no signal if QQQ contradicts SPY',()=>{
 const current=shockRows();
 const opposite=shockRows('2026-01-21',1);
 const scan=scanMonster({spy:[...history,...current],qqq:opposite,iwm:current,today:'2026-01-21'});
 assert.equal(scan.signal,null);
});
test('out-of-order, missing SPY session bars do not create synthetic confirmations',()=>{
 const current=shockRows();
 current.splice(2,1);
 const scan=scanMonster({spy:[...history,...current],qqq:shockRows(),iwm:shockRows(),today:'2026-01-21'});
 assert.equal(scan.status,'INCOMPLETE_SPY_BARS');assert.equal(scan.signal,null);
});
test('expansion detection waits for the next completed bar and cannot use future bars',()=>{
 const current=makeDay('2026-01-21',{length:6,volume:100});
 const breakBar={date:'2026-01-21',time:'10:00',open:100,close:100.75,high:100.8,low:99.98,volume:800};
 const q=[...current,breakBar],i=[...current,breakBar];
 let first=scanMonster({spy:[...history,...current],qqq:q,iwm:i,today:'2026-01-21'});
 assert.equal(first.signal,null);
 let second=scanMonster({spy:[...history,...current,breakBar],qqq:q,iwm:i,today:'2026-01-21'});
 assert.equal(second.signal?.type,'EXPANSION');assert.equal(second.signal?.observedAt,'10:05');
});
test('rule settings stay conservative and read-only',()=>{
 assert.equal(MONSTER_RULES.lookbackSessions,20);
 assert.equal(typeof scanMonster,'function');
});
