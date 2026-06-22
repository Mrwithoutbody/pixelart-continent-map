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
  }

  // ---- public actions (wired from index.html) ----
  return {
    setScreen,
    newGame(){ runGen(readSeed()); },
    randomSeed(){ seedIn.value=String((Math.random()*1e9)>>>0); },
    regenInGame(){ regen(); },                 // HUD "new map" — keep current camera
    toStart(){ clearCity(); document.getElementById('chronicle').classList.remove('open'); setScreen('start'); },
    toGame(){ setScreen('game'); },
    toggleChronicle(){ const el=document.getElementById('chronicle'); renderChronicle(); el.classList.toggle('open'); },
  };
})();

// build the chronicle panel (houses + relations + events) from the current world. Global so
// map.js's regen() can refresh it after a new map; UI.toggleChronicle() shows/hides it.
function renderChronicle(){
  const el=document.getElementById('chronicle'); if(!el||!WORLD||!WORLD.houses)return;
  const H=WORLD.houses, R=WORLD.relations||[], E=WORLD.events||[];
  const relName={wojna:'⚔ wojna',sojusz:'🤝 sojusz',rywalizacja:'⚑ rywalizacja',pokój:'pokój'};
  let h=`<div class="ihead"><span class="nm">KRONIKI</span><span class="x" onclick="UI.toggleChronicle()">✕</span></div><div class="ibody">`;
  h+=`<div class="sect">rody (${H.length})</div>`;
  for(const o of H) h+=`<div class="hrow"><span class="sw" style="background:${o.color}"></span> <b>Ród ${o.name}</b> — ${o.seat}`
    +`<br><span class="dim">„${o.motto}” · ${o.trait} · ${o.role} · ${o.towns} miast · zał. ${o.founded}</span></div>`;
  const wars=R.filter(r=>r.rel!=='pokój');
  if(wars.length){ h+=`<div class="sect">stosunki</div>`;
    for(const r of wars) h+=`<div class="li"><span>${H[r.a].name} — ${H[r.b].name}</span><span>${relName[r.rel]}</span></div>`; }
  if(E.length){ h+=`<div class="sect">kronika</div>`; for(const e of E) h+=`<div class="ev">${e}</div>`; }
  h+=`</div>`; el.innerHTML=h;
}

// boot: start screen by default. Dev deep-links: #game jumps straight in,
// #city opens the busiest city's panel, #map shows a zoomed-out overview.
(function boot(){
  const h=location.hash;
  if(h==='#map'){ UI.toGame(); cam.x=W/2; cam.y=H/2; cam.zoom=1; clampCam(); return; }
  if(h==='#game'){ UI.toGame(); return; }
  if(h==='#city'){ UI.toGame();
    let bi=0; WORLD.cities.forEach((c,i)=>{if(c.pop>WORLD.cities[bi].pop)bi=i;});
    const c=WORLD.cities[bi]; selected=bi; cam.x=c.x; cam.y=c.y; cam.zoom=8; clampCam(); updateInfo();
    return; }
  UI.setScreen('start');
})();
