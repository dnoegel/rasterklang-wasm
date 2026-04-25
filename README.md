# zmk-web

Browser SDK for `zmk-sid`, built with Go WebAssembly and the Web Audio API.

`zmk-web` is intentionally UI-free at the integration layer. It gives web apps a
small JavaScript API for loading SID files, reading metadata, rendering PCM
chunks, and playing audio in the browser. The included page is only a demo
consumer of that SDK.

## Requirements

- Go 1.26 or newer with the standard `js/wasm` target.
- A local checkout of `../zmk-sid`. For now, `go.mod` uses a local `replace` so
  both repositories can be developed together.
- A browser with WebAssembly and Web Audio support.

## Build

```sh
make build
```

The build writes generated/browser assets to `dist/`:

- `dist/zmk-sid.js` - public browser SDK
- `dist/zmk-web.wasm` - compiled Go SID bridge
- `dist/wasm_exec.js` - copied from the local Go toolchain

`dist/` is ignored by Git because these files are generated.

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

The demo can choose or drop a local `.sid` file. SID files stay in the browser
and are not uploaded anywhere.

Browser audio autoplay rules apply: call playback from a user gesture, such as a
button click.

## Use As A Browser SDK

Copy or serve these files together:

```text
dist/zmk-sid.js
dist/zmk-web.wasm
dist/wasm_exec.js
```

Import the SDK from your page:

```html
<script type="module">
  import { createZmkSid } from "./dist/zmk-sid.js";

  const zmk = await createZmkSid();

  document.querySelector("input[type=file]").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    const tune = await zmk.loadFile(file);

    console.log(tune.metadata);
  });
</script>
```

By default, `zmk-sid.js` loads `wasm_exec.js` and `zmk-web.wasm` from the same
directory as itself. If you serve those files elsewhere, pass explicit URLs:

```js
const zmk = await createZmkSid({
  wasmExecURL: "/assets/zmk/wasm_exec.js",
  wasmURL: "/assets/zmk/zmk-web.wasm",
});
```

### Play Audio

Use `createAudioPlayer()` when you want the SDK to handle Web Audio scheduling:

```js
let player;

playButton.addEventListener("click", async () => {
  const tune = await zmk.loadFile(fileInput.files[0]);

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
const tune = await zmk.loadFile(file);
const stream = tune.createStream({
  subtune: 1,
  sampleRate: 44100,
});

const samples = stream.readChunk(4096); // Int16Array, mono PCM
stream.stop();
```

## API

- `createZmkSid({ wasmExecURL, wasmURL })`
- `zmk.loadFile(file)` -> `ZmkSidTune`
- `zmk.loadBytes(bytes)` -> `ZmkSidTune`
- `tune.metadata`
- `tune.supported`
- `tune.supportError`
- `tune.createStream({ subtune, sampleRate })`
- `stream.readChunk(frames)` -> `Int16Array`
- `stream.stop()`
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
- Unsupported tunes surface the same POC engine limits as `zmk-sid`.
- SID files do not carry reliable song lengths, so playback is open-ended until
  stopped.

## Useful Commands

```sh
make build          # build WASM, copy wasm_exec.js, copy SDK JS
make serve          # build, then serve the repo root
make serve PORT=9090
make clean          # remove generated dist assets
```
