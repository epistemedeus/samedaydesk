# S180 portable capability-consumer kit

Heavy pin: `8a6716482b2f240078f7b17a3cf5547f1d122302`
Kit source revision: `0df011c5354c9041675333045d8c6d01530e602e`
Layout packed from: `repository`

```sh
tar -xzf s180-capability-consumer-kit.tgz
cd s180-capability-consumer-kit
node bin/capability-consumer-kit.mjs status
node bin/capability-consumer-kit.mjs cold-start --probe
node --test --test-concurrency=1 tests/*.test.mjs
```

The shipped consumer suite does not include repository packing tests
(`tests/pack-repository.test.mjs`). Pack from an unpacked tree uses
`vendor/*` roots. See SOURCE-MAP.json for upstream tips and documented
import relocation. Offline/dry-run only.
