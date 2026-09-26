export const VF09_BIND_POINT = {
  status: "waiting_for_export",
  owner: "VF09",
  sdsRoute: "POST /api/uploads/signed-url",
  currentBehavior: "501",
  plugsInto: "VF04A IntegrationStore.admit host-resolved module reference after the VF09 artifact loader exports",
  notAnAuthorityStore: true,
};

export function bindVf09ArtifactLoader() {
  throw new Error("VF09 artifact loader is not exported; SDS uploads stay a 501 stub");
}
