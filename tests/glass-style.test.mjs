import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Source contract only. Compositing, contrast and touch layout still need a real
// browser and target display; these assertions do not claim visual verification.
test('glass uses a transparent tint and backdrop filtering rather than blurring foreground content', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.match(css, /backdrop-filter:\s*blur\(var\(--glass-blur\)\)\s*saturate\(1\.35\)/);
  assert.match(css, /background:[^;}]*rgb\(9 24 39\s*\/\s*var\(--glass-tint\)\)/);
  assert.match(css, /\.app-symbol\s*\{[^}]*backdrop-filter:/);
  assert.doesNotMatch(css, /(?:^|[;{\s])filter:\s*blur\(/);
  assert.match(css, /@supports not.*backdrop-filter/s);
});

test('glass controls provide visible focus, reduced-transparency fallback and touch-sized reorder controls', async () => {
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.match(css, /input:focus-visible/);
  assert.match(css, /prefers-reduced-transparency:\s*reduce/);
  assert.match(css, /\.reorder-controls button\s*\{[^}]*min-height:\s*48px/);
});

test('optional sensor editor remains touch sized and keyboard visible',async()=>{
 const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
 assert.match(css,/\.sensor-field (?:input|select)[^{]*\{[^}]*min-height:\s*48px/);
 assert.match(css,/select:focus-visible/);
});

test('right dock mirrors only the wide-screen grid and preserves compact bottom layout',async()=>{
 const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
 assert.match(css,/@media\(min-width:650px\)\{[\s\S]*body\[data-dock-side=right\] #app\{grid-template-columns:minmax\(0,1fr\) 100px/);
 assert.match(css,/body\[data-dock-side=right\] #app>aside\{grid-column:2;grid-row:1/);
 assert.match(css,/body\[data-dock-side=right\] #app>main\{grid-column:1;grid-row:1/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) 82px/);
});
