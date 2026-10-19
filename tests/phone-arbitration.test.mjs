import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/phone-arbitration.mjs';
const capabilities = { independentSources: true, hfpCallControls: true, musicDucking: true };
const roles = { projectionPhoneId: 'phone-a', musicPhoneId: 'phone-a', callPhoneId: 'phone-b' };
const initial = (options = {}) => api.createPhoneArbitrationState({
  capabilities, roles, connectedPhoneIds: ['phone-a', 'phone-b'],
  route: 'projection', musicVolume: .8, playback: 'playing', ...options
});
const step = (state, event) => api.reducePhoneArbitration(state, event);
const call = (phase, sequence = 1, callId = 'call-1', phoneId = 'phone-b') =>
  ({ type: 'call', phoneId, callId, phase, sequence });
const ring = state => step(state ?? initial(), call('ringing'));

test('exports a pure phone arbitration model', () => {
  assert.equal(typeof api.createPhoneArbitrationState, 'function');
  assert.equal(typeof api.reducePhoneArbitration, 'function');
});

test('defaults fail closed without claiming hardware actions', () => {
  const state = api.createPhoneArbitrationState({ roles, connectedPhoneIds: ['phone-a', 'phone-b'] });
  const result = ring(state);
  assert.deepEqual(result.effects, []);
  assert.deepEqual(result.unsupported, ['independentSources', 'hfpCallControls', 'musicDucking']);
  assert.equal(result.state.activeCall.phase, 'ringing');
  assert.equal(result.state.desired.route, 'home');
  assert.equal(result.state.lease, null);
});

test('every capability requires literal true before any arbitration effects', () => {
  for (const capability of Object.keys(capabilities)) {
    for (const value of [false, undefined, 1, 'true']) {
      const result = ring(initial({ capabilities: { ...capabilities, [capability]: value } }));
      assert.deepEqual(result.effects, []);
      assert.deepEqual(result.unsupported, [capability]);
      assert.equal(result.state.desired.route, 'projection');
    }
  }
});

test('second phone call proposes controls and ducking without switching either source', () => {
  const before = initial();
  const snapshot = structuredClone(before);
  const result = ring(before);
  assert.deepEqual(before, snapshot, 'reducer must not mutate its input');
  assert.deepEqual(result.state.roles, roles);
  assert.deepEqual(result.effects, [
    { type: 'present-call-controls', phoneId: 'phone-b', callId: 'call-1', phase: 'ringing' },
    { type: 'set-music-volume', phoneId: 'phone-a', volume: .2, reason: 'call-duck' }
  ]);
  assert.equal(result.state.desired.route, 'call-controls');
  assert.equal(result.state.desired.musicVolume, .2);
  assert.equal(result.state.desired.playback, 'playing');
});

test('call end restores the captured screen and volume exactly once', () => {
  const ringing = ring().state;
  const result = step(ringing, call('ended', 2));
  assert.deepEqual(result.effects, [
    { type: 'dismiss-call-controls', phoneId: 'phone-b', callId: 'call-1' },
    { type: 'restore-route', route: 'projection' },
    { type: 'set-music-volume', phoneId: 'phone-a', volume: .8, reason: 'call-restore' }
  ]);
  assert.equal(result.state.activeCall, null);
  assert.equal(result.state.lease, null);
  assert.deepEqual(result.state.roles, roles);
  assert.equal(result.state.desired.musicVolume, .8);
  assert.equal(result.state.desired.route, 'projection');
  assert.deepEqual(step(result.state, call('ended', 3)).effects, []);
});

test('repeated ringing does not duck again or overwrite the restore snapshot', () => {
  const first = ring().state;
  const repeated = step(first, call('ringing', 2));
  assert.deepEqual(repeated.effects, []);
  assert.deepEqual(repeated.state.lease, first.lease);
  const active = step(repeated.state, call('active', 3));
  assert.deepEqual(active.effects, [{ type: 'present-call-controls', phoneId: 'phone-b', callId: 'call-1', phase: 'active' }]);
  const end = step(active.state, call('ended', 4));
  assert.equal(end.state.desired.musicVolume, .8);
  assert.equal(end.state.desired.route, 'projection');
});

