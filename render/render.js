// RENDER — canvas/camera setup, input, city-info panel, draw passes, loop + boot.
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
function fit(){ cv.width = innerWidth; cv.height = innerHeight; ctx.imageSmoothingEnabled = false; }
addEventListener('resize', fit); fit();
let WORLD=null;

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
addEventListener('mouseup',e=>{ if(downPos){const dx=e.clientX-downPos.x,dy=e.clientY-downPos.y; if(dx*dx+dy*dy<16) pickAt(e.clientX,e.clientY);} drag=null;downPos=null;});
addEventListener('mousemove',e=>{if(!drag)return;cam.x=drag.cx-(e.clientX-drag.sx)/cam.zoom;cam.y=drag.cy-(e.clientY-drag.sy)/cam.zoom;clampCam();});

// ---- selection + city / building info panel (GUI markup lives in index.html #info) ----
let selected=null, selBuild=null, buildMode=null, infoTab='miasto';   // city idx · {ci,b} building · build-type id · panel tab
const BIOME_NAME=['ocean','płycizna','plaża','pustynia','trawa','las','wzgórza','góry'];
const RES_NAME={manor:'Dwór',townhouse:'Kamienica',house:'Dom',shack:'Chata'};
const info=document.getElementById('info');
function clearCity(){selected=null;selBuild=null;infoTab='miasto';updateInfo();}    // panel close button
// enter/leave build mode (a building-type id to place on the next map click)
function setBuild(id){ buildMode=id; document.body.classList.toggle('building',!!id);
  const bb=document.getElementById('buildbar'); if(bb)bb.classList.remove('open'); }
function exitBuild(){ setBuild(null); }
addEventListener('keydown',e=>{ if(e.key==='Escape'){exitBuild();clearCity();} });

function pickAt(sx,sy){ if(!WORLD)return; const[wx,wy]=s2w(sx,sy);
  if(buildMode){ placeBuilding(wx,wy); return; }
  // nearest economy building under the cursor (a few tiles) -> select it
  let bb=null,bd=3.5,bci=-1;
  WORLD.cities.forEach((c,ci)=>{ for(const b of c.builds){ const d=Math.hypot(b.x-wx,b.y-wy); if(d<bd){bd=d;bb=b;bci=ci;} } });
  if(bb){ selBuild={ci:bci,b:bb}; selected=bci; infoTab='budynki'; updateInfo(); return; }
  // else nearest town
  let best=null,cd=1e9; WORLD.cities.forEach((c,i)=>{const d=Math.hypot(c.x-wx,c.y-wy); if(d<c.r+3&&d<cd){cd=d;best=i;}});
  selected=best; selBuild=null; updateInfo();
}
function flash(msg){ const t=document.getElementById('toast'); if(!t)return;
  t.textContent=msg; t.classList.add('show'); clearTimeout(flash._t); flash._t=setTimeout(()=>t.classList.remove('show'),1600); }
// place the build-mode building on land near a town, paying its cost from that town's stock
function placeBuilding(wx,wy){ const x=Math.round(wx),y=Math.round(wy);
  if(!WORLD.passableAt(x,y)) return flash('tu nie zbudujesz (woda/góry)');
  let ci=-1,bd=46; WORLD.cities.forEach((c,i)=>{const d=Math.hypot(c.x-x,c.y-y); if(d<bd){bd=d;ci=i;}});
  if(ci<0) return flash('za daleko od miasta');
  const c=WORLD.cities[ci];
  if(c.builds.concat(c.houses).some(o=>Math.abs(o.x-x)<3&&Math.abs(o.y-y)<3)) return flash('miejsce zajęte');
  if(!canAfford(c,buildMode)) return flash(`${c.name}: brak ${missingFor(c,buildMode).join(', ')}`);
  payCost(c,buildMode);
  const b=makeBuild(buildMode,x,y); c.builds.push(b);
  c.r=Math.max(c.r,Math.hypot(x-c.x,y-c.y)+1);
  flash(`zbudowano: ${b.name} (${c.name})`);
  exitBuild(); selBuild={ci,b}; selected=ci; infoTab='budynki'; updateInfo(); saveGame();
}
function demolishBuild(){ if(!selBuild)return; const c=WORLD.cities[selBuild.ci];
  const i=c.builds.indexOf(selBuild.b); if(i>=0)c.builds.splice(i,1); selBuild=null; updateInfo(); saveGame(); }

