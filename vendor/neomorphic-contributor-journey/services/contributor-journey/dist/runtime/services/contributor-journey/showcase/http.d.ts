import type { AuthenticatedAccount } from "./types.js";
import type { ShowcaseService } from "./service.js";
/** SDS/native server mount adapter. Authentication and mutation protection are mandatory server ports. */
export declare function createShowcaseHttpHandler(deps: {
    service: ShowcaseService;
    authenticate(request: Request): Promise<AuthenticatedAccount | null>;
    authorizeMutation(request: Request, account: AuthenticatedAccount): Promise<boolean>;
    prefix?: string;
}): (request: Request) => Promise<Response>;
