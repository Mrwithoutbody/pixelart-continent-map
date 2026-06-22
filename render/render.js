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
let selected=null, selBuild=null, selHouse=null, selMerchant=null, buildMode=null, infoTab='miasto';   // selections + build-type + panel tab
const BIOME_NAME=['ocean','płycizna','plaża','pustynia','trawa','las','wzgórza','góry'];
const RES_NAME={manor:'Dwór',townhouse:'Kamienica',house:'Dom',shack:'Chata'};
const info=document.getElementById('info');
function clearCity(){selected=null;selBuild=null;selHouse=null;selMerchant=null;infoTab='miasto';updateInfo();}    // panel close button
// enter/leave build mode (a building-type id to place on the next map click)
function setBuild(id){ buildMode=id; document.body.classList.toggle('building',!!id);
  const bb=document.getElementById('buildbar'); if(bb)bb.classList.remove('open'); }
function exitBuild(){ setBuild(null); }
addEventListener('keydown',e=>{ if(e.key==='Escape'){exitBuild();clearCity();} });

const HSIZE={manor:4, townhouse:3, house:2.4, shack:1.8};   // dwelling pick/frame radius (tiles) by size
// a caravan's current world position (one source of truth; clamped so a finished seg can't read undefined)
function caravanPos(m){ const s=m.segs[Math.min(m.si,m.segs.length-1)]; return [s.x0+(s.x1-s.x0)*m.t, s.y0+(s.y1-s.y0)*m.t, s]; }
function pickAt(sx,sy){ if(!WORLD)return; const[wx,wy]=s2w(sx,sy);
  if(buildMode){ placeBuilding(wx,wy); return; }
  // caravan under the cursor? bigger hotspot, shifted up to the cart body (not the ground point)
  let mm=null,mdist=5; for(const m of WORLD.merchants){ if(m.dead||!m.segs.length)continue;
    const[mx,my]=caravanPos(m); const d=Math.hypot(mx-wx,(my-1.5)-wy); if(d<mdist){mdist=d;mm=m;} }
  if(mm){ selMerchant=mm; selected=null; selBuild=null; selHouse=null; updateInfo(); return; }
  selMerchant=null;
  // what's under the cursor: nearest building, dwelling, town
  let bb=null,bd=3.5,bci=-1; WORLD.cities.forEach((c,ci)=>{ for(const b of c.builds){ const d=Math.hypot(b.x-wx,b.y-wy); if(d<bd){bd=d;bb=b;bci=ci;} } });
  let hh=null,hd=1e9,hci=-1; WORLD.cities.forEach((c,ci)=>{ for(const h of c.houses){ const d=Math.hypot(h.x-wx,h.y-wy); if(d<(HSIZE[h.btype]||2.4)&&d<hd){hd=d;hh=h;hci=ci;} } });
  let nc=null,cd=1e9;       WORLD.cities.forEach((c,i)=>{ const d=Math.hypot(c.x-wx,c.y-wy); if(d<c.r+3&&d<cd){cd=d;nc=i;} });
  const ci = bb?bci : hh?hci : nc;
  if(ci==null){ clearCity(); return; }                                         // clicked empty land
  if(ci!==selected){ selected=ci; selBuild=null; selHouse=null; updateInfo(); return; }   // 1st click on a town -> select the CITY
  // city already selected -> 2nd click drills into a building/dwelling; clicking the selected one toggles it off
  if(bb){ selBuild=(selBuild&&selBuild.b===bb)?null:{ci:bci,b:bb}; selHouse=null; if(selBuild)infoTab='budynki'; }
  else if(hh){ selHouse=(selHouse&&selHouse.h===hh)?null:{ci:hci,h:hh}; selBuild=null; }
  else { selBuild=null; selHouse=null; }                                        // empty spot in the selected city -> clear sub-selection
  updateInfo();
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
  const b=makeBuild(buildMode,x,y); c.builds.push(b); invalidateStores();
  c.r=Math.max(c.r,Math.hypot(x-c.x,y-c.y)+1);
  flash(`zbudowano: ${b.name} (${c.name})`);
  exitBuild(); selBuild={ci,b}; selected=ci; infoTab='budynki'; updateInfo(); saveGame();
}
function demolishBuild(){ if(!selBuild)return; const c=WORLD.cities[selBuild.ci];
  const i=c.builds.indexOf(selBuild.b); if(i>=0)c.builds.splice(i,1); invalidateStores(); selBuild=null; updateInfo(); saveGame(); }

