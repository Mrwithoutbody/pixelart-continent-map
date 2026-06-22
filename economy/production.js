// ECONOMY / PRODUCTION — recipes (raw producers + refiners), build costs, and the economy tick.
// Needs BLD / ECON_SPR / SPR (config + sprites).

// ---- tunables (mutable so the balance sim can sweep them) ----
// Balance picked by simulation sweep (sim/balance-sweep): self-correcting, no collapse, lively.
// Towns settle at their food ceiling (Malthusian) -> food/salt trade always matters; pop ~0.83 of
// start, 0 town collapses over 2500 ticks across seeds.
const ECON={
  foodPerCap:0.0006,     // food eaten per head per tick (main "how fed" / sustainable-population lever)
  gruel:true,            // bakery may run a low-yield unsalted fallback (salt = efficiency, not a death gate)
  ruinLimit:200,         // ticks of sustained famine before a building is abandoned (long + recoverable)
  cargoCap:100,              // caravan load size (Colonization 100-unit)
  caravanCapital:120, caravanMinGold:8, caravanUpkeep:5,    // starting purse; running cost per trip; below min -> bankrupt
  caravansPerTown:1,         // caravans a town outfits from its treasury at world start (~1/town)
  buildEvery:100, buildReserve:50,          // autonomous town growth: try a build every N ticks if treasury > reserve
  caravanEvery:40, caravanGold:110, fleetPerTown:3,   // a rich market town spawns a caravan; fleet capped at fleetPerTown*towns
};

// recipe per building: out:[res,rate] always; in:[res,rate] for refiners that consume a raw input.
const PROD={
  farm:{out:['zboże',3]},          lumber_camp:{out:['drewno',2]},
  sawmill:{in:['drewno',2],out:['deski',1]},
  mine:{out:['ruda',1]},           smelter:{in:['ruda',2],out:['metal',1]},
  quarry:{out:['kamień',1]},       fishery:{out:['ryby',2]},
  salt_works:{out:['sól',6]},      harbor:{out:['towary',1]},
  hunter:{out:['mięso',2], out2:['futra',1]},     // forest: meat (food) + furs (raw hide)
  garbarnia:{in:['futra',2], out:['skóry',1]},    // tannery: furs -> leather (a trade good)
  market:{out:['złoto',2]},        warehouse:{}, chapel:{}, tower:{},
  // bakery: salted recipes (grain/fish/meat + salt) are efficient; unsalted gruel is a lean fallback.
  piekarnia:{recipes:[ {in:[['zboże',3],['sól',1]], out:['jedzenie',3]},
                       {in:[['ryby',1],['sól',2]],  out:['jedzenie',3]},
                       {in:[['mięso',2],['sól',1]], out:['jedzenie',3]},
                       {in:[['zboże',4]],           out:['jedzenie',1], gruel:true},
                       {in:[['ryby',2]],            out:['jedzenie',1], gruel:true},
                       {in:[['mięso',3]],           out:['jedzenie',1], gruel:true} ]},
};
// normalise any building to a list of recipes [{in:[[res,q],...], out:[res,q]}]
function recipesOf(id){ const p=PROD[id]; if(!p)return[];
  if(p.recipes)return ECON.gruel?p.recipes:p.recipes.filter(r=>!r.gruel);
  if(p.out)return [{in:p.in?[p.in]:[], out:p.out, out2:p.out2}];
  return []; }
// build / rebuild cost — paid in materials from the town's warehouses. One scheme: drewno + kamień
// everywhere, plus metal ("stal") for specialist buildings. No money: construction is materials.
const BUILD_COST={
  // dwellings — EXPENSIVE wood + stone (a home is a big investment, paid from the town treasury)
  shack:{drewno:12,'kamień':4},    house:{drewno:30,'kamień':20},
  townhouse:{drewno:60,'kamień':40}, manor:{drewno:120,'kamień':80},
  // raw producers — wood + a little stone
  farm:{drewno:10,'kamień':4},     lumber_camp:{drewno:8},
  fishery:{drewno:10,'kamień':4},  hunter:{drewno:8},
  quarry:{drewno:10},              mine:{drewno:12,'kamień':6},   salt_works:{drewno:10,'kamień':6},
  // workshops — wood + stone + STAL (steel/metal)
  piekarnia:{drewno:16,'kamień':10,'metal':3}, sawmill:{drewno:16,'kamień':8,'metal':3}, garbarnia:{drewno:14,'kamień':8,'metal':3},
  smelter:{drewno:14,'kamień':14,'metal':4},  market:{drewno:18,'kamień':14,'metal':4},
  warehouse:{drewno:14,'kamień':10}, harbor:{drewno:18,'kamień':10,'metal':4},
  chapel:{drewno:16,'kamień':14},   tower:{drewno:18,'kamień':24,'metal':8},
};
const BUILDABLE=['farm','piekarnia','hunter','garbarnia','lumber_camp','mine','quarry','fishery','salt_works','sawmill','smelter','market','warehouse','tower']
  .map(id=>({id, name:(BLD[id]||{name:id}).name, cost:BUILD_COST[id]||{}}));

