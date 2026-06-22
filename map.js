// ============================================================
//  PIXELART CONTINENT MAP  —  engine
//  Real terrain model (height/moisture/biome/move-cost), not just pixels.
//  Continent w/ ocean + coastline. Factions = Voronoi over CITIES.
//  Hand-drawn pixel sprites (sprites-core/buildings/terrain/units.js). Camera zoom/pan. Caravans: carts on roads,
//  ships on sea lanes between ports. Click a city for its make-up + economy.
// ============================================================
const W = 1500, H = 940;                 // world size in tiles (bigger -> towns less cramped)
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
function fit(){ cv.width = innerWidth; cv.height = innerHeight; ctx.imageSmoothingEnabled = false; }
addEventListener('resize', fit); fit();

// ---------- rng / noise ----------
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function makeNoise(seed){
  const r=mulberry32(seed),G=256,g=new Float32Array(G*G);
  for(let i=0;i<g.length;i++)g[i]=r();
  const at=(x,y)=>g[((y%G+G)%G)*G+((x%G+G)%G)];
  return (x,y)=>{const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
    const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    const a=at(x0,y0),b=at(x0+1,y0),c=at(x0,y0+1),d=at(x0+1,y0+1);
    return (a*(1-sx)+b*sx)*(1-sy)+(c*(1-sx)+d*sx)*sy;};
}
function fbm(n,x,y,oct=5){let a=0,amp=0.5,f=1,norm=0;for(let o=0;o<oct;o++){a+=amp*n(x*f,y*f);norm+=amp;f*=2;amp*=0.5;}return a/norm;}
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const smooth=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0),0,1);return t*t*(3-2*t);};
// proper segment crossing (strict; shared endpoints / collinear touching don't count)
function segCross(a,b,c,d){const s=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  const d1=s(c,d,a),d2=s(c,d,b),d3=s(a,b,c),d4=s(a,b,d);
  return ((d1>0)!==(d2>0))&&((d3>0)!==(d4>0));}

// ---------- tunables ----------
const CITY_COUNT=28, CITY_MIN_DIST=42;       // target town count + min tiles between towns

// ---------- biomes + terrain coefficients ----------
const BIOME={DEEP:0,SHALLOW:1,BEACH:2,DESERT:3,GRASS:4,FOREST:5,HILLS:6,MOUNTAIN:7};
const COST =[Infinity,Infinity,1.3,1.5,1.0,2.2,2.8,Infinity]; // move-cost per biome; Inf = impassable
const PASSABLE=COST.map(c=>isFinite(c));

// ---------- palette ----------
const PAL={
  deep:'#5e7d86', shallow:'#80a0a6', foam:'#b6cfd0',
  beach:'#dcd0a8', beachDk:'#c9bb8d',
  desert:'#d8c79a', desertDk:'#c6b384',
  grass:['#8a9a5c','#94a566','#9fb072','#7c8c4e'], grassDk:'#6f8048', // muted sage
  forest:'#5f7438', forestDk:'#516229',
  hill:'#9a9266', hillDk:'#85794f',
  rock:'#b8a784', rockDk:'#a8966f', snow:'#e7ecec',                  // warm tan massif (matches mountains)
  road:'#2c2c24',
  label:'#efe7cf', labelEdge:'#33302a', text:'#2a2620',
};
// factions: house-sheet color key, territory tint, border color
// flag = small faction accent on the house (roof + walls stay neutral)
const FACTIONS=[
  {name:'Verdal',  key:'Lime',   tint:[120,170,70],  border:'#33571c', flag:'#5fbf3f'},
  {name:'Sarrok',  key:'Wood',   tint:[170,130,80],  border:'#6a4a1e', flag:'#e08a2a'},
  {name:'Tealune', key:'Cyan',   tint:[70,150,160],  border:'#1c565e', flag:'#2ec6c6'},
  {name:'Crimhold',key:'Red',    tint:[180,80,80],   border:'#7a2424', flag:'#d83030'},
  {name:'Marenth', key:'Purple', tint:[140,90,170],  border:'#48296a', flag:'#a84fd0'},
];

