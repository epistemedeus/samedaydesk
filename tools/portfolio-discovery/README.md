# Portfolio discovery acceptance

Catalog-driven HTTP probes for SameDayDesk, EIN.LLC, and Neomorphic.io.

The catalog in `catalog.json` is the only origin list. Checks record observed
HTTP facts (`ok`, `missing`, `invalid`, `not_applicable`). They do not score
rankings or invent adoption.

```
npm run test:portfolio-discovery
npm run test:portfolio-discovery:live
```

The live command is not part of `npm run build` or the ordinary test scripts.
It needs no credentials, payment, browser, analytics, or background service.
