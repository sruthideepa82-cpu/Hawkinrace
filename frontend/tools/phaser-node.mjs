/**
 * Interop shim for Phaser under Node.
 *
 * Phaser's bundled ESM build exposes named exports only. Vite's interop gives
 * `import Phaser from 'phaser'` a working default, but Node's ESM loader does
 * not, and the game source is written in the Vite style. This wraps the
 * namespace back up as a default export so the same source runs under Node.
 *
 * The path is resolved from this file rather than via the `phaser` alias in
 * ts-resolve.mjs, which would otherwise point back here.
 */
import * as PhaserNamespace from '../node_modules/phaser/dist/phaser.esm.js';

export * from '../node_modules/phaser/dist/phaser.esm.js';
export default PhaserNamespace;