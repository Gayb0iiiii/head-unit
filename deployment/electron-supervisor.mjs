#!/usr/bin/env node
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {createReleaseStore} from '../electron/release-store.mjs';
import {createReleaseSupervisor} from '../electron/release-supervisor.mjs';

const sourceRoot=process.env.HEADUNIT_ROOT;
const electron=process.env.HEADUNIT_ELECTRON;
if(typeof sourceRoot!=='string'||!path.isAbsolute(sourceRoot)||typeof electron!=='string'||!path.isAbsolute(electron)||process.env.HEADUNIT_SESSION!=='1'){
  console.error('Headunit supervisor needs fixed absolute source and Electron paths from the kiosk launcher.');
  process.exit(1);
}
const stateHome=process.env.XDG_STATE_HOME&&path.isAbsolute(process.env.XDG_STATE_HOME)?process.env.XDG_STATE_HOME:path.join(os.homedir(),'.local','state');
const stateRoot=path.join(stateHome,'headunit');
let shuttingDown=false;
try{
  const store=await createReleaseStore({sourceRoot,stateRoot});
  const supervisor=createReleaseSupervisor({initial:store.initial,recovered:store.recovered,verifyRelease:store.verifyRelease,saveState:store.saveState,
    launch:(release,mode)=>spawn(electron,[path.join(release.path,'electron','kiosk')],{
      stdio:['inherit','inherit','inherit','ipc'],env:{...process.env,HEADUNIT_SUPERVISED:'1',HEADUNIT_SOURCE_ROOT:store.sourceRoot,
        HEADUNIT_RELEASES_ROOT:store.releasesRoot,HEADUNIT_ACTIVE_ROOT:release.path,HEADUNIT_ACTIVE_SHA:release.sha,HEADUNIT_UPDATE_RECOVERED:mode==='rollback'?'1':'0'},
    }),
    onFatal:error=>{console.error('Headunit release supervisor stopped:',error);if(!shuttingDown){shuttingDown=true;process.exitCode=1;process.kill(process.pid,'SIGTERM');}},
  });
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(shuttingDown){supervisor.dispose();return;}shuttingDown=true;supervisor.dispose();});
  await supervisor.start();
}catch(error){console.error('Headunit supervisor startup failed:',error);process.exitCode=1;}
