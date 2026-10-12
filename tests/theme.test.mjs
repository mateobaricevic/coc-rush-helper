import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../dist/theme.js', import.meta.url), 'utf8');

function loadTheme(preference, blocked = false) {
  const window = new Window({ url:'https://example.github.io/rush/', settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true} });
  window.document.write(html);
  if (preference !== undefined) window.localStorage.setItem('rush-helper-theme-v1', preference);
  if (blocked) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
  runInNewContext(script, { window, document:window.document });
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return window;
}

test('a saved light preference is restored before village data loads', () => {
  const window = loadTheme('light');
  assert.equal(window.document.documentElement.dataset.theme, 'light');
  assert.equal(window.document.getElementById('theme-toggle').getAttribute('aria-label'), 'Switch to dark theme');
  assert.equal(window.document.getElementById('analyze').disabled, true);
  window.document.getElementById('theme-toggle').click();
  assert.equal(window.localStorage.getItem('rush-helper-theme-v1'), 'dark');
});

test('invalid saved themes fall back to dark', () => {
  assert.equal(loadTheme('unexpected').document.documentElement.dataset.theme, 'dark');
});

test('the theme toggle remains usable with blocked browser storage', () => {
  const window = loadTheme(undefined, true);
  assert.equal(window.document.documentElement.dataset.theme, 'dark');
  assert.doesNotThrow(() => window.document.getElementById('theme-toggle').click());
  assert.equal(window.document.documentElement.dataset.theme, 'light');
});
