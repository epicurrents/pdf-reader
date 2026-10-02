/**
 * Tests for the PDF worker substitute: what each commission replies, where the reply goes, and what
 * is released when a document stops being reachable.
 * @package    epicurrents/pdf-reader
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { WorkerMessage } from '@epicurrents/core/types'
import { Log } from 'scoped-event-log'

vi.mock('pdfjs-dist', async () => (await import('./pdfDouble')).pdfjsModule)

const { behaviour, documents, requests, reset } = await import('./pdfDouble')
const { default: PdfWorkerSubstitute } = await import('../src/pdf/PdfWorkerSubstitute')

/**
 * The substitute as a type. It comes from a dynamic import, which binds a value, so the class is
 * named through `InstanceType` rather than used as a type directly.
 */
type Substitute = InstanceType<typeof PdfWorkerSubstitute>

/** Collect every reply a substitute sends into the given array. */
const collect = (worker: Substitute, replies: WorkerMessage['data'][]) => {
    const listener = (message: { data: WorkerMessage['data'] }) => {
        replies.push(message.data)
    }
    worker.addEventListener('message', listener as unknown as (ev: MessageEvent) => void)
}

/** A substitute with its replies collected. */
const substitute = () => {
    const replies = [] as WorkerMessage['data'][]
    const worker = new PdfWorkerSubstitute()
    collect(worker, replies)
    return { replies, worker }
}

/** Commission the substitute and wait for the reply, whichever path produces it. */
const commission = async (worker: Substitute, message: Record<string, unknown>) => {
    await worker.postMessage(message as WorkerMessage['data'])
}

/** A substitute holding a document of the given pages. */
const loaded = async (pages = ['first page', 'second page', 'third page']) => {
    behaviour.pages = pages
    const { replies, worker } = substitute()
    await commission(worker, { action: 'set-sources', sources: [{ file: null, part: 1, url: 'doc.pdf' }], rn: 0 })
    replies.length = 0
    return { replies, worker }
}