// ---- tab switch / building pick (inline onclick targets) ----
function showTab(t){ infoTab=t; if(t!=='budynki') selBuild=null; updateInfo(); }   // building detail lives only under Budynki
function pickBuild(bi){ const c=WORLD.cities[selected]; if(!c||!c.builds[bi])return;
  selBuild={ci:selected,b:c.builds[bi]}; infoTab='budynki'; updateInfo(); }
function unpickBuild(){ selBuild=null; updateInfo(); }

// city panel: shared header + Miasto / Budynki tabs (building detail lives inside Budynki).
// resource icon (Colonization-style) as an <img> for the panels; '' if none
const resIcon=r=>(typeof ICON_URL!=='undefined'&&ICON_URL[r])?`<img class="ic" src="${ICON_URL[r]}" alt="">`:'';
// name of an owning organisation (ród / gildia / religia)
function ownerName(o){ if(!o)return '—';
  if(o.k==='gildia') return (WORLD.guilds[o.id]||{}).name||'Gildia';
  if(o.k==='wiara')  return (WORLD.faiths[o.id]||{}).name||'Wiara';
  const h=WORLD.houses.find(x=>x.f===o.id); return 'Ród '+(h?h.name:(FACTIONS[o.id]||{}).name); }
const openPanel=html=>{ info.innerHTML=html; info.classList.add('open'); document.body.classList.add('has-info'); };
// a warehouse stock list (icon + name + floored qty), goods >=1 only, or "pusto"
function stockRows(obj){ const ks=Object.keys(obj||{}).filter(r=>obj[r]>=1);
  return ks.length ? ks.map(r=>`<div class="li"><span>${resIcon(r)}${r}</span><span>${Math.floor(obj[r])}</span></div>`).join('')
    : `<div class="li eco"><span>pusto</span><span></span></div>`; }

