export async function resolve(specifier, context, next) {
  if (specifier === '@netlify/blobs') {
    return { url: new URL('./blobs-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (specifier === '@netlify/functions') {
    return { url: new URL('./functions-types-mock.mjs', import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
