import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVillage, analyzeVillage } from '../dist/engine.js';
import { analyzeBuilderBase } from '../dist/builder-base.js';

const data = JSON.parse(readFileSync(new URL('../dist/game-data.json',import.meta.url)));
const native = JSON.parse(readFileSync(new URL('./fixtures/native-export.json',import.meta.url)));
const check = (plan,id) => plan.checks.find(check => check.id === id);
function rawBase({bh=9,machine=22,copter=22,troop=17,defense=8,control=1} = {}) {
  return {
    buildings:[{data:1000001,lvl:13},{data:1000015,lvl:1,cnt:5},{data:1000008,lvl:7,gear_up:1},{data:1000009,lvl:10,gear_up:1},{data:1000013,lvl:8,gear_up:1}],
    buildings2:[{data:1000034,lvl:bh},{data:1000046,lvl:9},{data:1000041,lvl:4},{data:1000048,lvl:6},{data:1000045,lvl:defense},{data:1000065,lvl:control}],
    heroes2:[{data:28000003,lvl:machine},{data:28000005,lvl:copter}],units2:[{data:4000041,lvl:troop}]
  };
}
const analyze = (raw,overrides) => analyzeBuilderBase(parseVillage(raw,data),data,overrides);

test('native buildings2 are parsed separately and missing hero levels remain unknown',() => {
  const v = parseVillage(native,data), plan = analyzeBuilderBase(v,data);
  assert.equal(v.builderBase.bh,10);
  assert.equal(v.builderBase.buildings.find(row => row.id === 1000045).level,8);
  assert.equal(v.builderBase.present.heroes,false);
  assert.equal(plan.values.machine,null);
  assert.equal(plan.values.copter,null);
  assert.equal(check(plan,'heroes').state,'unknown');
  assert.equal(check(plan,'troop').state,'done'); // Control 4 proves earlier tasks were claimed.
  assert.equal(plan.tasks.some(task => task.id.startsWith('builder-hero-')),false);
  assert.equal(v.buildings.some(row => row.id === 1000034),false);
});

test('named Builder Base wrappers and mixed official API profiles are supported',() => {
  const named = parseVillage({homeVillage:{townHallLevel:13},builderBase:{builderHallLevel:9,buildings:{'Star Laboratory':9,'Multi Mortar':9},heroes:{'Battle Machine':30,'Battle Copter':15},troops:{'Baby Dragon':18}}},data);
  assert.equal(named.builderBase.bh,9);
  assert.equal(check(analyzeBuilderBase(named,data),'heroes').state,'done');
  const v = parseVillage({townHallLevel:13,builderHallLevel:9,
    heroes:[{name:'Archer Queen',level:50,village:'home'},{name:'Battle Machine',level:30,village:'builderBase'},{name:'Battle Copter',level:15,village:'builderBase'}],
    troops:[{name:'Baby Dragon',level:5,village:'home'},{name:'Baby Dragon',level:18,village:'builderBase'}]},data);
  assert.equal(v.heroes.length,1);
  assert.equal(v.troops.length,1);
  assert.equal(v.builderBase.troops[0].level,18);
  assert.equal(check(analyzeBuilderBase(v,data),'troop').state,'done');
  assert.equal(check(analyzeBuilderBase(v,data),'control').state,'unknown');
});

test('mixed numeric IDs take precedence over names shared by both villages',() => {
  const homeDragon=data.troops.find(item => item.name === 'Baby Dragon');
  const v=parseVillage({townHallLevel:13,builderHallLevel:9,units:[
    {data:homeDragon.id,name:'Baby Dragon',lvl:5},
    {data:4000041,name:'Baby Dragon',lvl:18}
  ]},data);
  assert.equal(v.troops.length,1);
  assert.equal(v.troops[0].level,5);
  assert.equal(v.builderBase.troops.length,1);
  assert.equal(v.builderBase.troops[0].level,18);
  assert.equal(v.unknown.length,0);
});

test('a pending hero upgrade cannot complete the 45-level requirement or be scheduled twice',() => {
  const raw = rawBase({machine:29,copter:15,troop:18,defense:9,control:4});
  raw.heroes2[0].timer=5000;
  const plan=analyze(raw);
  assert.equal(check(plan,'heroes').state,'todo');
  assert.equal(check(plan,'heroes').value,44);
  assert.equal(plan.tasks.some(task => task.id.startsWith('builder-hero-')),false);
  assert.equal(plan.tasks.find(task => task.id === 'bob-control').blocked,true);
  assert.equal(plan.active.filter(row => row.id === 28000003).length,1);
});

test('the Copter starts at 15 and replaces unnecessary Machine upgrades when enough',() => {
  const plan=analyze(rawBase({machine:30,copter:0}));
  const copter=plan.tasks.find(task => task.id === 'builder-hero-28000005');
  assert.equal(copter.nextLevel,15);
  assert.equal(copter.manual,true);
  assert.equal(plan.tasks.some(task => task.id === 'builder-hero-28000003'),false);
  assert.equal(check(plan,'heroes').state,'todo');
});

