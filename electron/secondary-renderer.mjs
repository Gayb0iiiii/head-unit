/** Read-only role surface. Native planes and RealDash instrumentation remain separate. */
export function attachSecondaryView({api,document}) {
  const panel=document.getElementById('panel'),label=document.getElementById('role'),status=document.getElementById('status');
  let disposed=false,revision=0,reported=false;
  function render(value) {
    if(disposed)return;
    const role=['cluster','aux'].includes(value?.role)?value.role:null;
    const connected=role!==null&&value?.connected===true;
    const front=connected&&['livi','cluster','camera','projection'].includes(value.front)?value.front:null;
    label.textContent=role==='cluster'?'Cluster display':role==='aux'?'Auxiliary display':'Secondary display';
    panel.hidden=connected&&value.presented===true&&front!==null&&front!=='livi';
    status.textContent=connected&&front!==null?'Controls are on the main display.':'Waiting for connection.';
    if(connected&&front==='livi'&&value.presented===true&&!reported){
      reported=true;
      try{Promise.resolve(api.shown()).catch(()=>{});}catch{}
    }
  }
  render(null);
  const detach=api.onView(value=>{revision++;render(value);});
  const initialRevision=revision;
  try{Promise.resolve(api.getView()).then(value=>{if(!disposed&&revision===initialRevision)render(value);}).catch(()=>{});}catch{}
  return()=>{if(disposed)return;disposed=true;detach();};
}
if(typeof window!=='undefined'&&window.headunitSecondary){
  const detach=attachSecondaryView({api:window.headunitSecondary,document:window.document});
  window.addEventListener('unload',detach,{once:true});
}
