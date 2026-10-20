import {app,BrowserWindow,ipcMain} from 'electron';
import {startHeadunitApplication} from './application.mjs';

// Executed only by an explicit Electron application launch; never starts the native engine.
try {startHeadunitApplication({app,BrowserWindow,ipcMain});}
catch {console.error('Headunit startup rejected. Check the local socket, page and secure launch configuration.');app.exit(1);}
