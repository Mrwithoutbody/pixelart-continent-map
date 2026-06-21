// ============================================================
//  SPRITES  — hand-drawn pixel sprites, styled to the example screenshots.
//  Shared globals: SPR (built sprite atlas), OUTL, buildSprites().
//  Loaded before map.js (classic scripts share global scope).
// ============================================================
const SPR={house:null,hut:null,workshop:null,trees:[],bushes:[],hills:[],rocks:[],mountains:[],cart:null,ship:null,shadow:null};
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
// economy building (workshop): slate roof + chimney, distinct from warm residential roofs
function workshopSprite(){
  return pxSprite([
    "..K......",
    "..K......",
    "..KKKKK..",
    ".KAAAAAK.",
    ".KCCCCCK.",
    ".KKKKKKK.",
    ".KHHHHHK.",
    ".KHHEHHK.",
    ".KKKKKKK.",
  ],{K:OUTL,A:'#62737d',C:'#42515a',H:'#9a948a',E:'#3a230f'});
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
// wzgórze = low, broad, asymmetric earthy knoll. flat-ish, contour line, dirt base, cast shadow.
function makeHill(w){
  const h=Math.round(w*0.46), H=h+1;                       // low profile + shadow row
  const c=document.createElement('canvas');c.width=w;c.height=H;const x=c.getContext('2d');
  const put=(X,Y,v)=>{x.fillStyle=v;x.fillRect(X,Y,1,1);};
  const L='#9d9a62',M='#7c7a45',D='#5f5d33',DIRT='#6b5736',OUT='#2c3320',SH='#000000';
  const px=Math.round(w*0.42), kL=h/px, kR=h/(w-1-px);     // asymmetric slopes
  for(let X=0;X<w;X++){
    const top=Math.round(X<px?(px-X)*kL:(X-px)*kR);
    if(top>h-1) continue;
    for(let Y=top;Y<h;Y++){
      let v;
      if(Y===top) v=OUT;                                   // silhouette
      else if(Y===h-1) v=DIRT;                             // dirt foot
      else if(Math.abs(Y-(top+Math.round((h-top)*0.55)))<1 && X>px-2 && X<w-2) v=D; // contour line
      else v = X>px ? M : L;                               // light left / mid right
      if(Y<top+2 && X>=px-1 && X<=px+1) v=L;               // small top highlight
      put(X,Y,v);
    }
  }
  for(let X=2;X<w-1;X++) put(X,H-1,SH);                    // soft ground shadow
  return {img:c,sx:0,sy:0,sw:w,sh:H,ox:px,oy:h-1};
}

// mountain = asymmetric twin-ridge rocky peak. lit/shadow faces, crest, crevices, base shadow.
function makeMountain(w){
  const h=Math.round(w*0.95);
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  const put=(X,Y,v)=>{x.fillStyle=v;x.fillRect(X,Y,1,1);};
  // warm tan/brown rock (cartographer look), clean ink outline, no noisy specks
  const L='#c7b594',M='#a4906c',D='#6f5a3f',HI='#e2d6bd',OUT='#392c1f',SH='#4a3b29';
  const p1={x:Math.round(w*0.42),y:0,k:1.85}, p2={x:Math.round(w*0.68),y:Math.round(h*0.36),k:2.0};
  const line=(p,X)=>p.y+Math.abs(X-p.x)*p.k;
  for(let X=0;X<w;X++){
    const a=line(p1,X), b=line(p2,X), ctrl=a<=b?p1:p2, top=Math.round(Math.min(a,b));
    if(top>h-1) continue;
    for(let Y=top;Y<h;Y++){
      let v;
      if(Y===top) v=OUT;
      else if(Y>=h-1) v=SH;                                          // base shadow
      else if(Math.abs(X-ctrl.x)<=1 && Y<top+Math.round(h*0.5)) v=M; // crest band
      else v = X>ctrl.x ? D : L;                                     // shadow right / lit left
      if(ctrl===p1 && Y<top+2 && Math.abs(X-p1.x)<=1) v=HI;          // apex highlight
      put(X,Y,v);
    }
  }
  return {img:c,sx:0,sy:0,sw:w,sh:h,ox:p1.x,oy:h-1};
}

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

// ---- transport units ----
function cartSprite(){
  return pxSprite([".KKKKK.","KCCCCCK","KCYYYCK","KcccccK",".KKKKK.",".K...K."],
    {K:OUTL,C:'#c8842f',c:'#9c6318',Y:'#d8c38a'});
}
function shipSprite(){     // small sailboat (sea leg of a caravan)
  return pxSprite([
    "...K.....",
    "...KW....",
    "...KWW...",
    "...KWWW..",
    "...K.....",
    ".HHHHHHH.",
    "KhhhhhhhK",
    ".KhhhhK..",
    "..KKKK...",
  ],{K:OUTL,W:'#e8e2d0',H:'#7a5230',h:'#5e3f22'});
}

function buildSprites(){
  SPR.house=houseSprite(); SPR.hut=hutSprite(); SPR.workshop=workshopSprite();
  SPR.trees=[treeSprite(),pineSprite(),smallTreeSprite()];   // 2 species + sparse
  SPR.bushes=[bushSprite(),bushSpriteSmall()];
  SPR.hills=[makeHill(13),makeHill(17)];
  SPR.rocks=[rockSpriteA(),rockSpriteB()];
  SPR.mountains=[makeMountain(16),makeMountain(20),makeMountain(26)];
  SPR.cart=cartSprite(); SPR.ship=shipSprite();
}