// economy buildings (subset of ECONOMY.md) placed in/around a town based on nearby biomes
const BLD={
  farm:{name:'Farma'}, lumber_camp:{name:'Obóz drwali'}, mine:{name:'Kopalnia'},
  quarry:{name:'Kamieniołom'}, fishery:{name:'Przystań'}, salt_works:{name:'Warzelnia'},
  mill:{name:'Młyn'}, sawmill:{name:'Tartak'}, smelter:{name:'Huta'},
  warehouse:{name:'Magazyn'}, market:{name:'Targ'}, harbor:{name:'Port'},
  chapel:{name:'Kaplica'}, tower:{name:'Wieża'},
};
const ECON_SPR={mill:'windmill', market:'market', chapel:'chapel', tower:'tower'}; // id -> distinctive sprite (else workshop)


// ============================================================
//  WORLD  (pure data + terrain model)
// ============================================================
let WORLD=null;
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
  if(cnt.G>TH)out.push('farm','mill');
  if(cnt.F>TH)out.push('lumber_camp','sawmill');
  if(cnt.M>TH)out.push('mine','smelter');
  if(cnt.H>TH)out.push('quarry');
  if(cnt.W>4)out.push('fishery');
  if(cnt.D>TH)out.push('salt_works');
  out.push('warehouse'); if(c.pop>900)out.push('market'); if(cnt.W>6)out.push('harbor');
  const cap=Math.max(2,Math.min(out.length,2+Math.round(c.pop/450)));   // bigger town = more
  const res=out.slice(0,cap);
  if(c.pop>1500) res.push('chapel');                                    // landmarks always show
  if(c.pop>2500||cnt.W>6) res.push('tower');
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
function genWorld(seed){
  const rng=mulberry32(seed);
  const nH=makeNoise(seed), nW1=makeNoise(seed^0x1111), nW2=makeNoise(seed^0x2222), nM=makeNoise(seed^0x9e37), nD=makeNoise(seed*7+1);
  const N=W*H;
  const height=new Float32Array(N), moist=new Float32Array(N), biome=new Uint8Array(N), cost=new Float32Array(N);
  const cx=W/2, cy=H/2, maxR=Math.min(W,H)/2;
  const SL=0.34;                                   // sea level

  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x;
    // domain-warped fbm height
    const wx=x/95 + 0.6*fbm(nW1,x/120,y/120,3);
    const wy=y/95 + 0.6*fbm(nW2,x/120,y/120,3);
    let h=fbm(nH,wx,wy,6);
    // radial falloff -> continent ringed by ocean
    const d=Math.hypot(x-cx,y-cy)/maxR;
    const fall=smooth(0.86,1.28,d);
    h=clamp(h*1.15 - fall*fall*0.80, 0, 1);
    h=Math.pow(h,1.45);                 // redistribute: most land lowland, peaks rare
    height[i]=h;
    const m=fbm(nM,x/70,y/70,4); moist[i]=m;
    let bi;
    if(h<SL-0.06) bi=BIOME.DEEP;
    else if(h<SL) bi=BIOME.SHALLOW;
    else if(h<SL+0.04) bi=BIOME.BEACH;
    else if(h>0.86) bi=BIOME.MOUNTAIN;
    else if(h>0.72) bi=BIOME.HILLS;
    else if(m<0.34) bi=BIOME.DESERT;
    else if(m>0.60) bi=BIOME.FOREST;
    else bi=BIOME.GRASS;
    biome[i]=bi; cost[i]=COST[bi];
  }

  const isLand=i=>biome[i]>=BIOME.BEACH;
  const isWater=i=>biome[i]<=BIOME.SHALLOW;

  // ---- cities on buildable land (grass/beach/desert), min spacing ----
  const cities=[]; let tries=0;
  const buildable=i=>{const b=biome[i];return b===BIOME.GRASS||b===BIOME.BEACH||b===BIOME.DESERT;};
  while(cities.length<CITY_COUNT && tries<20000){tries++;
    const x=8+rng()*(W-16)|0, y=8+rng()*(H-16)|0, i=y*W+x;
    if(!buildable(i)) continue;
    if(cities.every(c=>Math.hypot(c.x-x,c.y-y)>CITY_MIN_DIST)) cities.push({x,y});
  }
  // ---- assign factions: F capitals spread out, others join nearest capital ----
  const F=Math.min(FACTIONS.length,cities.length);
  const caps=[];
  caps.push(0);
  while(caps.length<F){ // farthest-point sampling
    let bi=-1,bd=-1;
    for(let i=0;i<cities.length;i++){ if(caps.includes(i))continue;
      let dm=1e9; for(const c of caps) dm=Math.min(dm,Math.hypot(cities[i].x-cities[c].x,cities[i].y-cities[c].y));
      if(dm>bd){bd=dm;bi=i;} }
    caps.push(bi);
  }
  for(const c of cities){ let bf=0,bd=1e9;
    caps.forEach((ci,fi)=>{const dd=Math.hypot(c.x-cities[ci].x,c.y-cities[ci].y); if(dd<bd){bd=dd;bf=fi;}});
    c.f=bf; c.name=townName(rng);
    c.pop=Math.round((0.2+rng()*rng()*3)*1000);                 // skewed: most towns small
    const n=Math.max(1,Math.min(12,1+Math.round(c.pop/350)));   // houses scale w/ population
    c.houses=buildCluster(c.x,c.y,n,rng,biome);
    // residential composition: centre = best tier the population affords, rest = dom/chata
    const tier=c.pop>2200?'manor':c.pop>1100?'townhouse':'house';
    c.houses.forEach((h,i)=>{ h.btype = i===0?tier : (h.small?'shack':'house');
      h.spr = h.btype==='shack'?SPR.hut : h.btype==='manor'?SPR.manor
            : h.btype==='townhouse'?SPR.townhouse : (((h.x+h.y)&1)?SPR.house:SPR.cottage); });
    c.builds=placeEconomy(c,biome,rng);                        // economy buildings on the outskirts
    const all=c.houses.concat(c.builds);
    c.r=all.reduce((m,h)=>Math.max(m,Math.hypot(h.x-c.x,h.y-c.y)),1.5);
    c.minY=all.reduce((m,h)=>Math.min(m,h.y),c.y);
  }

  // ---- territory: each LAND tile owned by nearest city -> its faction ----
  const fac=new Int8Array(N).fill(-1);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x; if(!isLand(i))continue;
    let bf=0,bd=1e15;
    for(const c of cities){const dx=c.x-x,dy=c.y-y,dd=dx*dx+dy*dy; if(dd<bd){bd=dd;bf=c.f;}}
    fac[i]=bf;
  }

  // ---- roads: land-only Euclidean MST (planar tree => connects every city, no crossings) ----
  const crossesWater=(a,b)=>{const A=cities[a],B=cities[b],d=Math.hypot(B.x-A.x,B.y-A.y),n=Math.max(1,Math.round(d));
    for(let i=0;i<=n;i++){const t=i/n,x=(A.x+(B.x-A.x)*t)|0,y=(A.y+(B.y-A.y)*t)|0;
      if(biome[y*W+x]<=BIOME.SHALLOW) return true;} return false;};
  const cand=[];
  for(let a=0;a<cities.length;a++)for(let b=a+1;b<cities.length;b++)
    if(!crossesWater(a,b)) cand.push([Math.hypot(cities[a].x-cities[b].x,cities[a].y-cities[b].y),a,b]);
  cand.sort((p,q)=>p[0]-q[0]);
  const par=cities.map((_,i)=>i), find=i=>{while(par[i]!==i){par[i]=par[par[i]];i=par[i];}return i;};
  const edges=[];
  const crosses=(a,b)=>edges.some(([p,q])=> p!==a&&p!==b&&q!==a&&q!==b && segCross(cities[a],cities[b],cities[p],cities[q]));
  // Kruskal over distance-sorted cand. allowCross=false => planar tree (no crossings);
  // allowCross=true 2nd pass only fires for components a planar edge couldn't join — same
  // landmass (cand is water-filtered), shortest-first, so any crossing is rare + minimal.
  const grow=allowCross=>{for(const[d,a,b]of cand){const ra=find(a),rb=find(b);
    if(ra!==rb && (allowCross||!crosses(a,b))){par[ra]=rb;edges.push([a,b]);}}};
  grow(false); grow(true);
  const adj=cities.map(()=>[]); for(const[a,b]of edges){adj[a].push(b);adj[b].push(a);}

  // ---- decoration entities (consistent w/ biome) ----
  const trees=[], bushes=[], peaks=[], hills=[], rocks=[];
  const M=BIOME.MOUNTAIN;
  const nearMt=i=>biome[i-1]===M||biome[i+1]===M||biome[i-W]===M||biome[i+W]===M
               ||biome[i-W-1]===M||biome[i-W+1]===M||biome[i+W-1]===M||biome[i+W+1]===M;
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const i=y*W+x, b=biome[i];
    const det=nD(x/3,y/3);
    if(b===BIOME.FOREST && rng()<0.0117+det*0.013) trees.push({x:x+rng()*0.6-0.3,y});
    else if(b===BIOME.GRASS && rng()<0.0029) trees.push({x,y});
    else if(b===M && rng()<0.0124) peaks.push({x,y});
    else if(b===BIOME.HILLS){
      if(nearMt(i)){ if(rng()<0.041) rocks.push({x,y}); }     // foot of mountains -> pebbles
      else if(rng()<0.005) hills.push({x,y});                 // standalone foothills -> rounded knolls (sparse)
    }
    // bushes scattered on grass + forest floor
    else if((b===BIOME.GRASS||b===BIOME.FOREST) && rng()<0.0041) bushes.push({x,y});
  }
  for(const t of trees) t.spr=SPR.trees[(t.y*7+(t.x|0))%SPR.trees.length];
  for(const bsh of bushes) bsh.spr=SPR.bushes[(bsh.x+bsh.y)%SPR.bushes.length];
  for(const p of peaks) p.spr=SPR.mountains[(p.x+p.y)%SPR.mountains.length];
  for(const h of hills) h.spr=SPR.hills[(h.x+h.y)%SPR.hills.length];
  for(const r of rocks) r.spr=SPR.rocks[(r.x+r.y)%SPR.rocks.length];

  // ---- ports + sea network ---- (isWater defined above)
  for(const c of cities){ c.port=false; c.dock=null;          // dock = nearest water tile
    for(let r=1;r<=5 && !c.dock;r++) for(let dy=-r;dy<=r && !c.dock;dy++) for(let dx=-r;dx<=r;dx++){
      const x=c.x+dx,y=c.y+dy; if(x<1||y<1||x>=W-1||y>=H-1)continue;
      if(isWater(y*W+x)){ c.port=true; c.dock={x,y}; break; } } }
  const straightWater=(p,q)=>{const d=Math.hypot(q.x-p.x,q.y-p.y),n=Math.max(1,Math.round(d));
    for(let i=0;i<=n;i++){const t=i/n,x=(p.x+(q.x-p.x)*t)|0,y=(p.y+(q.y-p.y)*t)|0;
      if(!isWater(y*W+x)) return false;} return true;};                 // shortest sea lane = straight, all-water
  // combined graph: land roads + sea lanes between ports
  const cadj=cities.map(()=>[]);
  for(const[a,b]of edges){cadj[a].push({to:b,mode:'land'});cadj[b].push({to:a,mode:'land'});}
  const ports=cities.map((_,i)=>i).filter(i=>cities[i].port);
  for(let i=0;i<ports.length;i++)for(let j=i+1;j<ports.length;j++){const a=ports[i],b=ports[j];
    if(Math.hypot(cities[a].x-cities[b].x,cities[a].y-cities[b].y)<260 && straightWater(cities[a].dock,cities[b].dock)){
      cadj[a].push({to:b,mode:'sea'});cadj[b].push({to:a,mode:'sea'});}}

  // ---- route planning (caravan: land legs as cart, sea legs as ship) ----
  const reachableFrom=h=>{const seen=new Set([h]),q=[h],out=[];while(q.length){const u=q.shift();
    for(const e of cadj[u])if(!seen.has(e.to)){seen.add(e.to);out.push(e.to);q.push(e.to);}}return out;};
  const planRoute=(s,t)=>{if(s===t)return[];const prev=new Map([[s,null]]),q=[s];
    while(q.length){const u=q.shift();if(u===t)break;
      for(const e of cadj[u])if(!prev.has(e.to))prev.set(e.to,{from:u,mode:e.mode}),q.push(e.to);}
    if(!prev.has(t))return null;const seq=[];let cur=t;
    while(prev.get(cur)){const p=prev.get(cur);seq.unshift({from:p.from,to:cur,mode:p.mode});cur=p.from;}return seq;};
  const segmentsFor=route=>{const segs=[];for(const e of route){const A=cities[e.from],B=cities[e.to];
    if(e.mode==='land'){ segs.push({x0:A.x,y0:A.y,x1:B.x,y1:B.y,mode:'land'}); }   // straight land road A->B
    else{ segs.push({x0:A.x,y0:A.y,x1:A.dock.x,y1:A.dock.y,mode:'sea'});       // walk to dock, then sail, then to town
          segs.push({x0:A.dock.x,y0:A.dock.y,x1:B.dock.x,y1:B.dock.y,mode:'sea'});
          segs.push({x0:B.dock.x,y0:B.dock.y,x1:B.x,y1:B.y,mode:'sea'}); }}
    for(const s of segs)s.len=Math.hypot(s.x1-s.x0,s.y1-s.y0)||1;return segs;};

  // ---- merchants: caravans with a destination, multi-modal route ----
  const merchants=[];
  for(let m=0;m<18;m++){const home=rng()*cities.length|0,reach=reachableFrom(home);if(!reach.length)continue;
    const dest=reach[rng()*reach.length|0],route=planRoute(home,dest);if(!route||!route.length)continue;
    merchants.push({home,dest,f:rng()<0.5?cities[home].f:-1,segs:segmentsFor(route),si:0,t:rng(),speed:0.10+rng()*0.10});}

  const world={seed,W,H,height,moist,biome,cost,fac,cities,edges,adj,cadj,merchants,trees,bushes,peaks,hills,rocks,
    bitmap:bakeTerrain(height,moist,biome,fac)};
  // runtime route replanning (called when a caravan reaches its destination)
  world.replan=m=>{const home=m.dest,reach=reachableFrom(home);
    if(!reach.length){m.si=0;m.t=0;return;}
    const dest=reach[(Math.random()*reach.length)|0],route=planRoute(home,dest);
    if(!route){m.si=0;m.t=0;return;}
    m.home=home;m.dest=dest;m.segs=segmentsFor(route);m.si=0;m.t=0;};
  // ---- terrain-model API for future units ----
  world.idx=(x,y)=>((y|0)*W+(x|0));
  world.inBounds=(x,y)=>x>=0&&y>=0&&x<W&&y<H;
  world.biomeAt=(x,y)=>world.inBounds(x,y)?biome[world.idx(x,y)]:BIOME.DEEP;
  world.costAt =(x,y)=>world.inBounds(x,y)?cost[world.idx(x,y)]:Infinity;
  world.passableAt=(x,y)=>world.inBounds(x,y)&&PASSABLE[biome[world.idx(x,y)]];
  world.factionAt =(x,y)=>world.inBounds(x,y)?fac[world.idx(x,y)]:-1;
  return world;
}

