import {configuredPicture} from './picture.mjs';
import {homeView} from './home-view.mjs';
/** Only this allowlisted view may cross a future Electron preload boundary. Never send raw core state. */
export function publicView(session){
 if(!session.ready||!session.state)return {connected:false,front:'livi',phones:[],volume:null,homeStatus:homeView(session)};
 const s=session.state,picture=configuredPicture(session);
 return {...(picture?{picture}:{}),homeStatus:homeView(session),connected:true,front:['livi','projection','camera','cluster'].includes(s.front?.main)?s.front.main:'livi',phones:(Array.isArray(s.devices)?s.devices:[]).filter(d=>d&&typeof d.id==='string').map(d=>({id:d.id,name:typeof d.name==='string'?d.name:'Phone',status:['active','available','offline'].includes(d.status)?d.status:'offline'})),volume:typeof s.config?.huVolume==='number'?s.config.huVolume:null};
}
