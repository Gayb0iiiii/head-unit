import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const hex=value=>value.match(/[\da-f]{2}/gi).map(part=>parseInt(part,16));
const luminance=color=>color.map(v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const blend=(foreground,alpha,background)=>foreground.map((v,i)=>v*alpha+background[i]*(1-alpha));
// Token-level proof complements ui-comfort.py, which checks the resolved cascade.
const palettes=[...css.matchAll(/--surface-rgb:([\d ]+);--surface-alpha:calc\((\.[\d]+) \+ var\(--glass-tint,\.[\d]+\) \* (\.[\d]+)\);([\s\S]*?)--surface-border:/g)].map(match=>({
 color:match[1].trim().split(' ').map(Number),offset:Number(match[2]),factor:Number(match[3]),
 token:name=>{const value=new RegExp(`--${name}:(#[a-f0-9]{6})`).exec(match[4]);assert.ok(value,`missing ${name}`);return hex(value[1]);}
}));
test('glass palette text meets 4.5:1 across every saved strength and extreme wallpapers',()=>{
 assert.equal(palettes.length,2);
 for(const palette of palettes)for(let strength=0;strength<=100;strength++){
  const alpha=palette.offset+(.18+strength*.0044)*palette.factor;
  for(const background of [[0,0,0],[255,255,255],[255,225,60],[20,160,230],[220,40,105]]){
   const panel=blend(palette.color,alpha,background);
   for(const name of ['text-primary','text-secondary'])assert.ok(ratio(palette.token(name),panel)>=4.5,`${name}, strength ${strength}, wallpaper ${background}`);
   assert.ok(ratio(palette.token('focus-ring'),panel)>=3,'Focus ring must remain visible');
  }
 }
});
test('selected and ordinary controls retain readable text without white backgrounds',()=>{
 for(const palette of palettes){
  assert.ok(ratio(palette.token('selected-text'),palette.token('selected-background'))>=4.5);
  assert.ok(ratio(palette.token('text-primary'),palette.token('control-background'))>=4.5);
  assert.ok(Math.max(...palette.color)<=220);
 }
});
