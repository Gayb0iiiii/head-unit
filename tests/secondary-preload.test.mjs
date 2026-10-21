import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('secondary sandbox preload exposes only view and host-scoped shell report',async()=>{
 const ipc=new EventEmitter(),events=new EventEmitter(),calls=[],exposed=new Map();ipc.invoke=(...args)=>{calls.push(args);return Promise.resolve({});};
 const context=vm.createContext({require:name=>{assert.equal(name,'electron');return {ipcRenderer:ipc,contextBridge:{exposeInMainWorld:(name,value)=>exposed.set(name,value)}};},window:{addEventListener:(name,fn)=>events.on(name,fn)}});
 vm.runInContext(await readFile(new URL('../electron/secondary-preload.cjs',import.meta.url),'utf8'),context);
 assert.deepEqual([...exposed.keys()],['headunitSecondary']);const api=exposed.get('headunitSecondary');assert.deepEqual(Object.keys(api).sort(),['getView','onView','shown']);assert.equal(Object.isFrozen(api),true);
 await api.getView();await api.shown('main','projection');assert.deepEqual(calls,[['headunit-secondary:get-view'],['headunit-secondary:shown']]);
 const values=[],stop=api.onView((...args)=>values.push(args));ipc.emit('headunit-secondary:view',{secret:true},{role:'aux'},'extra');assert.deepEqual(JSON.parse(JSON.stringify(values)),[[{role:'aux'}]]);
 stop();stop();assert.equal(ipc.listenerCount('headunit-secondary:view'),0);api.onView(()=>{});events.emit('unload');assert.equal(ipc.listenerCount('headunit-secondary:view'),0);
});
