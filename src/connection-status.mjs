// Fixed presentation codes only. Raw transport errors, socket paths and retry internals stay privileged.
const disconnectedPhases=new Set(['idle','connecting','handshaking','resyncing','backoff','refused','error','stopped']);
export function filterConnectionPhase(phase,connected) {
  if(connected===true)return 'ready';
  return disconnectedPhases.has(phase)?phase:'unavailable';
}
const messages={
  idle:{title:'Waiting for LIVI',detail:'The host connection has not started.'},
  connecting:{title:'Connecting to LIVI',detail:'Waiting for the native engine connection.'},
  handshaking:{title:'Synchronizing with LIVI',detail:'Connected to the host. Waiting for its initial state.'},
  resyncing:{title:'Synchronizing with LIVI',detail:'Refreshing native state before controls become available.'},
  backoff:{title:'Reconnecting to LIVI',detail:'The host will retry automatically. Phone and media controls will return after synchronization.'},
  refused:{title:'Connection refused',detail:'The native host could not accept this shell. Host configuration needs attention.'},
  error:{title:'LIVI connection unavailable',detail:'The connection ended. Check the native host before reconnecting.'},
  stopped:{title:'LIVI connection stopped',detail:'The host connection is stopped. Automatic retries are not running.'},
  unavailable:{title:'LIVI disconnected',detail:'Connection status is unavailable. Phone and media controls are unavailable.'}
};
export function connectionPresentation(phase) {
  return {...messages[filterConnectionPhase(phase,false)]};
}
