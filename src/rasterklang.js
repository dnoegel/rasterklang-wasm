const defaultWasmExecURL = defaultAssetURL("./wasm_exec.js");
const defaultWasmURL = defaultAssetURL("./rasterklang.wasm");
const defaultChunkFrames = 4096;
const defaultScheduleAheadSeconds = 0.72;
const defaultScheduleIntervalMs = 75;
const defaultMaxChunkFrames = 65536;
const defaultMaxTraceEvents = 65536;

let wasmReady;

export async function createRasterklang(options = {}) {
  const api = await loadWasm(options);
  return new Rasterklang(api);
}

export class RasterklangError extends Error {
  constructor(message, response = null) {
    super(message);
    this.name = "RasterklangError";
    this.response = response;
  }
}

export class Rasterklang {
  constructor(api) {
    this.api = api;
    this.runtime = api.runtime || "";
    this.currentTune = null;
  }

  loadBytes(bytes) {
    const result = this.api.load(toUint8Array(bytes));
    assertOK(result);

    const tune = new RasterklangTune(this, result);
    this.currentTune = tune;
    return tune;
  }

  async loadFile(file) {
    if (!file || typeof file.arrayBuffer !== "function") {
      throw new RasterklangError("loadFile expects a browser File or Blob.");
    }
    return this.loadBytes(new Uint8Array(await file.arrayBuffer()));
  }

  createStream(options = {}) {
    return this.requireTune().createStream(options);
  }

  createAudioPlayer(options = {}) {
    return this.requireTune().createAudioPlayer(options);
  }

  createDebugStream(options = {}) {
    return this.requireTune().createDebugStream(options);
  }

  capabilities() {
    if (typeof this.api.capabilities !== "function") {
      return defaultCapabilities();
    }
    return normalizeCapabilities(this.api.capabilities());
  }

  releaseInfo() {
    if (typeof this.api.releaseInfo !== "function") {
      return defaultReleaseInfo(this.runtime);
    }
    return normalizeReleaseInfo(this.api.releaseInfo(), this.runtime);
  }

  requireTune() {
    if (!this.currentTune) {
      throw new RasterklangError("Load a SID file before creating a stream or player.");
    }
    return this.currentTune;
  }

  startStream(options = {}) {
    const subtune = numberOrDefault(options.subtune, 0);
    const sampleRate = numberOrDefault(options.sampleRate, 44100);
    const result = this.api.start(subtune, sampleRate);
    assertOK(result);
    return new RasterklangStream(this.api, result);
  }

  startDebugStream(options = {}) {
    if (typeof this.api.startDebug !== "function") {
      throw new RasterklangError("This rasterklang-wasm build does not support debug streams.");
    }

    const subtune = numberOrDefault(options.subtune, 0);
    const sampleRate = numberOrDefault(options.sampleRate, 44100);
    const traceMask = Array.isArray(options.traceMask) ? options.traceMask : [];
    const maxTraceEvents = numberOrDefault(options.maxTraceEvents, 0);
    const result = this.api.startDebug(
      subtune,
      sampleRate,
      traceMask,
      maxTraceEvents,
    );
    assertOK(result);
    return new RasterklangDebugStream(this.api, result);
  }
}

export class RasterklangTune {
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
    return new RasterklangAudioPlayer(this, options);
  }

  createDebugStream(options = {}) {
    return this.client.startDebugStream({
      subtune: options.subtune ?? this.metadata.defaultSubtune,
      sampleRate: options.sampleRate,
      traceMask: options.traceMask,
      maxTraceEvents: options.maxTraceEvents,
    });
  }
}

export class RasterklangStream {
  constructor(api, startResult) {
    this.api = api;
    this.subtune = startResult.subtune;
    this.sampleRate = startResult.sampleRate;
    this.active = true;
  }

  readChunk(frames = defaultChunkFrames) {
    if (!this.active) {
      throw new RasterklangError("Cannot read from a stopped SID stream.");
    }
    return readSampleChunk(this.api, frames);
  }

  skipSamples(frames = defaultChunkFrames) {
    if (!this.active) {
      throw new RasterklangError("Cannot skip a stopped SID stream.");
    }
    return skipSampleChunk(this.api, frames);
  }

  fastForwardSamples(frames = defaultChunkFrames) {
    if (!this.active) {
      throw new RasterklangError("Cannot fast-forward a stopped SID stream.");
    }
    return fastForwardSampleChunk(this.api, frames);
  }

