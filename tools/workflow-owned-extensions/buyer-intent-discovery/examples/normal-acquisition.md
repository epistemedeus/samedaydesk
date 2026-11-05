# E07 buyer-intent discovery

Outcome: no_fit
No open candidate describes a supported problem within the offline service boundaries. This page is not a demand census.
Acquisition: recorded; vocabulary; 2026-11-05T20:38:11.171Z UTC; API 2022-11-28
Query: is:issue is:public "extract-batch" "compare" in:title,body
Open problem fits: 0; needs_scope: 0; scope inquiries: 0; execution ready: 0
Read-only. Problem fit, contact readiness, execution readiness, and paid intent are separate.
No purchase, reply, contact, execution, commission, or observed payment is claimed.

## no_fit: Add length-aware batched device API for CosyVoice feature extraction
https://github.com/latentforge/VoiceStudio/issues/20
Label: source_record
State: open; created: unknown; updated: 2026-10-23T15:45:31Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: CosyVoiceV1FeatureExtractor._mel_spectrogram already accepts rectangular tensor batches and follows the tensor device. The public feature extractor flattens batch input into one waveform, so callers cannot use CUDA preprocessing for variable-length waveform batches.  Please add a public processor or feature-extractor API that takes padded waveforms, per-waveform lengths, and a sampling rate. It sh
Boundary: No supported offline problem is established in the source text.

## no_fit: fix(mkv-core): extract mode lets .mkv/.MKV siblings overwrite each other's sidecars
https://github.com/Si-Forces/mkvanimebatch/issues/193
Label: source_record
State: open; created: unknown; updated: 2026-11-04T11:02:05Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: Follow-up to #175, which refuses colliding destinations in remux mode only.  ## Problem  Extract mode has the same collision. Discovery reads the _.mkv_ extension case-insensitively (_scan.rs_), so _Show - 01.mkv_ and _Show - 01.MKV_ in one directory are two items with the same file stem. _extract.rs_ names every sidecar from that stem:  - subtitle: _{stem}_{EpLabel}{ep}_{lang}_track{id}.ass_ - ch
Boundary: No supported offline problem is established in the source text.

## no_fit: istep not passed to _compute_loss_ during validation (context-loss warmup stuck at 0)
https://github.com/ecmwf/WeatherGenerator/issues/2943
Label: source_record
State: open; created: unknown; updated: 2026-10-20T19:06:59Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: # Description  Follow-up to #2720 / #2722 (on _develop-ssl-diffusion-v1_). The training path now passes _istep_ through _LossCalculator.compute_loss_ to the loss modules, but the validation call does not:  _src/weathergen/train/trainer.py_ (validate): ___python _ = self.loss_calculator_val.compute_loss(     preds=preds,     targets_and_aux=targets_and_auxs,     metadata=extract_batch_metadata(batc
Boundary: No supported offline problem is established in the source text.

## no_fit: Extract batch runner / Ralph loop / circuit breaker out of core - should be a tool built on the runner
https://github.com/starigazdam/ai-workflow-runner/issues/9
Label: source_record
State: open; created: unknown; updated: 2026-08-23T18:41:32Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: ## Context  Follow-up to discussion in #8. Comparing our core against LangChain/LangGraph turned up real overlap - see the wheel-reimplementation analysis below.  ## Overlap findings  | Our code | LangGraph/LangChain equivalent | Overlap | |---|---|---| | _WorkflowEngine_ + _PhaseExecutor_ + _routing.ts_ | LangGraph _StateGraph_ (nodes, edges, conditional routing) | High | | _ContextStore_ (disk p
Boundary: No supported offline problem is established in the source text.

## no_fit: Dedupe map assets and bake static batches at extract time
https://github.com/AKJama/sekiro-rs/issues/118
Label: source_record
State: open; created: unknown; updated: 2026-10-19T18:14:37Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: ## Problem _sekiro-extract map_ writes each block's own copy of shared models and DDS textures, so connected blocks load byte-identical assets under different paths. PR #117 (#98) undoes this at runtime: it hashes and compares every streamed texture and mesh, aliases render assets, and retires static-batch source meshes from the GPU by editing Bevy's extraction queue. That works (9.5 GB to 7.4 GB
Boundary: No supported offline problem is established in the source text.

## no_fit: Improve image-export throughput with persistent workers, bounded parallelism, and pipelined archive batches
https://github.com/NL-BioImaging/biomero-scripts/issues/38
Label: source_record
State: open; created: unknown; updated: 2026-10-12T13:19:23Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: ## Problem  Large image selections spend substantial time preparing inputs before Slurm processing starts.  On our local Windows/Docker Desktop deployment, a sample of 40 images averaged approximately:  | Stage | Average per image | |---|---:| | Zarr export | 4.1 seconds | | Pixel-identity checks and canonical promotion attempt | 1.0 second | | Total preparation | 5.1 seconds |  Each image contain
Boundary: Implementation-only UI, dashboard, browser, or bug-fix work is outside the supported offline services.

