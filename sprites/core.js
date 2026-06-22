// ============================================================
//  SPRITES / CORE  — shared rasteriser + atlas assembly.
//  Loads FIRST. Exposes: OUTL, pxSprite(), bake(), SPR, buildSprites().
//  Sprite DATA lives in the per-system files (buildings / terrain / units),
//  declared as plain const grids. This file only turns them into canvases.
//  Classic scripts share global scope — load order: core → systems → map.js.
// ============================================================
const OUTL='#20281f';                                   // shared black-ish outline

// build a sprite from a char-grid + palette map. '.' = transparent. Anchor = bottom-center.
function pxSprite(rows,pal,oyBottom=true){
  const w=rows[0].length,h=rows.length;
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  for(let r=0;r<h;r++)for(let col=0;col<w;col++){const p=pal[rows[r][col]]; if(p){x.fillStyle=p;x.fillRect(col,r,1,1);}}
  return {img:c,sx:0,sy:0,sw:w,sh:h,ox:w>>1,oy:oyBottom?h-1:h>>1};
}

// bake a const sprite-def {rows,pal,oyBottom?} into a canvas sprite.
function bake(d){ return pxSprite(d.rows,d.pal,d.oyBottom!==false); }

// built sprite atlas — same shape map.js expects.
const SPR={house:null,cottage:null,townhouse:null,manor:null,hut:null,workshop:null,
  chapel:null,tower:null,windmill:null,market:null,
  trees:[],bushes:[],hills:[],rocks:[],mountains:[],fields:[],cart:null,ship:null};

// assemble atlas from the three system registries (loaded after this file).
function buildSprites(){
  // --- buildings (single sprites) ---
  for(const k of ['house','cottage','townhouse','manor','hut','workshop','chapel','tower','windmill','market'])
    SPR[k]=bake(BUILDING_SPRITES[k]);
  // --- terrain (mix of const grids + procedural generators) ---
  SPR.trees    =[bake(VEG_SPRITES.tree), pineSprite(), bake(VEG_SPRITES.smallTree)];
  SPR.bushes   =[bake(VEG_SPRITES.bush), bake(VEG_SPRITES.bushSmall)];
  SPR.rocks    =[bake(ROCK_SPRITES.rockA), bake(ROCK_SPRITES.rockB)];
  SPR.fields   =[bake(FIELD_SPRITES.green), bake(FIELD_SPRITES.wheat)];
  SPR.hills    =[makeHill(13), makeHill(17)];
  SPR.mountains=[makeMountain(16), makeMountain(20), makeMountain(26)];
  // --- units + icons ---
  SPR.cart=bake(UNIT_SPRITES.cart); SPR.ship=bake(UNIT_SPRITES.ship); SPR.anchor=bake(UNIT_SPRITES.anchor);
  if(typeof bakeIcons==='function') bakeIcons();   // resource icons (Colonization-style)
}
