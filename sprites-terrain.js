// ============================================================
//  SPRITES / TERRAIN  — vegetation, rocks, landforms.
//  Const grids for the simple stuff; procedural generators for
//  pine / hill / mountain (need size-driven slopes & shading). Needs OUTL.
// ============================================================

// shared palettes (one source of truth per material)
const BUSH_PAL={K:OUTL,G:'#8fb24e',g:'#5f8a2e'};
const ROCK_PAL={K:OUTL,L:'#a39c90',S:'#7d7668'};

// ---- vegetation (const grids) ----
const VEG_SPRITES={
  tree:{pal:{K:OUTL,G:'#86a052',g:'#5f7f3a',T:'#6e4a2c'},rows:[   // broccoli / deciduous
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
  ]},
  smallTree:{pal:{K:OUTL,g:'#5f7f3a',T:'#6e4a2c'},rows:[          // distant / sparse tree
    ".KKK.","KgggK","KgggK",".KTK.","..K..",
  ]},
  bush:{pal:BUSH_PAL,rows:[                                      // round shrub, brighter green
    "..KKK..",
    ".KGGGK.",
    "KGGgGGK",
    "KGgggGK",
    ".KKKKK.",
  ]},
  bushSmall:{pal:BUSH_PAL,rows:[
    ".KKK.","KGgGK",".KKK.",
  ]},
};

// ---- rocks (const grids) — small ground pebbles at foot of mountains ----
const ROCK_SPRITES={
  rockA:{pal:ROCK_PAL,rows:[".KKK.","KLLSK","KKKKK"]},
  rockB:{pal:ROCK_PAL,rows:[".KK.","KLSK","KKKK"]},
};

// ---- crop fields (const grids) — flat ground patches, plowed vertical furrows.
// drawn without a cast shadow (flat ground). soil 'd', crop rows 'C'/'c', edge 'K'.
const FIELD_SPRITES={
  green:{pal:{K:'#3a2a18',d:'#7a5a36',C:'#7fae3e',c:'#6c9a32'},rows:[
    ".KKKKKKKKKKK.",
    "KdCdcdCdcdCK",
    "KdCdcdCdcdCK",
    "KdCdcdCdcdCK",
    "KdCdcdCdcdCK",
    "KdCdcdCdcdCK",
    ".KKKKKKKKKKK.",
  ]},
  wheat:{pal:{K:'#4a3416',d:'#8a6a3c',C:'#d9bb52',c:'#c2a23f'},rows:[
    ".KKKKKKKKK.",
    "KdCdcdCdCK",
    "KdCdcdCdCK",
    "KdCdcdCdCK",
    "KdCdcdCdCK",
    ".KKKKKKKKK.",
  ]},
};

// ---- procedural: conifer (2nd tree species — soft, not a black spike) ----
function pineSprite(){
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

// ---- procedural: hill = low, broad, asymmetric earthy knoll w/ contour + cast shadow ----
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

// ---- procedural: mountain = asymmetric twin-ridge rocky peak, lit/shadow faces ----
function makeMountain(w){
  const h=Math.round(w*0.95);
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  const put=(X,Y,v)=>{x.fillStyle=v;x.fillRect(X,Y,1,1);};
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
