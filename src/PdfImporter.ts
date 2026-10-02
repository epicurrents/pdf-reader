/**
 * Epicurrents PDF importer.
 * @package    epicurrents/pdf-reader
 * @copyright  2024 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericStudyImporter } from '@epicurrents/core'
import type {
    AssociatedFileType,
    StudyContextFile,
    StudyFileContext,
} from '@epicurrents/core/types'
import PdfWorkerSubstitute from './pdf/PdfWorkerSubstitute'
import type { ConfigReadFile, PdfFileImporter } from '#types'
import Log from 'scoped-event-log'

const SCOPE = 'PdfImporter'

/**
 * Modality this importer serves, and the one its study files declare. Declared to the base class
 * because `isSupportedModality` answers from the list it is given: an empty list refuses every
 * modality, including the one the importer actually reads.
 */
const DOCUMENT_MODALITY = 'document'

/**
 * The file type this importer advertises. The file picker builds its filter from it, so offering an
 * extension the reader cannot open produces a study no worker can serve.
 */
const PDF_FILE_TYPE = {
    accept: {
        'application/pdf': ['.pdf'],
    },
    description: 'PDF document',
} as AssociatedFileType

export default class PdfImporter extends GenericStudyImporter implements PdfFileImporter {

    /**
     * pdf.js fetches its worker from an address rather than constructing one, and the option holding
     * that address is pdf.js's own module-level state. Constructing an importer is therefore what
     * sets it, for every document the page goes on to open.
     * @param source - Address of the pdf.js worker bundle.
     */
    constructor (source: string) {
        PdfWorkerSubstitute.source = source
        // A fresh array per importer: `destroy` empties the one it was given in place, so a shared
        // array would leave every other importer advertising no file type and the picker offering
        // no PDF filter.
        super(SCOPE, [DOCUMENT_MODALITY], [PDF_FILE_TYPE])
    }

    /**
     * Worker for this importer's format, which is a main-thread substitute: pdf.js drives its own
     * worker, so there is none of this package's own to run. A document module refuses to build a
     * resource without one, so this never answers with null.
     */
    getFileTypeWorker (): Worker | null {
        const workerOverride = this._workerOverrides.get('pdf')
        const worker = workerOverride ? workerOverride() : new PdfWorkerSubstitute()
        Log.registerWorker(worker)
        return worker
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- the importer contract returns a promise.
    async importFile (source: File | StudyFileContext, config?: ConfigReadFile) {
        const file = (source as StudyFileContext).file || source as File
        Log.debug(`Loading PDF from file ${file.webkitRelativePath || file.name}.`, SCOPE)
        const fileName = config?.name || file.name || ''
        const studyFile = {
            file: file,
            format: 'pdf',
            mime: config?.mime || file.type || null,
            name: fileName,
            partial: false,
            range: [],
            role: 'data',
            modality: DOCUMENT_MODALITY,
            // pdf.js reads from an address, so a local file is published as one. The reader asks for
            // the ranges it needs rather than the whole file, which is what keeps a large document
            // off the heap; see ROADMAP.md for who is left holding the address.
            url: config?.url || URL.createObjectURL(file),
        } as StudyContextFile
        this._study.files.push(studyFile)
        return studyFile
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- the importer contract returns a promise.
    async importUrl (source: string | StudyFileContext, config?: ConfigReadFile) {
        const url = (source as StudyFileContext).url || source as string
        Log.debug(`Loading PDF from url ${url}.`, SCOPE)
        const fileName = config?.name || url.split('/').pop() || ''
        const studyFile = {
            file: null,
            format: 'pdf',
            mime: config?.mime || null,
            name: fileName,
            partial: false,
            range: [],
            role: 'data',
            modality: DOCUMENT_MODALITY,
            url: url,
        } as StudyContextFile
        this._study.files.push(studyFile)
        return studyFile
    }
}
