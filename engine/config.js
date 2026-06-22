// CONFIG — world dimensions, palettes, factions, biomes, economy tables, tunables.
const W = 1620, H = 1120;                // world size in tiles (extra room is open sea, esp. top/bottom)
const SEA_MARGIN = 130;                  // forced ocean band along the top & bottom edges

// ---------- tunables ----------
const MAX_BRIDGE=7;                          // widest water span (tiles) a road bridge may cross
const MIN_CITY_DIST=64;                      // smallest allowed gap between any two towns (tiles)

// ---------- biomes + terrain coefficients ----------
const BIOME={DEEP:0,SHALLOW:1,BEACH:2,DESERT:3,GRASS:4,FOREST:5,HILLS:6,MOUNTAIN:7};
const COST =[Infinity,Infinity,1.3,1.5,1.0,2.2,2.8,Infinity]; // move-cost per biome; Inf = impassable
const PASSABLE=COST.map(c=>isFinite(c));

// ---------- palette ----------
const PAL={
  deep:'#5e7d86', shallow:'#80a0a6', foam:'#b6cfd0',
  beach:'#dcd0a8', beachDk:'#c9bb8d',
  desert:'#d8c79a', desertDk:'#c6b384',
  grass:['#8a9a5c','#94a566','#9fb072','#7c8c4e'], grassDk:'#6f8048', // muted sage
  forest:'#5f7438', forestDk:'#516229',
  hill:'#9a9266', hillDk:'#85794f',
  rock:'#b8a784', rockDk:'#a8966f', snow:'#e7ecec',                  // warm tan massif (matches mountains)
  road:'#2c2c24',
  label:'#efe7cf', labelEdge:'#33302a', text:'#2a2620',
};
// factions: house-sheet color key, territory tint, border color
// flag = small faction accent on the house (roof + walls stay neutral)
const FACTIONS=[
  {name:'Verdal',  key:'Lime',   tint:[120,170,70],  border:'#33571c', flag:'#5fbf3f'},
  {name:'Sarrok',  key:'Wood',   tint:[170,130,80],  border:'#6a4a1e', flag:'#e08a2a'},
  {name:'Tealune', key:'Cyan',   tint:[70,150,160],  border:'#1c565e', flag:'#2ec6c6'},
  {name:'Crimhold',key:'Red',    tint:[180,80,80],   border:'#7a2424', flag:'#d83030'},
  {name:'Marenth', key:'Purple', tint:[140,90,170],  border:'#48296a', flag:'#a84fd0'},
];

// economy buildings (subset of ECONOMY.md) placed in/around a town based on nearby biomes
const BLD={
  farm:{name:'Farma'}, lumber_camp:{name:'Obóz drwali'}, mine:{name:'Kopalnia'},
  quarry:{name:'Kamieniołom'}, fishery:{name:'Przystań'}, salt_works:{name:'Warzelnia'},
  mill:{name:'Młyn'}, piekarnia:{name:'Piekarnia'}, sawmill:{name:'Tartak'}, smelter:{name:'Huta'},
  warehouse:{name:'Magazyn'}, market:{name:'Targ'}, harbor:{name:'Port'},
  chapel:{name:'Kaplica'}, tower:{name:'Wieża'},
};
const ECON_SPR={mill:'windmill', piekarnia:'market', market:'market', chapel:'chapel', tower:'tower'}; // id -> distinctive sprite (else workshop)