// caravan inspector — the OTHER side of the exchange: what it carries, where, who buys, at what price
function caravanPanel(){ const m=selMerchant; if(!m||m.dead||!WORLD.merchants.includes(m)){clearCity();return;}
  const dest=WORLD.cities[m.dest], seg=m.segs[Math.min(m.si,m.segs.length-1)];
  const mode=seg&&seg.mode==='sea'?'morzem':'lądem';
  const prof=Math.round(m.profit||0);
  const risk=m.risk<0.008?'śmiała':m.risk<0.013?'umiarkowana':'ostrożna';   // future: from chronicles
  let body=`<div class="stat"><span>ryzyko</span><b>${risk}</b></div>`
    +`<div class="stat"><span>kapitał</span><b>${Math.round(m.gold||0)} zł</b></div>`
    +`<div class="stat"><span>zysk</span><b style="color:${prof>=0?'var(--green)':'var(--red)'}">${prof>=0?'+':''}${prof} zł</b></div>`
    +`<div class="stat"><span>trasa</span><b>${mode} → ${dest?dest.name:'—'}</b></div>`;
  if(!m.cargo){ body+=`<div class="li eco"><span>pusty — szuka okazji</span><span></span></div>`; }
  else { const buyer=WORLD.bestBuyer(m.dest,m.cargo.res), unit=Math.round(m.cargo.cost/m.cargo.qty*10)/10;
    body+=`<div class="sect">ładunek</div>`
      +`<div class="stat"><span>${resIcon(m.cargo.res)}${m.cargo.res}</span><b>${m.cargo.qty} szt</b></div>`
      +`<div class="stat"><span>kupił po</span><b>${unit} zł/szt</b></div>`
      +`<div class="sect">sprzeda</div>`
      +`<div class="stat"><span>kupiec</span><b>${buyer.build?buyer.build.name:'targ'} (${dest?dest.name:''})</b></div>`
      +`<div class="stat"><span>cena/szt</span><b>${buyer.price.toFixed(1)} zł</b></div>`
      +`<div class="stat"><span>marża</span><b style="color:${buyer.price>=unit?'var(--green)':'var(--red)'}">${buyer.price>=unit?'+':''}${Math.round((buyer.price-unit)*m.cargo.qty)} zł</b></div>`; }
  openPanel(`<div class="ihead"><span class="nm">🐎 Karawana</span><span class="x" onclick="clearCity()">✕</span></div><div class="ibody">${body}</div>`);
}
// dwelling inspector
function houseDetail(c,h){
  const skl=stockRows(h.stock);
  openPanel(`<div class="ihead"><span class="nm">${c.name}</span><span class="x" onclick="clearCity()">✕</span></div>`
   +`<div class="ibody">`
   +`<div class="li clk back" onclick="selHouse=null;updateInfo()"><span>‹ wstecz</span><span></span></div>`
   +`<div class="sect">${RES_NAME[h.btype]||'Dom'}${h.ruined?' <span class="capn full">⚠ pustostan</span>':''}</div>`
   +`<div class="stat"><span>właściciel</span><b>${ownerName(h.owner)}</b></div>`
   +`<div class="stat"><span>mieszkańcy</span><b>${h.ruined?'opuszczony':(HOUSE_POP[h.btype]||20)+' miejsc'}</b></div>`
   +`<div class="stat"><span>magazyn</span><b>${Math.floor(unitUsed(h))}/${buildStore(h.btype)}</b></div>`
   +`<div class="sect">skład</div>${skl}`
   +(h.ruined?`<div class="sect">akcje</div><button class="btn sm" style="margin-top:6px;width:100%" onclick="rebuildHouse()">⚒ Odbuduj (${costStr(h.btype)})</button>`:'')
   +`</div>`);
}
// rebuild an abandoned dwelling, paying its material cost from the town
function rebuildHouse(){ if(!selHouse)return; const c=WORLD.cities[selHouse.ci],h=selHouse.h; if(!h.ruined)return;
  if(!canAfford(c,h.btype)) return flash(`brak: ${missingFor(c,h.btype).join(', ')}`);
  payCost(c,h.btype); h.ruined=false; invalidateStores(); updateInfo(); saveGame(); flash(`odbudowano: ${RES_NAME[h.btype]||'dom'}`); }
function updateInfo(){
  if(selMerchant&&WORLD){ caravanPanel(); return; }
  if(selected==null||!WORLD){info.classList.remove('open');document.body.classList.remove('has-info');return;}
  const c=WORLD.cities[selected];
  if(selHouse&&selHouse.ci===selected&&selHouse.h){ houseDetail(c,selHouse.h); return; }
  info.innerHTML=
    `<div class="ihead"><span class="nm">${c.name}</span><span class="x" onclick="clearCity()">✕</span></div>`
   +`<div class="tabs">`
   + `<span class="tab${infoTab==='miasto'?' on':''}" onclick="showTab('miasto')">Miasto</span>`
   + `<span class="tab${infoTab==='budynki'?' on':''}" onclick="showTab('budynki')">Budynki (${c.builds.length})</span>`
   + `<span class="tab${infoTab==='rynek'?' on':''}" onclick="showTab('rynek')">Rynek</span>`
   +`</div>`
   +`<div class="ibody">`+(infoTab==='budynki'?buildsTab(c):infoTab==='rynek'?rynekTab(c):cityTab(c))+`</div>`;
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
   + (()=>{ const jobs=cityJobs(c), un=Math.max(0,Math.round(c.pop-jobs)), rate=c.pop?Math.round(un/c.pop*100):0;
       return `<div class="stat"><span>miejsca pracy</span><b>${jobs}</b></div>`
        +`<div class="stat"><span>bezrobocie</span><b style="color:${rate>=25?'var(--red)':'inherit'}">${un} (${rate}%)</b></div>`; })()
   + `<div class="stat"><span>skarb</span><b>${Math.floor(c.gold||0)} złota</b></div>`
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
   + ((c.starv||0)>0?`<div class="stat"><span>głód</span><b style="color:var(--red)">${c.starv}/${ECON.ruinLimit}</b></div>`:''); }
