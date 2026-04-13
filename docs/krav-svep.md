# Krav: svepnavigation (PWA)

Dokumentet samlar överenskommen funktion innan implementation. Uppdatera vid behov.

## Bottenmenyns ordning (strikt cykel)

Flikarna i **huvudmenyn** följer denna ordning (vänster → höger):

1. Analys  
2. Intäkter  
3. Utgifter  
4. Spara  
5. Inställningar  

**Krav:** När användaren sveper **vänster → höger** på en **huvudflik** utan öppen kategori-overlay ska nästa steg följa **strikt cykel enligt menyn** (t.ex. från Utgifter → Spara, från Inställningar → runt till Analys om cykeln är sluten — exakt beteende implementeras enligt denna ordning).

## Höger → vänster på undersidor

**Krav:** På **undersidor** (kategoriunderlägen, overlays, redigerare under en huvudflik) ska **ingen navigation** ske med svep **höger → vänster**. Gesten är **inaktiv** för navigationsändamål (scroll i listor får fortfarande fungera om det är separat logik).

## Vänster → höger — två nivåer

### A) Kategori-overlay under Utgifter (och samma för övriga utgiftskategorier)

**Krav:** Samma beteende för **alla** utgiftskategorier (Hem, Bil, Barn, …) som för Hem i exemplen nedan.

- Användaren är på **Utgifter** och öppnar en kategori (t.ex. Hem).
- **Vänster → höger:** tillbaka till **Utgifter**-listan (stänger kategori-overlay / ett steg upp i stacken).
- När **ingen** sådan overlay är öppen: **vänster → höger** på Utgifter-huvudvyn byter huvudflik enligt **strikt cykel enligt menyn** (se ovan).

### B) Redigeringsläge (editor) inne i en kategori

- Användaren öppnar redigering av en post i kategorin.
- **Höger → vänster:** inaktiv för navigation (samma grundregel som ovan).
- **Vänster → höger:** motsvarar **Avbryt** — tillbaka till kategori**listan** (samma semantik som Avbryt-knappen).
- Efter återgång till listan: **höger → vänster** förblir inaktiv för navigation enligt undersidor-regeln.

## Övriga undersidor (Mat, lån, intäkts-overlays m.m.)

**Krav:** Tills vidare: **samma principer** där det är tekniskt rimligt — ingen **höger → vänster**-navigation med svep på undersidor; **vänster → höger** används endast där produkten uttryckligen definierar motsvarande “ett steg tillbaka” eller huvudflik enligt denna spec. (Mat m.m. kan preciseras i separat steg vid implementation.)

## Historik

**Krav:** Huvudnavigation med svep ska **inte** bygga på extra webbhistorik-lager som krockar med systemets bakåtknapp; använd `location.hash` / intern state enligt befintlig apparkitektur utan onödig `pushState` för rena flikbyten (justeras vid implementation).

## Beslut logg

| # | Beslut |
|---|--------|
| 1 | **Höger → vänster** på undersidor: **inaktiv** för navigation (svep används inte för den riktningen). |
| 2 | **Vänster → höger** på huvudvy utan overlay: **strikt cykel enligt bottenmenyns ordning**. |
| 3 | **Alla utgiftskategorier** (Hem, Bil, Barn, …): **samma** svepregler som för Hem. |
