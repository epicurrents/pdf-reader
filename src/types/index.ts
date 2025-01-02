/**
 * Epicurrents PDF reader types.
 * @package    epicurrents/pdf-reader
 * @copyright  2024 Sampsa Lohi
 * @license    Apache-2.0
 */

import { FileFormatReader } from '@epicurrents/core/dist/types'

export type ConfigReadFile = {
    format?: string
    mime?: string
    name?: string
    url?: string
}

export interface PdfFileReader extends FileFormatReader {

}