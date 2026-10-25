import path from 'node:path';
import {prepareHeadunitUpdate} from './update-source.mjs';
import {createUpdateService} from './update-service.mjs';

const shaPattern=/^[0-9a-f]{40}$/;
/** Available only to an Electron child started by the unprivileged Cage supervisor. */
export function createHostUpdateService({env=process.env,channel=process,prepare=prepareHeadunitUpdate}={}){
  const {HEADUNIT_SOURCE_ROOT:sourceRoot,HEADUNIT_RELEASES_ROOT:releasesRoot,HEADUNIT_ACTIVE_ROOT:activeRoot,HEADUNIT_ACTIVE_SHA:activeSha}=env;
  if(env.HEADUNIT_SUPERVISED!=='1'||![sourceRoot,releasesRoot,activeRoot].every(value=>typeof value==='string'&&path.isAbsolute(value))||!shaPattern.test(activeSha)||typeof channel.send!=='function')return null;
  let sequence=0;
  const activate=sha=>new Promise((resolve,reject)=>{
    if(!shaPattern.test(sha)){reject(Error('Invalid update commit'));return;}
    const id=++sequence;
    const clean=()=>{clearTimeout(timer);channel.removeListener('message',message);};
    const message=value=>{
      if(value?.kind!=='update-ack'||value.id!==id)return;
      clean();value.accepted===true?resolve():reject(Error('Activation unavailable'));
    };
    const timer=setTimeout(()=>{clean();reject(Error('Activation timed out'));},10000);
    channel.on('message',message);
    try{channel.send({kind:'activate',id,sha},error=>{if(error){clean();reject(error);}});}catch(error){clean();reject(error);}
  });
  return createUpdateService({prepare:signal=>prepare({sourceRoot,releasesRoot,activeRoot,activeSha,signal}),activate,initialPhase:env.HEADUNIT_UPDATE_RECOVERED==='1'?'failed':'idle'});
}
