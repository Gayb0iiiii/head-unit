#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {createLogindDesktopHandoff} from '../electron/logind-desktop.mjs';

/** Called from the already-running local Plasma session; never starts the UI. */
export async function returnToHeadunit(handoff=createLogindDesktopHandoff({target:'headunit'})){
  if(!handoff)return false;
  try{
    if(await handoff.refresh()!==true||handoff.available!==true)return false;
    return await handoff.request()===true;
  }catch{return false;}
  finally{handoff.dispose();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(!await returnToHeadunit()){
    console.error('Head-unit session unavailable; use the local VT or SSH recovery path.');
    process.exitCode=1;
  }
}
