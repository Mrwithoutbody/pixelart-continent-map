// ============================================================
//  SPRITES  — hand-drawn pixel sprites, styled to the example screenshots.
//  Shared globals: SPR (built sprite atlas), OUTL, buildSprites().
//  Loaded before map.js (classic scripts share global scope).
// ============================================================
const SPR={house:null,hut:null,trees:[],bushes:[],hills:[],rocks:[],mountains:[],cart:null};
const OUTL='#20281f';                                   // shared black-ish outline

// build a sprite from a char-grid + palette map. '.' = transparent. Anchor = bottom-center.
function pxSprite(rows,pal,oyBottom=true){
  const w=rows[0].length,h=rows.length,c=document.createElement('canvas');
  c.width=w;c.height=h;const x=c.getContext('2d');
  for(let r=0;r<h;r++)for(let col=0;col<w;col++){const ch=rows[r][col];const p=pal[ch];
    if(p){x.fillStyle=p;x.fillRect(col,r,1,1);}}
  return {img:c,sx:0,sy:0,sw:w,sh:h,ox:w>>1,oy:oyBottom?h-1:h>>1};
}

// ---- buildings ----
function houseSprite(){              // ~9x8: warm roof, khaki walls, door (faction shown on label)
  return pxSprite([
    "..KKKKK..",
    ".KAAAAAK.",
    ".KCCCCCK.",
    ".KKKKKKK.",
    ".KHHHHHK.",
    ".KHHEHHK.",
    ".KhHEHhK.",
    ".KKKKKKK.",
  ],{K:OUTL,A:'#cf7a4a',C:'#5a1c1c',H:'#bda85a',h:'#9c894a',E:'#3a230f'});
}
function hutSprite(){                // ~6x6: smaller filler house for clusters
  return pxSprite([
    ".KKKK.",
    "KAAAAK",
    "KCCCCK",
    "KHHHHK",
    "KHEEHK",
    "KKKKKK",
  ],{K:OUTL,A:'#cf7a4a',C:'#5a1c1c',H:'#bda85a',E:'#3a230f'});
}

// ---- vegetation ----
function treeSprite(){               // broccoli / deciduous
  return pxSprite([
    "...KKK...",
    "..KGGGK..",
    ".KGGGGGK.",
    "KKGgggGKK",
    "KGgggggGK",
    "KGgggggGK",
    ".KgggggK.",
    "..KgggK..",
    "...KTK...",
    "...KTK...",
    "..KKTKK..",
  ],{K:OUTL,G:'#86a052',g:'#5f7f3a',T:'#6e4a2c'});
}
function pineSprite(){               // conifer / evergreen (2nd species) — soft, not a black spike
  const half=4, fh=Math.round(half*1.7), th=2, h=fh+th, w=2*half+1;
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  const cx=half, L='#6f9243', S='#517632', T='#6e4a2c';
  const put=(col,r,v)=>{x.fillStyle=v;x.fillRect(col,r,1,1);};
  for(let r=0;r<fh;r++){const span=Math.round(r/(fh-1)*half),l=cx-span,rt=cx+span;
    for(let col=l+1;col<rt;col++) put(col,r,col>cx?S:L);    // light left, shadow right
    put(l,r,OUTL);put(rt,r,OUTL);}
  for(let col=cx-half;col<=cx+half;col++) put(col,fh-1,OUTL);
  for(let r=fh;r<h;r++){put(cx,r,T);put(cx-1,r,OUTL);put(cx+1,r,OUTL);}
  return {img:c,sx:0,sy:0,sw:w,sh:h,ox:cx,oy:h-1};
}
function smallTreeSprite(){          // distant / sparse tree
  return pxSprite([".KKK.","KgggK","KgggK",".KTK.","..K.."],{K:OUTL,g:'#5f7f3a',T:'#6e4a2c'});
}
function bushSprite(){               // round shrub, no trunk, brighter green
  return pxSprite([
    "..KKK..",
    ".KGGGK.",
    "KGGgGGK",
    "KGgggGK",
    ".KKKKK.",
  ],{K:OUTL,G:'#8fb24e',g:'#5f8a2e'});
}
function bushSpriteSmall(){
  return pxSprite([".KKK.","KGgGK",".KKK."],{K:OUTL,G:'#8fb24e',g:'#5f8a2e'});
}

// ---- landforms ----
// wzgórze = smooth rounded grassy knoll, 3-tone shaded (light top -> shadow base)
const HILL={K:OUTL,L:'#93b057',M:'#789843',S:'#5c7a33'};
function moundSmall(){return pxSprite([
  "...KKKKK...",
  ".KLLLLLLLK.",
  "KLLMMMMMLLK",
  ".KMSSSSSMK.",
  "..KKKKKKK..",
],HILL);}
function moundBig(){return pxSprite([
  "....KKKKKKK....",
  ".KKLLLLLLLLLKK.",
  "KKLLLLLLLLLLLKK",
  "KLLMMMMMMMMMLLK",
  ".KMMSSSSSSSMMK.",
  "..KKKKKKKKKKK..",
],HILL);}

// small ground pebbles (drawn at the foot of mountains)
function rockSpriteA(){return pxSprite([".KKK.","KLLSK","KKKKK"],{K:OUTL,L:'#a39c90',S:'#7d7668'});}
function rockSpriteB(){return pxSprite([".KK.","KLSK","KKKK"],{K:OUTL,L:'#a39c90',S:'#7d7668'});}

// ink-style pointed peak (example6): sharp apex, dark outline, light left / shaded right, ridge crease
function peakSprite(half){
  const h=Math.round(half*1.9), w=2*half+1, c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  const cx=half, L='#c6bda9', S='#9c9382', R='#867d6f';
  const put=(col,r,v)=>{x.fillStyle=v;x.fillRect(col,r,1,1);};
  for(let r=0;r<h;r++){
    const span=Math.round(r/(h-1)*half), l=cx-span, rt=cx+span;
    for(let col=l+1;col<rt;col++) put(col,r,col>cx?S:L);
    if(r>1 && r<h*0.38) put(cx,r,R);                         // subtle short ridge crease
    put(l,r,OUTL); put(rt,r,OUTL);
  }
  for(let col=0;col<w;col++) put(col,h-1,OUTL);
  return {img:c,sx:0,sy:0,sw:w,sh:h,ox:half,oy:h-1};
}

// ---- merchant ----
function cartSprite(){
  return pxSprite([".KKKKK.","KCCCCCK","KCYYYCK","KcccccK",".KKKKK.",".K...K."],
    {K:OUTL,C:'#c8842f',c:'#9c6318',Y:'#d8c38a'});
}

function buildSprites(){
  SPR.house=houseSprite(); SPR.hut=hutSprite();
  SPR.trees=[treeSprite(),pineSprite(),smallTreeSprite()];   // 2 species + sparse
  SPR.bushes=[bushSprite(),bushSpriteSmall()];
  SPR.hills=[moundSmall(),moundBig()];                       // wide olive mounds
  SPR.rocks=[rockSpriteA(),rockSpriteB()];
  SPR.mountains=[peakSprite(6),peakSprite(8),peakSprite(10)];
  SPR.cart=cartSprite();
}