## no_fit: bloomctl: batch-ingest-result doesn't cross-check RunManifest.pipeline_run_id against envelope provenance
https://github.com/Salk-Harnessing-Plants-Initiative/bloom/issues/703
Label: source_record
State: open; created: unknown; updated: 2026-09-16T18:17:31Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: ## Context  Found during review of bloom #678 / PR #697 (scope _cyl batch-ingest-result_ discovery to the RunManifest).  ## The gap  _discover_envelopes_ scopes discovery purely by **scan_key** (matching a manifest's _scan_keys_ against filename stems). _RunManifest.pipeline_run_id_ is a required field, successfully parsed, but never read or compared against anything - in particular, never cross-c
Boundary: No supported offline problem is established in the source text.

## no_fit: Implement batch_extract() with parallel processing support
https://github.com/SkanderMulder/extractoR/issues/12
Label: source_record
State: open; created: unknown; updated: 2025-11-22T11:58:26Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: Enable efficient batch processing of large document collections with parallel execution.  ## Example API ___r # Sequential batch results _- batch_extract(texts, schema)  # Parallel batch with furrr results _- batch_extract(   texts,   schema,   .parallel = TRUE,   .workers = 4 ) ___  ## Tasks - _ _ Create _batch_extract()_ function - _ _ Support sequential processing (default) - _ _ Add _.parallel
Boundary: No supported offline problem is established in the source text.

## no_fit: GROUPS frames and bounded rank split peers with logically equal nested dictionary nulls
https://github.com/apache/datafusion/issues/26689
Label: source_record
State: open; created: unknown; updated: 2026-10-23T23:25:12Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: ### Describe the bug  Two one-element Arrow lists can both represent __NULL__ when one contains a null dictionary key and the other contains a key pointing to a null dictionary value. _GROUPS BETWEEN CURRENT ROW AND CURRENT ROW_ counts one row in each group. _rank()_ and _dense_rank()_ also split the peers when the planner chooses _BoundedWindowAggExec_.  ### To reproduce  Register this two-row ba
Boundary: No supported offline problem is established in the source text.

