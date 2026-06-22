// SPRITES / ICONS — tiny 8x8 pixel icons for each tradeable good (Colonization-style).
// Baked to a dataURL (for DOM panels) and a sprite canvas (for the map) by bakeIcons().
// '.' = transparent, 'O' = shared outline.

const ICON_DEF={
  'zboże':{pal:{O:OUTL,y:'#e8cf63',b:'#b9962f'},rows:[
    '...OO...','..OyyO..','.OyybyO.','.OybyyO.','.OyybyO.','..OyyO..','...bb...','...OO...']},
  'ryby':{pal:{O:OUTL,c:'#5a8ac0',w:'#dde6ee'},rows:[
    '........','..OOO.O.','.OcccOO.','OccwcccO','OccccccO','.OcccOO.','..OOO.O.','........']},
  'mięso':{pal:{O:OUTL,r:'#b04a3a',w:'#e8e0d0'},rows:[
    '........','.w....w.','.OwOOwO.','.OrrrrO.','OrrrrrrO','.OrrrrO.','..OOOO..','........']},
  'sól':{pal:{O:OUTL,w:'#eef2f6'},rows:[
    '........','...O....','..OwO...','.OwwwO..','OwwwwwO.','OwwwwwwO','.OOOOOO.','........']},
  'jedzenie':{pal:{O:OUTL,b:'#c79a5a',B:'#a87a3e'},rows:[
    '........','..OOOO..','.ObbbbO.','ObBbBbBO','ObbbbbbO','ObbbbbbO','.OOOOOO.','........']},
  'drewno':{pal:{O:OUTL,L:'#8a5e34',d:'#6b4a26'},rows:[
    '........','.OOOOOO.','OdLLLLdO','OdLLLLdO','OdLLLLdO','.OOOOOO.','........','........']},
  'kamień':{pal:{O:OUTL,s:'#9a948a',S:'#b8b2a6'},rows:[
    '........','..OOO...','.OsSsO..','OsssssO.','OsSsssSO','.OOOOOO.','........','........']},
  'ruda':{pal:{O:OUTL,s:'#7a7a82',r:'#d8893a'},rows:[
    '........','..OOO...','.OsrsO..','OsrsssO.','OssrsrsO','.OOOOOO.','........','........']},
  'metal':{pal:{O:OUTL,M:'#c2cdd6',m:'#8c98a2'},rows:[
    '........','........','.OOOOOO.','OmMMMMmO','OmmmmmmO','.OOOOOO.','........','........']},
  'deski':{pal:{O:OUTL,p:'#c9a86a',P:'#b08e52'},rows:[
    '........','OOOOOOOO','OpPpPpPO','OOOOOOOO','OpPpPpPO','OOOOOOOO','........','........']},
  'towary':{pal:{O:OUTL,t:'#9a6b3a',T:'#7a5128'},rows:[
    '........','.OOOOOO.','OtTttTtO','OtTttTtO','OttTTttO','OtTttTtO','.OOOOOO.','........']},
  'złoto':{pal:{O:OUTL,g:'#e0b93a',G:'#f2e08a'},rows:[
    '........','..OOOO..','.OgGggO.','OggGgggO','OgggGgGO','.OgggGO.','..OOOO..','........']},
};

const ICON_URL={}, ICON_SPR={};   // res -> dataURL (DOM) / sprite (map)
function bakeIcons(){ for(const k in ICON_DEF){
  const s=pxSprite(ICON_DEF[k].rows, ICON_DEF[k].pal, false);
  ICON_SPR[k]=s; ICON_URL[k]=s.img.toDataURL(); } }
