const defaultWasmExecURL = defaultAssetURL("./wasm_exec.js");
const defaultWasmURL = defaultAssetURL("./zmk-web.wasm");
const defaultChunkFrames = 4096;
const defaultScheduleAheadSeconds = 0.72;
const defaultScheduleIntervalMs = 75;

let wasmReady;

export async function createZmkSid(options = {}) {
  const api = await loadWasm(options);
  return new ZmkSid(api);
}

export class ZmkSidError extends Error {
  constructor(message, response = null) {
    super(message);
    this.name = "ZmkSidError";
    this.response = response;
  }
}

export class ZmkSid {
  constructor(api) {
    this.api = api;
    this.runtime = api.runtime || "";
    this.currentTune = null;
  }

  loadBytes(bytes) {
    const result = this.api.load(toUint8Array(bytes));
    assertOK(result);

    const tune = new ZmkSidTune(this, result);
    this.currentTune = tune;
    return tune;
  }

  async loadFile(file) {
    if (!file || typeof file.arrayBuffer !== "function") {
      throw new ZmkSidError("loadFile expects a browser File or Blob.");
    }
    return this.loadBytes(new Uint8Array(await file.arrayBuffer()));
  }

  createStream(options = {}) {
    return this.requireTune().createStream(options);
  }

  createAudioPlayer(options = {}) {
    return this.requireTune().createAudioPlayer(options);
  }

  requireTune() {
    if (!this.currentTune) {
      throw new ZmkSidError("Load a SID file before creating a stream or player.");
    }
    return this.currentTune;
  }

  startStream(options = {}) {
    const subtune = numberOrDefault(options.subtune, 0);
    const sampleRate = numberOrDefault(options.sampleRate, 44100);
    const result = this.api.start(subtune, sampleRate);
    assertOK(result);
    return new ZmkSidStream(this.api, result);
  }
}

export class ZmkSidTune {
  constructor(client, result) {
    this.client = client;
    this.metadata = normalizeMetadata(result.metadata);
    this.supported = Boolean(result.supported);
    this.supportError = result.supportError || "";
  }

  createStream(options = {}) {
    return this.client.startStream({
      subtune: options.subtune ?? this.metadata.defaultSubtune,
      sampleRate: options.sampleRate,
    });
  }

  createAudioPlayer(options = {}) {
    return new ZmkSidAudioPlayer(this, options);
  }
}

export class ZmkSidStream {
  constructor(api, startResult) {
    this.api = api;
    this.subtune = startResult.subtune;
    this.sampleRate = startResult.sampleRate;
    this.active = true;
  }

  readChunk(frames = defaultChunkFrames) {
    if (!this.active) {
      throw new ZmkSidError("Cannot read from a stopped SID stream.");
    }

    const result = this.api.readChunk(frames);
    assertOK(result);

    if (!(result.samples instanceof Int16Array)) {
      throw new ZmkSidError("WASM stream returned an invalid sample buffer.", result);
    }
    return result.samples;
  }

  stop() {
    if (!this.active) {
      return;
    }

    const result = this.api.stop();
    assertOK(result);
    this.active = false;
  }
}

export class ZmkSidAudioPlayer {
  constructor(tune, options = {}) {
    this.tune = tune;
    this.audioContext = options.audioContext || null;
    this.destination = options.destination || null;
    this.subtune = options.subtune ?? tune.metadata.defaultSubtune;
    this.chunkFrames = options.chunkFrames || defaultChunkFrames;
    this.scheduleAheadSeconds =
      options.scheduleAheadSeconds || defaultScheduleAheadSeconds;
    this.scheduleIntervalMs = options.scheduleIntervalMs || defaultScheduleIntervalMs;
    this.onError = options.onError || null;

    this.stream = null;
    this.sampleRate = 0;
    this.playing = false;
    this.scheduledTime = 0;
    this.scheduler = 0;
    this.sources = new Set();
  }

