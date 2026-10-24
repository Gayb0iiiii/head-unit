// Fixed presentation codes only. Raw transport errors, socket paths and retry internals stay privileged.
const disconnectedPhases=new Set(['idle','connecting','handshaking','resyncing','backoff','refused','error','stopped']);
export function filterConnectionPhase(phase,connected) {
  if(connected===true)return 'ready';
  return disconnectedPhases.has(phase)?phase:'unavailable';
}
const messages={
  idle:{title:'Waiting for connection',detail:'Phone and media controls are unavailable until the system connects.'},
  connecting:{title:'Connecting',detail:'Connecting to the system…'},
  handshaking:{title:'Connecting',detail:'Updating connection information…'},
  resyncing:{title:'Updating connection',detail:'Controls are temporarily unavailable while connection information updates.'},
  backoff:{title:'Reconnecting',detail:'Trying to reconnect automatically. Phone and media controls are temporarily unavailable.'},
  refused:{title:'Unable to connect',detail:'The system could not accept the connection.'},
  error:{title:'Connection lost',detail:'Phone and media controls are unavailable.'},
  stopped:{title:'Connection stopped',detail:'Automatic reconnection is off.'},
  unavailable:{title:'System disconnected',detail:'Phone and media controls are unavailable.'}
};
export function connectionPresentation(phase,previouslyConnected=false) {
  if(!previouslyConnected&&phase==='backoff')return {title:'System unavailable',detail:'CarPlay, phone and media features are unavailable while the system connection is offline.'};
  return {...messages[filterConnectionPhase(phase,false)]};
}
