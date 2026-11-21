/** Preview only. Server reads own identity, authority and all durable work.
 * Unknown commands stay in this tab's existing in-memory journal, partitioned
 * by private account. No evidence, credential or recovery code enters storage.
 */
export declare function initializeInstalledPreview(document: Document): void;
