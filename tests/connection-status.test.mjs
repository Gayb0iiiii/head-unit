import test from 'node:test';
import assert from 'node:assert/strict';
import {filterConnectionPhase,connectionPresentation} from '../src/connection-status.mjs';
test('connection phase exposes only fixed status codes and readiness overrides stale phases',()=>{
 for(const phase of ['idle','connecting','handshaking','resyncing','backoff','refused','error','stopped'])assert.equal(filterConnectionPhase(phase,false),phase);
 for(const phase of ['ready','secret socket error',{},null])assert.equal(filterConnectionPhase(phase,false),'unavailable');
 assert.equal(filterConnectionPhase('backoff',true),'ready');
 assert.equal(filterConnectionPhase('ready','true'),'unavailable');
});
test('connection guidance distinguishes managed retry from stopped or refused states',()=>{
 assert.match(connectionPresentation('backoff').detail,/automatically/);
 for(const phase of ['refused','stopped','error','unavailable'])assert.doesNotMatch(connectionPresentation(phase).detail,/automatically/);
 assert.doesNotMatch(JSON.stringify(connectionPresentation('<secret>')),/secret/);
});