const ECON_TICK=1.0;   // seconds of game time per economy tick

function makeBuild(id,x,y){ return {x,y,id,name:(BLD[id]||{name:id}).name, spr:SPR[ECON_SPR[id]]||SPR.workshop, stock:{}}; }

const costStr=id=>{ const c=BUILD_COST[id]||{},k=Object.keys(c); return k.length?k.map(r=>`${c[r]} ${r}`).join(' · '):'darmo'; };

// ---- PER-BUILDING WAREHOUSES: every building (and dwelling) stores its OWN goods up to its own cap.
// The town's stockpile is the sum of these. 'złoto' is the town treasury (c.gold), not a warehoused good.
const STORE={ warehouse:160, market:60, harbor:60,                      // dedicated / civic stores
  farm:25, lumber_camp:25, mine:25, quarry:25, fishery:25, salt_works:25, hunter:25,   // raw extractors: own buffer
  sawmill:30, smelter:30, piekarnia:30, garbarnia:30,                       // refiners: slightly bigger
  tower:10, chapel:10,                                                      // civic: token
  manor:30, townhouse:12, house:6, shack:3 };                              // dwellings: household pantry
const STORE_DEFAULT=15;
function buildStore(id){ return STORE[id]??STORE_DEFAULT; }
function unitCap(u){ return buildStore(u.id||u.btype); }                 // building keys on .id, dwelling on .btype
function unitUsed(u){ let s=0; const st=u.stock; if(st)for(const r in st)if(st[r]>0)s+=st[r]; return s; }
// every working warehouse unit in a town: economy buildings (not ruined) + dwellings.
// Memoised per epoch — the unit LIST only changes when a building is built/ruined/demolished,
// so we cache it and bump the epoch on those events (stock contents are read live off the units).
let STORES_EPOCH=1;
function invalidateStores(){ STORES_EPOCH++; }
function storesOf(c){ if(c._se===STORES_EPOCH && c._stores) return c._stores;
  const a=[]; for(const b of (c.builds||[])) if(!b.ruined){ b.stock||(b.stock={}); a.push(b); }
  for(const h of (c.houses||[])) if(!h.ruined){ h.stock||(h.stock={}); a.push(h); }
  c._stores=a; c._se=STORES_EPOCH; return a; }
function townHas(c,res){ let s=0; for(const u of storesOf(c)) s+=(u.stock[res]||0); return s; }
function cityCap(c){ let cap=0; for(const u of storesOf(c)) cap+=unitCap(u); return cap; }
function cityUsed(c){ let s=0; for(const u of storesOf(c)) s+=unitUsed(u); return s; }
// take up to qty of res from the town (drain the fullest of that good first); returns amount taken
function townTake(c,res,qty){ let need=qty;
  const us=storesOf(c).filter(u=>(u.stock[res]||0)>0).sort((a,b)=>(b.stock[res]||0)-(a.stock[res]||0));
  for(const u of us){ if(need<=0)break; const t=Math.min(u.stock[res],need); u.stock[res]-=t; need-=t; } return qty-need; }
// store up to qty of res into the town (producer unit first, then any with room); returns amount stored
function townGive(c,res,qty,prefer){ let left=qty; const us=storesOf(c);
  if(prefer){ const i=us.indexOf(prefer); if(i>0){ us.splice(i,1); us.unshift(prefer); } }
  for(const u of us){ if(left<=0)break; const free=unitCap(u)-unitUsed(u); if(free<=0)continue;
    const t=Math.min(free,left); u.stock[res]=(u.stock[res]||0)+t; left-=t; } return qty-left; }

