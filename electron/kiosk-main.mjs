import {app,BrowserWindow,Menu,ipcMain,screen,shell} from 'electron';
import {startHeadunitApplication} from './application.mjs';
import {kioskSocketPath} from './kiosk-config.mjs';

try {
  if(process.env.HEADUNIT_DEBUG==='1')console.error('Headunit: Electron entry loaded');
  app.commandLine.appendSwitch('ozone-platform','wayland');
  const env={...process.env,LIVI_CORE_SOCKET:kioskSocketPath(process.env,process.getuid())};
  startHeadunitApplication({app,BrowserWindow,Menu,shell,ipcMain,screen,env,
    pageURL:new URL('../dist/production.html',import.meta.url).href});
} catch(error) {
  console.error('Headunit startup rejected:',error);
  app.exit(1);
}
