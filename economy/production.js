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

// accumulate production once per ECON_TICK; refiners consume their input first. Returns true on a tick.
function tickEconomy(world,dt){
  if(!world)return false;
  world._acc=(world._acc||0)+dt; if(world._acc<ECON_TICK)return false; world._acc-=ECON_TICK;
  for(const c of world.cities){ const st=c.stock||(c.stock={});
    for(const b of c.builds){ const p=PROD[b.id]; if(!p||!p.out)continue;
      if(p.in){ const[ir,iq]=p.in; if((st[ir]||0)<iq)continue; st[ir]-=iq; }   // refine only when fed
      const[or_,oq]=p.out; st[or_]=(st[or_]||0)+oq; } }
  return true;
}
// per-tick gross output of a town (resource -> rate), for the info panel.
function cityOutputs(c){ const o={}; for(const b of c.builds){ const p=PROD[b.id]; if(p&&p.out) o[p.out[0]]=(o[p.out[0]]||0)+p.out[1]; } return o; }
