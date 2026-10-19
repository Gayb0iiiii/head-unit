/** Pure desired-state model. These effects are NOT LIVI actions or hardware acknowledgements. */
const requiredCapabilities = ['independentSources', 'hfpCallControls', 'musicDucking'];
const roleNames = ['projectionPhoneId', 'musicPhoneId', 'callPhoneId'];
const isId = value => typeof value === 'string' && value.length <= 256 && /\S/.test(value);
const isVolume = value => Number.isFinite(value) && value >= 0 && value <= 1;
const isPlayback = value => ['playing', 'paused'].includes(value);
const check = (valid, field) => { if (!valid) throw new TypeError(`Invalid ${field}`); };

function validateEvent(event) {
  check(event && typeof event === 'object' && !Array.isArray(event) && isId(event.type), 'event');
  if (event.type === 'call') {
    check(isId(event.phoneId) && isId(event.callId), 'call identity');
    check(Number.isSafeInteger(event.sequence) && event.sequence >= 0, 'call sequence');
    check(['ringing', 'active', 'ended'].includes(event.phase), 'call phase');
  }
  if (event.type === 'manual-route') check(isId(event.route), 'route');
  if (event.type === 'manual-volume') check(isVolume(event.volume), 'volume');
  if (event.type === 'manual-playback') check(isPlayback(event.playback), 'playback');
  if (['disconnect', 'phone-available'].includes(event.type)) check(isId(event.phoneId), 'phone identity');
  if (event.type === 'phone-available') check(['wired', 'wireless'].includes(event.transport), 'transport');
}

export function createPhoneArbitrationState(options = {}) {
  check(options && typeof options === 'object' && !Array.isArray(options), 'options');
  check(options.route === undefined || isId(options.route), 'route');
  check(options.musicVolume === undefined || isVolume(options.musicVolume), 'music volume');
  check(options.playback === undefined || isPlayback(options.playback), 'playback');
  check(roleNames.every(key => options.roles?.[key] == null || isId(options.roles[key])), 'role identity');
  check(options.connectedPhoneIds === undefined ||
    (Array.isArray(options.connectedPhoneIds) && options.connectedPhoneIds.every(isId)), 'connected phones');
  return {
    capabilities: Object.fromEntries(requiredCapabilities.map(key => [key, options.capabilities?.[key] === true])),
    roles: Object.fromEntries(roleNames.map(key => [key, options.roles?.[key] ?? null])),
    connectedPhoneIds: [...new Set(options.connectedPhoneIds ?? [])],
    availableSources: [],
    desired: { route: options.route ?? 'home', musicVolume: options.musicVolume ?? .5, playback: options.playback ?? 'paused' },
    manualRevision: { route: 0, volume: 0 },
    activeCall: null,
    lease: null,
    history: []
  };
}

function present(call) {
  return { type: 'present-call-controls', phoneId: call.phoneId, callId: call.callId, phase: call.phase };
}

function volume(phoneId, value, reason) {
  return { type: 'set-music-volume', phoneId, volume: value, reason };
}

function retire(state, phoneId, callId) {
  const history = state.history.find(item => item.phoneId === phoneId);
  if (history && !history.retiredCallIds.includes(callId)) {
    history.retiredCallIds.push(callId);
    if (history.retiredCallIds.length > 64) history.retiredCallIds.shift();
  }
}

function finish(state, effects) {
  const call = state.activeCall;
  const lease = state.lease;
  retire(state, call.phoneId, call.callId);
  if (lease && requiredCapabilities.every(key => state.capabilities[key] === true)) {
    effects.push({ type: 'dismiss-call-controls', phoneId: call.phoneId, callId: call.callId });
    if (state.manualRevision.route === lease.routeRevision) {
      state.desired.route = lease.route;
      effects.push({ type: 'restore-route', route: lease.route });
    }
    if (lease.ducked && state.manualRevision.volume === lease.volumeRevision &&
        state.roles.musicPhoneId === lease.musicPhoneId && state.connectedPhoneIds.includes(lease.musicPhoneId)) {
      state.desired.musicVolume = lease.musicVolume;
      effects.push(volume(lease.musicPhoneId, lease.musicVolume, 'call-restore'));
    }
  }
  state.activeCall = null;
  state.lease = null;
}

