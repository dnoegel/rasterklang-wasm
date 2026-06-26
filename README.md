# rasterklang-wasm

[![Build browser SDK](https://github.com/dnoegel/rasterklang-wasm/actions/workflows/build.yml/badge.svg)](https://github.com/dnoegel/rasterklang-wasm/actions/workflows/build.yml)
[![Release](https://github.com/dnoegel/rasterklang-wasm/actions/workflows/release.yml/badge.svg)](https://github.com/dnoegel/rasterklang-wasm/actions/workflows/release.yml)

Rasterklang WASM is a browser SDK for playing Commodore 64 SID tunes in web
apps. It wraps the Rasterklang Go engine with WebAssembly and a small JavaScript
API.

The SDK is intentionally UI-free. It loads `.sid` files, exposes PSID/RSID
metadata, renders PCM chunks, and can schedule playback through the Web Audio
API. The included demo page is only an example consumer.

## Requirements

- Go 1.26 or newer
- Node.js 22 or newer
- Chrome or Chromium for the headless browser smoke test
- a browser with WebAssembly and Web Audio support

For local multi-repo development, use a Go workspace so the SDK can pick up a
sibling engine checkout:

```sh
go work init . ../rasterklang
```

`go.work` is ignored by Git.

## Build

```sh
make build
```

The build writes browser assets to `dist/`:

- `dist/rasterklang.js`
- `dist/rasterklang.d.ts`
- `dist/rasterklang.wasm`
- `dist/wasm_exec.js`

`dist/` is generated output and is ignored by Git.

## Run The Demo

```sh
make serve
```

Open:

```text
http://localhost:8080/demo/
```

If that port is already used:

```sh
make serve PORT=9090
```

The demo can choose or drop a local `.sid` tune. SID files stay in the browser
and are not uploaded.

## Use The SDK

Serve these files together from your website or app:

```text
rasterklang.js
rasterklang.wasm
wasm_exec.js
```

Load a SID file from a browser `File`:

```html
<script type="module">
  import { createRasterklang } from "./rasterklang.js";

  const rk = await createRasterklang();

  document.querySelector("input[type=file]").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    const tune = await rk.loadFile(file);

    console.log(tune.metadata);
  });
</script>
```

By default, `rasterklang.js` loads `wasm_exec.js` and `rasterklang.wasm` from
the same directory as itself. If you serve them elsewhere, pass explicit URLs:

```js
const rk = await createRasterklang({
  wasmExecURL: "/assets/rasterklang/wasm_exec.js",
  wasmURL: "/assets/rasterklang/rasterklang.wasm",
});
```

## Play Audio

Use `createAudioPlayer()` when the SDK should handle Web Audio scheduling:

```js
const tune = await rk.loadFile(fileInput.files[0]);

const player = tune.createAudioPlayer({
  subtune: tune.metadata.defaultSubtune,
  onError(error) {
    console.error(error);
  },
});

await player.play();
```

`player.play()` must run from a browser user gesture so the audio context can
resume under browser autoplay rules.

## Read PCM Chunks

Use `createStream()` when your app owns audio scheduling, visualization, export,
buffering, or analysis:

```js
const tune = await rk.loadFile(file);
const stream = tune.createStream({
  subtune: 1,
  sampleRate: 44100,
});

const samples = stream.readChunk(4096); // Int16Array, mono PCM
stream.stop();
```

## Debug Streams

When `rk.capabilities().features.trace` is true, `createDebugStream()` exposes
bounded trace events, snapshots, and frame/instruction stepping for learning
tools and inspectors:

```js
const debugStream = tune.createDebugStream({
  subtune: tune.metadata.defaultSubtune,
  sampleRate: 44100,
  traceMask: ["frames", "cpu", "sid.write"],
  maxTraceEvents: 4096,
});

debugStream.readChunk(4096);
console.log(debugStream.readTrace({ limit: 100 }));
console.log(debugStream.snapshot());
debugStream.stop();
```

The debug API is feature-detected. Playback continues to work on builds that do
not expose trace support.

## API Surface

- `createRasterklang({ wasmExecURL, wasmURL })`
- `rk.capabilities()`
- `rk.releaseInfo()`
- `rk.loadFile(file)`
- `rk.loadBytes(bytes)`
- `tune.metadata`
- `tune.supported`
- `tune.supportError`
- `tune.createStream({ subtune, sampleRate })`
- `tune.createDebugStream({ subtune, sampleRate, traceMask, maxTraceEvents })`
- `tune.createAudioPlayer({ subtune, audioContext, destination, onError })`

## Current Limits

- The SDK currently manages one active WASM SID stream at a time.
- `createAudioPlayer()` schedules chunks on the main browser thread.
- There is no seeking, looping, built-in playlist management, or waveform UI.
- Unsupported tunes surface the same Rasterklang engine limits as the CLI.
- SID files do not carry reliable song lengths, so playback is open-ended until
  stopped.

The SDK does not bundle HVSC, C64 ROM images, BASIC/KERNAL ROMs, or third-party
SID files.

## Development

```sh
make build
make check
make test
make clean
```

`make check` runs formatting, JavaScript syntax checks, browser smoke tests, Go
WASM vet/tests, and package-contract checks.

Maintainer release notes live in [docs/release.md](docs/release.md).