// bake terrain + coastline + faction tint + borders into one low-res canvas
function bakeTerrain(height,moist,biome,fac){
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const img=x.createImageData(W,H),D=img.data;
  const hex=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  const C={deep:hex(PAL.deep),shallow:hex(PAL.shallow),foam:hex(PAL.foam),
    beach:hex(PAL.beach),beachDk:hex(PAL.beachDk),desert:hex(PAL.desert),desertDk:hex(PAL.desertDk),
    grass:PAL.grass.map(hex),grassDk:hex(PAL.grassDk),forest:hex(PAL.forest),forestDk:hex(PAL.forestDk),
    hill:hex(PAL.hill),hillDk:hex(PAL.hillDk),rock:hex(PAL.rock),rockDk:hex(PAL.rockDk),snow:hex(PAL.snow)};
  const set=(i,col)=>{const j=i*4;D[j]=col[0];D[j+1]=col[1];D[j+2]=col[2];D[j+3]=255;};
  const land=i=>biome[i]>=BIOME.BEACH, water=i=>biome[i]<=BIOME.SHALLOW;
  for(let y=0;y<H;y++)for(let xx=0;xx<W;xx++){
    const i=y*W+xx, b=biome[i], dith=((xx+y)&1);
    let col;
    switch(b){
      case BIOME.DEEP: col=C.deep; break;
      case BIOME.SHALLOW: col=dith?C.shallow:C.deep; break;
      case BIOME.BEACH: col=dith?C.beach:C.beachDk; break;
      case BIOME.DESERT: col=dith?C.desert:C.desertDk; break;
      case BIOME.GRASS: { const s=(height[i]*7|0)+ (moist[i]>0.5?1:0); col=C.grass[[3,0,0,1,1,2,2,2][s]||0]; break; }
      case BIOME.FOREST: col=dith?C.forest:C.forestDk; break;
      case BIOME.HILLS: col=dith?C.hill:C.hillDk; break;
      case BIOME.MOUNTAIN: col=height[i]>0.92?C.snow:(dith?C.rock:C.rockDk); break;
    }
    // faction tint on land
    if(fac[i]>=0){const t=FACTIONS[fac[i]].tint; col=[(col[0]*0.84+t[0]*0.16)|0,(col[1]*0.84+t[1]*0.16)|0,(col[2]*0.84+t[2]*0.16)|0];}
    set(i,col);
  }
  // coastline pass: foam on shallow next to land
  const px4=(i,col)=>{const j=i*4;D[j]=col[0];D[j+1]=col[1];D[j+2]=col[2];};
  for(let y=1;y<H-1;y++)for(let xx=1;xx<W-1;xx++){
    const i=y*W+xx;
    if(biome[i]===BIOME.SHALLOW){
      if(land(i-1)||land(i+1)||land(i-W)||land(i+W)) px4(i,C.foam);
    } else if(land(i)){
      // shoreline: land tile touching water -> darker sand edge
      if(water(i-1)||water(i+1)||water(i-W)||water(i+W)) px4(i,C.beachDk);
      // faction border: land neighbor of different faction
      else { const r=fac[i+1],d=fac[i+W];
        if((r>=0&&r!==fac[i])||(d>=0&&d!==fac[i])) px4(i,hex(FACTIONS[fac[i]].border)); }
    }
  }
  x.putImageData(img,0,0); return c;
}

