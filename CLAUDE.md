# MAP GAME — PROJECT RULES

## ZASADA NR 1
**NIE ZADAWAJ IDIOTYCZNYCH PYTAŃ. DECYDUJ SAM I BUDUJ.**
- NIE używać AskUserQuestion do wyboru zakresu/architektury. Wybrać najlepszą opcję i zrobić.
- Pytać TYLKO gdy coś jest nieodwracalne albo brak danych których naprawdę nie da się wywnioskować.
- Domyślnie: pełny szkielet, najbogatsza wersja, działający efekt. Nie pytać "czy chcesz X" — zrobić X.

## ASSETS
- Sprite rysowane RĘCZNIE w kodzie (`map.js` sekcja ASSETS: pxSprite/triSprite), styl 1:1 z examples. NIE używać zewnętrznego packa (odrzucone).
- `example1.png` .. `example4.png` = REFERENCJA STYLU. Patrzeć na nie, dopasować wygląd.
- Styl: pixelart top-view, zielone biomy, piasek/pustynia, jeziora, wzgórza/góry (trójkąty z cieniem), drzewa, domki z czerwonym dachem, etykiety miast w jasnym boxie, drogi przerywane, granice frakcji (kolorowane regiony jak example2/example4).

## CEL = MAPA DO GRY (nie statyczny obrazek)
Wymagane elementy docelowe:
- **Rozdział danych od renderu**: world state `{tiles, factions, cities, roads, agents}` osobno od warstwy rysowania.
- **Kamera**: zoom (scroll) + pan (drag myszą).
- **Frakcje + granice**: regiony, kolorowane krawędzie.
- **Drzewa/wzgórza = encje** (klikalne, sortowane po Y), nie wypalone w bitmap.
- **Drogi = graf** z waypointami → kupcy/agenci poruszają się po nich.
- **Pętla gry**: requestAnimationFrame (tick + render), nie jednorazowy build.

## TECH
- Vanilla HTML5 + Canvas, zero build-stepu, zero zależności. Otwiera się `index.html` w przeglądarce.
- Pixelart: niski bufor, skalowanie `image-rendering:pixelated`.
- Weryfikacja wizualna: `google-chrome --headless --screenshot` na `index.html`, potem czyścić temp png.

## STYL PRACY
- Krótko. Robić, nie gadać. Pokazać efekt (screenshot), nie listę pytań.
