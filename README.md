# rasterklang-wasm

[![Build browser SDK](https://github.com/dnoegel/rasterklang-wasm/actions/workflows/build.yml/badge.svg)](https://github.com/dnoegel/rasterklang-wasm/actions/workflows/build.yml)
[![Release](https://github.com/dnoegel/rasterklang-wasm/actions/workflows/release.yml/badge.svg)](https://github.com/dnoegel/rasterklang-wasm/actions/workflows/release.yml)

Browser SDK for playing Commodore 64 SID tunes in web apps, powered by
`rasterklang`, Go WebAssembly, and the Web Audio API.

`rasterklang-wasm` is intentionally UI-free at the integration layer. It gives web apps a
small JavaScript API for loading `.sid` tune files, reading PSID/RSID metadata,
rendering SID audio as PCM chunks, and playing those tunes in the browser. The
included page is only a demo consumer of that SDK.

## Requirements

- Go 1.26 or newer with the standard `js/wasm` target.
- Node.js 22 or newer for package and browser smoke checks.
- Chrome or Chromium for the browser SDK smoke. Set `CHROME_BIN` if it is not
  on a common path.
- A browser with WebAssembly and Web Audio support.
- One or more `.sid` tune files to load locally in the browser.

The module depends on `github.com/dnoegel/rasterklang-cli`. For local multi-repo
development, use a Go workspace so changes in a sibling `../rasterklang` checkout
are picked up without committing a `replace`:

```sh
go work init . ../rasterklang
```

`go.work` is ignored by Git.

## Build

```sh
make build
```

The build writes generated/browser assets to `dist/`:

- `dist/rasterklang.js` - public browser SDK
- `dist/rasterklang.d.ts` - TypeScript declarations for the public SDK
- `dist/rasterklang.wasm` - compiled Go SID bridge
- `dist/wasm_exec.js` - copied from the local Go toolchain

`dist/` is ignored by Git because these files are generated.

## Package Contract

The repository includes npm-style package metadata for consumers that want to
install or vendor the SDK as an ESM package. Build before packing or publishing:

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

First-release distribution policy: the GitHub Release archive is the baseline
distribution for `rasterklang-wasm`. npm publishing is enabled only after the
public repository/module identity is resolved, the first public core dependency
tag is reachable, and the release repository has an `NPM_TOKEN` configured.

The package name is `rasterklang-wasm`. Release CI verifies the npm package with:

```sh
node scripts/check-package-version.mjs --version v0.1.0
npm pack --dry-run
```

Tag releases can publish to npm when the repository has an `NPM_TOKEN` secret.
The release workflow uses npm provenance:

```sh
npm publish --provenance --access public
```

If `NPM_TOKEN` is not configured, the GitHub Release archive is still published
and npm publishing is skipped. Do not claim npm availability until the package is
actually published under the `rasterklang-wasm` name.

## Version Compatibility

The WASM SDK follows the `rasterklang` engine release it is built against. Keep
this table current whenever `go.mod` changes:

| rasterklang-wasm release | Engine dependency | Notes |
| --- | --- | --- |
| v0.1.0 | github.com/dnoegel/rasterklang-cli v0.1.0 | First SDK release candidate; browser smoke covers playback and debug APIs in Chromium. |

For local development, `go work` may point at a sibling engine checkout. Public
release archives must be built from the dependency recorded in `go.mod`, not an
uncommitted local engine tree.

### Build Metadata

The SDK exposes release metadata from the compiled WASM bridge:

```js
const info = rk.releaseInfo();
console.log(info.version, info.commit, info.date, info.runtime);
```

`make build` and `make dist` inject `BUILD_VERSION`, `COMMIT`, and `DATE` with
Go linker flags. Release builds pass the tag through `VERSION=v0.1.0 make dist`;
development builds derive `BUILD_VERSION` from `git describe --tags --dirty
--always` when `VERSION` is empty.

### Standalone Preflight

```sh
make standalone-preflight
```

This verifies the SDK can resolve its public Go module graph without local
workspace help by running `GOWORK=off go mod download all`. The current release
candidate depends on `github.com/dnoegel/rasterklang-cli@v0.1.0`; publish the
canonical core repository/tag and align module paths before cutting a public SDK
release.

### Release Identity Preflight

```sh
make identity-preflight
```

This verifies the release checkout is pointed at the public
`dnoegel/rasterklang-wasm` repository and that `go.mod` declares
`github.com/dnoegel/rasterklang-wasm`. Fix the origin remote, module path,
README links, and release workflow URLs before tagging if this preflight fails.

## Browser Compatibility

Current automated coverage:

| Browser | Status |
| --- | --- |
| Chrome/Chromium | Automated smoke via `scripts/test-browser-sdk.mjs`; covers SDK load, WASM instantiation, metadata parsing, PCM chunks, audio controls, and debug APIs. |
| Firefox | Expected to work with WebAssembly and Web Audio, but first release still needs a manual playback check. |
| Safari | Expected to work with WebAssembly and Web Audio, but first release still needs a manual playback check, especially around autoplay and `AudioContext` resume behavior. |

The SDK requires browser support for WebAssembly, ES modules, typed arrays, and
Web Audio when `createAudioPlayer()` is used. Browser autoplay rules apply:
start playback from a user gesture.

## Engine Support Boundaries

The SDK exposes the same SID engine support boundaries as the `rasterklang` CLI.
It can parse PSID/RSID metadata, stream PCM samples, and surface the engine's
current support verdict to browser apps. It is not a full C64 emulator and does
not bundle HVSC, C64 ROM images, BASIC/KERNAL ROMs, or third-party SID files.

### Unsupported Tune Behavior

Unsupported RSID/BASIC/ROM edge cases may fail to initialize, produce silence,
or render differently from a hardware C64 or libsidplayfp-based player. Browser
apps should treat metadata support verdicts and playback errors as user-facing
states, not as impossible failures. Local file loads stay in the browser unless
the embedding app explicitly uploads them.

## Browser Smoke

`make check` and `make test` run `scripts/test-browser-sdk.mjs`. The smoke builds
`dist/`, serves the SDK through a local HTTP server with `application/wasm`, and
drives headless Chrome through the DevTools Protocol.

The smoke uses a synthetic PSID generated inside the test, not an HVSC tune. It
loads the SDK, verifies metadata parsing, starts a PCM stream, checks non-zero
samples, exercises audio controls, and verifies debug stream APIs including
trace reads, snapshots, `stepFrame()`, and `stepInstruction()`.

## Release Archive

```sh
make dist
```

This builds a browser SDK archive:

```text
dist/rasterklang-wasm-snapshot.tar.gz
dist/rasterklang-wasm-snapshot.tar.gz.sha256
```

For a tagged release:

```sh
make dist VERSION=v0.1.0
```

The archive contains the files a website needs to serve:

```text
rasterklang.js
rasterklang.d.ts
rasterklang.wasm
wasm_exec.js
RELEASE_PROVENANCE.json
```

## Verify A Release Archive

Release archives ship with a `.sha256` file. Verify the archive before
unpacking or vendoring it:

```sh
sha256sum -c rasterklang-wasm-v0.1.0.tar.gz.sha256
```

On macOS without GNU coreutils:

```sh
shasum -a 256 -c rasterklang-wasm-v0.1.0.tar.gz.sha256
```

## Release Provenance

Release archives and npm package contents include `RELEASE_PROVENANCE.json`.
It records the SDK version, source commit, build date, source repository,
artifact name, `js/wasm` target, dirty-source flag, and available GitHub Actions
run context.

The provenance file is a build record, not a signed attestation. npm provenance
is enabled in the release workflow for the future npm package path; GitHub
Release archives should still be verified with their `.sha256` files.

Then inspect the expected files:

```sh
tar -tzf rasterklang-wasm-v0.1.0.tar.gz
```

## Serving And Caching

Serve the four archive files from the same immutable release directory whenever
possible, for example `/vendor/rasterklang-wasm/v0.1.0/`.

Required MIME type:

```text
Content-Type: application/wasm
```

Set it for `rasterklang.wasm`; otherwise browsers may reject streaming WASM
instantiation or fall back to slower paths.

Recommended cache policy for versioned release directories:

```text
Cache-Control: public, max-age=31536000, immutable
```

Recommended cache policy for mutable HTML entry points, import maps, or any URL
that can change while pointing at a new release:

```text
Cache-Control: no-cache
```

Do not overwrite a previously published versioned WASM directory in place.
Publish a new directory or package version, then update the website or app to
point at the new URL.

## Run The Demo

```sh
make serve
```

Then open:

```text
http://localhost:8080/demo/
```

If that port is already used:

```sh
make serve PORT=9090
```

The demo can choose or drop a local `.sid` tune file. SID files stay in the
browser and are not uploaded anywhere.

Browser audio autoplay rules apply: call playback from a user gesture, such as a
button click.

## Use As A Browser SDK

Copy or serve these files together from the website that should play SID tunes:

```text
dist/rasterklang.js
dist/rasterklang.wasm
dist/wasm_exec.js
```

Import the SDK from your page and load a SID tune from a browser `File`:

```html
<script type="module">
  import { createRasterklang } from "./dist/rasterklang.js";

  const rk = await createRasterklang();

  document.querySelector("input[type=file]").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    const tune = await rk.loadFile(file);

    console.log(tune.metadata);
  });
</script>
```

By default, `rasterklang.js` loads `wasm_exec.js` and `rasterklang.wasm` from the same
directory as itself. If you serve those files elsewhere, pass explicit URLs:

```js
const rk = await createRasterklang({
  wasmExecURL: "/assets/rk/wasm_exec.js",
  wasmURL: "/assets/rk/rasterklang.wasm",
});
```

### Capabilities

Use `capabilities()` to detect which runtime features the loaded WASM build
supports:

```js
const capabilities = rk.capabilities();

if (capabilities.features.trace) {
  console.log("Debug trace support is available");
}
```

It is synchronous, cheap, and side-effect free. Playback is always reported when
the SDK is loaded:

```js
{
  apiVersion: 1,
  runtime: "js/wasm",
  features: {
    playback: true,
    trace: false,
    snapshot: false,
    stepFrame: false,
    stepInstruction: false
  },
  limits: {
    maxChunkFrames: 65536,
    maxTraceEvents: 65536
  }
}
```

Debug features currently depend on a `rasterklang` build that exposes the optional
debug/trace engine API. Older or playback-only builds keep those feature flags
set to `false`.

Use `releaseInfo()` when an embedding app needs to display or log the exact WASM
bundle it loaded:

```js
{
  version: "v0.1.0",
  commit: "abc1234",
  date: "2026-06-24T20:30:00Z",
  runtime: "js/wasm"
}
```

### Play Audio

Use `createAudioPlayer()` when you want the SDK to handle Web Audio scheduling:

```js
let player;

playButton.addEventListener("click", async () => {
  const tune = await rk.loadFile(fileInput.files[0]);

  player = tune.createAudioPlayer({
    subtune: tune.metadata.defaultSubtune,
    onError(error) {
      console.error(error);
    },
  });

  await player.play();
});

stopButton.addEventListener("click", () => {
  player?.stop();
});
```

`player.play()` must run from a browser user gesture so the audio context can be
resumed.

### Read Raw PCM Chunks

Use `createStream()` when your app wants to own audio scheduling, visualization,
export, buffering, or analysis:

```js
const tune = await rk.loadFile(file);
const stream = tune.createStream({
  subtune: 1,
  sampleRate: 44100,
});

const samples = stream.readChunk(4096); // Int16Array, mono PCM
stream.stop();
```

### Debug Streams

When `rk.capabilities().features.trace` is true, use `createDebugStream()` for
learning tools, trace visualizers, and frame stepping:

```js
const tune = await rk.loadFile(file);
const debugStream = tune.createDebugStream({
  subtune: tune.metadata.defaultSubtune,
  sampleRate: 44100,
  traceMask: ["frames", "cpu", "sid.write"],
  maxTraceEvents: 4096,
});

const samples = debugStream.readChunk(4096);
const trace = debugStream.readTrace({ limit: 100 });
const snapshot = debugStream.snapshot();
const frame = debugStream.stepFrame();

debugStream.stop();
```

The debug API is feature-detected. If the loaded WASM build does not support it,
these methods throw `RasterklangError` while normal playback continues to work.

## API

- `createRasterklang({ wasmExecURL, wasmURL })`
- `rk.capabilities()`
- `rk.releaseInfo()`
- `rk.loadFile(file)` -> `RasterklangTune`
- `rk.loadBytes(bytes)` -> `RasterklangTune`
- `tune.metadata`
- `tune.supported`
- `tune.supportError`
- `tune.createStream({ subtune, sampleRate })`
- `tune.createDebugStream({ subtune, sampleRate, traceMask, maxTraceEvents })`
- `stream.readChunk(frames)` -> `Int16Array`
- `stream.stop()`
- `debugStream.readChunk(frames)` -> `Int16Array`
- `debugStream.readTrace({ limit, afterSeq })`
- `debugStream.snapshot()`
- `debugStream.stepFrame()`
- `debugStream.stepInstruction({ maxCycles })`
- `debugStream.stop()`
- `tune.createAudioPlayer({ subtune, audioContext, destination, onError })`
- `player.play()`
- `player.stop()`

Metadata includes:

- `title`
- `author`
- `released`
- `subtuneCount`
- `defaultSubtune`
- `clock`
- `sidModel`
- `format`
- `version`

## Current Limits

- The SDK currently manages one active WASM SID stream at a time.
- `createAudioPlayer()` schedules chunks on the main browser thread. It is good
  enough for a first SDK, but an AudioWorklet-backed ring buffer would be
  smoother.
- There is no seeking, looping, built-in volume control, waveform display, or
  playlist management yet.
- Unsupported tunes surface the same POC engine limits as `rasterklang`.
- SID files do not carry reliable song lengths, so playback is open-ended until
  stopped.

## Useful Commands

```sh
make build          # build WASM, copy wasm_exec.js, copy SDK JS
make check          # run format, JS syntax, package/browser contracts, vet, and WASM tests
make test           # run JS syntax checks, browser smoke, and WASM tests
make dist           # build a browser SDK archive in dist/
make serve          # build, then serve the repo root
make serve PORT=9090
make clean          # remove generated dist assets
make tag VERSION=v0.1.0
make push-tag VERSION=v0.1.0
make release VERSION=v0.1.0
```

Pushing a `v*` tag runs the release workflow, builds the SDK archive, and
publishes it as a GitHub Release asset.
