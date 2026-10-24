import path from 'node:path';

/** The absent-backend path is stable; connecting to it never launches LIVI. */
export function kioskSocketPath(env,uid) {
  const supplied=env.LIVI_CORE_SOCKET||env.HEADUNIT_CORE_SOCKET;
  if(supplied!==undefined)return supplied;
  const runtime=env.XDG_RUNTIME_DIR;
  if(typeof runtime!=='string'||!path.isAbsolute(runtime))throw Error('XDG_RUNTIME_DIR required');
  if(!Number.isInteger(uid)||uid<0)throw Error('User identity required');
  return path.join(runtime,'headunit','core.sock');
}
