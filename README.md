# @epicurrents/pdf-reader

Reads PDF documents into the page-addressed form [@epicurrents/doc-module](https://github.com/epicurrents/doc-module) displays, by driving [pdf.js](https://mozilla.github.io/pdf.js/).

## Public surface

| Export | What it is |
|---|---|
| `PdfImporter` | Study importer. Advertises the PDF file type, publishes an address for a local file, and hands over the worker that serves the document. |
| `PdfWorkerSubstitute` | The document commissions, answered on the main thread. |
| `ConfigReadFile`, `PdfFileImporter`, `PdfSourceContext` | Types. |

## There is no worker of this package's own

pdf.js runs its own worker and is driven from the main thread, so there is nothing here for a worker to do. What this package provides is named a substitute because that is the seam a document module takes — it asks the importer for a worker and gets this — but it is the only implementation, not a fallback for a deployment that cannot start a worker.

Two consequences worth knowing before building on it. The replies carry pdf.js objects — a document and a page proxy — which no structured clone can move, so this contract holds only in the thread that loaded the document. And the parsing still happens off the main thread, inside pdf.js's worker, so the substitute is not the performance compromise the name suggests.

## The worker pdf.js needs

pdf.js fetches its worker from an address rather than constructing one, so a consumer serves the bundle and gives the address to the importer:

```ts
import { PdfImporter } from '@epicurrents/pdf-reader'

const importer = new PdfImporter('/assets/pdfjs.worker.js')
```

`npm run build:workers` emits that bundle as `umd/pdfjs.worker.js`. It is pdf.js's own worker, rebundled as one self-contained file.

**The bundle and the pdf.js the consumer loads must be the same version.** pdf.js compares the two at load time and throws when they differ, so every document fails with a version-mismatch error rather than degrading. The bundle is built from the `pdfjs-dist` installed beside this package when it is packed, while the main-thread half resolves to whatever the consumer installed — see [ROADMAP.md](ROADMAP.md) for what the manifest should say about that.

## Reading a document

| Commission | Reply |
|---|---|
| `set-sources` | `numPages`, the page count of the loaded document |
| `get-page-content` | `content`, the page's text with its runs joined |
| `get-page` | `page`, the pdf.js page proxy |
| `get-document` | `document`, the pdf.js document proxy |
| `update-settings` | acknowledged; reading a PDF depends on no application setting |
| `shutdown` | acknowledged, after the document has been released |

A page is addressed by the `pageNum` the document module sends, counted from one as pdf.js counts its own pages. A request naming no page is a request for the first.

Every path replies exactly once, including the failures: an unsettled commission leaves the caller's promise pending, which is indistinguishable from a document still loading. A failure carries its cause in `error`, which is what the document module shows for a file pdf.js refused.

### One document per study

The document module sends one source per data file and numbers them from one, which suits a format whose pages are separate files. A PDF holds its own pages, so this reader takes the address of the first source and reports that document's page count; further sources are logged and ignored, because the page numbering has no way to say which file a page belongs to. See [ROADMAP.md](ROADMAP.md).

### Releasing a document

A loaded document holds a pdf.js worker and the parsed file behind it, and `destroy` is the only thing that gives either back. The substitute releases the document it holds when one replaces it, when the `shutdown` commission arrives, and when it is terminated without one.

## Development

```bash
npm install
npm run build     # the pdf.js worker bundle, then the library and its declarations
npm test          # type-checks the suite, then runs it
npm run lint
```

pdf.js is left a bare import for the consumer to install; only the worker it needs is bundled.
