export declare const KERNEL_CONTRACT: {
    id: string;
    package: string;
    owner: string;
    startingRef: string;
    terms: {
        earnedWorkSchema: string;
        fundedTaskTermsSchema: string;
        unlikeSchemasAreNotEqual: boolean;
    };
    payout: {
        emptyProjectionIsNotOwed: boolean;
        owedRequiresObligationId: boolean;
        sale: boolean;
    };
    mutations: {
        unknownOutcome: string;
        contributorTokenGrant: string;
    };
    correctionPolicy: {
        disclosedZeroStaysZero: boolean;
        defaultWhenOmitted: number;
    };
};
export declare const KERNEL_CONTRACT_ID: string;
