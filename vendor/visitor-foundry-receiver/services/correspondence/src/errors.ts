export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function errorBody(error: ApiError) {
  return {
    error: {
      code: error.code,
      message: error.message,
    },
  };
}
