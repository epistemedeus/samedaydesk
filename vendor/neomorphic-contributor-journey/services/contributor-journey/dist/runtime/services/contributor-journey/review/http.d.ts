import { ReviewService } from "./service.js";
/** Host-authenticated context, never JSON-supplied principal/owner flags. Off by default. */
export declare function createReviewHandler<Context>(options: {
    service: ReviewService<Context>;
    context(request: Request): Promise<Context>;
    enabled?: boolean;
    basePath?: string;
    allowedOrigins: string[];
}): (request: Request) => Promise<Response>;
