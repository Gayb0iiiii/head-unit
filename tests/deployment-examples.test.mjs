import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
test('deployment contracts remain disabled examples with no installed services or power commands',async()=>{
 const files=await readdir(new URL('../deployment/',import.meta.url));
 assert.ok(files.filter(name=>name.endsWith('.json.example')).length===2);
 assert.ok(!files.some(name=>/\.(service|socket|sh)$/.test(name)));
 for(const file of files.filter(name=>name.endsWith('.json.example'))){
  const config=JSON.parse(await readFile(new URL(`../deployment/${file}`,import.meta.url),'utf8'));
  assert.equal(config.enabled,false);assert.equal(config.status,'NOT_INSTALLED');assert.equal(config.consumedByRuntime,false);
  assert.deepEqual(config.hostPowerActions??config.hostPowerCommands,[]);
 }
});
