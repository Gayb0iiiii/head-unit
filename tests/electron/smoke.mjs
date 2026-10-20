import {app,BrowserWindow,ipcMain} from 'electron';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {headunitWindowOptions} from '../../electron/host.mjs';
import {createGlassRuntime} from '../../electron/glass-runtime.mjs';
import {createFakeCore} from './fake-core.mjs';

const directory=process.env.HEADUNIT_SMOKE_TEMP;
const output=process.env.HEADUNIT_SMOKE_OUTPUT;
if(!directory||!output)throw Error('Run via npm run test:electron');
app.enableSandbox();
app.setPath('userData',join(directory,'profile'));
const checks=[],errors=[];
let window,runtime,core;
const evaluate=source=>window.webContents.executeJavaScript(`(async()=>(${source}))()`,true);
const waitFor=async(source,label)=>{
  const deadline=Date.now()+10000;
  while(!await evaluate(source)) {
    if(Date.now()>deadline)throw Error(`Timed out: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,25));
  }
};
const heading=text=>waitFor(`document.querySelector('h1')?.textContent === ${JSON.stringify(text)}`,text);
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const screenshot=async name=>{
  const bitmap=await window.webContents.capturePage();
  assert.equal(bitmap.isEmpty(),false);
  await writeFile(join(output,name+'.png'),bitmap.toPNG());
};
let code=1;
try {
  await mkdir(output,{recursive:true});
  await app.whenReady();
  core=await createFakeCore(directory);
  const options=headunitWindowOptions();
  window=new BrowserWindow({...options,show:true});
  window.webContents.on('preload-error',(_event,_path,error)=>errors.push(String(error)));
  window.webContents.on('render-process-gone',(_event,details)=>errors.push(`Renderer gone: ${details.reason}`));
  const entry=new URL('../../index.html',import.meta.url);
  runtime=createGlassRuntime({ipcMain,trustedWindow:window,trustedUrl:entry.href,
    socketPath:core.socketPath,preferencePath:join(directory,'preferences.json')});
  await window.loadFile(fileURLToPath(entry));
  await heading('LIVI disconnected');
  checks.push('startup: actual preload exposes disconnected view before socket start');

  const isolation=await evaluate(`({require:typeof require,process:typeof process,Buffer:typeof Buffer,
    api:Object.keys(window.headunit).sort(),frozen:Object.isFrozen(window.headunit),
    listeners:typeof listeners,ipc:typeof window.ipcRenderer})`);
  assert.deepEqual(isolation,{require:'undefined',process:'undefined',Buffer:'undefined',
    api:['cancelTouch','getView','media','navigate','onView','selectPhone','setVolume','touch'],
    frozen:true,listeners:'undefined',ipc:'undefined'});
  const prefs=window.webContents.getLastWebPreferences();
  assert.equal(prefs.sandbox,true);assert.equal(prefs.contextIsolation,true);
  assert.equal(prefs.nodeIntegration,false);assert.equal(prefs.webSecurity,true);
  // Inspect the real preload world through CDP; never add a test method to the bridge.
  const contexts=[];
  window.webContents.debugger.attach('1.3');
  window.webContents.debugger.on('message',(_event,method,params)=>{
    if(method==='Runtime.executionContextCreated')contexts.push(params.context);
  });
  await window.webContents.debugger.sendCommand('Runtime.enable');
  const isolated=contexts.find(context=>context.name==='Electron Isolated Context');
  assert.ok(isolated,'Actual Electron preload context exists');
  const sandbox=await window.webContents.debugger.sendCommand('Runtime.evaluate',{
    contextId:isolated.id,expression:'({sandboxed:process.sandboxed,isolated:process.contextIsolated})',returnByValue:true});
  assert.deepEqual(sandbox.result.value,{sandboxed:true,isolated:true});
  window.webContents.debugger.detach();
  checks.push('real renderer isolation: no Node globals/raw IPC; sandboxed isolated preload');

  runtime.start();
  await heading('Good to go.');
  assert.equal(await evaluate(`JSON.stringify(await window.headunit.getView()).includes('fake-private-config')`),false);
  checks.push('startup: actual Unix socket hello/welcome renders authoritative Home');
  await screenshot('home-1280x720');
  await click('main [data-action="settings"]');await heading('Settings');
  await click('[data-action="diagnostics"]');await heading('Diagnostics');
  core.patch([{op:'set',path:['front','main'],value:'camera'}]);
  await heading('Camera unavailable');
  core.patch([{op:'set',path:['front','main'],value:'livi'}]);await heading('Settings');
  checks.push('authoritative camera takeover clears diagnostics and restores Settings');
  await click('aside [data-action="phones"]');await heading('Phones');
  await click('[data-phone="passenger"]');
  await waitFor(`document.querySelector('[role="alert"]')?.textContent==='Native command unavailable'`,'rejected selection');
  assert.equal(await evaluate(`document.body.textContent.includes('fake-selection-rejected-private-detail')`),false);
  core.patch([{op:'set',path:['devices'],value:[{id:'driver',name:'Driver',status:'available'},{id:'passenger',name:'Passenger',status:'active'}]}]);
  await waitFor(`document.querySelector('[data-phone="passenger"] small')?.textContent==='Active'`,'authoritative phone update');
  assert.equal(core.actions.some(message=>message.action.kind==='show'),false);
  checks.push('correlated rejection is sanitized; later independent activity cannot open projection');
  await screenshot('phones-rejected');
  await core.close();core=null;
  await heading('LIVI disconnected');
  const disconnected=await evaluate('window.headunit.getView()');
  assert.equal(disconnected.connected,false);assert.deepEqual(disconnected.phones,[]);
  await screenshot('disconnected');
  checks.push('socket disconnect clears phones and renders disconnected state');
  code=0;
} catch(error) { errors.push(error.stack??String(error)); }
finally {
  runtime?.dispose();
  window?.destroy();
  if(core)await core.close();
  await mkdir(output,{recursive:true});
  await writeFile(join(output,'app-result.json'),JSON.stringify({passed:code===0&&errors.length===0,versions:process.versions,checks,errors},null,2)+'\n');
  console.log(JSON.stringify({passed:code===0&&errors.length===0,checks,errors}));
  app.exit(code===0&&errors.length===0?0:1);
}
