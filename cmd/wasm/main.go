package main

import (
	"errors"
	"fmt"
	"runtime"
	"syscall/js"

	sid "github.com/dnoegel/zmk-sid"
)

var (
	currentTune   *sid.Tune
	currentStream *sid.Stream
	currentDebug  *sid.DebugStream
	callbacks     []js.Func
)

const (
	maxChunkFrames = 65536
	maxTraceEvents = 65536
)

func main() {
	api := js.Global().Get("Object").New()
	register(api, "capabilities", capabilities)
	register(api, "load", loadSID)
	register(api, "start", startStream)
	register(api, "readChunk", readChunk)
	register(api, "startDebug", startDebugStream)
	register(api, "readTrace", readTrace)
	register(api, "snapshot", snapshot)
	register(api, "setAudioControls", setAudioControls)
	register(api, "stepFrame", stepFrame)
	register(api, "stepInstruction", stepInstruction)
	register(api, "stop", stopStream)
	api.Set("runtime", fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH))
	js.Global().Set("zmkSid", api)

	select {}
}

func register(api js.Value, name string, fn func(js.Value, []js.Value) any) {
	callback := js.FuncOf(fn)
	callbacks = append(callbacks, callback)
	api.Set(name, callback)
}

func capabilities(_ js.Value, _ []js.Value) any {
	return object(map[string]any{
		"apiVersion": 1,
		"runtime":    fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH),
		"features": object(map[string]any{
			"playback":        true,
			"audioControls":   true,
			"trace":           true,
			"snapshot":        true,
			"stepFrame":       true,
			"stepInstruction": true,
		}),
		"limits": object(map[string]any{
			"maxChunkFrames": maxChunkFrames,
			"maxTraceEvents": maxTraceEvents,
		}),
	})
}

func loadSID(_ js.Value, args []js.Value) any {
	if len(args) < 1 {
		return failure(errors.New("missing SID byte array"))
	}

	src := args[0]
	length := src.Get("byteLength").Int()
	if length <= 0 {
		return failure(errors.New("empty SID file"))
	}

	data := make([]byte, length)
	if copied := js.CopyBytesToGo(data, src); copied != length {
		return failure(fmt.Errorf("could only copy %d of %d bytes", copied, length))
	}

	tune, err := sid.Parse(data)
	if err != nil {
		currentTune = nil
		currentStream = nil
		currentDebug = nil
		return failure(err)
	}

	currentTune = tune
	currentStream = nil
	currentDebug = nil

	supportError := ""
	if err := tune.ValidateForPOC(); err != nil {
		supportError = err.Error()
	}

	metadata := object(map[string]any{
		"format":         string(tune.Format),
		"version":        int(tune.Version),
		"title":          tune.Title,
		"author":         tune.Author,
		"released":       tune.Released,
		"subtuneCount":   int(tune.Songs),
		"defaultSubtune": int(tune.StartSong),
		"clock":          string(tune.Clock),
		"sidModel":       string(tune.SIDModel),
	})

	return success(map[string]any{
		"metadata":     metadata,
		"supported":    supportError == "",
		"supportError": supportError,
	})
}

func startStream(_ js.Value, args []js.Value) any {
	if currentTune == nil {
		return failure(errors.New("load a SID file first"))
	}

	subtune := 0
	if len(args) >= 1 {
		subtune = args[0].Int()
	}

	sampleRate := 44100
	if len(args) >= 2 {
		sampleRate = args[1].Int()
	}

	stream, err := sid.NewStream(currentTune, sid.StreamOptions{
		Subtune:    subtune,
		SampleRate: sampleRate,
	})
	if err != nil {
		currentStream = nil
		currentDebug = nil
		return failure(err)
	}

	currentStream = stream
	currentDebug = nil
	return success(map[string]any{
		"subtune":    stream.Subtune(),
		"sampleRate": stream.SampleRate(),
	})
}

func readChunk(_ js.Value, args []js.Value) any {
	if currentStream == nil && currentDebug == nil {
		return failure(errors.New("start playback first"))
	}

	frames := 4096
	if len(args) >= 1 {
		frames = args[0].Int()
	}
	if frames <= 0 || frames > maxChunkFrames {
		return failure(fmt.Errorf("chunk frame count must be between 1 and %d", maxChunkFrames))
	}

	samples := make([]int16, frames)
	n := 0
	var err error
	if currentDebug != nil {
		n, err = currentDebug.ReadSamples(samples)
	} else {
		n, err = currentStream.ReadSamples(samples)
	}
	if err != nil {
		return failure(err)
	}
	samples = samples[:n]

	return success(map[string]any{
		"frames":  len(samples),
		"samples": int16Array(samples),
	})
}

