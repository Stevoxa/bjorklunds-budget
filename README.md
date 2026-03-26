# Björklunds - Budget (PWA)

En enkel PWA (singlepage) för att hålla koll på:
- Återkommande fasta utgifter (inkl. bil/boende via specialflikar)
- Intäkter (lön/bidrag/ränteintäkter via återkommande poster)
- Enstaka poster per månad
- Matplanering månadsvis
- Återkommande kostnader för barn
- Översikt och “kvar för övriga utgifter” per månad

## Lokalt

Öppna `index.html` i en webbläsare. Appen sparar allt lokalt i `localStorage`.

## PWA

Appen registrerar en service worker (`sw.js`) för att möjliggöra offline.

## GitHub Pages

Hosta genom att lägga innehållet i repot som statiska filer (t.ex. via GitHub Pages). Se till att `index.html` och `sw.js` ligger i root.

