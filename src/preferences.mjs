import {readFileSync,writeFileSync,renameSync,mkdirSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const routes=['home','dashboard','phones','settings','audio','vehicle','projection'];
function clean(value){return {route:routes.includes(value?.route)?value.route:'home',lastPhone:typeof value?.lastPhone==='string'&&value.lastPhone.length<=255?value.lastPhone:null,resume:value?.resume===true};}
/** Path is supplied by trusted host code only, never by renderer IPC. */
export class FilePreferences {
 constructor(file){if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Absolute host preference path required');this.file=file;}
 load(){try{return clean(JSON.parse(readFileSync(this.file,'utf8')));}catch{return clean(null);}}
 save(value){mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});const temp=this.file+'.'+randomUUID()+'.tmp';try{writeFileSync(temp,JSON.stringify(clean(value)),{mode:0o600,flag:'wx'});renameSync(temp,this.file);}catch(error){try{unlinkSync(temp);}catch{}throw error;}}
}
