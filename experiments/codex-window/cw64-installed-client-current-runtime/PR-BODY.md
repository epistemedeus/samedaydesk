The installed Python consumer still pins useful-jobs 1.0.0 and six jobs, so it refuses the current 1.4.1 archive. Import only the completed D08 consumer directory into the requested integration base, then update its packaged contract to all ten jobs and repair caller-path handling, bounded extraction/capture, detached-process cleanup, strict artifact validation and atomic output publication.

Verified: 20/20 serial Node test entries including 12 Python review tests; a fresh venv console invocation outside the checkout; 15/15 shipped-archive tests. Test heap is capped at 768 MiB. Original receipts and intermediate failing controls are preserved separately from final readiness.

Shared runtime, engines, and public archives are unchanged. This establishes compatibility with the exact pinned 1.4.1 archive; 23 mapped engine files differ from the integration source. No readiness claim is made for unshipped engines. Recommend this existing package as the future canonical Python entry; CW39 is read-only prior evidence.

See `experiments/codex-window/cw64-installed-client-current-runtime/GROK-HANDOFF.md` for exact refs, reproduction commands, limitations, and the next integration owner.