func startDebugStream(_ js.Value, args []js.Value) any {
	if currentTune == nil {
		return failure(errors.New("load a SID file first"))
	}

	subtune := 0
	if len(args) >= 1 {
		subtune = args[0].Int()
	}

	sampleRate := 44100
	if len(args) >= 2 {
		sampleRate = args[1].Int()
	}

	mask := sid.TraceFrames | sid.TraceCPUSteps | sid.TraceSIDWrites
	if len(args) >= 3 && args[2].Truthy() {
		mask = traceMaskFromJS(args[2])
	}

	maxEvents := 0
	if len(args) >= 4 {
		maxEvents = args[3].Int()
	}

	stream, err := sid.NewDebugStream(currentTune, sid.DebugOptions{
		Subtune:        subtune,
		SampleRate:     sampleRate,
		TraceMask:      mask,
		MaxTraceEvents: maxEvents,
	})
	if err != nil {
		currentStream = nil
		currentDebug = nil
		return failure(err)
	}

	currentStream = nil
	currentDebug = stream
	return success(map[string]any{
		"subtune":    stream.Subtune(),
		"sampleRate": stream.SampleRate(),
	})
}

func readTrace(_ js.Value, args []js.Value) any {
	if currentDebug == nil {
		return failure(errors.New("start a debug stream first"))
	}

	limit := 0
	if len(args) >= 1 {
		limit = args[0].Int()
	}

	afterSeq := uint64(0)
	if len(args) >= 2 {
		afterSeq = uint64(args[1].Int())
	}

	events, info := currentDebug.ReadTrace(limit, afterSeq)
	return success(map[string]any{
		"events":  traceEvents(events),
		"dropped": int(info.Dropped),
		"nextSeq": int(info.NextSeq),
	})
}

func snapshot(_ js.Value, _ []js.Value) any {
	if currentDebug == nil {
		return failure(errors.New("start a debug stream first"))
	}
	return success(map[string]any{
		"snapshot": debugSnapshot(currentDebug.Snapshot()),
	})
}

func setAudioControls(_ js.Value, args []js.Value) any {
	if currentStream == nil && currentDebug == nil {
		return failure(errors.New("start playback first"))
	}

	controls := currentAudioControls()
	if len(args) >= 1 && args[0].Truthy() {
		controls = mergeAudioControlsFromJS(controls, args[0])
	}
	if currentDebug != nil {
		currentDebug.SetAudioControls(controls)
	} else {
		currentStream.SetAudioControls(controls)
	}
	return success(map[string]any{
		"audioControls": audioControlsToJS(controls),
	})
}

func stepFrame(_ js.Value, _ []js.Value) any {
	if currentDebug == nil {
		return failure(errors.New("start a debug stream first"))
	}

	before, _ := currentDebug.ReadTrace(maxTraceEvents, 0)
	afterSeq := lastSeq(before)
	samples, err := currentDebug.StepFrame()
	if err != nil {
		return failure(err)
	}
	events, _ := currentDebug.ReadTrace(maxTraceEvents, afterSeq)
	snapshot := currentDebug.Snapshot()
	return success(map[string]any{
		"samples":  int16Array(samples),
		"frames":   len(samples),
		"frame":    int(snapshot.Frame),
		"events":   traceEvents(events),
		"snapshot": debugSnapshot(snapshot),
	})
}

func stepInstruction(_ js.Value, args []js.Value) any {
	if currentDebug == nil {
		return failure(errors.New("start a debug stream first"))
	}

	maxCycles := 0
	if len(args) >= 1 {
		maxCycles = args[0].Int()
	}
	event, err := currentDebug.StepInstruction(maxCycles)
	if err != nil {
		return failure(err)
	}
	return success(map[string]any{
		"event":    traceEvent(event),
		"snapshot": debugSnapshot(currentDebug.Snapshot()),
	})
}

func stopStream(_ js.Value, _ []js.Value) any {
	currentStream = nil
	currentDebug = nil
	return success(nil)
}

func success(fields map[string]any) js.Value {
	result := js.Global().Get("Object").New()
	result.Set("ok", true)
	for key, value := range fields {
		result.Set(key, value)
	}
	return result
}

func failure(err error) js.Value {
	result := js.Global().Get("Object").New()
	result.Set("ok", false)
	result.Set("error", err.Error())
	return result
}

func object(fields map[string]any) js.Value {
	result := js.Global().Get("Object").New()
	for key, value := range fields {
		result.Set(key, value)
	}
	return result
}

func int16Array(samples []int16) js.Value {
	pcmBytes := sid.SamplesToPCM16LE(samples)
	buffer := js.Global().Get("ArrayBuffer").New(len(pcmBytes))
	bytes := js.Global().Get("Uint8Array").New(buffer)
	copied := js.CopyBytesToJS(bytes, pcmBytes)
	if copied != len(pcmBytes) {
		return js.Global().Get("Int16Array").New(0)
	}
	return js.Global().Get("Int16Array").New(buffer)
}

func traceMaskFromJS(values js.Value) sid.TraceMask {
	mask := sid.TraceMask(0)
	for i := 0; i < values.Length(); i++ {
		switch values.Index(i).String() {
		case "all":
			mask |= sid.TraceFrames | sid.TraceCPUSteps | sid.TraceBusWrites | sid.TraceSIDWrites | sid.TraceSIDReads | sid.TraceAudio
		case "frames", "frame", "frame.start", "frame.end":
			mask |= sid.TraceFrames
		case "cpu", "cpu.step":
			mask |= sid.TraceCPUSteps
		case "bus", "bus.write":
			mask |= sid.TraceBusWrites
		case "sid", "sid.write":
			mask |= sid.TraceSIDWrites
		case "sid.read":
			mask |= sid.TraceSIDReads
		case "audio", "audio.sample":
			mask |= sid.TraceAudio
		}
	}
	return mask
}

