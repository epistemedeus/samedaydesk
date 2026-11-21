import type { MutationView, Result, ReviewPorts, ReviewView } from "./types.js";
export declare class ReviewService<Context> {
    private readonly ports;
    private readonly clock;
    private readonly policy;
    constructor(ports: ReviewPorts<Context>);
    private result;
    private load;
    private requester;
    private open;
    private view;
    read(context: Context, input: unknown): Promise<Result<ReviewView>>;
    verdict(context: Context, input: unknown): Promise<Result<MutationView>>;
    decide(context: Context, input: unknown): Promise<Result<MutationView>>;
    requestClarification(context: Context, input: unknown): Promise<Result<MutationView>>;
    respond(context: Context, input: unknown): Promise<Result<MutationView>>;
    private clarify;
}
