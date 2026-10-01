# Withheld human delta

Current main's public footer, `client/public/llms.txt`, `client/public/sitemap.xml`, and `client/vite.config.ts` are unchanged in this machine release.

The inherited branch had added this footer link, plus matching llms.txt and sitemap lines and a Vite dev proxy:

```html
<a href="/agent-readiness">Agent readiness checker</a>
```

That link is not published here. The existing `/agent-readiness` machine route remains available to callers that already use it. This note is the separated preview of the withheld line.
