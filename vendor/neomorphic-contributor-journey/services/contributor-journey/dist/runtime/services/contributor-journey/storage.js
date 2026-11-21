import { migrateContributorAccounts } from './account/service.js';
import { PostgresSubmissionPersistence } from './submission/postgres.js';
import { migrateShowcase } from './showcase/postgres.js';
import { CompositionStore } from './composition-store.js';
import { JourneyAdmission } from './profile.js';
/** Same migrations for serving and explicit enrollment, against the selected existing stores. */
export async function migrateJourneyStores(config, kernel, correspondence, pool) {
    await migrateContributorAccounts(kernel);
    const admission = new JourneyAdmission(config, kernel);
    const db = new CompositionStore(kernel, correspondence, config.installed.integrityKey, admission);
    await db.migrate();
    await admission.migrate();
    const persistence = new PostgresSubmissionPersistence(pool, config.storage.earnedWorkSchema);
    await persistence.migrate();
    await migrateShowcase(pool);
    return { admission, db, persistence };
}
//# sourceMappingURL=storage.js.map