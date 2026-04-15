# Utvecklarläge (opt-in)

I standardläge visas inte tekniska diagnostikmeddelanden (routingfel, råa JS-/Promise-fel) i den gröna toast-rutan. De skrivs till konsolen som `console.warn` eller `console.error` med prefix `[bjk]` eller etiketterna `JS-fel` / `Promise-fel`.

Fel som direkt påverkar användaren (t.ex. att valvet inte kan sparas) visas alltid i toast.

## Aktivera

**Session:** Lägg till frågeparametern `debug=1` i sidans URL före hashfragmentet, till exempel `https://<host>/<path>/?debug=1#/analysis`. Parametern tas bort från adressfältet via `history.replaceState`; läget lagras i `sessionStorage` under nyckeln `bjk_debug_session` tills fliken stängs.

**Beständigt på enheten:** Kör i webbläsarens konsol:

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
