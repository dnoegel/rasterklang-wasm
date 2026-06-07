SHELL := /bin/sh

PACKAGE := rasterklang-wasm
GO ?= go
PORT ?= 8080
DIST := dist
DIST_STAMP := $(DIST)/.dir
WASM := $(DIST)/rasterklang.wasm
WASM_EXEC := $(DIST)/wasm_exec.js
SDK := $(DIST)/rasterklang.js
VERSION ?=
ARCHIVE_VERSION := $(if $(VERSION),$(VERSION),snapshot)
ARCHIVE := $(DIST)/$(PACKAGE)-$(ARCHIVE_VERSION).tar.gz

.PHONY: help test build dist serve clean tag push-tag release check-version check-clean

help:
	@printf '%s\n' \
		'Targets:' \
		'  make test                         Run JS syntax checks and WASM Go tests' \
		'  make build                        Build browser SDK assets in dist/' \
		'  make dist                         Build release archive in dist/' \
		'  make serve                        Build and serve demo locally' \
		'  make serve PORT=9090              Build and serve demo on another port' \
		'  make tag VERSION=v0.1.0           Create an annotated release tag' \
		'  make push-tag VERSION=v0.1.0      Push a release tag to origin' \
		'  make release VERSION=v0.1.0       Create and push a release tag'

test:
	node --check src/rasterklang.js
	node --check demo/app.js
	GOOS=js GOARCH=wasm $(GO) test ./...

build: | $(DIST_STAMP)
	cp "$$($(GO) env GOROOT)/lib/wasm/wasm_exec.js" "$(WASM_EXEC)"
	cp "src/rasterklang.js" "$(SDK)"
	GOOS=js GOARCH=wasm $(GO) build -trimpath -o "$(WASM)" ./cmd/wasm

dist: clean build
	tar -C "$(DIST)" -czf "$(ARCHIVE)" "$(notdir $(SDK))" "$(notdir $(WASM_EXEC))" "$(notdir $(WASM))"
	( \
		cd "$(DIST)"; \
		if command -v sha256sum >/dev/null 2>&1; then \
			sha256sum "$(notdir $(ARCHIVE))"; \
		else \
			shasum -a 256 "$(notdir $(ARCHIVE))"; \
		fi > "$(notdir $(ARCHIVE)).sha256" \
	)

$(DIST_STAMP):
	mkdir -p "$(DIST)"
	touch "$(DIST_STAMP)"

serve: build
	@printf "Demo: http://localhost:%s/demo/\n" "$(PORT)"
	python3 -m http.server $(PORT)

clean:
	rm -rf "$(DIST)"

tag: check-version check-clean
	@if git rev-parse -q --verify "refs/tags/$(VERSION)" >/dev/null; then \
		echo "tag $(VERSION) already exists"; \
		exit 1; \
	fi
	git tag -a "$(VERSION)" -m "$(PACKAGE) $(VERSION)"

push-tag: check-version
	git push origin "$(VERSION)"

release: tag push-tag

check-version:
	@test -n "$(VERSION)" || { echo "VERSION is required, for example VERSION=v0.1.0"; exit 1; }
	@case "$(VERSION)" in \
		v[0-9]*.[0-9]*.[0-9]*) ;; \
		*) echo "VERSION must look like v0.1.0"; exit 1 ;; \
	esac

check-clean:
	@test -z "$$(git status --porcelain)" || { echo "working tree is dirty; commit changes before tagging"; exit 1; }