// Budynki tab: economy buildings + dwellings, each clickable into its detail; back link returns to the list.
function buildsTab(c){
  if(selBuild && selBuild.ci===selected) return buildingDetail(c,selBuild.b);
  const eco=c.builds.length
    ? c.builds.map((b,i)=>`<div class="li eco clk" onclick="pickBuild(${i})"><span>${b.ruined?'⚠ ':''}${b.name}</span><span style="color:${b.ruined?'var(--red)':'inherit'}">${b.ruined?'ruina':'›'}</span></div>`).join('')
    : `<div class="li eco"><span>brak — zbuduj coś (🔨)</span><span></span></div>`;
  const homes=c.houses.map((h,i)=>`<div class="li eco clk" onclick="pickHouse(${i})"><span>${h.ruined?'⚠ ':''}${RES_NAME[h.btype]||'Dom'}</span><span style="color:${h.ruined?'var(--red)':'inherit'}">${h.ruined?'pustostan':'›'}</span></div>`).join('');
  return `<div class="sect">gospodarcze (${c.builds.length})</div><div class="list">${eco}</div>`
    + `<div class="sect">mieszkalne (${c.houses.length})</div><div class="list">${homes}</div>`
    + prodRows(c);
}
function pickHouse(i){ const c=WORLD.cities[selected]; if(!c||!c.houses[i])return; selHouse={ci:selected,h:c.houses[i]}; selBuild=null; selMerchant=null; updateInfo(); }
function buildingDetail(c,b){
  const head=`<div class="li clk back" onclick="unpickBuild()"><span>‹ wszystkie budynki</span><span></span></div>`
   + `<div class="sect">${b.name}${b.ruined?' <span class="capn full">⚠ ruina</span>':''}</div>`;
  if(b.ruined) return head
   + `<div class="stat"><span>stan</span><b style="color:var(--red)">opuszczony — brak ludzi</b></div>`
   + `<div class="li eco"><span>nie produkuje, nie magazynuje</span><span></span></div>`
   + `<div class="sect">akcje</div>`
   + `<button class="btn sm" style="margin-top:6px;width:100%" onclick="rebuildBuild()">⚒ Odbuduj (${costStr(b.id)})</button>`
   + `<button class="btn sm ghost" style="margin-top:6px;width:100%" onclick="demolishBuild()">✕ Rozbierz</button>`;
  return head
   + `<div class="stat"><span>właściciel</span><b>${ownerName(b.owner)}</b></div>`
   + `<div class="stat"><span>magazyn</span><b>${Math.floor(unitUsed(b))}/${buildStore(b.id)}</b></div>`
   + recipeRows(b,c)
   + priceChips(c,b)
   + `<div class="stat"><span>biom</span><b>${BIOME_NAME[WORLD.biomeAt(b.x,b.y)]}</b></div>`
   + `<div class="sect">akcje</div><div class="li eco"><span>zadania — wkrótce</span><span></span></div>`
   + `<button class="btn sm ghost" style="margin-top:10px;width:100%" onclick="demolishBuild()">✕ Rozbierz</button>`;
}
// recipe(s) of a building as "inputs → output/turę", plus THIS building's own warehouse contents
function recipeRows(b,c){ const recs=recipesOf(b.id); let h='';
  if(recs.length) h+=recs.map(r=>{ const lhs=r.in.length?r.in.map(x=>`${x[1]} ${x[0]}`).join(' + '):'produkuje';
    const rhs=`${r.out[1]} ${r.out[0]}`+(r.out2?` + ${r.out2[1]} ${r.out2[0]}`:'');
    return `<div class="stat"><span>${lhs}</span><b>→ ${rhs}/turę</b></div>`; }).join('');
  h+=`<div class="sect">skład budynku</div>`+stockRows(b.stock);
  return h; }
