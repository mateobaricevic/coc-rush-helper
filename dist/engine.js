export const GUIDE_URL = 'https://docs.google.com/document/d/1zP792qWKVN14hVX_RW4Mui65yRTqqtHaEaj_jwUY-us/edit';
export const DAY = 86400;
const categories = ['buildings', 'traps', 'heroes', 'troops', 'spells', 'pets', 'equipment'];
const clean = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = { archer: 'archertower', builderhut: 'buildershut', bobhut: 'bobshut', lassi: 'lassi', electrodragon: 'electrodragon' };
const key = value => aliases[clean(value)] || clean(value);

export function catalog(data) {
  return Object.fromEntries(categories.map(category => [category, {
    byId: new Map(data[category].map(item => [String(item.id), item])),
    byName: new Map(data[category].map(item => [key(item.name), item]))
  }]));
}

export function parseVillage(input, data) {
  let raw;
  if (typeof input === 'string') {
    if (input.length > 5_000_000) throw new Error('That export is too large. Please use a village JSON file under 5 MB.');
    try { raw = JSON.parse(input.replace(/^\uFEFF/, '').trim()); }
    catch { throw new Error('This isn’t valid JSON yet. Copy the entire village export, including the opening and closing braces.'); }
  } else raw = input;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Paste a village JSON object, not a list or a single value.');
  const root = raw.homeVillage ?? raw.player ?? (raw.village && typeof raw.village === 'object' ? raw.village : raw);
  if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('The village wrapper must contain a JSON object.');
  const cats = catalog(data);
  const warnings = [];
  const unknown = [];
  const present = {};
  const result = {};
  const fields = { buildings: ['buildings'], traps: ['traps'], heroes: ['heroes'], troops: ['units', 'troops'], spells: ['spells'], pets: ['pets'], equipment: ['equipment', 'heroEquipment'] };
  function entries(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.entries(value).map(([name, row]) => typeof row === 'object' && row ? { name, ...row } : { name, level: row });
    throw new Error('Village sections such as buildings and heroes must be arrays or named objects.');
  }
  for (const category of categories) {
    const field = fields[category].find(name => root[name] != null);
    present[category] = !!field;
    let rows = field ? entries(root[field]) : [];
    // Official API responses mix pets into troops and equipment into heroes.
    if (category === 'pets' && !field && root.troops) rows = entries(root.troops).filter(row => cats.pets.byName.has(key(row.name)));
    if (category === 'equipment' && !field && Array.isArray(root.heroes)) rows = root.heroes.flatMap(hero => hero.equipment ?? []);
    if (rows.length) present[category] = true;
    if (rows.length > 5000) throw new Error('This section contains too many entries for a village export.');
    result[category] = [];
    rows.forEach((row, index) => {
      if (!row || typeof row !== 'object') throw new Error(`An entry in ${category} is not a JSON object.`);
      if (row.village && !['home', 'homeVillage'].includes(row.village)) return;
      const item = cats[category].byId.get(String(row.data ?? row.id)) ?? cats[category].byName.get(key(row.name ?? ''));
      if (!item) {
        if (category === 'troops' && cats.pets.byName.has(key(row.name ?? ''))) return;
        unknown.push(`${category}: ${String(row.name ?? row.data ?? row.id ?? 'unknown').slice(0, 80)}`);
        return;
      }
      const level = Number(row.lvl ?? row.level);
      const count = Number(row.cnt ?? row.count ?? 1);
      const timer = Number(row.timer ?? row.remainingSeconds ?? 0);
      if (!Number.isInteger(level) || level < 0 || level > 1000 || !Number.isInteger(count) || count < 0 || count > 1000 || !Number.isFinite(timer) || timer < 0) {
        throw new Error(`Check the level, count, or timer for ${item.name}. Levels and counts must be whole numbers; timers use seconds.`);
      }
      if (!count) return;
      result[category].push({ item, id: item.id, name: item.name, level, count, timer, upgrading: timer > 0,
        planned: level + (timer > 0 ? 1 : 0), gear: !!row.gear_up, weapon: row.weapon == null ? null : Number(row.weapon), uid: `${category}-${index}` });
      if (item.levels.length && level > item.levels.at(-1).level) warnings.push(`${item.name} level ${level} is newer than the bundled game data. Its upgrade target is unknown.`);
    });
  }
  const townHall = result.buildings.find(row => row.id === 1000001);
  const th = Number(townHall?.level ?? root.townHallLevel ?? root.townhallLevel ?? root.townHall?.level ?? root.th);
  if (!Number.isInteger(th) || th < 1) throw new Error('I couldn’t find your Town Hall. Use the in-game village export, or include townHallLevel and named buildings.');
  if (th > data.meta.maxTownHall) throw new Error(`This version supports Town Halls 1–${data.meta.maxTownHall}. Your TH${th} needs a newer game-data snapshot.`);
  if (!present.buildings) warnings.push('This is a partial player profile. Building levels and Town Hall readiness cannot be verified. Import the in-game village export for a full plan.');
  if (present.buildings && !townHall) warnings.push('The Town Hall level came from your profile. The building list may be incomplete; missing buildings are shown for you to verify.');
  if (!present.heroes && th >= 4) warnings.push('Hero levels are missing. The hero track needs a fresh village export.');
  if (!present.equipment && th >= 8) warnings.push('Equipment levels are missing. Choose your core equipment after importing a complete export.');
  if (!present.traps && present.buildings) warnings.push('Traps are missing from this JSON. Placement requirements need an in-game check.');
  if (unknown.length) warnings.push(`${unknown.length} unrecognized entries were skipped: ${unknown.slice(0, 6).join(', ')}${unknown.length > 6 ? '…' : ''}. They may affect this plan.`);
  const timestamp = Number(root.timestamp ?? raw.timestamp ?? 0);
  if (timestamp && Date.now() / 1000 - timestamp > DAY) warnings.push('This snapshot is over a day old. Running upgrades and levels reflect the export, so reimport after upgrades finish.');
  const hutCount = result.buildings.filter(row => row.id === 1000015).reduce((sum, row) => sum + row.count, 0);
  const bob = result.buildings.some(row => row.id === 1000064 && row.level >= 1);
  return { ...result, th, townHall, present, warnings, unknown, timestamp, cats,
    name: String(root.name ?? root.playerName ?? (root.tag ? 'Your village' : 'Imported village')).slice(0, 80),
    tag: String(root.tag ?? '').slice(0, 30), builderCount: Math.min(6, Math.max(1, hutCount || 5) + (bob ? 1 : 0)), bob };
}

