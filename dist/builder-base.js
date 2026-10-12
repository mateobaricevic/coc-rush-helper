export const BOB_GUIDE_URL = 'https://support.supercell.com/clash-of-clans/en/articles/builder-base-getting-master-builder-to-home-village-3.html';
const clean = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const gearRules = [
  { name:'Cannon', homeId:1000008, homeLevel:7, builderId:1000041, builderName:'Double Cannon', builderLevel:4 },
  { name:'Archer Tower', homeId:1000009, homeLevel:10, builderId:1000048, builderName:'Archer Tower', builderLevel:6 },
  { name:'Mortar', homeId:1000013, homeLevel:8, builderId:1000045, builderName:'Multi Mortar', builderLevel:8 }
];

function entries(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.entries(value).map(([name,row]) => row && typeof row === 'object' ? {name,...row} : {name,level:row});
  throw new Error('Builder Base sections must be arrays or named objects.');
}

export function parseBuilderBase(raw, data) {
  const home = raw.homeVillage ?? raw.player ?? raw.village ?? raw;
  const nested = raw.builderBase ?? raw.builderVillage ?? home.builderBase ?? home.builderVillage;
  if (nested != null && (typeof nested !== 'object' || Array.isArray(nested))) throw new Error('Builder Base must contain a JSON object.');
  const definitions = data.builderBase ?? {buildings:[],heroes:[],troops:[]};
  const cats = Object.fromEntries(Object.entries(definitions).map(([category,items]) => [category, {
    byId:new Map(items.map(item => [String(item.id),item])),
    byName:new Map(items.map(item => [clean(item.name),item]))
  }]));
  const result = {buildings:[],heroes:[],troops:[],present:{},warnings:[],cats};
  const fields = {buildings:['buildings2'],heroes:['heroes2'],troops:['units2','troops2']};
  for (const category of ['buildings','heroes','troops']) {
    const nestedValue = nested?.[category] ?? (category === 'troops' ? nested?.units : undefined);
    const nativeField = fields[category].find(field => raw[field] != null || home[field] != null);
    let value = nestedValue ?? (nativeField ? raw[nativeField] ?? home[nativeField] : undefined);
    result.present[category] = value != null;
    let rows;
    if (value != null) rows = entries(value);
    else {
      const mixed = home[category] ?? (category === 'troops' ? home.units : undefined);
      rows = mixed == null ? [] : entries(mixed).filter(row => row && (
        clean(row.village) === 'builderbase' || (row.village !== 'home' && cats[category].byId.has(String(row.data ?? row.id))) ||
        (category === 'heroes' && cats.heroes.byName.has(clean(row.name)))
      ));
      result.present[category] = rows.length > 0;
    }
    if (rows.length > 5000) throw new Error('This Builder Base section contains too many entries.');
    for (const [index,row] of rows.entries()) {
      if (!row || typeof row !== 'object') throw new Error(`An entry in Builder Base ${category} is not a JSON object.`);
      const item = cats[category].byId.get(String(row.data ?? row.id)) ?? cats[category].byName.get(clean(row.name));
      if (!item) { result.warnings.push(`Unrecognized Builder Base ${category}: ${String(row.name ?? row.data ?? row.id ?? 'unknown').slice(0,80)}.`); continue; }
      const level = Number(row.lvl ?? row.level), count = Number(row.cnt ?? row.count ?? 1), timer = Number(row.timer ?? row.remainingSeconds ?? 0);
      if (!Number.isInteger(level) || level < 0 || level > 1000 || !Number.isInteger(count) || count < 0 || count > 1000 || !Number.isFinite(timer) || timer < 0) throw new Error(`Check the Builder Base level, count, or timer for ${item.name}.`);
      if (!count) continue;
      const nextLevel = level === 0 ? item.levels[0]?.level ?? 1 : level + 1;
      result[category].push({item,id:item.id,name:item.name,level,count,timer,upgrading:timer > 0,planned:timer > 0 ? nextLevel : level,uid:`builder-${category}-${index}`});
    }
  }
  result.hall = result.buildings.find(row => row.id === 1000034);
  const hallLevel = result.hall?.level ?? nested?.builderHallLevel ?? nested?.builderHall?.level ?? home.builderHallLevel ?? raw.builderHallLevel;
  result.bh = hallLevel == null ? null : Number(hallLevel);
  if (result.bh != null && (!Number.isInteger(result.bh) || result.bh < 0 || result.bh > 1000)) throw new Error('Check your Builder Hall level.');
  if (result.bh > data.meta.maxBuilderHall) result.warnings.push('Your Builder Hall is newer than this snapshot. Confirm upgrade details in game.');
  return result;
}

