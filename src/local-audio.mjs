import {readAudioMetadata} from './audio-metadata.mjs';
// Local files only: no network, native commands, DSP processing or gain changes.
const extensions = new Set(['mp3','m4a','aac','flac','wav','ogg','opus']);
const preferenceKey = 'headunit-local-audio-v1';
export function describeFile(file) {
  const format=file.name.split('.').pop().toLowerCase();
  if(!extensions.has(format)||!file.size||file.size>512*1024*1024)return null;
  const path=file.webkitRelativePath||file.name;
  return {id:JSON.stringify([path,file.size,file.lastModified]),title:file.name.replace(/\.[^.]+$/,''),folder:path.split('/').slice(0,-1).join('/')||'Imported files',format:format.toUpperCase(),size:file.size};
}
export function createAudioStore(indexedDB=globalThis.indexedDB) {
  let opened;
  const open=()=>opened??=new Promise((resolve,reject)=>{
    if(!indexedDB){reject(Error('Storage unavailable'));return;}
    const request=indexedDB.open('headunit-local-audio',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('tracks',{keyPath:'id'});request.result.createObjectStore('files');};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('Storage busy'));
  });
  const transaction=async(mode,operation)=>{const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction(['tracks','files'],mode);let result;
    operation(tx,value=>{result=value;});tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('Storage failed'));
  });};
  return {
    list:()=>transaction('readonly',(tx,done)=>{const req=tx.objectStore('tracks').getAll();req.onsuccess=()=>done(req.result);}),
    get:id=>transaction('readonly',(tx,done)=>{const req=tx.objectStore('files').get(id);req.onsuccess=()=>done({blob:req.result});}),
    put:row=>transaction('readwrite',tx=>{const {blob,...metadata}=row;tx.objectStore('tracks').put(metadata);tx.objectStore('files').put(blob,row.id);}),
    remove:id=>transaction('readwrite',tx=>{tx.objectStore('tracks').delete(id);tx.objectStore('files').delete(id);})
  };
}
export class LocalAudio {
  constructor({media,store=createAudioStore(),storage,urls=URL,random=Math.random,canPlay=()=>true,onChange=()=>{},onProgress=()=>{}}={}) {
    this.media=media;this.store=store;this.storage=storage;this.urls=urls;this.random=random;this.canPlay=canPlay;this.onChange=onChange;
    this.tracks=[];this.queue=[];this.index=-1;this.favourites=new Set();this.repeat='off';this.shuffle=false;this.message='';this.busy=false;this.generation=0;this.position=0;
    media?.addEventListener('ended',()=>{void this.next(true);});
    media?.addEventListener('loadedmetadata',()=>{if(this.position>0)this.seek(this.position);});
    for(const event of ['play','pause','loadedmetadata'])media?.addEventListener(event,()=>this.onChange());
    media?.addEventListener('timeupdate',()=>{onProgress();if(Math.abs((media.currentTime||0)-this.position)>=5){this.position=media.currentTime;this.save();}});
    media?.addEventListener('error',()=>{this.pause();this.message='Cannot play this file. Try another track or re-import it.';this.onChange();});
    this.ready=this.restore();
  }
  get current(){return this.tracks.find(t=>t.id===this.queue[this.index]);}
  get playing(){return !!this.media&&!this.media.paused;}
  async restore(){
    try {this.tracks=await this.store.list();const saved=JSON.parse(this.storage?.getItem(preferenceKey)||'{}');
      this.queue=Array.isArray(saved.queue)?saved.queue.filter(id=>this.tracks.some(t=>t.id===id)).slice(0,2000):[];
      this.index=this.queue.length?Math.min(Math.max(Number.isInteger(saved.index)?saved.index:0,0),this.queue.length-1):-1;
      this.favourites=new Set(Array.isArray(saved.favourites)?saved.favourites.filter(id=>this.tracks.some(t=>t.id===id)):[]);
      this.position=Number.isFinite(saved.position)&&saved.position>=0?saved.position:0;
      this.repeat=['off','one','all'].includes(saved.repeat)?saved.repeat:'off';this.shuffle=saved.shuffle===true;
    }catch{this.message='Local storage unavailable. Check available space and restart.';}
    this.onChange();
  }
  save(){try{this.storage?.setItem(preferenceKey,JSON.stringify({queue:this.queue,index:this.index,favourites:[...this.favourites],repeat:this.repeat,shuffle:this.shuffle,position:this.position}));}catch{this.message='Playback choices could not be saved. Check local storage.';}}
  async importFiles(files){
    if(this.busy)return;this.busy=true;await this.ready;this.message='Importing files…';this.onChange();let added=0,unsupported=0,duplicates=0,repaired=0;
    try{for(const file of files){const track=describeFile(file);if(!track){unsupported++;continue;}if(this.tracks.some(t=>t.id===track.id)){
        const stored=await this.store.get(track.id);
        if(stored?.blob){duplicates++;continue;}
        const existing=this.tracks.find(t=>t.id===track.id);await this.store.put({...existing,blob:file});repaired++;continue;
      }
      if(this.tracks.length>=2000)throw Error('Library limit');
      const metadata=await readAudioMetadata(file);const tagged={...track,...metadata};await this.store.put({...tagged,blob:file});this.tracks.push(tagged);added++;
    }this.message=`${added} imported · ${duplicates} already in library · ${unsupported} unsupported or oversized${repaired?` · ${repaired} repaired`:``}`;
    }catch{this.message=`${added} imported. Import stopped: check local storage (2,000 track limit).`;}
    this.busy=false;this.onChange();
  }
  pause(){this.generation++;if(this.loadedId)this.position=this.media?.currentTime||0;this.media?.pause();this.save();}
  release(){if(this.url)this.urls.revokeObjectURL(this.url);this.url=null;this.loadedId=null;this.media?.removeAttribute('src');this.media?.load();}
  async play(){
    if(!this.current||!this.media)return;
    if(!this.canPlay()){this.message='Pause phone audio and return to the head-unit display to play local music.';this.onChange();return;}
    const id=this.current.id, generation=++this.generation;this.message='';
    try{
      if(this.loadedId!==id){this.media.pause();const row=await this.store.get(id);if(generation!==this.generation)return;if(!row?.blob)throw Error('Missing file');
        this.release();this.url=this.urls.createObjectURL(row.blob);this.media.src=this.url;this.loadedId=id;
      }
      if(!this.canPlay()){this.message='Pause phone audio and return to the head-unit display to play local music.';this.onChange();return;}
      await this.media.play();
      if(generation!==this.generation&&this.loadedId===id)this.media.pause();
    }catch{if(generation===this.generation){this.media.pause();this.message='Cannot play this file. Try another track or re-import it.';}}
    this.onChange();
  }
  async playTrack(id){if(!this.tracks.some(t=>t.id===id))return;this.pause();this.queue=[id];this.index=0;this.position=0;if(this.loadedId===this.current?.id)this.seek(0);this.save();await this.play();}
  enqueue(id){if(this.queue.length>=2000||!this.tracks.some(t=>t.id===id))return;this.queue.push(id);if(this.index<0)this.index=0;this.save();this.onChange();}
  async select(index){if(!Number.isInteger(index)||!this.queue[index])return;this.pause();this.index=index;this.position=0;if(this.loadedId===this.current?.id)this.seek(0);this.save();await this.play();}
  async next(ended=false){
    if(!this.queue.length)return;
    if(ended&&this.repeat==='one'){this.seek(0);await this.play();return;}
    let next=this.index+1;
    if(this.shuffle&&this.queue.length>1)next=(this.index+1+Math.floor(this.random()*(this.queue.length-1)))%this.queue.length;
    if(next>=this.queue.length){if(this.repeat==='all')next=0;else{this.pause();this.onChange();return;}}
    await this.select(next);
  }
  async previous(){if(this.media?.currentTime>3){this.seek(0);return;}await this.select(Math.max(0,this.index-1));}
  seek(value){if(this.media&&Number.isFinite(this.media.duration)&&Number.isFinite(value)){this.media.currentTime=Math.max(0,Math.min(value,this.media.duration));this.position=this.media.currentTime;this.save();}}
  move(index,step){const target=index+step;if(!Number.isInteger(index)||![-1,1].includes(step)||target<0||target>=this.queue.length)return;
    [this.queue[index],this.queue[target]]=[this.queue[target],this.queue[index]];
    if(this.index===index)this.index=target;else if(this.index===target)this.index=index;this.save();this.onChange();}
  removeQueued(index){if(!Number.isInteger(index)||index<0||index>=this.queue.length)return;
    if(index===this.index){this.pause();this.release();this.position=0;}this.queue.splice(index,1);
    if(index<this.index||this.index>=this.queue.length)this.index--;this.save();this.onChange();}
  clearQueue(){this.pause();this.release();this.queue=[];this.index=-1;this.position=0;this.save();this.onChange();}
  favourite(id){if(this.favourites.has(id))this.favourites.delete(id);else this.favourites.add(id);this.save();this.onChange();}
  async removeTrack(id){try{await this.store.remove(id);if(this.current?.id===id){this.pause();this.release();this.position=0;}
    const current=this.current?.id;this.tracks=this.tracks.filter(t=>t.id!==id);this.queue=this.queue.filter(item=>item!==id);this.index=this.queue.indexOf(current);if(this.index<0&&this.queue.length)this.index=0;
    this.favourites.delete(id);this.save();this.onChange();
  }catch{this.message='Could not remove file. Check local storage.';this.onChange();}}
}
