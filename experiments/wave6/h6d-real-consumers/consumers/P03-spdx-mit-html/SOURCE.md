# P03-spdx-mit-html source pin

Official repository: [spdx/license-list-data](https://github.com/spdx/license-list-data)

Path: `html/MIT.html` plus structured sibling `jsonld/MIT.jsonld`

| Role | Full SHA | Commit date (UTC) | Message |
| --- | --- | --- | --- |
| before | `f75839ee25cde2383fab299f6d8fc94a442f444b` | 2024-12-19T09:39:35Z | License list build b27cee3 using license list publisher 3.0.0 |
| after | `7e10095e0c9028c9e7109df00d15db46411a3378` | 2026-04-10T14:35:52Z | License list build 7c49795 using license list publisher 3.1.4 |

Author on both commits: License Publisher (maintained by Gary O'Neall).

## License / NOTICE

- Recorded as **CC-BY-3.0 AND original MIT license-text terms**.
- GitHub license API for this repo is 404; repository `license` field is null (NOASSERTION). No root `LICENSE` or `NOTICE` file.
- `accessingLicenses.md` in the same repo records the tech-report license as Creative Commons Attribution 3.0 (`CC-BY-3.0`).
- README: generated data from [license-list-XML](https://github.com/spdx/license-list-XML) via LicenseListPublisher. HTML files are snippets, not complete HTML documents.
- The MIT *license text* remains the MIT License. Wrapping selected fields into `samedaydesk.extract-batch.v0` does not change those terms.
- Held NOTICE: `fixtures/official/NOTICE.md` (1225 bytes, sha256 `b99bec7725b5349e04bc73db64c0327d0378d3ca7a847e5e687c0f905f536009`).

## Retrieval

- Method: GitHub REST `commits/{sha}` and `contents/{path}` (metadata only; file `content` omitted from store) plus `raw.githubusercontent.com` bytes.
- User-Agent: `h6d-p03-spdx-mit-html`.
- Retrieved at: `2026-09-12T06:53:00.000Z`.
- Not a live fetch of spdx.org. Job path is offline.

## Stored fixture bytes

| Path | Bytes | SHA256 |
| --- | ---: | --- |
| `fixtures/official/html.MIT.f75839ee25cd.html` | 2909 | `b749d91c8afaf1c3400b0a8a23eacebddcea0a6fbe7303b70430cc7254a3f6c3` |
| `fixtures/official/html.MIT.7e10095e0c90.html` | 2956 | `7dffa7ddfbc27ff214bca363629533cfd081e08fc8c15cfc021bef4e89a71c6a` |
| `fixtures/official/jsonld.MIT.f75839ee25cd.jsonld` | 8118 | `5eae282a5c584bc58ab5d5b34857c88406230c8049f7294495236fed28d7f973` |
| `fixtures/official/jsonld.MIT.7e10095e0c90.jsonld` | 10473 | `b38bd3237ca64348c3861dc6a8f98a5809720b3c8165c57fb2fa7d9f1a8be902` |
| `fixtures/official/README.md` | 6696 | `9d5e2eaa0daa05418074f90201d1e320fd3792018fe1a2ffdc3ebf69c9fffc44` |
| `fixtures/held/before.json` | 4043 | `924b46c8903ad0ce3700fc691142917a739addb24aea929605c07a7de721b079` |
| `fixtures/held/after.json` | 4220 | `4c7981b0bd2d55aaa3a9c1487f629d0947942bf0a238bbc48b1a3d3fcebc2559` |

Git blob SHAs (contents API): HTML `5b4bb0b9203f6394e666ff0816ccefa1a56da699` → `17dcd22e6320f2adefc25ba8b5dae9527f7f9f21`; JSON-LD `c80efa3b827b2edaa01b657b18e982b9bdb7a1ca` → `f438287762278a75d40ca243a7c31d919dd61b25`.

## Selected-field facts (caller-owned wrap)

HTML is **not** extract-batch. Held batches project `title`, `headings`, `text`, `jsonLd`.

- **title / headings**: `"MIT License"` on both revisions (unchanged; valid control).
- **text**: after HTML adds optional markup `on` after `without limitation`.
- **jsonLd**: ListedLicense `seeAlso` gains `http://opensource.org/licenses/MIT` and an xorg COPYING URL. CrossRef timestamps / blank-node ids are generator noise and are dropped.

## useful-jobs 1.4.0

- Archive: `client/public/kit/useful-jobs-1.4.0.tar.gz`
- 2575215 bytes, sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`
- Extracted under this exclusive dir: `vendor/useful-jobs-1.4.0/`
- Job: `page-change-offline-job`. `--example` refused. Clock required. `claims.fresh` stays false.
