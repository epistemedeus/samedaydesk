# Portfolio discovery acceptance

Catalog-driven HTTP probes for SameDayDesk, EIN.LLC, and Neomorphic.io.

The catalog in `catalog.json` is the only origin list. Checks record observed
HTTP facts (`ok`, `missing`, `invalid`, `not_applicable`). They do not score
rankings or invent adoption.

```
npm run test:portfolio-discovery
npm run test:portfolio-discovery:live
npm run test:portfolio-search-readiness:live
```

`--mode search-readiness` adds canonical-origin, robots sitemap declaration,
sitemap URL integrity, a bounded sitemap HTTP sample, JSON-LD identity where
declared, same-origin llms.txt machine references, and hreflang reciprocity
only when a page declares hreflang. Crawlability is an HTTP evaluation.
Indexing, ranking, GEO citation, and traffic stay `not_observed`.

Default CLI output is compact JSON. Pass `--pretty` to indent.

The live commands are not part of `npm run build` or the ordinary test scripts.
They need no credentials, payment, browser, analytics, or background service.
