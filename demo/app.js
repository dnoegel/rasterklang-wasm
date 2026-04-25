import { createZmkSid } from "../dist/zmk-sid.js";

const dom = {
  runtimeState: document.querySelector("#runtimeState"),
  fileInput: document.querySelector("#fileInput"),
  chooseButton: document.querySelector("#chooseButton"),
  dropzone: document.querySelector("#dropzone"),
  fileName: document.querySelector("#fileName"),
  subtuneSelect: document.querySelector("#subtuneSelect"),
  playButton: document.querySelector("#playButton"),
  stopButton: document.querySelector("#stopButton"),
  statusLine: document.querySelector("#statusLine"),
  supportState: document.querySelector("#supportState"),
  metaTitle: document.querySelector("#metaTitle"),
  metaAuthor: document.querySelector("#metaAuthor"),
  metaReleased: document.querySelector("#metaReleased"),
  metaSubtunes: document.querySelector("#metaSubtunes"),
  metaDefault: document.querySelector("#metaDefault"),
  metaClock: document.querySelector("#metaClock"),
  metaModel: document.querySelector("#metaModel"),
  metaFormat: document.querySelector("#metaFormat"),
};

const state = {
  sdk: null,
  tune: null,
  player: null,
  wasmReady: false,
};

boot();

dom.chooseButton.addEventListener("click", () => dom.fileInput.click());
dom.fileInput.addEventListener("change", () => {
  const file = dom.fileInput.files && dom.fileInput.files[0];
  if (file) {
    loadFile(file);
  }
});

dom.dropzone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dom.dropzone.classList.add("is-dragging");
});

dom.dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
});

dom.dropzone.addEventListener("dragleave", (event) => {
  if (!dom.dropzone.contains(event.relatedTarget)) {
    dom.dropzone.classList.remove("is-dragging");
  }
});

dom.dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dom.dropzone.classList.remove("is-dragging");
  const file = event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) {
    loadFile(file);
  }
});

dom.playButton.addEventListener("click", () => {
  play().catch((error) => {
    stopPlayback({ updateStatus: false });
    setStatus(error.message, "error");
  });
});

dom.stopButton.addEventListener("click", () => stopPlayback());

dom.subtuneSelect.addEventListener("change", () => {
  if (state.player && state.player.playing) {
    stopPlayback();
  }
});

window.addEventListener("beforeunload", () => stopPlayback({ updateStatus: false }));

async function boot() {
  try {
    setRuntime("loading", "WASM loading");
    state.sdk = await createZmkSid({
      wasmExecURL: "./dist/wasm_exec.js",
      wasmURL: "./dist/zmk-web.wasm",
    });
    state.wasmReady = true;
    setRuntime("ready", "SDK ready");
    setStatus("Load a SID file to begin.", "ok");
  } catch (error) {
    setRuntime("error", "WASM error");
    setStatus(error.message, "error");
  }
}

async function loadFile(file) {
  try {
    if (!state.wasmReady) {
      throw new Error("WASM is not ready yet.");
    }

    stopPlayback({ updateStatus: false });
    clearMetadata();
    setStatus("Loading file...", "ok");

    const tune = await state.sdk.loadFile(file);
    state.tune = tune;
    dom.fileName.textContent = file.name;
    renderMetadata(tune.metadata, tune.supported, tune.supportError);
    populateSubtunes(tune.metadata);

    dom.playButton.disabled = false;
    dom.subtuneSelect.disabled = false;

    if (tune.supported) {
      setStatus("Loaded. Press Play to start audio.", "ok");
    } else {
      setStatus(`Loaded, but playback may fail: ${tune.supportError}`, "warning");
    }
  } catch (error) {
    state.tune = null;
    dom.fileName.textContent = file ? file.name : "No file loaded";
    dom.playButton.disabled = true;
    dom.subtuneSelect.disabled = true;
    setStatus(error.message, "error");
  }
}

async function play() {
  if (!state.tune) {
    throw new Error("Load a SID file first.");
  }
  if (!state.wasmReady) {
    throw new Error("WASM is not ready yet.");
  }

  stopPlayback({ updateStatus: false });

  const subtune = Number(
    dom.subtuneSelect.value || state.tune.metadata.defaultSubtune || 1,
  );
  state.player = state.tune.createAudioPlayer({
    subtune,
    onError(error) {
      stopPlayback({ updateStatus: false });
      setStatus(error.message, "error");
    },
  });
  await state.player.play();

  dom.playButton.disabled = true;
  dom.stopButton.disabled = false;
  dom.subtuneSelect.disabled = true;
  setStatus(`Playing subtune ${state.player.subtune}.`, "ok");
}

function stopPlayback(options = {}) {
  const updateStatus = options.updateStatus !== false;
  const wasPlaying = state.player && state.player.playing;

  if (state.player) {
    state.player.stop();
    state.player = null;
  }

  dom.playButton.disabled = !state.tune;
  dom.stopButton.disabled = true;
  dom.subtuneSelect.disabled = !state.tune;

  if (updateStatus && wasPlaying) {
    setStatus("Stopped.", "ok");
  }
}

function populateSubtunes(metadata) {
  dom.subtuneSelect.textContent = "";
  for (let i = 1; i <= metadata.subtuneCount; i += 1) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = i === metadata.defaultSubtune ? `${i} (default)` : String(i);
    dom.subtuneSelect.append(option);
  }
  dom.subtuneSelect.value = String(metadata.defaultSubtune);
}

function renderMetadata(metadata, supported, supportError) {
  setText(dom.metaTitle, metadata.title || "Untitled");
  setText(dom.metaAuthor, metadata.author || "Unknown");
  setText(dom.metaReleased, metadata.released || "Unknown");
  setText(dom.metaSubtunes, metadata.subtuneCount);
  setText(dom.metaDefault, metadata.defaultSubtune);
  setText(dom.metaClock, metadata.clock || "unknown");
  setText(dom.metaModel, metadata.sidModel || "unknown");
  setText(dom.metaFormat, `${metadata.format} v${metadata.version}`);

  if (supported) {
    dom.supportState.textContent = "Supported by current engine";
  } else {
    dom.supportState.textContent = supportError || "Limited support";
  }
}

function clearMetadata() {
  state.tune = null;
  dom.fileName.textContent = "No file loaded";
  dom.supportState.textContent = "Waiting for file";
  for (const node of [
    dom.metaTitle,
    dom.metaAuthor,
    dom.metaReleased,
    dom.metaSubtunes,
    dom.metaDefault,
    dom.metaClock,
    dom.metaModel,
    dom.metaFormat,
  ]) {
    node.textContent = "-";
  }
  dom.subtuneSelect.textContent = "";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = "-";
  dom.subtuneSelect.append(option);
}

function setRuntime(stateName, label) {
  dom.runtimeState.dataset.state = stateName;
  dom.runtimeState.textContent = label;
}

function setStatus(message, tone) {
  dom.statusLine.textContent = message;
  dom.statusLine.dataset.tone = tone;
}

function setText(node, value) {
  node.textContent = value === "" || value === null || value === undefined ? "-" : String(value);
}