  setAudioControls(options = {}) {
    if (!this.active) {
      throw new RasterklangError("Cannot update a stopped SID stream.");
    }
    return setAudioControls(this.api, options);
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

export class RasterklangDebugStream {
  constructor(api, startResult) {
    this.api = api;
    this.subtune = startResult.subtune;
    this.sampleRate = startResult.sampleRate;
    this.active = true;
  }

  readChunk(frames = defaultChunkFrames) {
    this.requireActive();
    return readSampleChunk(this.api, frames);
  }

  skipSamples(frames = defaultChunkFrames) {
    this.requireActive();
    return skipSampleChunk(this.api, frames);
  }

  fastForwardSamples(frames = defaultChunkFrames) {
    this.requireActive();
    return fastForwardSampleChunk(this.api, frames);
  }

  setAudioControls(options = {}) {
    this.requireActive();
    return setAudioControls(this.api, options);
  }

  readTrace(options = {}) {
    this.requireActive();
    if (typeof this.api.readTrace !== "function") {
      throw new RasterklangError("This rasterklang-wasm build does not support trace reads.");
    }

    const limit = numberOrDefault(options.limit, 0);
    const afterSeq = numberOrDefault(options.afterSeq, 0);
    const result = this.api.readTrace(limit, afterSeq);
    assertOK(result);
    return {
      events: Array.from(result.events || []),
      dropped: numberOrDefault(result.dropped, 0),
      nextSeq: numberOrDefault(result.nextSeq, 0),
    };
  }

  snapshot() {
    this.requireActive();
    if (typeof this.api.snapshot !== "function") {
      throw new RasterklangError("This rasterklang-wasm build does not support snapshots.");
    }

    const result = this.api.snapshot();
    assertOK(result);
    return result.snapshot;
  }

  stepFrame() {
    this.requireActive();
    if (typeof this.api.stepFrame !== "function") {
      throw new RasterklangError("This rasterklang-wasm build does not support frame stepping.");
    }

    const result = this.api.stepFrame();
    assertOK(result);
    if (!(result.samples instanceof Int16Array)) {
      throw new RasterklangError("WASM stepFrame returned an invalid sample buffer.", result);
    }
    return {
      samples: result.samples,
      frames: numberOrDefault(result.frames, result.samples.length),
      frame: numberOrDefault(result.frame, 0),
      events: Array.from(result.events || []),
      snapshot: result.snapshot,
    };
  }

  stepInstruction(options = {}) {
    this.requireActive();
    if (typeof this.api.stepInstruction !== "function") {
      throw new RasterklangError(
        "This rasterklang-wasm build does not support instruction stepping.",
      );
    }

    const maxCycles = numberOrDefault(options.maxCycles, 0);
    const result = this.api.stepInstruction(maxCycles);
    assertOK(result);
    return {
      event: result.event,
      snapshot: result.snapshot,
    };
  }

  stop() {
    if (!this.active) {
      return;
    }

    const result = this.api.stop();
    assertOK(result);
    this.active = false;
  }

  requireActive() {
    if (!this.active) {
      throw new RasterklangError("Cannot use a stopped SID debug stream.");
    }
  }
}

export class RasterklangAudioPlayer {
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
          throw new RasterklangError("The SID stream returned no samples.");
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
  const channel = int16ToFloat32(samples);
  if (typeof buffer.copyToChannel === "function") {
    buffer.copyToChannel(channel, 0);
  } else {
    buffer.getChannelData(0).set(channel);
  }
  return buffer;
}

async function loadWasm(options) {
  if (globalThis.rasterklangWasm) {
    return globalThis.rasterklangWasm;
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
      throw new RasterklangError("wasm_exec.js loaded, but Go was not registered.");
    }

    const go = new globalThis.Go();
    const response = await fetch(wasmURL);
    if (!response.ok) {
      throw new RasterklangError(`Could not load ${wasmURL}: ${response.status}`);
    }

    const bytes = await response.arrayBuffer();
    const result = await WebAssembly.instantiate(bytes, go.importObject);
    go.run(result.instance);
    await Promise.resolve();

    if (!globalThis.rasterklangWasm) {
      throw new RasterklangError("WASM loaded, but the rasterklangWasm API was not registered.");
    }
    return globalThis.rasterklangWasm;
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
      reject(new RasterklangError(`Could not load wasm_exec.js from ${src}.`));
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
  throw new RasterklangError("loadBytes expects a Uint8Array, ArrayBuffer, or view.");
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

function normalizeCapabilities(capabilities) {
  const fallback = defaultCapabilities();
  const features = capabilities && capabilities.features ? capabilities.features : {};
  const limits = capabilities && capabilities.limits ? capabilities.limits : {};
  return {
    apiVersion: numberOrDefault(capabilities && capabilities.apiVersion, 1),
    runtime: (capabilities && capabilities.runtime) || fallback.runtime,
    features: {
      playback: features.playback !== false,
      audioControls: Boolean(features.audioControls),
      skipSamples: Boolean(features.skipSamples),
      fastForward: Boolean(features.fastForward),
      trace: Boolean(features.trace),
      snapshot: Boolean(features.snapshot),
      stepFrame: Boolean(features.stepFrame),
      stepInstruction: Boolean(features.stepInstruction),
    },
    limits: {
      maxChunkFrames: numberOrDefault(limits.maxChunkFrames, defaultMaxChunkFrames),
      maxTraceEvents: numberOrDefault(limits.maxTraceEvents, defaultMaxTraceEvents),
    },
  };
}

function normalizeReleaseInfo(info, runtime) {
  const fallback = defaultReleaseInfo(runtime);
  return {
    version: stringOrDefault(info && info.version, fallback.version),
    commit: stringOrDefault(info && info.commit, fallback.commit),
    date: stringOrDefault(info && info.date, fallback.date),
    runtime: stringOrDefault(info && info.runtime, fallback.runtime),
  };
}

function defaultReleaseInfo(runtime = "") {
  return {
    version: "dev",
    commit: "unknown",
    date: "unknown",
    runtime: runtime || "js/wasm",
  };
}

function defaultCapabilities() {
  return {
    apiVersion: 1,
    runtime: "js/wasm",
    features: {
      playback: true,
      audioControls: false,
      skipSamples: false,
      fastForward: false,
      trace: false,
      snapshot: false,
      stepFrame: false,
      stepInstruction: false,
    },
    limits: {
      maxChunkFrames: defaultMaxChunkFrames,
      maxTraceEvents: defaultMaxTraceEvents,
    },
  };
}

function readSampleChunk(api, frames) {
  const result = api.readChunk(frames);
  assertOK(result);

  if (!(result.samples instanceof Int16Array)) {
    throw new RasterklangError("WASM stream returned an invalid sample buffer.", result);
  }
  return result.samples;
}

function skipSampleChunk(api, frames) {
  if (typeof api.skipSamples !== "function") {
    return readSampleChunk(api, frames).length;
  }
  const result = api.skipSamples(frames);
  assertOK(result);
  return numberOrDefault(result.frames, frames);
}

function fastForwardSampleChunk(api, frames) {
  if (typeof api.fastForwardSamples !== "function") {
    return skipSampleChunk(api, frames);
  }
  const result = api.fastForwardSamples(frames);
  assertOK(result);
  return numberOrDefault(result.frames, frames);
}

function setAudioControls(api, options = {}) {
  if (typeof api.setAudioControls !== "function") {
    throw new RasterklangError("This rasterklang-wasm build does not support audio controls.");
  }
  const result = api.setAudioControls(normalizeAudioControlOptions(options));
  assertOK(result);
  return normalizeAudioControls(result.audioControls || options);
}

function normalizeAudioControlOptions(options = {}) {
  const filterBypass = Object.prototype.hasOwnProperty.call(options, "filterBypass")
    ? Boolean(options.filterBypass)
    : options.filterEnabled === false;
  return {
    voiceMask: numberOrDefault(options.voiceMask, 0x07) & 0x07,
    filterBypass,
  };
}

function normalizeAudioControls(value = {}) {
  return {
    voiceMask: numberOrDefault(value.voiceMask, 0x07) & 0x07,
    filterBypass: Boolean(value.filterBypass),
    filterEnabled: value.filterEnabled !== false && !value.filterBypass,
  };
}

function numberOrDefault(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function stringOrDefault(value, fallback) {
  return typeof value === "string" && value ? value : fallback;
}

function assertOK(result) {
  if (!result || !result.ok) {
    throw new RasterklangError(
      result && result.error ? result.error : "rasterklang-wasm failed.",
      result,
    );
  }
}

function createAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    throw new RasterklangError("This browser does not support Web Audio.");
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
