// ============================================================
//  SPRITES / UNITS  — mobile agents (caravan cart, trade ship).
//  Pure const grid data. Baked by core's buildSprites(). Needs OUTL.
// ============================================================
const UNIT_SPRITES={
  cart:{pal:{K:OUTL,C:'#c8842f',c:'#9c6318',Y:'#d8c38a'},rows:[   // land leg of a caravan
    ".KKKKK.",
    "KCCCCCK",
    "KCYYYCK",
    "KcccccK",
    ".KKKKK.",
    ".K...K.",
  ]},
  ship:{pal:{K:OUTL,W:'#e8e2d0',H:'#7a5230',h:'#5e3f22'},rows:[   // sea leg — small sailboat
    "...K.....",
    "...KW....",
    "...KWW...",
    "...KWWW..",
    "...K.....",
    ".HHHHHHH.",
    "KhhhhhhhK",
    ".KhhhhK..",
    "..KKKK...",
  ]},
  anchor:{pal:{K:OUTL,W:'#dde6ee'},oyBottom:false,rows:[          // port marker icon (centered)
    "..KKK..",
    ".KWWWK.",
    ".KWKWK.",
    ".KWWWK.",
    "..KWK..",
    "KKKWKKK",
    "..KWK..",
    "W.KWK.W",
    "WKKWKKW",
    ".WWKWW.",
    "..KKK..",
  ]},
};
