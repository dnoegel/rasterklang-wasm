# Changelog

All notable changes to Rasterklang WASM should be recorded here before a public
tag is created. The project follows semantic version-style tags such as
`v0.1.0`.

## Unreleased

- Added MIT licensing and starter third-party notices.
- Added npm-style package metadata, ESM export mapping, and TypeScript declarations.
- Added release archives containing `rasterklang.js`, `rasterklang.d.ts`,
  `rasterklang.wasm`, and `wasm_exec.js`, plus SHA-256 checksum files.
- Added browser smoke coverage for SDK loading, synthetic SID metadata parsing,
  PCM stream chunks, audio controls, stop behavior, and debug APIs.
- Added package contract checks for archive contents, package metadata, version
  compatibility documentation, browser compatibility documentation, checksum
  verification instructions, and `application/wasm` serving guidance.
- Added `make check` as the local and CI release gate for formatting, JavaScript
  syntax, package/browser contracts, Go vet, and WASM-target Go tests.

## v0.1.0

Initial public release target. This version is not tagged until the release
checklist in `Rasterklang-Releaseplan.md` is complete for the WASM SDK.
