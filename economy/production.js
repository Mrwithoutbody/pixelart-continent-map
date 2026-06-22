// ECONOMY / PRODUCTION — recipes (raw producers + refiners), build costs, and the economy tick.
// Needs BLD / ECON_SPR / SPR (config + sprites).

// ---- tunables (mutable so the balance sim can sweep them) ----
// Balance picked by simulation sweep (sim/balance-sweep): self-correcting, no collapse, lively.
// Towns settle at their food ceiling (Malthusian) -> food/salt trade always matters; pop ~0.83 of
// start, 0 town collapses over 2500 ticks across seeds.
const ECON={
  foodPerCap:0.0018,     // food eaten per head per tick (main "how fed" lever)
  gruel:true,            // bakery may run a low-yield unsalted fallback (salt = efficiency, not a death gate)
  popGrow:0.006,         // pop growth/tick when fed (toward housing capacity)
  popShrink:0.003,       // pop loss/tick when starving — need falls with pop -> negative feedback, no death spiral
  popFloor:25,
  ruinLimit:200,         // ticks of sustained famine before a building is abandoned (long + recoverable)
  cargoCap:24, tradeVal:6, foodReserve:10,  // caravan: load size, gold/price scale, ticks of food kept home
  buildEvery:40, buildReserve:50,           // autonomous town growth: try a build every N ticks if treasury > reserve
};

// recipe per building: out:[res,rate] always; in:[res,rate] for refiners that consume a raw input.
const PROD={
  farm:{out:['zboże',3]},          lumber_camp:{out:['drewno',2]},
  sawmill:{in:['drewno',2],out:['deski',1]},
  mine:{out:['ruda',1]},           smelter:{in:['ruda',2],out:['metal',1]},
  quarry:{out:['kamień',1]},       fishery:{out:['ryby',2]},
  salt_works:{out:['sól',6]},      harbor:{out:['towary',1]},
  hunter:{out:['mięso',2]},        // forest food source (gives forest towns a food base)
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
  if(p.out)return [{in:p.in?[p.in]:[], out:p.out}];
  return []; }
// build cost (paid from the town's stockpile). Raw extractors are cheap; refiners + civic cost more.
const BUILD_COST={
  farm:{drewno:6},                 lumber_camp:{drewno:3},
  mine:{drewno:8,'kamień':5},        quarry:{drewno:6},
  fishery:{drewno:8},              salt_works:{drewno:6,'kamień':4},
  hunter:{drewno:6},
  piekarnia:{drewno:10,'kamień':6},  sawmill:{drewno:12},
  smelter:{drewno:8,'kamień':14},    market:{drewno:10,'kamień':10,'złoto':10},
  warehouse:{drewno:8},            tower:{drewno:12,'kamień':24},
};
const BUILDABLE=['farm','piekarnia','hunter','lumber_camp','mine','quarry','fishery','salt_works','sawmill','smelter','market','warehouse','tower']
  .map(id=>({id, name:(BLD[id]||{name:id}).name, cost:BUILD_COST[id]||{}}));

const ECON_TICK=1.0;   // seconds of game time per economy tick

function makeBuild(id,x,y){ return {x,y,id,name:(BLD[id]||{name:id}).name, spr:SPR[ECON_SPR[id]]||SPR.workshop, stock:{}}; }

const costStr=id=>{ const c=BUILD_COST[id]||{},k=Object.keys(c); return k.length?k.map(r=>`${c[r]} ${r}`).join(' · '):'darmo'; };

