/**
 * Epicurrents PDF reader.
 * @package    epicurrents/pdf-reader
 * @copyright  2024 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericFileReader } from '@epicurrents/core'
import {
    type AssociatedFileType,
    type StudyContextFile,
    type StudyFileContext,
} from '@epicurrents/core/dist/types'
import { type ConfigReadFile, type PdfFileReader } from '#types'
import Log from 'scoped-event-log'

const SCOPE = 'PdfReader'

export default class PdfReader extends GenericFileReader implements PdfFileReader {

    constructor () {
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
        return null
    }

    async readFile (source: File | StudyFileContext, config?: ConfigReadFile) {
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
            type: PdfReader.CONTEXTS.DOCUMENT,
            url: config?.url || URL.createObjectURL(file),
        } as StudyContextFile
        this._study.files.push(studyFile)
        return studyFile
    }

    async readUrl (source: string | StudyFileContext, config?: ConfigReadFile) {
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
            type: PdfReader.CONTEXTS.DOCUMENT,
            url: url,
        } as StudyContextFile
        this._study.files.push(studyFile)
        return studyFile
    }
}
