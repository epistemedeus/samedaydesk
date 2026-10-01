#!/usr/bin/env node
import { redact, runLocalJourney } from "./local-journey.mjs";

try {
  const receipt = await runLocalJourney();
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  const demonstrated = receipt.demonstrated || {};
  const compat = receipt.clientCompatibility || {};
  const proved = demonstrated.disabledOptionalMount
    && demonstrated.hostedDiscovery
    && demonstrated.taskResult
    && demonstrated.durableRetrieval
    && demonstrated.rollbackToDisabledMount
    && compat.ok === true
    && compat.productionActivate === "HOLD"
    && compat.productionReady === false
    && compat.officialMcp?.stable === true
    && compat.officialMcp?.toolsCalled === false
    && compat.productDataService?.stableConfigured === true
    && compat.productDataService?.separateFromCorrespondence === true
    && compat.productDataService?.evidence === "local-nonsecret-stubs"
    && compat.productDataService?.productionEnrollmentInspected === false
    && compat.officialVisitorClient?.outputMatched === true
    && compat.officialVisitorClient?.distinctProjects === true
    && compat.portableKit?.matchedHeldOut === true
    && compat.portableKit?.restarted === true
    && compat.portableKit?.version === "49.0.0"
    && receipt.hostConfigurationWithheld === true
    && receipt.rollback?.schemaDropped === false
    && receipt.rollback?.requiredTablesPresent === true
    && receipt.rollback?.rowsRetained === true
    && receipt.hostedUsefulJob?.retrievedAfterRestart === true
    && receipt.hostedUsefulJob?.jobId === "lockfile-pin-delta"
    && receipt.hostedUsefulJob?.humanPagesChanged === false
    && receipt.hostedUsefulJob?.productionReady === false
    && receipt.seededNegatives?.productReuse?.code === "correspondence_reuses_product_data_service"
    && receipt.seededNegatives?.hostWithhold?.code === "host_configuration_withheld"
    && receipt.seededNegatives?.unenrolled?.code === "hosted_success_without_enrolled_store"
    && receipt.seededNegatives?.secretMetadata?.reason === "secret_material";
  if (receipt.ok !== true || receipt.productionActivate !== "HOLD" || receipt.productionReady !== false || !proved) {
    process.exit(receipt.ok === true ? 1 : 2);
  }
} catch (error) {
  process.stderr.write(`${redact(error instanceof Error ? error.stack || error.message : error)}\n`);
  process.exit(error.exitCode || 1);
}
