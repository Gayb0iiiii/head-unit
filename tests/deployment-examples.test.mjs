import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
test('deployment contracts remain disabled examples with no installed services or power commands',async()=>{
 const files=await readdir(new URL('../deployment/',import.meta.url));
 assert.ok(files.filter(name=>name.endsWith('.json.example')).length===2);
 assert.ok(!files.some(name=>/\.(service|socket)$/.test(name)));
 assert.ok(files.includes('headunit-ui.service.example'));
 const unit=await readFile(new URL('../deployment/headunit-ui.service.example',import.meta.url),'utf8');
 assert.match(unit,/User=cruiser/);assert.match(unit,/PAMName=login/);
 assert.match(unit,/OnFailure=getty@tty1\.service/);
 const launch=await readFile(new URL('../deployment/orangepi-ui-launch.sh',import.meta.url),'utf8');
 assert.match(launch,/uname -m/);assert.match(launch,/exec cage -s --/);
 assert.match(launch,/electron\/kiosk/);assert.doesNotMatch(launch,/electron\/preview/);
 assert.doesNotMatch(launch,/no-sandbox|LIVI_KIOSK=1|livi-core/);
 const kiosk=await readFile(new URL('../electron/kiosk-main.mjs',import.meta.url),'utf8');
 assert.match(kiosk,/dist\/production\.html/);
 assert.match(kiosk,/startHeadunitApplication/);
 assert.doesNotMatch(kiosk,/preview|Headunit\(/);
 for(const file of files.filter(name=>name.endsWith('.json.example'))){
  const config=JSON.parse(await readFile(new URL(`../deployment/${file}`,import.meta.url),'utf8'));
  assert.equal(config.enabled,false);assert.equal(config.status,'NOT_INSTALLED');assert.equal(config.consumedByRuntime,false);
  assert.deepEqual(config.hostPowerActions??config.hostPowerCommands,[]);
 }
});
