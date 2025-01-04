/**
 * Epicurrents PDF worker substitute. PDF.js uses its own worker for processing PDF files, so we don't need one.
 * @package    epicurrents/htm-reader
 * @copyright  2024 Sampsa Lohi
 * @license    Apache-2.0
 */

import * as pdfjsLib from 'pdfjs-dist'
import { TextItem } from 'pdfjs-dist/types/src/display/api'
import { ServiceWorkerSubstitute } from '@epicurrents/core'
import { validateCommissionProps } from '@epicurrents/core/dist/util'
import { type WorkerMessage } from '@epicurrents/core/dist/types'
import { type PdfSourceContext } from '#types'
import { Log } from 'scoped-event-log'

const SCOPE = 'PdfWorkerSubstitute'

export default class PdfWorkerSubstitute extends ServiceWorkerSubstitute {
    /**
     * Set the source URL for the PDF.js worker.
     * @param source - The source of the PDF worker.
     */
    static get source () {
        return pdfjsLib.GlobalWorkerOptions.workerSrc
    }
    static set source (source: string) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = source
    }

    protected _pdf: pdfjsLib.PDFDocumentProxy | null = null
    constructor () {
        super()
        if (!window.__EPICURRENTS__?.RUNTIME) {
            Log.error(`Reference to main application was not found!`, SCOPE)
        }
    }
    async postMessage (message: WorkerMessage['data']) {
        if (!message?.action) {
            return
        }
        const action = message.action
        Log.debug(`Received message with action ${action}.`, SCOPE)
        if (action === 'get-document') {
            try {
                this.returnMessage({
                    action,
                    document: this._pdf,
                    success: true,
                    rn: message.rn,
                })
            } catch (e) {
                Log.error(`An error occurred while trying to get document.`, SCOPE, e as Error)
                this.returnMessage({
                    action,
                    success: false,
                    rn: message.rn,
                })
            }
        } else if (action === 'get-page') {
            const data = validateCommissionProps(
                message as WorkerMessage['data'] & { pageNum: number },
                {
                    pageNum: ['Number', 'undefined'],
                },
                this._pdf !== null
            )
            if (!data) {
                Log.error(`Validating props for task '${action}' failed.`, SCOPE)
                this.returnMessage({
                    action: action,
                    success: false,
                    rn: message.rn,
                })
                return
            }
            data.pageNum ??= 1
            try {
                const page = await this._pdf!.getPage(data.pageNum)
                this.returnMessage({
                    action,
                    page,
                    success: true,
                    rn: message.rn,
                })
            } catch (e) {
                Log.error(`An error occurred while trying to get page content.`, SCOPE, e as Error)
                this.returnMessage({
                    action: action,
                    success: false,
                    rn: message.rn,
                })
            }
        } else if (action === 'get-page-content') {
            const data = validateCommissionProps(
                message as WorkerMessage['data'] & { pageNum: number },
                {
                    pageNum: ['Number', 'undefined'],
                },
                this._pdf !== null
            )
            if (!data) {
                Log.error(`Validating props for task '${action}' failed.`, SCOPE)
                this.returnMessage({
                    action,
                    success: false,
                    rn: message.rn,
                })
                return
            }
            data.pageNum ??= 1
            try {
                const page = await this._pdf!.getPage(data.pageNum)
                const text = await page.getTextContent()
                const content = text.items.map((item) => (item as TextItem).str).join('')
                this.returnMessage({
                    action,
                    content,
                    success: true,
                    rn: message.rn,
                })
            } catch (e) {
                Log.error(`An error occurred while trying to get page content.`, SCOPE, e as Error)
                this.returnMessage({
                    action,
                    success: false,
                    rn: message.rn,
                })
            }
        } else if (action === 'set-sources') {
            const data = validateCommissionProps(
                message as WorkerMessage['data'] & { sources: PdfSourceContext[] },
                {
                    sources: 'Array',
                }
            )
            if (!data || !data.sources.length || !data.sources[0].url) {
                Log.error(`Validating props for task '${action}' failed.`, SCOPE)
                this.returnMessage({
                    action,
                    success: false,
                    rn: message.rn,
                })
                return
            }
            try {
                this._pdf = await pdfjsLib.getDocument(data.sources[0].url).promise
            } catch (e) {
                Log.error(`An error occurred while trying to set sources.`, SCOPE, e as Error)
                this.returnMessage({
                    action,
                    success: false,
                    rn: message.rn,
                })
            }
        } else {
            super.postMessage(message)
        }
    }
}