test('manual route and volume changes survive call completion', () => {
  let state = ring().state;
  state = step(state, { type: 'manual-route', route: 'audio' }).state;
  state = step(state, { type: 'manual-volume', volume: .55 }).state;
  const active = step(state, call('active', 2));
  assert.deepEqual(active.effects, [], 'call status must not steal manual navigation');
  const end = step(active.state, call('ended', 3));
  assert.deepEqual(end.effects, [{ type: 'dismiss-call-controls', phoneId: 'phone-b', callId: 'call-1' }]);
  assert.equal(end.state.desired.route, 'audio');
  assert.equal(end.state.desired.musicVolume, .55);
});

test('same-valued manual changes still revoke automatic restoration ownership', () => {
  let state = ring().state;
  state = step(state, { type: 'manual-route', route: 'call-controls' }).state;
  state = step(state, { type: 'manual-volume', volume: .2 }).state;
  const end = step(state, call('ended', 2));
  assert.equal(end.effects.length, 1);
  assert.equal(end.state.desired.musicVolume, .2);
  assert.equal(end.state.desired.route, 'call-controls');
});

test('manual pause is never resumed by call end', () => {
  const paused = step(ring().state, { type: 'manual-playback', playback: 'paused' }).state;
  const end = step(paused, call('ended', 2));
  assert.equal(end.state.desired.playback, 'paused');
  assert.ok(end.effects.every(effect => !['play', 'resume', 'media'].includes(effect.type)));
});

test('preexisting pause is preserved and has no duck or restore volume effect', () => {
  const ringing = ring(initial({ playback: 'paused' }));
  assert.equal(ringing.effects.length, 1);
  const end = step(ringing.state, call('ended', 2));
  assert.equal(end.state.desired.playback, 'paused');
  assert.ok(end.effects.every(effect => effect.type !== 'set-music-volume'));
});

test('out-of-order sequence and stale call IDs cannot end or resurrect another call', () => {
  let state = step(ring().state, call('ended', 2)).state;
  const resurrect = step(state, call('ringing', 3));
  assert.deepEqual(resurrect.effects, []);
  assert.equal(resurrect.ignored, 'retired-call');
  state = step(resurrect.state, call('ringing', 4, 'call-2')).state;
  const stale = step(state, call('ended', 5, 'call-1'));
  assert.deepEqual(stale.effects, []);
  assert.equal(stale.state.activeCall.callId, 'call-2');
  const oldSequence = step(stale.state, call('ended', 4, 'call-2'));
  assert.equal(oldSequence.ignored, 'stale-sequence');
  assert.equal(oldSequence.state.activeCall.callId, 'call-2');
});

test('call-phone disconnect restores owned context but never selects another phone', () => {
  const result = step(ring().state, { type: 'disconnect', phoneId: 'phone-b' });
  assert.equal(result.state.activeCall, null);
  assert.equal(result.state.desired.route, 'projection');
  assert.equal(result.state.desired.musicVolume, .8);
  assert.deepEqual(result.state.roles, roles);
  assert.deepEqual(result.state.connectedPhoneIds, ['phone-a']);
  assert.deepEqual(step(result.state, { type: 'disconnect', phoneId: 'phone-b' }).effects, []);
  assert.deepEqual(step(result.state, call('ringing', 2)).effects, []);
});

test('music-phone disconnect prevents volume restoration to an unavailable source', () => {
  const disconnected = step(ring().state, { type: 'disconnect', phoneId: 'phone-a' });
  assert.equal(disconnected.state.activeCall.callId, 'call-1');
  assert.deepEqual(disconnected.effects, []);
  const end = step(disconnected.state, call('ended', 2));
  assert.ok(end.effects.every(effect => effect.type !== 'set-music-volume'));
  assert.deepEqual(end.state.roles, roles);
});

test('a newly available wired phone waits for manual selection without interrupting wireless projection', () => {
  const before = initial();
  const result = step(before, { type: 'phone-available', phoneId: 'phone-c', transport: 'wired' });
  assert.deepEqual(result.state.availableSources, [{ phoneId: 'phone-c', transport: 'wired' }]);
  assert.deepEqual(result.state.roles, before.roles);
  assert.deepEqual(result.state.desired, before.desired);
  assert.deepEqual(result.state.connectedPhoneIds, before.connectedPhoneIds);
  assert.deepEqual(result.effects, []);
  const repeated = step(result.state, { type: 'phone-available', phoneId: 'phone-c', transport: 'wired' });
  assert.deepEqual(repeated.state, result.state);
  assert.deepEqual(repeated.effects, []);
});

