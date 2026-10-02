/**
 * Epicurrents PDF reader types.
 * @package    epicurrents/pdf-reader
 * @copyright  2024 Sampsa Lohi
 * @license    Apache-2.0
 */

import { FileFormatImporter } from '@epicurrents/core/types'

/** Properties a caller may state about a file instead of letting the importer derive them. */
export type ConfigReadFile = {
    format?: string
    mime?: string
    name?: string
    url?: string
}

/**
 * One source a document is read from. The document module numbers its sources from one and sends
 * them all; this reader takes the address of the first, because a PDF holds its own pages.
 */
export type PdfSourceContext = {
    file: File | null
    part: number
    url: string | null
}

/**
 * Importer of a PDF file. A named seam: it adds nothing to the core interface yet, and exists so
 * the packages that build on it name this reader's contract rather than core's.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- see above.
export interface PdfFileImporter extends FileFormatImporter {
}
