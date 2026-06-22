// ECONOMY / PRODUCTION — what each building makes, what the player may build, and the tick that
// accumulates output into each town's stockpile. Needs BLD / ECON_SPR / SPR (config + sprites).

// per-building-type output: a resource + units added each economy tick (null = non-producing).
const PROD={
  farm:{res:'zboże',rate:2},        mill:{res:'mąka',rate:2},
  lumber_camp:{res:'drewno',rate:2}, sawmill:{res:'deski',rate:1},
  mine:{res:'ruda',rate:1},          smelter:{res:'metal',rate:1},
  quarry:{res:'kamień',rate:1},      fishery:{res:'ryby',rate:1},
  salt_works:{res:'sól',rate:1},     harbor:{res:'towary',rate:1},
  market:{res:'złoto',rate:2},       warehouse:{res:null,rate:0},
  chapel:{res:null,rate:0},          tower:{res:null,rate:0},
};
// what the player can construct from the build menu.
const BUILDABLE=['farm','lumber_camp','mine','quarry','fishery','salt_works','mill','sawmill','smelter','market','warehouse','tower']
  .map(id=>({id, name:(BLD[id]||{name:id}).name}));

const ECON_TICK=1.0;   // seconds of game time per economy tick

// build a new economy-building entity at (x,y); sprite from ECON_SPR, else the generic workshop.
function makeBuild(id,x,y){ return {x,y,id,name:(BLD[id]||{name:id}).name, spr:SPR[ECON_SPR[id]]||SPR.workshop}; }

// accumulate production into every town's stock once per ECON_TICK. Returns true on a tick.
function tickEconomy(world,dt){
  if(!world)return false;
  world._acc=(world._acc||0)+dt; if(world._acc<ECON_TICK)return false; world._acc-=ECON_TICK;
  for(const c of world.cities){ if(!c.stock)c.stock={};
    for(const b of c.builds){ const p=PROD[b.id]; if(p&&p.res) c.stock[p.res]=(c.stock[p.res]||0)+p.rate; } }
  return true;
}
// per-tick output summary of a town (resource -> rate), for the info panel.
function cityOutputs(c){ const o={}; for(const b of c.builds){ const p=PROD[b.id]; if(p&&p.res) o[p.res]=(o[p.res]||0)+p.rate; } return o; }