// ---- tab switch / building pick (inline onclick targets) ----
function showTab(t){ infoTab=t; if(t==='miasto') selBuild=null; updateInfo(); }
function pickBuild(bi){ const c=WORLD.cities[selected]; if(!c||!c.builds[bi])return;
  selBuild={ci:selected,b:c.builds[bi]}; infoTab='budynki'; updateInfo(); }
function unpickBuild(){ selBuild=null; updateInfo(); }

// city panel: shared header + Miasto / Budynki tabs (building detail lives inside Budynki).
function updateInfo(){
  if(selected==null||!WORLD){info.classList.remove('open');document.body.classList.remove('has-info');return;}
  const c=WORLD.cities[selected];
  info.innerHTML=
    `<div class="ihead"><span class="nm">${c.name}</span><span class="x" onclick="clearCity()">✕</span></div>`
   +`<div class="tabs">`
   + `<span class="tab${infoTab==='miasto'?' on':''}" onclick="showTab('miasto')">Miasto</span>`
   + `<span class="tab${infoTab==='budynki'?' on':''}" onclick="showTab('budynki')">Budynki (${c.builds.length})</span>`
   +`</div>`
   +`<div class="ibody">`+(infoTab==='budynki'?buildsTab(c):cityTab(c))+`</div>`;
  info.classList.add('open');document.body.classList.add('has-info');
}
function cityTab(c){ const f=FACTIONS[c.f];
  const house=WORLD.houses.find(h=>h.f===c.f);
  const guild=c.guild>=0?WORLD.guilds[c.guild]:null, faith=WORLD.faiths[c.faith];
  const comp={}; for(const h of c.houses) comp[h.btype]=(comp[h.btype]||0)+1;
  const resRows=['manor','townhouse','house','shack'].filter(k=>comp[k])
    .map(k=>`<div class="li"><span>${RES_NAME[k]}</span><span>${comp[k]} <span class="dimn">+${comp[k]*buildStore(k)}</span></span></div>`).join('');
  return `<div class="fac"><span class="sw" style="background:${f.flag}"></span>Ród ${house?house.name:f.name}`
   +   (c.seat?` <span class="port">★ stolica</span>`:'')+(c.port?` <span class="port">⚓ port</span>`:'')+`</div>`
   + (house?`<div class="stat"><span>włada</span><b>${house.title} ${house.ruler.full}</b></div>`:'')
   + `<div class="stat"><span>populacja</span><b>${c.pop.toLocaleString('pl')}</b></div>`
   + foodStat(c)
   + `<div class="stat"><span>gospodarka</span><b>${c.role||'—'}</b></div>`
   + `<div class="stat"><span>gildia</span><b style="color:${guild?guild.color:'inherit'}">${guild?guild.name:'—'}</b></div>`
   + `<div class="stat"><span>wiara</span><b style="color:${faith?faith.color:'inherit'}">${faith?faith.name:'—'}</b></div>`
   + `<div class="stat"><span>biom</span><b>${BIOME_NAME[WORLD.biomeAt(c.x,c.y)]}</b></div>`
   + `<div class="stat"><span>drogi</span><b>${WORLD.adj[selected].length}</b></div>`
   + `<div class="sect">mieszkalne (${c.houses.length})</div><div class="list">${resRows}</div>`;
}
// food supply vs the population's appetite (red when short -> famine looming)
function foodStat(c){ const out=cityFood(c), need=cityNeed(c), ok=out>=need-1e-6;
  return `<div class="stat"><span>wyżywienie</span><b style="color:${ok?'inherit':'var(--red)'}">${out.toFixed(1)}/${need.toFixed(1)}${ok?'':' · głód!'}</b></div>`
   + ((c.starv||0)>0?`<div class="stat"><span>głód</span><b style="color:var(--red)">${c.starv}/${STARVE_LIMIT}</b></div>`:''); }
