import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(rootDir, "dist");
const smokeVersion = "v0.0.0-browser-smoke";
const smokeCommit = "browser-smoke-commit";
const smokeDate = "2026-06-24T20:30:00Z";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

async function main() {
  execFileSync("make", ["build"], {
    cwd: rootDir,
    env: {
      ...process.env,
      VERSION: smokeVersion,
      COMMIT: smokeCommit,
      DATE: smokeDate,
    },
    stdio: "inherit",
  });

  for (const file of ["rasterklang.js", "rasterklang.wasm", "wasm_exec.js"]) {
    assert.ok(existsSync(join(distDir, file)), `dist/${file} should exist`);
  }

  const chrome = findChrome();
  const server = createSmokeServer();

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  try {
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}/browser-smoke.html`;
    const payload = await runBrowserSmoke(chrome, url);
    assert.equal(payload.status, "passed", JSON.stringify(payload, null, 2));
    assert.equal(payload.metadata.title, "Synthetic Browser Smoke");
    assert.ok(payload.samplePeak > 0, "PCM smoke should produce non-zero samples");
    assert.ok(payload.debugTraceEvents > 0, "debug stream should produce trace events");
    assert.ok(payload.stepFrameSamples > 0, "stepFrame should produce PCM samples");
    assert.equal(payload.capabilities.features.playback, true);
    assert.equal(payload.capabilities.features.trace, true);
    assert.equal(payload.capabilities.features.snapshot, true);
    assert.equal(payload.capabilities.features.stepFrame, true);
    assert.equal(payload.releaseInfo.version, smokeVersion);
    assert.equal(payload.releaseInfo.commit, smokeCommit);
    assert.equal(payload.releaseInfo.date, smokeDate);
    assert.equal(payload.releaseInfo.runtime, "js/wasm");
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function createSmokeServer() {
  return createServer((request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/browser-smoke.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(browserSmokeHTML());
        return;
      }

      if (!url.pathname.startsWith("/dist/")) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("not found");
        return;
      }

      const relative = normalize(url.pathname.slice("/dist/".length));
      if (relative.startsWith("..")) {
        response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        response.end("forbidden");
        return;
      }

      const filePath = join(distDir, relative);
      const data = readFileSync(filePath);
      response.writeHead(200, {
        "content-type": mimeTypes.get(extname(filePath)) || "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(data);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(String(error && error.stack ? error.stack : error));
    }
  });
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.CHROMIUM_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }

  throw new Error(
    "Chrome or Chromium is required for the browser SDK smoke. Set CHROME_BIN to the browser executable.",
  );
}

async function runBrowserSmoke(chrome, url) {
  if (typeof WebSocket !== "function") {
    throw new Error("Node.js 22 or newer is required for the browser SDK smoke WebSocket client.");
  }

  const browser = await launchChrome(chrome);
  let cdp;
  try {
    cdp = await connectCDP(browser.wsURL);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.navigate", { url }, sessionId);
    const response = await cdp.send("Runtime.evaluate", {
      expression: waitForSmokeResultExpression(),
      awaitPromise: true,
      returnByValue: true,
      timeout: 35000,
    }, sessionId);
    if (response.exceptionDetails) {
      throw new Error(`browser smoke evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
    }
    return response.result.value;
  } finally {
    if (cdp) {
      await cdp.send("Browser.close").catch(() => {});
      cdp.close();
    }
    browser.close();
  }
}

async function launchChrome(chrome) {
  const userDataDir = mkdtempSync(join(tmpdir(), "rasterklang-wasm-chrome-"));
  const proc = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], {
    stdio: ["ignore", "ignore", "pipe"],
  });

  const wsURL = await new Promise((resolveURL, rejectURL) => {
    let stderr = "";
    const timer = setTimeout(() => {
      rejectURL(new Error(`Chrome did not print a DevTools URL:\n${stderr}`));
    }, 15000);
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolveURL(match[1]);
      }
    });
    proc.once("error", (error) => {
      clearTimeout(timer);
      rejectURL(error);
    });
    proc.once("exit", (code, signal) => {
      clearTimeout(timer);
      rejectURL(new Error(`Chrome exited before DevTools was ready: code=${code} signal=${signal}\n${stderr}`));
    });
  });

  return {
    wsURL,
    close() {
      if (!proc.killed) {
        proc.kill("SIGTERM");
      }
      try {
        rmSync(userDataDir, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
      } catch {
        // Chrome may release profile files shortly after process termination.
      }
    },
  };
}

