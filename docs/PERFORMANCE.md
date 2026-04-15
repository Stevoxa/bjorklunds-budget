# Prestanda (Lighthouse)

Körning sker manuellt mot den version som ligger på GitHub Pages (samma artefakt som vid lokal körning via statisk HTTP-server).

## Steg i Chrome

1. Öppna appens URL i ett inkognitofönster.
2. Öppna utvecklarverktyg (F12) och fliken **Lighthouse** (eller motsvarande **Insights** beroende på Chrome-version).
3. Välj enhetstyp **Mobil** och kategorierna **Prestanda** och **Tillgänglighet**.
4. Kör analysen mot startsidan. Om appen kräver upplåst valv, lås upp först och kör sedan analysen.

## Faktorer i den här kodbasen

- `index.html` är en enda stor HTML-fil; det ökar parsningskostnad jämfört med uppdelad markup.
- `app.js` laddas som ES-modul och är stor; första besöket belastar nätverk och JS-motorn. Service worker cache minskar kostnaden vid återbesök.
- Startfilm och liknande media hämtas från nätverket första gången; appen cachelagrar enligt egen logik efter första användning.

## Kommandorad

Lighthouse CLI körs med `npx lighthouse@11` mot den publicerade bas-URL:en; flaggor och utdataformat följer verktygets dokumentation. Ett CI-jobb som kör samma kommando kräver utgående nätverksåtkomst från körningsmiljön till den URL:en.