// ============================================================
//  CAMERA
// ============================================================
const cam={x:W/2,y:H/2,zoom:3,min:1,max:16};
function clampCam(){cam.zoom=Math.max(cam.min,Math.min(cam.max,cam.zoom));
  const vw=cv.width/cam.zoom,vh=cv.height/cam.zoom;
  cam.x=clamp(cam.x,Math.min(W/2,vw/2),Math.max(W/2,W-vw/2));
  cam.y=clamp(cam.y,Math.min(H/2,vh/2),Math.max(H/2,H-vh/2));}
function w2s(wx,wy){return [(wx-cam.x)*cam.zoom+cv.width/2,(wy-cam.y)*cam.zoom+cv.height/2];}
function s2w(sx,sy){return [(sx-cv.width/2)/cam.zoom+cam.x,(sy-cv.height/2)/cam.zoom+cam.y];}
let drag=null,downPos=null;
cv.addEventListener('mousedown',e=>{drag={sx:e.clientX,sy:e.clientY,cx:cam.x,cy:cam.y};downPos={x:e.clientX,y:e.clientY};});
addEventListener('mouseup',e=>{ if(downPos){const dx=e.clientX-downPos.x,dy=e.clientY-downPos.y; if(dx*dx+dy*dy<16) pickCity(e.clientX,e.clientY);} drag=null;downPos=null;});
addEventListener('mousemove',e=>{if(!drag)return;cam.x=drag.cx-(e.clientX-drag.sx)/cam.zoom;cam.y=drag.cy-(e.clientY-drag.sy)/cam.zoom;clampCam();});

