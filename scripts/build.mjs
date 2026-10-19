import {mkdir,copyFile,rm,writeFile,readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const checked=[];for(const directory of ['src','electron'])for(const name of await readdir(directory))if(/\.(mjs|cjs)$/.test(name))checked.push(`${directory}/${name}`);
for(const file of checked){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status)process.exit(r.status);}
// This small offline packer supports only our named, relative browser modules.
// Explicit allowlist prevents accidentally shipping host/IPC/native code.
const allowed=new Set(['app','model','native-model','layout','sensor-settings','sensor-alerts','units']);
const modules=new Map(), visiting=new Set();
async function collect(name){
 if(!allowed.has(name))throw new Error(`Non-browser dependency: ${name}`);
 if(modules.has(name))return;
 if(visiting.has(name))throw new Error('Cyclic browser module dependency');
 visiting.add(name);
 let source=await readFile(`src/${name}.mjs`,'utf8');
 const imports=[...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]\.\/([\w-]+)\.mjs['"];?/gm)];
 for(const match of imports){await collect(match[2]);source=source.replace(match[0],`const {${match[1].replace(/\bas\b/g,':')}} = __browserModules[${JSON.stringify(match[2])}];`);}
 if(/^\s*import\s/m.test(source))throw new Error(`Unsupported browser import in ${name}`);
 const exported=[...source.matchAll(/^export\s+(?:const|let|function|class)\s+(\w+)/gm)].map(m=>m[1]);
 source=source.replace(/^export\s+(?=(?:const|let|function|class)\s)/gm,'');
 if(/^\s*export\s/m.test(source))throw new Error(`Unsupported browser export in ${name}`);
 modules.set(name,`__browserModules[${JSON.stringify(name)}] = (()=>{\n${source}\nreturn {${exported.join(',')}};\n})();`);
 visiting.delete(name);
}
await collect('app');
await rm('dist',{recursive:true,force:true});await mkdir('dist/src',{recursive:true});
for(const file of ['index.html','src/style.css',...[...modules.keys()].map(name=>`src/${name}.mjs`)])await copyFile(file,`dist/${file}`);
await writeFile('dist/BUILD.txt','Browser preview only. Native adapter source remains in src and is not exposed to browser clients.\n');
const html=await readFile('index.html','utf8'),css=await readFile('src/style.css','utf8');
const bundle='const __browserModules=Object.create(null);\n'+[...modules.values()].join('\n');
const checkedBundle=spawnSync(process.execPath,['--input-type=module','--check'],{input:bundle,encoding:'utf8'});
if(checkedBundle.status)throw new Error(checkedBundle.stderr);
await writeFile('dist/preview.html',html.replace('<link rel="stylesheet" href="src/style.css">',`<style>${css}</style>`).replace('<script type="module" src="src/app.mjs"></script>',`<script type="module">${bundle.replace(/<\/script/gi,'<\\/script')}</script>`));
console.log('Built static and self-contained previews; syntax checked all adapter modules. No dependency install required.');
