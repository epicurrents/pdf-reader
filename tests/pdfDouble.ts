/**
 * A stand-in for pdf.js.
 *
 * The reader's own behaviour is the subject here, so the library it delegates to is replaced: a real
 * `getDocument` starts pdf.js's worker and parses bytes, neither of which this package decides. The
 * double records what it was asked for and whether each document it handed out was released, which
 * is what the leak assertions read.
 * @package    epicurrents/pdf-reader
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

/** A page, as much of one as `getTextContent` needs. */
export type PageDouble = {
    getTextContent: () => Promise<{ items: { str: string }[] }>
}

/** A loaded document, with the release call pdf.js requires tracked. */
export type DocumentDouble = {
    destroy: () => Promise<void>
    destroyed: boolean
    getPage: (pageNum: number) => Promise<PageDouble>
    numPages: number
    url: string
}

/** Every document the double has handed out, in the order it did. */
export const documents = [] as DocumentDouble[]

/** Addresses `getDocument` was called with, including the ones that then failed. */
export const requests = [] as string[]

/** State of the next call, set by a test to drive the failure paths. */
export const behaviour = {
    /** Page text, one entry per page; the page count comes from its length. A `|` splits a page into
     * separate text runs, which is what pdf.js hands back for a line whose font or position changes.
     */
    pages: ['first page'],
    /** When set, `getDocument` rejects with this instead of resolving. */
    rejectWith: null as Error | null,
    /** When set, `getPage` rejects with this. */
    rejectPageWith: null as Error | null,
}

/** Return the double to its initial state. Called from `beforeEach`, so a test sees no earlier run. */
export const reset = () => {
    documents.length = 0
    requests.length = 0
    behaviour.pages = ['first page']
    behaviour.rejectWith = null
    behaviour.rejectPageWith = null
    GlobalWorkerOptions.workerSrc = ''
}

/** The module-level option pdf.js takes its worker address through. */
export const GlobalWorkerOptions = { workerSrc: '' }

/**
 * Stand in for `pdfjsLib.getDocument`. The real one returns a loading task whose `promise` settles
 * when the document is parsed; only that property is used here.
 */
export const getDocument = (src: string) => {
    requests.push(src)
    if (behaviour.rejectWith) {
        return { promise: Promise.reject(behaviour.rejectWith) }
    }
    const pages = [...behaviour.pages]
    const doc: DocumentDouble = {
        destroy: () => {
            doc.destroyed = true
            return Promise.resolve()
        },
        destroyed: false,
        getPage: (pageNum: number) => {
            if (behaviour.rejectPageWith) {
                return Promise.reject(behaviour.rejectPageWith)
            }
            const text = pages[pageNum - 1]
            if (text === undefined) {
                // What pdf.js does for a page outside the document.
                return Promise.reject(new Error(`Invalid page request ${pageNum}.`))
            }
            return Promise.resolve({
                getTextContent: () => Promise.resolve({ items: text.split('|').map(str => ({ str })) }),
            })
        },
        numPages: pages.length,
        url: src,
    }
    documents.push(doc)
    return { promise: Promise.resolve(doc) }
}

/** The shape `vi.mock('pdfjs-dist')` installs. */
export const pdfjsModule = { GlobalWorkerOptions, getDocument }