// Budynki tab: clicking a building drills into its detail (same panel); back link returns to the list.
function buildsTab(c){
  if(selBuild && selBuild.ci===selected) return buildingDetail(c,selBuild.b);
  const list=c.builds.length
    ? c.builds.map((b,i)=>`<div class="li eco clk" onclick="pickBuild(${i})"><span>${b.ruined?'⚠ ':''}${b.name}</span><span style="color:${b.ruined?'var(--red)':'inherit'}">${b.ruined?'ruina':'›'}</span></div>`).join('')
    : `<div class="li eco"><span>brak — zbuduj coś (🔨)</span><span></span></div>`;
  return `<div class="sect">budynki (${c.builds.length})</div><div class="list">${list}</div>`+prodRows(c);
}
function buildingDetail(c,b){ const p=PROD[b.id]||{};
  const head=`<div class="li clk back" onclick="unpickBuild()"><span>‹ wszystkie budynki</span><span></span></div>`
   + `<div class="sect">${b.name}${b.ruined?' <span class="capn full">⚠ ruina</span>':''}</div>`;
  if(b.ruined) return head
   + `<div class="stat"><span>stan</span><b style="color:var(--red)">opuszczony — brak ludzi</b></div>`
   + `<div class="li eco"><span>nie produkuje, nie magazynuje</span><span></span></div>`
   + `<div class="sect">akcje</div>`
   + `<button class="btn sm" style="margin-top:6px;width:100%" onclick="rebuildBuild()">⚒ Odbuduj (${costStr(b.id)})</button>`
   + `<button class="btn sm ghost" style="margin-top:6px;width:100%" onclick="demolishBuild()">✕ Rozbierz</button>`;
  return head
   + `<div class="stat"><span>magazyn</span><b>+${buildStore(b.id)} miejsca</b></div>`
   + (p.in?`<div class="stat"><span>zużywa</span><b>−${p.in[1]} ${p.in[0]}/turę</b></div>`:'')
   + `<div class="stat"><span>produkuje</span><b>${p.out?`+${p.out[1]} ${p.out[0]}/turę`:'—'}</b></div>`
   + (p.in?`<div class="stat"><span>w magazynie</span><b>${Math.floor((c.stock||{})[p.in[0]]||0)} ${p.in[0]}</b></div>`:'')
   + `<div class="stat"><span>biom</span><b>${BIOME_NAME[WORLD.biomeAt(b.x,b.y)]}</b></div>`
   + `<div class="sect">akcje</div><div class="li eco"><span>zadania — wkrótce</span><span></span></div>`
   + `<button class="btn sm ghost" style="margin-top:10px;width:100%" onclick="demolishBuild()">✕ Rozbierz</button>`;
}
// rebuild a ruined building, paying its build cost again from the town stock
function rebuildBuild(){ if(!selBuild)return; const c=WORLD.cities[selBuild.ci],b=selBuild.b; if(!b.ruined)return;
  if(!canAfford(c,b.id)) return flash(`brak: ${missingFor(c,b.id).join(', ')}`);
  payCost(c,b.id); b.ruined=false; updateInfo(); saveGame(); flash(`odbudowano: ${b.name}`); }
