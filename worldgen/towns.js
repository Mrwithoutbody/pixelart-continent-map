// TOWNS — name generator + town-cluster / economy-building / field placement.
const SYL=['ka','na','ru','el','mi','tor','bo','za','dre','lu','vi','ash','gor','pen','ma','sk','ith','ano','bel','far'];
function townName(rng){let n=2+(rng()*2|0),s='';for(let i=0;i<n;i++)s+=SYL[rng()*SYL.length|0];return s[0].toUpperCase()+s.slice(1);}

// scatter n houses around a town center on passable land (town = cluster, like example5)
function buildCluster(cx,cy,n,rng,biome){
  const houses=[{x:cx,y:cy,small:false}];                               // centre = main building
  const pass=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&PASSABLE[biome[y*W+x]];
  let R=5,att=0;
  while(houses.length<n && att<n*90){att++;
    const a=rng()*6.2832, rad=4+rng()*R;
    const x=Math.round(cx+Math.cos(a)*rad), y=Math.round(cy+Math.sin(a)*rad*0.8);
    if(!pass(x,y)) continue;
    if(houses.some(h=>Math.abs(h.x-x)<6&&Math.abs(h.y-y)<6)) continue;   // wider spacing
    houses.push({x,y,small:rng()<0.45});                                // small = shack filler
    if(houses.length%2===0) R+=1.6;
  }
  return houses;
}
// which economy buildings a town gets, from biomes within reach
function cityEconomy(c,biome){
  const RAD=16,cnt={F:0,G:0,M:0,H:0,W:0,D:0};
  for(let dy=-RAD;dy<=RAD;dy++)for(let dx=-RAD;dx<=RAD;dx++){
    if(dx*dx+dy*dy>RAD*RAD)continue;
    const x=c.x+dx,y=c.y+dy; if(x<0||y<0||x>=W||y>=H)continue;
    const b=biome[y*W+x];
    if(b===BIOME.FOREST)cnt.F++; else if(b===BIOME.GRASS)cnt.G++;
    else if(b===BIOME.MOUNTAIN)cnt.M++; else if(b===BIOME.HILLS)cnt.H++;
    else if(b<=BIOME.SHALLOW)cnt.W++; else if(b===BIOME.DESERT)cnt.D++; }
  const out=[],TH=14;
  if(cnt.G>TH)out.push('farm','piekarnia');           // grain town bakes (grain+salt)
  else if(cnt.W>4)out.push('fishery','piekarnia');    // else a coastal town bakes (fish+salt)
  if(cnt.G>TH&&cnt.W>4)out.push('fishery');           // grain town that also has a coast still fishes
  if(cnt.F>TH)out.push('lumber_camp','sawmill');
  if(cnt.M>TH)out.push('mine','smelter');
  if(cnt.H>TH)out.push('quarry');
  if(cnt.D>TH)out.push('salt_works');
  out.push('warehouse'); if(c.pop>600)out.push('market'); if(cnt.W>6)out.push('harbor');
  const cap=Math.max(2,Math.min(out.length,2+Math.round(c.pop/220)));   // bigger town = more
  const res=out.slice(0,cap);
  if(c.seat) res.push('chapel');                                        // a seat anchors a chapel
  if(c.seat&&(cnt.M>10||c.pop>1000)) res.push('tower');                 // ...and a watchtower if strong
  return res;
}
function placeEconomy(c,biome,rng){
  const placed=[];
  for(const id of cityEconomy(c,biome)){ let put=null;
    for(let k=0;k<60 && !put;k++){const a=rng()*6.2832,rad=5+rng()*9;
      const x=Math.round(c.x+Math.cos(a)*rad),y=Math.round(c.y+Math.sin(a)*rad*0.8);
      if(!(x>=0&&y>=0&&x<W&&y<H&&PASSABLE[biome[y*W+x]]))continue;
      if(c.houses.concat(placed).some(b=>Math.abs(b.x-x)<5&&Math.abs(b.y-y)<5))continue;
      put={x,y}; }
    if(put)placed.push({x:put.x,y:put.y,spr:SPR[ECON_SPR[id]]||SPR.workshop,id,name:BLD[id].name}); }
  return placed;
}
// crop fields on open land around a town that has a farm. flat ground patches, spread out,
// clear of buildings + each other. count scales a little with population.
function placeFields(c,biome,rng){
  const out=[], want=3+Math.min(4,Math.round(c.pop/700)+(rng()*2|0));
  const blocked=c.houses.concat(c.builds);
  for(let t=0;t<90 && out.length<want;t++){
    const a=rng()*6.2832, rad=7+rng()*11;
    const x=Math.round(c.x+Math.cos(a)*rad), y=Math.round(c.y+Math.sin(a)*rad*0.78);
    if(!(x>=1&&y>=1&&x<W-1&&y<H-1))continue;
    const b=biome[y*W+x]; if(b!==BIOME.GRASS&&b!==BIOME.DESERT)continue;     // crops on open land only
    if(blocked.some(o=>Math.abs(o.x-x)<6&&Math.abs(o.y-y)<5))continue;       // clear of buildings
    if(out.some(o=>Math.abs(o.x-x)<8&&Math.abs(o.y-y)<6))continue;          // spread fields apart
    out.push({x,y,spr:SPR.fields[(x+y)&1]});
  }
  return out;
}
// Connect most water bodies: carve shallow channels from inland lakes to the sea.