  async play(options = {}) {
    if (this.playing) {
      return this;
    }

    if (options.subtune !== undefined) {
      this.subtune = options.subtune;
    }

    this.audioContext =
      options.audioContext || this.audioContext || createAudioContext();
    this.destination =
      options.destination || this.destination || this.audioContext.destination;

    await this.audioContext.resume();

    this.stream = this.tune.createStream({
      subtune: this.subtune,
      sampleRate: Math.round(this.audioContext.sampleRate),
    });
    this.subtune = this.stream.subtune;
    this.sampleRate = this.stream.sampleRate;
    this.playing = true;
    this.scheduledTime = this.audioContext.currentTime + 0.06;

    this.schedule();
    this.scheduler = window.setInterval(
      () => this.schedule(),
      this.scheduleIntervalMs,
    );
    return this;
  }

  stop() {
    if (this.scheduler) {
      window.clearInterval(this.scheduler);
      this.scheduler = 0;
    }

    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources.clear();

    if (this.stream) {
      this.stream.stop();
      this.stream = null;
    }

    this.playing = false;
    this.scheduledTime = 0;
  }

  schedule() {
    if (!this.playing || !this.stream || !this.audioContext) {
      return;
    }

    try {
      while (
        this.scheduledTime <
        this.audioContext.currentTime + this.scheduleAheadSeconds
      ) {
        const samples = this.stream.readChunk(this.chunkFrames);
        if (!samples.length) {
          throw new ZmkSidError("The SID stream returned no samples.");
        }

        const buffer = int16ToAudioBuffer(
          this.audioContext,
          samples,
          this.sampleRate,
        );
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.destination);
        source.onended = () => this.sources.delete(source);

        const startAt = Math.max(
          this.scheduledTime,
          this.audioContext.currentTime + 0.01,
        );
        source.start(startAt);
        this.sources.add(source);
        this.scheduledTime = startAt + buffer.duration;
      }
    } catch (error) {
      this.stop();
      if (this.onError) {
        this.onError(error);
      } else {
        throw error;
      }
    }
  }
}

export function int16ToFloat32(samples) {
  const output = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    output[i] = Math.max(-1, samples[i] / 32768);
  }
  return output;
}

function int16ToAudioBuffer(audioContext, samples, sampleRate) {
  const buffer = audioContext.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(int16ToFloat32(samples), 0);
  return buffer;
}

async function loadWasm(options) {
  if (globalThis.zmkSid) {
    return globalThis.zmkSid;
  }
  if (wasmReady) {
    return wasmReady;
  }

  wasmReady = (async () => {
    const wasmExecURL = options.wasmExecURL || defaultWasmExecURL;
    const wasmURL = options.wasmURL || defaultWasmURL;

    if (!globalThis.Go) {
      await loadScript(wasmExecURL);
    }
    if (!globalThis.Go) {
      throw new ZmkSidError("wasm_exec.js loaded, but Go was not registered.");
    }

    const go = new globalThis.Go();
    const response = await fetch(wasmURL);
    if (!response.ok) {
      throw new ZmkSidError(`Could not load ${wasmURL}: ${response.status}`);
    }

    const bytes = await response.arrayBuffer();
    const result = await WebAssembly.instantiate(bytes, go.importObject);
    go.run(result.instance);
    await Promise.resolve();

    if (!globalThis.zmkSid) {
      throw new ZmkSidError("WASM loaded, but the zmkSid API was not registered.");
    }
    return globalThis.zmkSid;
  })();

  return wasmReady;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      if (globalThis.Go) {
        resolve();
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () =>
      reject(new ZmkSidError(`Could not load wasm_exec.js from ${src}.`));
    document.head.append(script);
  });
}

function toUint8Array(bytes) {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }
  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes);
  }
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  throw new ZmkSidError("loadBytes expects a Uint8Array, ArrayBuffer, or view.");
}

function normalizeMetadata(metadata) {
  return {
    format: metadata.format,
    version: metadata.version,
    title: metadata.title,
    author: metadata.author,
    released: metadata.released,
    subtuneCount: metadata.subtuneCount,
    defaultSubtune: metadata.defaultSubtune,
    clock: metadata.clock,
    sidModel: metadata.sidModel,
  };
}

function numberOrDefault(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function assertOK(result) {
  if (!result || !result.ok) {
    throw new ZmkSidError(
      result && result.error ? result.error : "zmk-web failed.",
      result,
    );
  }
}

function createAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    throw new ZmkSidError("This browser does not support Web Audio.");
  }
  return new AudioContext();
}

function defaultAssetURL(path) {
  try {
    return new URL(path, import.meta.url).href;
  } catch {
    return path;
  }
}
