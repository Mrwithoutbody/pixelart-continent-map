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
const MAX_BRIDGE=7;                          // widest water span (tiles) a road bridge may cross
const MIN_CITY_DIST=64;                      // smallest allowed gap between any two towns (tiles)

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
// No special "river" entity — carved tiles simply become water; rivers emerge naturally.
function carveRivers(height,biome,cost,SL){
  const N=W*H, isW=i=>biome[i]<=BIOME.SHALLOW, q=new Int32Array(N);
  // 1) label water components (4-connectivity); ocean = the largest one
  const label=new Int32Array(N).fill(-1), size=[]; let nlab=0;
  for(let s=0;s<N;s++){ if(!isW(s)||label[s]>=0)continue;
    let head=0,tail=0; q[tail++]=s; label[s]=nlab; let sz=0;
    while(head<tail){ const u=q[head++]; sz++; const x=u%W,y=(u/W)|0;
      if(x>0   && isW(u-1) && label[u-1]<0){label[u-1]=nlab;q[tail++]=u-1;}
      if(x<W-1 && isW(u+1) && label[u+1]<0){label[u+1]=nlab;q[tail++]=u+1;}
      if(y>0   && isW(u-W) && label[u-W]<0){label[u-W]=nlab;q[tail++]=u-W;}
      if(y<H-1 && isW(u+W) && label[u+W]<0){label[u+W]=nlab;q[tail++]=u+W;}
    }
    size[nlab++]=sz;
  }
  if(nlab<=1) return;
  let ocean=0; for(let i=1;i<nlab;i++) if(size[i]>size[ocean]) ocean=i;

  // 2) weighted least-cost field from the sea over land (indexed binary heap / Dijkstra).
  //    cost is LOW in valleys (height near sea level) and carries per-tile noise, so the
  //    parent tree follows lowland and wiggles; 8-neighbour moves avoid axis-staircasing.
  //    Lakes sharing a valley merge into the same branch -> tributaries, not parallel lines.
  const dist=new Float64Array(N).fill(Infinity), par=new Int32Array(N).fill(-1);
  const pos=new Int32Array(N), hidx=new Int32Array(N+1), hcost=new Float64Array(N+1); let hn=0;
  const rnd=i=>{ let h=(i*2654435761)>>>0; h^=h>>>15; h=Math.imul(h,2246822519); h^=h>>>13; return (h>>>0)/4294967296; };
  const swap=(a,b)=>{ const ti=hidx[a];hidx[a]=hidx[b];hidx[b]=ti; const tc=hcost[a];hcost[a]=hcost[b];hcost[b]=tc;
    pos[hidx[a]]=a; pos[hidx[b]]=b; };
  const up=c=>{ while(c>1){const p=c>>1; if(hcost[p]<=hcost[c])break; swap(p,c); c=p;} };
  const down=c=>{ for(;;){ let l=c*2,r=l+1,m=c; if(l<=hn&&hcost[l]<hcost[m])m=l; if(r<=hn&&hcost[r]<hcost[m])m=r; if(m===c)break; swap(m,c); c=m; } };
  const heapAdd=(idx,d)=>{ if(pos[idx]){ if(d<hcost[pos[idx]]){hcost[pos[idx]]=d; up(pos[idx]);} return; }
    hn++; hidx[hn]=idx; hcost[hn]=d; pos[idx]=hn; up(hn); };
  const heapPop=()=>{ const idx=hidx[1]; swap(1,hn); hn--; pos[idx]=0; if(hn)down(1); return idx; };
  for(let i=0;i<N;i++) if(label[i]===ocean){ dist[i]=0; par[i]=i; heapAdd(i,0); }
  const NB=[-1,0, 1,0, 0,-1, 0,1, -1,-1, 1,-1, -1,1, 1,1];
  while(hn){ const u=heapPop(), du=dist[u], x=u%W, y=(u/W)|0;
    for(let k=0;k<16;k+=2){ const nx=x+NB[k], ny=y+NB[k+1];
      if(nx<0||ny<0||nx>=W||ny>=H)continue; const v=ny*W+nx; if(isW(v))continue;
      const diag=(NB[k]&&NB[k+1])?1.4142:1;
      const w=diag*(1 + 8*Math.max(0,height[v]-SL) + 0.9*rnd(v));   // cheap in valleys, costly uphill
      const nd=du+w; if(nd<dist[v]){ dist[v]=nd; par[v]=u; heapAdd(v,nd); } }
  }

  // 3) per sizable lake: pick the shore tile with the cheapest route, carve it back to the sea.
  const MINSZ=5, SLh=SL-0.05;
  const dig=i=>{ if(biome[i]>BIOME.SHALLOW)biome[i]=BIOME.SHALLOW; if(height[i]>SLh)height[i]=SLh; cost[i]=COST[biome[i]]; };
  const digWide=(i,wide)=>{ const x=i%W,y=(i/W)|0, hi=wide?2:1;     // 3-wide base, 4-wide if wide
    for(let dy=-1;dy<=hi;dy++)for(let dx=-1;dx<=hi;dx++){ const nx=x+dx,ny=y+dy;
      if(nx>=0&&ny>=0&&nx<W&&ny<H)dig(ny*W+nx); } };
  const best=new Int32Array(nlab).fill(-1);
  for(let i=0;i<N;i++){ if(!isW(i)||label[i]===ocean)continue; const L=label[i]; if(size[L]<MINSZ)continue;
    const x=i%W,y=(i/W)|0;
    const chk=v=>{ if(dist[v]===Infinity)return; if(best[L]<0||dist[v]<dist[best[L]]) best[L]=v; };
    if(x>0)chk(i-1); if(x<W-1)chk(i+1); if(y>0)chk(i-W); if(y<H-1)chk(i+W);
  }
  for(let L=0;L<nlab;L++){ if(L===ocean||best[L]<0)continue;
    const wide=rnd(best[L]^0x55)<0.6;                               // ~60% of rivers a pixel wider
    let t=best[L]; while(par[t]!==t){ digWide(t,wide); t=par[t]; }  // shore -> sea, becomes water
  }
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

  carveRivers(height,biome,cost,SL);     // link inland lakes to the sea before placing anything

  const isLand=i=>biome[i]>=BIOME.BEACH;
  const isWater=i=>biome[i]<=BIOME.SHALLOW;

  // ---- city + road network: capitals -> Steiner-Y links -> a town at each fork -> spurs ----
  // Real roads: 3 towns in a triangle meet at a central Y (the Fermat/Steiner point), not as a
  // ring or a star. Build capitals first, link them, drop a small town where the roads fork, then
  // hang a few lone "drawbar" towns off the network. Roads MUST stay planar (crossings have no
  // junction and bridges must not overlap), so the whole graph is rebuilt until it is crossing-free.
  const fields=[];
  const buildable=i=>{const b=biome[i];return b===BIOME.GRASS||b===BIOME.BEACH||b===BIOME.DESERT;};
  const onLand=(x,y)=>{x|=0;y|=0;return x>=1&&y>=1&&x<W-1&&y<H-1&&buildable(y*W+x);};
  // spanPts: straight-line terrain test. null if a water run is too wide to bridge, else
  // {d,bridgeTiles,spans,mtn} where mtn = mountain tiles crossed (roads prefer to skirt them).
  const spanPts=(ax,ay,bx,by)=>{const d=Math.hypot(bx-ax,by-ay),n=Math.max(1,Math.round(d));
    const spans=[]; let run=0,runStart=0,bridgeTiles=0,mtn=0,frst=0;
    const at=t=>({x:ax+(bx-ax)*t,y:ay+(by-ay)*t});
    const closeRun=endI=>{ if(run*d/n>MAX_BRIDGE) return false;
      const p0=at(Math.max(0,runStart-1)/n), p1=at(Math.min(n,endI)/n);
      spans.push({x0:p0.x,y0:p0.y,x1:p1.x,y1:p1.y}); bridgeTiles+=run; run=0; return true; };
    for(let i=0;i<=n;i++){const p=at(i/n),x=p.x|0,y=p.y|0;
      if(x<0||y<0||x>=W||y>=H){ if(run>0&&!closeRun(i))return null; continue; }
      const b=biome[y*W+x];
      if(b<=BIOME.SHALLOW){ if(run===0)runStart=i; run++; }
      else { if(run>0 && !closeRun(i)) return null; if(b===BIOME.MOUNTAIN) mtn++; else if(b===BIOME.FOREST) frst++; } }
    if(run>0 && !closeRun(n)) return null;
    return {d,bridgeTiles,spans,mtn,frst};
  };
  const F=Math.min(FACTIONS.length,8);
  // farthest-point pick: a buildable spot maximally far from the towns placed so far,
  // rejected if it can't even clear the minimum town spacing.
  const spreadSpot=(arr,floor=MIN_CITY_DIST)=>{ let best=null,bd=-1;
    for(let k=0;k<500;k++){ const x=8+rng()*(W-16)|0,y=8+rng()*(H-16)|0; if(!buildable(y*W+x))continue;
      let dm=1e9; for(const c of arr) dm=Math.min(dm,Math.hypot(c.x-x,c.y-y));
      if(dm>bd){bd=dm;best={x,y};} } return (best&&bd>=floor)?best:null; };

  // route(a,b): a road that may BEND at intermediate nodes to get around problematic terrain
  // (wide water). Straight if it can; else dog-legs through a land bend point, recursively.
  // Returns {pts:[[x,y]...], len, spans} (spans = bridge decks along it) or null if unroutable.
  const routeCache=new Map();
  const MTN_PEN=4, FRST_PEN=0.8;                                       // length added per mountain / forest tile
  const route=(ax,ay,bx,by,depth)=>{
    const ws=spanPts(ax,ay,bx,by);
    const straight = ws ? {pts:[[ax,ay],[bx,by]], len:ws.d+ws.mtn*MTN_PEN+ws.frst*FRST_PEN, spans:ws.spans} : null;
    if(ws && ws.mtn===0 && ws.frst<=8) return straight;               // clean enough straight road -> done
    if(depth<=0) return straight;                                      // can't bend more: take straight if any
    // straight is blocked by wide water (ws null) or runs through mountains -> try a bend that beats it
    const dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy)||1, mx=(ax+bx)/2,my=(ay+by)/2, px=-dy/L,py=dx/L;
    let best=null,bd=straight?straight.len:Infinity; const maxOff=Math.min(L*1.1,240);
    for(let off=16;off<=maxOff;off+=20)for(const s of[1,-1]){           // try bend points off the midline, both sides
      const Px=Math.round(mx+px*off*s), Py=Math.round(my+py*off*s);
      if(!onLand(Px,Py))continue;
      const r1=route(ax,ay,Px,Py,depth-1); if(!r1)continue;
      const r2=route(Px,Py,bx,by,depth-1); if(!r2)continue;
      const tot=r1.len+r2.len+off*0.04; if(tot<bd){bd=tot;best={r1,r2};} // prefer shortest, slight straightness bias
    }
    if(!best) return straight;                                         // no better detour found
    return {pts:best.r1.pts.concat(best.r2.pts.slice(1)), len:bd, spans:best.r1.spans.concat(best.r2.spans)};
  };
  const routeXY=(ax,ay,bx,by)=>{ const k=ax+','+ay+','+bx+','+by; if(routeCache.has(k))return routeCache.get(k);
    const r=route(ax,ay,bx,by,2); routeCache.set(k,r); return r; };

  const near=(C,x,y,minD)=>C.some(c=>Math.hypot(c.x-x,c.y-y)<minD);
  // resource scan around a point -> biome counts; siteScore rewards a rich, varied hinterland so
  // towns land where the land pays off (ore in hills/mountains, fish/salt by the coast, etc).
  const scan=(x,y,RAD=15)=>{ const c={F:0,G:0,M:0,H:0,W:0,D:0,land:0};
    for(let dy=-RAD;dy<=RAD;dy+=2)for(let dx=-RAD;dx<=RAD;dx+=2){ if(dx*dx+dy*dy>RAD*RAD)continue;
      const xx=x+dx,yy=y+dy; if(xx<0||yy<0||xx>=W||yy>=H)continue; const b=biome[yy*W+xx];
      if(b===BIOME.FOREST)c.F++; else if(b===BIOME.GRASS)c.G++; else if(b===BIOME.MOUNTAIN)c.M++;
      else if(b===BIOME.HILLS)c.H++; else if(b<=BIOME.SHALLOW)c.W++; else if(b===BIOME.DESERT)c.D++;
      if(b>BIOME.SHALLOW)c.land++; }
    return c; };
  const ROLES=[['ruda',c=>Math.min(c.M,6)*3],['port',c=>Math.min(c.W,8)*2.2],['sól',c=>Math.min(c.D,6)*2.3],
               ['drewno',c=>Math.min(c.F,10)*1.1],['kamień',c=>Math.min(c.H,6)*1.5],['zboże',c=>Math.min(c.G,12)*1.0]];
  const siteScore=c=>{ if(c.land<10)return 0; let s=0,kinds=0; for(const[,fn]of ROLES){const v=fn(c); s+=v; if(v>3)kinds++;} return s+kinds*6; };
  const econRole=c=>{ let best='rolnictwo',bv=0; for(const[nm,fn]of ROLES){const v=fn(c); if(v>bv){bv=v;best=nm;}} return best; };

  // link every town with an MST over ALL pairs, using BENDABLE roads (route) so a pair blocked by
  // water connects by curving around it. Only genuinely unreachable towns (islands) stay separate.
  const linkTowns=C=>{ const n=C.length, cand=[];
    for(let a=0;a<n;a++)for(let b=a+1;b<n;b++){
      if(Math.hypot(C[a].x-C[b].x,C[a].y-C[b].y)>360)continue;          // skip far pairs (kept cheap)
      const r=routeXY(C[a].x,C[a].y,C[b].x,C[b].y); if(!r)continue;
      cand.push([r.len,a,b]); }
    cand.sort((p,q)=>p[0]-q[0]);
    const par=C.map((_,i)=>i),find=i=>{while(par[i]!==i){par[i]=par[par[i]];i=par[i];}return i;};
    const E=[]; for(const[d,a,b]of cand){const ra=find(a),rb=find(b); if(ra!==rb){par[ra]=rb;E.push([a,b]);}}
    return E; };

  const buildNetwork=()=>{
    // 1) place towns where the land pays off: sample, keep the richest sites, respect spacing
    const C=[]; const TARGET=12+(rng()*5|0);
    for(let g=0; C.length<TARGET && g<TARGET*40; g++){ let best=null,bs=0;
      for(let k=0;k<70;k++){ const x=8+rng()*(W-16)|0,y=8+rng()*(H-16)|0;
        if(!buildable(y*W+x)||near(C,x,y,MIN_CITY_DIST))continue;
        const sc=siteScore(scan(x,y)); if(sc>bs){bs=sc;best={x,y,score:sc};} }
      if(!best)break; C.push(best); }
    if(C.length<3)return null;
    // 2) houses: the richest, well-separated towns become seats; every town joins its nearest seat
    const order=C.map((c,i)=>i).sort((a,b)=>C[b].score-C[a].score), seats=[];
    for(const i of order){ if(seats.length>=F)break;
      if(!seats.some(j=>Math.hypot(C[i].x-C[j].x,C[i].y-C[j].y)<MIN_CITY_DIST*2.0)) seats.push(i); }
    if(!seats.length) seats.push(order[0]);
    for(let i=0;i<C.length;i++){ let bf=0,bd=1e18;
      for(let s=0;s<seats.length;s++){const q=C[seats[s]],dd=(q.x-C[i].x)**2+(q.y-C[i].y)**2; if(dd<bd){bd=dd;bf=s;}}
      C[i].f=bf; C[i].role=econRole(scan(C[i].x,C[i].y)); }
    for(const s of seats) C[s].seat=true;                                        // faction capital (economic centre)
    // 3) link with optimal bendable roads; if a link is too long, drop a town in the gap and relink
    let E=linkTowns(C);
    for(let pass=0; pass<2; pass++){ const add=[];
      for(const[a,b]of E){ const r=routeXY(C[a].x,C[a].y,C[b].x,C[b].y); if(r&&r.len>180){
        const mid=r.pts[r.pts.length>>1];
        if(onLand(mid[0],mid[1])&&!near(C,mid[0],mid[1],MIN_CITY_DIST*0.8)) add.push({x:mid[0],y:mid[1],f:C[a].f}); } }
      if(!add.length)break;
      for(const t of add){ t.role=econRole(scan(t.x,t.y)); C.push(t); } E=linkTowns(C); }
    const paths=E.map(([a,b])=>routeXY(C[a].x,C[a].y,C[b].x,C[b].y));            // bendable polyline per road
    return {C,E,paths};
  };
  // planar test over the road POLYLINES: no two segments of different roads may cross. Segments that
  // share an endpoint (a town or a fork node) are legal meetings, not crossings.
  const samePt=(p,q)=>p[0]===q[0]&&p[1]===q[1];
  const segsCross=(p,list)=>{ for(let i=0;i+1<p.pts.length;i++){const a=p.pts[i],b=p.pts[i+1];
    for(const q of list)for(let j=0;j+1<q.pts.length;j++){const c=q.pts[j],d=q.pts[j+1];
      if(samePt(a,c)||samePt(a,d)||samePt(b,c)||samePt(b,d))continue;
      if(segCross({x:a[0],y:a[1]},{x:b[0],y:b[1]},{x:c[0],y:c[1]},{x:d[0],y:d[1]}))return true; } }
    return false; };
  const planar=paths=>{ for(let i=1;i<paths.length;i++) if(segsCross(paths[i],paths.slice(0,i)))return false; return true; };
  const dropCross=(E,paths)=>{ const keepE=[],keepP=[];                          // greedily keep a crossing-free subset
    for(let i=0;i<paths.length;i++) if(!segsCross(paths[i],keepP)){keepE.push(E[i]);keepP.push(paths[i]);}
    return {E:keepE,paths:keepP}; };

  let chosen=null, fb=null;
  for(let attempt=0;attempt<40 && !chosen;attempt++){ const r=buildNetwork(); if(!r||r.C.length<3)continue;
    if(planar(r.paths)) chosen=r; else if(!fb) fb=r; }                          // rebuild until crossing-free
  if(!chosen){ chosen=fb||buildNetwork()||{C:[],E:[],paths:[]};
    const t=dropCross(chosen.E,chosen.paths); chosen={...chosen,E:t.E,paths:t.paths}; }  // last resort: drop crossings
  const cities=chosen.C, edges=chosen.E, roadPaths=chosen.paths;

  // ---- per-city detail: name / population / residential / economy / fields ----
  // pop is driven by the town's economic richness and hard-capped at 1200; the faction's
  // economic centre (its seat) is the largest. role = its dominant resource.
  for(const c of cities){
    c.name=townName(rng);
    const wealth=(c.score||siteScore(scan(c.x,c.y)));
    const base = (c.seat?520:120) + wealth*9;
    c.pop = Math.min(1200, Math.max(80, Math.round(base*(0.8+rng()*0.4))));
    const n=Math.max(1,Math.min(12,1+Math.round(c.pop/130)));
    c.houses=buildCluster(c.x,c.y,n,rng,biome);
    const tier=c.seat?'manor':c.pop>650?'townhouse':'house';
    c.houses.forEach((h,i)=>{ h.btype = i===0?tier : (h.small?'shack':'house');
      h.spr = h.btype==='shack'?SPR.hut : h.btype==='manor'?SPR.manor
            : h.btype==='townhouse'?SPR.townhouse : (((h.x+h.y)&1)?SPR.house:SPR.cottage); });
    c.builds=placeEconomy(c,biome,rng);
    c.fields = c.builds.some(b=>b.id==='farm') ? placeFields(c,biome,rng) : [];
    for(const f of c.fields) fields.push(f);
    const all=c.houses.concat(c.builds);
    c.r=all.reduce((m,h)=>Math.max(m,Math.hypot(h.x-c.x,h.y-c.y)),1.5);
    c.minY=all.reduce((m,h)=>Math.min(m,h.y),c.y);
  }

  // ---- houses + characters + chronicle: each faction is a noble House (Dune / GoT flavour) with a
  //      ruling lord, an heir, a motto/trade, blood ties to other Houses, legends, and a past of
  //      wars / alliances / rivalries — emergent stories woven from the map ----
  const pick=a=>a[rng()*a.length|0];
  const HSYL=['kar','vel','dra','mor','thal','ys','gorn','bel','rha','tyr','wen','ost','cael','dun','var','sel','grim','ah'];
  const FNAME_M=['Aldric','Beren','Cedrik','Doran','Edmar','Garr','Hektor','Ivo','Joran','Kael','Lorn','Marek','Nestor','Oswin','Roald','Teon','Ulryk','Wace'];
  const FNAME_F=['Aela','Brina','Cora','Dagna','Elsa','Gwyn','Hela','Ilka','Jorun','Lena','Mira','Nela','Ofka','Rina','Sela','Talia','Wanda','Ysa'];
  const EPITHET=['Stary','Żelazny','Okrutny','Sprawiedliwy','Chytry','Pobożny','Ślepy','Wielki','Czarny','Cichy','Rudy','Łaskawy'];
  const TITLE=['Lord','Książę','Hrabia','Kasztelan','Wielmoża'];
  const MOTTOS=['Krew i Kamień','Wierni do końca','Z morza nasza siła','Żelazo się nie gnie','Pod jednym niebem',
    'Cisza przed burzą','Korzeń i Korona','Ogień nie pyta','Sól ziemi','Głębiej niż góry'];
  const TRAITS=['kupiecki','wojowniczy','pobożny','skryty','dumny','żeglarski','górniczy'];
  const person=()=>{ const female=rng()<0.45, fn=female?pick(FNAME_F):pick(FNAME_M);
    const full = rng()<0.5 ? `${fn} ${pick(EPITHET)}` : fn;
    return {full, female, age:24+(rng()*48|0)}; };
  const houseName=()=>{ const s=HSYL[rng()*HSYL.length|0]+HSYL[rng()*HSYL.length|0]; return s[0].toUpperCase()+s.slice(1); };
  const usedF=[...new Set(cities.map(c=>c.f))].sort((a,b)=>a-b);
  const houses=usedF.map(f=>{ const own=cities.filter(c=>c.f===f);
    const seat=own.find(c=>c.seat)||own.slice().sort((a,b)=>b.pop-a.pop)[0];
    const ruler=person(), heir=person();
    return {f, name:houseName(), faction:FACTIONS[f].name, color:FACTIONS[f].flag,
      seat:seat?seat.name:'—', role:seat?seat.role:'—', motto:pick(MOTTOS), trait:pick(TRAITS),
      founded:180+(rng()*620|0), towns:own.length, title:pick(TITLE), ruler, heir}; });
  const hByF=new Map(houses.map(h=>[h.f,h]));
  for(const c of cities) c.houseName=(hByF.get(c.f)||{}).name||'—';

  // pairwise relations, each with a generated cause; alliances are sealed by marriage (a blood tie)
  const relations=[], ties=[];
  for(let i=0;i<houses.length;i++)for(let j=i+1;j<houses.length;j++){ const A=houses[i],B=houses[j],r=rng();
    const rel = r<0.22?'wojna': r<0.40?'sojusz': r<0.64?'rywalizacja':'pokój';
    let cause='';
    if(rel==='wojna') cause=pick([`spór o ${A.role} i ${B.role}`,`krew przelana pod ${A.seat}`,
      `${B.title} ${B.ruler.full} odmówił trybutu`,`zdrada przy stole w ${A.seat}`]);
    else if(rel==='sojusz'){ const bride=person(); cause=`małżeństwo: ${bride.full} z Rodu ${A.name} poślubia dziedzica ${B.heir.full}`;
      ties.push({a:i,b:j,bride:bride.full}); }
    else if(rel==='rywalizacja') cause=pick([`rywalizacja o handel ${A.role}`,`stary spór graniczny`,`obie pretendują do ${A.seat}`]);
    relations.push({a:i,b:j,rel,cause}); }

  // legends / curiosities tied to actual towns -> flavour that feels like local history
  const LEG=[ c=>`Pod ${c.name} podobno śpi smok, nie widziany od pokoleń.`,
    c=>`Studnia w ${c.name} nigdy nie wysycha — zwą ją Łzą Bogów.`,
    c=>`W lasach koło ${c.name} znikają wędrowcy; winią Zielonego Łowcę.`,
    c=>`Sztolnie ${c.name} sięgają tak głęboko, że słychać bicie serca góry.`,
    c=>`Mówią, że ${c.name} wzniesiono na kościach starszego miasta.`,
    c=>`Targ w ${c.name} raz w roku odwiedza milczący kupiec, który płaci złotem bez stempla.` ];
  const legends=[]; { const pool=cities.slice().sort(()=>rng()-0.5).slice(0,3);
    pool.forEach((c,i)=>legends.push(LEG[(rng()*LEG.length|0)](c))); }

  // intrigues: the hidden web beneath the alliances — betrayals, scheming, bastards, poison, affairs
  const intrigues=[];
  if(houses.length>=2){ const HH=houses, idx=()=>rng()*HH.length|0,
      two=()=>{ let a=idx(),b=idx(); while(b===a)b=idx(); return [a,b]; };
    const GENS=[
      ()=>{ const[a,b]=two(); return {a,b,type:'zdrada',text:`Ród ${HH[a].name} potajemnie knuje przeciw sojusznikowi — Rodowi ${HH[b].name}.`}; },
      ()=>{ const[a,b]=two(); return {a,b,type:'konszachty',text:`${HH[a].name} i ${HH[b].name} w tajemnicy dzielą łupy z trzeciego rodu.`}; },
      ()=>{ const a=idx(); return {a,type:'bękart',text:`Dziedzic ${HH[a].heir.full} z Rodu ${HH[a].name} to w istocie bękart — prawdziwy syn zaginął.`}; },
      ()=>{ const[a,b]=two(); const ch=person(); return {a,b,type:'podrzutek',text:`Podrzucone dziecko, ${ch.full}, wychowane w Rodzie ${HH[a].name}, nosi krew Rodu ${HH[b].name}.`}; },
      ()=>{ const a=idx(); return {a,type:'trucizna',text:`${HH[a].title} ${HH[a].ruler.full} gaśnie w chorobie — szepczą o truciźnie.`}; },
      ()=>{ const[a,b]=two(); return {a,b,type:'romans',text:`Sekretny romans łączy dziedziców Rodów ${HH[a].name} i ${HH[b].name}, wbrew woli ojców.`}; },
      ()=>{ const[a,b]=two(); return {a,b,type:'szpieg',text:`Ród ${HH[a].name} trzyma szpiega na dworze Rodu ${HH[b].name}.`}; },
    ];
    const cnt=3+(rng()*3|0); for(let k=0;k<cnt;k++) intrigues.push(pick(GENS)()); }

  // chronicle: foundings (with the first lords), marriages, wars — named, dated, oldest first
  const events=[];
  const byAge=houses.slice().sort((p,q)=>p.founded-q.founded);
  for(const h of byAge.slice(0,2)) events.push(`${h.founded}: ${h.title} ${h.ruler.full} z Rodu ${h.name} obejmuje ${h.seat}.`);
  for(const t of ties) events.push(`Więzy krwi: ${t.bride} łączy Rody ${houses[t.a].name} i ${houses[t.b].name}.`);
  for(const rl of relations) if(rl.rel==='wojna') events.push(`Wojna ${houses[rl.a].name} z ${houses[rl.b].name} — ${rl.cause}.`);
  if(events.length>10) events.length=10;

  // ---- overlapping layers: economic guilds + religious faiths that cross-cut the Houses ----
  // a town belongs to a House (blood/land) AND a guild (its trade) AND a faith — the three maps
  // of allegiance rarely line up, which is where the leverage and intrigue live.
  const GUILD_NAME={'sól':'Bractwo Soli','ruda':'Gildia Górnicza','port':'Liga Morska','drewno':'Cech Drwali',
    'kamień':'Gildia Kamieniarzy','zboże':'Bractwo Młynarzy','rolnictwo':'Liga Wiejska'};
  const GUILD_COL=['#d8a030','#3aa0c0','#9c5ad0','#5fbf6f','#d05a7a','#7a8a3a','#c06030'];
  const byRole={}; cities.forEach((c,i)=>{ (byRole[c.role]=byRole[c.role]||[]).push(i); c.guild=-1; });
  const guilds=[];
  for(const role of Object.keys(byRole)){ const mem=byRole[role]; if(mem.length<2)continue;
    const id=guilds.length, seat=mem.slice().sort((a,b)=>cities[b].pop-cities[a].pop)[0];
    for(const m of mem) cities[m].guild=id;
    guilds.push({id, role, name:GUILD_NAME[role]||('Gildia '+role), color:GUILD_COL[id%GUILD_COL.length],
      master:person(), seat:cities[seat].name, towns:mem.length}); }
  const guildRel=[]; for(let i=0;i<guilds.length;i++)for(let j=i+1;j<guilds.length;j++) if(rng()<0.3) guildRel.push({a:i,b:j});

  const FAITH_NAME=['Kult Słońca','Wiara Głębin','Stary Las','Zakon Popiołu','Droga Kamienia'];
  const FAITH_COL=['#e6c84e','#5a8ac0','#6fae5a','#b06ab0'];
  const nFaith=2+(rng()<0.5?1:0);
  const fOrder=FAITH_NAME.map((_,i)=>i).sort(()=>rng()-0.5).slice(0,nFaith);
  const faiths=fOrder.map((fi,i)=>({id:i, name:FAITH_NAME[fi], color:FAITH_COL[i], priest:person(), holyCity:'—', towns:0}));
  const houseFaith=new Map(houses.map(h=>[h.f, rng()*nFaith|0]));         // each House patronises a faith
  for(const c of cities){ c.faith = rng()<0.82 ? (houseFaith.get(c.f)??0) : (rng()*nFaith|0); faiths[c.faith].towns++; }
  for(const ft of faiths){ let best=-1,bp=-1; cities.forEach((c,i)=>{ if(c.faith===ft.id&&c.pop>bp){bp=c.pop;best=i;} }); if(best>=0)ft.holyCity=cities[best].name; }
  const faithTension = nFaith>=2 ? {a:0,b:1} : null;                       // two creeds at odds

  // ---- territory: each LAND tile owned by nearest city -> its House / guild / faith ----
  const fac=new Int8Array(N).fill(-1), facG=new Int8Array(N).fill(-1), facFa=new Int8Array(N).fill(-1);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x; if(!isLand(i))continue;
    let nc=0,bd=1e15;
    for(let k=0;k<cities.length;k++){const c=cities[k],dx=c.x-x,dy=c.y-y,dd=dx*dx+dy*dy; if(dd<bd){bd=dd;nc=k;}}
    const c=cities[nc]; fac[i]=c.f; facG[i]=c.guild; facFa[i]=c.faith;
  }

  // ---- road adjacency + bridge decks + per-edge polyline lookup (roads may bend at nodes) ----
  const adj=cities.map(()=>[]); for(const[a,b]of edges){adj[a].push(b);adj[b].push(a);}
  const bridges=[]; for(const p of roadPaths) for(const sp of p.spans) bridges.push(sp);
  const pathOf=new Map();                                     // city-pair -> bent polyline (for caravans)
  edges.forEach(([a,b],i)=>pathOf.set(Math.min(a,b)+','+Math.max(a,b), roadPaths[i].pts));

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
    if(e.mode==='land'){ const P=pathOf.get(Math.min(e.from,e.to)+','+Math.max(e.from,e.to))||[[A.x,A.y],[B.x,B.y]];
      const seq = (P[0][0]===A.x&&P[0][1]===A.y) ? P : P.slice().reverse();      // orient polyline from A to B
      for(let i=0;i+1<seq.length;i++) segs.push({x0:seq[i][0],y0:seq[i][1],x1:seq[i+1][0],y1:seq[i+1][1],mode:'land'}); }
    else{ segs.push({x0:A.x,y0:A.y,x1:A.dock.x,y1:A.dock.y,mode:'sea'});       // walk to dock, then sail, then to town
          segs.push({x0:A.dock.x,y0:A.dock.y,x1:B.dock.x,y1:B.dock.y,mode:'sea'});
          segs.push({x0:B.dock.x,y0:B.dock.y,x1:B.x,y1:B.y,mode:'sea'}); }}
    for(const s of segs)s.len=Math.hypot(s.x1-s.x0,s.y1-s.y0)||1;return segs;};

  // ---- merchants: caravans with a destination, multi-modal route ----
  const merchants=[];
  for(let m=0;m<18;m++){const home=rng()*cities.length|0,reach=reachableFrom(home);if(!reach.length)continue;
    const dest=reach[rng()*reach.length|0],route=planRoute(home,dest);if(!route||!route.length)continue;
    merchants.push({home,dest,f:rng()<0.5?cities[home].f:-1,segs:segmentsFor(route),si:0,t:rng(),speed:0.10+rng()*0.10});}

  const layers={ rody:bakeLayer(biome,fac,FACTIONS.map(f=>f.tint),FACTIONS.map(f=>f.border)),
    gildie:bakeLayer(biome,facG,guilds.map(g=>hexRGB(g.color)),guilds.map(g=>g.color)),
    wiary:bakeLayer(biome,facFa,faiths.map(f=>hexRGB(f.color)),faiths.map(f=>f.color)) };
  const world={seed,W,H,height,moist,biome,cost,fac,cities,edges,adj,cadj,merchants,trees,bushes,peaks,hills,rocks,fields,bridges,roadPaths,
    houses,relations,ties,legends,intrigues,events,guilds,guildRel,faiths,faithTension,
    base:bakeBase(height,moist,biome),layers,layer:'rody'};
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

