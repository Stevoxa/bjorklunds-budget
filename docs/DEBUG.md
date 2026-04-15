# Utvecklarläge (opt-in)

I **produktion** (standard) visas inte tekniska diagnostikmeddelanden som rutningsfel eller råa JS-fel i den gröna toast-rutan — de loggas som `console.warn` / `console.error` med prefix `[bjk]` eller `JS-fel` / `Promise-fel`.

Fel som **påverkar användaren** (t.ex. att valvet inte kan sparas) visas alltid.

## Aktivera

**En session:** lägg till `?debug=1` i sidans URL (före hash fungerar, t.ex. `https://exempel.se/app/?debug=1#/analysis`). Parametern tas bort från adressfältet och läget sparas i `sessionStorage` tills fliken stängs.

**Beständigt på enheten:** i webbläsarens konsol:

```js
localStorage.setItem("bjk_debug", "1");
location.reload();
```

## Stäng av

```js
localStorage.removeItem("bjk_debug");
sessionStorage.removeItem("bjk_debug_session");
location.reload();
```
