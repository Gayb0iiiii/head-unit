/** Pure policy. Connect only a verified headlight signal; never infer from missing data. */
export function resolveAppearance(preference='auto',headlights,lastMode='night') {
  if(!['auto','day','night'].includes(preference))throw Error('Invalid appearance preference');
  const signalAvailable=typeof headlights==='boolean';
  if(preference!=='auto')return {mode:preference,source:'manual',signalAvailable};
  if(signalAvailable)return {mode:headlights?'night':'day',source:'headlights',signalAvailable:true};
  return {mode:['day','night'].includes(lastMode)?lastMode:'night',source:'fallback',signalAvailable:false};
}
