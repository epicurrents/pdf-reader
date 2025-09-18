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
} from '@epicurrents/core/dist/types'
import PdfWorkerSubstitute from './pdf/PdfWorkerSubstitute'
import type { ConfigReadFile, PdfFileImporter } from '#types'
import Log from 'scoped-event-log'

const SCOPE = 'PdfImporter'

export default class PdfImporter extends GenericStudyImporter implements PdfFileImporter {

    constructor (source: string) {
        PdfWorkerSubstitute.source = source
        const fileTypeAssocs = [
            {
                accept: {
                    'application/pdf': ['.pdf'],
                },
                description: 'PDF document',
            },
        ] as AssociatedFileType[]
        super(SCOPE, [], fileTypeAssocs)
    }

    getFileTypeWorker (): Worker | null {
        const workerOverride = this._workerOverrides.get('pdf')
        const worker = workerOverride ? workerOverride() : new PdfWorkerSubstitute()
        Log.registerWorker(worker)
        return worker
    }

    async importFile (source: File | StudyFileContext, config?: ConfigReadFile) {
        const file = (source as StudyFileContext).file || source as File
        Log.debug(`Loading PDF from file ${file.webkitRelativePath}.`, SCOPE)
        const fileName = config?.name || file.name || ''
        const studyFile = {
            file: file,
            format: 'pdf',
            mime: config?.mime || file.type || null,
            name: fileName,
            partial: false,
            range: [],
            role: 'data',
            modality: 'document',
            url: config?.url || URL.createObjectURL(file),
        } as StudyContextFile
        this._study.files.push(studyFile)
        return studyFile
    }

    async importUrl (source: string | StudyFileContext, config?: ConfigReadFile) {
        const url = (source as StudyFileContext).url || source as string
        Log.debug(`Loading PDF from url ${url}.`, SCOPE)
        const fileName = config?.name || url.split('/').pop() || ''
        const studyFile = {
            file: null,
            format: 'pdf',
            mime: config?.mime || null,
            name: config?.name || fileName || '',
            partial: false,
            range: [],
            role: 'data',
            modality: 'document',
            url: url,
        } as StudyContextFile
        this._study.files.push(studyFile)
        return studyFile
    }
}