// ---- PRICES: pure supply & demand. No hand-tuned demand bumps, no favoured goods — price is ONLY
// scarcity: gold/unit = PMAX/(1+stock·k). Demand is emergent: consumers eat stock -> stock falls ->
// price rises by itself -> caravans bring more. The invisible hand, not regulation.
const PMAX=22, PSCARCE=0.05;
function priceB(b,res){ return PMAX/(1+(((b.stock&&b.stock[res])||0)*PSCARCE)); }   // a building's own scarcity (UI chips)
function townPrice(c,res){ return PMAX/(1+townHas(c,res)*PSCARCE); }                 // the town's scarcity = its trade price

// ---- build affordability (goods come from warehouses, 'złoto' from the treasury) ----
function affordHave(c,r){ return r==='złoto'?(c.gold||0):townHas(c,r); }
function canAfford(c,id){ const cost=BUILD_COST[id]||{}; for(const r in cost) if(affordHave(c,r)<cost[r])return false; return true; }
function payCost(c,id){ const cost=BUILD_COST[id]||{}; for(const r in cost){ if(r==='złoto')c.gold=(c.gold||0)-cost[r]; else townTake(c,r,cost[r]); } }
function missingFor(c,id){ const cost=BUILD_COST[id]||{},m=[]; for(const r in cost){ const have=affordHave(c,r); if(have<cost[r])m.push(`${Math.ceil(cost[r]-have)} ${r}`); } return m; }

// ---- food: towns eat ONLY 'jedzenie' (population/demography lives in engine/population.js) ----
const FOOD='jedzenie';
const FOOD_INPUTS=new Set();                                                // bakery inputs (filled below)
recipesOf('piekarnia').forEach(r=>r.in.forEach(x=>FOOD_INPUTS.add(x[0])));  // {zboże,sól,ryby,mięso}
const isFood=b=>recipesOf(b.id).some(r=>r.out[0]===FOOD);                   // a bakery
const feedsTown=b=>{ if(isFood(b))return true; const r0=(PROD[b.id]&&PROD[b.id].out); return !!r0&&FOOD_INPUTS.has(r0[0]); }; // bakery OR its supplier (grain/fish/salt)
// abandon the smallest dwelling when a town has far more housing than people (depopulated)
function ruinHouse(c){ const live=(c.houses||[]).filter(h=>!h.ruined); if(live.length<=1)return;
  const order={shack:0,house:1,townhouse:2,manor:3};
  let t=live[0]; for(const h of live) if((order[h.btype]||0)<(order[t.btype]||0)) t=h;
  const s=t.stock||{}; t.ruined=true; invalidateStores();
  for(const r in s){ if(s[r]>0) townGive(c,r,s[r]); } t.stock={}; }
function cityFood(c){ let n=0; for(const b of (c.builds||[])){ if(b.ruined)continue;
  for(const r of recipesOf(b.id)) if(r.out[0]===FOOD){ n+=r.out[1]; break; } } return n; }
function cityNeed(c){ return (c.pop||0)*ECON.foodPerCap; }
// jobs: each working economy building employs people. Town's workforce demand = sum.
const WORKERS={ farm:40,fishery:40,hunter:40,lumber_camp:40,quarry:40,salt_works:40,mine:50,
  sawmill:50,piekarnia:50,garbarnia:50,smelter:60,market:60,harbor:50, warehouse:20,chapel:10,tower:10 };
function cityJobs(c){ let n=0; for(const b of (c.builds||[])) if(!b.ruined) n+=WORKERS[b.id]||30; return n; }
function feedCity(c){ const need=cityNeed(c), got=townTake(c,FOOD,need); return got>=need-1e-4; }
// abandon one building when famine is chronic: spare the food chain, hand its goods to the rest of town
function ruinOne(c){ const t=(c.builds||[]).find(b=>!b.ruined&&!feedsTown(b));   // only ever abandon a NON food-chain building
  if(!t)return;                                                                  // all that's left feeds the town -> spare it, let pop shrink
  const s=t.stock||{}; t.ruined=true; invalidateStores();
  for(const r in s){ if(s[r]>0) townGive(c,r,s[r]); }  t.stock={}; }              // redistribute, don't vaporise

