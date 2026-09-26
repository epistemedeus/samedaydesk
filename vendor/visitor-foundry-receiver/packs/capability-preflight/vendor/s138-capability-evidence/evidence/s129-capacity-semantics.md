# S129 capacity raw semantics (preserved)

From `experiments/s126-ein-agent-distribution/cells/s129/CAPACITY.md`:

| Phase | MemAvailable |
| --- | --- |
| Admit | 13996788 KiB |
| Overlap (~8s) | 13743928 KiB |
| Complete | 13998644 KiB |

Delta (admit − overlap) = 252860 KiB ≈ 246.9 MiB (~247 MiB).

This is **available memory at overlap** 13,743,928 KiB and a **~247 MiB delta**, not "257 MiB remaining".
