#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "CHANGELOG.md"
  "CONTRIBUTING.md"
  "LICENSE"
  "README.md"
  "SECURITY.md"
  "THIRD_PARTY_NOTICES.md"
)

for file in "${required_files[@]}"; do
  if [[ ! -s "$file" ]]; then
    echo "missing required release document: $file" >&2
    exit 1
  fi
done

require_text() {
  local file="$1"
  local text="$2"
  if ! grep -Fq "$text" "$file"; then
    echo "$file should mention: $text" >&2
    exit 1
  fi
}

require_text README.md "Version Compatibility"
require_text README.md "Build Metadata"
require_text README.md "releaseInfo()"
require_text README.md "BUILD_VERSION"
require_text README.md "npm Publishing"
require_text README.md "First-release distribution policy"
require_text README.md "GitHub Release archive is the baseline"
require_text README.md "npm publishing is enabled only after"
require_text README.md "check-package-version.mjs"
require_text README.md "npm pack --dry-run"
require_text README.md "npm publish --provenance --access public"
require_text README.md "NPM_TOKEN"
require_text README.md "Release Identity Preflight"
require_text README.md "dnoegel/rasterklang-wasm"
require_text README.md "github.com/dnoegel/rasterklang-wasm"
require_text README.md "Standalone Preflight"
require_text README.md "GOWORK=off go mod download all"
require_text README.md "github.com/dnoegel/rasterklang-cli@v0.1.0"
require_text README.md "Browser Compatibility"
require_text README.md "Engine Support Boundaries"
require_text README.md "Unsupported Tune Behavior"
require_text README.md "Unsupported RSID/BASIC/ROM edge cases"
require_text README.md "C64 ROM images"
require_text README.md "Verify A Release Archive"
require_text README.md "Release Provenance"
require_text README.md "RELEASE_PROVENANCE.json"
require_text README.md "Content-Type: application/wasm"

require_text CHANGELOG.md "## Unreleased"
require_text CHANGELOG.md "## v0.1.0"
require_text CHANGELOG.md "TypeScript declarations"
require_text CHANGELOG.md "browser smoke"

require_text CONTRIBUTING.md "make check"
require_text CONTRIBUTING.md "scripts/test-browser-sdk.mjs"
require_text CONTRIBUTING.md "Do not commit SID files"
require_text CONTRIBUTING.md "go work"
require_text CONTRIBUTING.md "Generated Artifact Hygiene"
require_text CONTRIBUTING.md '`dist/` is generated release output'
require_text CONTRIBUTING.md '`go.work` and `go.work.sum` are local workspace files'
require_text CONTRIBUTING.md 'Do not commit generated `dist/` contents'

require_text SECURITY.md "Supported Versions"
require_text SECURITY.md "Reporting a Vulnerability"
require_text SECURITY.md "untrusted SID files"
require_text SECURITY.md "rasterklang.wasm"

require_text THIRD_PARTY_NOTICES.md "github.com/dnoegel/rasterklang-cli"
require_text THIRD_PARTY_NOTICES.md "wasm_exec.js"
require_text THIRD_PARTY_NOTICES.md "BSD-3-Clause"
