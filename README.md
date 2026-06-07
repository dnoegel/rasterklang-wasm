# rasterklang-wasm

Browser SDK for playing Commodore 64 SID tunes in web apps, powered by
`rasterklang`, Go WebAssembly, and the Web Audio API.

`rasterklang-wasm` is intentionally UI-free at the integration layer. It gives web apps a
small JavaScript API for loading `.sid` tune files, reading PSID/RSID metadata,
rendering SID audio as PCM chunks, and playing those tunes in the browser. The
included page is only a demo consumer of that SDK.

## Requirements

- Go 1.26 or newer with the standard `js/wasm` target.
- A browser with WebAssembly and Web Audio support.
- One or more `.sid` tune files to load locally in the browser.

The module depends on `github.com/dnoegel/rasterklang`. For local multi-repo
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
- `dist/rasterklang.wasm` - compiled Go SID bridge
- `dist/wasm_exec.js` - copied from the local Go toolchain

`dist/` is ignored by Git because these files are generated.

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
rasterklang.wasm
wasm_exec.js
```

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
