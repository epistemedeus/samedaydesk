import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("opportunity OpenAPI stays beside the kernel contract", () => {
  const kernel = JSON.parse(readFileSync(path.join(root, "openapi.json"), "utf8")) as { paths: Record<string, unknown> };
  const opportunity = JSON.parse(readFileSync(path.join(root, "openapi-opportunity.json"), "utf8")) as {
    openapi: string;
    info: { description: string };
    paths: Record<string, unknown>;
  };
  const kernelPaths = Object.keys(kernel.paths);
  const opportunityPaths = Object.keys(opportunity.paths).sort();
  assert.equal(opportunity.openapi, "3.1.0");
  assert.equal(kernelPaths.some((item) => item.includes("opportunity")), false);
  assert.equal(opportunityPaths.some((item) => kernelPaths.includes(item)), false);
  assert.deepEqual(opportunityPaths, [
    "/v1/opportunity-notices",
    "/v1/opportunity-notices/{campaignKey}",
    "/v1/opportunity-rounds",
    "/v1/opportunity-rounds/{roundKey}",
    "/v1/opportunity-rounds/{roundKey}/assignments",
    "/v1/opportunity-rounds/{roundKey}/claims",
    "/v1/opportunity-rounds/{roundKey}/claims/{claimId}",
    "/v1/opportunity-rounds/{roundKey}/claims/{claimId}/accept",
    "/v1/opportunity-rounds/{roundKey}/claims/{claimId}/source",
    "/v1/opportunity-rounds/{roundKey}/claims/{claimId}/start",
    "/v1/opportunity-rounds/{roundKey}/claims/{claimId}/submissions",
    "/v1/opportunity-rounds/{roundKey}/close",
    "/v1/opportunity-rounds/{roundKey}/cohort",
    "/v1/opportunity-rounds/{roundKey}/cohort-events",
    "/v1/opportunity-rounds/{roundKey}/imports",
    "/v1/opportunity-rounds/{roundKey}/waitlist",
  ]);
  assert.match(opportunity.info.description, /null_nonpaying_v0/);
  assert.match(opportunity.info.description, /does not transfer/i);
});