test('availability of the same phone on wired transport does not infer a transport handover', () => {
  const before = ring().state;
  const result = step(before, { type: 'phone-available', phoneId: 'phone-a', transport: 'wired' });
  assert.deepEqual(result.state.availableSources, [{ phoneId: 'phone-a', transport: 'wired' }]);
  assert.deepEqual(result.state.roles, before.roles);
  assert.deepEqual(result.state.desired, before.desired);
  assert.deepEqual(result.state.activeCall, before.activeCall);
  assert.deepEqual(result.state.lease, before.lease);
  assert.deepEqual(result.effects, []);
});

test('an active call cannot regress to ringing even with a newer event sequence', () => {
  const active = step(ring().state, call('active', 2)).state;
  const oldPhase = step(active, call('ringing', 3));
  assert.equal(oldPhase.ignored, 'regressive-call-phase');
  assert.equal(oldPhase.state.activeCall.phase, 'active');
  assert.deepEqual(oldPhase.effects, []);
});

test('unsupported reasons persist through call updates and terminal cleanup', () => {
  const first = ring(initial({ capabilities: {} }));
  const repeated = step(first.state, call('ringing', 2));
  const active = step(repeated.state, call('active', 3));
  const end = step(active.state, call('ended', 4));
  for (const result of [repeated, active, end]) {
    assert.deepEqual(result.effects, []);
    assert.deepEqual(result.unsupported, Object.keys(capabilities));
  }
  assert.equal(end.state.activeCall, null);
});

test('malformed call, manual and availability events fail before changing model state', () => {
  const before = ring().state;
  const snapshot = structuredClone(before);
  const invalid = [
    null, {}, { ...call('ringing', 2), sequence: NaN }, { ...call('ringing', 2), sequence: -1 },
    { ...call('ringing', 2), sequence: 1.5 }, { ...call('ringing', 2), callId: '' },
    { ...call('ringing', 2), phoneId: null }, call('fake-phase', 2),
    { type: 'manual-volume', volume: Infinity }, { type: 'manual-volume', volume: 1.1 },
    { type: 'manual-volume', volume: -.1 }, { type: 'manual-volume', volume: '.5' },
    { type: 'manual-route', route: '' }, { type: 'manual-playback', playback: 'toggle' },
    { type: 'disconnect', phoneId: '' }, { type: 'phone-available', phoneId: 'c', transport: 'unknown' }
  ];
  for (const event of invalid) {
    const result = step(before, event);
    assert.equal(result.ignored, 'invalid-event');
    assert.deepEqual(result.effects, []);
    assert.deepEqual(result.state, snapshot);
  }
  assert.deepEqual(before, snapshot);
});

test('invalid initial context cannot produce out-of-range ducking effects', () => {
  for (const options of [
    { musicVolume: 99 }, { musicVolume: NaN }, { musicVolume: '0.5' }, { route: '' },
    { playback: 'unknown' }, { roles: { musicPhoneId: {} } }, { connectedPhoneIds: [null] }
  ]) assert.throws(() => initial(options), /Invalid/);
});

test('retired call retention is bounded while original stale events remain rejected', () => {
  let state = initial();
  for (let index = 0; index < 70; index += 1) {
    state = step(state, call('ringing', index * 2, `call-${index}`)).state;
    state = step(state, call('ended', index * 2 + 1, `call-${index}`)).state;
  }
  assert.ok(state.history[0].retiredCallIds.length <= 64);
  const stale = step(state, call('ringing', 0, 'call-0'));
  assert.equal(stale.ignored, 'stale-sequence');
  assert.deepEqual(stale.effects, []);
  assert.equal(stale.state.activeCall, null);
});

test('disconnect removes availability without selecting another source', () => {
  const available = step(initial(), { type: 'phone-available', phoneId: 'phone-c', transport: 'wired' }).state;
  const result = step(available, { type: 'disconnect', phoneId: 'phone-c' });
  assert.deepEqual(result.state.availableSources, []);
  assert.deepEqual(result.state.roles, roles);
  assert.deepEqual(result.effects, []);
});

test('capabilities are rechecked before status presentation and restoration effects', () => {
  const live = ring().state;
  const revoked = { ...live, capabilities: { ...capabilities, hfpCallControls: false } };
  const active = step(revoked, call('active', 2));
  assert.deepEqual(active.effects, []);
  assert.deepEqual(active.unsupported, ['hfpCallControls']);
  const end = step(active.state, call('ended', 3));
  assert.deepEqual(end.effects, []);
  assert.deepEqual(end.unsupported, ['hfpCallControls']);
  assert.equal(end.state.activeCall, null);
  assert.equal(end.state.lease, null);
});
