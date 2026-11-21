import type pg from 'pg';
import type { PostgresStore } from '../earned-work/src/store/postgres.js';
import type { CorrespondenceStore } from '../correspondence/src/store/types.js';
import type { JourneyConfig } from './types.js';
import { PostgresSubmissionPersistence } from './submission/postgres.js';
import { CompositionStore } from './composition-store.js';
import { JourneyAdmission } from './profile.js';
/** Same migrations for serving and explicit enrollment, against the selected existing stores. */
export declare function migrateJourneyStores(config: JourneyConfig, kernel: PostgresStore, correspondence: CorrespondenceStore, pool: pg.Pool): Promise<{
    admission: JourneyAdmission;
    db: CompositionStore;
    persistence: PostgresSubmissionPersistence;
}>;