// ---- selection + city info panel ----
let selected=null;
const BIOME_NAME=['ocean','płycizna','plaża','pustynia','trawa','las','wzgórza','góry'];
const RES_NAME={manor:'Dwór',townhouse:'Kamienica',house:'Dom',shack:'Chata'};
const info=document.createElement('div'); info.id='info';
info.style.cssText='position:fixed;top:10px;right:10px;min-width:160px;color:#e8f0e0;background:#0b0d0bdd;'
  +'border:1px solid #3c4a36;border-radius:8px;padding:10px 12px;font:12px/1.7 monospace;display:none;z-index:5';
document.body.appendChild(info);
function pickCity(sx,sy){ if(!WORLD)return; const[wx,wy]=s2w(sx,sy); let best=null,bd=1e9;
  for(let i=0;i<WORLD.cities.length;i++){const c=WORLD.cities[i],d=Math.hypot(c.x-wx,c.y-wy);
    if(d<c.r+3 && d<bd){bd=d;best=i;}}
  selected=best; updateInfo(); }
function updateInfo(){ if(selected==null||!WORLD){info.style.display='none';return;}
  const c=WORLD.cities[selected],f=FACTIONS[c.f];
  const comp={}; for(const h of c.houses) comp[h.btype]=(comp[h.btype]||0)+1;
  const compRows=['manor','townhouse','house','shack'].filter(k=>comp[k])
    .map(k=>`&nbsp;&nbsp;${RES_NAME[k]}: <b>${comp[k]}</b>`).join('<br>');
  info.style.display='block';
  info.innerHTML=`<b style="font-size:13px">${c.name}</b>`
    +`<br><span style="display:inline-block;width:9px;height:9px;background:${f.flag};border:1px solid #000;vertical-align:-1px"></span> ${f.name}`
    +(c.port?`&nbsp;⚓`:'')
    +`<br>populacja: <b>${c.pop.toLocaleString('pl')}</b>`
    +`<br>biom: ${BIOME_NAME[WORLD.biomeAt(c.x,c.y)]} · drogi: ${WORLD.adj[selected].length}`
    +`<br><span style="opacity:.7">mieszkalne (${c.houses.length}):</span><br>${compRows}`
    +`<br><span style="opacity:.7">gospodarka (${c.builds.length}):</span><br>&nbsp;&nbsp;${c.builds.length?c.builds.map(b=>b.name).join('<br>&nbsp;&nbsp;'):'—'}`
    +`<br><span style="opacity:.5">klik na pustym = odznacz</span>`; }
