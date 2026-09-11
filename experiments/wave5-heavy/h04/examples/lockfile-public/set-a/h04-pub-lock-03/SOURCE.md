# h04-pub-lock-03 primary source

Repo: `axios/axios`  
Path: `package-lock.json` (source lockfileVersion **2** `packages` map; stored fixture is a lockfileVersion **3** subset)

| Role | SHA | Subject |
| --- | --- | --- |
| before | `e9cfed35cfd18778050da9892a29efd8e9fc4d82` | chore: remove unused terser-webpack-plugin (#7032) |
| after | `d676df772244726533ca320f42e967f5af056bac` | feat(http): add HTTP2 support; (#7150) |

Raw:

- https://raw.githubusercontent.com/axios/axios/e9cfed35cfd18778050da9892a29efd8e9fc4d82/package-lock.json
- https://raw.githubusercontent.com/axios/axios/d676df772244726533ca320f42e967f5af056bac/package-lock.json

Commits:

- https://github.com/axios/axios/commit/e9cfed35cfd18778050da9892a29efd8e9fc4d82
- https://github.com/axios/axios/commit/d676df772244726533ca320f42e967f5af056bac

Fetched via `git clone --filter=blob:none https://github.com/axios/axios.git` then `git show <sha>:package-lock.json`.

These consecutive `package-lock.json` versions (axios 1.12.2 both sides) add exactly two `packages` keys with name+version+integrity+resolved and remove none. Full source blobs are ~1.8MB, so this fixture is a bounded lockfileVersion 3 subset.

## Proven added triples (from source `packages`)

New `packages` key `node_modules/node-forge`:

```
    "node_modules/node-forge": {
      "version": "1.3.1",
      "resolved": "https://registry.npmjs.org/node-forge/-/node-forge-1.3.1.tgz",
      "integrity": "sha512-dPEtOeMvF9VMcYV/1Wb8CPoVAXtp6MKMlcbAt4ddqmGqUJ6fQZFXkNZNkNlfevtNkGtaSoXf/vNNNSvgrdXwtA==",
```
New `packages` key `node_modules/selfsigned`:

```
    "node_modules/selfsigned": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/selfsigned/-/selfsigned-3.0.1.tgz",
      "integrity": "sha512-6U6w6kSLrM9Zxo0D7mC7QdGS6ZZytMWBnj/vhF9p+dAHx6CwGezuRcO4VclTbrrI7mg7SD6zNiqXUuBHOVopNQ==",
```

Unchanged neighbor pins in the subset: `@babel/code-frame` and `@ampproject/remapping` (identical version, integrity, resolved).

In the full source pair: added 2, removed 0, version changes 0, same-version integrity changes 0.
