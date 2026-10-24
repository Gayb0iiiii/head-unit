import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {startPreviewApplication} from '../electron/preview-application.mjs';

test('UI-only owner loads the local preview with sandbox and no native bridge', async () => {
  const events=[];
  const app=new EventEmitter();
  app.commandLine={hasSwitch:()=>false,appendSwitch:(...args)=>events.push(['switch',...args])};
  app.requestSingleInstanceLock=()=>true;
  app.setDesktopName=name=>events.push(['desktop',name]);
  app.whenReady=async()=>{};
  app.quit=()=>events.push('quit');
  app.exit=code=>events.push(['exit',code]);
  const signals=new EventEmitter();
  class Window extends EventEmitter {
    constructor(options){super();this.options=options;this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=handler=>{this.openHandler=handler;};events.push('window');}
    loadURL(url){this.url=url;events.push('load');return Promise.resolve();}
    show(){events.push('show');}
  }
  const owner=startPreviewApplication({app,BrowserWindow:Window,signals,platform:'linux'});
  await owner.ready;
  assert.deepEqual(events.slice(-3),['window','load','show']);
  assert.equal(owner.window.options.webPreferences.sandbox,true);
  assert.equal(owner.window.options.webPreferences.preload,undefined);
  assert.equal(owner.window.options.webPreferences.nodeIntegration,false);
  assert.match(owner.window.url,/^file:.*\/dist\/index\.html$/);
  assert.deepEqual(owner.window.openHandler(),{action:'deny'});
  const before=events.length;app.emit('second-instance');assert.equal(events.length,before);
  signals.emit('SIGTERM');assert.equal(events.at(-1),'quit');
});

test('UI-only owner rejects sandbox-disabling flags before creating a window',()=>{
  const app={commandLine:{hasSwitch:flag=>flag==='no-sandbox'}};
  assert.throws(()=>startPreviewApplication({app,BrowserWindow:class{}}),/Unsafe/);
});
