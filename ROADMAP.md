# @epicurrents/pdf-reader — roadmap

Open and deferred work, and the findings of the audit pass that are recorded rather than fixed.

## Closed by this pass

Recorded because each was reachable on the package's only path, and the list is the measure of how much of it had never been run.

- **A refused commission answered the window instead of the service.** `validateCommissionProps` takes the reply channel as its fourth argument and defaults to the global `postMessage`, which on the main thread is the window. All three call sites left it to the default, so a commission carrying a bad property was never settled — the caller's promise stayed pending, which reads as a document still loading — and the reply was delivered to any other window listener on the page.
- **No failure carried its cause.** Every failing path built its own reply by hand, with no `error` property, while holding the pdf.js exception that explained it. `set-sources` is the one commission the document module rejects on, and its reason is what the resource shows as its error state, so a file pdf.js refused for a stated reason was reported as a bare failure.
- **A document was never released.** `getDocument` gives back a proxy holding a pdf.js worker and the parsed file, and `destroy` is the only thing that returns either. Loading a second document overwrote the reference, and nothing released one at shutdown, so every document opened in a session stranded a worker thread for the life of the page.
- **The `shutdown` commission was not answered**, so the base class refused it — and `GenericService.shutdown` terminates its worker only if that commission comes back successful. The service kept its commissions, stayed ready, and held a substitute still holding a document.
- **`get-document` reported success with no document.** The property read was wrapped in a try/catch that cannot throw, and answering before any document was loaded replied `success: true` with `document: null`.
- **The lint script had never passed.** The config predated the family rule set and flagged five template literals as errors; under the family set they are house style, and the two real findings it had been hiding — an empty interface and two `async` methods with no `await` — are now stated with the exemptions the siblings use.
- **There were no tests.** `tests/tests.ts` imported `../src/PdfReader`, a module this package has never had, and was not matched by the suite's `*.test.ts` include either, so it had never run and could not have.
- **The declared core range was `^1.0.0`** while the package type-checks clean against 2.0.0, and its committed lockfile resolved core `0.3.0-2` from the registry — which is what a standalone clone would have installed whatever the range said.
- **An ambient `*?raw` module declaration** sat in `src/types/pdfjs.d.ts`, declaring a Vite feature no source in this package uses. It was published in `dist/types/`, where it would widen any consumer's module resolution to accept `?raw` on every import whether their bundler supports it or not.
- **`files` published `umd/*js`**, missing the dot, and `typedoc` was a dependency with no script that runs it — some four hundred transitive packages for nothing.

## A study of several PDFs can only show the first

The document module sends one source per data file and numbers them from one, a model that fits a reader whose pages *are* files. A PDF holds its own pages, so this reader reads the first source and reports that document's page count; the rest are logged and ignored.

The builder registers `doc/pdf-folder` as a study importer, so a user can select several PDFs and get one of them. Fixing it properly means addressing a page by file *and* ordinal, which the commission cannot express — `pageNum` is one number, and core's `validateCommissionProps` matches a single constructor, so a union would need a change in core as well. The same widening is what [@epicurrents/doc-module](https://github.com/epicurrents/doc-module)'s roadmap weighs for named divisions, and the two should be settled together rather than one format at a time.

## The pdf.js version is pinned by a caret and checked by an exception

pdf.js compares the API version against the worker version when a document loads and throws when they differ. The worker bundle is built from the `pdfjs-dist` installed beside this package, while the main-thread half is a bare import the consumer resolves — and `dependencies` declares `^4.9.155`, so the two are only the same copy by luck of hoisting.

The builder works around it with a prebuild step that copies its own `pdfjs-dist` into this package before building the bundle. For a published consumer there is no such step, so the manifest should state the requirement itself: an exact version rather than a range, since a prebuilt worker cannot follow a range the consumer resolves. Worth doing with the first publish that can carry a dependency change.

## A PDF study's format is never set

`importFile` writes `format: 'pdf'` on the study *file*, and the document loader reads `this._study.format` — the study's own, which only the biosignal loader ever writes. So a PDF resource's `sourceFormat` is the empty string. It reaches nothing else, which is why nobody has noticed.

doc-module's roadmap records the surrounding problem as a cast nobody checks, and describes the value as "whatever the importer wrote there"; measured, nothing writes it at all for a document study. Settling the cast is the place to settle this too.

## Blob URLs are created per imported file and never revoked

`importFile` publishes one for every file and nothing revokes it, so the whole file stays reachable for the session. This is the house pattern rather than a defect here — core does the same in eight places, `GenericStudyImporter` included — and the fix is a lifetime owner for the URL, which is core's to decide. Recorded in the builder's roadmap.

Passing the `File` to pdf.js as an `ArrayBuffer` instead would remove the URL, and is the wrong trade: pdf.js reads the ranges it needs from an address, so a document would go from paged reads to the whole file on the heap.

## `get-page` and `get-document` hand out pdf.js objects

Both replies carry a pdf.js proxy, which no structured clone can move, so the contract holds only on the thread that loaded the document. That is not a problem today — pdf.js is driven from the main thread and there is no worker here to cross — but it is the reason this package cannot grow one, and a consumer registering a worker override for the `pdf` key gets a contract that silently cannot answer these two.

Nothing in the interface calls either; the document viewer reads `content`. So what is undecided is what they should return across a boundary, not the wiring.

## Smaller things

`PdfFileImporter` adds nothing to core's `FileFormatImporter` and carries an eslint exemption to say so. It is a named seam, kept so the packages building on it name this reader's contract.

The `exports` map declares `./types` and `./dist/types` for the same file, and `./workers/*` and `./umd/*` for the same directory. Narrowing it is a breaking change for a consumer using the redundant spelling, so it waits for a version that can carry one.

The worker build emits `umd/pdfjs.worker.js` from pdf.js's own worker, which is the one bundle in the family that is not this package's code. Its licence notices are collected at the end of the file by `legalComments: 'eof'` rather than dropped, which is what keeps the Apache-2.0 attribution with it.

[tests/pdfDouble.ts](tests/pdfDouble.ts) and the double in the sibling document reader answer different libraries, so there is nothing to share between them — but both packages serve the same document commissions, and nothing checks that the two readers answer them the same way. A contract suite over both would have caught the reply-channel defect in one of them.