// ---- autonomous town growth: a town invests its treasury into the building it most needs ----
const has=(c,id)=>c.builds.some(b=>b.id===id&&!b.ruined);
const cntB=(c,id)=>c.builds.reduce((n,b)=>n+(b.id===id&&!b.ruined?1:0),0);
// what should this town build next? (need-driven, biome-aware) — returns an id, '__house', or null
function chooseBuild(c){ const k=c.kinds||{};
  // 1) FOOD: short on food -> SCALE the food chain the land supports (duplicates allowed, capped)
  if(cityFood(c) < cityNeed(c)){
    const inputAround = k.G>14||k.W>4||k.F>14;
    if(inputAround && cntB(c,'piekarnia')<1)              return 'piekarnia';   // a bakery at all, first
    if(k.G>14 && cntB(c,'farm')<3)                        return 'farm';
    if(k.W>4  && cntB(c,'fishery')<3)                     return 'fishery';
    if(k.F>14 && cntB(c,'hunter')<3)                      return 'hunter';
    if(k.D>14 && cntB(c,'salt_works')<2)                 return 'salt_works';
    if(inputAround && cntB(c,'piekarnia')<2 && cityFood(c)<cityNeed(c)*0.7) return 'piekarnia';  // 2nd bakery if still short
  }
  // 2) HOUSING: prosperous (fed) town near its housing ceiling -> room for more people
  // build homes only when there's WORK without housing for it (workers to house) — not for mere overcrowding
  if((c.starv||0)===0 && cityJobs(c) > housingCap(c) && (c.pop||0) >= housingCap(c)) return '__house';
  // 3) VALUE-ADD: a raw piling up with no refiner the land can support
  if(k.F>14 && townHas(c,'drewno')>40 && !has(c,'sawmill')) return 'sawmill';
  if(k.F>14 && townHas(c,'futra')>20  && !has(c,'garbarnia')) return 'garbarnia';
  if(k.M>14 && townHas(c,'ruda')>20  && !has(c,'smelter'))  return 'smelter';
  return null;
}
// find an empty, passable, non-overlapping tile in the ring around a town
function freeSpotNear(world,c){ for(let t=0;t<40;t++){ const a=Math.random()*6.2832, rad=5+Math.random()*10;
  const x=Math.round(c.x+Math.cos(a)*rad), y=Math.round(c.y+Math.sin(a)*rad*0.8);
  if(!world.passableAt(x,y))continue;
  if(c.builds.concat(c.houses).some(o=>Math.abs(o.x-x)<4&&Math.abs(o.y-y)<4))continue;
  return {x,y}; } return null; }
function tryBuild(world,c){ if((c.gold||0) < ECON.buildReserve) return;
  const id=chooseBuild(c); if(!id)return;
  if(id==='__house'){ if(!canAfford(c,'house'))return; const s=freeSpotNear(world,c); if(!s)return;
    payCost(c,'house'); c.houses.push({x:s.x,y:s.y,btype:'house',spr:SPR.house,stock:{},owner:{k:'rod',id:c.f}}); invalidateStores(); return; }
  if(!canAfford(c,id))return; const s=freeSpotNear(world,c); if(!s)return;
  payCost(c,id); const b=makeBuild(id,s.x,s.y); b.owner={k:'rod',id:c.f};
  c.r=Math.max(c.r,Math.hypot(s.x-c.x,s.y-c.y)+1); c.builds.push(b); invalidateStores(); }

