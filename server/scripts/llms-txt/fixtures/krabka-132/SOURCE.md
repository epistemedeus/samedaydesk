# Fixture source

Captured once, labelled owner-qa, for krabka-io/krabka-io.github.io issue #132.
User-Agent: `SameDayDeskBot/1.0 (+https://samedaydesk.com/tools/ai-readiness; free AI-readiness checker; owner-qa)`.

Discovery resources, 2026-10-15T10:40:23Z (sitemap-0.xml body at 2026-10-15T10:40:52Z, same session):

| URL | Status | Bytes | sha256 |
| --- | --- | --- | --- |
| https://krabka.io/ | 200 | 60759 | c2dd81283b6b3c17efd92bedc10ccb2473ee28829feda387157c0faeb7bec156 |
| https://krabka.io/robots.txt | 200 | 69 | 3acae2cef4b7a6d7a4a3e95e6ad13f4eb8a71a171738c40e49c7faa30d9655f6 |
| https://krabka.io/sitemap.xml | 404 | 29520 | 62cbb09a3e77f3b6550a5caed654b4d248b382a13ea423453bd3b240054a7468 |
| https://krabka.io/sitemap-index.xml | 200 | 180 | eadde63f47bd674a5722a912552d095a695c5d0301643cfd1ef39435831cfa0c |
| https://krabka.io/sitemap-0.xml | 200 | 10352 | ccc93e71eb7fbcdf0ee5964741edf117d9e3e74cdfbaf58ae2f1dc0be5502a5b |
| https://krabka.io/llms.txt | 404 | 29520 | 62cbb09a3e77f3b6550a5caed654b4d248b382a13ea423453bd3b240054a7468 |

Page heads, 2026-10-15T10:56:07Z, stored minimized in pages.json (title, meta description, canonical, byte size, sha256). Full HTML for those pages is not committed. `/docs/quickstart/` was 200, 93306 bytes, sha256 5402007976712e62c5f196cc1f380ea8bbce7ca0327c8cc9f6f91941311dc3ac. No page head carried `rel="describedby"` or a `text/markdown` alternate (only an RSS alternate).

`home.min.html` keeps the captured title, meta description, canonical, RSS alternate, and the six `<nav>` blocks. It is not the raw homepage. Minimized sha256 20af355eaf4c1c6d43f47428015b9552943eab414e020773b47f5fbfd718bd72 (12309 bytes). `/docs/quickstart` does not appear in that homepage. It is a `<loc>` in sitemap-0.xml, the only child of sitemap-index.xml, which is the only `Sitemap:` line in robots.txt. One index level reaches it. `include=` is not required.

The 404 HTML for `/sitemap.xml` and `/llms.txt` is not committed. `robots.txt`, `sitemap-index.xml`, and `sitemap-0.xml` are the captured bytes.
