# Prestanda (Lighthouse / manuellt)

## Snabb kontroll i Chrome

1. Öppna appen (gärna **inkognito**).
2. **F12** → fliken **Lighthouse** (eller **Verktyg för webbutvecklare** → *Lighthouse* / *Insights* beroende på version).
3. Välj **Mobil**, kategorierna **Prestanda** + ev. **Tillgänglighet**.
4. Kör analys mot startsidan efter upplåsning om valv krävs.

## Vad som ofta påverkar den här typen av PWA

- **Stor HTML** (`index.html` i en fil) — ökar parse/HTML-arbete; acceptabelt om Lighthouse-total ändå är grön.
- **Första laddning av `app.js`** — modul + stor fil; cache via service worker hjälper återbesök.
- **Startfilm** — nätverk första gången; lokalt cachelagrat efter första spelning enligt appens logik.

## CI (valfritt)

Du kan köra Lighthouse i CI med t.ex. `npx lighthouse@11 …` mot din **publicerade GitHub Pages-URL** (samma som prod); kräver att jobbet har nätverksåtkomst till den adressen.
