import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';

const window = new Window({ url:'https://example.github.io/coc-rush-helper/',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true} });
window.document.write(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
const data=JSON.parse(readFileSync(new URL('../dist/game-data.json',import.meta.url)));
const fixture=JSON.parse(readFileSync(new URL('./fixtures/native-export.json',import.meta.url)));
globalThis.window=window;
globalThis.document=window.document;
globalThis.localStorage=window.localStorage;
globalThis.fetch=async url=>{
  assert.equal(new URL(url,window.location.href).href,'https://example.github.io/coc-rush-helper/game-data.json');
  return {ok:true,json:async()=>data};
};
await import('../dist/theme.js');
document.dispatchEvent(new window.Event('DOMContentLoaded'));
await import('../dist/app.js');
const $=id=>document.getElementById(id);
const change=element=>element.dispatchEvent(new window.Event('change',{bubbles:true}));
const submit=()=> $('import-form').dispatchEvent(new window.Event('submit',{cancelable:true}));

test('dark theme is the default and the toggle stores a separate preference',()=>{
  assert.equal(document.documentElement.dataset.theme,'dark');
  assert.equal($('theme-toggle').getAttribute('aria-label'),'Switch to light theme');
  $('theme-toggle').click();
  assert.equal(document.documentElement.dataset.theme,'light');
  assert.equal(localStorage.getItem('rush-helper-theme-v1'),'light');
  assert.equal(document.querySelector('meta[name="theme-color"]').content,'#f5f4ef');
  assert.equal($('theme-label').textContent,'Dark mode');
  $('clear-input').click();
  assert.equal(document.documentElement.dataset.theme,'light');
  assert.equal(localStorage.getItem('rush-helper-theme-v1'),'light');
  $('theme-toggle').click();
  assert.equal(document.documentElement.dataset.theme,'dark');
  assert.equal(localStorage.getItem('rush-helper-theme-v1'),'dark');
  localStorage.removeItem('rush-helper-theme-v1');
});

test('sample import renders a usable queue and supports accessible tabs',()=>{
  assert.equal($('analyze').disabled,false);
  $('demo-button').click();
  assert.equal($('error').hidden,true);
  assert.equal($('results').hidden,false);
  assert.equal($('demo-badge').hidden,false);
  assert.equal($('village-name').textContent,'The uphill village');
  assert.match($('panel-queue').textContent,/Archer Queen/);
  assert.match($('panel-queue').textContent,/Army Camp/);
  $('tab-townhall').click();
  assert.equal($('panel-queue').hidden,true);
  assert.equal($('panel-townhall').hidden,false);
  assert.equal($('tab-townhall').getAttribute('aria-selected'),'true');
  $('tab-townhall').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal($('panel-heroes').hidden,false);
  assert.equal(document.activeElement.id,'tab-heroes');
});
test('settings, filters, and explicit equipment choices update the plan',()=>{
  $('boost').value='20';change($('boost'));
  assert.match($('plan-count').textContent,/20% discount applied/);
  $('tab-queue').click();
  const button=[...document.querySelectorAll('[data-filter]')].find(b=>b.dataset.filter==='Offense');button.click();
  assert.equal(button.dataset.filter,'Offense');
  assert.equal(document.querySelectorAll('#panel-queue .task').length>0,true);
  assert.equal($('panel-queue').textContent.includes('Archer Queen'),false);
  $('tab-equipment').click();
  const checkbox=document.querySelector('[data-equipment]');checkbox.checked=true;change(checkbox);
  assert.match($('panel-equipment').textContent,/1 \/ 10 selected/);
  assert.match($('panel-equipment').textContent,/Your ore focus/);
  assert.equal(localStorage.length,0); // sample villages are never saved
});
test('real export import, optional persistence, and clear work end to end',()=>{
  $('village-json').value=JSON.stringify(fixture);submit();
  assert.equal($('error').hidden,true);
  assert.equal($('results').hidden,false);
  assert.equal($('demo-badge').hidden,true);
  assert.equal($('village-tag').textContent,'#TEST');
  assert.equal(localStorage.length,0);
  $('remember').checked=true;change($('remember'));
  assert.equal(JSON.parse(localStorage.getItem('rush-helper-v1')).village.tag,'#TEST');
  $('clear-input').click();
  assert.equal(localStorage.length,0);
  assert.equal($('village-json').value,'');
  assert.equal($('results').hidden,true);
});
test('invalid JSON clears stale results and imported names are escaped',()=>{
  const raw={...fixture,name:'<img src=x onerror=alert(1)>'};
  $('village-json').value=JSON.stringify(raw);submit();
  assert.equal($('results').hidden,false);
  assert.equal($('village-name').textContent,raw.name);
  assert.equal($('village-name').querySelector('img'),null);
  $('village-json').value='broken JSON';submit();
  assert.equal($('error').hidden,false);
  assert.match($('error').textContent,/valid JSON/);
  assert.equal($('results').hidden,true);
});
test('file upload imports a village and a plan can be downloaded',async()=>{
  const file={name:'village.json',size:100,text:async()=>JSON.stringify(fixture)};
  Object.defineProperty($('file-input'),'files',{value:[file],configurable:true});
  change($('file-input'));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal($('results').hidden,false);
  let filename,content;
  globalThis.URL.createObjectURL=blob=>{content=blob;return 'blob:test';};
  globalThis.URL.revokeObjectURL=()=>{};
  window.HTMLAnchorElement.prototype.click=function(){filename=this.download;};
  $('download-plan').click();
  assert.equal(filename,'rush-plan-th13.txt');
  assert.match(await content.text(),/UPGRADE PRIORITIES/);
  assert.match(await content.text(),/TOWN HALL CHECKLIST/);
  assert.match(await content.text(),/BUILDER BASE — SIXTH BUILDER/);
});
test('equipment core is capped at ten pieces',()=>{
  $('demo-button').click();$('tab-equipment').click();
  for(let i=0;i<10;i++){
    const input=[...document.querySelectorAll('[data-equipment]')].find(c=>!c.checked);assert.ok(input);input.checked=true;change(input);
  }
  const extra=[...document.querySelectorAll('[data-equipment]')].find(c=>!c.checked);extra.checked=true;change(extra);
  assert.equal(extra.checked,false);
  assert.match($('equipment-feedback').textContent,/Keep your core to 10/);
});

test('Builder Base has its own queue and is reachable with keyboard tab navigation',()=>{
  $('demo-button').click();$('tab-equipment').click();
  $('tab-equipment').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal($('panel-builder').hidden,false);
  assert.equal(document.activeElement.id,'tab-builder');
  assert.match($('panel-builder').textContent,/Rush toward Builder Hall 9/);
  assert.match($('panel-builder').textContent,/Battle Machine 18 \+ Battle Copter 15 = 33 \/ 45/);
  assert.match($('panel-builder').textContent,/Star Laboratory/);
  $('tab-builder').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal($('panel-queue').hidden,false);
  $('tab-heroes').click();document.querySelector('[data-open-builder]').click();
  assert.equal($('panel-builder').hidden,false);
});

test('missing Builder Base levels can be filled, validated, reset, and optionally remembered',()=>{
  $('village-json').value=JSON.stringify(fixture);submit();$('tab-builder').click();
  assert.equal($('builder-inputs').open,true);
  assert.equal($('builder-machine').placeholder,'Not in export');
  assert.match($('panel-builder').textContent,/Hero levels missing/);
  $('builder-machine').value='23';change($('builder-machine'));
  $('builder-copter').value='10';change($('builder-copter'));
  assert.equal($('builder-input-error').hidden,false);
  assert.match($('builder-input-error').textContent,/starts at level 15/);
  $('builder-copter').value='22';change($('builder-copter'));
  assert.equal($('builder-input-error').hidden,true);
  assert.match($('panel-builder').textContent,/Battle Machine 23 \+ Battle Copter 22 = 45 \/ 45/);
  assert.equal(localStorage.length,0);
  $('remember').checked=true;change($('remember'));
  assert.deepEqual(JSON.parse(localStorage.getItem('rush-helper-v1')).options.builderBase,{machine:23,copter:22});
  $('builder-reset').click();
  assert.equal($('builder-machine').value,'');
  assert.match($('panel-builder').textContent,/Hero levels missing/);
  assert.deepEqual(JSON.parse(localStorage.getItem('rush-helper-v1')).options.builderBase,{});
  $('clear-input').click();
  assert.equal(localStorage.length,0);
  $('demo-button').click();$('tab-builder').click();
  assert.equal($('builder-machine').value,'');
  assert.equal($('builder-machine').placeholder,'Detected: 18');
});
