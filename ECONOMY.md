# Ekonomia — surowce i budynki

Spięte z mapą: `WORLD.cities`, `biomeAt(x,y)`, `costAt`, `adj` (drogi), `merchants`, `pop`, frakcje.
Zasada: **biom wokół miasta = co produkuje** → budynki przetwarzają → **kupcy wożą nadwyżki drogami** → populacja konsumuje → miasto rośnie.

---

## 1. Surowce podstawowe (raw) — wydobywane z biomu

| id | nazwa | biom źródłowy | budynek |
|----|-------|---------------|---------|
| `wood` | DREWNO | FOREST | obóz drwali |
| `iron` | ŻELAZO (ruda) | MOUNTAIN | kopalnia |
| `grain` | ZBOŻE | GRASS | farma |
| `flax` | LEN | GRASS | pole lnu |
| `horses` | KONIE | GRASS (pastwisko) | stadnina |
| `fish` | RYBY | SHALLOW / brzeg | przystań rybacka |
| `salt` | SÓL | DESERT / brzeg | warzelnia |
| `cattle` | BYDŁO | GRASS (pastwisko) | hodowla |
| `furs` | FUTRA | FOREST | traper |
| `stone` | KAMIEŃ | HILLS | kamieniołom |
| `herbs` | ZIOŁA | FOREST / GRASS | zielarnia |

---

## 2. Surowce rozszerzone (processed) — z budynków

| id | nazwa | wejście → | budynek |
|----|-------|-----------|---------|
| `meat` | MIĘSO | cattle | rzeźnia |
| `hides` | SKÓRY | cattle + salt | garbarnia |
| `cloth` | TKANINY | flax (len) | tkalnia |
| `steel` | STAL | iron + wood¹ | huta |
| `planks` | DESKI | wood | tartak |
| `flour` | MĄKA | grain | młyn |
| `clothes` | UBRANIA | cloth + furs | krawiec |
| `swords` | MIECZE | steel + wood | kuźnia |
| `bows` | ŁUKI | wood + cloth² | łuczarz |
| `armor` | ZBROJE | steel | płatnerz |
| `helmets` | HEŁMY | steel | płatnerz |
| `axes` | TOPORY | steel + wood | kuźnia |
| `spears` | WŁÓCZNIE | steel + wood | kuźnia |

¹ drewno jako opał/węgiel drzewny w hucie. ² cięciwa.

---

## 3. Budynki

Zamiast „1 budynek = 1 produkt" (≈26 budynków) → **budynki wielo-recepturowe**: jeden typ obsługuje kilka surowców (gracz wybiera recepturę). Extractory scalone w **estate'y wg biomu**. Razem **18 typów** zamiast 26. Dodanie surowca = nowa receptura, nie nowy budynek.

### Extractory (6) — estate wg biomu, output wybierany

| id | nazwa | biom | receptury (→ wyjście) |
|----|-------|------|-----------------------|
| `farm` | farma | GRASS | grain · flax · cattle · horses |
| `forest_camp` | obóz leśny | FOREST | wood · furs · herbs |
| `mine` | kopalnia | MOUNTAIN | iron |
| `quarry` | kamieniołom | HILLS | stone |
| `fishery` | przystań | brzeg / SHALLOW | fish |
| `salt_works` | warzelnia | DESERT / brzeg | salt |

### Przetwórstwo (8) — część z wieloma recepturami

| id | nazwa | wejście → wyjście |
|----|-------|-------------------|
| `sawmill` | tartak | wood → planks |
| `mill` | młyn | grain → flour |
| `smelter` | huta | iron + wood → steel |
| `butchery` | rzeźnia | cattle → meat ; cattle + salt → hides |
| `weavery` | tkalnia | flax → cloth ; cloth + furs → clothes |
| `smithy` | kuźnia | steel + wood → swords · axes · spears |
| `armorer` | płatnerz | steel → armor · helmets |
| `bowyer` | łuczarz | wood + cloth → bows |

### Miejskie / infra (5)

| id | nazwa | wymóg | rola |
|----|-------|-------|------|
| `warehouse` | magazyn | miasto | pojemność składu |
| `market` | targ | miasto | sprzedaż/kupno, ceny |
| `harbor` | **PORT** | przy brzegu (kafel obok wody) | przyjmuje **statki handlowe**, węzeł handlu morskiego, +bonus do `fish` |
| `town_hall` | ratusz | centrum | podatki, +zasięg miasta |
| `barracks` | koszary | miasto | uzbrojenie + pop → jednostki |

### Mieszkalne / housing (4 typy)

Miasto = klaster budynków mieszkalnych (już renderowany). Typ zależy od populacji/zamożności; daje pojemność mieszkańców i wpływa na popyt.

| id | nazwa | pojemność (mieszk.) | opis |
|----|-------|---------------------|------|
| `shack` | Chata | ~50 | biedne obrzeża, niski popyt na dobra |
| `house` | Dom | ~120 | podstawowe mieszkanie |
| `townhouse` | Kamienica | ~300 | miejska, wyższy popyt (ubrania/sól) |
| `manor` | Dwór | ~600 | zamożny rdzeń, popyt na luxury (wino, ubrania) |

Skład klastra rośnie z `pop`: małe miasto = chaty/domy; duże dostaje kamienice i dwór w centrum.
Panel miasta (po kliknięciu) pokazuje **skład** — ile budynków każdego typu.

---

## 4. Łańcuchy produkcji