// ---- PER-BUILDING WAREHOUSES: every building (and dwelling) stores its OWN goods up to its own cap.
// The town's stockpile is the sum of these. 'złoto' is the town treasury (c.gold), not a warehoused good.
const STORE={ warehouse:160, market:60, harbor:60,                      // dedicated / civic stores
  farm:25, lumber_camp:25, mine:25, quarry:25, fishery:25, salt_works:25, hunter:25,   // raw extractors: own buffer
  mill:30, sawmill:30, smelter:30, piekarnia:30,                            // refiners: slightly bigger
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
  for(const h of (c.houses||[])){ h.stock||(h.stock={}); a.push(h); }
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

// ---- PRICES: every building quotes its own price from its own stock (pure exchange) ----
function consumesRes(b,res){ return recipesOf(b.id).some(r=>r.in.some(x=>x[0]===res)); }
function priceB(b,res){ const have=(b.stock&&b.stock[res])||0; let dem=consumesRes(b,res)?4:1; if(res===FOOD)dem+=1;
  return dem/(1+have*0.12); }                                            // scarce + wanted = dear
// the town's going price for a good = the keenest buyer's bid (the building that wants it most sets it)
function townPrice(c,res){ let p=0.25; for(const b of (c.builds||[])) if(!b.ruined){ const q=priceB(b,res); if(q>p)p=q; } return p; }

// ---- build affordability (goods come from warehouses, 'złoto' from the treasury) ----
function affordHave(c,r){ return r==='złoto'?(c.gold||0):townHas(c,r); }
function canAfford(c,id){ const cost=BUILD_COST[id]||{}; for(const r in cost) if(affordHave(c,r)<cost[r])return false; return true; }
function payCost(c,id){ const cost=BUILD_COST[id]||{}; for(const r in cost){ if(r==='złoto')c.gold=(c.gold||0)-cost[r]; else townTake(c,r,cost[r]); } }
function missingFor(c,id){ const cost=BUILD_COST[id]||{},m=[]; for(const r in cost){ const have=affordHave(c,r); if(have<cost[r])m.push(`${Math.ceil(cost[r]-have)} ${r}`); } return m; }

// ---- people & food: towns eat ONLY 'jedzenie'; population grows fed / shrinks starved ----
const FOOD='jedzenie';
const HOUSE_POP={manor:240,townhouse:90,house:45,shack:16};                 // people a dwelling can house
const FOOD_INPUTS=new Set();                                                // bakery inputs (filled below)
recipesOf('piekarnia').forEach(r=>r.in.forEach(x=>FOOD_INPUTS.add(x[0])));  // {zboże,sól,ryby}
const isFood=b=>recipesOf(b.id).some(r=>r.out[0]===FOOD);                   // a bakery
const feedsTown=b=>{ if(isFood(b))return true; const r0=(PROD[b.id]&&PROD[b.id].out); return !!r0&&FOOD_INPUTS.has(r0[0]); }; // bakery OR its supplier (grain/fish/salt)
function housingCap(c){ let n=0; for(const h of (c.houses||[])) n+=HOUSE_POP[h.btype]||20; return n; }
function cityFood(c){ let n=0; for(const b of (c.builds||[])){ if(b.ruined)continue;
  for(const r of recipesOf(b.id)) if(r.out[0]===FOOD){ n+=r.out[1]; break; } } return n; }
function cityNeed(c){ return (c.pop||0)*ECON.foodPerCap; }
function feedCity(c){ const need=cityNeed(c), got=townTake(c,FOOD,need); return got>=need-1e-4; }
// abandon one building when famine is chronic: spare the food chain, hand its goods to the rest of town
function ruinOne(c){ const live=(c.builds||[]).filter(b=>!b.ruined); if(!live.length)return;
  const t=live.find(b=>!feedsTown(b))||live.find(b=>!isFood(b))||live[0];
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
  if((c.starv||0)===0 && (c.pop||0) >= housingCap(c)*0.85) return '__house';
  // 3) VALUE-ADD: a raw piling up with no refiner the land can support
  if(k.F>14 && townHas(c,'drewno')>40 && !has(c,'sawmill')) return 'sawmill';
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
  if(id==='__house'){ if((c.gold||0)<ECON.buildReserve+20)return; const s=freeSpotNear(world,c); if(!s)return;
    c.houses.push({x:s.x,y:s.y,btype:'house',spr:SPR.house,stock:{},owner:{k:'rod',id:c.f}}); c.gold-=20; invalidateStores(); return; }
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
        const stored=townGive(c,or_,Math.min(oq,space),b); used+=stored; break; } }                      // one recipe per tick
    // everyone eats; fed -> population grows toward housing, starved -> it shrinks (need falls with it)
    if(feedCity(c)){ c.starv=Math.max(0,(c.starv||0)-2);
      const hc=housingCap(c); if(c.pop<hc) c.pop=Math.min(hc, (c.pop||0)*(1+ECON.popGrow)+0.2); }
    else { c.starv=(c.starv||0)+1; c.pop=Math.max(ECON.popFloor,(c.pop||0)*(1-ECON.popShrink));
      if(c.starv>=ECON.ruinLimit){ ruinOne(c); c.starv=Math.floor(ECON.ruinLimit*0.6); } }
    // autonomous growth: each town periodically invests in the building it needs (staggered)
    if((world._tickN+ci)%ECON.buildEvery===0) tryBuild(world,c); }
  return true;
}
// per-tick gross output of a town (resource -> rate), for the info panel (working buildings only).
function cityOutputs(c){ const o={}; for(const b of c.builds){ if(b.ruined)continue;
  const r=recipesOf(b.id)[0]; if(r){ const[or_,oq]=r.out; o[or_]=(o[or_]||0)+oq; } } return o; }
