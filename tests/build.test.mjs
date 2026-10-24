import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
test('static build includes settings dependencies and self-contained offline preview without native modules',()=>{
 const result=spawnSync(process.execPath,['scripts/build.mjs'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 for(const name of ['app','model','sensor-settings','sensor-alerts','units'])assert.ok(existsSync(`dist/src/${name}.mjs`),`${name} copied`);
 const production=readFileSync('dist/production.html','utf8');
 assert.match(production,/data-mode="production"/);
 assert.match(production,/Content-Security-Policy/);
 const html=readFileSync('dist/preview.html','utf8');
 const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(source);
 assert.doesNotMatch(source,/^\s*import\s/m);
 const checked=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
 assert.equal(checked.status,0,checked.stderr);
 assert.doesNotMatch(source,/node:net|node:fs|ipcRenderer|createConnection/);
});