beforeEach(() => {
    reset()
    // The constructor reports a missing application reference, which is not what these tests are
    // about; the substitute reads nothing off it.
    window.__EPICURRENTS__ = { RUNTIME: {} } as unknown as typeof window.__EPICURRENTS__
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('set-sources', () => {
    test('the document is loaded from the first source and its page count comes back', async () => {
        const { replies, worker } = substitute()
        behaviour.pages = ['one', 'two']
        await commission(worker, { action: 'set-sources', sources: [{ file: null, part: 1, url: 'doc.pdf' }], rn: 3 })
        expect(requests).toEqual(['doc.pdf'])
        expect(replies).toHaveLength(1)
        expect(replies[0]).toMatchObject({ action: 'set-sources', numPages: 2, success: true, rn: 3 })
    })

    test('a source list without an address is refused', async () => {
        const { replies, worker } = substitute()
        await commission(worker, { action: 'set-sources', sources: [{ file: null, part: 1, url: null }], rn: 4 })
        expect(requests).toEqual([])
        expect(replies).toHaveLength(1)
        expect(replies[0]).toMatchObject({ action: 'set-sources', success: false, rn: 4 })
    })

    test('an empty source list is refused', async () => {
        const { replies, worker } = substitute()
        await commission(worker, { action: 'set-sources', sources: [], rn: 5 })
        expect(requests).toEqual([])
        expect(replies).toHaveLength(1)
        expect(replies[0]).toMatchObject({ success: false, rn: 5 })
    })

    test('a load that fails is answered with the cause', async () => {
        // The document module rejects the resource's setup promise with this value and shows it as
        // the error state, so a reply with no cause leaves the user with a generic failure where
        // pdf.js said what was wrong with the file.
        const { replies, worker } = substitute()
        behaviour.rejectWith = new Error('Invalid PDF structure.')
        await commission(worker, { action: 'set-sources', sources: [{ file: null, part: 1, url: 'bad.pdf' }], rn: 6 })
        expect(replies).toHaveLength(1)
        expect(replies[0]).toMatchObject({ success: false, rn: 6 })
        expect(replies[0].error).toMatch(/Invalid PDF structure/)
    })

    test('loading a second document releases the first', async () => {
        // pdf.js holds a worker and the parsed document per `getDocument`, and releases neither
        // until the document is destroyed. Overwriting the reference strands both for the life of
        // the page.
        const { worker } = await loaded()
        await commission(worker, { action: 'set-sources', sources: [{ file: null, part: 1, url: 'second.pdf' }], rn: 7 })
        expect(documents).toHaveLength(2)
        expect(documents[0].destroyed).toBe(true)
        expect(documents[1].destroyed).toBe(false)
    })

    test('a commission carrying no source list at all is refused', async () => {
        const { replies, worker } = substitute()
        await commission(worker, { action: 'set-sources', rn: 28 })
        expect(requests).toEqual([])
        expect(replies).toHaveLength(1)
        expect(replies[0]).toMatchObject({ success: false, rn: 28 })
    })

    test('several sources are reported and the first is the one read', async () => {
        // The document module sends one source per page, which is the model the other document
        // reader follows; a PDF holds its own pages, so the rest are not addressable. See ROADMAP.md.
        const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined)
        const { replies, worker } = substitute()
        behaviour.pages = ['one', 'two']
        await commission(worker, {
            action: 'set-sources',
            sources: [
                { file: null, part: 1, url: 'first.pdf' },
                { file: null, part: 2, url: 'second.pdf' },
            ],
            rn: 29,
        })
        expect(requests).toEqual(['first.pdf'])
        expect(replies[0]).toMatchObject({ numPages: 2, success: true, rn: 29 })
        expect(warn).toHaveBeenCalled()
    })

    test('a failed load leaves the document already held in place', async () => {
        const { replies, worker } = await loaded(['kept'])
        behaviour.rejectWith = new Error('nope')
        await commission(worker, { action: 'set-sources', sources: [{ file: null, part: 1, url: 'bad.pdf' }], rn: 8 })
        expect(replies[0]).toMatchObject({ success: false })
        replies.length = 0
        await commission(worker, { action: 'get-page-content', pageNum: 1, rn: 9 })
        expect(replies[0]).toMatchObject({ content: 'kept', success: true })
    })
})

describe('get-page-content', () => {
    test('the requested page is the page that comes back', async () => {
        // Every page asked for, because a reader that ignores `pageNum` and always serves the same
        // page satisfies any single-page assertion.
        const { replies, worker } = await loaded()
        const expected = ['first page', 'second page', 'third page']
        for (const page of [1, 2, 3]) {
            replies.length = 0
            await commission(worker, { action: 'get-page-content', pageNum: page, rn: 10 })
            expect(replies).toHaveLength(1)
            expect(replies[0]).toMatchObject({
                action: 'get-page-content', content: expected[page - 1], success: true, rn: 10,
            })
        }
    })

    test('the document a load replaced is not the one still being read', async () => {
        const { replies, worker } = await loaded(['original'])
        behaviour.pages = ['replacement']
        await commission(worker, { action: 'set-sources', sources: [{ file: null, part: 1, url: 'new.pdf' }], rn: 33 })
        replies.length = 0
        await commission(worker, { action: 'get-page-content', pageNum: 1, rn: 34 })
        expect(replies[0]).toMatchObject({ content: 'replacement', success: true })
    })

    test('an omitted page number answers with the first page', async () => {
        const { replies, worker } = await loaded()
        await commission(worker, { action: 'get-page-content', rn: 11 })
        expect(replies[0]).toMatchObject({ content: 'first page', success: true, rn: 11 })
    })

    test('the text runs of a page are joined with nothing between them', async () => {
        // pdf.js splits a line wherever the font or position changes and keeps the spacing inside
        // the runs, so a separator inserted here lands in the middle of a word.
        const { replies, worker } = await loaded(['hyphen|ated word'])
        await commission(worker, { action: 'get-page-content', pageNum: 1, rn: 27 })
        expect(replies[0]).toMatchObject({ content: 'hyphenated word', success: true })
    })

    test('a page outside the document is a failure carrying the cause', async () => {
        const { replies, worker } = await loaded(['only one'])
        await commission(worker, { action: 'get-page-content', pageNum: 4, rn: 12 })
        expect(replies).toHaveLength(1)
        expect(replies[0]).toMatchObject({ success: false, rn: 12 })
        expect(replies[0].error).toBeTruthy()
    })
})

describe('get-page', () => {
    test('the page object comes back', async () => {
        const { replies, worker } = await loaded()
        await commission(worker, { action: 'get-page', pageNum: 1, rn: 13 })
        expect(replies).toHaveLength(1)
        expect(replies[0]).toMatchObject({ action: 'get-page', success: true, rn: 13 })
        // The pdf.js page proxy itself, not its rendered text: the document module hands this
        // straight to a consumer that calls methods on it.
        expect(typeof (replies[0].page as { getTextContent?: unknown })?.getTextContent).toBe('function')
    })

    test('a page that pdf.js refuses is a failure carrying the cause', async () => {
        const { replies, worker } = await loaded()
        behaviour.rejectPageWith = new Error('page is damaged')
        await commission(worker, { action: 'get-page', pageNum: 1, rn: 14 })
        expect(replies[0]).toMatchObject({ success: false, rn: 14 })
        expect(replies[0].error).toMatch(/page is damaged/)
    })
})

describe('get-document', () => {
    test('the loaded document comes back', async () => {
        const { replies, worker } = await loaded()
        await commission(worker, { action: 'get-document', rn: 15 })
        expect(replies).toHaveLength(1)
        expect(replies[0]).toMatchObject({ action: 'get-document', success: true, rn: 15 })
        expect(replies[0].document).toBe(documents[0])
    })

    test('a document asked for before any was loaded is a failure', async () => {
        const { replies, worker } = substitute()
        await commission(worker, { action: 'get-document', rn: 16 })
        expect(replies).toHaveLength(1)
        expect(replies[0]).toMatchObject({ success: false, rn: 16 })
    })
})

describe('the reply channel', () => {
    test('a refused commission is answered to the service, not posted to the window', async () => {
        // The property validator replies itself, on the channel it is handed. Left to its default it
        // posts to the global scope — inside a substitute that is the window, where no service is
        // listening and any other listener on the page sees a worker reply it never asked for.
        const posted = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined)
        const { replies, worker } = await loaded()
        await commission(worker, { action: 'get-page-content', pageNum: 'two', rn: 17 })
        expect(posted).not.toHaveBeenCalled()
        expect(replies).toHaveLength(1)
        expect(replies[0]).toMatchObject({ success: false, rn: 17 })
        expect(replies[0].error).toBeTruthy()
    })

    test('a commission arriving before the document is answered to the service', async () => {
        const posted = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined)
        const { replies, worker } = substitute()
        await commission(worker, { action: 'get-page-content', pageNum: 1, rn: 18 })
        expect(posted).not.toHaveBeenCalled()
        expect(replies).toHaveLength(1)
        expect(replies[0]).toMatchObject({ success: false, rn: 18 })
    })

    test('every commission is answered exactly once', async () => {
        const { replies, worker } = await loaded()
        for (const message of [
            { action: 'get-document', rn: 19 },
            { action: 'get-page', pageNum: 1, rn: 20 },
            { action: 'get-page-content', pageNum: 1, rn: 21 },
            { action: 'get-page-content', pageNum: 99, rn: 22 },
            { action: 'get-page', pageNum: 'x', rn: 23 },
        ]) {
            replies.length = 0
            await commission(worker, message)
            expect(replies, `action ${message.action} rn ${message.rn}`).toHaveLength(1)
            expect(replies[0].rn).toBe(message.rn)
        }
    })

    test('an action the substitute does not implement falls through to the base class', async () => {
        const { replies, worker } = substitute()
        await commission(worker, { action: 'update-settings', settings: {}, rn: 24 })
        expect(replies).toHaveLength(1)
        expect(replies[0]).toMatchObject({ action: 'update-settings', success: true, rn: 24 })
    })

    test('a message with no action is ignored', async () => {
        const { replies, worker } = substitute()
        await commission(worker, { rn: 25 })
        expect(replies).toHaveLength(0)
    })
})

