import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVillage, analyzeVillage, maxLevel, DAY } from '../dist/engine.js';
const data = JSON.parse(readFileSync(new URL('../dist/game-data.json', import.meta.url)));
const real = JSON.parse(readFileSync(new URL('./fixtures/native-export.json', import.meta.url)));

function fullVillage(th=13) {
  const townHall=data.buildings.find(b=>b.name==='Town Hall'), quantities=new Map();
  for(const level of townHall.levels.filter(l=>l.level<=th))for(const unlock of level.unlocks??[])quantities.set(unlock._id,(quantities.get(unlock._id)??0)+unlock.quantity);
  // Build all available merges and remove the consumed sources.
  for(const item of data.buildings)for(const source of item.levels[0]?.merge_requirement??[]){
    const count=quantities.get(item.id)??0;quantities.set(source._id,(quantities.get(source._id)??0)-count);
  }
  if(th>=17)quantities.set(1000031,0);
  const buildings=[{data:1000001,lvl:th}],traps=[];
  for(const [id,cnt]of quantities){
    if(cnt<=0||[1000064,1000093].includes(id))continue;
    const item=data.buildings.find(b=>b.id===id)??data.traps.find(b=>b.id===id);if(!item)continue;
    const row={data:id,lvl:maxLevel(item,th)||1,cnt};
    if(data.traps.some(b=>b.id===id))traps.push(row);else buildings.push(row);
  }
  const heroes=data.heroes.filter(h=>maxLevel(h,th)>0).map(h=>({data:h.id,lvl:maxLevel(h,th)}));
  return {buildings,traps,heroes,equipment:[],units:[],spells:[],pets:[]};
}
function analyze(raw,options){return analyzeVillage(parseVillage(raw,data),data,options);}