test('a Copter being constructed is counted once in future hero planning',() => {
  const raw=rawBase({machine:20,copter:0});raw.heroes2[1].timer=1000;
  const plan=analyze(raw);
  assert.equal(plan.tasks.find(task => task.id === 'builder-hero-28000003').nextLevel,21);
  assert.equal(plan.deferred.find(task => task.id === 'builder-hero-28000005').nextLevel,16);
  assert.equal(plan.deferred.find(task => task.id === 'builder-hero-28000005').manual,false);
});

test('any valid level-9 defense counts, while level-9 walls and traps do not',() => {
  const raw=rawBase();raw.buildings2.push({data:1000044,lvl:9});
  let plan=analyze(raw);
  assert.equal(check(plan,'defense').state,'done');
  assert.equal(plan.tasks.some(task => task.target === 9 && task.name === 'Multi Mortar'),false);
  raw.buildings2=raw.buildings2.filter(row => row.data !== 1000044);
  raw.buildings2.push({data:1000033,lvl:9,cnt:100});raw.traps2=[{data:12000013,lvl:9}];
  plan=analyze(raw);
  assert.equal(check(plan,'defense').state,'todo');
  assert.equal(plan.values.defenseLevel,8);
});

test('one completed troop at 18 ends the research task without forcing a particular troop',() => {
  const raw=rawBase();raw.units2.push({data:4000031,lvl:18});
  const plan=analyze(raw);
  assert.equal(check(plan,'troop').state,'done');
  assert.equal(plan.tasks.some(task => task.lane === 'Star Laboratory'),false);
});

test('Multi Mortar gear-up and defense work are combined into one building target',() => {
  const raw=rawBase({defense:7});raw.buildings.find(row => row.data === 1000013).gear_up=0;
  const plan=analyze(raw);
  const mortar=plan.tasks.filter(task => task.name === 'Multi Mortar');
  assert.equal(mortar.length,1);
  assert.equal(mortar[0].target,9);
  assert.equal(plan.tasks.find(task => task.id === 'gear-1000013').blocked,true);
});

test('merged geared towers retain the Cannon and Archer Tower gear-up completion',() => {
  const raw=rawBase();raw.buildings=raw.buildings.filter(row => ![1000008,1000009].includes(row.data));
  raw.buildings.push({data:1000079,lvl:1});
  const plan=analyze(raw);
  assert.equal(plan.values.gearUps,3);
  assert.equal(check(plan,'gears').state,'done');
});

test('below BH9 the plan stops at BH9 and keeps impossible next steps blocked',() => {
  const raw=rawBase({bh:7,machine:10,copter:0,control:0,troop:12,defense:7});
  raw.buildings2.find(row => row.data === 1000046).lvl=7;
  const plan=analyze(raw);
  assert.equal(plan.tasks.find(task => task.id === 'builder-hall').target,9);
  assert.equal(plan.tasks.find(task => task.id === 'builder-hero-28000005').blocked,true);
  assert.equal(plan.tasks.some(task => task.name === 'Builder Hall' && task.nextLevel === 10),false);
});

test('manual values resolve partial exports and invalid values cannot produce completion',() => {
  const raw={townHallLevel:13,builderHallLevel:9};
  const plan=analyze(raw,{machine:23,copter:22,troopLevel:18,defenseLevel:9,gearUps:3,control:5});
  assert.equal(plan.allDone,true);
  assert.equal(plan.unlocked,false);
  assert.equal(plan.tasks[0].id,'claim-bob');
  const partial=analyze(raw,{machine:30});
  assert.equal(check(partial,'heroes').state,'unknown');
  assert.equal(partial.tasks.some(task => task.id.startsWith('builder-hero-')),false);
  for(const overrides of [{copter:10},{machine:-1},{gearUps:4},{troopLevel:18.5},{hall:0},{control:6}])assert.throws(()=>analyze(raw,overrides));
});

test('B.O.B Control 5 offers the hut, and the hut confirms the sixth Home Village builder',() => {
  const raw=rawBase({control:5});delete raw.heroes2;delete raw.units2;
  let v=parseVillage(raw,data), plan=analyzeBuilderBase(v,data);
  assert.equal(plan.allDone,true);
  assert.equal(v.builderCount,5);
  assert.equal(plan.tasks[0].id,'claim-bob');
  raw.buildings.push({data:1000064,lvl:1});v=parseVillage(raw,data);plan=analyzeBuilderBase(v,data);
  assert.equal(v.builderCount,6);
  assert.equal(plan.unlocked,true);
  assert.equal(plan.tasks.length,0);
});

test('Builder Base running upgrades do not occupy Home Village builders',() => {
  const raw=rawBase();raw.heroes2[0].timer=9000;raw.buildings2[2].timer=2000;
  const v=parseVillage(raw,data);
  assert.equal(analyzeVillage(v,data).busy,0);
  assert.equal(analyzeBuilderBase(v,data).active.length,2);
});
