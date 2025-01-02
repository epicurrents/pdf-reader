/**
 * Epicurrents PDF file reader tests.
 * Due to the high level of integration, tests must be run sequentially.
 * This file describes the testing sequence and runs the appropriate tests.
 * @package    epicurrents/pdf-reader
 * @copyright  2024 Sampsa Lohi
 * @license    Apache-2.0
 */

import PdfReader from '../src/PdfReader'

describe('Epicurrents PDF file reader tests', () => {
    test('Create and instance of file reader', () => {
        const reader = new PdfReader()
        expect(reader).toBeDefined()
    })
})
