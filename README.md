 ____  _             _    _                 _     
| __ )(_) ___  _ __ | | _| |_   _ _ __   __| |___ 
|  _ \| |/ _ \| '__|| |/ / | | | | '_ \ / _` / __|
| |_) | | (_) | |   |   <| | |_| | | | | (_| \__ \
|____/| |\___/|_|   |_|\_\_|\__,_|_| |_|\__,_|___/
   |___/ 
 ____            _            _   
| __ ) _   _  __| | __ _  ___| |_ 
|  _ \| | | |/ _` |/ _` |/ _ \ __|
| |_) | |_| | (_| | (_| |  __/ |_ 
|____/ \__,_|\__,_|\__, |\___|\__|
                   |___/          

# Björklunds Budget (PWA)

En budgetapp för att planera, registrera och följa upp privatekonomi. Designad för mobil användning som PWA och körs direkt i webbläsaren.

## Funktioner

- Hanterar intäkter (lön, bidrag, kapital, gåvor) som återkommande poster  
- Hanterar utgifter (Hem, lån, bil, mat, barn) som återkommande poster  
- Hanterar enstaka utgifts poster per månad  
- Diagram för visuell analys  

## Kom igång

1. Öppna `index.html` i en webbläsare  
2. Lägg till appen på hemskärmen  
3. Skapa en budget eller importera data  
4. Börja registrera intäkter och utgifter  

## Teknik

- Vanilla JavaScript  
- IndexedDB / LocalStorage  
- Service Worker (`sw.js`) för offline-stöd  
- Responsiv design (mobil-först)  


## Data

All data lagras lokalt på enheten. Ingen extern server används.

## PWA

Appen kan installeras på hemskärmen och fungerar offline via service worker.

## GitHub Pages

Appen kan hostas som statiska filer (t.ex. via GitHub Pages).  
Se till att `index.html` och `sw.js` ligger i root.

















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