async function connectCDP(wsURL) {
  const ws = new WebSocket(wsURL);
  await new Promise((resolveOpen, rejectOpen) => {
    ws.addEventListener("open", resolveOpen, { once: true });
    ws.addEventListener("error", rejectOpen, { once: true });
  });
  return new CDPClient(ws);
}

class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.nextID = 1;
    this.pending = new Map();
    ws.addEventListener("message", (event) => this.handleMessage(event));
    ws.addEventListener("error", (event) => {
      for (const { reject } of this.pending.values()) {
        reject(new Error(`CDP WebSocket error: ${event.message || "unknown error"}`));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}, sessionId = "") {
    const id = this.nextID++;
    const message = { id, method, params };
    if (sessionId) {
      message.sessionId = sessionId;
    }
    return new Promise((resolveSend, rejectSend) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectSend(new Error(`CDP command timed out: ${method}`));
      }, 40000);
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend, timer });
      this.ws.send(JSON.stringify(message));
    });
  }

  handleMessage(event) {
    const payload = JSON.parse(String(event.data));
    if (!payload.id || !this.pending.has(payload.id)) {
      return;
    }
    const pending = this.pending.get(payload.id);
    this.pending.delete(payload.id);
    clearTimeout(pending.timer);
    if (payload.error) {
      pending.reject(new Error(`CDP error: ${JSON.stringify(payload.error)}`));
    } else {
      pending.resolve(payload.result || {});
    }
  }

  close() {
    this.ws.close();
  }
}

function waitForSmokeResultExpression() {
  return `new Promise((resolve) => {
    const started = Date.now();
    const timeoutMs = 30000;
    const poll = () => {
      const status = document.body && document.body.dataset.status;
      const result = document.getElementById("result");
      if (status && status !== "pending" && result && result.textContent) {
        try {
          resolve(JSON.parse(result.textContent));
        } catch (error) {
          resolve({ status: "failed", message: String(error), raw: result.textContent });
        }
        return;
      }
      if (Date.now() - started > timeoutMs) {
        resolve({
          status: "failed",
          message: "Timed out waiting for browser smoke result",
          body: document.documentElement.outerHTML.slice(0, 4000),
        });
        return;
      }
      setTimeout(poll, 50);
    };
    poll();
  })`;
}