test('native export decodes numeric IDs, grouped counts, timers, and Home Village only',()=>{
  const v=parseVillage(real,data);
  assert.equal(v.th,13);
  assert.equal(v.buildings.find(b=>b.name==='Army Camp').count,4);
  assert.equal(v.heroes.find(h=>h.name==='Archer Queen').level,46);
  assert.ok(v.buildings.some(b=>b.upgrading));
  assert.equal(v.buildings.some(b=>b.id===1000034),false);
  assert.equal(v.builderCount,5);
  assert.ok(analyzeVillage(v,data).tasks.length>0);
});
test('partial API profiles never claim Town Hall readiness',()=>{
  const raw={name:'Player',townHallLevel:13,heroes:[{name:'Archer Queen',level:45,village:'home'}],troops:[{name:'Dragon',level:5,village:'home'},{name:'Baby Dragon',level:10,village:'builderBase'}]};
  const v=parseVillage(raw,data),p=analyzeVillage(v,data);
  assert.equal(v.present.buildings,false);
  assert.equal(v.troops.length,1);
  assert.ok(v.warnings.some(w=>w.includes('partial')));
  assert.equal(p.tasks.some(t=>t.name==='Town Hall'),false);
  assert.equal(p.checks.every(c=>c.state==='unknown'),true);
  assert.ok(p.tasks.some(t=>t.name==='Archer Queen'));
});
test('malformed and unrelated inputs give useful errors',()=>{
  for(const raw of ['{','null','[]','{}','{"hello":1}'])assert.throws(()=>parseVillage(raw,data));
  assert.throws(()=>parseVillage({townHallLevel:19},data),/newer/);
  assert.throws(()=>parseVillage({townHallLevel:13,heroes:[{data:28000001,lvl:-1}]},data),/Check the level/);
  assert.throws(()=>parseVillage({townHallLevel:13,buildings:[{data:1000000,lvl:10,cnt:2.5}]},data),/whole numbers/);
});
test('incomplete offense blocks the next TH while routine defenses are deferred',()=>{
  const raw=fullVillage(13);raw.buildings.find(b=>b.data===1000000).lvl=9;
  raw.heroes.find(h=>h.data===28000001).lvl=50;
  raw.buildings.find(b=>b.data===1000008).lvl=1;
  const p=analyze(raw);
  assert.equal(p.tasks[0].name,'Archer Queen');
  assert.ok(p.tasks.some(t=>t.name==='Army Camp'&&t.count===4));
  assert.equal(p.tasks.some(t=>t.name==='Cannon'),false);
  assert.equal(p.tasks.some(t=>t.name==='Town Hall'),false);
});
test('completed essentials recommend moving up without waiting for the lab or defenses',()=>{
  const raw=fullVillage(11);
  raw.buildings.find(b=>b.data===1000007).lvl=3;
  raw.buildings.find(b=>b.data===1000008).lvl=1;
  const p=analyze(raw);
  assert.equal(p.blockers.length,0);
  assert.equal(p.unknowns.length,0);
  assert.ok(p.tasks.some(t=>t.name==='Town Hall'));
});
test('an upgrade in progress is not scheduled again and does not count as finished',()=>{
  const raw=fullVillage(13);const camp=raw.buildings.find(b=>b.data===1000000);camp.lvl-=1;camp.timer=5000;
  const p=analyze(raw);
  assert.equal(p.tasks.some(t=>t.name==='Army Camp'),false);
  assert.equal(p.blockers.some(b=>b.id==='camps'),true);
  assert.equal(p.tasks.some(t=>t.name==='Town Hall'),false);
  assert.equal(p.busy,4);
});
test('TH16 prepares exactly the necessary merge sources and Eagle',()=>{
  const raw=fullVillage(16);
  raw.buildings=raw.buildings.filter(b=>![1000084,1000085].includes(b.data));
  raw.buildings.find(b=>b.data===1000008).cnt=7;raw.buildings.find(b=>b.data===1000008).lvl=17;
  raw.buildings.find(b=>b.data===1000009).cnt=8;raw.buildings.find(b=>b.data===1000009).lvl=18;
  raw.buildings.find(b=>b.data===1000031).lvl=5;
  const p=analyze(raw);
  assert.equal(p.tasks.filter(t=>t.name==='Cannon').reduce((s,t)=>s+t.count,0),4);
  assert.equal(p.tasks.filter(t=>t.name==='Archer Tower').reduce((s,t)=>s+t.count,0),4);
  assert.ok(p.tasks.some(t=>t.name==='Eagle Artillery'&&t.target===7));
  assert.ok(p.tasks.some(t=>t.name==='Ricochet Cannon'&&t.blocked));
  assert.equal(p.tasks.some(t=>t.name==='Town Hall'),false);
});
test('built merges consume source counts and do not create false missing cannons',()=>{
  const p=analyze(fullVillage(17));
  assert.equal(p.missing.some(m=>['Cannon','Archer Tower','Eagle Artillery'].includes(m.name)),false);
  assert.equal(p.checks.find(c=>c.id==='merged').state,'done');
  assert.equal(p.checks.find(c=>c.id==='gear').state,'done');
  assert.ok(p.tasks.some(t=>t.name==='Giga Artillery'));
});
test('TH17 Multi-Gear sources require geared towers',()=>{
  const raw=fullVillage(17);raw.buildings=raw.buildings.filter(b=>b.data!==1000079);
  raw.buildings.push({data:1000008,lvl:20,cnt:1,gear_up:1},{data:1000009,lvl:20,cnt:1,gear_up:1});
  const p=analyze(raw);
  assert.ok(p.tasks.some(t=>t.name==='Multi-Gear Tower'&&t.blocked));
  assert.equal(p.tasks.filter(t=>t.mergeSource).reduce((s,t)=>s+t.count,0),2);
});
test('unknown IDs are visible and prevent a verified readiness result',()=>{
  const raw=fullVillage(11);raw.buildings.push({data:1999999,lvl:1});
  const v=parseVillage(raw,data),p=analyzeVillage(v,data);
  assert.ok(v.warnings.some(w=>w.includes('unrecognized')));
  assert.ok(p.unknowns.length);
  assert.notEqual(p.status,'Ready to move up.');
});
test('equipment selections are explicit and discounts do not change the 8-day threshold',()=>{
  const raw=fullVillage(16);raw.heroes.find(h=>h.data===28000001).lvl=94;
  raw.equipment=[{data:90000000,lvl:6},{data:90000001,lvl:6}];
  const p=analyze(raw,{boost:20,equipment:['90000001']});
  assert.equal(p.equipment.filter(e=>e.selected).length,1);
  assert.equal(p.boost,.2);
  assert.equal(p.heroTrack.find(h=>h.name==='Archer Queen').nextTime,8*DAY);
  assert.equal(p.heroTrack.find(h=>h.name==='Archer Queen').inBookRange,true);
});
test('maximum TH focuses on heroes and core defenses without inventing a TH19 path',()=>{
  const raw=fullVillage(18);raw.heroes.find(h=>h.data===28000001).lvl=55;
  raw.buildings.find(b=>b.data===1000077).lvl=1;
  const p=analyze(raw);
  assert.equal(p.isMax,true);
  assert.equal(p.tasks.some(t=>t.name==='Town Hall'),false);
  assert.ok(p.tasks.some(t=>t.name==='Monolith'));
  assert.equal(p.tasks.some(t=>t.name==='Mortar'),false);
});
test('max TH prefers the Warden before cheap catch-up heroes when Queen is finished',()=>{
  const raw=fullVillage(18);
  raw.heroes.find(h=>h.data===28000002).lvl=40;
  raw.heroes.find(h=>h.data===28000004).lvl=35;
  raw.heroes.find(h=>h.data===28000007).lvl=5;
  assert.equal(analyze(raw).primary.name,'Grand Warden');
});
