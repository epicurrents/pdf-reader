/**
 * Tests for the PDF importer: the study file it produces from a file or an address, and the worker
 * it hands the document module.
 * @package    epicurrents/pdf-reader
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { StudyFileContext } from '@epicurrents/core/types'

vi.mock('pdfjs-dist', async () => (await import('./pdfDouble')).pdfjsModule)

const { GlobalWorkerOptions, reset } = await import('./pdfDouble')
const { default: PdfImporter } = await import('../src/PdfImporter')
const { default: PdfWorkerSubstitute } = await import('../src/pdf/PdfWorkerSubstitute')

const WORKER_SRC = 'blob:pdf-worker'

/** A PDF file, as the file picker hands one over. */
const pdfFile = (name = 'document.pdf') => new File(['%PDF-1.7'], name, { type: 'application/pdf' })

beforeEach(() => {
    reset()
    window.__EPICURRENTS__ = { RUNTIME: {} } as unknown as typeof window.__EPICURRENTS__
})

describe('construction', () => {
    test('the worker address reaches pdf.js', () => {
        // pdf.js fetches its worker from this option, so an importer that does not set it leaves
        // every document to load on the main thread or fail outright.
        new PdfImporter(WORKER_SRC)
        expect(GlobalWorkerOptions.workerSrc).toBe(WORKER_SRC)
    })

    test('the PDF file type is the only one advertised', () => {
        const importer = new PdfImporter(WORKER_SRC)
        expect(importer.fileTypes).toEqual([
            { accept: { 'application/pdf': ['.pdf'] }, description: 'PDF document' },
        ])
    })

    test('the modality the importer reads is one it says it supports', () => {
        // `isSupportedModality` answers from the list the base class was given, so an importer that
        // declares none refuses every modality — including the one its own study files carry, and
        // the loader then rejects a call that named it.
        const importer = new PdfImporter(WORKER_SRC)
        expect(importer.isSupportedModality('document')).toBe(true)
        expect(importer.isSupportedModality('eeg')).toBe(false)
    })

    test('destroying one importer leaves another still advertising the type', () => {
        // `GenericStudyImporter.destroy` empties the file-type array in place rather than dropping
        // the reference, so a module-level array shared between importers is emptied for all of
        // them by the first one destroyed — and the picker then offers no PDF filter at all.
        const first = new PdfImporter(WORKER_SRC)
        const second = new PdfImporter(WORKER_SRC)
        first.destroy()
        expect(second.fileTypes).toHaveLength(1)
    })
})

describe('importFile', () => {
    test('the study file carries the file, its name and an address to read it from', async () => {
        const importer = new PdfImporter(WORKER_SRC)
        const file = pdfFile()
        const studyFile = await importer.importFile(file)
        expect(studyFile).toMatchObject({
            file,
            format: 'pdf',
            mime: 'application/pdf',
            modality: 'document',
            name: 'document.pdf',
            partial: false,
            role: 'data',
        })
        expect(studyFile?.url).toMatch(/^blob:/)
    })

    test('the file is added to the study being built', async () => {
        const importer = new PdfImporter(WORKER_SRC)
        const studyFile = await importer.importFile(pdfFile())
        expect(importer.study?.files).toEqual([studyFile])
    })

    test('a file wrapped in a study file context is unwrapped', async () => {
        const importer = new PdfImporter(WORKER_SRC)
        const file = pdfFile('wrapped.pdf')
        const studyFile = await importer.importFile({ file } as StudyFileContext)
        expect(studyFile?.file).toBe(file)
        expect(studyFile?.name).toBe('wrapped.pdf')
    })

    test('the caller may name the file, its type and its address', async () => {
        // The document module reads a page by address, so a caller that already has one — a file
        // already served over HTTP — passes it rather than having a second published for it.
        const importer = new PdfImporter(WORKER_SRC)
        const studyFile = await importer.importFile(pdfFile(), {
            mime: 'application/x-pdf',
            name: 'Report 2026',
            url: 'https://example.org/report.pdf',
        })
        expect(studyFile).toMatchObject({
            mime: 'application/x-pdf',
            name: 'Report 2026',
            url: 'https://example.org/report.pdf',
        })
    })
})

describe('importUrl', () => {
    test('the name comes from the last segment of the address', async () => {
        const importer = new PdfImporter(WORKER_SRC)
        const studyFile = await importer.importUrl('https://example.org/docs/manual.pdf')
        expect(studyFile).toMatchObject({
            file: null,
            format: 'pdf',
            mime: null,
            modality: 'document',
            name: 'manual.pdf',
            role: 'data',
            url: 'https://example.org/docs/manual.pdf',
        })
    })

    test('an address wrapped in a study file context is unwrapped', async () => {
        const importer = new PdfImporter(WORKER_SRC)
        const studyFile = await importer.importUrl({ url: 'https://example.org/a.pdf' } as StudyFileContext)
        expect(studyFile?.url).toBe('https://example.org/a.pdf')
    })

    test('a given name wins over the one in the address', async () => {
        const importer = new PdfImporter(WORKER_SRC)
        const studyFile = await importer.importUrl('https://example.org/a.pdf', { name: 'Manual' })
        expect(studyFile?.name).toBe('Manual')
    })
})

describe('getFileTypeWorker', () => {
    test('the substitute is what serves the document commissions', () => {
        const importer = new PdfImporter(WORKER_SRC)
        expect(importer.getFileTypeWorker()).toBeInstanceOf(PdfWorkerSubstitute)
    })

    test('a registered override is used instead', () => {
        // The override is what a deployment with a worker of its own registers; keyed `pdf`, so a
        // key change here silently hands back the substitute instead.
        const importer = new PdfImporter(WORKER_SRC)
        // jsdom has no Worker constructor; the importer only passes the value through.
        const override = { addEventListener: () => undefined, terminate: () => undefined } as unknown as Worker
        importer.setWorkerOverride('pdf', () => override)
        expect(importer.getFileTypeWorker()).toBe(override)
    })

    test('each call hands back a worker of its own', () => {
        // A document module takes one worker per resource, and two resources sharing a substitute
        // would share the one document it holds.
        const importer = new PdfImporter(WORKER_SRC)
        expect(importer.getFileTypeWorker()).not.toBe(importer.getFileTypeWorker())
    })
})
