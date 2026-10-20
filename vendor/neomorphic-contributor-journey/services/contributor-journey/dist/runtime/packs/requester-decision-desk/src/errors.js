import { ERROR_CODES } from "./constants.js";
export class DeskError extends Error {
    code;
    status;
    details;
    constructor(message, code = ERROR_CODES.INVALID_INPUT, status = null, details) {
        super(message);
        this.name = "DeskError";
        this.code = code;
        this.status = status;
        this.details = details;
    }
}
export function deskError(code, message, details, status = null) {
    return new DeskError(message, code, status, details);
}
export function isDeskError(value) {
    return value instanceof DeskError;
}
//# sourceMappingURL=errors.js.map