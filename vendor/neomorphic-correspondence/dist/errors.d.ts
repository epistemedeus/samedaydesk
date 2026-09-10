export declare class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string);
}
export declare function errorBody(error: ApiError): {
    error: {
        code: string;
        message: string;
    };
};
