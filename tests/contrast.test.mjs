import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const hex=value=>value.match(/[\da-f]{2}/gi).map(part=>parseInt(part,16));
const luminance=color=>color.map(v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const blend=(foreground,alpha,background)=>foreground.map((v,i)=>v*alpha+background[i]*(1-alpha));
const surface=name=>{const match=new RegExp(`--${name}:rgb\\((\\d+) (\\d+) (\\d+) / \\.(\\d+)\\)`).exec(css);assert.ok(match,`missing ${name}`);return {color:match.slice(1,4).map(Number),alpha:Number(`0.${match[4]}`)};};
test('production content contrast stays above 4.5:1 against black, white, and busy wallpaper colors',()=>{
 const busy=[[0,0,0],[255,255,255],[255,225,60],[20,160,230],[220,40,105]];
 for(const [mode,name,primary,secondary] of [
   ['night','production-panel-dark','#f3f7fc','#d5e6ee'],
   ['day','production-panel-day','#142b41','#38556b']]){
   const {color,alpha}=surface(name);
   for(const background of busy){const panel=blend(color,alpha,background);
     for(const [label,text] of [['primary',primary],['secondary',secondary]]){
       const measured=ratio(hex(text),panel);
       assert.ok(measured>=4.5,`${mode} ${label} on ${background}: ${measured.toFixed(2)}:1`);
     }
   }
 }
 assert.ok(ratio(hex('#d5e6ee'),hex('#091827'))>=4.5);
 assert.ok(ratio(hex('#38556b'),hex('#edf5f8'))>=4.5);
});
