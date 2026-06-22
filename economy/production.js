// ECONOMY / PRODUCTION — recipes (raw producers + refiners), build costs, and the economy tick.
// Needs BLD / ECON_SPR / SPR (config + sprites).

// recipe per building: out:[res,rate] always; in:[res,rate] for refiners that consume a raw input.
// chain example: mine -> ruda (raw) ; smelter in:ruda -> out:metal ; only refines when ore is in stock.
const PROD={
  farm:{out:['zboże',3]},          lumber_camp:{out:['drewno',2]},
  sawmill:{in:['drewno',2],out:['deski',1]},
  mine:{out:['ruda',1]},           smelter:{in:['ruda',2],out:['metal',1]},
  quarry:{out:['kamień',1]},       fishery:{out:['ryby',2]},
  salt_works:{out:['sól',6]},      harbor:{out:['towary',1]},
  market:{out:['złoto',2]},        warehouse:{}, chapel:{}, tower:{},
  // bakery: turns grain+salt (3:1) OR fish+salt (1:2) into the one edible good. First recipe with stock wins.
  piekarnia:{recipes:[ {in:[['zboże',3],['sól',1]], out:['jedzenie',3]},
                       {in:[['ryby',1],['sól',2]],  out:['jedzenie',3]} ]},
};
// normalise any building to a list of recipes [{in:[[res,q],...], out:[res,q]}]
function recipesOf(id){ const p=PROD[id]; if(!p)return[];
  if(p.recipes)return p.recipes;
  if(p.out)return [{in:p.in?[p.in]:[], out:p.out}];
  return []; }
// build cost (paid from the town's stockpile). Raw extractors are cheap; refiners + civic cost more.
const BUILD_COST={
  farm:{drewno:6},                 lumber_camp:{drewno:3},
  mine:{drewno:8,'kamień':5},        quarry:{drewno:6},
  fishery:{drewno:8},              salt_works:{drewno:6,'kamień':4},
  piekarnia:{drewno:10,'kamień':6},  sawmill:{drewno:12},
  smelter:{drewno:8,'kamień':14},    market:{drewno:10,'kamień':10,'złoto':10},
  warehouse:{drewno:8},            tower:{drewno:12,'kamień':24},
};
const BUILDABLE=['farm','piekarnia','lumber_camp','mine','quarry','fishery','salt_works','sawmill','smelter','market','warehouse','tower']
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
  mill:30, sawmill:30, smelter:30, piekarnia:30,                            // refiners: slightly bigger
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
// gold is money, not a stored good -> it doesn't take warehouse space
function cityUsed(c){ let s=0; const st=c.stock||{}; for(const r in st) if(r!=='złoto'&&st[r]>0) s+=st[r]; return s; }

// ---- people & food: towns eat ONLY 'jedzenie' (baked from grain/fish + salt) ----
const FOOD='jedzenie';
const FOOD_PER_CAP=0.0025;                           // mouths to feed per head per tick
const STARVE_LIMIT=30;                               // famine ticks before a building is abandoned (time to fix it)
const isFood=b=>recipesOf(b.id).some(r=>r.out[0]===FOOD);   // a bakery (priority to keep running)
// gross 'jedzenie' a town can bake per tick if fed (working bakeries only)
function cityFood(c){ let n=0; for(const b of (c.builds||[])){ if(b.ruined)continue;
  for(const r of recipesOf(b.id)) if(r.out[0]===FOOD){ n+=r.out[1]; break; } } return n; }
function cityNeed(c){ return (c.pop||0)*FOOD_PER_CAP; }
// eat 'jedzenie' from the stockpile; returns true if the population was fully fed
function feedCity(c){ const st=c.stock||{}, need=cityNeed(c), have=st[FOOD]||0, eat=Math.min(need,have);
  if(eat>0)st[FOOD]=have-eat; return eat>=need-1e-4; }
// abandon one working building — a non-bakery first, so the town can still feed itself a while
function ruinOne(c){ const live=(c.builds||[]).filter(b=>!b.ruined); if(!live.length)return;
  const t=live.find(b=>!isFood(b))||live[0]; t.ruined=true; }

// accumulate production once per ECON_TICK; each building runs the first recipe it can afford.
function tickEconomy(world,dt){
  if(!world)return false;
  world._acc=(world._acc||0)+dt; if(world._acc<ECON_TICK)return false; world._acc-=ECON_TICK;
  for(const c of world.cities){ const st=c.stock||(c.stock={});
    const cap=cityCap(c); let used=cityUsed(c);
    for(const b of c.builds){ if(b.ruined)continue;
      for(const rec of recipesOf(b.id)){
        let ok=true; for(const[ir,iq]of rec.in){ if((st[ir]||0)<iq){ok=false;break;} }   // all inputs in stock?
        if(!ok)continue;
        const[or_,oq]=rec.out, space=cap-used; if(space<=0)break;                          // full -> output spoils
        for(const[ir,iq]of rec.in){ st[ir]-=iq; used-=iq; }                                // consume (frees space)
        const add=Math.min(oq,space); st[or_]=(st[or_]||0)+add; used+=add; break; } }      // one recipe per tick
    // everyone eats; sustained shortage thins the population and abandons a building
    if(feedCity(c)) c.starv=Math.max(0,(c.starv||0)-1);
    else { c.starv=(c.starv||0)+1; c.pop=Math.max(40,Math.round((c.pop||0)*0.997));
      if(c.starv>=STARVE_LIMIT){ ruinOne(c); c.starv=Math.floor(STARVE_LIMIT/2); } } }
  return true;
}
// per-tick gross output of a town (resource -> rate), for the info panel (working buildings only).
function cityOutputs(c){ const o={}; for(const b of c.builds){ if(b.ruined)continue;
  const r=recipesOf(b.id)[0]; if(r){ const[or_,oq]=r.out; o[or_]=(o[or_]||0)+oq; } } return o; }
