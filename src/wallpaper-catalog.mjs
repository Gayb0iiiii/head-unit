// Original bundled artwork and local CSS palettes. IDs are persisted, never URLs.
export const wallpaperGroups=Object.freeze([
  {id:'landscapes',title:'Landscapes',items:[['coast','Coast'],['dusk','Dusk'],['meadow','Meadow'],['blue-forms','Blue Forms']]},
  {id:'pastels',title:'Pastels',items:[['pastel-mint','Mint'],['pastel-lilac','Lilac'],['pastel-blush','Blush'],['pastel-peach','Peach'],['pastel-sky','Sky'],['pastel-butter','Butter']]},
  {id:'solids',title:'Solid colours',items:[['solid-slate','Slate'],['solid-ivory','Ivory'],['solid-ink','Ink'],['solid-rose','Rose'],['solid-sage','Sage']]},
  {id:'gradients',title:'Gradients',items:[['graphite','Graphite'],['gradient-lagoon','Lagoon'],['gradient-sunset','Sunset'],['gradient-aurora','Aurora']]}
]);
export const wallpaperIds=new Set(wallpaperGroups.flatMap(group=>group.items.map(([id])=>id)));
export const accents=Object.freeze([['sea','Sea glass'],['cobalt','Cobalt'],['coral','Coral'],['moss','Moss'],['violet','Violet'],['amber','Amber']]);
export const accentIds=new Set(accents.map(([id])=>id));
