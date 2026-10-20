import assert from "node:assert/strict";
import test from "node:test";
import {spawn} from "node:child_process";
import {once} from "node:events";
import path from "node:path";
import {fileURLToPath} from "node:url";

const product=process.env.CONTRIBUTOR_JOURNEY_TEST_PRODUCT_ROOT;
assert.ok(product&&path.isAbsolute(product),"set exact isolated received product root");
const sds=fileURLToPath(new URL("../../",import.meta.url));
test("actual default vendored SDS producer passes the installed private journey and remains unreleased",async()=>{
  const stagingChildEnv={...process.env,CONTRIBUTOR_JOURNEY_TEST_SDS_ROOT:sds,CONTRIBUTOR_JOURNEY_TEST_USE_VENDOR:"1"};
  delete stagingChildEnv.NODE_TEST_CONTEXT;
  const child=spawn(process.execPath,["--import",path.join(product,"services/contributor-journey/node_modules/tsx/dist/loader.mjs"),path.join(product,"tests/contributor-journey/full-path.ts")],{
    cwd:product,stdio:["ignore","pipe","pipe"],env:stagingChildEnv});
  let output="",errors="";child.stdout.on("data",v=>output+=v);child.stderr.on("data",v=>errors+=v);
  const [code,signal]=await once(child,"exit");assert.equal(signal,null);assert.equal(code,0,errors);
  const receipt=JSON.parse(output);assert.equal(receipt.wholePrivateJourneyPassed,true);assert.equal(receipt.tests.pass,13);assert.equal(receipt.tests.fail,0);
  assert.equal(receipt.releaseAccepted,false);assert.equal(receipt.publicEnabled,false);assert.equal(receipt.settlement,"synthetic_fixture_only");
});