// production + stockpile sections for a town
function prodRows(c){
  const out=cityOutputs(c), ok=Object.keys(out);
  const prod = ok.length ? ok.map(r=>`<div class="li eco"><span>${r}</span><span>+${out[r]}/turę</span></div>`).join('') : '';
  const st=c.stock||{}, sk=Object.keys(st).filter(r=>st[r]>0);
  const stock = sk.length ? sk.map(r=>`<div class="li"><span>${r}</span><span>${Math.floor(st[r])}</span></div>`).join('') : `<div class="li eco"><span>pusto</span><span></span></div>`;
  const cap=cityCap(c), used=Math.floor(cityUsed(c)), pct=Math.min(100,Math.round(used/cap*100));
  return (prod?`<div class="sect">produkcja</div><div class="list">${prod}</div>`:'')
       + `<div class="sect">skarbiec <span class="capn${pct>=90?' full':''}">${used}/${cap}</span></div>`
       + `<div class="cap${pct>=90?' full':''}"><i style="width:${pct}%"></i></div>`
       + `<div class="list">${stock}</div>`;
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
// anchor icons on every port town's dock (fixed screen size, not world-scaled)
function drawPorts(){ if(cam.zoom<1.5)return; const s=SPR.anchor,IC=Math.max(2,Math.min(4,Math.round(cam.zoom*0.7))),vb=viewBounds();
  for(const c of WORLD.cities){ if(!c.port||!c.dock)continue;
    if(c.dock.x<vb.x0||c.dock.x>vb.x1||c.dock.y<vb.y0||c.dock.y>vb.y1)continue;
    const[sx,sy]=w2s(c.dock.x,c.dock.y);
    ctx.drawImage(s.img,0,0,s.sw,s.sh, Math.round(sx-s.sw*IC/2), Math.round(sy-s.sh*IC/2), s.sw*IC, s.sh*IC); } }
function render(){
  if(!WORLD){ ctx.fillStyle='#10140e'; ctx.fillRect(0,0,cv.width,cv.height); return; }   // no world yet (start screen)
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
  for(const e of ents){
    if(e.ruined){ ctx.globalAlpha=0.4; blit(e.spr,e.x,e.y,false); ctx.globalAlpha=1;   // faded husk
      const[sx,sy]=w2s(e.x,e.y),z=cam.zoom; ctx.fillStyle='rgba(34,18,10,0.5)';
      ctx.fillRect(Math.round(sx-z),Math.round(sy-z*1.6),Math.ceil(z*2),Math.ceil(z*1.8)); }   // soot/rubble
    else blit(e.spr,e.x,e.y); }
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
  if(selBuild){ const b=selBuild.b,[bx,by]=w2s(b.x,b.y),r=Math.max(6,2.2*cam.zoom),lw=Math.max(2,Math.round(cam.zoom*0.9));
    ctx.strokeStyle='#ffe066';ctx.lineWidth=lw;ctx.lineJoin='miter';ctx.setLineDash([]);
    ctx.strokeRect(Math.round(bx-r), Math.round(by-r*1.7), Math.round(r*2), Math.round(r*2)); }   // tight bracket on the picked building
  drawPorts();
  drawLabels();
}

// ============================================================
//  LOOP
// ============================================================
let last=performance.now();
function tick(now){const dt=Math.min(0.05,(now-last)/1000);last=now;
  if(!WORLD){ render(); requestAnimationFrame(tick); return; }   // idle on start screen until a world exists
  for(const m of WORLD.merchants){ if(!m.segs.length)continue;
    const s=m.segs[m.si]; m.t+=m.speed*dt*20/s.len;
    if(m.t>=1){ m.t=0; m.si++; if(m.si>=m.segs.length) WORLD.replan(m); }}
  if(tickEconomy(WORLD,dt) && (selected!=null||selBuild)) updateInfo();   // refresh open panel each econ tick
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

// ---------- quick-save (localStorage) ----------
// The world is deterministic from its seed, so we persist only the seed + the player's
// mutations (per-city stockpiles & built buildings) + camera. Continue = regen(seed) then overlay.
const SAVE_KEY='mapk.save.v1';
function hasSave(){ try{ return !!localStorage.getItem(SAVE_KEY); }catch(e){ return false; } }
function saveGame(){ if(!WORLD)return; try{
  const data={ seed:WORLD.seed, layer:WORLD.layer||'rody',
    cam:{x:cam.x,y:cam.y,zoom:cam.zoom},
    cities:WORLD.cities.map(c=>({ stock:c.stock||{}, builds:(c.builds||[]).map(b=>({id:b.id,x:b.x,y:b.y,ruined:!!b.ruined})) })) };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}catch(e){} }
function loadGame(){ try{
  const data=JSON.parse(localStorage.getItem(SAVE_KEY)||'null'); if(!data)return false;
  regen(data.seed);                                                   // rebuild the deterministic base world
  (data.cities||[]).forEach((sc,i)=>{ const c=WORLD.cities[i]; if(!c)return;
    c.stock=sc.stock||c.stock;
    c.builds=(sc.builds||[]).map(b=>{const nb=makeBuild(b.id,b.x,b.y); nb.ruined=!!b.ruined; return nb;});   // rehydrate (sprite re-derived, ruin state kept)
    for(const b of c.builds) c.r=Math.max(c.r,Math.hypot(b.x-c.x,b.y-c.y)+1); });
  WORLD.layer=data.layer||'rody';
  document.querySelectorAll('.lyr').forEach(b=>b.classList.toggle('on',b.dataset.l===WORLD.layer));
  if(data.cam){ cam.x=data.cam.x; cam.y=data.cam.y; cam.zoom=data.cam.zoom; clampCam(); }
  return true;                                                        // regen() already reset selection/panel/chronicle
}catch(e){ return false; } }

buildSprites();
requestAnimationFrame(tick);          // render loop runs idle until New Game / Continue builds a world