func currentAudioControls() sid.AudioControls {
	if currentDebug != nil {
		return currentDebug.AudioControls()
	}
	if currentStream != nil {
		return currentStream.AudioControls()
	}
	return sid.AudioControls{VoiceMask: 0x07}
}

func mergeAudioControlsFromJS(controls sid.AudioControls, value js.Value) sid.AudioControls {
	if voiceMask := value.Get("voiceMask"); voiceMask.Type() != js.TypeUndefined && voiceMask.Type() != js.TypeNull {
		controls.VoiceMask = byte(voiceMask.Int()) & 0x07
	}
	if filterBypass := value.Get("filterBypass"); filterBypass.Type() != js.TypeUndefined && filterBypass.Type() != js.TypeNull {
		controls.FilterBypass = filterBypass.Bool()
	} else if filterEnabled := value.Get("filterEnabled"); filterEnabled.Type() != js.TypeUndefined && filterEnabled.Type() != js.TypeNull {
		controls.FilterBypass = !filterEnabled.Bool()
	}
	return controls
}

func audioControlsToJS(controls sid.AudioControls) js.Value {
	return object(map[string]any{
		"voiceMask":     int(controls.VoiceMask & 0x07),
		"filterBypass":  controls.FilterBypass,
		"filterEnabled": !controls.FilterBypass,
	})
}

func traceEvents(events []sid.TraceEvent) js.Value {
	out := js.Global().Get("Array").New(len(events))
	for i, event := range events {
		out.SetIndex(i, traceEvent(event))
	}
	return out
}

func traceEvent(event sid.TraceEvent) js.Value {
	return object(map[string]any{
		"seq":      int(event.Seq),
		"kind":     event.Kind,
		"frame":    int(event.Frame),
		"cycle":    int(event.Cycle),
		"sample":   int(event.Sample),
		"pc":       int(event.PC),
		"opcode":   int(event.Opcode),
		"mnemonic": event.Mnemonic,
		"cycles":   event.Cycles,
		"addr":     int(event.Addr),
		"reg":      int(event.Reg),
		"value":    int(event.Value),
		"oldValue": int(event.OldValue),
		"phase":    event.Phase,
	})
}

func debugSnapshot(snapshot sid.DebugSnapshot) js.Value {
	return object(map[string]any{
		"frame":      int(snapshot.Frame),
		"cycle":      int(snapshot.Cycle),
		"sample":     int(snapshot.Sample),
		"sampleRate": snapshot.SampleRate,
		"subtune":    snapshot.Subtune,
		"cpu": object(map[string]any{
			"a":  int(snapshot.CPU.A),
			"x":  int(snapshot.CPU.X),
			"y":  int(snapshot.CPU.Y),
			"sp": int(snapshot.CPU.SP),
			"pc": int(snapshot.CPU.PC),
			"p":  int(snapshot.CPU.P),
		}),
		"bus": object(map[string]any{
			"bankRegister": int(snapshot.Bus.BankRegister),
			"irqVector":    int(snapshot.Bus.IRQVector),
		}),
		"sid": sidSnapshot(snapshot.SID),
	})
}

func sidSnapshot(snapshot sid.SIDSnapshot) js.Value {
	registers := js.Global().Get("Array").New(len(snapshot.Registers))
	for i, value := range snapshot.Registers {
		registers.SetIndex(i, int(value))
	}

	voices := js.Global().Get("Array").New(len(snapshot.Voices))
	for i, voice := range snapshot.Voices {
		waves := js.Global().Get("Array").New(len(voice.Waveforms))
		for n, wave := range voice.Waveforms {
			waves.SetIndex(n, wave)
		}
		voices.SetIndex(i, object(map[string]any{
			"frequency":     int(voice.Frequency),
			"pulseWidth":    int(voice.PulseWidth),
			"control":       int(voice.Control),
			"waveforms":     waves,
			"gate":          voice.Gate,
			"phase":         int(voice.Phase),
			"envelopeLevel": int(voice.EnvelopeLevel),
			"envelopeState": voice.EnvelopeState,
			"lastOutput":    voice.LastOutput,
		}))
	}

	return object(map[string]any{
		"model":     snapshot.Model,
		"registers": registers,
		"voices":    voices,
		"filter": object(map[string]any{
			"cutoffRaw": int(snapshot.Filter.CutoffRaw),
			"cutoffHz":  snapshot.Filter.CutoffHz,
			"resonance": snapshot.Filter.Resonance,
			"mode":      int(snapshot.Filter.Mode),
			"routing":   int(snapshot.Filter.Routing),
			"low":       snapshot.Filter.Low,
			"band":      snapshot.Filter.Band,
		}),
		"volume": snapshot.Volume,
	})
}

func lastSeq(events []sid.TraceEvent) uint64 {
	if len(events) == 0 {
		return 0
	}
	return events[len(events)-1].Seq
}
