// ============================================================
//  UI  — screen state machine (start / gen / game) + city panel glue.
//  Drives body[data-screen]; CSS in index.html toggles overlays.
//  Map render loop (map.js) always runs underneath as a live backdrop.
//  Globals from map.js: regen(), clearCity(), cam, W, H, clampCam().
// ============================================================
const UI=(()=>{
  const body=document.body;
  const seedIn=document.getElementById('seedIn');
  const bar=document.getElementById('gen-bar');
  const status=document.getElementById('gen-status');

  const setScreen=name=>{ body.dataset.screen=name; };

  // parse the seed field -> uint32, or a fresh random seed when blank/invalid.
  const readSeed=()=>{ const v=(seedIn.value||'').trim();
    if(/^\d+$/.test(v)) return (parseInt(v,10)>>>0);
    return (Math.random()*1e9)>>>0; };

  // staged flavour for the generating screen; world is actually built mid-way (synchronous).
  const STEPS=[
    [  8,'Wypiętrzanie gór…'],
    [ 24,'Wlewanie oceanów…'],
    [ 40,'Sadzenie lasów…'],
    [ 58,'Zakładanie miast…'],     // <- regen() fires here
    [ 76,'Wytyczanie dróg…'],
    [ 90,'Wysyłanie karawan…'],
    [100,'Gotowe.'],
  ];
  let genTimer=null;
  function runGen(seed){
    setScreen('gen'); bar.style.width='0%'; status.textContent='…';
    let i=0;
    const step=()=>{
      const [p,msg]=STEPS[i];
      bar.style.width=p+'%'; status.textContent=msg;
      if(i===3) regen(seed);                  // heavy build, behind the overlay
      i++;
      if(i<STEPS.length){ genTimer=setTimeout(step, i===4?260:150); }
      else genTimer=setTimeout(enterGame, 320);
    };
    genTimer=setTimeout(step, 120);
  }

  function enterGame(){
    clearTimeout(genTimer); genTimer=null;
    cam.x=W/2; cam.y=H/2; cam.zoom=3; clampCam();   // fresh overview
    setScreen('game');
    saveGame();                                     // persist the freshly generated world to quick-save
  }

  // show/hide the "Kontynuj" button on the start card depending on whether a save exists
  function refreshContinue(){ const b=document.getElementById('btnContinue');
    if(b) b.style.display = hasSave() ? '' : 'none'; }

  // ---- public actions (wired from index.html) ----
  return {
    setScreen, refreshContinue,
    newGame(){ runGen(readSeed()); },
    continueGame(){ if(WORLD||loadGame()) setScreen('game'); else refreshContinue(); },   // backdrop world already loaded at boot
    randomSeed(){ seedIn.value=String((Math.random()*1e9)>>>0); },
    regenInGame(){ regen(); saveGame(); },     // HUD "new map" — keep current camera, persist it
    toStart(){ clearCity(); document.getElementById('chronicle').classList.remove('open'); refreshContinue(); setScreen('start'); },
    toGame(){ setScreen('game'); },
    toggleChronicle(){ const el=document.getElementById('chronicle'); renderChronicle(); el.classList.toggle('open'); },
    setLayer(k){ if(WORLD)WORLD.layer=k;                                  // switch the map overlay (Houses/guilds/faiths)
      document.querySelectorAll('.lyr').forEach(b=>b.classList.toggle('on',b.dataset.l===k)); },
    toggleBuild(){ const bb=document.getElementById('buildbar');
      if(bb.classList.contains('open')){ bb.classList.remove('open'); exitBuild(); return; }
      bb.innerHTML=`<div class="bt">BUDUJ<span class="x" onclick="UI.toggleBuild()">✕</span></div>`
        +`<div class="grid">`+BUILDABLE.map(o=>`<span class="bopt" onclick="setBuild('${o.id}')">${o.name}<span class="bcost">${costStr(o.id)}</span></span>`).join('')+`</div>`
        +`<div class="hint">wybierz typ, potem klik na lądzie przy mieście · Esc = anuluj</div>`;
      bb.classList.add('open'); },
  };
})();


// boot: start screen by default. Dev deep-links: #game jumps straight in,
// #city opens the busiest city's panel, #map shows a zoomed-out overview.
(function boot(){
  const h=location.hash;
  // dev deep-links need a world on demand (there is no boot-time backdrop world anymore)
  if(h==='#map'){ regen(); UI.toGame(); cam.x=W/2; cam.y=H/2; cam.zoom=1; clampCam(); return; }
  if(h==='#game'){ regen(); UI.toGame(); return; }
  if(h==='#city'){ regen(); UI.toGame();
    let bi=0; WORLD.cities.forEach((c,i)=>{if(c.pop>WORLD.cities[bi].pop)bi=i;});
    const c=WORLD.cities[bi]; selected=bi; cam.x=c.x; cam.y=c.y; cam.zoom=8; clampCam(); updateInfo();
    return; }
  if(hasSave()) loadGame();      // load the quick-save as the live (dimmed) backdrop behind the menu
  UI.refreshContinue();          // reveal "Kontynuj" only when a quick-save exists
  UI.setScreen('start');
})();
