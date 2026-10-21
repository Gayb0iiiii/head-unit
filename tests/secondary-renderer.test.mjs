import test from 'node:test';
import assert from 'node:assert/strict';
import {attachSecondaryView} from '../electron/secondary-renderer.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const elements={panel:{hidden:false},role:{textContent:''},status:{textContent:''}},reports=[];let publish,resolve,removed=0;
 const body={dataset:{}};
 const dispose=attachSecondaryView({document:{body,getElementById:key=>elements[key]},api:{onView:fn=>{publish=fn;return()=>removed++;},getView:()=>new Promise(done=>resolve=done),shown:()=>{reports.push(true);return Promise.resolve({accepted:true});}}});
 return {body,elements,reports,publish:value=>publish(value),resolve:value=>resolve(value),dispose,removed:()=>removed};
}
test('secondary renderer follows authenticated role and front without main controls or invented instrumentation',async()=>{
 const f=fixture();f.publish({role:'aux',connected:true,front:'livi',presented:true});assert.equal(f.elements.role.textContent,'Auxiliary display');assert.equal(f.elements.panel.hidden,false);assert.equal(f.reports.length,1);
 f.publish({role:'aux',connected:true,front:'camera',presented:true});assert.equal(f.elements.panel.hidden,false);f.publish({role:'aux',connected:true,front:'cluster',presented:true});assert.equal(f.reports.length,1);
 f.resolve({role:'cluster',connected:true,front:'livi',presented:true});await flush();assert.equal(f.elements.role.textContent,'Auxiliary display');f.dispose();
});
test('unknown views cannot report or display unsanitized values and disposal ignores late work',async()=>{
 const f=fixture();f.publish({role:'<script>',connected:true,front:'livi',presented:true});assert.equal(f.reports.length,0);assert.equal(f.elements.role.textContent,'Secondary display');
 f.dispose();f.dispose();const before=JSON.stringify(f.elements);f.publish({role:'aux',connected:true,front:'livi',presented:true});f.resolve({role:'aux',connected:true,front:'livi',presented:true});await flush();assert.equal(f.reports.length,0);assert.equal(JSON.stringify(f.elements),before);assert.equal(f.removed(),1);
});
test('camera takeover shows unavailable instead of claiming a native camera plane',()=>{
 const f=fixture();for(let i=0;i<2;i++){
  f.publish({role:'aux',connected:true,front:'cluster',presented:true});assert.equal(f.elements.panel.hidden,true);
  f.publish({role:'aux',connected:true,front:'camera',presented:true});assert.equal(f.elements.panel.hidden,false);assert.match(f.elements.status.textContent,/Camera unavailable/);assert.equal(f.body.dataset.nativeFront,'camera');
  f.publish({role:'aux',connected:false,front:'camera',presented:false});assert.match(f.elements.status.textContent,/Waiting for connection/);
 }f.dispose();
});
