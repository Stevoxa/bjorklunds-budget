# Content-Security-Policy (CSP)

Appen laddar **endast externa skript** från samma ursprung (`theme-assets.js`, `vault.js`, `chart`, `app.js` som modul). Den använder **blob:-URL:er** för video/ikoner och **Web Crypto** i `vault.js`.

## Rekommenderat utgångsläge

Sätt CSP som **HTTP-svarheader** av värd (Cloudflare, Netlify `_headers`, nginx m.m.) i stället för meta om du kan — då går det att rotera policy utan ny deploy av `index.html`.

Förslag (justera efter faktiska behov; testa i staging):

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

### Om något blockeras

- **Chart.js** (`vendor/chart.umd.min.js`): om konsolen visar CSP-fel vid diagram, kan vissa bundlar kräva `script-src 'wasm-unsafe-eval'` eller liknande — lägg till **minst möjliga** undantag.
- **Blob för startfilm/ikoner**: `media-src` och `img-src` behöver `blob:` om ni ser blockeringar där.

## Report-Only för infasning

Använd först:

`Content-Security-Policy-Report-Only: … samma direktiv …`

…och en `report-to` / `report-uri` om du vill samla rapporter. Granska varningar innan ni byter till **enforce**-header.

## GitHub Pages

Vanlig GitHub Pages tillåter **inte** egna säkerhetsheaders. Då är alternativen:

- Meta-taggen `http-equiv="Content-Security-Policy"` (svårare att underhålla; testa noggrant), eller
- Flytta fronten till en host med header-stöd.
