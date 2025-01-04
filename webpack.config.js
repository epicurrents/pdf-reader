const path = require('path')
const TerserPlugin = require('terser-webpack-plugin')
require('dotenv').config()

const ASSET_PATH = process.env.ASSET_PATH || '/pdf-reader/'

module.exports = {
    mode: 'production',
    entry: {
        'pdf-reader': { import: path.join(__dirname, 'src', 'index.ts') },
        'pdfjs-worker': { import: path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.mjs') },
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
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
        symlinks: false
    },
}