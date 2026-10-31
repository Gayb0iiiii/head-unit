import path from 'node:path';
import {prepareHeadunitUpdate} from './update-source.mjs';
import {createUpdateService} from './update-service.mjs';

const shaPattern=/^[0-9a-f]{40}$/;
/** Available only to an Electron child started by the unprivileged Cage supervisor. */
export function createHostUpdateService({env=process.env,channel=process,prepare=prepareHeadunitUpdate}={}){
  const {HEADUNIT_SOURCE_ROOT:sourceRoot,HEADUNIT_RELEASES_ROOT:releasesRoot,HEADUNIT_ACTIVE_ROOT:activeRoot,HEADUNIT_ACTIVE_SHA:activeSha}=env;
  if(env.HEADUNIT_SUPERVISED!=='1'||![sourceRoot,releasesRoot,activeRoot].every(value=>typeof value==='string'&&path.isAbsolute(value))||!shaPattern.test(activeSha)||typeof channel.send!=='function')return null;
  let sequence=0;
  const pending=new Set();
  const activate=sha=>new Promise((resolve,reject)=>{
    if(!shaPattern.test(sha)){reject(Error('Invalid update commit'));return;}
    const id=++sequence;let settled=false;
    const clean=()=>{clearTimeout(timer);channel.removeListener('message',message);channel.removeListener('disconnect',disconnect);pending.delete(cancel);};
    const finish=(accepted,error)=>{if(settled)return;settled=true;clean();accepted?resolve():reject(error||Error('Activation unavailable'));};
    const message=value=>{if(value?.kind==='update-ack'&&value.id===id)finish(value.accepted===true);};
    const disconnect=()=>finish(false,Error('Supervisor disconnected'));
    const cancel=()=>finish(false,Error('Activation disposed'));
    const timer=setTimeout(()=>finish(false,Error('Activation timed out')),10000);
    pending.add(cancel);channel.on('message',message);channel.on('disconnect',disconnect);
    if(channel.connected===false){disconnect();return;}
    try{channel.send({kind:'activate',id,sha},error=>{if(error)finish(false,error);});}catch(error){finish(false,error);}
  });
  const service=createUpdateService({prepare:signal=>prepare({sourceRoot,releasesRoot,activeRoot,activeSha,signal,branch:env.HEADUNIT_UPDATE_BRANCH}),activate,initialPhase:env.HEADUNIT_UPDATE_RECOVERED==='1'?'failed':'idle'});
  return {...service,dispose(){service.dispose();for(const cancel of [...pending])cancel();}};
}
