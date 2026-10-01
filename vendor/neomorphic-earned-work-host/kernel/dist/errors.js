export class ApiError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
    }
}
export function errorBody(error) {
    return {
        error: {
            code: error.code,
            message: error.message,
        },
    };
}
//# sourceMappingURL=errors.js.map