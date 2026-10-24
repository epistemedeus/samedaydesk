# ROOT5272 CI contract receiving

The first PR runtime-only CI ran root production dependencies without a client build; the original new regression incorrectly assumed client/dist existed. Split its consumers: source bytes always exercise the real production static mount in an isolated fixture; an explicitly supplied real build separately must equal and serve those bytes. No missing/stale supplied build can fall back to the source fixture.

Actual receiving 2026-10-24T04:06:23.549Z: runtime-only 5 passed/1 explicitly unrequested built check skipped; stale emitted guide refused for the intended source mismatch; actual retained managed build 6 passed/0 skipped. Product source, locks, runtime, original emitted build comparison and human assets are unchanged. Original worker qualification remains historical source evidence; production installation is still unreceived. Logs: /home/ubuntu/root-sol-window100337/root5272-sds-ci-contract-20261024.
