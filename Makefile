SHELL := /bin/sh

PACKAGE := rasterklang-wasm
GO ?= go
GO_WASM_EXEC ?= $(shell $(GO) env GOROOT)/lib/wasm/go_js_wasm_exec
PORT ?= 8080
DIST := dist
DIST_STAMP := $(DIST)/.dir
LICENSE_REPORT := $(DIST)/THIRD_PARTY_LICENSE_REPORT.md
LICENSE_REPORT_FLAGS ?= --fail-on-unknown
PROVENANCE := $(DIST)/RELEASE_PROVENANCE.json
WASM := $(DIST)/rasterklang.wasm
WASM_EXEC := $(DIST)/wasm_exec.js
SDK := $(DIST)/rasterklang.js
SDK_TYPES_SRC := types/rasterklang.d.ts
SDK_TYPES := $(DIST)/rasterklang.d.ts
VERSION ?=
BUILD_VERSION ?= $(if $(VERSION),$(VERSION),$(shell git describe --tags --dirty --always 2>/dev/null || echo dev))
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
DATE ?= $(shell git log -1 --format=%cI 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
ARCHIVE_VERSION := $(if $(VERSION),$(VERSION),snapshot)
ARCHIVE := $(DIST)/$(PACKAGE)-$(ARCHIVE_VERSION).tar.gz
ARCHIVE_STAGE := $(DIST)/$(PACKAGE)-$(ARCHIVE_VERSION)
LDFLAGS := -s -w -X main.version=$(BUILD_VERSION) -X main.commit=$(COMMIT) -X main.date=$(DATE)

.PHONY: help check test npm-pack build license-report release-provenance identity-preflight standalone-preflight release-preflight dist serve clean tag push-tag release check-version check-clean

help:
	@printf '%s\n' \
		'Targets:' \
		'  make check                        Run format, JS syntax, browser smoke, vet, and tests' \
		'  make test                         Run JS syntax, browser smoke, and WASM Go tests' \
		'  make npm-pack                     Verify npm package contents with npm pack --dry-run' \
		'  make build                        Build browser SDK assets in dist/' \
		'  make license-report               Generate dist/THIRD_PARTY_LICENSE_REPORT.md' \
		'  make identity-preflight           Verify public release repo/module identity' \
		'  make standalone-preflight         Verify public module resolution without go.work' \
		'  make dist                         Build release archive in dist/' \
		'  make serve                        Build and serve demo locally' \
		'  make serve PORT=9090              Build and serve demo on another port' \
		'  make tag VERSION=v0.1.0           Create an annotated release tag' \
		'  make push-tag VERSION=v0.1.0      Push a release tag to origin' \
		'  make release VERSION=v0.1.0       Create and push a release tag'

test:
	node --check src/rasterklang.js
	node --check demo/app.js
	node --check scripts/test-package-contract.mjs
	node --check scripts/test-sdk-release-info.mjs
	node --check scripts/test-audio-buffer-compat.mjs
	node --check scripts/test-browser-sdk.mjs
	node scripts/test-sdk-release-info.mjs
	node scripts/test-audio-buffer-compat.mjs
	node scripts/test-browser-sdk.mjs
	GOOS=js GOARCH=wasm $(GO) test -exec="$(GO_WASM_EXEC)" ./...

check:
	@fmt="$$(gofmt -l .)"; \
	if [ -n "$$fmt" ]; then \
		echo "gofmt needed:"; \
		echo "$$fmt"; \
		exit 1; \
	fi
	node --check src/rasterklang.js
	node --check demo/app.js
	node --check scripts/generate-license-report.mjs
	node --check scripts/write-release-provenance.mjs
	node --check scripts/check-release-identity.mjs
	node --check scripts/check-standalone-release.mjs
	node --check scripts/check-package-version.mjs
	bash scripts/check-release-docs.sh
	node --check scripts/test-package-contract.mjs
	node --check scripts/test-sdk-release-info.mjs
	node --check scripts/test-audio-buffer-compat.mjs
	node --check scripts/test-browser-sdk.mjs
	node scripts/test-sdk-release-info.mjs
	node scripts/test-package-contract.mjs
	node scripts/test-audio-buffer-compat.mjs
	$(MAKE) license-report
	$(MAKE) release-provenance
	node scripts/test-browser-sdk.mjs
	GOOS=js GOARCH=wasm $(GO) vet ./...
	GOOS=js GOARCH=wasm $(GO) test -exec="$(GO_WASM_EXEC)" ./...

npm-pack: dist
	mkdir -p "$(DIST)/.npm-cache"
	npm_config_cache="$(DIST)/.npm-cache" npm_config_update_notifier=false npm pack --dry-run --json

build: | $(DIST_STAMP)
	cp "$$($(GO) env GOROOT)/lib/wasm/wasm_exec.js" "$(WASM_EXEC)"
	cp "src/rasterklang.js" "$(SDK)"
	cp "$(SDK_TYPES_SRC)" "$(SDK_TYPES)"
	GOOS=js GOARCH=wasm $(GO) build -trimpath -ldflags="$(LDFLAGS)" -o "$(WASM)" ./cmd/wasm

license-report: | $(DIST_STAMP)
	node scripts/generate-license-report.mjs --project . --out "$(LICENSE_REPORT)" $(LICENSE_REPORT_FLAGS)

release-provenance: | $(DIST_STAMP)
	node scripts/write-release-provenance.mjs \
		--out "$(PROVENANCE)" \
		--name "$(PACKAGE)" \
		--version "$(BUILD_VERSION)" \
		--commit "$(COMMIT)" \
		--date "$(DATE)" \
		--source-repository "https://github.com/dnoegel/rasterklang-wasm" \
		--artifact-kind "wasm-sdk-archive" \
		--artifact-name "$(notdir $(ARCHIVE))" \
		--target-os "js" \
		--target-arch "wasm" \
		--build-command "make dist VERSION=$(VERSION)"

identity-preflight:
	node scripts/check-release-identity.mjs

standalone-preflight:
	node scripts/check-standalone-release.mjs

release-preflight: identity-preflight standalone-preflight

dist: clean build license-report release-provenance
	rm -rf "$(ARCHIVE_STAGE)"
	mkdir -p "$(ARCHIVE_STAGE)"
	cp "$(SDK)" "$(SDK_TYPES)" "$(WASM_EXEC)" "$(WASM)" "$(LICENSE_REPORT)" "$(PROVENANCE)" "$(ARCHIVE_STAGE)/"
	cp README.md CHANGELOG.md CONTRIBUTING.md LICENSE SECURITY.md THIRD_PARTY_NOTICES.md "$(ARCHIVE_STAGE)/"
	tar -C "$(ARCHIVE_STAGE)" -czf "$(ARCHIVE)" rasterklang.js rasterklang.d.ts wasm_exec.js rasterklang.wasm THIRD_PARTY_LICENSE_REPORT.md RELEASE_PROVENANCE.json README.md CHANGELOG.md CONTRIBUTING.md LICENSE SECURITY.md THIRD_PARTY_NOTICES.md
	rm -rf "$(ARCHIVE_STAGE)"
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

release: release-preflight tag push-tag

check-version:
	@test -n "$(VERSION)" || { echo "VERSION is required, for example VERSION=v0.1.0"; exit 1; }
	@case "$(VERSION)" in \
		v[0-9]*.[0-9]*.[0-9]*) ;; \
		*) echo "VERSION must look like v0.1.0"; exit 1 ;; \
	esac

check-clean:
	@test -z "$$(git status --porcelain)" || { echo "working tree is dirty; commit changes before tagging"; exit 1; }