describe('shutdown', () => {
    test('the commission is answered successfully and the document released', async () => {
        // The service terminates its worker only `if (await response.promise)`, so a substitute
        // that lets the base class refuse this action is never terminated: its service keeps its
        // commissions, stays ready, and holds a document pdf.js never gets back.
        const { replies, worker } = await loaded()
        await commission(worker, { action: 'shutdown', rn: 30 })
        expect(replies).toHaveLength(1)
        expect(replies[0]).toMatchObject({ action: 'shutdown', success: true, rn: 30 })
        expect(documents[0].destroyed).toBe(true)
    })

    test('a release that throws is logged and the document still dropped', async () => {
        const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined)
        const { replies, worker } = await loaded()
        documents[0].destroy = () => Promise.reject(new Error('worker already gone'))
        await commission(worker, { action: 'shutdown', rn: 31 })
        expect(warn).toHaveBeenCalled()
        expect(replies[0]).toMatchObject({ success: true, rn: 31 })
    })

    test('a load still in flight when the shutdown lands does not strand its document', async () => {
        // pdf.js answers a load asynchronously, so a user closing a document while it opens leaves
        // the load to settle into a substitute nothing will reach again. Keeping the document there
        // strands a pdf.js worker and the parsed file for the life of the page.
        const { replies, worker } = substitute()
        const loading = commission(worker, {
            action: 'set-sources',
            sources: [{ file: null, part: 1, url: 'slow.pdf' }],
            rn: 32,
        })
        worker.terminate()
        await loading
        expect(documents).toHaveLength(1)
        expect(documents[0].destroyed).toBe(true)
        expect(replies).toHaveLength(0)
    })

    test('the document is released when the substitute is terminated', async () => {
        const { worker } = await loaded()
        worker.terminate()
        expect(documents[0].destroyed).toBe(true)
    })

    test('a terminated substitute holds no document', async () => {
        const { worker } = await loaded()
        worker.terminate()
        const replies = [] as WorkerMessage['data'][]
        collect(worker, replies)
        await commission(worker, { action: 'get-page-content', pageNum: 1, rn: 26 })
        expect(replies[0]).toMatchObject({ success: false, rn: 26 })
    })
})

describe('construction', () => {
    test('a missing application reference is reported', () => {
        // The substitute reads nothing off the runtime, so this is a report rather than a refusal:
        // a service built without the application is a setup error worth a line in the log.
        const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined)
        window.__EPICURRENTS__ = undefined as unknown as typeof window.__EPICURRENTS__
        const worker = new PdfWorkerSubstitute()
        expect(error).toHaveBeenCalled()
        expect(worker).toBeDefined()
    })
})

describe('the worker source', () => {
    test('the static setter is what pdf.js reads its worker address from', async () => {
        const { GlobalWorkerOptions } = await import('./pdfDouble')
        PdfWorkerSubstitute.source = 'blob:worker'
        expect(GlobalWorkerOptions.workerSrc).toBe('blob:worker')
        expect(PdfWorkerSubstitute.source).toBe('blob:worker')
    })
})
