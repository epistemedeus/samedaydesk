# Vendored git object store

Bare git directory containing one captured object:

`072f8d04026bb29a62dbf8a761a2ae62abbdc663` — commit (Verantis PR2 head).

```
git --git-dir=tools/contribution-provenance/fixtures/object-store cat-file -t 072f8d0
```

prints `commit` and exits 0.

This is a local object database for `git cat-file`. It is not a project clone,
not a GitHub fetch at runtime, and not adoption evidence. The tool never
contacts `m9labs-railscope/verantis-mcp` or x402 Pulse.
