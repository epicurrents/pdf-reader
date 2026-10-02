/**
 * Epicurrents PDF worker substitute.
 *
 * pdf.js runs its own worker and is driven from the main thread, so there is no PDF worker of this
 * package's own for a substitute to stand in for; this class is the only implementation of the
 * document commissions for the PDF format. The replies it sends carry pdf.js objects — a document
 * and a page proxy — which cannot cross a worker boundary, so this contract holds only on the main
 * thread.
 * @package    epicurrents/pdf-reader
 * @copyright  2024 Sampsa Lohi
 * @license    Apache-2.0
 */

import * as pdfjsLib from 'pdfjs-dist'
import { TextItem } from 'pdfjs-dist/types/src/display/api'
import { ServiceWorkerSubstitute } from '@epicurrents/core'
import { validateCommissionProps } from '@epicurrents/core/util'
import type { WorkerSubstitute, WorkerMessage } from '@epicurrents/core/types'
import { type PdfSourceContext } from '#types'
import { Log } from 'scoped-event-log'

const SCOPE = 'PdfWorkerSubstitute'

export default class PdfWorkerSubstitute extends ServiceWorkerSubstitute implements WorkerSubstitute {
    /**
     * Address of the pdf.js worker, which pdf.js fetches rather than constructs. Static because the
     * option it writes is pdf.js's own module-level state: one address serves every document.
     * @param source - The source of the PDF worker.
     */
    static get source () {
        return pdfjsLib.GlobalWorkerOptions.workerSrc
    }
    static set source (source: string) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = source
    }

    protected _pdf: pdfjsLib.PDFDocumentProxy | null = null
    /**
     * Whether this substitute has been shut down. A load is answered from pdf.js asynchronously, so
     * one in flight when the shutdown arrives would otherwise assign its document to a substitute
     * nothing will ever release.
     */
    protected _shutdown = false

    constructor () {
        super()
        if (!window.__EPICURRENTS__?.RUNTIME) {
            Log.error(`Reference to main application was not found!`, SCOPE)
        }
    }

    /**
     * Release the document held, if any.
     *
     * A loaded document holds a pdf.js worker and the parsed file behind it, and `destroy` is the
     * only thing that gives either back; dropping the reference strands both for the life of the
     * page. The reference is cleared before the release is awaited, so a commission arriving
     * meanwhile is refused rather than served from a document on its way out.
     */
    protected async _releaseDocument () {
        const pdf = this._pdf
        this._pdf = null
        if (!pdf) {
            return
        }
        try {
            await pdf.destroy()
        } catch (e: unknown) {
            // Nothing to retry and nothing the caller can do, but a release that throws leaves
            // memory held, which is worth a line in the log.
            Log.warn(`Releasing the document failed: ${(e as Error)?.message ?? String(e)}`, SCOPE)
        }
    }

    /**
     * Validate a commission's properties, answering on this substitute's own reply channel.
     *
     * The channel has to be given: left to its default the validator posts to the global scope,
     * which inside a substitute is the window. Nothing is listening there, so the commission stays
     * unsettled and the caller waits forever, while the message itself is delivered to every other
     * window listener on the page.
     * @param message - Data part of the received message.
     * @param requiredProps - Properties the commission must carry, in the validator's notation.
     * @param requiredSetup - Whether a document must already be loaded.
     * @returns The message when it validates, false when it does not and has been answered.
     */
    protected _validate <T extends WorkerMessage['data']> (
        message: T,
        requiredProps: { [name: string]: string | string[] },
        requiredSetup = true
    ) {
        return validateCommissionProps(message, requiredProps, requiredSetup, this.returnMessage.bind(this))
    }

    async postMessage (message: WorkerMessage['data']) {
        if (!message?.action) {
            return
        }
        const action = message.action
        Log.debug(`Received message with action ${action}.`, SCOPE)
        if (action === 'get-document') {
            const data = this._validate(message, {}, this._pdf !== null)
            if (!data) {
                return
            }
            this.returnSuccess(message, { document: this._pdf })
        } else if (action === 'get-page' || action === 'get-page-content') {
            const data = this._validate(
                message as WorkerMessage['data'] & { pageNum: number },
                {
                    // The page number the document module sends, counted from one as pdf.js counts
                    // its own. Optional: a request that names no page is a request for the first.
                    pageNum: 'Number?',
                },
                this._pdf !== null
            )
            if (!data) {
                return
            }
            data.pageNum ??= 1
            try {
                const page = await this._pdf!.getPage(data.pageNum)
                if (action === 'get-page') {
                    this.returnSuccess(message, { page })
                    return
                }
                const text = await page.getTextContent()
                // Joined with nothing between: pdf.js splits a line into runs wherever the font or
                // position changes, and the spacing is inside the runs, so a separator here would
                // insert one in the middle of a word.
                this.returnSuccess(message, { content: text.items.map(item => (item as TextItem).str).join('') })
            } catch (e: unknown) {
                Log.error(`An error occurred while trying to get page content.`, SCOPE, e as Error)
                this.returnFailure(message, (e as Error)?.message || `Getting page ${data.pageNum} failed.`)
            }
        } else if (action === 'set-sources') {
            const data = this._validate(
                message as WorkerMessage['data'] & { sources: PdfSourceContext[] },
                {
                    sources: 'Array',
                }
            )
            if (!data) {
                return
            }
            if (!data.sources.length || !data.sources[0].url) {
                this.returnFailure(message, `The commission carried no source address to load a document from.`)
                return
            }
            if (data.sources.length > 1) {
                // One PDF holds its own pages, so the document module's one-source-per-page
                // numbering cannot address a page of the second file. See ROADMAP.md.
                Log.warn(
                    `Received ${data.sources.length} sources; only the first is read into the document.`, SCOPE
                )
            }
            let pdf: pdfjsLib.PDFDocumentProxy
            try {
                pdf = await pdfjsLib.getDocument(data.sources[0].url).promise
            } catch (e: unknown) {
                // The document already held stays held: the caller keeps whatever it was reading
                // rather than losing it to a failed attempt at reading something else.
                Log.error(`An error occurred while trying to set sources.`, SCOPE, e as Error)
                this.returnFailure(message, (e as Error)?.message || `Loading the document failed.`)
                return
            }
            if (this._shutdown) {
                // Shut down while pdf.js was parsing. Keeping the document would strand it, since
                // nothing reaches this substitute again to release it.
                await pdf.destroy()
                this.returnFailure(message, `The document reader was shut down while the document loaded.`)
                return
            }
            await this._releaseDocument()
            this._pdf = pdf
            this.returnSuccess(message, { numPages: pdf.numPages })
        } else if (action === 'shutdown') {
            // The service terminates its worker only if this commission comes back successful, so
            // the base class's refusal of an unimplemented action would leave the service holding
            // a substitute that still holds the document.
            await this._releaseDocument()
            // Answered before the listeners are dropped: `shutdown` clears them and `onmessage`
            // both, so a reply sent after it reaches nobody and the service's own shutdown never
            // resolves.
            this.returnSuccess(message)
            this.shutdown()
        } else {
            return super.postMessage(message)
        }
    }

    shutdown () {
        // Reached through `terminate`, which the service calls after the commission above has been
        // answered, and from that commission itself; a substitute dropped without one gets here
        // with a document still loaded. The release is not awaited because the base method is
        // synchronous, and the reference is cleared before it suspends, so nothing is served from
        // the released document.
        this._shutdown = true
        void this._releaseDocument()
        super.shutdown()
    }
}
