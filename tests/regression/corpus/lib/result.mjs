export function observed({ verdict, code = null, message = "", evidence = [], product = null }) {
  return { verdict, code, message, evidence, product };
}

export function reject(code, message, extra = {}) {
  return observed({ verdict: "reject", code, message, ...extra });
}

export function accept(code, message, extra = {}) {
  return observed({ verdict: "accept", code, message, ...extra });
}
