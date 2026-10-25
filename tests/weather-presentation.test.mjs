import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherLabel,weatherAge} from '../src/weather-presentation.mjs';

test('known WMO code receives its documented description; unknown code is not guessed',()=>{
  assert.equal(weatherLabel(2),'Partly cloudy');
  assert.equal(weatherLabel(61),'Slight rain');
  assert.equal(weatherLabel(42),'Conditions unavailable');
});
test('saved reading age is explicit and bounded',()=>{
  assert.equal(weatherAge(600000,0),'10 min ago');
  assert.equal(weatherAge(3600000,0),'1 hr ago');
  assert.equal(weatherAge(1000,2000),'just now');
  assert.equal(weatherAge(1000,120000),'time unavailable');
});