// this building's own bid/ask prices (pure exchange) — color-coded, no raw math thrust at the player
function priceChips(c,b){ const recs=recipesOf(b.id); const buys=new Set(),sells=new Set();
  recs.forEach(r=>{ r.in.forEach(x=>buys.add(x[0])); if(r.out)sells.add(r.out[0]); if(r.out2)sells.add(r.out2[0]); });
  if(!buys.size&&!sells.size)return '';
  const chip=(r,kind)=>{ const p=priceB(b,r); const hot=p>=2; const col=kind==='buy'?(hot?'var(--red)':'var(--parch2)'):(hot?'var(--gold)':'var(--green)');
    return `<span class="pchip" style="color:${col}">${kind==='buy'?'kupuje':'sprzedaje'} ${resIcon(r)}${r} <b>${p.toFixed(1)}</b></span>`; };
  return `<div class="sect">ceny budynku</div><div class="chips">`
    +[...buys].map(r=>chip(r,'buy')).join('')+[...sells].map(r=>chip(r,'sell')).join('')+`</div>`; }
// rebuild a ruined building, paying its build cost again from the town
function rebuildBuild(){ if(!selBuild)return; const c=WORLD.cities[selBuild.ci],b=selBuild.b; if(!b.ruined)return;
  if(!canAfford(c,b.id)) return flash(`brak: ${missingFor(c,b.id).join(', ')}`);
  payCost(c,b.id); b.ruined=false; invalidateStores(); updateInfo(); saveGame(); flash(`odbudowano: ${b.name}`); }
