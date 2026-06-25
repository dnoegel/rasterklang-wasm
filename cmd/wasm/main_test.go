package main

import (
	"syscall/js"
	"testing"

	sid "github.com/dnoegel/rasterklang-cli"
)

func TestTraceMaskFromEmptyJSArrayUsesDefaultDebugMask(t *testing.T) {
	values := js.Global().Get("Array").New()

	mask := traceMaskFromJS(values)

	want := sid.TraceFrames | sid.TraceCPUSteps | sid.TraceSIDWrites
	if mask != want {
		t.Fatalf("traceMaskFromJS(empty array) = %v, want default debug mask %v", mask, want)
	}
}
