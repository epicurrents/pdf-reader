const path = require('path')
const TerserPlugin = require('terser-webpack-plugin')
require('dotenv').config()

const ASSET_PATH = process.env.ASSET_PATH || '/pdf-reader/'
// pdfjs-dist is hoisted to the workspace root node_modules; resolve upward by default.
// Override via MODULE_PATH env var when building pdf-reader standalone.
const MODULE_PATH = process.env.MODULE_PATH || path.resolve(__dirname, '../../node_modules')

module.exports = {
    mode: 'production',
    entry: {
        'pdf-reader': { import: path.join(__dirname, 'src', 'index.ts') },
        'pdfjs.worker': { import: path.join(MODULE_PATH, 'pdfjs-dist', 'build', 'pdf.worker.mjs') },
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        // Suppress declaration-file emit during the webpack pass.
                        // Full type-checking and .d.ts generation are handled by build:tsc.
                        transpileOnly: true,
                    },
                },
                exclude: '/node_modules/',
            },
        ],
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin(),
        ],
        splitChunks: false,
    },
    output: {
        path: path.resolve(__dirname, 'umd'),
        publicPath: ASSET_PATH,
        library: 'EpicPdfReader',
        libraryTarget: 'umd',
    },
    resolve: {
        extensions: ['.ts', '.js', '.json'],
        alias: {
            '#root': path.resolve(__dirname, './'),
            '#types': path.resolve(__dirname, 'src', 'types'),
            '#workers': path.resolve(__dirname, 'src', 'workers'),
        },
        // Must remain false: the pdfjs.worker entry uses an absolute MODULE_PATH that
        // webpack doubles when symlinks are followed for workspace-symlinked dependencies.
        symlinks: false
    },
}
