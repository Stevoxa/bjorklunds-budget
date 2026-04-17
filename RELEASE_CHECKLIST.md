# Checklista vid release

Kort lista innan du pushar till GitHub (dvs. innan ändringen når användare).

---

## Produktion och debug

GitHub Pages-versionen **är** produktion — samma kod och samma förväntningar som för slutanvändare. Det finns ingen separat staging-miljö i detta repo.

- Diagnostik-toasts är **av** som standard.
- Utvecklarläge aktiveras manuellt — se **`docs/DEBUG.md`**.

---

## Innan du pushar

- [ ] **`npm install`** — första gången eller efter ändringar i `package.json`.
- [ ] **`npm run lint`** — ESLint med `eslint-plugin-no-unsanitized` (varningar för riskabla DOM-metoder). Ska avsluta utan fel; åtgärda nya varningar innan release.
- [ ] **`npm test`** — Vitest (enhetstester för hash-routing m.m.).
- [ ] **CSP (vid behov)** — läs `docs/CSP.md`. Inför inte strikt CSP “på chans” mot den publicerade sidan; använd **Report-Only** eller verifiera policy mot din **riktiga GitHub Pages-URL** innan enforce så du inte låser ut användare.
- [ ] **Prestanda** — manuell Lighthouse enligt `docs/PERFORMANCE.md` (rekommenderat innan större UI-/laddningsändringar).

---

## Service worker-cache

- [ ] **Höj `CACHE_NAME`** i `sw.js` vid varje release som ändrar cache-listan eller app shell (t.ex. `bjorklunds-budget-v32` → `v33`) så att klienter hämtar ny shell och gamla cache-versioner rensas vid aktivering.
- [ ] **Nya statiska filer** som ska fungera offline: lägg dem i `ASSETS_TO_CACHE` och verifiera att `fetch`-hanteraren matchar dem om de ska vara network-first (se kommentar i `sw.js` vid `isAppShell`).

---

## Snabb manuell röktest (ca 10–15 min)

Rekommenderat innan release.

- [ ] **Valv** — lås upp med lösenord, lås (eller vänta tills session känns stabil), lås upp igen.
- [ ] **Utgift** — Utgifter → öppna en post → ändra belopp eller datum → Spara → listan uppdateras.
- [ ] **Intäkt** — Intäkter → öppna en post eller lägg till testpost → Spara → listan stämmer.
- [ ] **Navigering** — byt mellan Analys, Intäkter, Utgifter, Spara, Inställningar och tillbaka; inga överlägg ska “fastna” utan synlig stängning.
- [ ] **Inställningar → Hjälp** — öppna hjälpvyn; prova gärna länk med `?section=help-pwa-home-screen` om ni använder den.
- [ ] **Mat / andra överlägg** — om du ändrat dem nyligen: öppna, spara, stäng utan krasch.

---

## Efter deploy

- [ ] Öppna sidan i **inkognito** eller efter hård uppdatering och bekräfta att rätt version laddas (nytt beteende syns som förväntat).
