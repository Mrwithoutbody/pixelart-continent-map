// CHRONICLE / GENERATE — Houses, characters, relations, ties, intrigues, legends,
// plus the economic (guild) and religious (faith) layers. Mutates cities (guild/faith).
function buildChronicle(cities,rng){
  // ---- houses + characters + chronicle: each faction is a noble House (Dune / GoT flavour) with a
  //      ruling lord, an heir, a motto/trade, blood ties to other Houses, legends, and a past of
  //      wars / alliances / rivalries — emergent stories woven from the map ----
  const pick=a=>a[rng()*a.length|0];
  const HSYL=['kar','vel','dra','mor','thal','ys','gorn','bel','rha','tyr','wen','ost','cael','dun','var','sel','grim','ah'];
  const FNAME_M=['Aldric','Beren','Cedrik','Doran','Edmar','Garr','Hektor','Ivo','Joran','Kael','Lorn','Marek','Nestor','Oswin','Roald','Teon','Ulryk','Wace'];
  const FNAME_F=['Aela','Brina','Cora','Dagna','Elsa','Gwyn','Hela','Ilka','Jorun','Lena','Mira','Nela','Ofka','Rina','Sela','Talia','Wanda','Ysa'];
  const EPITHET=['Stary','Żelazny','Okrutny','Sprawiedliwy','Chytry','Pobożny','Ślepy','Wielki','Czarny','Cichy','Rudy','Łaskawy'];
  const TITLE=['Lord','Książę','Hrabia','Kasztelan','Wielmoża'];
  const MOTTOS=['Krew i Kamień','Wierni do końca','Z morza nasza siła','Żelazo się nie gnie','Pod jednym niebem',
    'Cisza przed burzą','Korzeń i Korona','Ogień nie pyta','Sól ziemi','Głębiej niż góry'];
  const TRAITS=['kupiecki','wojowniczy','pobożny','skryty','dumny','żeglarski','górniczy'];
  const person=()=>{ const female=rng()<0.45, fn=female?pick(FNAME_F):pick(FNAME_M);
    const full = rng()<0.5 ? `${fn} ${pick(EPITHET)}` : fn;
    return {full, female, age:24+(rng()*48|0)}; };
  const houseName=()=>{ const s=HSYL[rng()*HSYL.length|0]+HSYL[rng()*HSYL.length|0]; return s[0].toUpperCase()+s.slice(1); };
  const usedF=[...new Set(cities.map(c=>c.f))].sort((a,b)=>a-b);
  const houses=usedF.map(f=>{ const own=cities.filter(c=>c.f===f);
    const seat=own.find(c=>c.seat)||own.slice().sort((a,b)=>b.pop-a.pop)[0];
    const ruler=person(), heir=person();
    return {f, name:houseName(), faction:FACTIONS[f].name, color:FACTIONS[f].flag,
      seat:seat?seat.name:'—', role:seat?seat.role:'—', motto:pick(MOTTOS), trait:pick(TRAITS),
      founded:180+(rng()*620|0), towns:own.length, title:pick(TITLE), ruler, heir}; });
  const hByF=new Map(houses.map(h=>[h.f,h]));
  for(const c of cities) c.houseName=(hByF.get(c.f)||{}).name||'—';

  // pairwise relations, each with a generated cause; alliances are sealed by marriage (a blood tie)
  const relations=[], ties=[];
  for(let i=0;i<houses.length;i++)for(let j=i+1;j<houses.length;j++){ const A=houses[i],B=houses[j],r=rng();
    const rel = r<0.22?'wojna': r<0.40?'sojusz': r<0.64?'rywalizacja':'pokój';
    let cause='';
    if(rel==='wojna') cause=pick([`spór o ${A.role} i ${B.role}`,`krew przelana pod ${A.seat}`,
      `${B.title} ${B.ruler.full} odmówił trybutu`,`zdrada przy stole w ${A.seat}`]);
    else if(rel==='sojusz'){ const bride=person(); cause=`małżeństwo: ${bride.full} z Rodu ${A.name} poślubia dziedzica ${B.heir.full}`;
      ties.push({a:i,b:j,bride:bride.full}); }
    else if(rel==='rywalizacja') cause=pick([`rywalizacja o handel ${A.role}`,`stary spór graniczny`,`obie pretendują do ${A.seat}`]);
    relations.push({a:i,b:j,rel,cause}); }

  // legends / curiosities tied to actual towns -> flavour that feels like local history
  const LEG=[ c=>`Pod ${c.name} podobno śpi smok, nie widziany od pokoleń.`,
    c=>`Studnia w ${c.name} nigdy nie wysycha — zwą ją Łzą Bogów.`,
    c=>`W lasach koło ${c.name} znikają wędrowcy; winią Zielonego Łowcę.`,
    c=>`Sztolnie ${c.name} sięgają tak głęboko, że słychać bicie serca góry.`,
    c=>`Mówią, że ${c.name} wzniesiono na kościach starszego miasta.`,
    c=>`Targ w ${c.name} raz w roku odwiedza milczący kupiec, który płaci złotem bez stempla.` ];
  const legends=[]; { const pool=cities.slice().sort(()=>rng()-0.5).slice(0,3);
    pool.forEach((c,i)=>legends.push(LEG[(rng()*LEG.length|0)](c))); }

  // intrigues: the hidden web beneath the alliances — betrayals, scheming, bastards, poison, affairs
  const intrigues=[];
  if(houses.length>=2){ const HH=houses, idx=()=>rng()*HH.length|0,
      two=()=>{ let a=idx(),b=idx(); while(b===a)b=idx(); return [a,b]; };
    const GENS=[
      ()=>{ const[a,b]=two(); return {a,b,type:'zdrada',text:`Ród ${HH[a].name} potajemnie knuje przeciw sojusznikowi — Rodowi ${HH[b].name}.`}; },
      ()=>{ const[a,b]=two(); return {a,b,type:'konszachty',text:`${HH[a].name} i ${HH[b].name} w tajemnicy dzielą łupy z trzeciego rodu.`}; },
      ()=>{ const a=idx(); return {a,type:'bękart',text:`Dziedzic ${HH[a].heir.full} z Rodu ${HH[a].name} to w istocie bękart — prawdziwy syn zaginął.`}; },
      ()=>{ const[a,b]=two(); const ch=person(); return {a,b,type:'podrzutek',text:`Podrzucone dziecko, ${ch.full}, wychowane w Rodzie ${HH[a].name}, nosi krew Rodu ${HH[b].name}.`}; },
      ()=>{ const a=idx(); return {a,type:'trucizna',text:`${HH[a].title} ${HH[a].ruler.full} gaśnie w chorobie — szepczą o truciźnie.`}; },
      ()=>{ const[a,b]=two(); return {a,b,type:'romans',text:`Sekretny romans łączy dziedziców Rodów ${HH[a].name} i ${HH[b].name}, wbrew woli ojców.`}; },
      ()=>{ const[a,b]=two(); return {a,b,type:'szpieg',text:`Ród ${HH[a].name} trzyma szpiega na dworze Rodu ${HH[b].name}.`}; },
    ];
    const cnt=3+(rng()*3|0); for(let k=0;k<cnt;k++) intrigues.push(pick(GENS)()); }

  // chronicle: foundings (with the first lords), marriages, wars — named, dated, oldest first
  const events=[];
  const byAge=houses.slice().sort((p,q)=>p.founded-q.founded);
  for(const h of byAge.slice(0,2)) events.push(`${h.founded}: ${h.title} ${h.ruler.full} z Rodu ${h.name} obejmuje ${h.seat}.`);
  for(const t of ties) events.push(`Więzy krwi: ${t.bride} łączy Rody ${houses[t.a].name} i ${houses[t.b].name}.`);
  for(const rl of relations) if(rl.rel==='wojna') events.push(`Wojna ${houses[rl.a].name} z ${houses[rl.b].name} — ${rl.cause}.`);
  if(events.length>10) events.length=10;

  // ---- overlapping layers: economic guilds + religious faiths that cross-cut the Houses ----
  // a town belongs to a House (blood/land) AND a guild (its trade) AND a faith — the three maps
  // of allegiance rarely line up, which is where the leverage and intrigue live.
  const GUILD_NAME={'sól':'Bractwo Soli','ruda':'Gildia Górnicza','port':'Liga Morska','drewno':'Cech Drwali',
    'kamień':'Gildia Kamieniarzy','zboże':'Bractwo Młynarzy','rolnictwo':'Liga Wiejska'};
  const GUILD_COL=['#d8a030','#3aa0c0','#9c5ad0','#5fbf6f','#d05a7a','#7a8a3a','#c06030'];
  const byRole={}; cities.forEach((c,i)=>{ (byRole[c.role]=byRole[c.role]||[]).push(i); c.guild=-1; });
  const guilds=[];
  for(const role of Object.keys(byRole)){ const mem=byRole[role]; if(mem.length<2)continue;
    const id=guilds.length, seat=mem.slice().sort((a,b)=>cities[b].pop-cities[a].pop)[0];
    for(const m of mem) cities[m].guild=id;
    guilds.push({id, role, name:GUILD_NAME[role]||('Gildia '+role), color:GUILD_COL[id%GUILD_COL.length],
      master:person(), seat:cities[seat].name, towns:mem.length}); }
  const guildRel=[]; for(let i=0;i<guilds.length;i++)for(let j=i+1;j<guilds.length;j++) if(rng()<0.3) guildRel.push({a:i,b:j});

  const FAITH_NAME=['Kult Słońca','Wiara Głębin','Stary Las','Zakon Popiołu','Droga Kamienia'];
  const FAITH_COL=['#e6c84e','#5a8ac0','#6fae5a','#b06ab0'];
  const nFaith=2+(rng()<0.5?1:0);
  const fOrder=FAITH_NAME.map((_,i)=>i).sort(()=>rng()-0.5).slice(0,nFaith);
  const faiths=fOrder.map((fi,i)=>({id:i, name:FAITH_NAME[fi], color:FAITH_COL[i], priest:person(), holyCity:'—', towns:0}));
  const houseFaith=new Map(houses.map(h=>[h.f, rng()*nFaith|0]));         // each House patronises a faith
  for(const c of cities){ c.faith = rng()<0.82 ? (houseFaith.get(c.f)??0) : (rng()*nFaith|0); faiths[c.faith].towns++; }
  for(const ft of faiths){ let best=-1,bp=-1; cities.forEach((c,i)=>{ if(c.faith===ft.id&&c.pop>bp){bp=c.pop;best=i;} }); if(best>=0)ft.holyCity=cities[best].name; }
  const faithTension = nFaith>=2 ? {a:0,b:1} : null;                       // two creeds at odds
  return {houses,relations,ties,legends,intrigues,events,guilds,guildRel,faiths,faithTension};
}
