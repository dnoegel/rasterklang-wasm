GO ?= go
PORT ?= 8080
DIST := dist
WASM := $(DIST)/zmk-web.wasm
WASM_EXEC := $(DIST)/wasm_exec.js
SDK := $(DIST)/zmk-sid.js

.PHONY: build serve clean

build: | $(DIST)
	cp "$$($(GO) env GOROOT)/lib/wasm/wasm_exec.js" "$(WASM_EXEC)"
	cp "src/zmk-sid.js" "$(SDK)"
	GOOS=js GOARCH=wasm $(GO) build -trimpath -o "$(WASM)" ./cmd/wasm

$(DIST):
	mkdir -p "$(DIST)"

serve: build
	@printf "Demo: http://localhost:%s/demo/\n" "$(PORT)"
	python3 -m http.server $(PORT)

clean:
	rm -rf "$(DIST)"
