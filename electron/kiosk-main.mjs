import {app,BrowserWindow,ipcMain,screen} from 'electron';
import {startHeadunitApplication} from './application.mjs';
import {kioskSocketPath} from './kiosk-config.mjs';

try {
  app.commandLine.appendSwitch('ozone-platform','wayland');
  const env={...process.env,LIVI_CORE_SOCKET:kioskSocketPath(process.env,process.getuid())};
  startHeadunitApplication({app,BrowserWindow,ipcMain,screen,env,
    pageURL:new URL('../dist/production.html',import.meta.url).href});
} catch {
  console.error('Headunit startup rejected. Check the local page, socket path and secure launch.');
  app.exit(1);
}
