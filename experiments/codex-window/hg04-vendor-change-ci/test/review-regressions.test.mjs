import assert from "node:assert/strict";
import { linkSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ROOT, runNode, runPython, tmpOut, lastJson, sha256File } from "./helpers.mjs";
import { evaluatePair, comparableBaseline } from "../lib/truth.mjs";
const fixture = "openai-gpt35-turbo-20230613-20240125";
for (const [name, run] of [["Node", runNode], ["Python", runPython]]) {
  test(name + " missing explicit baseline fails closed", (t) => {
    const out = tmpOut("cw51-missing-"); t.after(() => rmSync(out, {recursive:true,force:true}));
    const result = run(["run", "--fixture", fixture, "--baseline", join(out,"missing.json"), "--out-dir", out]);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(lastJson(result.stdout).machineAction, "hold-baseline");
  });
  test(name + " failed kit run cannot reuse stale successful output", (t) => {
    const out = tmpOut("cw51-stale-"); t.after(() => rmSync(out, {recursive:true,force:true}));
    const kit = join(out,"fake-kit"); mkdirSync(join(kit,"bin"), {recursive:true}); mkdirSync(join(out,"kit"));
    writeFileSync(join(kit,"bin/useful-jobs.mjs"), "process.exit(1);");
    writeFileSync(join(out,"kit/budget-impact.json"), readFileSync(join(ROOT,"artifact/openai/kit/budget-impact.json")));
    const result = run(["run", "--fixture", fixture, "--kit-dir", kit, "--out-dir", out]);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.ok(!["actionable","informational"].includes(lastJson(result.stdout).wrapperStatus));
  });
  test(name + " output path cannot overwrite its frozen baseline", (t) => {
    const out = tmpOut("cw51-alias-"); t.after(() => rmSync(out, {recursive:true,force:true}));
    const baseline = join(out,"vendor-change-ci.json");
    writeFileSync(baseline, readFileSync(join(ROOT,"fixtures",fixture,"expected.json")));
    const before = sha256File(baseline);
    const result = run(["run", "--fixture", fixture, "--baseline", baseline, "--out-dir", out]);
    assert.equal(sha256File(baseline), before);
    assert.equal(result.status, 2);
    assert.equal(lastJson(result.stdout).code, "input-output-overlap");
  });
}
test("incomplete before capture cannot become complete coverage", () => {
  const rows = [{field:"input",value:1,unit:"USD/token"}];
  const result = evaluatePair({beforeJson:{rows,capture:{complete:false}},afterJson:{rows,capture:{complete:true}},kitArtifact:{status:"informational"}});
  assert.equal(result.coverage.complete,false);
  assert.equal(result.wrapperStatus,"partial");
});
test("overflow arithmetic is partial and baseline rounding preserves large finite values", () => {
  const result = evaluatePair({beforeJson:{rows:[{field:"x",value:-1e308,unit:"USD"}]},afterJson:{rows:[{field:"x",value:1e308,unit:"USD"}]},kitArtifact:{status:"actionable"}});
  assert.equal(result.wrapperStatus,"partial");
  assert.equal(result.independentArithmetic.length,0);
  assert.equal(comparableBaseline({independentArithmetic:[{field:"x",delta:1e308}]}).independentArithmetic[0].delta,1e308);
});

test("selected candidate cannot silently execute the released default", (t) => {
  const out=tmpOut("cw51-version-"); t.after(()=>rmSync(out,{recursive:true,force:true}));
  const result=runNode(["run","--fixture",fixture,"--kit-version","1.4.1","--allow-candidate","--out-dir",out]);
  assert.equal(result.status,2);
  assert.equal(lastJson(result.stdout).code,"candidate-run-unavailable");
});
for (const [name,run] of [["Node",runNode],["Python",runPython]]) {
  test(name+" resolves caller-relative input files before invoking the extracted kit", (t) => {
    const out=tmpOut("cw51-relative-"); t.after(()=>rmSync(out,{recursive:true,force:true}));
    const base="fixtures/"+fixture+"/";
    const result=run(["run","--before",base+"before.json","--after",base+"after.json","--source",base+"SOURCE.json","--baseline",base+"expected.json","--out-dir",out]);
    assert.equal(result.status,0,result.stdout+result.stderr);
    const report=JSON.parse(readFileSync(join(out,"vendor-change-ci.json"),"utf8"));
    assert.equal(report.kit.verifiedArchive,true);
    assert.equal(report.baseline.matched,true);
  });
  test(name+" does not silently discard an explicitly requested source file", (t) => {
    const out=tmpOut("cw51-source-"); t.after(()=>rmSync(out,{recursive:true,force:true}));
    const result=run(["run","--fixture",fixture,"--source",join(out,"missing-source.json"),"--out-dir",out]);
    assert.notEqual(result.status,0,result.stdout+result.stderr);
  });
}

test("hard-linked output aliases cannot mutate a frozen baseline", (t) => {
  const out=tmpOut("cw51-hardlink-"); t.after(()=>rmSync(out,{recursive:true,force:true}));
  const baseline=join(out,"expected.json");
  writeFileSync(baseline,readFileSync(join(ROOT,"fixtures",fixture,"expected.json")));
  linkSync(baseline,join(out,"vendor-change-ci.json"));
  const before=sha256File(baseline);
  const result=runNode(["run","--fixture",fixture,"--baseline",baseline,"--out-dir",out]);
  assert.equal(result.status,2);
  assert.equal(lastJson(result.stdout).code,"input-output-overlap");
  assert.equal(sha256File(baseline),before);
});
