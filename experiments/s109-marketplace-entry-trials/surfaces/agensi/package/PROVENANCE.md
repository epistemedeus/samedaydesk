# Provenance

The offline helper and tiny fixtures are original source from the SameDayDesk package. Its package.json declares Apache-2.0; LICENSE includes that license. The fixtures are synthetic comparison inputs, not an actual upstream checkout or paid delivery.

The descriptor references epistemedeus/x402-data-gateway-skills at 82d0f019713c7223898806144da08fdbeed5c666 as separate context. No files from that recipe tree are bundled. This package neither verifies that revision from local directory contents nor grants redistribution rights to upstream recipes.

There are no runtime dependencies. Python 3's standard library builds the upload ZIP; Node.js 18+ runs the helper. ZIP contents are allowlisted by bin/build-skill-zip.py. Tests, fixtures and source are included; session logs, account data, node_modules and build output are excluded. No marketplace acceptance or provider execution is claimed.
