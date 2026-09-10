S100 native skill consumers
===========================

Skills upstream pin: 82d0f019713c7223898806144da08fdbeed5c666
Merchant pin: 8104629651fb31ea9fd4873de0017fa36b8bb0da

Skills push from this VM returned 403 for epistemedeus/x402-data-gateway-skills;
reproducible harness + sanitized evidence live on this SameDayDesk branch.

Run (on a native-auth Grok host with merchant checkout):
  export S100_MERCHANT_DIR=/path/to/x402-url-extractor
  export S100_STATUS_DIR=/tmp/s100-status
  node consumers/native-s100/run-harness.mjs
