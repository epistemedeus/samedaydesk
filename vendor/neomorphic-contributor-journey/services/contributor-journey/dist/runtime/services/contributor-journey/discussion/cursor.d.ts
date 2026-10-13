/** Encrypt as well as authenticate: anonymous cursors must not disclose private
 * event counts, project IDs or account bindings. Stable key permits cold resume. */
export declare function createCursorCodec(rawKey: Uint8Array): {
    encode(scope: string, sequence: number, visibility: string): string;
    decode(scope: string, cursor: unknown): {
        sequence: number;
        visibility: string | null;
    };
};
