# Contributing

Rasterklang WASM is the browser SDK layer for the Rasterklang SID engine. Keep
changes small, documented, and covered by the closest practical check.

## Local Checks

Run the full release gate before sending changes:

```sh
make check
```

`make check` runs Go package tests under `GOOS=js GOARCH=wasm` through the Go
toolchain's `go_js_wasm_exec` runner. If you need to override the runner path,
set `GO_WASM_EXEC=/path/to/go_js_wasm_exec`.

For package/archive changes, run the package contract directly as well:

```sh
node scripts/test-package-contract.mjs
```

For browser integration changes, run or inspect:

```sh
node scripts/test-browser-sdk.mjs
```

The browser smoke uses a synthetic PSID generated in the test. Do not replace it
with an HVSC tune or other third-party SID file.

## Engine Development

The module depends on `github.com/dnoegel/rasterklang-cli`. For local multi-repo
development, use `go work` with a sibling engine checkout:

```sh
go work init . ../rasterklang
```

Do not commit local `replace` directives just to test sibling engine changes.
Release archives must be built from the engine dependency recorded in `go.mod`.

## Generated Artifact Hygiene

`dist/` is generated release output from `make build`, `make dist`,
`make license-report`, and `make check`. Do not commit generated `dist/` contents;
rebuild the SDK, archive, checksums, npm dry-run package, and generated license
report from the tagged source.

`go.work` and `go.work.sum` are local workspace files for multi-repo
development. Keep them ignored so public releases prove they build from the
module graph in `go.mod` instead of a private sibling checkout.

`.DS_Store` is local OS metadata and must stay ignored.

## Legal Data Boundaries

Do not commit SID files, HVSC extracts, C64 ROM images, generated compatibility
reports from private corpora, or other third-party media unless the license is
explicitly documented and compatible with redistribution.

Small synthetic fixtures created inside tests are fine when they are
source-authored and do not copy third-party tune data.

## Release Changes

Release-facing edits should keep these files current:

- `README.md` for SDK usage, compatibility, archive verification, and serving
  guidance.
- `CHANGELOG.md` for user-visible changes.
- `THIRD_PARTY_NOTICES.md` for dependency and artifact notices.
- `package.json` for npm package metadata and included files.
- `.github/workflows/release.yml` for tag-built artifacts.
- `scripts/test-package-contract.mjs` for archive and package contract changes.