## no_fit: Batch tokenization/inference for sentence and pair classification
https://github.com/Godfrey2712/IntentifierBench/issues/6
Label: source_record
State: open; created: unknown; updated: 2026-08-04T22:19:26Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: Motivation  extract_classification and extract_classification_pairs perform per-sentence or per-pair tokenizer+model calls in a loop. Batching sentences into a single tokenizer/model call will reduce overhead and improve throughput, especially on GPU.  Tasks  1. Modify extract_classification to accept a batch size and tokenize a list of sentences at once using tokenizer(sentences, return_tensors='
Boundary: Implementation-only UI, dashboard, browser, or bug-fix work is outside the supported offline services.

## no_fit: Safe archive entry names for batch uploads
https://github.com/fabiantax/zero-allocation-fileupload/issues/134
Label: source_record
State: open; created: unknown; updated: 2026-09-30T14:55:33Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: ## Story  As a caller who extracts the batch archive, I want every entry name to be safe on common file systems, so that extracting the ZIP never fails or produces a misleading file.  ## Background  Batch entry names come from the validated _FileName_ (ADR-0011, "Names"), which already rejects path separators, _._ and _.._. Reviewing the batch session (#114, PR #130) showed names it still accepts
Boundary: No supported offline problem is established in the source text.

## no_fit: ANTIRRUIDO - auditar y depurar ramas históricas de Knowledge y PC con evidencia de conservación
https://github.com/sierraglobalcompany-rgb/CarpiNova-Knowledge/issues/117
Label: source_record
State: open; created: unknown; updated: 2026-10-21T06:41:43Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: ## Hallazgo / objetivo  Tras cerrar **MVP5 (#113)** y **fidelidad p0192 (#114)**, los repositorios CarpiNova-Knowledge y CarpiNova-PC tienen **cero Issues y PR abiertos** y sus CI de integración están GREEN. La revisión de antirruido detectó **377 ramas remotas en Knowledge** (376 fuera de _main_) y **56 en PC** (55 fuera de _main_) = **431 referencias no-main**. No confundir este conteo con commi
Boundary: No supported offline problem is established in the source text.

## no_fit: unstructured2graph: GLiNER2Backend has no cross-chunk coreference and no batched reconciliation path (LightRAG has both)
https://github.com/memgraph/ai-toolkit/issues/339
Label: source_record
State: open; created: unknown; updated: 2026-09-16T11:58:19Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: ## What  GLiNER2Backend (#330) and LightRAGBackend are both _ExtractionBackend_ implementations, but two aspects of LightRAG's behavior have no GLiNER2 equivalent today. Neither is a bug (#336/#338 already fixed the actual bug, GLiNER2's context-window truncation) -- these are architecture gaps worth closing deliberately.  ### 1. No cross-chunk entity coreference  LightRAG's LLM merges "the same"
Boundary: Implementation-only UI, dashboard, browser, or bug-fix work is outside the supported offline services.

## no_fit: Merge existing fixes from forks
https://github.com/marin-m/pbtk/issues/41
Label: source_record
State: open; created: unknown; updated: 2026-05-16T04:18:46Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: Potential merges:  * _dex2jar_ update + _RepeatedScalarFieldContainer_ fix https://github.com/marin-m/pbtk/compare/master...Davis-3450:pbtk:master * similar but more recent (merge?): https://github.com/marin-m/pbtk/compare/master...TimLChan:pbtk:master * _RepeatedScalarFieldContainer_ fix only https://github.com/marin-m/pbtk/compare/master...imLinguin:pbtk:master * Global refactor: https://github.
Boundary: No supported offline problem is established in the source text.

## no_fit: Add self-supervised speech embedding interface
https://github.com/polarbear0122/speech-deepfake-detection-toolkit/issues/3
Label: source_record
State: open; created: unknown; updated: 2026-09-10T11:10:01Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: ## Goal Add a model-agnostic interface for extracting utterance- or frame-level embeddings from self-supervised speech encoders.  ## Scope - Common extractor API - Device and batching controls - Optional layer selection - Frame-level and pooled output modes - Feature caching with explicit metadata  ## Motivation A shared interface will make it easier to compare handcrafted acoustic features with m
Boundary: No supported offline problem is established in the source text.

## no_fit: Extract: batch several exchanges per claude -p invocation
https://github.com/unxmaal/infovore/issues/148
Label: source_record
State: closed; created: unknown; updated: 2026-10-03T15:13:18Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: closed_or_withdrawn; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: ## Measurement  Every LLM call spawns a fresh _claude -p_ with _--no-session-persistence_ in a new temp cwd (_infovore/llm/claude_cli.py:93_), so the CLI's own system prompt is re-sent on every call and prompt caching can never read back.  _extraction_runs_ for _claude-sonnet-5_: 12,246 ok runs, avg **7,616 input tokens** per exchange.  Rendering the real prompt offline for 30 recent exchanges (_b
Boundary: No supported offline problem is established in the source text.

## no_fit: Validate and reduce GPU synchronization and transfer overhead in ranker training
https://github.com/ACM-VIT/Weave-ml/issues/197
Label: source_record
State: open; created: unknown; updated: 2026-10-27T07:25:44Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: _!-- performance-audit-followup: 2026-10-24/training-cuda-overhead --_ **Execution:** human-required   **Audit item:** Performance follow-up 5/8 (24 October 2026)  ## Problem / why this costs time Training and validation extract a host loss scalar every batch. Calibration extracts five metric scalars per batch. On CUDA, these host reads introduce synchronization points. DataLoaders use default pag
Boundary: Implementation-only UI, dashboard, browser, or bug-fix work is outside the supported offline services.

## no_fit: Review collection improvements: validator fix + Deep Research
https://github.com/thomaspryor/Broadwayscore/issues/193
Label: source_record
State: open; created: unknown; updated: 2026-03-17T18:57:50Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: ## Active Session: Review collection improvements  **Status:** In progress - validator fix shipped, Deep Research script building  ### Completed - Fixed validate-data.js aggregator archive check (was comparing staging dir vs itself) - Source validation scripts extracted from batch script (checkPlausibility, normalizeFinancialValues, loadShowContext)  ### In progress - scripts/deep-research-commerc
Boundary: No supported offline problem is established in the source text.

## no_fit: crash robot: one unreproduced projection_drift (facts fence empty, row present) under pooler_disconnect
https://github.com/garrytan/gbrain/issues/7651
Label: source_record
State: open; created: unknown; updated: 2026-10-26T21:16:22Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: ## What we saw One local crash-robot replay on Postgres behind a transaction-mode PgBouncer failed with a _projection_drift_ violation under the _pooler_disconnect_ fault:  ___ overlapping_slugs_two_sources seed=5105 pooler_disconnect: projection_drift:   after ov6: robot-0/notes/alpha facts fence __ != rows _"Alpha fact mk-ov5"_ ___  The run was on Bun 1.4.0 at about v0.60.463.0. The fact came fr
Boundary: No supported offline problem is established in the source text.

## no_fit: Restart 2H: shared filesystem bindings, timer publication and parameter dispatch
https://github.com/salvogendut/GEMBENCH/issues/75
Label: source_record
State: open; created: unknown; updated: 2026-09-05T22:32:55Z
Owner route: missing
Problem: no_fit; capability: none; adaptation: n/a
Contact: not_ready; scope inquiry: false; commission: false
Execution: not_ready; inputs supplied: false
Paid source: not_stated; observed payment: not_observed
Task: Continue the CPC restart after #74: finish the filesystem client/timer publication/GB_PARAMS provider boundaries while preserving current MSX2 behavior and compile-once applications.  Scope: - Separate native filesystem-client request storage from shared marshaling (full, directory-only and batch profiles). - Extract the app-linked native timer publisher behind explicit fixed-state/SDCC calling-co
Boundary: No supported offline problem is established in the source text.
