// node --import ./test/helpers/sim-loader.mjs src/index.mjs : the real server with the simulated Game Boy lane (devnet tests only)
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('/lanes/hardware.mjs')) return { url: new URL('./sim-lane.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
