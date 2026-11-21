export function assertNotPaidOrSettled(input: any, document: any): void;
export function assertNoExecute(options?: {}): void;
export function freezeHonesty({ evidenceClass, fetchRef }: {
    evidenceClass: any;
    fetchRef?: boolean | undefined;
}): Readonly<{
    progressIsNotReputation: true;
    progressIsNotPayout: true;
    executeArtifact: false;
    fetchRef: boolean;
    lifecycleDoesNotVerify: true;
    nonpayingPrototype: true;
    adapter: "null_nonpaying_v0";
    transfer: null;
    paid: false;
    settled: false;
    evidenceClass: any;
}>;
export function forceNonpaying(fields?: {}): {
    paid: boolean;
    settled: boolean;
    transfer: null;
};
