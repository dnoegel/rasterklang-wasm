import assert from "node:assert/strict";
import { Rasterklang } from "../src/rasterklang.js";

const sdk = new Rasterklang({
  runtime: "js/wasm",
  releaseInfo() {
    return {
      version: "v1.2.3",
      commit: "abc1234",
      date: "2026-06-24T20:00:00Z",
      runtime: "js/wasm",
    };
  },
});

assert.deepEqual(sdk.releaseInfo(), {
  version: "v1.2.3",
  commit: "abc1234",
  date: "2026-06-24T20:00:00Z",
  runtime: "js/wasm",
});

const fallback = new Rasterklang({ runtime: "js/wasm" });
assert.deepEqual(fallback.releaseInfo(), {
  version: "dev",
  commit: "unknown",
  date: "unknown",
  runtime: "js/wasm",
});

console.log("SDK releaseInfo contract passed.");
