export function errorBody(error: any): {
    ok: boolean;
    error: {
        code: any;
        message: string;
    };
    document: object | null;
};
export class ProgressError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     * @param {{ document?: object, status?: number }} [extras]
     */
    constructor(code: string, message: string, extras?: {
        document?: object;
        status?: number;
    });
    code: string;
    document: object | null;
    status: number | null;
}
