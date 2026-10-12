import { parseVillage, analyzeVillage, maxLevel, formatDuration, GUIDE_URL, DAY } from './engine.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const storageKey = 'rush-helper-v1';
let data, village, plan, rawVillage, demo = false, filter = 'All', activeTab = 'queue', heroFilter = 'All';
let selectedEquipment = new Set();
const number = value => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
function options() { return { builders: $('builders').value === 'auto' ? undefined : Number($('builders').value), army: $('army').value, boost: Number($('boost').value), cwl: $('cwl').checked, equipment: [...selectedEquipment] }; }
function cost(value, resource) {
  if (value && typeof value === 'object') return Object.entries(value).filter(([,n]) => n > 0).map(([name,n]) => `${number(n)} ${name.replace('_ore', '').replace('shiny','shiny ore').replace('glowy','glowy ore').replace('starry','starry ore')}`).join(' · ') || 'Check in game';
  return value > 0 ? `${number(Math.ceil(value * (1 - plan.boost)))} ${esc(resource ?? '')}` : 'Check cost in game';
}
function time(seconds) { return seconds > 0 ? formatDuration(Math.ceil(seconds * (1 - plan.boost))) : 'Check time in game'; }
function pill(text, color='green') { return `<span class="pill ${color}">${esc(text)}</span>`; }
function note(text) { return `<p class="note">${esc(text)}</p>`; }
function showError(message) { $('error').textContent = message; $('error').hidden = false; }
function save() {
  try {
    if ($('remember').checked && rawVillage && !demo) localStorage.setItem(storageKey, JSON.stringify({ village: rawVillage, options: options() }));
    else localStorage.removeItem(storageKey);
  } catch { if ($('remember').checked) showError('Your browser blocked local storage. The plan still works, but this village cannot be remembered.'); }
}
function reset() {
  village = plan = rawVillage = null;
  selectedEquipment.clear();
  $('village-json').value = '';
  $('remember').checked = false;
  $('error').hidden = true;
  $('results').hidden = true;
  $('empty-state').hidden = false;
  $('analyze').innerHTML = 'Build my rush plan <span aria-hidden="true">↗</span>';
  save();
}
function importVillage(raw, isDemo=false, retainSelection=false) {
  if (!data) return;
  $('error').hidden = true;
  try {
    village = parseVillage(raw, data);
    rawVillage = typeof raw === 'string' ? JSON.parse(raw.replace(/^\uFEFF/, '')) : raw;
    demo = isDemo;
    if (!retainSelection) selectedEquipment = new Set();
    filter = 'All'; heroFilter = 'All';
    activeTab = 'queue';
    updatePlan();
    $('empty-state').hidden = true;
    $('results').hidden = false;
    $('analyze').innerHTML = 'Refresh my plan <span aria-hidden="true">↗</span>';
    save();
  } catch (error) {
    village = plan = rawVillage = null;
    $('results').hidden = true;
    $('empty-state').hidden = false;
    showError(error.message);
  }
}
function updatePlan() {
  if (!village) return;
  plan = analyzeVillage(village, data, options());
  $('village-name').textContent = village.name;
  $('village-tag').textContent = village.tag || (village.present.buildings ? 'Home Village export' : 'Partial player profile');
  $('demo-badge').hidden = !demo;
  $('th-badge').innerHTML = `<span>TH</span><strong>${village.th}</strong>`;
  $('village-stats').innerHTML = `<div class="stat"><small>BUILDERS</small><strong>${plan.free} free / ${plan.builderCount} total</strong></div><div class="stat"><small>HERO FOCUS</small><strong>${esc(plan.primary?.name ?? 'At TH cap')}</strong></div><div class="stat"><small>NEXT MILESTONE</small><strong>${esc(plan.milestone)}</strong></div>`;
  $('status-card').innerHTML = `<h3>${esc(plan.status)}</h3><p>${esc(plan.statusDetail)}</p>`;
  const warnings = [...village.warnings];
  if (plan.busy > plan.builderCount) warnings.push('More active upgrades than regular builders were detected. An extra builder or an incomplete snapshot may be involved.');
  if (village.townHall?.upgrading) warnings.unshift(`Town Hall ${village.th + 1} is already upgrading. This plan uses the current TH${village.th} caps; reimport when the upgrade finishes.`);
  $('warnings').innerHTML = warnings.length ? `<details class="warning-box"><summary>${warnings.length} data ${warnings.length === 1 ? 'note' : 'notes'} — read before acting</summary><ul>${warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></details>` : '';
  renderQueue(); renderTownHall(); renderHeroes(); renderEquipment(); switchTab(activeTab);
  $('plan-count').textContent = `${plan.tasks.length} priorities · Timers reflect the export${plan.boost ? ` · ${Math.round(plan.boost * 100)}% discount applied` : ' · Base costs & times'}`;
}
function taskHTML(task, index, deferred=false) {
  const target = task.target == null ? 'Check in game' : `Lv ${task.level ?? '?'} → ${task.nextLevel ?? task.target}${task.nextLevel < task.target ? ` / ${task.target}` : ''}`;
  const label = task.blocked ? pill('PREREQUISITE FIRST','orange') : task.manual ? pill('VERIFY IN GAME','gold') : task.book ? pill('BOOK VALUE','gold') : pill(task.category.toUpperCase(),'gray');
  return `<article class="task ${index === 0 && !deferred ? 'first' : ''} ${deferred ? 'waiting' : ''}"><span class="rank">${deferred ? '◷' : String(index+1).padStart(2,'0')}</span><div class="task-body"><div class="task-title"><h4>${task.count > 1 ? `${task.count}× ` : ''}${esc(task.name)}</h4><span class="task-level">${esc(target)}</span></div><p>${esc(task.reason)}</p><div class="task-meta">${label}${task.time > 0 ? `<span>◷ ${time(task.time)}${task.count > 1 ? ' each' : ''}</span>` : ''}${task.cost > 0 ? `<span>${cost(task.cost, task.resource)}${task.count > 1 ? ' each' : ''}</span>` : ''}${deferred ? `<span>After current upgrade (${formatDuration(task.timer)} at export)</span>` : ''}</div></div></article>`;
}
function renderQueue() {
  const availableFilters = ['All', ...new Set(plan.tasks.map(task=>task.category))];
  if (!availableFilters.includes(filter)) filter = 'All';
  const filtered = plan.tasks.filter(task=>filter === 'All' || task.category === filter);
  let html = `<div class="queue-filters" aria-label="Filter upgrades">${availableFilters.map(name=>`<button data-filter="${esc(name)}" class="${filter === name ? 'active' : ''}" aria-pressed="${filter === name}">${esc(name)}</button>`).join('')}</div>`;
  html += `<div class="subheading"><h3>${filter === 'All' ? 'Your priority order' : esc(filter)}</h3><span>One step at a time</span></div>`;
  if (options().cwl) html += note('CWL mode: keep your actual war lineup awake. Use a benched hero for continuous upgrades, then return to your main hero after CWL.');
  html += filtered.length ? filtered.map(task=>taskHTML(task, plan.tasks.indexOf(task))).join('') : note('No upgrades in this section. Check the other tracks, or import a fresh export after your running upgrades finish.');
  if (filter === 'All' && plan.deferred.length) html += `<details class="how-to"><summary>After current upgrades finish <span>${plan.deferred.length} priorities</span></summary>${plan.deferred.map((task,index)=>taskHTML(task,index,true)).join('')}</details>`;
  if (filter === 'All' && plan.active.length) html += `<div class="subheading"><h3>Already working</h3><span>Remaining time at export</span></div>${plan.active.map(row=>`<div class="active-row"><strong>${row.count > 1 ? `${row.count}× ` : ''}${esc(row.name)} · Lv ${row.level} → ${row.planned}</strong><span>${formatDuration(row.timer)}</span></div>`).join('')}`;
  if (filter === 'All') {
    html += `<div class="subheading"><h3>Keep the lab moving</h3><span>Separate from builders</span></div>`;
    html += !village.present.troops && !village.present.spells ? note('Troop and spell levels are missing. Import the village export to get specific research suggestions.') : plan.research.length ? plan.research.map(row=>`<article class="lab-row"><span class="lab-dot" aria-hidden="true">⌁</span><div><h4>${esc(row.name)} <span class="task-level">Lv ${row.planned} → ${row.planned + 1} / ${row.target}</span></h4><p>${esc(row.reason)}</p><small>${row.upgrading ? `Currently researching · ${formatDuration(row.timer)} at export · then ` : ''}${row.blocked ? `Needs Laboratory ${row.labNeeded} · ` : ''}${time(row.time)} · ${cost(row.cost,row.resource)}</small></div></article>`).join('') : note('Your selected farming and war research is at its tracked cap. Work on one army and useful donations; the entire lab is not a Town Hall gate.');
    const runningResearch = [...village.troops,...village.spells].filter(row=>row.upgrading);
    if (runningResearch.length) html += note(`Research already running: ${runningResearch.map(row=>`${row.name} (${formatDuration(row.timer)} at export)`).join(', ')}. Queue new research after it finishes.`);
    if (village.th >= 14) {
      html += `<div class="subheading"><h3>The pet track</h3><span>Separate Pet House queue</span></div>`;
      html += plan.petTrack.length ? plan.petTrack.slice(0,6).map(row=>`<article class="lab-row"><span class="lab-dot" aria-hidden="true">◇</span><div><h4>${esc(row.name)} <span class="task-level">Lv ${row.planned} → ${row.planned+1} / ${row.target}</span></h4><p>${esc(row.reason)}</p><small>${row.upgrading ? `Already upgrading · ${formatDuration(row.timer)} at export · then ` : ''}${row.blocked ? 'Pet House upgrade needed · ' : ''}${time(row.time)} · ${cost(row.cost,row.resource)}</small></div></article>`).join('') : note(village.present.pets ? 'No tracked pet upgrades at this TH. Unlock useful pets with the Pet House as you move up.' : 'Pet levels are missing. Import a full village export for this track.');
    }
    html += note(plan.isMax ? 'Once offense and hero work are covered, use remaining builders on short catch-up upgrades, then core defenses. Reserve long upgrades for Books and Hammers.' : 'Leave routine defense levels for later. Cannons, Archer Towers, and the Eagle become urgent when they are needed for Town Hall merges. Walls are a spare-resource sink, not a reason to stop the rush.');
  }
  $('panel-queue').innerHTML = html;
}
function renderTownHall() {
  let html = `<div class="subheading"><h3>${plan.isMax ? 'You’re at the guide’s maximum TH' : `The path to Town Hall ${village.th+1}`}</h3><span>Guide essentials + game gates</span></div>`;
  html += note(plan.isMax ? 'The rush phase is finished. Complete offensive unlocks, work on multiple heroes, and use magic items on long core upgrades.' : 'Camps, Clan Castle, Hero Hall, and required placements are the Tee Rush essentials. Keep your main hero moving; you do not need max heroes or a maxed lab to advance.');
  html += plan.checks.map(check=>`<div class="check-row"><span class="check-icon ${check.state}" aria-label="${check.state === 'done' ? 'Complete' : check.state === 'unknown' ? 'Needs verification' : 'Needs work'}">${check.state === 'done' ? '✓' : check.state === 'unknown' ? '?' : '↑'}</span><div><h4>${esc(check.label)}</h4><p>${esc(check.detail)}</p></div></div>`).join('');
  if (!plan.isMax) html += note('Final check: open the next Town Hall upgrade in Clash. The game checks weapon levels, mandatory placements, merges, and storage capacity. Those rules can change; this checklist cannot certify every game requirement.');
  $('panel-townhall').innerHTML = html;
}
function renderHeroes() {
  let html = `<div class="subheading"><h3>A builder for the long game</h3><span>8-day timers before discounts</span></div>`;
  html += note(village.th < data.meta.maxTownHall ? 'Keep one hero upgrading continuously. The guide starts with Archer Queen, uses the Builder Apprentice on her, and changes focus when she reaches 8-day upgrades.' : 'At the maximum Town Hall, aim for at least two heroes upgrading at once. Queen and Warden lead; Champion is a useful next focus. Keep the heroes you need for CWL awake.');
  html += plan.heroTrack.length ? [...plan.heroTrack].sort((a,b)=>Number(b.id===plan.primary?.id)-Number(a.id===plan.primary?.id)).map(row=>`<article class="hero-card"><div class="hero-card-header"><h4>${esc(row.name)}</h4>${row.id === plan.primary?.id ? pill('MAIN FOCUS') : row.atCap ? pill('AT TH CAP','gray') : row.inBookRange ? pill('BOOK RANGE','gold') : ''}</div><div class="progress" role="progressbar" aria-label="${esc(row.name)} progress to TH cap" aria-valuenow="${row.level}" aria-valuemin="0" aria-valuemax="${row.target}"><span style="width:${Math.min(100,row.level/row.target*100)}%"></span></div><p><small>Lv ${row.level} / ${row.target} at TH${village.th}</small>${row.upgrading ? ` · Upgrading to ${row.planned} (${formatDuration(row.timer)} at export)` : ''}${row.blocked ? ` · Needs Hero Hall ${row.hallNeeded}` : ''}</p><p>${row.atCap ? 'This hero is capped for your current Town Hall. Move up to keep progressing.' : row.inBookRange ? 'Next upgrade is in the 8-day range. Use Books here while another hero makes manual progress.' : row.eightDay ? `8-day upgrades begin at level ${row.eightDay}. ${formatDuration(row.untilEight)} of base manual upgrades to reach that range, across future Town Halls.` : 'No 8-day timer is listed in this snapshot. Keep building hero strength while prioritizing offense.'}</p></article>`).join('') : note('Hero levels are missing or heroes are not unlocked yet. Import a complete village export to personalize this section.');
  html += `<div class="subheading"><h3>Make magic items count</h3><span>Use overflow, avoid waste</span></div>`;
  if (plan.magic.hero) html += `<div class="magic-card"><h4>Book of Heroes → ${esc(plan.magic.hero.name)}</h4><p>${formatDuration(plan.magic.hero.nextTime)} base next-upgrade timer. ${plan.magic.hero.nextTime >= 8*DAY ? 'This is in the guide’s ideal value range.' : 'Not in 8-day range yet. Save books when you can, but use an overflowing book on your longest available hero upgrade.'} Confirm Hero Hall access and resources before using a book.</p></div>`;
  if (plan.magic.building) html += `<div class="magic-card"><h4>Building Book / Hammer candidate → ${esc(plan.magic.building.name)}</h4><p>${time(plan.magic.building.time)} for the next level. This is the longest available building step in your priority list. Prefer offensive value and required TH gates; keep using your normal builders.</p></div>`;
  html += note(village.bob ? 'B.O.B’s Hut is present: the sixth Home Village builder has been detected.' : 'The sixth builder is a permanent boost. Work toward B.O.B in Builder Base alongside your rush; this tool’s upgrade queue covers the Home Village.');
  $('panel-heroes').innerHTML = html;
}
function renderEquipment() {
  const heroes = [...new Set(plan.equipment.map(row=>row.hero))].sort();
  let html = `<div class="subheading"><h3>Pick a core. Give it your ore.</h3><span>${selectedEquipment.size} / 10 selected</span></div>`;
  html += note('Choose the 8–10 pieces you actually use, usually two per active hero. Focus ore on that core instead of spreading it across every item. The guide leaves exact choices to your army and the current meta.');
  if (!plan.equipment.length) html += note('No equipment levels were found. Equipment unlocks start with the Blacksmith at TH8; use a complete village export when you have it.');
  else {
    html += `<div class="equipment-toolbar"><span>Select your core equipment</span><label class="sr-only" for="equipment-hero">Filter by hero</label><select id="equipment-hero"><option value="All">All heroes</option>${heroes.map(name=>`<option value="${esc(name)}" ${heroFilter===name ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></div><p id="equipment-feedback" class="fine-print" role="status">${selectedEquipment.size ? 'Selected items appear first. Costs below are for the next level.' : 'No core selected yet. Your choices stay with this plan.'}</p>`;
    html += plan.equipment.filter(row=>heroFilter==='All'||row.hero===heroFilter).map(row=>`<label class="equipment-row"><input type="checkbox" data-equipment="${row.id}" ${row.selected?'checked':''} aria-label="Focus ore on ${esc(row.name)}"><div><h4>${esc(row.name)}${pill(row.rarity, row.rarity==='Epic'?'gold':'gray')}</h4><p>${esc(row.hero)}${row.blocked && row.level < row.target ? ' · Blacksmith upgrade needed' : ''}</p>${row.selected && row.level<row.target && row.cost ? `<p>Next: ${cost(row.cost)}${row.blocked ? ' · unlock required' : ''}</p>` : ''}</div><span>Lv ${row.level} / ${row.target}</span></label>`).join('');
    const allSelected = plan.equipment.filter(row=>row.selected && row.level<row.target);
    if (allSelected.length) html += note(`Your ore focus: ${allSelected.map(row=>`${row.name} ${row.level} → ${row.level+1}`).join(' · ')}. Ore balances are not inferred; check what you can afford in game.`);
  }
  html += note('Hero Journey rewards, chest timing, ore income, and event equipment need personal judgment. This quick planner does not simulate those systems.');
  $('panel-equipment').innerHTML = html;
}
function switchTab(name, focus=false) {
  activeTab = name;
  document.querySelectorAll('[data-tab]').forEach(button=>{
    const selected = button.dataset.tab === name;
    button.setAttribute('aria-selected',String(selected)); button.tabIndex = selected?0:-1;
    $(`panel-${button.dataset.tab}`).hidden = !selected;
    if (focus&&selected) button.focus();
  });
}
function sample() {
  if (!data) return;
  const th = 13, thItem = data.buildings.find(item=>item.name === 'Town Hall'), quantities = new Map();
  for (const level of thItem.levels.filter(l=>l.level<=th)) for (const unlock of level.unlocks??[]) quantities.set(unlock._id,(quantities.get(unlock._id)??0)+unlock.quantity);
  const buildings = [{data:1000001,lvl:th,weapon:5}], traps = [];
  for (const [id,cnt] of quantities) {
    if ([1000064,1000093].includes(id)) continue;
    const item=data.buildings.find(item=>item.id===id)??data.traps.find(item=>item.id===id);
    if (!item) continue;
    const cap=maxLevel(item,th);
    const lvl = item.name==='Army Camp'?cap-1:item.name==='Clan Castle'?cap-1:item.name==='Blacksmith'?cap-1:item.name==='Hero Hall'?cap:item.type==='Defense'?Math.max(1,cap-4):Math.max(1,cap-1);
    const row={data:id,lvl,cnt};
    if (data.traps.some(item=>item.id===id)) traps.push(row);else buildings.push(row);
  }
  const raw={name:'The uphill village',tag:'#SAMPLE',timestamp:Math.floor(Date.now()/1000),buildings,traps,
    heroes:[{data:28000000,lvl:40,timer:58000},{data:28000001,lvl:55},{data:28000002,lvl:25},{data:28000004,lvl:10},{data:28000006,lvl:35}],
    units:data.troops.filter(item=>['Barbarian','Goblin','Dragon','Balloon','Yeti'].includes(item.name)).map(item=>({data:item.id,lvl:Math.max(1,maxLevel(item,th)-2)})),
    spells:data.spells.filter(item=>['Lightning Spell','Rage Spell','Clone Spell','Totem Spell'].includes(item.name)).map(item=>({data:item.id,lvl:Math.max(1,maxLevel(item,th)-1)})),
    pets:[],equipment:data.equipment.filter(item=>maxLevel(item,th)>0&&item.rarity==='Common').map(item=>({data:item.id,lvl:Math.min(6,maxLevel(item,th))}))};
  $('village-json').value=JSON.stringify(raw,null,2);
  importVillage(raw,true);
}
async function upload(file) {
  if (!file) return;
  if (file.size>5_000_000) { showError('Please choose a village JSON file under 5 MB.');return; }
  try { const value=await file.text();$('village-json').value=value;importVillage(value); } catch {showError('This file could not be read. Try pasting its JSON instead.');}
}

$('import-form').addEventListener('submit',event=>{event.preventDefault();importVillage($('village-json').value);});
$('clear-input').addEventListener('click',reset);
$('demo-button').addEventListener('click',sample);$('empty-demo').addEventListener('click',sample);
$('upload-button').addEventListener('click',()=>$('file-input').click());
$('file-input').addEventListener('change',event=>{upload(event.target.files[0]);event.target.value='';});
$('drop-zone').addEventListener('dragover',event=>{event.preventDefault();$('drop-zone').classList.add('dragover');});
$('drop-zone').addEventListener('dragleave',()=>$('drop-zone').classList.remove('dragover'));
$('drop-zone').addEventListener('drop',event=>{event.preventDefault();$('drop-zone').classList.remove('dragover');upload(event.dataTransfer.files[0]);});
$('remember').addEventListener('change',save);
for(const id of ['builders','army','boost','cwl']) $(id).addEventListener('change',()=>{updatePlan();save();});
document.querySelectorAll('[data-tab]').forEach(button=>{
  button.addEventListener('click',()=>switchTab(button.dataset.tab));
  button.addEventListener('keydown',event=>{
    const tabs=['queue','townhall','heroes','equipment'];let index=tabs.indexOf(activeTab);
    if(event.key==='ArrowRight')index=(index+1)%tabs.length;else if(event.key==='ArrowLeft')index=(index+3)%tabs.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=3;else return;
    event.preventDefault();switchTab(tabs[index],true);
  });
});
$('panel-queue').addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(button){filter=button.dataset.filter;renderQueue();}});
$('panel-equipment').addEventListener('change',event=>{
  if(event.target.id==='equipment-hero'){heroFilter=event.target.value;renderEquipment();return;}
  const id=event.target.dataset.equipment;if(!id)return;
  if(event.target.checked&&selectedEquipment.size>=10){event.target.checked=false;$('equipment-feedback').textContent='Keep your core to 10 pieces. Deselect one before adding another.';return;}
  if(event.target.checked)selectedEquipment.add(id);else selectedEquipment.delete(id);
  const scrollY=window.scrollY;updatePlan();window.scrollTo(0,scrollY);save();
});
$('download-plan').addEventListener('click',()=>{
  if(!plan)return;
  const lines=[`RUSH HELPER — ${village.name}${demo?' (SAMPLE VILLAGE)':''}`,`Town Hall ${village.th} · ${new Date().toLocaleDateString()}`,`Based on CallMeTee’s Rush Bible: ${GUIDE_URL}`,'',plan.status,plan.statusDetail,'','UPGRADE PRIORITIES'];
  plan.tasks.forEach((task,index)=>lines.push(`${index+1}. ${task.count>1?`${task.count}× `:''}${task.name}${task.target?` — ${task.level??'?'} → ${task.nextLevel??task.target} (target ${task.target})`:''}${task.blocked?' [prerequisite needed]':''}`,`   ${task.reason}`));
  lines.push('','TOWN HALL CHECKLIST');plan.checks.forEach(c=>lines.push(`[${c.state}] ${c.label}: ${c.detail}`));
  lines.push('','RESEARCH');plan.research.forEach(r=>lines.push(`${r.name}: ${r.planned} → ${r.planned+1} (target ${r.target})${r.blocked?` — needs Lab ${r.labNeeded}`:''}`));
  lines.push('','PETS');plan.petTrack.forEach(r=>lines.push(`${r.name}: ${r.planned} → ${r.planned+1} (target ${r.target})${r.blocked?' — Pet House upgrade needed':''}`));
  lines.push('','EQUIPMENT CORE');plan.equipment.filter(r=>r.selected).forEach(r=>lines.push(`${r.name}: ${r.level} / ${r.target}`));
  lines.push('','DATA NOTES',...village.warnings,'Timers reflect the imported snapshot. Confirm requirements and prices in game.');
  const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`rush-plan-th${village.th}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

try {
  const response=await fetch('./game-data.json');if(!response.ok)throw new Error('Game data could not load.');data=await response.json();
  $('analyze').disabled=false;$('analyze').innerHTML='Build my rush plan <span aria-hidden="true">↗</span>';
  try {
    const saved=JSON.parse(localStorage.getItem(storageKey)??'null');
    if(saved?.village){
      const opts=saved.options??{};$('builders').value=opts.builders??'auto';$('army').value=opts.army??'dragons';$('boost').value=opts.boost??0;$('cwl').checked=!!opts.cwl;$('remember').checked=true;
      selectedEquipment=new Set((opts.equipment??[]).slice(0,10));$('village-json').value=JSON.stringify(saved.village,null,2);importVillage(saved.village,false,true);
    }
  } catch { /* Storage is optional. An unreadable saved snapshot never prevents a new import. */ }
} catch {showError('The game data could not load. Refresh the page. If running locally, start the web server instead of opening index.html directly.');$('analyze').textContent='Game data unavailable';}
