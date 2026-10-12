import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const file of ['dist/index.html','dist/styles.css','dist/theme.css','dist/theme.js','dist/builder-base.css','dist/builder-base.js','dist/app.js','dist/engine.js','dist/game-data.json','dist/icon.svg','dist/.nojekyll','dist/fonts/dm-sans.ttf','dist/fonts/manrope.ttf']) await access(file);
const data=JSON.parse(await readFile('dist/game-data.json','utf8'));
if (!data.buildings.some(b=>b.name==='Town Hall' && b.levels.at(-1).level===18)) throw new Error('Missing Town Hall data');
if (!data.builderBase.buildings.some(b=>b.name==='Builder Hall' && b.levels.at(-1).level===data.meta.maxBuilderHall)) throw new Error('Missing Builder Hall data');
for (const file of ['dist/app.js','dist/engine.js','dist/theme.js','dist/builder-base.js']) {
  const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(result.status)process.exit(result.status);
}
// Resolve assets under a project URL, where root-relative paths would break.
const base = new URL('https://example.github.io/coc-rush-helper/');
const html = await readFile('dist/index.html', 'utf8');
const css = await readFile('dist/styles.css', 'utf8');
const assets = [
  ...[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]),
  ...[...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map(match => match[1]),
  './game-data.json', './engine.js', './builder-base.js'
];
for (const asset of assets) {
  if (/^(?:https?:|#)/.test(asset) || asset === './') continue;
  const url = new URL(asset, base);
  if (!url.href.startsWith(base.href)) throw new Error(`Asset escapes the GitHub Pages project path: ${asset}`);
  await access(`dist/${decodeURIComponent(url.pathname.slice(base.pathname.length))}`);
}
console.log('Static site, project-relative assets, and game-data snapshot are ready for GitHub Pages.');
