// POPULATION — demography for a town. One net headcount, but with real births AND deaths:
//   births  = pop·birth        (only when fed — no food, no babies)
//   deaths  = pop·death        (ALWAYS — baseline mortality, so even a fed town has turnover)
//           + pop·starveDeath  (extra, when starving)
//           + excess·crowdDeath (extra, when pop is over the town's housing — squalor/emigration)
// Housing is therefore a SOFT ceiling: births can push pop above it, and overcrowding mortality
// pulls it back. Food is the other ceiling (starvation). Both are emergent, not hard clamps.

const HOUSE_POP={manor:240,townhouse:90,house:45,shack:16};   // people a dwelling can house
const POP={ birth:0.012, death:0.004, starveDeath:0.006, crowdDeath:0.04, emigrate:0.02, floor:25 };

function housingCap(c){ let n=0; for(const h of (c.houses||[])) if(!h.ruined) n+=HOUSE_POP[h.btype]||20; return n; }
function jobless(c){ return Math.max(0,(c.pop||0)-cityJobs(c)); }   // people with no work

// advance one town's population by one tick. `fed` = was the population fully fed this tick.
function stepPopulation(c, fed){
  const pop=c.pop||0, cap=housingCap(c);
  let deaths=pop*POP.death;                                  // baseline mortality, always
  if(!fed)        deaths+=pop*POP.starveDeath;               // famine
  if(pop>cap)     deaths+=(pop-cap)*POP.crowdDeath;          // overcrowding (more people than homes)
  deaths += jobless(c)*POP.emigrate;                         // the unemployed leave for work elsewhere
  const births = fed ? pop*POP.birth : 0;                    // reproduction needs food
  c.pop=Math.max(POP.floor, pop+births-deaths);
}
