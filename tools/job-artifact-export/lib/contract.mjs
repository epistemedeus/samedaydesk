import { D03_PIN } from "./d03-adapter.mjs";
import { SCHEMA, SCHEMA_VERSION, USEFUL_JOBS_ARCHIVE_SHA256 } from "./pins.mjs";

export const CONTRACT = {
  schema: SCHEMA,
  schemaVersion: SCHEMA_VERSION,
  commands: ["export", "import"],
  archiveIdentity: "sha256 of the useful-jobs tar.gz bytes actually read",
  zipIdentity: "sha256 of the zip bytes actually read before parse",
  pinnedArchiveSha256: USEFUL_JOBS_ARCHIVE_SHA256,
  d03: D03_PIN,
  customerDelivery: false,
  notSettling: true,
};
