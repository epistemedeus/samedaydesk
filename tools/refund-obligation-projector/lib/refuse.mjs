export class ProjectorRefusal extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ProjectorRefusal";
  }
}

export function refuse(code, message) {
  throw new ProjectorRefusal(code, message);
}

export function isRefusal(error) {
  return error instanceof ProjectorRefusal;
}

export function refusalPayload(error) {
  const code = error instanceof ProjectorRefusal ? error.code : "projector_error";
  return {
    ok: false,
    code,
    message: error instanceof Error ? error.message : String(error),
  };
}
