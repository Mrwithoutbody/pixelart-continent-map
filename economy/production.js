// ECONOMY / PRODUCTION — recipes (raw producers + refiners), build costs, and the economy tick.
// Needs BLD / ECON_SPR / SPR (config + sprites).

// recipe per building: out:[res,rate] always; in:[res,rate] for refiners that consume a raw input.
// chain example: mine -> ruda (raw) ; smelter in:ruda -> out:metal ; only refines when ore is in stock.
const PROD={
  farm:{out:['zboże',2]},          mill:{in:['zboże',2],out:['mąka',2]},
  lumber_camp:{out:['drewno',2]},  sawmill:{in:['drewno',2],out:['deski',1]},
  mine:{out:['ruda',1]},           smelter:{in:['ruda',2],out:['metal',1]},
  quarry:{out:['kamień',1]},       fishery:{out:['ryby',1]},
  salt_works:{out:['sól',1]},      harbor:{out:['towary',1]},
  market:{out:['złoto',2]},        warehouse:{}, chapel:{}, tower:{},
};
// build cost (paid from the town's stockpile). Raw extractors are cheap; refiners + civic cost more.
const BUILD_COST={
  farm:{drewno:6},                 lumber_camp:{drewno:3},
  mine:{drewno:8,'kamień':5},        quarry:{drewno:6},
  fishery:{drewno:8},              salt_works:{drewno:6,'kamień':4},
  mill:{drewno:8,'kamień':6},        sawmill:{drewno:12},
  smelter:{drewno:8,'kamień':14},    market:{drewno:10,'kamień':10,'złoto':10},
  warehouse:{drewno:8},            tower:{drewno:12,'kamień':24},
};
const BUILDABLE=['farm','lumber_camp','mine','quarry','fishery','salt_works','mill','sawmill','smelter','market','warehouse','tower']
  .map(id=>({id, name:(BLD[id]||{name:id}).name, cost:BUILD_COST[id]||{}}));

const ECON_TICK=1.0;   // seconds of game time per economy tick

function makeBuild(id,x,y){ return {x,y,id,name:(BLD[id]||{name:id}).name, spr:SPR[ECON_SPR[id]]||SPR.workshop}; }

const costStr=id=>{ const c=BUILD_COST[id]||{},k=Object.keys(c); return k.length?k.map(r=>`${c[r]} ${r}`).join(' · '):'darmo'; };
function canAfford(city,id){ const c=BUILD_COST[id]||{}; for(const r in c) if(((city.stock||{})[r]||0)<c[r]) return false; return true; }
function payCost(city,id){ const c=BUILD_COST[id]||{}; for(const r in c) city.stock[r]-=c[r]; }
function missingFor(city,id){ const c=BUILD_COST[id]||{},m=[]; for(const r in c){ const have=(city.stock||{})[r]||0; if(have<c[r]) m.push(`${Math.ceil(c[r]-have)} ${r}`); } return m; }

// ---- storage capacity: a town owns NOTHING on its own; every building carries its own
// storage and the town's capacity is the sum. No buildings -> nowhere to store -> nothing kept.
const STORE={ warehouse:160, market:60, harbor:60,                      // dedicated / civic stores
  farm:25, lumber_camp:25, mine:25, quarry:25, fishery:25, salt_works:25,   // raw extractors: own buffer
  mill:30, sawmill:30, smelter:30,                                          // refiners: slightly bigger
  tower:10, chapel:10,                                                      // civic: token
  manor:30, townhouse:12, house:6, shack:3 };                              // dwellings: household pantry (besides housing residents)
const STORE_DEFAULT=15;
function buildStore(id){ return STORE[id]??STORE_DEFAULT; }
// a town's capacity = every WORKING structure's store: economy buildings AND dwellings.
// A ruined (abandoned) building stores nothing.
function cityCap(c){ let cap=0;
  for(const b of (c.builds||[])) if(!b.ruined) cap+=buildStore(b.id);
  for(const h of (c.houses||[])) cap+=buildStore(h.btype);
  return cap; }
function cityUsed(c){ let s=0; const st=c.stock||{}; for(const r in st) if(st[r]>0) s+=st[r]; return s; }

// ---- people & food: every town eats; sustained famine empties buildings (they go ruined) ----
const FOOD={ 'zboże':1, 'mąka':2.2, 'ryby':1.6 };   // nutrition per unit
const FOOD_PER_CAP=0.004;                            // mouths to feed per head per tick
const STARVE_LIMIT=12;                               // famine ticks before a building is abandoned
const isFood=b=>{ const p=PROD[b.id]; return p&&p.out&&FOOD[p.out[0]]; };
// gross food nutrition a town makes per tick (working food producers only)
function cityFood(c){ let n=0; for(const b of (c.builds||[])){ if(b.ruined)continue; const p=PROD[b.id];
  if(p&&p.out&&FOOD[p.out[0]]) n+=p.out[1]*FOOD[p.out[0]]; } return n; }
function cityNeed(c){ return (c.pop||0)*FOOD_PER_CAP; }
// eat from the stockpile (richest food first); returns true if the population was fully fed
function feedCity(c){ const st=c.stock||{}; let need=cityNeed(c);
  for(const r of ['mąka','ryby','zboże']){ if(need<=0)break; const have=st[r]||0; if(have<=0)continue;
    const nutr=Math.min(need, have*FOOD[r]); st[r]=have-nutr/FOOD[r]; need-=nutr; }
  return need<=1e-4; }
// abandon one working building — a non-food one first, so the town can still feed itself a while
function ruinOne(c){ const live=(c.builds||[]).filter(b=>!b.ruined); if(!live.length)return;
  const t=live.find(b=>!isFood(b))||live[0]; t.ruined=true; }

// accumulate production once per ECON_TICK; refiners consume their input first. Returns true on a tick.
function tickEconomy(world,dt){
  if(!world)return false;
  world._acc=(world._acc||0)+dt; if(world._acc<ECON_TICK)return false; world._acc-=ECON_TICK;
  for(const c of world.cities){ const st=c.stock||(c.stock={});
    const cap=cityCap(c); let used=cityUsed(c);
    for(const b of c.builds){ if(b.ruined)continue; const p=PROD[b.id]; if(!p||!p.out)continue;
      if(p.in){ const[ir,iq]=p.in; if((st[ir]||0)<iq)continue; st[ir]-=iq; used-=iq; }   // refine only when fed (consuming frees space)
      const[or_,oq]=p.out; const space=cap-used; if(space<=0)continue;                    // warehouse full -> output spoils
      const add=Math.min(oq,space); st[or_]=(st[or_]||0)+add; used+=add; }
    // everyone eats; sustained shortage thins the population and abandons a building
    if(feedCity(c)) c.starv=Math.max(0,(c.starv||0)-1);
    else { c.starv=(c.starv||0)+1; c.pop=Math.max(40,Math.round((c.pop||0)*0.997));
      if(c.starv>=STARVE_LIMIT){ ruinOne(c); c.starv=Math.floor(STARVE_LIMIT/2); } } }
  return true;
}
// per-tick gross output of a town (resource -> rate), for the info panel (working buildings only).
function cityOutputs(c){ const o={}; for(const b of c.builds){ if(b.ruined)continue; const p=PROD[b.id]; if(p&&p.out) o[p.out[0]]=(o[p.out[0]]||0)+p.out[1]; } return o; }
