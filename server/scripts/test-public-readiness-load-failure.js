import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

test("missing checker dependency is a redacted 503, not a visitor error", () => {
  const scratch = mkdtempSync(join(tmpdir(), "readiness-loader-"));
  const loader = join(scratch, "loader.mjs");
  writeFileSync(loader, `
    export async function resolve(specifier, context, nextResolve) {
      if (specifier === "ajv/dist/2020.js"
          && context.parentURL?.includes("/vendor/agent-payment-integrity/")) {
        const error = new Error("Cannot find package ajv in /private/host/version");
        error.code = "ERR_MODULE_NOT_FOUND";
        throw error;
      }
      return nextResolve(specifier, context);
    }
  `);
  const register = "data:text/javascript," + encodeURIComponent(
    `import {register} from 'node:module'; register(${JSON.stringify(pathToFileURL(loader).href)});`,
  );
  const script = `
    import assert from 'node:assert/strict';
    import {createServer} from 'node:http';
    import {createSdsApp} from './server/app.js';
    const server = createServer(createSdsApp());
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const body = {
      catalogRow: {origin:'https://example.com', method:'POST',
        route:'/load-check', requiredPaths:['value']},
      responseContract: {schema:{type:'object', properties:{value:{type:'string'}}}},
    };
    try {
      const post = input => fetch(origin + '/api/public-readiness/supplied-row', {
        method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify(input),
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await post(body);
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {error:{
          code:'checker_unavailable', message:'public checker is unavailable',
        }});
      }
      const invalid = await post({});
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error.code, 'invalid_shape');
      assert.equal((await fetch(origin + '/api/health')).status, 200);
      console.log('ROOT_CHECKER_LOAD_FAILURE_OK=yes');
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  `;
  try {
    const ran = spawnSync(process.execPath, ["--import", register,
      "--input-type=module", "-e", script], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      encoding: "utf8", timeout: 30_000,
    });
    assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
    assert.match(ran.stdout, /ROOT_CHECKER_LOAD_FAILURE_OK=yes/);
  } finally {
    rmSync(scratch, {recursive:true, force:true});
  }
});