cv.addEventListener('wheel',e=>{e.preventDefault();const[wx,wy]=s2w(e.clientX,e.clientY);
  cam.zoom*=e.deltaY<0?1.12:1/1.12;clampCam();const[nx,ny]=s2w(e.clientX,e.clientY);cam.x+=wx-nx;cam.y+=wy-ny;clampCam();},{passive:false});

// ============================================================
//  RENDER
// ============================================================
function blit(fr,wx,wy,shadow=true){const[sx,sy]=w2s(wx,wy),z=cam.zoom;
  if(shadow){ // minimal pixel-shadow: chunky blocks (src-px = z) sitting on the ground below the base
    ctx.fillStyle='rgba(18,22,14,0.40)';
    const bw=fr.sw*0.80, bw2=bw*0.55;
    ctx.fillRect(Math.round(sx-bw*z/2),  Math.round(sy),     Math.ceil(bw*z),  Math.ceil(z)); // band at base
    ctx.fillRect(Math.round(sx-bw2*z/2), Math.round(sy+z),   Math.ceil(bw2*z), Math.ceil(z)); // sliver in front
  }
  ctx.drawImage(fr.img,fr.sx,fr.sy,fr.sw,fr.sh,Math.round(sx-fr.ox*z),Math.round(sy-fr.oy*z),Math.ceil(fr.sw*z),Math.ceil(fr.sh*z));}
