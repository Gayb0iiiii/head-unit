import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('native patch setup rejects drift and preserves unrelated work',()=>{
  execFileSync('python3',['-m','unittest','discover','-s','tests/native'],{
    cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}
  });
});