export function reducePhoneArbitration(previous, input) {
  const state = structuredClone(previous);
  const result = { state, effects: [], unsupported: [], ignored: null };
  const ignore = reason => { result.ignored = reason; return result; };
  let event;
  try { event = structuredClone(input); validateEvent(event); }
  catch { return ignore('invalid-event'); }

  if (event.type === 'manual-route') {
    state.desired.route = event.route;
    state.manualRevision.route += 1;
    return result;
  }
  if (event.type === 'manual-volume') {
    state.desired.musicVolume = event.volume;
    state.manualRevision.volume += 1;
    return result;
  }
  if (event.type === 'manual-playback') {
    state.desired.playback = event.playback;
    return result;
  }
  if (event.type === 'phone-available') {
    if (!state.availableSources.some(source => source.phoneId === event.phoneId && source.transport === event.transport)) {
      state.availableSources.push({ phoneId: event.phoneId, transport: event.transport });
    }
    return result;
  }
  if (event.type === 'disconnect') {
    result.unsupported = requiredCapabilities.filter(key => state.capabilities[key] !== true);
    state.connectedPhoneIds = state.connectedPhoneIds.filter(id => id !== event.phoneId);
    state.availableSources = state.availableSources.filter(source => source.phoneId !== event.phoneId);
    if (state.lease?.musicPhoneId === event.phoneId) state.lease.ducked = false;
    if (state.activeCall?.phoneId === event.phoneId) finish(state, result.effects);
    return result;
  }
  if (event.type !== 'call') return ignore('unknown-event');
  result.unsupported = requiredCapabilities.filter(key => state.capabilities[key] !== true);
  if (event.phoneId !== state.roles.callPhoneId) return ignore('unassigned-call-phone');
  if (!state.connectedPhoneIds.includes(event.phoneId)) return ignore('disconnected-call-phone');
  let history = state.history.find(item => item.phoneId === event.phoneId);
  if (!history) {
    history = { phoneId: event.phoneId, lastSequence: -1, retiredCallIds: [] };
    state.history.push(history);
  }
  if (event.sequence <= history.lastSequence) return ignore('stale-sequence');
  history.lastSequence = event.sequence;
  if (history.retiredCallIds.includes(event.callId)) return ignore('retired-call');

  const current = state.activeCall;
  if (event.phase === 'ended') {
    if (current?.callId === event.callId) finish(state, result.effects);
    else { retire(state, event.phoneId, event.callId); return ignore('unmatched-call-end'); }
    return result;
  }
  if (current && current.callId !== event.callId) {
    result.unsupported.push('concurrentCall');
    return ignore('another-call-active');
  }
  if (current) {
    if (current.phase === event.phase) return result;
    if (current.phase === 'active' && event.phase === 'ringing') return ignore('regressive-call-phase');
    current.phase = event.phase;
    if (!result.unsupported.length && state.lease && state.manualRevision.route === state.lease.routeRevision) {
      result.effects.push(present(current));
    }
    return result;
  }

  state.activeCall = { phoneId: event.phoneId, callId: event.callId, phase: event.phase };
  if (result.unsupported.length) return result;
  state.lease = {
    route: state.desired.route, routeRevision: state.manualRevision.route,
    musicPhoneId: state.roles.musicPhoneId, musicVolume: state.desired.musicVolume,
    volumeRevision: state.manualRevision.volume, ducked: false
  };
  state.desired.route = 'call-controls';
  result.effects.push(present(state.activeCall));
  if (state.desired.playback === 'playing' && state.connectedPhoneIds.includes(state.roles.musicPhoneId)) {
    const duckedVolume = state.desired.musicVolume * .25;
    if (duckedVolume !== state.desired.musicVolume) {
      state.lease.ducked = true;
      state.desired.musicVolume = duckedVolume;
      result.effects.push(volume(state.roles.musicPhoneId, duckedVolume, 'call-duck'));
    }
  }
  return result;
}
