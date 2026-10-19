import {spawn} from 'node:child_process';
import {access,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const here=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(here,'../..');
const stamp=new Date().toISOString().replaceAll(':','-');
const output=resolve(process.env.HEADUNIT_SMOKE_OUTPUT??join(root,'evidence/electron-smoke'),stamp);
await mkdir(output,{recursive:true});
let directory,child,timer,killTimer;
const report={passed:false,stage:'prerequisites',output};
try {
  if(process.platform!=='linux')throw Error('This smoke launcher currently targets Linux.');
  if(process.env.ELECTRON_RUN_AS_NODE||process.env.ELECTRON_DISABLE_SANDBOX)throw Error('Remove Electron runtime/sandbox override variables before this test.');
  if(process.argv.length>2)throw Error('No arbitrary Electron switches accepted by this test.');
  const executable=join(here,'node_modules/electron/dist/electron');
  await access(executable).catch(()=>{throw Error('Install the pinned optional harness dependencies and Electron binary; see tests/electron/README.md.');});
  directory=await mkdtemp(join(tmpdir(),'headunit-electron-'));
  const args=[];
  if(!process.env.DISPLAY&&!process.env.WAYLAND_DISPLAY)args.push('--ozone-platform=headless');
  args.push(join(here,'smoke.mjs'));
  report.stage='electron-launch';report.args=args;
  let stdout='',stderr='';
  const result=await new Promise((resolveExit,reject)=>{
    child=spawn(executable,args,{cwd:root,detached:true,env:{...process.env,
      HEADUNIT_SMOKE_TEMP:directory,HEADUNIT_SMOKE_OUTPUT:output},stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',chunk=>{stdout+=chunk;process.stdout.write(chunk);});
    child.stderr.on('data',chunk=>{stderr+=chunk;process.stderr.write(chunk);});
    child.on('error',reject);
    child.on('close',(exitCode,signal)=>resolveExit({exitCode,signal}));
    timer=setTimeout(()=>{
      report.timedOut=true;
      try{process.kill(-child.pid,'SIGTERM');}catch{}
      killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},2000);
    },45000);
  });
  Object.assign(report,result);
  await writeFile(join(output,'stdout.txt'),stdout);
  await writeFile(join(output,'stderr.txt'),stderr);
  try { report.application=JSON.parse(await readFile(join(output,'app-result.json'),'utf8')); }
  catch { report.blocker='Electron did not produce an application result. Inspect stderr.txt; no smoke coverage is established.'; }
  report.passed=result.exitCode===0&&report.application?.passed===true&&!report.timedOut;
  if(report.application)report.stage='application-checks';
} catch(error) {report.blocker=String(error.message??error);}
finally {
  clearTimeout(timer);clearTimeout(killTimer);
  // Remove any descendant processes left after a crash, without touching other runs.
  if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}}
  if(directory)await rm(directory,{recursive:true,force:true});
  await writeFile(join(output,'result.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(`Electron smoke ${report.passed?'PASS':'FAIL'}: ${join(output,'result.json')}`);
process.exitCode=report.passed?0:1;
