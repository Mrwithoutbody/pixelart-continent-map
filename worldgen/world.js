// WORLDGEN / WORLD — genWorld orchestrator: terrain, rivers, city+road network,
// then buildChronicle() for the social layers, territory, and the baked map canvases.
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
    const eY=Math.min(y,H-1-y); h*=smooth(0,SEA_MARGIN,eY);   // force open sea along top & bottom edges
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
    // owners: every building & dwelling belongs to an organisation — ród / gildia / religia (only these)
    const oRod={k:'rod',id:c.f}, oGuild=c.guild>=0?{k:'gildia',id:c.guild}:oRod, oFaith={k:'wiara',id:c.faith};
    for(const b of c.builds) b.owner = b.id==='chapel'?oFaith
      : (['market','harbor','warehouse'].includes(b.id)&&c.guild>=0)?oGuild : oRod;
    c.houses.forEach((h,i)=>{ h.owner = h.btype==='manor'?oRod
      : (c.guild>=0&&i%3===0)?oGuild : (i%5===0)?oFaith : oRod; });
    c.fields = c.builds.some(b=>b.id==='farm') ? placeFields(c,biome,rng) : [];
    for(const f of c.fields) fields.push(f);
    const all=c.houses.concat(c.builds);
    c.r=all.reduce((m,h)=>Math.max(m,Math.hypot(h.x-c.x,h.y-c.y)),1.5);
    c.minY=all.reduce((m,h)=>Math.min(m,h.y),c.y);
    c.gold = Math.round(40 + c.pop/12);                                          // town treasury (money)
    townGive(c,'drewno',Math.round(18+c.pop/14)); townGive(c,'kamień',Math.round(8+c.pop/30));
    townGive(c,'sól',60); townGive(c,'jedzenie',40);   // build materials + a food/salt buffer until trade warms up
  }

  const {houses,relations,ties,legends,intrigues,events,guilds,guildRel,faiths,faithTension}=buildChronicle(cities,rng);

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

  // ---- merchants: CAPITALISED traders. Each caravan owns a purse: it buys a good cheap at one town
  // (paying that town), hauls it, sells it dearer elsewhere (the buyer town pays the caravan), and keeps
  // the spread. A bad run drains the purse -> bankruptcy (removed). A random strategy biases what each
  // one trades, so under the same world some caravans thrive and others die.
  const valueAt=(ci,res)=>townPrice(cities[ci],res)*ECON.tradeVal;        // gold/unit at a town
  const STRATS=[
    {name:'spożywcza', goods:['jedzenie','zboże','ryby','sól','mięso']},  // staples: steady demand
    {name:'surowcowa', goods:['drewno','kamień','ruda','futra']},         // bulk materials
    {name:'luksusowa', goods:['metal','deski','towary','skóry']},         // high-value, thin/volatile
    {name:'wszystko',  goods:null} ];                                     // opportunist
  // caravan buys at town ci with ITS OWN gold (per strategy); returns cargo {res,qty,cost} or null
  const buyAt=(ci,m)=>{ const c=cities[ci],tally={};
    for(const u of storesOf(c)) for(const r in u.stock) if(u.stock[r]>0) tally[r]=(tally[r]||0)+u.stock[r];
    let best=null,bv=4;
    for(const r in tally){ if(m.strat.goods&&!m.strat.goods.includes(r))continue;
      const reserve=(r===FOOD)?cityNeed(c)*ECON.foodReserve:0, avail=tally[r]-reserve; if(avail>bv){bv=avail;best=r;} }
    if(!best)return null; const price=valueAt(ci,best); if(price<=0)return null;
    const qty=Math.min(ECON.cargoCap, Math.floor(bv*0.8), Math.floor(m.gold*0.85/price));
    if(qty<=0)return null; const cost=qty*price; townTake(c,best,qty); c.gold=(c.gold||0)+cost; m.gold-=cost;  // caravan pays the seller town
    return {res:best,qty,cost}; };
  // caravan sells at town ci; the town pays what it can afford & store, the caravan banks the revenue
  const sellAt=(ci,m)=>{ const cargo=m.cargo; if(!cargo){ return; } const c=cities[ci];
    const free=Math.max(0,cityCap(c)-cityUsed(c)), price=valueAt(ci,cargo.res), gold=c.gold||0;
    const afford=price>0?Math.floor(gold/price):0, qty=Math.min(cargo.qty,free,afford);
    if(qty>0){ const rev=qty*price; townGive(c,cargo.res,qty); c.gold=gold-rev; m.gold+=rev;
      m.profit=(m.profit||0)+rev-cargo.cost*(qty/cargo.qty); }
    m.cargo=null; };                                                      // unsold remainder is written off (a loss)
  // pick the best market, but prefer NEAR towns: score = sale value minus a distance toll. A nearby
  // scarce town beats a far one, so short routes win and empty neighbours get served.
  const destFor=(home,reach,cargo,rand)=>{ if(!cargo) return reach[(rand()*reach.length)|0];   // empty -> wander
    const hc=cities[home]; let best=reach[0],bs=-1e9;
    for(const d of reach){ if(cityCap(cities[d])-cityUsed(cities[d])<=0)continue;
      const dist=Math.hypot(cities[d].x-hc.x,cities[d].y-hc.y);
      const score=valueAt(d,cargo.res)-dist*0.02+rand()*1.5; if(score>bs){bs=score;best=d;} }
    return best; };
  let MID=0;
  const newMerchant=(home,gold,rand)=>{ const reach=reachableFrom(home); if(!reach.length)return null;
    const m={id:MID++,home,dest:home,f:cities[home].f,gold,profit:0,cargo:null,
      strat:STRATS[(rand()*STRATS.length)|0],segs:[],si:0,t:0,speed:0.30+rand()*0.20};   // ~3x faster -> trips actually complete
    m.cargo=buyAt(home,m); const dest=destFor(home,reach,m.cargo,rand),route=planRoute(home,dest);
    if(!route||!route.length)return null; m.dest=dest; m.segs=segmentsFor(route); return m; };
  const merchants=[];
  const FLEET=Math.min(90,Math.max(18,Math.round(cities.length*2.2)));   // scale caravans with the world
  for(let i=0;i<FLEET;i++){ const home=rng()*cities.length|0;
    const m=newMerchant(home, Math.round(ECON.caravanCapital*(0.6+rng()*0.9)), rng); if(m){ m.t=rng(); merchants.push(m); } }

  const layers={ rody:bakeLayer(biome,fac,FACTIONS.map(f=>f.tint),FACTIONS.map(f=>f.border)),
    gildie:bakeLayer(biome,facG,guilds.map(g=>hexRGB(g.color)),guilds.map(g=>g.color)),
    wiary:bakeLayer(biome,facFa,faiths.map(f=>hexRGB(f.color)),faiths.map(f=>f.color)) };
  const world={seed,W,H,height,moist,biome,cost,fac,cities,edges,adj,cadj,merchants,trees,bushes,peaks,hills,rocks,fields,bridges,roadPaths,
    houses,relations,ties,legends,intrigues,events,guilds,guildRel,faiths,faithTension,
    base:bakeBase(height,moist,biome),layers,layer:'rody'};
  // runtime: caravan arrives -> sell, maybe go bankrupt, else buy again and route to the best market
  world.replan=m=>{ sellAt(m.dest,m); m.gold-=ECON.caravanUpkeep;        // sell, then pay running costs
    if(m.gold < ECON.caravanMinGold){ m.dead=true; return; }              // bankrupt -> removed by reap()
    const home=m.dest, reach=reachableFrom(home); if(!reach.length){ m.dead=true; return; }
    m.home=home; m.cargo=buyAt(home,m);
    const dest=destFor(home,reach,m.cargo,Math.random), route=planRoute(home,dest);
    if(!route){ m.si=0;m.t=0; return; }
    m.dest=dest; m.segs=segmentsFor(route); m.si=0; m.t=0; };
  // a prosperous town funds a fresh caravan out of its treasury (this is what creates new caravans)
  world.spawnMerchant=home=>{ const c=cities[home], cap=Math.min((c.gold||0)*0.3, ECON.caravanCapital);
    if(cap < ECON.caravanMinGold*2) return false;
    const m=newMerchant(home, Math.round(cap), Math.random); if(!m) return false;
    c.gold-=cap; merchants.push(m); return true; };
  // sweep out bankrupt caravans (called once per economy tick)
  world.reap=()=>{ for(let i=merchants.length-1;i>=0;i--) if(merchants[i].dead) merchants.splice(i,1); };
  // who buys a good at a town, and at what unit price (the other side of the exchange) — for caravan UI
  world.bestBuyer=(ci,res)=>{ const c=cities[ci]; let b=null,bp=0; for(const x of c.builds){ if(x.ruined)continue; const p=priceB(x,res); if(p>bp){bp=p;b=x;} } return {build:b,price:bp*ECON.tradeVal}; };
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
