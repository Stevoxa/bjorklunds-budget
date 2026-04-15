# Content-Security-Policy (CSP)

Den byggda appen som ligger på GitHub Pages är den enda driftsatta miljön: samma kod som i repot, samma beteende som vid lokal körning över HTTP.

## Resurser och ursprung

- Skript laddas från samma ursprung (`'self'`): bland annat `app.js` (modul), `theme-assets.js`, `vault.js`, `vendor/chart.umd.min.js`.
- Appen använder `blob:`-URL:er för media och ikoner där så är implementerat.
- Kryptografi sker via Web Crypto API i `vault.js` (ingen tredjepartstjänst för nycklar i denna kodbas).

## Var policy sätts

CSP som **HTTP-svarheader** från värd (t.ex. Cloudflare, Netlify `_headers`, nginx) går att ändra utan ny deploy av `index.html`. Meta-taggen `http-equiv="Content-Security-Policy"` kräver deploy av HTML vid policyändring.

## Referenspolicy (HTTP-header)

Exempel på en komplett direktivrad (radbrytningar endast för läsbarhet; i produktion ska det vara en header per policy eller sammanslagen enligt värdens format):

```
Content-Security-Policy:
  default-src 'self';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  script-src 'self';
  style-src 'self';
  img-src 'self' data: blob:;
  media-src 'self' blob:;
  font-src 'self';
  connect-src 'self';
  worker-src 'self';
  manifest-src 'self';
  upgrade-insecure-requests;
```

Infasning sker med `Content-Security-Policy-Report-Only` och samma direktivlista. Efter granskade rapporter byts headern till enforce-varianten. Verifiering ska ske mot exakt den URL som användarna laddar (GitHub Pages-domänen).

## GitHub Pages

GitHub Pages tillåter inte anpassade säkerhetsheaders. CSP kan i så fall endast sättas via meta i `index.html`, eller genom att fronten hostas på en tjänst som stöder egna headers.

## Kända interaktioner

- **Chart.js** (`vendor/chart.umd.min.js`): vissa byggen kräver `script-src 'wasm-unsafe-eval'` när diagram renderas; utöka `script-src` minimalt om konsolen rapporterar blockering där.
- **Blob för media/ikoner:** `media-src` och `img-src` måste inkludera `blob:` om respektive resurs laddas som blob-URL.