export function analyzeBuilderBase(village, data, overrides = {}) {
  const base = village.builderBase;
  const tasks = [], deferred = [], checks = [];
  const maxHeroLevel = Math.max(...data.builderBase.heroes.flatMap(item => item.levels.map(level => level.level)));
  function manual(field, detected, max, label) {
    if (overrides[field] == null || overrides[field] === '') return detected;
    const value = Number(overrides[field]);
    const min = field === 'hall' ? 1 : 0;
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
    if (field === 'copter' && value > 0 && value < 15) throw new Error('Battle Copter starts at level 15. Enter 0 if it is not built, or 15 and above.');
    return value;
  }
  const current = id => Math.max(0,...base.buildings.filter(row => row.id === id).map(row => row.level));
  const best = (rows,id) => rows.filter(row => row.id === id).sort((a,b) => b.level - a.level || Number(a.upgrading) - Number(b.upgrading))[0];
  const control = manual('control',base.present.buildings ? current(1000065) : null,5,'B.O.B Control');
  const unlocked = village.bob;
  const bh = manual('hall',base.bh,data.meta.maxBuilderHall,'Builder Hall');
  const heroLevel = (id,unlock) => base.heroes.find(row => row.id === id)?.level ?? (base.present.heroes || (bh != null && bh < unlock) ? 0 : null);
  const machine = manual('machine',heroLevel(28000003,5),maxHeroLevel,'Battle Machine');
  const copter = manual('copter',heroLevel(28000005,8),maxHeroLevel,'Battle Copter');
  const heroTotal = machine == null || copter == null ? null : machine + copter;
  const troopLevel = manual('troopLevel',base.present.troops ? Math.max(0,...base.troops.map(row => row.level)) : null,Math.max(...data.builderBase.troops.flatMap(item => item.levels.map(level => level.level))),'Highest troop level');
  const defenses = base.buildings.filter(row => row.item.type === 'Defense');
  const defenseLevel = manual('defenseLevel',base.present.buildings ? Math.max(0,...defenses.map(row => row.level)) : null,data.meta.maxBuilderHall,'Highest defense level');
  const mergedGears = village.buildings.some(row => row.id === 1000079 && (row.level >= 1 || row.upgrading));
  const gears = gearRules.map(rule => {
    const homes = village.buildings.filter(row => row.id === rule.homeId);
    const done = unlocked || control >= 2 || homes.some(row => row.gear) || (mergedGears && rule.homeId !== 1000013);
    const homeLevel = village.present.buildings ? Math.max(0,...homes.map(row => row.level)) : null;
    const builderLevel = base.present.buildings ? current(rule.builderId) : null;
    const known = village.present.buildings && (homes.length === 0 || homes.every(row => row.gearKnown));
    return {...rule,homeCurrent:homeLevel,builderCurrent:builderLevel,state:done ? 'done' : known ? 'todo' : 'unknown',ready:homeLevel >= rule.homeLevel && builderLevel >= rule.builderLevel};
  });
  const detectedGears = gears.every(gear => gear.state !== 'unknown') ? gears.filter(gear => gear.state === 'done').length : null;
  const gearUps = manual('gearUps',detectedGears,3,'Completed gear-ups');
  const check = (id,label,value,target,confirmed,detail) => {
    const state = unlocked || confirmed || (value != null && value >= target) ? 'done' : value == null ? 'unknown' : 'todo';
    checks.push({id,label,value,target,state,detail:unlocked ? 'Confirmed by B.O.B’s Hut in the Home Village.' : confirmed ? `Confirmed by B.O.B Control level ${control}.` : detail});
  };
  check('hall','Reach Builder Hall 9',bh,9,control >= 1,bh == null ? 'Builder Hall missing from this export.' : `BH${bh} / BH9${base.hall?.upgrading ? ` · upgrading to BH${base.hall.planned}; not finished yet` : ''}`);
  check('gears','Complete the three gear-ups',gearUps,3,control >= 2,gearUps == null ? 'Gear-up flags missing. Enter your completed count below.' : `${gearUps} / 3 completed in the Home Village`);
  check('troop','One Builder Base troop at level 18',troopLevel,18,control >= 3,troopLevel == null ? 'Troop levels missing. Enter your highest level below.' : `Highest troop: level ${troopLevel} / 18`);
  check('defense','One Builder Base defense at level 9',defenseLevel,9,control >= 4,defenseLevel == null ? 'Defense levels missing. Enter your highest defense level below.' : `Highest defense: level ${defenseLevel} / 9 · walls and traps excluded`);
  check('heroes','45 combined hero levels',heroTotal,45,control >= 5,heroTotal == null ? 'Hero levels missing. Enter Battle Machine and Battle Copter below.' : `Battle Machine ${machine} + Battle Copter ${copter} = ${heroTotal} / 45`);
  check('control','Finish B.O.B Control',control,5,false,control != null ? `Level ${control} / 5 · claim each task in Builder Base` : 'B.O.B Control level missing from this export.');
  const done = id => checks.find(check => check.id === id).state === 'done';
  const values = {hall:bh,machine,copter,troopLevel,defenseLevel,gearUps,control};
  const allDone = checks.every(check => check.state === 'done');
  const goalsDone = checks.slice(0,5).every(check => check.state === 'done');
  const active = [...base.buildings,...base.heroes,...base.troops].filter(row => row.upgrading);
  const added = new Set();
  const add = task => {
    if (added.has(task.id)) return;
    added.add(task.id);
    (task.waiting ? deferred : tasks).push(task);
  };
  function upgrade(row,item,target,rank,reason,lane='Builder Base') {
    if (!item || !row || row.planned >= target) return;
    const next = item.levels.find(level => level.level === row.planned + 1) ?? (row.planned === 0 ? item.levels[0] : null);
    if (!next) return;
    const requiredHall = next.required_townhall ?? 1;
    add({id:`${lane}-${item.id}`,name:item.name,level:row.planned,nextLevel:next.level,target,rank,reason,lane,count:1,
      time:next.build_time ?? next.upgrade_time,cost:next.build_cost ?? next.upgrade_cost,resource:item.upgrade_resource,
      blocked:lane === 'Home Village' ? requiredHall > village.th : bh == null || requiredHall > bh,
      requirement:lane === 'Home Village' ? `TH${requiredHall}` : `BH${requiredHall}`,waiting:row.upgrading,timer:row.timer});
  }
  function building(id,target,rank,reason) {
    if (!base.present.buildings) return;
    const item = base.cats.buildings.byId.get(String(id));
    const row = best(base.buildings,id) ?? {level:0,planned:0,upgrading:false};
    upgrade(row,item,target,rank,reason);
  }
  if (!unlocked) {
    if (!done('hall') && bh != null) {
      const next = base.cats.buildings.byId.get('1000034').levels.find(level => level.level === bh + 1);
      if (bh < 9 && next && !base.hall?.upgrading) add({id:'builder-hall',name:'Builder Hall',level:bh,nextLevel:bh+1,target:9,rank:10,lane:'Builder Base',manual:true,time:next.build_time,cost:next.build_cost,resource:'Builder Gold',reason:'Move toward BH9. Place the buildings required by the in-game upgrade screen and raise storage only when you cannot afford the next step.'});
    }
    if (!done('heroes') && heroTotal != null) {
      const heroRows = [{id:28000003,level:machine,unlock:5,field:'machine'},{id:28000005,level:copter,unlock:8,field:'copter'}];
      const pendingTotal = heroRows.every(hero => hero.level != null) ? heroRows.reduce((sum,hero) => {
        const row = base.heroes.find(row => row.id === hero.id);
        return sum + (overrides[hero.field] == null && row?.upgrading ? row.planned : hero.level);
      },0) : null;
      const copterRow = overrides.copter == null ? base.heroes.find(row => row.id === 28000005) : null;
      const unlockGain = copter === 0 && !copterRow?.upgrading ? 15 : 0;
      for (const hero of heroRows) {
        if (hero.level == null || (pendingTotal != null && pendingTotal >= 45)) continue;
        if (hero.level > 0 && pendingTotal != null && pendingTotal + unlockGain >= 45) continue;
        const item = base.cats.heroes.byId.get(String(hero.id));
        const imported = overrides[hero.field] == null ? base.heroes.find(row => row.id === hero.id) : null;
        const planned = imported?.planned ?? hero.level;
        const next = item.levels.find(level => level.level > planned);
        if (!next) continue;
        add({id:`builder-hero-${hero.id}`,name:item.name,level:planned,nextLevel:next.level,rank:planned === 0 ? 12 : 20,lane:'Builder Base',
          reason:planned === 0 ? `Build ${item.name}${hero.id === 28000005 ? ' to gain its starting 15 levels' : ' to start the hero track'}. Stop hero work once their completed levels total 45.` : 'Keep a hero upgrading while you work on the other tasks. Both heroes contribute; stop at 45 combined completed levels.',
          time:planned === 0 ? null : next.upgrade_time,cost:planned === 0 ? null : next.upgrade_cost,resource:'Builder Elixir',manual:planned === 0,
          blocked:bh == null || (next.required_townhall ?? hero.unlock) > bh,requirement:`BH${next.required_townhall ?? hero.unlock}`,waiting:!!imported?.upgrading,timer:imported?.timer});
      }
    }
    if (!done('troop')) {
      building(1000046,9,18,'Star Laboratory 9 opens level-18 research. Research one farming troop while your builders work.');
      const candidates = base.troops.filter(row => row.level < 18).sort((a,b) => b.level - a.level);
      const row = candidates[0];
      if (row && overrides.troopLevel == null) {
        const next = row.item.levels.find(level => level.level === row.planned + 1);
        if (next && row.planned < 18) add({id:'builder-research',name:row.name,level:row.planned,nextLevel:next.level,target:18,rank:19,lane:'Star Laboratory',
          reason:'This is your highest imported troop. Keep one troop researching toward level 18; use a troop that also helps you farm.',
          time:next.upgrade_time,cost:next.upgrade_cost,resource:'Builder Elixir',waiting:row.upgrading,timer:row.timer,
          blocked:bh == null || (next.required_townhall ?? 1) > bh || current(1000046) < next.required_lab_level,requirement:`Star Laboratory ${next.required_lab_level}`});
      } else if (troopLevel != null && troopLevel < 18) add({id:'builder-research-manual',name:'Your farming troop',level:troopLevel,nextLevel:troopLevel+1,target:18,rank:19,lane:'Star Laboratory',manual:true,reason:'Research one troop you use toward level 18. Its name and next-upgrade cost are not in this export; choose the troop and confirm its lab requirement in game.'});
    }
    if (!done('gears') && overrides.gearUps == null) {
      for (const gear of gears.filter(gear => gear.state !== 'done')) {
        building(gear.builderId,gear.builderLevel,22,`Prepare one ${gear.builderName} for the ${gear.name} gear-up in the Home Village.`);
        const item = village.cats.buildings.byId.get(String(gear.homeId));
        const row = best(village.buildings,gear.homeId);
        if (row) upgrade(row,item,gear.homeLevel,23,'Only one Home Village defense of this type needs the gear-up prerequisite.','Home Village');
        add({id:`gear-${gear.homeId}`,name:`Gear up one ${gear.name}`,rank:gear.ready ? 21 : 29,lane:'Master Builder',manual:true,blocked:!gear.ready,
          requirement:`Home ${gear.name} ${gear.homeLevel} + Builder ${gear.builderName} ${gear.builderLevel}`,
          reason:'Start this in the Home Village with a free Master Builder. The gear-up occupies him, so plan around Builder Base hero work.'});
      }
    } else if (!done('gears') && gearUps != null) add({id:'manual-gears',name:`Finish ${3-gearUps} remaining gear-up${gearUps===2 ? '' : 's'}`,rank:22,lane:'Master Builder',manual:true,reason:'Your manual count is being used. Check which Cannon, Archer Tower, or Mortar gear-ups remain, then use the prerequisite table below.'});
    if (!done('defense') && base.present.buildings && overrides.defenseLevel == null) {
      const mortar = best(base.buildings,1000045);
      const needsMortarForGear = !done('gears') && gears.find(gear => gear.name === 'Mortar').state !== 'done';
      const remainingTime = row => row.item.levels.filter(level => level.level > row.planned && level.level <= 9).reduce((sum,level) => sum + (level.build_time || 0),0);
      const chosen = mortar && (needsMortarForGear || mortar.level >= 8) ? mortar : defenses.filter(row => row.level < 9 && row.item.levels.some(level => level.level === 9)).sort((a,b) => remainingTime(a) - remainingTime(b))[0];
      if (chosen) {
        // A level-9 target also covers this same building's level-8 gear-up work.
        const previous = tasks.find(task => task.id === `Builder Base-${chosen.id}`) ?? deferred.find(task => task.id === `Builder Base-${chosen.id}`);
        if (previous) { previous.target = 9; previous.reason += ' Continue to level 9 to satisfy the defense task too.'; }
        else upgrade(chosen,chosen.item,9,24,chosen.id === 1000045 ? 'Multi Mortar 8 serves the Mortar gear-up; its next level also completes the defense requirement.' : 'This existing defense has the shortest listed remaining upgrade time to level 9. One defense at 9 is enough.');
      } else add({id:'manual-defense',name:'One Builder Base defense',level:0,nextLevel:1,target:9,rank:24,lane:'Builder Base',manual:true,reason:'No defense was found in the building list. Place a defense and take one to 9; use Multi Mortar if you also need the Mortar gear-up.'});
    } else if (!done('defense') && defenseLevel != null && defenseLevel < 9) add({id:'manual-defense',name:'One Builder Base defense',level:defenseLevel,nextLevel:defenseLevel+1,target:9,rank:24,lane:'Builder Base',manual:true,reason:'Upgrade one defense to 9. Multi Mortar is a useful overlap because its level 8 is needed for the Mortar gear-up. Walls and traps do not count.'});
    if (!done('control') && bh >= 9 && control != null) {
      const gate = control === 0 ? 'hall' : ['gears','troop','defense','heroes'][control-1];
      add({id:'bob-control',name:'B.O.B Control',level:control,nextLevel:control+1,target:5,rank:done(gate) ? 13 : 30,lane:'Builder Base',manual:true,blocked:!done(gate),requirement:checks.find(check => check.id === gate)?.label,
        reason:control === 0 ? 'Build B.O.B Control at BH9, then claim its four task upgrades as you complete them.' : 'Open B.O.B Control and claim the next task upgrade. Finish level 5, then place B.O.B’s Hut in the Home Village.'});
    }
    if (allDone) add({id:'claim-bob',name:'Place B.O.B’s Hut',rank:1,lane:'Home Village',manual:true,reason:'The tracked requirements are complete. Place B.O.B’s Hut in the Home Village to activate the extra builder.'});
  }
  tasks.sort((a,b) => Number(!!a.blocked)-Number(!!b.blocked) || a.rank-b.rank || (a.time ?? Infinity)-(b.time ?? Infinity));
  const status = unlocked ? 'Your sixth builder is unlocked.' : allDone ? 'Bring B.O.B to the Home Village.' : goalsDone ? 'Finish B.O.B Control to claim your builder.' : checks.some(check => check.state === 'unknown') ? 'Fill the gaps in your B.O.B plan.' : bh < 9 ? 'Rush toward Builder Hall 9.' : 'Close the remaining B.O.B tasks.';
  return {values,gears,checks,tasks,deferred,active,control,unlocked,allDone,status,complete:checks.filter(check => check.state === 'done').length,
    unknown:checks.filter(check => check.state === 'unknown'),warnings:base.warnings,builderCount:bh >= 6 ? 2 : bh == null ? null : 1};
}