// town aggregate goods {res:qty} across every building/dwelling warehouse
function townGoods(c){ const o={}; for(const u of storesOf(c)) for(const r in u.stock){ if(u.stock[r]>0) o[r]=(o[r]||0)+u.stock[r]; } return o; }
// production + stockpile sections for a town (Budynki tab)
function prodRows(c){
  const out=cityOutputs(c), ok=Object.keys(out);
  const prod = ok.length ? ok.map(r=>`<div class="li eco"><span>${r}</span><span>+${out[r]}/turę</span></div>`).join('') : '';
  const stock=stockRows(townGoods(c));
  const cap=cityCap(c), used=Math.floor(cityUsed(c)), pct=cap?Math.min(100,Math.round(used/cap*100)):0;
  return (prod?`<div class="sect">produkcja</div><div class="list">${prod}</div>`:'')
       + `<div class="sect">magazyn miasta <span class="capn${pct>=90?' full':''}">${used}/${cap}</span></div>`
       + `<div class="cap${pct>=90?' full':''}"><i style="width:${pct}%"></i></div>`
       + `<div class="list">${stock}</div>`;
}
// RYNEK tab: each traded good with the town's going price + a heat bar (the giełda at a glance)
function rynekTab(c){
  const goods=['jedzenie','zboże','ryby','mięso','sól','drewno','kamień','deski','ruda','metal','futra','skóry','towary'];
  const st=townGoods(c);
  const rows=goods.map(r=>{ const price=townPrice(c,r), have=Math.floor(st[r]||0);
    const pct=Math.min(100,Math.round(price/5*100)), hot=price>=2;
    return `<div class="mrow"><span class="mname">${resIcon(r)}${r}</span>`
      +`<span class="mbar"><i class="${hot?'hot':''}" style="width:${pct}%"></i></span>`
      +`<span class="mprice${hot?' hot':''}">${price.toFixed(1)}</span>`
      +`<span class="mhave">${have}</span></div>`; }).join('');
  return `<div class="sect">rynek — cena · zapas</div><div class="mkt">${rows}</div>`
    + `<div class="hint">czerwone = drogo (brak + popyt) · zielone = tanio. Cenę dyktuje budynek, który najbardziej chce dane dobro.</div>`;
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
  if(WORLD.layers[WORLD.layer]) ctx.drawImage(WORLD.layers[WORLD.layer],0,0,W,H,DX,DY,DW,DH);   // allegiance overlay
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
    const[mx,my,s]=caravanPos(m);
    if(mx<vb.x0||mx>vb.x1||my<vb.y0||my>vb.y1) continue;
    const spr = s.mode==='sea'?SPR.ship:SPR.cart;              // caravan turns into a ship on water legs
    blit(spr,mx,my);
    if(m.f>=0){ // faction-owned convoy -> flag in faction colour
      const z=cam.zoom,[sx,sy]=w2s(mx,my), top=Math.round(sy-(spr.sh+1)*z);
      ctx.fillStyle=OUTL; ctx.fillRect(Math.round(sx),top,Math.max(1,Math.round(z*0.5)),Math.ceil(z*3));
      ctx.fillStyle=FACTIONS[m.f].flag; ctx.fillRect(Math.round(sx),top,Math.ceil(z*2),Math.ceil(z*1.5));
    }
    // the cargo it carries, as a floating icon above it (Colonization-style visible transport)
    if(cam.zoom>=2 && m.cargo && ICON_SPR[m.cargo.res]){ const ic=ICON_SPR[m.cargo.res],[sx,sy]=w2s(mx,my);
      const IC=Math.max(8,Math.round(cam.zoom*1.8)), iy=Math.round(sy-(spr.sh+1)*cam.zoom-IC);
      ctx.fillStyle='rgba(18,22,14,0.55)'; ctx.fillRect(Math.round(sx-IC/2)-1,iy-1,IC+2,IC+2);   // backing chip
      ctx.drawImage(ic.img,0,0,ic.sw,ic.sh, Math.round(sx-IC/2),iy, IC,IC); }}
  if(selected!=null){const c=WORLD.cities[selected];const[sx,sy]=w2s(c.x,c.y);
    const r=Math.round((c.r+4)*cam.zoom), lw=Math.max(3,Math.round(cam.zoom*1.1));
    ctx.strokeStyle='#ffe066';ctx.lineWidth=lw;ctx.lineJoin='miter';ctx.setLineDash([]);
    ctx.strokeRect(Math.round(sx)-r, Math.round(sy)-r, r*2, r*2);}   // chunky square bracket, no rounding
  const framed = selBuild?selBuild.b : (selHouse&&selHouse.ci===selected?selHouse.h:null);
  if(framed){ const sz=framed.btype?(HSIZE[framed.btype]||2.4):2.2;          // houses scale by size
    const[bx,by]=w2s(framed.x,framed.y),r=Math.max(6,sz*cam.zoom),lw=Math.max(2,Math.round(cam.zoom*0.9));
    ctx.strokeStyle='#ffe066';ctx.lineWidth=lw;ctx.lineJoin='miter';ctx.setLineDash([]);
    ctx.strokeRect(Math.round(bx-r), Math.round(by-r*1.7), Math.round(r*2), Math.round(r*2)); }   // tight bracket on picked building/house
  if(selMerchant&&selMerchant.segs.length){ const[mx,my]=caravanPos(selMerchant), [px,py]=w2s(mx,my),
      r=Math.max(11,cam.zoom*3.6), cy=Math.round(py-cam.zoom*1.3);   // bigger, raised to the cart body
    ctx.strokeStyle='#ffe066';ctx.lineWidth=Math.max(2,cam.zoom*0.9);ctx.setLineDash([]);
    ctx.strokeRect(Math.round(px-r),cy-r,Math.round(r*2),Math.round(r*2)); }   // bracket on the picked caravan
  if(WORLD.layer==='ceny') drawPriceLayer();
  drawPorts();
  drawLabels();
}
// price-heat overlay: tint each town by its going price for the selected good (green cheap -> red dear)
let priceGood='sól';
function priceHeat(t){ const r=Math.round(70+t*170), g=Math.round(185-t*150), b=70; return `rgb(${r},${g},${b})`; }
function drawPriceLayer(){ const vb=viewBounds();
  for(const c of WORLD.cities){ if(c.x<vb.x0||c.x>vb.x1||c.y<vb.y0||c.y>vb.y1)continue;
    const p=townPrice(c,priceGood), t=Math.max(0,Math.min(1,(p-0.25)/3.75)), [sx,sy]=w2s(c.x,c.y), R=Math.max(7,cam.zoom*3.4);
    ctx.globalAlpha=0.6; ctx.fillStyle=priceHeat(t); ctx.beginPath(); ctx.arc(sx,sy,R,0,6.2832); ctx.fill();
    ctx.globalAlpha=1; ctx.lineWidth=Math.max(1,cam.zoom*0.4); ctx.strokeStyle=OUTL; ctx.stroke(); } }

