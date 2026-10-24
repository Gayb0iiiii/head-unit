import test from 'node:test';
import assert from 'node:assert/strict';
import {kioskSocketPath} from '../electron/kiosk-config.mjs';
test('kiosk socket resolves to a local stable endpoint without inventing a backend',()=>{
 assert.equal(kioskSocketPath({XDG_RUNTIME_DIR:'/run/user/1000'},1000),'/run/user/1000/headunit/core.sock');
 assert.equal(kioskSocketPath({HEADUNIT_CORE_SOCKET:'/tmp/live/core.sock'},1000),'/tmp/live/core.sock');
 assert.equal(kioskSocketPath({HEADUNIT_CORE_SOCKET:'/tmp/other/core.sock',LIVI_CORE_SOCKET:'/tmp/native/core.sock'},1000),'/tmp/native/core.sock');
 assert.throws(()=>kioskSocketPath({},1000),/XDG_RUNTIME_DIR/);
});
