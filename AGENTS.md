# @epicurrents/pdf-reader — instructions and architecture notes for AI coding assistants

The conventions of the wider repository apply here: 120-column source, no hard-wrapped Markdown prose, a module docstring with the `@package` / `@copyright` / `@license` header in every TypeScript file, and the class member ordering the family uses. What follows is what is particular to this package.

Read [README.md](README.md) first for the public surface and the commission table; this file covers the invariants a change can break without anything going red.

## Toolchain

```bash
npm run lint      # eslint over src, the family rule set
npm test          # tsc over the suite, then vitest with coverage
npm run build     # the pdf.js worker bundle, then the library and its declarations
```

`test:types` is a step of `npm test` rather than a separate habit, and it earns its place: the suite drives the reader through its message interface, where a wrong property name is a reply nobody reads rather than a failure.

## The validator must be handed a reply channel

`validateCommissionProps` takes the channel to answer on as its fourth argument, and left to its default it posts to the global scope. Inside a worker that is the worker's own reply channel; on the main thread it is the window, where no service is listening — so the commission is never settled, the caller waits forever, and the message is delivered to every other window listener on the page instead.

Every call here goes through `_validate`, which supplies `returnMessage`. A new commission that calls the validator directly reintroduces the defect, and no test of the happy path can see it.

## A reply after `super.shutdown()` reaches nobody

`ServiceWorkerSubstitute.shutdown` clears the listener list and `onmessage` both, and `returnMessage` has no other channel. So the `shutdown` commission is answered *before* the base method runs, not after.

This matters more than it looks: `GenericService.shutdown` terminates its worker only `if (await response.promise)`, so a substitute whose reply is dropped — or which lets the base class refuse the action, which is what an unimplemented action gets — leaves the service holding a live substitute, its commissions uncleared and its `isReady` unchanged, forever.

## A document is released wherever it stops being reachable

`getDocument` gives back a proxy holding a pdf.js worker and the parsed file, and `destroy` is the only thing that returns either. There are three ways a document stops being reachable — replaced by a second `set-sources`, released by the `shutdown` commission, and dropped with a substitute that is terminated without one — and `_releaseDocument` covers all three. A fourth path added without it strands a worker thread and a parsed document for the life of the page.

`_releaseDocument` clears the reference before it awaits, so a commission arriving during the release is refused rather than served from a document on its way out.

## A failed load leaves the document already held

`set-sources` loads into a local before it releases anything, so a caller reading one document and failing to open another keeps the first. Releasing first would be simpler and would lose a document the user still has open.

## The file-type array must be fresh per importer

`GenericStudyImporter.destroy` empties the file-type array **in place** rather than dropping the reference. A module-level array passed to the super constructor is therefore shared, and the first importer destroyed empties it for every other one — after which the file picker offers no PDF filter at all and nothing errors. The constructor wraps the module-level type in a new array for that reason.

## What the document module can and cannot address

A page is `pageNum`, counted from one. The module sends one source per data file, which suits a reader whose pages *are* files; a PDF holds its own, so only the first source is read. Do not widen this by reading the sources into several documents without changing the addressing — the commission has no way to name a file, so pages 1..N of the second document would collide with the first.

## Tests

[tests/pdfDouble.ts](tests/pdfDouble.ts) stands in for pdf.js: a real `getDocument` starts a worker and parses bytes, neither of which this package decides. It records the addresses it was asked for and whether each document was destroyed, which is what the leak assertions read — a test that asserts a reply shape cannot see a stranded document.

The double splits a page's text on `|` into separate runs, because pdf.js splits a line wherever the font or position changes and keeps the spacing inside the runs. That is what pins the join: a separator inserted between runs lands in the middle of a word.
