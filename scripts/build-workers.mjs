/**
 * The standalone worker bundle a consumer serves.
 *
 * pdf.js takes its worker as a URL rather than constructing one, so a consumer always serves this
 * file and points `GlobalWorkerOptions.workerSrc` at it. The bundle is self-contained, because a
 * worker resolves no bare specifiers of its own.
 * @package    epicurrents/pdf-reader
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import { createRequire } from 'node:module'
import { build } from 'vite'
import { ALIASES, abs, minifyWorkerOutput } from '../vite.shared.mjs'

const require = createRequire(import.meta.url)

/** The worker this package publishes is pdf.js's own, bundled from the installed copy. */
const WORKERS = { pdfjs: require.resolve('pdfjs-dist/build/pdf.worker.mjs') }

for (const [name, entry] of Object.entries(WORKERS)) {
    await build({
        configFile: false,
        logLevel: 'warn',
        build: {
            lib: {
                entry,
                name: 'EpiCWorker',
                formats: ['iife'],
                fileName: () => `${name}.worker.js`,
            },
            minify: false,
            outDir: abs('./umd'),
            emptyOutDir: false,
            target: 'esnext',
            rollupOptions: {
                output: {
                    inlineDynamicImports: true,
                },
            },
        },
        plugins: [minifyWorkerOutput()],
        resolve: {
            alias: ALIASES,
        },
    })
    console.log(`built umd/${name}.worker.js`)
}
