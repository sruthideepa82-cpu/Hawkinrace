/**
 * Node ESM resolve hook: the game source uses extensionless relative imports
 * (resolved by Vite), so add `.ts`/`.tsx` when Node cannot find the module.
 */
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

/**
 * Phaser's `main` field points at unbundled CommonJS source under `src/`, which
 * `require`s the optional `phaser3spectorjs` devtool and fails to resolve
 * outside a bundler. Its `module` field (`dist/phaser.esm.js`) is the same code
 * pre-bundled, and is what Vite actually gives the app, so tests get that.
 */
// Resolved against this file's own URL, not the importing module's, so the alias
// works from anywhere in the tree.
const ALIASES = {
  phaser: new URL('./phaser-node.mjs', import.meta.url).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier in ALIASES) {
    return nextResolve(ALIASES[specifier], context);
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw error;
    for (const ext of EXTENSIONS) {
      try {
        return await nextResolve(specifier + ext, context);
      } catch {
        // keep trying
      }
    }
    throw error;
  }
}