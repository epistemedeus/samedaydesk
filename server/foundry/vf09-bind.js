import { PORTABLE_PROFILE_URL } from "./paths.js";

export const VF09_BIND_POINT = {
  status: "private_loader",
  owner: "VF09",
  sdsRoute: "POST /api/uploads/signed-url",
  currentBehavior: "501",
  plugsInto: "canonical portableArtifact used by IntegrationStore admission",
  notAnAuthorityStore: true,
  publicExecution: false,
};

export async function bindVf09ArtifactLoader() {
  const mod = await import(PORTABLE_PROFILE_URL);
  if (typeof mod.portableArtifact !== "function") {
    throw new Error("canonical artifact loader is not exported");
  }
  return mod.portableArtifact;
}
