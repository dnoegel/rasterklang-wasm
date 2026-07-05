export interface RasterklangOptions {
  wasmExecURL?: string;
  wasmURL?: string;
}

export interface RasterklangMetadata {
  format: string;
  version: number;
  title: string;
  author: string;
  released: string;
  subtuneCount: number;
  defaultSubtune: number;
  clock: string;
  sidModel: string;
}

export interface RasterklangCapabilities {
  apiVersion: number;
  runtime: string;
  features: {
    playback: boolean;
    audioControls: boolean;
    skipSamples: boolean;
    fastForward: boolean;
    trace: boolean;
    snapshot: boolean;
    stepFrame: boolean;
    stepInstruction: boolean;
    live: boolean;
  };
  limits: {
    maxChunkFrames: number;
    maxTraceEvents: number;
  };
}

export interface RasterklangLiveOptions {
  sampleRate?: number;
  model?: "6581" | "8580";
}

export interface RasterklangReleaseInfo {
  version: string;
  commit: string;
  date: string;
  runtime: string;
}

export interface RasterklangStreamOptions {
  subtune?: number;
  sampleRate?: number;
}

export interface RasterklangDebugStreamOptions extends RasterklangStreamOptions {
  traceMask?: string[];
  maxTraceEvents?: number;
}

export interface RasterklangAudioPlayerOptions extends RasterklangStreamOptions {
  audioContext?: AudioContext;
  destination?: AudioNode;
  chunkFrames?: number;
  scheduleAheadSeconds?: number;
  scheduleIntervalMs?: number;
  onError?: (error: unknown) => void;
}

export interface RasterklangAudioControls {
  voiceMask: number;
  filterBypass: boolean;
  filterEnabled: boolean;
}

export interface RasterklangAudioControlOptions {
  voiceMask?: number;
  filterBypass?: boolean;
  filterEnabled?: boolean;
}

export interface RasterklangTraceReadOptions {
  limit?: number;
  afterSeq?: number;
}

export interface RasterklangTraceReadResult {
  events: unknown[];
  dropped: number;
  nextSeq: number;
}

export interface RasterklangStepFrameResult {
  samples: Int16Array;
  frames: number;
  frame: number;
  events: unknown[];
  snapshot: unknown;
}

export interface RasterklangStepInstructionOptions {
  maxCycles?: number;
}

export interface RasterklangStepInstructionResult {
  event: unknown;
  snapshot: unknown;
}

export declare function createRasterklang(
  options?: RasterklangOptions,
): Promise<Rasterklang>;

export declare class RasterklangError extends Error {
  response: unknown;
  constructor(message: string, response?: unknown);
}

export declare class Rasterklang {
  runtime: string;
  currentTune: RasterklangTune | null;

  loadBytes(bytes: Uint8Array | ArrayBuffer | ArrayBufferView): RasterklangTune;
  loadFile(file: Blob): Promise<RasterklangTune>;
  createStream(options?: RasterklangStreamOptions): RasterklangStream;
  createAudioPlayer(options?: RasterklangAudioPlayerOptions): RasterklangAudioPlayer;
  createDebugStream(options?: RasterklangDebugStreamOptions): RasterklangDebugStream;
  startLive(options?: RasterklangLiveOptions): RasterklangLiveSession;
  capabilities(): RasterklangCapabilities;
  releaseInfo(): RasterklangReleaseInfo;
}

export declare class RasterklangLiveSession {
  sampleRate: number;
  stopped: boolean;

  poke(addr: number, value: number): this;
  readChunk(frames?: number): Int16Array;
  registers(): number[];
  stop(): void;
}

export declare class RasterklangTune {
  metadata: RasterklangMetadata;
  supported: boolean;
  supportError: string;

  createStream(options?: RasterklangStreamOptions): RasterklangStream;
  createAudioPlayer(options?: RasterklangAudioPlayerOptions): RasterklangAudioPlayer;
  createDebugStream(options?: RasterklangDebugStreamOptions): RasterklangDebugStream;
}

export declare class RasterklangStream {
  subtune: number;
  sampleRate: number;
  active: boolean;

  readChunk(frames?: number): Int16Array;
  skipSamples(frames?: number): number;
  fastForwardSamples(frames?: number): number;
  setAudioControls(options?: RasterklangAudioControlOptions): RasterklangAudioControls;
  stop(): void;
}

export declare class RasterklangDebugStream extends RasterklangStream {
  readTrace(options?: RasterklangTraceReadOptions): RasterklangTraceReadResult;
  snapshot(): unknown;
  stepFrame(): RasterklangStepFrameResult;
  stepInstruction(
    options?: RasterklangStepInstructionOptions,
  ): RasterklangStepInstructionResult;
}

export declare class RasterklangAudioPlayer {
  subtune: number;
  sampleRate: number;
  playing: boolean;

  play(options?: RasterklangAudioPlayerOptions): Promise<this>;
  stop(): void;
}

export declare function int16ToFloat32(samples: Int16Array): Float32Array;
