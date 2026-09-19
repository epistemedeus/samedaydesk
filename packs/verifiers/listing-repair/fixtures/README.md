# Fixtures

`cold/` packets are unmodified `listing-repair-packet` output from useful-jobs
1.4.7 (`repair-packet.json`). Sources wrap the kit listing inputs
(`samples/listing/caller-alpha.json`, `samples/listing/mismatch.json`,
`samples/listing/partial.json`). `input-alpha.packet.json` is `--input`
caller-alpha (not `--example`).

`reject/` adds oracle-side overlays (legacy `corrections[]`, publish attempt,
claimed `accepted_correction` on a refused mismatch packet). Those overlays are
not engine output.
