"""Chromium file-origin storage across release paths and process restarts.
Uses the actual audio store/model; not an Electron/Armbian migration certificate.
"""
import os,tempfile,json
from pathlib import Path
from playwright.sync_api import sync_playwright
source=(Path(__file__).resolve().parents[1]/'src/local-audio.mjs').read_text()
source=source.replace("import {readAudioMetadata} from './audio-metadata.mjs';",'').replace('export ','')
with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
 root=Path(folder);profile=root/'profile';paths=[]
 for release in ['source','releases/reviewed-sha']:
  target=root/release/'production.html';target.parent.mkdir(parents=True);target.write_text('<!doctype html><title>Profile fixture</title>');paths.append(target.as_uri())
 def launch():return p.chromium.launch_persistent_context(str(profile),executable_path=os.environ.get('HEADUNIT_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
 context=launch();page=context.pages[0];page.goto(paths[0])
 page.evaluate('async()=>{'+source+'''
 const store=createAudioStore();await store.put({id:'fixture',title:'Profile continuity fixture',format:'WAV',blob:new Blob(['fixture'])});
 const audio=new LocalAudio({media:new Audio(),store,storage:localStorage});await audio.ready;audio.enqueue('fixture');audio.favourite('fixture');audio.position=37;audio.save();
 }''');context.close()
 context=launch();page=context.pages[0];page.goto(paths[1])
 result=page.evaluate('async()=>{'+source+'''
 const store=createAudioStore(),audio=new LocalAudio({media:new Audio(),store,storage:localStorage});await audio.ready;
 return {title:audio.current?.title,favourite:audio.favourites.has('fixture'),position:audio.position,paused:audio.media.paused,src:audio.media.getAttribute('src'),blob:await (await store.get('fixture')).blob.text()};
 }''')
 assert result=={'title':'Profile continuity fixture','favourite':True,'position':37,'paused':True,'src':None,'blob':'fixture'},result
 context.close();print(json.dumps({'passed':True,'runtime':'Chromium','checks':'actual audio model + IndexedDB survive process restart and different file release path, paused','result':result}))
