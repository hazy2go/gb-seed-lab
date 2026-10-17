// Module hooks for the end-to-end test: the real server, with the Game Boy lane replaced by fake-lane.mjs.
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('/lanes/hardware.mjs')) return { url: new URL('./fake-lane.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
