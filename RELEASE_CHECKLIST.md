# Checklista vid release

Kort lista innan du publicerar en ny version till användare (t.ex. GitHub Pages).

## Service worker-cache

- [ ] Öka **`CACHE_NAME`** i `sw.js` (t.ex. `bjorklunds-budget-v28` → `v29`) så att klienter hämtar ny app-shell och gamla cache-versioner rensas vid aktivering.
- [ ] Om du lagt till **nya statiska filer** som ska fungera offline: lägg dem i både `ASSETS_TO_CACHE` och verifiera att `fetch`-hanteraren matchar dem om de ska vara network-first (se kommentar i `sw.js` vid `isAppShell`).

## Snabb manuell röktest (valfritt men rekommenderat)

- [ ] Lås upp valv → öppna en huvudvy → spara en ändring.
- [ ] Byt flik i bottennav och tillbaka.
- [ ] Öppna **Inställningar → Hjälp** (ev. länk med `?section=help-pwa-home-screen` om ni använder den).

## Efter deploy

- [ ] Öppna sidan i **inkognito** eller efter hård uppdatering och bekräfta att rätt version laddas (nytt beteende syns som förväntat).
