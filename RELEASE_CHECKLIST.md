# Checklista vid release

Kort lista innan du publicerar en ny version till användare (t.ex. GitHub Pages).

## Lokalt innan du pushar / bygger

- [ ] **`npm install`** (första gången eller efter ändringar i `package.json`).
- [ ] **`npm run lint`** — ESLint med `eslint-plugin-no-unsanitized` (varningar för riskabla DOM-metoder). Ska avsluta utan fel; åtgärda nya varningar innan release.
- [ ] **`npm test`** — kör Vitest (enhetstester för hash-routing m.m.).
- [ ] **CSP (valfritt):** läs `docs/CSP.md` och överväg headers i staging innan ni sätter strikt CSP i prod.
- [ ] **Prestanda (valfritt):** manuell Lighthouse enligt `docs/PERFORMANCE.md`.

## Service worker-cache

- [ ] Öka **`CACHE_NAME`** i `sw.js` vid varje release som ändrar cache-listan eller skal-filer (t.ex. `bjorklunds-budget-v29` → `v30`) så att klienter hämtar ny app-shell och gamla cache-versioner rensas vid aktivering.
- [ ] Om du lagt till **nya statiska filer** som ska fungera offline: lägg dem i både `ASSETS_TO_CACHE` och verifiera att `fetch`-hanteraren matchar dem om de ska vara network-first (se kommentar i `sw.js` vid `isAppShell`).

## Snabb manuell röktest (ca 10–15 min, rekommenderat)

- [ ] **Valv:** lås upp med lösenord, lås (eller vänta tills session känns stabil), lås upp igen.
- [ ] **Utgift:** öppna Utgifter → öppna en post → ändra belopp eller datum → Spara → kontrollera att listan uppdateras.
- [ ] **Intäkt:** öppna Intäkter → öppna en post eller lägg till testpost → Spara → kontrollera listan.
- [ ] **Navigering:** byt mellan Analys, Intäkter, Utgifter, Spara, Inställningar och tillbaka; inga överlägg ska “fastna” utan synlig stängning.
- [ ] **Inställningar → Hjälp:** öppna hjälpvyn; prova gärna länk med `?section=help-pwa-home-screen` om ni använder den.
- [ ] **Mat / annan överlägg:** om du ändrat mat eller andra överlägg nyligen — öppna, spara, stäng utan krasch.

## Efter deploy

- [ ] Öppna sidan i **inkognito** eller efter hård uppdatering och bekräfta att rätt version laddas (nytt beteende syns som förväntat).