function viewBounds(){const[x0,y0]=s2w(0,0),[x1,y1]=s2w(cv.width,cv.height);return{x0:x0-2,y0:y0-2,x1:x1+2,y1:y1+18};}
function drawRoads(){ctx.strokeStyle=PAL.road;ctx.lineWidth=Math.max(1,cam.zoom*0.6);
  ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([cam.zoom*1.5,cam.zoom*1.1]);ctx.beginPath();
  for(const[a,b]of WORLD.edges){const[px,py]=w2s(WORLD.cities[a].x,WORLD.cities[a].y),
    [qx,qy]=w2s(WORLD.cities[b].x,WORLD.cities[b].y); ctx.moveTo(px,py);ctx.lineTo(qx,qy);}   // straight road A->B
  ctx.stroke();ctx.setLineDash([]);}
function drawLabels(){if(cam.zoom<3)return;ctx.font=`bold ${Math.max(9,cam.zoom*1.6)}px monospace`;ctx.textBaseline='middle';ctx.textAlign='left';
  const vb=viewBounds();
  for(const c of WORLD.cities){ if(c.x<vb.x0||c.x>vb.x1||c.y<vb.y0||c.y>vb.y1)continue;
    const[sx,sy]=w2s(c.x,c.minY-3);const h=cam.zoom*1.6+6, sw=h-2, tw=ctx.measureText(c.name).width, W2=sw+6+tw;
    const x0=sx-W2/2, y0=sy-h/2;
    ctx.fillStyle=PAL.labelEdge;ctx.fillRect(x0-1,y0-1,W2+2,h+2);
    ctx.fillStyle=PAL.label;ctx.fillRect(x0,y0,W2,h);
    ctx.fillStyle=FACTIONS[c.f].flag;ctx.fillRect(x0+2,y0+2,sw-2,h-4);   // faction swatch at start
    ctx.fillStyle=PAL.labelEdge;ctx.strokeStyle=PAL.labelEdge;ctx.lineWidth=1;ctx.strokeRect(x0+2.5,y0+2.5,sw-3,h-5);
    ctx.fillStyle=PAL.text;ctx.fillText(c.name,x0+sw+4,sy+1);}}