function browserSmokeHTML() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>rasterklang-wasm browser smoke</title>
</head>
<body data-status="pending">
  <pre id="result"></pre>
  <script type="module">
    import { createRasterklang } from "/dist/rasterklang.js";

    const result = document.getElementById("result");

    try {
      const rk = await createRasterklang({
        wasmExecURL: "/dist/wasm_exec.js",
        wasmURL: "/dist/rasterklang.wasm",
      });
      const capabilities = rk.capabilities();
      const releaseInfo = rk.releaseInfo();
      assert(capabilities.runtime === "js/wasm", "runtime should be js/wasm");
      assert(releaseInfo.version === "${smokeVersion}", "release version should match build metadata");
      assert(releaseInfo.commit === "${smokeCommit}", "release commit should match build metadata");
      assert(releaseInfo.date === "${smokeDate}", "release date should match build metadata");
      assert(releaseInfo.runtime === "js/wasm", "release runtime should match");
      assert(capabilities.features.playback === true, "playback capability should be true");
      assert(capabilities.features.audioControls === true, "audio controls should be true");
      assert(capabilities.features.skipSamples === true, "skipSamples should be true");
      assert(capabilities.features.fastForward === true, "fastForward should be true");
      assert(capabilities.features.trace === true, "trace should be true");
      assert(capabilities.features.snapshot === true, "snapshot should be true");
      assert(capabilities.features.stepFrame === true, "stepFrame should be true");
      assert(capabilities.features.stepInstruction === true, "stepInstruction should be true");

      const tune = rk.loadBytes(syntheticPSID());
      assert(tune.supported === true, tune.supportError || "synthetic tune should be supported");
      assert(tune.metadata.format === "PSID", "metadata format should be PSID");
      assert(tune.metadata.title === "Synthetic Browser Smoke", "metadata title should match");
      assert(tune.metadata.author === "rasterklang", "metadata author should match");
      assert(tune.metadata.defaultSubtune === 1, "default subtune should be 1");

      const stream = tune.createStream({ sampleRate: 44100 });
      assert(stream.sampleRate === 44100, "stream sample rate should match");
      assert(stream.subtune === 1, "stream should use the default subtune");
      const skipped = stream.skipSamples(64);
      assert(skipped === 64, "skipSamples should report skipped frames");
      const advanced = stream.fastForwardSamples(64);
      assert(advanced === 64, "fastForwardSamples should report advanced frames");
      const controls = stream.setAudioControls({ voiceMask: 0x05, filterBypass: true });
      assert(controls.voiceMask === 0x05, "voice mask should round-trip");
      assert(controls.filterBypass === true, "filter bypass should round-trip");
      const samples = stream.readChunk(4096);
      assert(samples instanceof Int16Array, "stream chunk should be Int16Array");
      assert(samples.length === 4096, "stream chunk should contain requested frames");
      const samplePeak = peak(samples);
      assert(samplePeak > 0, "stream chunk should contain non-zero PCM");
      stream.stop();
      assertThrows(() => stream.readChunk(1), "stopped stream should reject reads");

      const debugStream = tune.createDebugStream({
        sampleRate: 44100,
        traceMask: ["frames", "cpu", "sid.write"],
        maxTraceEvents: 2048,
      });
      const debugSamples = debugStream.readChunk(1024);
      assert(debugSamples instanceof Int16Array, "debug chunk should be Int16Array");
      assert(peak(debugSamples) > 0, "debug chunk should contain non-zero PCM");
      const trace = debugStream.readTrace({ limit: 256 });
      assert(Array.isArray(trace.events), "trace events should be an array");
      assert(trace.events.length > 0, "debug stream should emit trace events");
      const snapshot = debugStream.snapshot();
      assert(snapshot && typeof snapshot.frame === "number", "snapshot should include frame");
      const frame = debugStream.stepFrame();
      assert(frame.samples instanceof Int16Array, "stepFrame samples should be Int16Array");
      assert(frame.samples.length > 0, "stepFrame should return samples");
      const instruction = debugStream.stepInstruction({ maxCycles: 64 });
      assert(instruction && "snapshot" in instruction, "stepInstruction should return a snapshot");
      debugStream.stop();

      finish({
        status: "passed",
        metadata: tune.metadata,
        capabilities,
        releaseInfo,
        samplePeak,
        debugTraceEvents: trace.events.length,
        stepFrameSamples: frame.samples.length,
      });
    } catch (error) {
      finish({
        status: "failed",
        message: String(error && error.message ? error.message : error),
        stack: String(error && error.stack ? error.stack : ""),
      });
    }

    function finish(payload) {
      document.body.dataset.status = payload.status;
      result.textContent = JSON.stringify(payload);
    }

    function assert(condition, message) {
      if (!condition) {
        throw new Error(message);
      }
    }

    function assertThrows(fn, message) {
      let threw = false;
      try {
        fn();
      } catch {
        threw = true;
      }
      assert(threw, message);
    }

    function peak(samples) {
      let max = 0;
      for (const sample of samples) {
        max = Math.max(max, Math.abs(sample));
      }
      return max;
    }

    function syntheticPSID() {
      const load = 0x1000;
      const play = 0x1020;
      const data = new Uint8Array(0x7c + (play - load) + 4);
      text(data, 0x00, "PSID");
      u16be(data, 0x04, 2);
      u16be(data, 0x06, 0x7c);
      u16be(data, 0x08, load);
      u16be(data, 0x0a, load);
      u16be(data, 0x0c, play);
      u16be(data, 0x0e, 1);
      u16be(data, 0x10, 1);
      text(data, 0x16, "Synthetic Browser Smoke");
      text(data, 0x36, "rasterklang");
      text(data, 0x56, "2026");
      u16be(data, 0x76, 0x0014);

      const init = [
        0xa9, 0x00, 0x8d, 0x00, 0xd4,
        0xa9, 0x10, 0x8d, 0x01, 0xd4,
        0xa9, 0x11, 0x8d, 0x04, 0xd4,
        0xa9, 0xf0, 0x8d, 0x05, 0xd4,
        0xa9, 0xf0, 0x8d, 0x06, 0xd4,
        0xa9, 0x0f, 0x8d, 0x18, 0xd4,
        0x60,
      ];
      data.set(init, 0x7c);
      data.set([0xee, 0x00, 0xd4, 0x60], 0x7c + (play - load));
      return data;
    }

    function text(data, offset, value) {
      for (let index = 0; index < value.length; index += 1) {
        data[offset + index] = value.charCodeAt(index);
      }
    }

    function u16be(data, offset, value) {
      data[offset] = (value >> 8) & 0xff;
      data[offset + 1] = value & 0xff;
    }
  </script>
</body>
</html>`;
}

await main();
