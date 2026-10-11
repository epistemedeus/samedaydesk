export async function resolve(specifier, context, nextResolve) {
  if (specifier === "express" || specifier.startsWith("express/")) {
    const error = new Error("Cannot find package 'express'");
    error.code = "ERR_MODULE_NOT_FOUND";
    throw error;
  }
  return nextResolve(specifier, context);
}
