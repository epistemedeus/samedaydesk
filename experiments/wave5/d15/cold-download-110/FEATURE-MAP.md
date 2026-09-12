# Feature map — W5-D15 cold-download-110

| Field | Value |
| --- | --- |
| User goal | Execute the public useful-jobs 1.1.0 archive as a cold customer on a Cloud VM, outside a Git checkout, with independent inputs and no product edits. |
| Entrypoint | `experiments/wave5/d15/cold-download-110/` |
| Public archive | D01 `5579cfde` `client/public/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz` |
| Ordinary command | `cd useful-jobs-1.1.0 && node bin/useful-jobs.mjs …` |
| Tests | `node --test experiments/wave5/d15/cold-download-110/test/*.test.mjs` |
| Not product | This harness. No D01/kernel/homepage edits. Sol Pro source review on `d2a0d0b2` is not duplicated. |
| Account prerequisite | None. Offline. No wallet, model, or payment calls during analysis. |
