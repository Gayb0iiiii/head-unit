import {app,BrowserWindow} from 'electron';
import {startPreviewApplication} from './preview-application.mjs';

try {startPreviewApplication({app,BrowserWindow});}
catch {console.error('Headunit preview startup rejected. Check the build and secure Electron launch.');app.exit(1);}