export function maxLevel(item, th) {
  return item?.levels.filter(level => (level.required_townhall ?? 1) <= th).at(-1)?.level ?? 0;
}
export function formatDuration(seconds) {
  if (!seconds) return 'Instant';
  const d = Math.floor(seconds / DAY), h = Math.floor(seconds % DAY / 3600), m = Math.floor(seconds % 3600 / 60);
  return d ? `${d}d${h ? ` ${h}h` : ''}` : h ? `${h}h${m ? ` ${m}m` : ''}` : m ? `${m}m` : `${Math.ceil(seconds)}s`;
}

export function analyzeVillage(v, data, options = {}) {
  const tasks = [], checks = [], heroTrack = [], research = [], petTrack = [], equipment = [], deferred = [];
  const find = name => v.cats.buildings.byName.get(key(name));
  const rows = name => v.buildings.filter(row => key(row.name) === key(name));
  const current = name => Math.max(0, ...rows(name).map(row => row.level));
  const count = name => rows(name).reduce((sum, row) => sum + row.count, 0);
  const total = (name, level) => rows(name).filter(row => row.level >= level).reduce((sum, row) => sum + row.count, 0);
  const active = [...v.buildings, ...v.heroes].filter(row => row.upgrading);
  const builderCount = Math.min(6, Math.max(1, Number(options.builders) || v.builderCount));
  const busy = active.reduce((sum, row) => sum + row.count, 0);
  const boost = Math.min(20, Math.max(0, Number(options.boost) || 0)) / 100;
  const buildingSteps = new Set();
  function task(row, target, rank, category, reason, extra = {}) {
    if (!row || target <= row.planned) return null;
    const next = row.item.levels.find(l => l.level === row.planned + 1);
    if (!next || (next.required_townhall ?? 1) > v.th) return null;
    const object = { id: `${row.uid}-${target}`, name: row.name, level: row.planned, target, nextLevel: next.level, count: row.count,
      time: next.build_time ?? next.upgrade_time ?? 0, cost: next.build_cost ?? next.upgrade_cost ?? 0,
      resource: row.item.upgrade_resource, rank, category, reason, waiting: row.upgrading, timer: row.timer, ...extra };
    if (row.upgrading) deferred.push(object); else tasks.push(object);
    return object;
  }
  function building(name, rank, category, reason, targetOverride) {
    if (!v.present.buildings) return;
    const item = find(name);
    if (!item || buildingSteps.has(item.id)) return;
    buildingSteps.add(item.id);
    const target = targetOverride ?? maxLevel(item, v.th);
    rows(name).forEach(row => task(row, target, rank, category, reason));
  }
  function check(id, label, detail, state) { checks.push({ id, label, detail, state }); }

  const expected = new Map();
  const thItem = find('Town Hall');
  for (const level of thItem.levels.filter(level => level.level <= v.th)) {
    for (const unlock of level.unlocks ?? []) expected.set(unlock._id, (expected.get(unlock._id) ?? 0) + unlock.quantity);
  }
  // Merged buildings consume their source buildings. Do not "rebuild" those sources.
  for (const row of v.buildings) {
    if (row.level < 1 && !row.upgrading) continue;
    for (const source of row.item.levels[0]?.merge_requirement ?? []) expected.set(source._id, (expected.get(source._id) ?? 0) - row.count);
  }
  if (v.th >= 17) expected.set(1000031, 0); // Eagle is consumed by the TH17 merge.
  const optionalIds = new Set([1000015, 1000064, 1000093, 1000097]);
  const missing = [];
  if (v.present.buildings) {
    for (const [id, quantity] of expected) {
      if (optionalIds.has(id)) continue;
      const item = v.cats.buildings.byId.get(String(id)) ?? v.cats.traps.byId.get(String(id));
      if (!item || (!v.present.traps && v.cats.traps.byId.has(String(id)))) continue;
      const isTrap = v.cats.traps.byId.has(String(id));
      const owned = (isTrap ? v.traps : v.buildings).filter(row => row.id === id && row.level >= 1).reduce((sum, row) => sum + row.count, 0);
      const constructing = (isTrap ? v.traps : v.buildings).filter(row => row.id === id && row.level === 0 && row.upgrading).reduce((sum, row) => sum + row.count, 0);
      if (quantity <= owned) continue;
      const need = quantity - owned;
      missing.push({ name: item.name, count: need, constructing, merge: !!item.levels[0]?.merge_requirement });
      const stillNeeded = need - constructing;
      if (stillNeeded > 0 && !item.levels[0]?.merge_requirement) {
        const level = item.levels[0];
        tasks.push({ id: `place-${id}`, name: item.name, level: 0, nextLevel: 1, target: 1, count: stillNeeded,
          category: 'Unlocks', rank: item.type === 'Army' ? 12 : 28, time: level?.build_time ?? 0, cost: level?.build_cost ?? 0,
          resource: item.upgrade_resource, reason: 'Place the new building or trap. New capabilities come first, and required placements can block the next Town Hall.' });
      }
    }
  }

  const campItem = find('Army Camp');
  const campTarget = maxLevel(campItem, v.th);
  const campExpected = expected.get(campItem.id) ?? 0;
  const campsDone = total('Army Camp', campTarget);
  const ccTarget = maxLevel(find('Clan Castle'), v.th);
  const hhTarget = maxLevel(find('Hero Hall'), v.th);
  const coreKnown = v.present.buildings;
  const coreDone = coreKnown && campsDone >= campExpected && current('Clan Castle') >= ccTarget && (v.th < 4 || current('Hero Hall') >= hhTarget);
  check('camps', 'Army Camps at this TH’s cap', coreKnown ? `${campsDone}/${campExpected} camps at level ${campTarget}` : 'Building levels missing', coreKnown ? (campsDone >= campExpected ? 'done' : 'todo') : 'unknown');
  check('castle', 'Clan Castle capacity', coreKnown ? `Level ${current('Clan Castle')} / ${ccTarget}` : 'Building level missing', coreKnown ? (current('Clan Castle') >= ccTarget ? 'done' : 'todo') : 'unknown');
  if (v.th >= 4) check('hall', 'Hero Hall for this TH', coreKnown ? `Level ${current('Hero Hall')} / ${hhTarget}` : 'Building level missing', coreKnown ? (current('Hero Hall') >= hhTarget ? 'done' : 'todo') : 'unknown');
  check('placements', 'Required buildings and traps placed', !coreKnown ? 'Full village export needed' : missing.length ? missing.map(m => `${m.count}× ${m.name}${m.constructing ? ' (building)' : ''}`).join(', ') : 'All tracked placements complete', !coreKnown || !v.present.traps || v.unknown.length ? 'unknown' : missing.length ? 'todo' : 'done');

  building('Army Camp', 10, 'Offense', 'More troop capacity improves every attack. Finish all camps at this Town Hall before moving on.');
  building('Clan Castle', 11, 'Offense', 'Extra donated troops, spells, and siege capacity are immediate offensive power.');
  building('Blacksmith', 14, 'Offense', 'Unlock equipment levels and ore capacity. Do not let scarce ore overflow.');
  building('Hero Hall', v.th <= 13 ? 13 : 25, 'Offense', 'Unlock heroes and their level caps. The guide’s Tee Rush also keeps this on the path to the next Town Hall.');

  // Only the source towers needed for missing merges are upgraded, never every cannon or archer tower.
  if (v.th >= 16 && v.th < data.meta.maxTownHall && coreKnown) {
    for (const mergeName of ['Ricochet Cannon', 'Multi-Archer Tower', ...(v.th >= 17 ? ['Multi-Gear Tower'] : [])]) {
      const item = find(mergeName), targetCount = expected.get(item.id) ?? 0;
      const need = targetCount - count(mergeName);
      if (need <= 0) continue;
      const mergeReq = item.levels[0].merge_requirement;
      const allocated = new Set();
      let sourcesReady = true;
      const sourceSummary = [];
      for (const req of mergeReq) {
        let remaining = need;
        const candidates = rows(req.name).filter(row => !!row.gear === !!req.geared_up).sort((a,b) => b.level - a.level);
        for (const row of candidates) {
          const used = allocated.has(row.uid) ? (row._mergeUsed ?? 0) : 0;
          const available = Math.max(0, row.count - used);
          if (!available || !remaining) continue;
          const take = Math.min(remaining, available);
          remaining -= take;
          row._mergeUsed = used + take; allocated.add(row.uid);
          if (row.level < req.level) {
            sourcesReady = false;
            task({ ...row, count: take, uid: `${row.uid}-${mergeName}-${used}` }, req.level, 22, 'TH blockers', `Prepare ${take} source ${req.name}${take > 1 ? 's' : ''} for ${mergeName}. Only the required merge sources need these levels.`, { mergeSource: true });
            if (row.upgrading && row.planned === req.level) sourcesReady = false;
          }
        }
        if (remaining) sourcesReady = false;
        sourceSummary.push(`${need}× ${req.geared_up ? 'geared ' : ''}${req.name} level ${req.level}`);
      }
      tasks.push({ id: `merge-${item.id}`, name: mergeName, level: 0, nextLevel: 1, target: 1, count: need, category: 'TH blockers', rank: sourcesReady ? 21 : 29,
        time: item.levels[0].build_time, cost: item.levels[0].build_cost, resource: item.upgrade_resource,
        blocked: !sourcesReady, reason: sourcesReady ? 'The source towers are ready. Merge them to clear a Town Hall requirement.' : `First prepare ${sourceSummary.join(' + ')}. The game also checks gear-up requirements.` });
    }
    if (v.th === 16) {
      building('Eagle Artillery', 22, 'TH blockers', 'The Eagle must reach level 7 before it can be merged into Town Hall 17.', 7);
      check('eagle', 'Eagle ready for the TH17 merge', `Level ${current('Eagle Artillery')} / 7`, current('Eagle Artillery') >= 7 ? 'done' : 'todo');
    }
    const needed = v.th === 16 ? 2 : 3;
    check('merged', 'Ricochet Cannons and Multi-Archer Towers', `${count('Ricochet Cannon')}/${needed} Ricochets · ${count('Multi-Archer Tower')}/${needed} Multi-Archers`, count('Ricochet Cannon') >= needed && count('Multi-Archer Tower') >= needed ? 'done' : 'todo');
    if (v.th === 17) check('gear', 'Multi-Gear Tower built', `${count('Multi-Gear Tower')} / 1`, count('Multi-Gear Tower') ? 'done' : 'todo');
  }
  if (v.th >= 12 && v.th < 18) {
    check('giga', 'Town Hall weapon requirements', v.townHall?.weapon != null ? `Exported weapon level ${v.townHall.weapon}. Confirm its required cap on the in-game upgrade screen.` : 'Weapon level missing. Check the Giga weapon in game.', 'unknown');
    if (v.th === 17) tasks.push({ id: 'giga', name: 'Giga Artillery', level: v.townHall?.weapon, target: null, count: 1, rank: 23, category: 'TH blockers', manual: true,
      reason: 'Keep the TH17 weapon upgrading. The guide calls this out as an easy-to-miss TH18 blocker; confirm its next level in game.' });
  }

  building('Laboratory', 31, 'Offense', 'Upgrade when it unlocks levels for your chosen research. The lab can keep researching during its building upgrade.');
  building('Barracks', 34, 'Offense', 'Unlock the troops your chosen farming or war army needs. Skip unrelated levels until they serve your army.');
  building('Spell Factory', 33, 'Offense', 'Prioritize spell capacity and the spells your farming or war army needs.');
  building('Dark Barracks', 38, 'Offense', 'Unlock relevant troops; this is conditional on the army you actually use.');
  building('Dark Spell Factory', 36, 'Offense', 'Unlock useful spells for your chosen army, rather than delaying the rush to finish everything.');
  building('Pet House', 39, 'Offense', 'Unlock pet slots and useful pets. Even level 1 pets can strengthen your CWL attacks.');
  for (const name of ['Elixir Storage', 'Gold Storage', 'Dark Elixir Storage']) building(name, 44, 'Resources', 'Upgrade enough storage to afford your next offensive upgrades and the next Town Hall. Full storage caps are a useful fallback, not a reason to delay the rush.');
  building('Workshop', 43, 'Offense', 'Unlock siege machines for your attacks and clan donations. Match levels to machines you use.');

  const heroOrder = ['Archer Queen','Grand Warden','Royal Champion','Minion Prince','Dragon Duke','Barbarian King'];
  const allHeroRows = [...v.heroes];
  if (v.present.heroes && coreKnown) {
    for (const item of data.heroes) {
      if (!allHeroRows.some(row => row.id === item.id) && item.production_building_level <= current('Hero Hall')) allHeroRows.push({ item, id: item.id, name: item.name, level: 0, count: 1, timer: 0, planned: 0, upgrading: false, uid: `unlock-hero-${item.id}` });
    }
  }
  for (const row of allHeroRows) {
    const target = maxLevel(row.item, v.th);
    const next = row.item.levels.find(l => l.level === row.planned + 1);
    const eightDay = row.item.levels.find(l => l.upgrade_time >= 8 * DAY)?.level;
    const untilEight = row.item.levels.filter(l => l.level > row.planned && l.level < eightDay).reduce((sum,l) => sum + (l.upgrade_time ?? 0), 0);
    const inBookRange = next && next.upgrade_time >= 8 * DAY;
    const hallNeeded = next?.required_hero_tavern_level ?? row.item.production_building_level;
    const blocked = coreKnown && current('Hero Hall') < hallNeeded;
    heroTrack.push({ ...row, target, eightDay, untilEight, inBookRange, blocked, hallNeeded, nextTime: next?.upgrade_time ?? 0, atCap: row.level >= target });
  }
  const candidates = heroTrack.filter(row => row.planned < row.target);
  const preferred = [...candidates].sort((a,b) => heroOrder.indexOf(a.name) - heroOrder.indexOf(b.name));
  let primary = v.th === data.meta.maxTownHall ? preferred.find(row => !row.inBookRange) ?? preferred[0] : candidates.find(row => row.name === 'Archer Queen' && !row.inBookRange);
  if (!primary) primary = candidates.filter(row => !row.inBookRange).sort((a,b) => a.untilEight - b.untilEight)[0] ?? preferred[0];
  candidates.forEach(row => {
    const main = primary?.id === row.id;
    const index = heroOrder.indexOf(row.name);
    const rank = main ? 1 : v.th === data.meta.maxTownHall ? 16 + Math.max(index, 0) : 50 + Math.max(index, 0);
    const reason = options.cwl ? 'CWL mode: keep the heroes used in your war army awake. Put this builder on a benched hero, then resume the main hero after your attacks.' : main ? 'Keep one builder on this hero continuously, using the Builder Apprentice here. Reach the 8-day upgrade range for better Book of Heroes value.' : row.inBookRange ? 'This hero has reached 8-day upgrades. A good Book of Heroes target; keep a builder on another hero if you can.' : v.th === data.meta.maxTownHall ? 'At the maximum Town Hall, run at least two hero upgrades together when possible. The guide favors Queen, Warden, then Champion.' : 'A second hero is useful when builders and loot allow. Keep the main hero and offensive buildings moving first.';
    task(row, row.target, options.cwl && main ? 49 : rank, 'Heroes', reason, { blocked: row.blocked, book: row.inBookRange, primary: main });
  });

  const training = options.army ?? 'dragons';
  const labNames = ['Barbarian', 'Goblin', 'Lightning Spell', ...(training === 'dragons' ? ['Dragon', 'Totem Spell', 'Rage Spell'] : training === 'ground' ? ['Yeti', 'Clone Spell', 'Rage Spell'] : []), 'Balloon'];
  const trainingByName = new Map([...v.troops, ...v.spells].map(row => [key(row.name), row]));
  for (const name of [...new Set(labNames)]) {
    const row = trainingByName.get(key(name));
    if (!row) continue;
    const target = maxLevel(row.item, v.th);
    const next = row.item.levels.find(l => l.level === row.planned + 1);
    if (row.planned >= target || !next) continue;
    const labNeeded = next.required_lab_level ?? 0;
    research.push({ ...row, target, nextLevel: next.level, time: next.upgrade_time, cost: next.upgrade_cost, resource: row.item.upgrade_resource,
      blocked: coreKnown && current('Laboratory') < labNeeded, labNeeded,
      reason: ['Barbarian','Goblin','Lightning Spell'].includes(name) ? 'Farming first. Improve reliable loot income; Barbarian and Goblin levels also unlock their Super Troop options.' : name === 'Balloon' ? 'A common donation troop. Keep one useful donation option upgraded for your clan.' : 'One focused war army. Avoid spreading lab time across troops you do not use.' });
  }
  // The research that actually needs a lab level takes precedence over conditional building upgrades.
  if (research.some(row => row.blocked)) for (const t of tasks.filter(t => t.name === 'Laboratory')) { t.rank = 30; t.reason = 'Your selected research is blocked by the Laboratory level. Upgrade it to open the next useful troop or spell level.'; }

  const petOrder = ['Frosty','Phoenix','Sneezy','Angry Jelly','Electro Owl','Unicorn','Spirit Fox','Raven','Mighty Yak','Poison Lizard','Diggy','L.A.S.S.I'];
  for (const row of v.pets) {
    const target = maxLevel(row.item, v.th), next = row.item.levels.find(l => l.level === row.planned + 1);
    if (row.planned >= target || !next) continue;
    petTrack.push({ ...row, target, time: next.upgrade_time, cost: next.upgrade_cost, resource: row.item.upgrade_resource,
      blocked: coreKnown && current('Pet House') < (next.required_pet_house_level ?? 1),
      priority: petOrder.indexOf(row.name) < 0 ? 99 : petOrder.indexOf(row.name), reason: row.name === 'L.A.S.S.I' ? 'Low priority in this guide. Save Dark Elixir for heroes and pets you use.' : 'Follow the guide’s pet order only when the pet fits your actual hero and army setup.' });
  }
  petTrack.sort((a,b) => a.priority - b.priority);

  const chosen = new Set(options.equipment ?? []);
  for (const row of v.equipment) {
    const target = maxLevel(row.item, v.th), next = row.item.levels.find(l => l.level === row.level + 1);
    equipment.push({ ...row, hero: row.item.hero, rarity: row.item.rarity, target, selected: chosen.has(String(row.id)),
      cost: next?.upgrade_cost, blocked: coreKnown && current('Blacksmith') < (next?.required_blacksmith_level ?? 1) });
  }
  equipment.sort((a,b) => Number(b.selected) - Number(a.selected) || String(a.hero).localeCompare(String(b.hero)) || a.name.localeCompare(b.name));

  if (v.th === data.meta.maxTownHall) {
    for (const name of ['Monolith','Revenge Tower','Scattershot','Inferno Tower','X-Bow','Ricochet Cannon','Multi-Archer Tower']) building(name, 70, 'Core defenses', 'After offensive unlocks and heroes: prepare core defenses for long Book or Hammer upgrades. Short catch-up levels can fill remaining builder time.');
  }
  const blockers = checks.filter(c => c.state === 'todo');
  const unknowns = checks.filter(c => c.state === 'unknown');
  const isMax = v.th === data.meta.maxTownHall;
  let status = isMax ? 'You’ve reached the destination.' : !coreKnown ? 'Import buildings to check your next Town Hall.' : blockers.length ? 'Clear the essentials. Keep the rush moving.' : unknowns.length ? 'Offense looks ready. Confirm the game’s requirements.' : 'Ready to move up.';
  let statusDetail = isMax ? 'Finish offensive unlocks, run multiple hero upgrades, then prepare core defenses for magic items.' : !coreKnown ? 'Hero and research advice is available, but a player profile does not include your building levels.' : blockers.length ? `${blockers.length} checklist items still need work. Keep one hero upgrading while you finish capacity and required placements.` : 'The guide does not ask you to max defenses, heroes, equipment, or the entire lab before upgrading your Town Hall.';
  if (!isMax && coreKnown && coreDone && !blockers.length && !v.townHall?.upgrading) tasks.push({ id: 'townhall', name: 'Town Hall', level: v.th, target: v.th + 1, nextLevel: v.th + 1, count: 1, rank: 19, category: 'Rush', manual: !!unknowns.length,
    time: thItem.levels.find(l => l.level === v.th + 1)?.build_time, cost: thItem.levels.find(l => l.level === v.th + 1)?.build_cost, resource: 'Gold',
    reason: unknowns.length ? 'Your capacity upgrades are done. Confirm the remaining in-game requirements, then move up while the main hero keeps upgrading.' : 'Your tracked essentials are finished. Start the next Town Hall and work on heroes, unlocks, and storages while it builds.' });
  tasks.sort((a,b) => a.rank - b.rank || Number(a.blocked) - Number(b.blocked) || a.name.localeCompare(b.name));
  const bookHeroes = heroTrack.filter(row => row.nextTime >= 8 * DAY && row.planned < row.target && !row.blocked).sort((a,b) => b.nextTime - a.nextTime);
  const longBuildings = tasks.filter(t => t.time > 0 && t.category !== 'Heroes' && !t.blocked && !t.manual).sort((a,b) => b.time - a.time);
  return { tasks, deferred, checks, heroTrack, research, petTrack, equipment, active, builderCount, busy, free: Math.max(0,builderCount - busy),
    primary, status, statusDetail, isMax, blockers, unknowns, missing, boost,
    magic: { hero: bookHeroes[0] ?? heroTrack.filter(h => h.planned < h.target && !h.blocked && h.nextTime > 0).sort((a,b) => b.nextTime - a.nextTime)[0], building: longBuildings[0] },
    milestone: v.th < 11 ? 'TH11: Warden + Super Troops' : v.th < 16 ? 'TH16: war ore + merge defenses' : v.th < 18 ? 'TH18: long upgrade value' : 'Finish offense, then core defenses' };
}
