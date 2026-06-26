# rasterklang-wasm Release Notes

This file is for maintainers. Keep the public README focused on SDK use.

## Distribution

The GitHub Release archive is the baseline distribution for the first
`rasterklang-wasm` release. npm publication is a separate channel and should not
be claimed until the package is actually published under the `rasterklang-wasm`
name.

The SDK follows the Rasterklang engine release it is built against:

| rasterklang-wasm release | Engine dependency | Notes |
| --- | --- | --- |
| v0.1.0 | github.com/dnoegel/rasterklang-cli v0.1.0 | First SDK release candidate. |

For local development, `go work` may point at a sibling engine checkout. Public
release archives must be built from the dependency recorded in `go.mod`.

## Package Contract

Build before packing or publishing:

```sh
make build
npm pack --dry-run
```

The package export points to:

```text
./dist/rasterklang.js
./dist/rasterklang.d.ts
```

The package also includes `rasterklang.wasm` and `wasm_exec.js`, because the JS
entry point loads those files at runtime unless explicit URLs are passed to
`createRasterklang()`.

## npm Publishing

npm publishing requires:

- public repository/module identity resolved
- public core dependency tag reachable
- `NPM_TOKEN` configured in the release repository
- package version checked with `node scripts/check-package-version.mjs`
- `npm pack --dry-run` reviewed

The release workflow uses npm provenance:

```sh
npm publish --provenance --access public
```

If `NPM_TOKEN` is not configured, publish only the GitHub Release archive and
leave npm availability unclaimed.

## Build Metadata

The SDK exposes release metadata through:

```js
const info = rk.releaseInfo();
console.log(info.version, info.commit, info.date, info.runtime);
```

`make build` and `make dist` inject `BUILD_VERSION`, `COMMIT`, and `DATE` with
Go linker flags. Release builds pass the tag with:

```sh
VERSION=v0.1.0 make dist
```

Development builds derive `BUILD_VERSION` from `git describe --tags --dirty
--always`. `DATE` defaults to the current commit timestamp so repeated local
builds do not dirty checked WASM assets solely because wall-clock time changed.

## Standalone Preflight

```sh
make standalone-preflight
```

This verifies the SDK can resolve its public Go module graph without local
workspace help by running `GOWORK=off go mod download all`.

## Identity Preflight

```sh
make identity-preflight
```

This verifies the checkout points at `dnoegel/rasterklang-wasm` and that
`go.mod` declares `github.com/dnoegel/rasterklang-wasm`.

## Release Archive

Build a snapshot archive:

```sh
make dist
```

Build a tagged archive:

```sh
make dist VERSION=v0.1.0
```

The archive contains:

```text
rasterklang.js
rasterklang.d.ts
rasterklang.wasm
wasm_exec.js
RELEASE_PROVENANCE.json
```

Verify it with its `.sha256` file:

```sh
sha256sum -c rasterklang-wasm-v0.1.0.tar.gz.sha256
```

On macOS:

```sh
shasum -a 256 -c rasterklang-wasm-v0.1.0.tar.gz.sha256
```

`RELEASE_PROVENANCE.json` is a build record, not a signed attestation.

## Serving

Serve `rasterklang.wasm` with:

```text
Content-Type: application/wasm
```

Recommended cache policy for immutable versioned SDK directories:

```text
Cache-Control: public, max-age=31536000, immutable
```

Do not overwrite an already-published versioned WASM directory in place.