```
FOREST   → wood ─┬─ tartak → DESKI
                 ├─ (huta: opał do stali)
                 └─ traper → FUTRA
         → herbs (ZIOŁA, zdrowie/handel)

GRASS    → grain → młyn → MĄKA            (jedzenie)
         → flax (LEN) → tkalnia → TKANINY ─┬─ krawiec(+futra) → UBRANIA
                                           └─ łuczarz(+drewno) → ŁUKI
         → cattle ─┬─ rzeźnia → MIĘSO     (jedzenie)
                   └─ garbarnia(+sól) → SKÓRY
         → horses (KONIE: transport / kawaleria)

HILLS    → stone (KAMIEŃ: budowa)
MOUNTAIN → iron → huta(+drewno) → STAL ─┬─ kuźnia(+drewno) → MIECZE / TOPORY / WŁÓCZNIE
                                        └─ płatnerz → ZBROJE / HEŁMY
SHALLOW  → fish (RYBY: jedzenie)
DESERT   → salt (SÓL: garbarnia, konserwacja, handel)
```

Materiały budowlane: `planks`, `stone` (+ drewno) — zużywane przy stawianiu budynków.
Militaria (`swords/axes/spears/bows/armor/helmets`) + `horses` → wyposażenie jednostek w koszarach.

---

## 5. Jedzenie i konsumpcja

Jedzenie (wymagane na mieszkańca/cykl): `grain`/`flour`, `meat`, `fish`. Deficyt → głód → `pop` spada.
Zadowolenie (bonus wzrostu): `clothes`, `salt`, `herbs`.
Wzrost: nadwyżka jedzenia + zadowolenie + wolny `house` → `pop`↑ → kolejny domek w klastrze (skalowanie `pop→houses` już jest).

---

## 6. Integracja z mapą

- **Zasięg miasta** = kafle terytorium (`fac` Voronoi). Extractor działa, gdy w zasięgu jest jego biom (`biomeAt`).
- **Transport lądowy** = nadwyżki grafem `adj` przez `merchants` (wózki); czas ∝ długość krawędzi (± `costAt`).
- **Transport morski** = miasta z `harbor` tworzą **graf morski** (krawędzie po wodzie między portami). **Statki handlowe** = osobne agenty (jak `merchants`, ale poruszają się po wodzie / wzdłuż brzegu). Łączą wyspy i odległe porty taniej niż droga lądowa na duże dystanse. Pozwala handlować przez ocean (różne wyspy archipelagu).
- **Frakcje** = handel tańszy wewnątrz frakcji; cła/embargo między wrogimi (`FACTIONS`).
- **Targ** ustala ceny lokalnie (podaż/popyt).

### Jednostki transportowe (wozy lądowe + statki morskie)

- **Domyślnie NEUTRALNE** (niezależni kupcy) — bez flagi.
- **Należące do frakcji** (konwoje/floty frakcji) → mała **flaga w kolorze frakcji** nad jednostką.
- Pole `unit.f`: `-1` = neutralny, `>=0` = id frakcji właściciela.
- Przyszłość: wrogie frakcje mogą napadać obce (oflagowane) konwoje; neutralni są nietykalni.

---

## 7. Model danych (pod kod)

```js
RESOURCES = {
  wood:{name:'drewno',type:'raw'}, iron:{name:'żelazo',type:'raw'},
  steel:{name:'stal',type:'processed'}, swords:{name:'miecze',type:'military'}, ... }

// budynek = lista receptur; gracz wybiera aktywną (radio) lub miesza
BUILDINGS = {
  farm:   { name:'farma', cat:'extractor', biome:'GRASS',
            recipes:[ {out:{grain:1}}, {out:{flax:1}}, {out:{cattle:1}}, {out:{horses:1}} ] },
  smelter:{ name:'huta', cat:'processor',
            recipes:[ {in:{iron:1,wood:1}, out:{steel:1}, time:3} ] },
  smithy: { name:'kuźnia', cat:'military',
            recipes:[ {in:{steel:2,wood:1},out:{swords:1},time:4},
                      {in:{steel:2,wood:1},out:{axes:1},time:4},
                      {in:{steel:1,wood:2},out:{spears:1},time:3} ] },
  ... }

// dopiąć do WORLD.cities[i]:
city.stock     = { grain:0, wood:0, iron:0, ... }   // magazyn
city.buildings = [ {id:'farm',x,y}, {id:'mill',x,y} ]
city.demand    = { food: pop*k }
city.prices    = { ... }                            // lokalny targ
```

Pętla ekonomii (co N ticków, osobno od renderu):
1. **wydobycie** — extractory z dostępnym biomem → +raw.
2. **produkcja** — processory z dostępnym wejściem → wyjścia.
3. **konsumpcja** — pop zje jedzenie; nalicz zadowolenie.
4. **handel** — nadwyżki → kupcy → sąsiad z deficytem (`adj`).
5. **wzrost** — aktualizacja `pop`, ew. nowy domek.

---

## 8. MVP — faza 1

Najmniejsza grywalna pętla „produkcja → jedzenie → wzrost":
- Surowce: `wood`, `iron`, `grain`, `cattle`, `stone`, `fish`, `salt` + `flour`, `meat`, `steel`, `planks`.
- Budynki: `farm` (grain/cattle), `forest_camp` (wood), `mine`, `quarry`, `fishery`, `mill`, `butchery`, `sawmill`, `smelter`, `warehouse`, `market`.
- Mechanika: extractor↔biom, łańcuch do `flour`/`meat`/`fish`, konsumpcja = pop, magazyn, panel miasta = `stock` + produkcja.
- Handel: nadwyżka jedzenia/`planks` → kupiec → najbliższe miasto z deficytem.

Warstwy później: militaria (`steel→swords/axes/spears/bows/armor/helmets`, koszary), `clothes`/`furs`/`herbs` (zadowolenie), `horses` (kawaleria/transport), ceny rynkowe, cła frakcji.
