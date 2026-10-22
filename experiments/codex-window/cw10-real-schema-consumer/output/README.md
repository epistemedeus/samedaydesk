# Observed consumer readback

`report.json` ties the exact official source files to released 1.4.0 and CW14
`8b75201761a8b58a6d00f16d9eb825c15fc5b68b`. The adjacent source pair is now the
parent and change commit, so the old later-head receipt has been replaced.

`released-keywords` and `candidate-keywords` are actual CLI reports over those
schema files. `released-projection` and `candidate-projection` use the explicitly
derived root-keyword fixtures under `regression/`. Full-root refusals are in the
main report. Audit exit 0 means the counterexample reproduced; the actual
compatibility gate exits 1.

The TAP files are local owner-authored/consumer test evidence. The upstream
readback verifies immutable public file bytes, not independent product use.
