/**
 * Library build — emits the ESM `dist/` that every consumer imports.
 *
 * Module structure is preserved one-to-one with `src/`, so a consumer's bundler can still
 * tree-shake at module granularity. Type declarations are emitted separately by `build:types`;
 * this build emits JavaScript only.
 *
 * pdf.js is left a bare import for the consumer to install; only the worker it needs is bundled,
 * by [scripts/build-workers.mjs](scripts/build-workers.mjs).
 * @package    epicurrents/pdf-reader
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import { defineConfig } from 'vite'
import { ALIASES, abs, externalDependencies } from './vite.shared.mjs'

export default defineConfig({
    build: {
        lib: {
            entry: {
                'index': abs('./src/index.ts'),
            },
            formats: ['es'],
        },
        minify: false,
        outDir: abs('./dist'),
        emptyOutDir: true,
        target: 'esnext',
        rollupOptions: {
            external: externalDependencies,
            output: {
                preserveModules: true,
                preserveModulesRoot: abs('./src'),
                entryFileNames: '[name].js',
            },
        },
    },
    resolve: {
        alias: ALIASES,
    },
})
