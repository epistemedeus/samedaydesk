import { WRAPPER_INDEX, SDS52_SHA } from "./pins.mjs";

export async function loadWrapper() {
  const mod = await import(WRAPPER_INDEX);
  return {
    runPaidOffer: mod.runPaidOffer,
    createExecutor: typeof mod.createExecutor === "function" ? mod.createExecutor : null,
    executionContract: mod.EXECUTION_CONTRACT_VERSION || null,
    testedPin: SDS52_SHA,
    exportName: typeof mod.createExecutor === "function" ? "createExecutor/runPaidOffer" : "runPaidOffer",
  };
}

export async function invokeWrapper(request, wrapper = null) {
  const loaded = wrapper || (await loadWrapper());
  const result = await loaded.runPaidOffer(request);
  return {
    result,
    wrapper: {
      testedPin: loaded.testedPin,
      exportName: loaded.exportName,
      executionContract: loaded.executionContract,
    },
  };
}