// ============================================================
//  LOOP
// ============================================================
let last=performance.now();
function tick(now){const dt=Math.min(0.05,(now-last)/1000);last=now;
  if(!WORLD){ render(); requestAnimationFrame(tick); return; }   // idle on start screen until a world exists
  for(const m of WORLD.merchants){ if(m.dead||!m.segs.length||m.si>=m.segs.length)continue;   // skip bankrupt/finished until reaped
    const s=m.segs[m.si]; m.t+=m.speed*dt*20/s.len;
    if(m.t>=1){ m.t=0; m.si++; if(m.si>=m.segs.length) WORLD.replan(m); }}
  if(tickEconomy(WORLD,dt)){ devCheck(WORLD); if(selected!=null||selBuild) updateInfo(); }   // invariants + panel refresh each econ tick
  render();requestAnimationFrame(tick);}

// ---------- boot ----------
// regen builds a fresh world (used by the generating screen + in-game "new map").
function regen(seed){WORLD=genWorld(typeof seed==='number'?seed:(Math.random()*1e9|0));clampCam();
  selected=null;selBuild=null;selHouse=null;selMerchant=null;updateInfo();
  if(typeof renderChronicle==='function') renderChronicle();
  document.querySelectorAll('.lyr').forEach(b=>b.classList.toggle('on',b.dataset.l==='rody'));   // reset layer switch
  const el=document.getElementById('seed');if(el)el.textContent=WORLD.seed;
  const sc=document.getElementById('scenario');if(sc)sc.textContent=WORLD.houses.length+' rodów · '+WORLD.cities.length+' miast';}
// R = new map, but only while playing (start/gen screens own the keyboard otherwise).
addEventListener('keydown',e=>{if((e.key==='r'||e.key==='R')&&document.body.dataset.screen==='game')regen();});

// ---------- quick-save (localStorage) ----------
// The world is deterministic from its seed, so we persist only the seed + the player's
// mutations (per-city stockpiles & built buildings) + camera. Continue = regen(seed) then overlay.
const SAVE_KEY='mapk.save.v2';   // v2: per-building stock + treasury (old v1 city-pool saves are dropped)
function hasSave(){ try{ return !!localStorage.getItem(SAVE_KEY); }catch(e){ return false; } }
function saveGame(){ if(!WORLD)return; try{
  const data={ seed:WORLD.seed, layer:WORLD.layer||'rody',
    cam:{x:cam.x,y:cam.y,zoom:cam.zoom},
    cities:WORLD.cities.map(c=>({ gold:c.gold||0,
      builds:(c.builds||[]).map(b=>({id:b.id,x:b.x,y:b.y,ruined:!!b.ruined,stock:b.stock||{}})) })) };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}catch(e){} }
function loadGame(){ try{
  const data=JSON.parse(localStorage.getItem(SAVE_KEY)||'null'); if(!data)return false;
  regen(data.seed);                                                   // rebuild the deterministic base world
  (data.cities||[]).forEach((sc,i)=>{ const c=WORLD.cities[i]; if(!c)return;
    c.gold=sc.gold||0;
    c.builds=(sc.builds||[]).map(b=>{const nb=makeBuild(b.id,b.x,b.y); nb.ruined=!!b.ruined; nb.stock=b.stock||{}; return nb;}); invalidateStores();  // rehydrate stock + ruin state
    for(const h of c.houses) h.stock={};                                  // drop re-seeded household goods (saved goods live in builds)
    for(const b of c.builds) c.r=Math.max(c.r,Math.hypot(b.x-c.x,b.y-c.y)+1); });
  WORLD.layer=data.layer||'rody';
  document.querySelectorAll('.lyr').forEach(b=>b.classList.toggle('on',b.dataset.l===WORLD.layer));
  if(data.cam){ cam.x=data.cam.x; cam.y=data.cam.y; cam.zoom=data.cam.zoom; clampCam(); }
  return true;                                                        // regen() already reset selection/panel/chronicle
}catch(e){ return false; } }

buildSprites();
validateConfig();                     // fail loudly at boot on any config drift (missing cost/store/icon, bad recipe)
requestAnimationFrame(tick);          // render loop runs idle until New Game / Continue builds a world
