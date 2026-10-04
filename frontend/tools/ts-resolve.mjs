/**
 * Node ESM resolve hook: the game source uses extensionless relative imports
 * (resolved by Vite), so add `.ts`/`.tsx` when Node cannot find the module.
 */
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, nextResolve) {
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