function render(){
  ctx.imageSmoothingEnabled=false;
  ctx.fillStyle=PAL.deep;ctx.fillRect(0,0,cv.width,cv.height);
  const[ox,oy]=w2s(0,0);
  ctx.drawImage(WORLD.bitmap,0,0,W,H,Math.round(ox),Math.round(oy),Math.ceil(W*cam.zoom),Math.ceil(H*cam.zoom));
  drawRoads();
  const vb=viewBounds(), ents=[];
  for(const p of WORLD.peaks) if(p.x>=vb.x0&&p.x<=vb.x1&&p.y>=vb.y0&&p.y<=vb.y1) ents.push(p);
  for(const h of WORLD.hills) if(h.x>=vb.x0&&h.x<=vb.x1&&h.y>=vb.y0&&h.y<=vb.y1) ents.push(h);
  for(const r of WORLD.rocks) if(r.x>=vb.x0&&r.x<=vb.x1&&r.y>=vb.y0&&r.y<=vb.y1) ents.push(r);
  for(const bsh of WORLD.bushes) if(bsh.x>=vb.x0&&bsh.x<=vb.x1&&bsh.y>=vb.y0&&bsh.y<=vb.y1) ents.push(bsh);
  for(const t of WORLD.trees) if(t.x>=vb.x0&&t.x<=vb.x1&&t.y>=vb.y0&&t.y<=vb.y1) ents.push(t);
  for(const c of WORLD.cities){
    for(const h of c.houses) if(h.x>=vb.x0&&h.x<=vb.x1&&h.y>=vb.y0&&h.y<=vb.y1) ents.push(h);
    for(const b of c.builds) if(b.x>=vb.x0&&b.x<=vb.x1&&b.y>=vb.y0&&b.y<=vb.y1) ents.push(b);
  }
  ents.sort((a,b)=>a.y-b.y);
  for(const e of ents) blit(e.spr,e.x,e.y);
  for(const m of WORLD.merchants){ if(!m.segs.length)continue;
    const s=m.segs[Math.min(m.si,m.segs.length-1)];
    const mx=s.x0+(s.x1-s.x0)*m.t, my=s.y0+(s.y1-s.y0)*m.t;
    if(mx<vb.x0||mx>vb.x1||my<vb.y0||my>vb.y1) continue;
    const spr = s.mode==='sea'?SPR.ship:SPR.cart;              // caravan turns into a ship on water legs
    blit(spr,mx,my);
    if(m.f>=0){ // faction-owned convoy -> flag in faction colour
      const z=cam.zoom,[sx,sy]=w2s(mx,my), top=Math.round(sy-(spr.sh+1)*z);
      ctx.fillStyle=OUTL; ctx.fillRect(Math.round(sx),top,Math.max(1,Math.round(z*0.5)),Math.ceil(z*3));
      ctx.fillStyle=FACTIONS[m.f].flag; ctx.fillRect(Math.round(sx),top,Math.ceil(z*2),Math.ceil(z*1.5));
    }}
  if(selected!=null){const c=WORLD.cities[selected];const[sx,sy]=w2s(c.x,c.y);
    ctx.strokeStyle='rgba(255,230,109,0.45)';ctx.lineWidth=2;ctx.setLineDash([6,4]);
    ctx.beginPath();ctx.arc(sx,sy,(c.r+3)*cam.zoom,0,6.2832);ctx.stroke();ctx.setLineDash([]);}
  drawLabels();
}

// ============================================================
//  LOOP
// ============================================================
let last=performance.now();
function tick(now){const dt=Math.min(0.05,(now-last)/1000);last=now;
  for(const m of WORLD.merchants){ if(!m.segs.length)continue;
    const s=m.segs[m.si]; m.t+=m.speed*dt*20/s.len;
    if(m.t>=1){ m.t=0; m.si++; if(m.si>=m.segs.length) WORLD.replan(m); }}
  render();requestAnimationFrame(tick);}

// ---------- boot ----------
function regen(seed){WORLD=genWorld(typeof seed==='number'?seed:(Math.random()*1e9|0));clampCam();
  selected=null;updateInfo();
  const el=document.getElementById('seed');if(el)el.textContent=WORLD.seed;}
addEventListener('keydown',e=>{if(e.key==='r'||e.key==='R')regen();});
buildSprites(); regen(12345); requestAnimationFrame(tick);
if(location.search.includes("sel")){let bi=0;WORLD.cities.forEach((c,i)=>{if(c.pop>WORLD.cities[bi].pop)bi=i;});selected=bi;const c=WORLD.cities[bi];cam.x=c.x;cam.y=c.y;cam.zoom=9;clampCam();updateInfo();}
