import assert from "node:assert/strict";
import { RasterklangAudioPlayer } from "../src/rasterklang.js";

globalThis.window = {
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
};

const scheduledStarts = [];
const createdBuffers = [];
let resumed = false;
let streamStopped = false;

class FakeAudioBuffer {
  constructor(channels, length, sampleRate) {
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }

  getChannelData(channel) {
    return this.channels[channel];
  }
}

const audioContext = {
  currentTime: 0.1,
  destination: { kind: "destination" },
  sampleRate: 44100,
  async resume() {
    resumed = true;
  },
  createBuffer(channels, length, sampleRate) {
    const buffer = new FakeAudioBuffer(channels, length, sampleRate);
    createdBuffers.push(buffer);
    return buffer;
  },
  createBufferSource() {
    return {
      buffer: null,
      onended: null,
      connect(destination) {
        this.destination = destination;
      },
      start(at) {
        scheduledStarts.push(at);
      },
      stop() {},
    };
  },
};

const tune = {
  metadata: { defaultSubtune: 1 },
  createStream({ sampleRate }) {
    return {
      subtune: 1,
      sampleRate,
      readChunk(frames) {
        const samples = new Int16Array(frames);
        samples[0] = -32768;
        samples[1] = 0;
        samples[2] = 16384;
        samples[3] = 32767;
        return samples;
      },
      stop() {
        streamStopped = true;
      },
    };
  },
};

const player = new RasterklangAudioPlayer(tune, {
  audioContext,
  chunkFrames: 1024,
  scheduleAheadSeconds: 0.2,
  scheduleIntervalMs: 1000,
});

await player.play();

assert.equal(resumed, true, "audio context should be resumed before scheduling");
assert.equal(player.playing, true, "player should be marked as playing");
assert.ok(createdBuffers.length > 0, "player should create audio buffers");
assert.ok(scheduledStarts.length > 0, "player should schedule audio sources");

const firstChannel = createdBuffers[0].getChannelData(0);
assert.equal(firstChannel[0], -1);
assert.equal(firstChannel[1], 0);
assert.equal(firstChannel[2], 0.5);
assert.ok(firstChannel[3] > 0.999 && firstChannel[3] <= 1);

player.stop();
assert.equal(streamStopped, true, "player.stop should stop the underlying stream");
