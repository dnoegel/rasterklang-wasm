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
	callbacks     []js.Func
)

func main() {
	api := js.Global().Get("Object").New()
	register(api, "load", loadSID)
	register(api, "start", startStream)
	register(api, "readChunk", readChunk)
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
		return failure(err)
	}

	currentTune = tune
	currentStream = nil

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
		return failure(err)
	}

	currentStream = stream
	return success(map[string]any{
		"subtune":    stream.Subtune(),
		"sampleRate": stream.SampleRate(),
	})
}

func readChunk(_ js.Value, args []js.Value) any {
	if currentStream == nil {
		return failure(errors.New("start playback first"))
	}

	frames := 4096
	if len(args) >= 1 {
		frames = args[0].Int()
	}
	if frames <= 0 || frames > 65536 {
		return failure(errors.New("chunk frame count must be between 1 and 65536"))
	}

	samples := make([]int16, frames)
	n, err := currentStream.ReadSamples(samples)
	if err != nil {
		return failure(err)
	}
	samples = samples[:n]

	pcmBytes := sid.SamplesToPCM16LE(samples)
	buffer := js.Global().Get("ArrayBuffer").New(len(pcmBytes))
	bytes := js.Global().Get("Uint8Array").New(buffer)
	copied := js.CopyBytesToJS(bytes, pcmBytes)
	if copied != len(pcmBytes) {
		return failure(fmt.Errorf("could only copy %d of %d PCM bytes", copied, len(pcmBytes)))
	}

	int16Samples := js.Global().Get("Int16Array").New(buffer)
	return success(map[string]any{
		"frames":  int16Samples.Get("length").Int(),
		"samples": int16Samples,
	})
}

func stopStream(_ js.Value, _ []js.Value) any {
	currentStream = nil
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
