// CHRONICLE / PANEL — renders the Kroniki overlay (Rody / Powiązania / Warstwy tabs
// + the House relationship graph). Reads the current WORLD; global so regen()/UI call it.
// chronicle panel has two tabs: "Rody" (houses + history) and "Powiązania" (a relationship graph
// of the Houses plus the intrigues beneath the surface). Global so regen()/toggle can call it.
let chronTab='rody';
function setChronTab(t){ chronTab=t; renderChronicle(); }
const REL_COL={wojna:'#cf5b3f',sojusz:'#a7d04e',rywalizacja:'#e6c14d'};
const REL_NAME={wojna:'⚔ wojna',sojusz:'🤝 sojusz',rywalizacja:'⚑ rywalizacja',pokój:'pokój'};

// circular node-graph of the Houses: coloured edges for relations, dashed purple for intrigues.
function houseGraph(H,R,I){
  const n=H.length, cx=140, cy=125, Rd=Math.min(92, 40+n*9), w=280, ht=255;
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const pos=H.map((_,i)=>{ const a=-Math.PI/2 + i/n*2*Math.PI; return [cx+Math.cos(a)*Rd, cy+Math.sin(a)*Rd]; });
  let s=`<svg width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}">`;
  for(const r of R){ if(r.rel==='pokój')continue; const[x1,y1]=pos[r.a],[x2,y2]=pos[r.b];
    const dash=r.rel==='rywalizacja'?'5 4':'0';
    s+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${REL_COL[r.rel]}" stroke-width="2" stroke-dasharray="${dash}" opacity="0.85"/>`; }
  for(const it of I){ if(it.b==null)continue; const[x1,y1]=pos[it.a],[x2,y2]=pos[it.b];
    s+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#a84fd0" stroke-width="2" stroke-dasharray="2 4" opacity="0.9"/>`; }
  H.forEach((o,i)=>{ const[x,y]=pos[i]; const dot=I.some(it=>it.a===i&&it.b==null);
    s+=`<circle cx="${x}" cy="${y}" r="7" fill="${o.color}" stroke="#161d12" stroke-width="2"/>`;
    if(dot) s+=`<circle cx="${x+7}" cy="${y-7}" r="3" fill="#a84fd0" stroke="#161d12" stroke-width="1"/>`;
    const ty=y<cy?y-11:y+17, ta=Math.abs(x-cx)<14?'middle':(x<cx?'end':'start'), tx=x+(ta==='end'?-9:ta==='start'?9:0);
    s+=`<text x="${tx}" y="${ty}" fill="#ece3c8" font-size="10" font-family="'Pixelify Sans',monospace" text-anchor="${ta}">${esc(o.name)}</text>`; });
  s+=`</svg>`;
  return s;
}

function renderChronicle(){
  const el=document.getElementById('chronicle'); if(!el||!WORLD||!WORLD.houses)return;
  const H=WORLD.houses, R=WORLD.relations||[], E=WORLD.events||[], L=WORLD.legends||[], I=WORLD.intrigues||[];
  const G=WORLD.guilds||[], FA=WORLD.faiths||[];
  const tab=(id,lbl)=>`<span class="tab${chronTab===id?' on':''}" onclick="setChronTab('${id}')">${lbl}</span>`;
  let h=`<div class="ihead"><span class="nm">KRONIKI</span><span class="x" onclick="UI.toggleChronicle()">✕</span></div>`
   +`<div class="tabs">${tab('rody','Rody')}${tab('wiezy','Powiązania')}${tab('warstwy','Warstwy')}</div><div class="ibody">`;
  if(chronTab==='warstwy'){
    h+=`<div class="sect">gildie (${G.length})</div>`;
    for(const g of G) h+=`<div class="hrow"><span class="sw" style="background:${g.color}"></span> <b>${g.name}</b>`
      +`<br><span class="dim">mistrz ${g.master.full} · siedziba ${g.seat} · ${g.towns} miast · handel: ${g.role}</span></div>`;
    if(!G.length) h+=`<div class="ev">brak gildii (zbyt rozproszony handel)</div>`;
    h+=`<div class="sect">wiary (${FA.length})</div>`;
    for(const f of FA) h+=`<div class="hrow"><span class="sw" style="background:${f.color}"></span> <b>${f.name}</b>`
      +`<br><span class="dim">arcykapłan ${f.priest.full} · święte miasto ${f.holyCity} · ${f.towns} miast</span></div>`;
    if(WORLD.faithTension) h+=`<div class="ev intrig">Napięcie religijne: ${FA[WORLD.faithTension.a].name} kontra ${FA[WORLD.faithTension.b].name}.</div>`;
  } else if(chronTab==='rody'){
    h+=`<div class="sect">rody (${H.length})</div>`;
    for(const o of H) h+=`<div class="hrow"><span class="sw" style="background:${o.color}"></span> <b>Ród ${o.name}</b> — ${o.seat}`
      +`<br><span class="dim">${o.title} ${o.ruler.full} (${o.ruler.age}) · dziedzic: ${o.heir.full}</span>`
      +`<br><span class="dim">„${o.motto}” · ${o.trait} · ${o.role} · ${o.towns} miast · zał. ${o.founded}</span></div>`;
    if(L.length){ h+=`<div class="sect">legendy</div>`; for(const t of L) h+=`<div class="ev">${t}</div>`; }
    if(E.length){ h+=`<div class="sect">kronika</div>`; for(const e of E) h+=`<div class="ev">${e}</div>`; }
  } else {
    h+=`<div class="graph">${houseGraph(H,R,I)}</div>`;
    h+=`<div class="legendrow"><span style="color:${REL_COL.wojna}">━ wojna</span> <span style="color:${REL_COL.sojusz}">━ sojusz</span>`
      +` <span style="color:${REL_COL.rywalizacja}">┄ rywalizacja</span> <span style="color:#a84fd0">┄ intryga</span></div>`;
    const wars=R.filter(r=>r.rel!=='pokój');
    if(wars.length){ h+=`<div class="sect">stosunki</div>`;
      for(const r of wars) h+=`<div class="rel"><div class="li"><span>${H[r.a].name} — ${H[r.b].name}</span><span style="color:${REL_COL[r.rel]}">${REL_NAME[r.rel]}</span></div>`
        +(r.cause?`<div class="dim cause">${r.cause}</div>`:'')+`</div>`; }
    if(I.length){ h+=`<div class="sect">intrygi</div>`; for(const it of I) h+=`<div class="ev intrig">${it.text}</div>`; }
  }
  h+=`</div>`; el.innerHTML=h;
}