const hexRGB=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
// base terrain + coastline (no allegiance tint — that lives in switchable overlay layers)
function bakeBase(height,moist,biome){
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const img=x.createImageData(W,H),D=img.data;
  const C={deep:hexRGB(PAL.deep),shallow:hexRGB(PAL.shallow),foam:hexRGB(PAL.foam),
    beach:hexRGB(PAL.beach),beachDk:hexRGB(PAL.beachDk),desert:hexRGB(PAL.desert),desertDk:hexRGB(PAL.desertDk),
    grass:PAL.grass.map(hexRGB),grassDk:hexRGB(PAL.grassDk),forest:hexRGB(PAL.forest),forestDk:hexRGB(PAL.forestDk),
    hill:hexRGB(PAL.hill),hillDk:hexRGB(PAL.hillDk),rock:hexRGB(PAL.rock),rockDk:hexRGB(PAL.rockDk),snow:hexRGB(PAL.snow)};
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
    set(i,col);
  }
  const px4=(i,col)=>{const j=i*4;D[j]=col[0];D[j+1]=col[1];D[j+2]=col[2];};
  for(let y=1;y<H-1;y++)for(let xx=1;xx<W-1;xx++){ const i=y*W+xx;
    if(biome[i]===BIOME.SHALLOW){ if(land(i-1)||land(i+1)||land(i-W)||land(i+W)) px4(i,C.foam); }
    else if(land(i) && (water(i-1)||water(i+1)||water(i-W)||water(i+W))) px4(i,C.beachDk); }   // shoreline
  x.putImageData(img,0,0); return c;
}
// one allegiance overlay: translucent tint per group on land + opaque borders between groups.
// assign[i] = group id (-1 none); tintRGB[id] / borderHex[id] colour each group.
function bakeLayer(biome,assign,tintRGB,borderHex){
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const img=x.createImageData(W,H),D=img.data, bord=borderHex.map(h=>h?hexRGB(h):null), TA=70;
  const land=i=>biome[i]>=BIOME.BEACH;
  for(let i=0;i<W*H;i++){ const g=assign[i]; if(g<0||!land(i))continue; const t=tintRGB[g]; if(!t)continue;
    const j=i*4; D[j]=t[0];D[j+1]=t[1];D[j+2]=t[2];D[j+3]=TA; }
  for(let y=1;y<H-1;y++)for(let xx=1;xx<W-1;xx++){ const i=y*W+xx, g=assign[i]; if(g<0||!land(i))continue;
    const r=assign[i+1],d=assign[i+W];
    if((r>=0&&r!==g)||(d>=0&&d!==g)){ const b=bord[g]; if(b){const j=i*4;D[j]=b[0];D[j+1]=b[1];D[j+2]=b[2];D[j+3]=215;} } }
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

// ---- selection + city info panel (GUI markup lives in index.html #info) ----
let selected=null;
const BIOME_NAME=['ocean','płycizna','plaża','pustynia','trawa','las','wzgórza','góry'];
const RES_NAME={manor:'Dwór',townhouse:'Kamienica',house:'Dom',shack:'Chata'};
const info=document.getElementById('info');
function clearCity(){selected=null;updateInfo();}        // exposed for the panel close button
function pickCity(sx,sy){ if(!WORLD)return; const[wx,wy]=s2w(sx,sy); let best=null,bd=1e9;
  for(let i=0;i<WORLD.cities.length;i++){const c=WORLD.cities[i],d=Math.hypot(c.x-wx,c.y-wy);
    if(d<c.r+3 && d<bd){bd=d;best=i;}}
  selected=best; updateInfo(); }
function updateInfo(){
  if(selected==null||!WORLD){info.classList.remove('open');document.body.classList.remove('has-info');return;}
  const c=WORLD.cities[selected],f=FACTIONS[c.f];
  const house=WORLD.houses.find(h=>h.f===c.f);
  const guild=c.guild>=0?WORLD.guilds[c.guild]:null, faith=WORLD.faiths[c.faith];
  const comp={}; for(const h of c.houses) comp[h.btype]=(comp[h.btype]||0)+1;
  const resRows=['manor','townhouse','house','shack'].filter(k=>comp[k])
    .map(k=>`<div class="li"><span>${RES_NAME[k]}</span><span>${comp[k]}</span></div>`).join('');
  const ecoRows=c.builds.length
    ? c.builds.map(b=>`<div class="li eco"><span>${b.name}</span><span>·</span></div>`).join('')
    : `<div class="li eco"><span>—</span><span></span></div>`;
  info.innerHTML=
    `<div class="ihead"><span class="nm">${c.name}</span><span class="x" onclick="clearCity()">✕</span></div>`
   +`<div class="ibody">`
   + `<div class="fac"><span class="sw" style="background:${f.flag}"></span>Ród ${house?house.name:f.name}`
   +   (c.seat?` <span class="port">★ stolica</span>`:'')+(c.port?` <span class="port">⚓ port</span>`:'')+`</div>`
   + (house?`<div class="stat"><span>włada</span><b>${house.title} ${house.ruler.full}</b></div>`:'')
   + `<div class="stat"><span>populacja</span><b>${c.pop.toLocaleString('pl')}</b></div>`
   + `<div class="stat"><span>gospodarka</span><b>${c.role||'—'}</b></div>`
   + `<div class="stat"><span>gildia</span><b style="color:${guild?guild.color:'inherit'}">${guild?guild.name:'—'}</b></div>`
   + `<div class="stat"><span>wiara</span><b style="color:${faith?faith.color:'inherit'}">${faith?faith.name:'—'}</b></div>`
   + `<div class="stat"><span>biom</span><b>${BIOME_NAME[WORLD.biomeAt(c.x,c.y)]}</b></div>`
   + `<div class="stat"><span>drogi</span><b>${WORLD.adj[selected].length}</b></div>`
   + `<div class="sect">mieszkalne (${c.houses.length})</div><div class="list">${resRows}</div>`
   + `<div class="sect">gospodarka (${c.builds.length})</div><div class="list">${ecoRows}</div>`
   +`</div>`;
  info.classList.add('open');document.body.classList.add('has-info');
}
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
function drawRoads(){ctx.strokeStyle=PAL.road;ctx.lineWidth=Math.max(2,Math.round(cam.zoom*1.1));
  ctx.lineCap='butt';ctx.lineJoin='miter';ctx.setLineDash([Math.round(cam.zoom*2),Math.round(cam.zoom*1.4)]);ctx.beginPath();
  for(const p of WORLD.roadPaths){ const pt=p.pts; let[px,py]=w2s(pt[0][0],pt[0][1]); ctx.moveTo(px,py);
    for(let i=1;i<pt.length;i++){const[qx,qy]=w2s(pt[i][0],pt[i][1]); ctx.lineTo(qx,qy);} }   // bent polyline road
  ctx.stroke();ctx.setLineDash([]);
  // plain junction dots where a road bends (interior nodes)
  if(cam.zoom>=2){ ctx.setLineDash([]); ctx.fillStyle=PAL.road;
    for(const p of WORLD.roadPaths) for(let i=1;i+1<p.pts.length;i++){ const[bx,by]=w2s(p.pts[i][0],p.pts[i][1]);
      const s=Math.max(2,cam.zoom*1.3); ctx.fillRect(Math.round(bx-s/2),Math.round(by-s/2),Math.ceil(s),Math.ceil(s)); } }}
// wooden bridge decks over the water spans of the road network (drawn under the road dashes)
function drawBridges(){const z=cam.zoom; ctx.lineCap='butt';ctx.lineJoin='miter';ctx.setLineDash([]);
  for(const br of WORLD.bridges){const[x0,y0]=w2s(br.x0,br.y0),[x1,y1]=w2s(br.x1,br.y1);
    let nx=y1-y0,ny=-(x1-x0);const L=Math.hypot(nx,ny)||1; nx/=L;ny/=L;          // perpendicular unit
    const rail=Math.max(2,z*1.3);
    ctx.strokeStyle='#5e3f22';ctx.lineWidth=Math.max(4,z*2.6);                    // dark underside / piles
    ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
    ctx.strokeStyle='#8a5e34';ctx.lineWidth=Math.max(3,z*2.0);                    // plank deck
    ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
    ctx.strokeStyle='#3a2616';ctx.lineWidth=Math.max(1,z*0.5);                    // two side rails
    for(const s of[1,-1]){const ox=nx*rail*s,oy=ny*rail*s;
      ctx.beginPath();ctx.moveTo(x0+ox,y0+oy);ctx.lineTo(x1+ox,y1+oy);ctx.stroke();}
  }}
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
  const[ox,oy]=w2s(0,0), DX=Math.round(ox),DY=Math.round(oy),DW=Math.ceil(W*cam.zoom),DH=Math.ceil(H*cam.zoom);
  ctx.drawImage(WORLD.base,0,0,W,H,DX,DY,DW,DH);                              // terrain
  ctx.drawImage(WORLD.layers[WORLD.layer],0,0,W,H,DX,DY,DW,DH);              // allegiance overlay (Houses/guilds/faiths)
  const vb=viewBounds();
  for(const f of WORLD.fields) if(f.x>=vb.x0&&f.x<=vb.x1&&f.y>=vb.y0&&f.y<=vb.y1) blit(f.spr,f.x,f.y,false); // flat ground, no shadow
  drawBridges();   // wooden decks under the road dashes
  drawRoads();
  const ents=[];
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
    const r=Math.round((c.r+4)*cam.zoom), lw=Math.max(3,Math.round(cam.zoom*1.1));
    ctx.strokeStyle='#ffe066';ctx.lineWidth=lw;ctx.lineJoin='miter';ctx.setLineDash([]);
    ctx.strokeRect(Math.round(sx)-r, Math.round(sy)-r, r*2, r*2);}   // chunky square bracket, no rounding
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
// regen builds a fresh world (used by the generating screen + in-game "new map").
function regen(seed){WORLD=genWorld(typeof seed==='number'?seed:(Math.random()*1e9|0));clampCam();
  selected=null;updateInfo();
  if(typeof renderChronicle==='function') renderChronicle();
  document.querySelectorAll('.lyr').forEach(b=>b.classList.toggle('on',b.dataset.l==='rody'));   // reset layer switch
  const el=document.getElementById('seed');if(el)el.textContent=WORLD.seed;
  const sc=document.getElementById('scenario');if(sc)sc.textContent=WORLD.houses.length+' rodów · '+WORLD.cities.length+' miast';}
// R = new map, but only while playing (start/gen screens own the keyboard otherwise).
addEventListener('keydown',e=>{if((e.key==='r'||e.key==='R')&&document.body.dataset.screen==='game')regen();});
buildSprites();
regen(Math.random()*1e9|0);          // a world to sit behind the start screen as a live backdrop
requestAnimationFrame(tick);          // render loop always runs; UI overlays sit on top
