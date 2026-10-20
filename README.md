# Björklunds Budget

[![CI](https://github.com/Stevoxa/bjorklunds-budget/actions/workflows/ci.yml/badge.svg)](https://github.com/Stevoxa/bjorklunds-budget/actions/workflows/ci.yml)
[![Licens: MIT](https://img.shields.io/badge/licens-MIT-blue.svg)](LICENSE)

Budgetapp för hushållets ekonomi som körs helt i webbläsaren och kan installeras som app.
All data krypteras och stannar på enheten: ingen server, inget konto, inga externa anrop.

**[Öppna appen →](https://stevoxa.github.io/bjorklunds-budget/)**

<!--
Skärmbilder: lägg dem i docs/screenshots/ och ta bort kommentaren.

<p align="center">
  <img src="docs/screenshots/analys.png" width="260" alt="Analysvyn med diagram över månadens intäkter och utgifter">
  <img src="docs/screenshots/aterkommande-post.png" width="260" alt="Registrering av en återkommande utgift">
  <img src="docs/screenshots/manadsvy.png" width="260" alt="Månadsvy med enstaka utgifter">
</p>
-->

## Säkerhet och integritet

- **Krypterat valv.** Lösenfrasen härleds med PBKDF2-SHA256 (350 000 iterationer) till en AES-256-GCM-nyckel via Web Crypto API. Valvet lagras krypterat i IndexedDB, och nyckeln finns bara i minnet medan appen är upplåst. Se [`vault.js`](vault.js).
- **Biometrisk upplåsning (valfritt).** Med WebAuthn-tillägget PRF kan valvet låsas upp med fingeravtryck eller ansikte i webbläsare som stöder det. Lösenfrasen fungerar alltid.
- **Krypterad backup.** Valvet kan exporteras till en fil skyddad med ett eget lösenord och importeras på en annan enhet.
- **Inget lämnar enheten.** Skript, typsnitt och Chart.js levereras från samma ursprung. Appen gör inga anrop till tredje part och har ingen analys eller spårning.

> [!IMPORTANT]
> Det finns ingen återställning av lösenfrasen. Glömmer du den går datan inte att låsa upp. Ta regelbundet en krypterad backup.

## Funktioner

- **Intäkter:** återkommande poster (lön, bidrag, kapital, gåvor) med utbetalningsdag, intervall och löneperioder
- **Utgifter:** återkommande poster per område (hem, lån, bil, mat, barn) och enstaka utgifter per månad
- **Matbudget:** veckobaserad planering av matkostnader
- **Sparande:** planerat sparande med intervall och mål
- **Analys:** diagram per månad och hur mycket som blir kvar för övriga utgifter
- **Teman:** egen startbild, startfilm och ikonpaket
- **Offline:** installerbar på hemskärmen, fungerar utan nät via service worker

## Kom igång

1. Öppna [appen](https://stevoxa.github.io/bjorklunds-budget/) i mobilens webbläsare.
2. Lägg till den på hemskärmen.
3. Skapa ett valv med en lösenfras, eller importera en backup.
4. Lägg in intäkter och utgifter.

## Utveckling

Appen har ingen byggprocess. Filerna i repot är exakt det som publiceras på GitHub Pages.

```bash
npm ci          # utvecklingsverktyg (ESLint, Vitest)
npx serve .     # valfri statisk server; service worker kräver http(s), inte file://
npm test        # Vitest
npm run lint    # ESLint
```

Lägg till `?debug=1` i adressen för att visa diagnostik i appen, se [docs/DEBUG.md](docs/DEBUG.md).

## Teknik

- Vanilla JavaScript utan ramverk eller bundler; `app.js` laddas som ES-modul
- IndexedDB + Web Crypto API för valvet, WebAuthn PRF för biometrisk upplåsning
- [Chart.js](https://www.chartjs.org/) 4.4.1, vendrad i `vendor/`
- Service worker (`sw.js`) med versionerad cache för app-skalet
- ESLint med `eslint-plugin-no-unsanitized` som flaggar riskabla DOM-anrop
- Vitest för enhetstester av fristående logik i `lib/`
- GitHub Actions kör lint och tester vid varje push och pull request

## Dokumentation

| Dokument | Innehåll |
| --- | --- |
| [docs/CSP.md](docs/CSP.md) | Referenspolicy för Content-Security-Policy och hur den kan fasas in, inklusive begränsningarna på GitHub Pages |
| [docs/DEBUG.md](docs/DEBUG.md) | Utvecklarläge: hur diagnostikmeddelanden slås på och av |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Prestandamätning med Lighthouse och kända kostnader i kodbasen |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Kontroller före release: lint, tester, cacheversion och röktest |

## Licens

[MIT](LICENSE). Chart.js i `vendor/` har sin egen MIT-licens.