// production: each working building runs the first recipe the TOWN can supply; output lands in that
// building first (so its own price reflects what it makes), spilling into town storage when full.
function tickEconomy(world,dt){
  if(!world)return false;
  world._acc=(world._acc||0)+dt; if(world._acc<ECON_TICK)return false; world._acc-=ECON_TICK;
  world._tickN=(world._tickN||0)+1;
  for(let ci=0;ci<world.cities.length;ci++){ const c=world.cities[ci];
    const cap=cityCap(c); let used=cityUsed(c);
    for(const b of c.builds){ if(b.ruined)continue;
      for(const rec of recipesOf(b.id)){
        let ok=true; for(const[ir,iq]of rec.in){ if(townHas(c,ir)<iq){ok=false;break;} }
        if(!ok)continue;
        const[or_,oq]=rec.out;
        if(or_==='złoto'){ for(const[ir,iq]of rec.in)townTake(c,ir,iq); c.gold=(c.gold||0)+oq; break; }  // market mints treasury
        const space=cap-used; if(space<=0)break;                                                         // full -> output spoils
        for(const[ir,iq]of rec.in){ townTake(c,ir,iq); used-=iq; }
        const stored=townGive(c,or_,Math.min(oq,space),b); used+=stored;
        if(rec.out2){ const[o2,q2]=rec.out2, sp2=cap-used; if(sp2>0) used+=townGive(c,o2,Math.min(q2,sp2),b); }   // by-product (furs)
        break; } }                                                                                          // one recipe per tick
    // everyone eats; demography (births/deaths/overcrowding) lives in stepPopulation()
    const fed=feedCity(c); stepPopulation(c,fed);
    if(fed) c.starv=Math.max(0,(c.starv||0)-2);
    else { c.starv=(c.starv||0)+1;
      if(c.starv>=ECON.ruinLimit){                                   // chronic famine: abandon a structure
        if(c.pop < housingCap(c)*0.5) ruinHouse(c); else ruinOne(c); // depopulated -> empty homes; else a workplace
        c.starv=Math.floor(ECON.ruinLimit*0.6); } }
    // autonomous growth: each town periodically invests in the building it needs (staggered)
    if((world._tickN+ci)%ECON.buildEvery===0) tryBuild(world,c);
    // a prosperous market town funds a new caravan (spawnMerchant deducts the capital from its treasury)
    if(world.spawnMerchant && (world._tickN+ci)%ECON.caravanEvery===0
       && (c.gold||0)>ECON.caravanGold && has(c,'market')
       && world.merchants.length < ECON.fleetPerTown*world.cities.length){
      world.spawnMerchant(ci); } }
  if(world.reap) world.reap();                                       // remove bankrupt caravans
  return true;
}
// per-tick gross output of a town (resource -> rate), for the info panel (working buildings only).
function cityOutputs(c){ const o={}; for(const b of c.builds){ if(b.ruined)continue;
  const r=recipesOf(b.id)[0]; if(r){ const[or_,oq]=r.out; o[or_]=(o[or_]||0)+oq;
    if(r.out2)o[r.out2[0]]=(o[r.out2[0]]||0)+r.out2[1]; } } return o; }

// ============================================================
//  SELF-CHECKS — make drift/bugs scream AT THE SOURCE instead of 10 edits later.
//  Convention (helpers) gets bypassed; enforcement doesn't. RESOURCES is the one
//  list every good must be in; validateConfig() runs at boot, devCheck() each tick.
// ============================================================
const RESOURCES=new Set(['zboże','ryby','mięso','sól','jedzenie','drewno','kamień','ruda','metal','deski','futra','skóry','towary','złoto']);
let DEV=true;
function validateConfig(){ const e=[];
  for(const id in PROD){ for(const r of recipesOf(id)){
      for(const x of r.in) if(!RESOURCES.has(x[0])) e.push(`${id}: nieznane wejście "${x[0]}"`);
      for(const o of [r.out,r.out2]) if(o&&!RESOURCES.has(o[0])) e.push(`${id}: nieznane wyjście "${o[0]}"`); }
    if(!(id in STORE)) e.push(`${id}: brak wpisu STORE`); }
  for(const o of BUILDABLE) if(!BUILD_COST[o.id]) e.push(`${o.id}: brak BUILD_COST`);
  if(typeof ICON_URL!=='undefined') for(const r of RESOURCES) if(r!=='złoto'&&!ICON_URL[r]) e.push(`brak ikony: ${r}`);
  if(e.length){ console.error('CONFIG DRIFT:',e); if(DEV) throw new Error('Niespójna konfiguracja: '+e[0]); }
  return e; }
// runtime invariants (cheap; once per economy tick in dev). Throws with context on the first breach.
function devCheck(world){ if(!DEV||!world)return;
  for(const m of world.merchants){ if(m.dead)continue;
    if(!m.segs||m.si>=m.segs.length) throw new Error(`karawana #${m.id}: si=${m.si} poza segs(${m.segs?m.segs.length:'brak'})`);
    if(!Number.isFinite(m.gold)) throw new Error(`karawana #${m.id}: gold=${m.gold}`); }
  for(const c of world.cities){ if(!Number.isFinite(c.gold)) throw new Error(`${c.name}: gold=${c.gold}`);
    for(const u of storesOf(c)) for(const r in u.stock){
      if(!RESOURCES.has(r)) throw new Error(`${c.name}: nieznany towar "${r}"`);
      if(u.stock[r]<-1e-6) throw new Error(`${c.name}: ujemny ${r}=${u.stock[r]}`); } } }
