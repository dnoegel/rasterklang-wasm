#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "CHANGELOG.md"
  "CONTRIBUTING.md"
  "LICENSE"
  "README.md"
  "SECURITY.md"
  "THIRD_PARTY_NOTICES.md"
  "docs/release.md"
)

for file in "${required_files[@]}"; do
  if [[ ! -s "$file" ]]; then
    echo "missing required document: $file" >&2
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

require_text README.md "browser SDK"
require_text README.md "## Use The SDK"
require_text README.md "## API Surface"
require_text README.md "## Current Limits"
require_text README.md "does not bundle HVSC"
require_text README.md "docs/release.md"

require_text docs/release.md "Distribution"
require_text docs/release.md "npm Publishing"
require_text docs/release.md "NPM_TOKEN"
require_text docs/release.md "Standalone Preflight"
require_text docs/release.md "Content-Type: application/wasm"

require_text CHANGELOG.md "## Unreleased"
require_text CHANGELOG.md "## v0.1.0"

require_text CONTRIBUTING.md "make check"
require_text CONTRIBUTING.md "go_js_wasm_exec"
require_text CONTRIBUTING.md "Do not commit SID files"

require_text SECURITY.md "Supported Versions"
require_text SECURITY.md "Reporting a Vulnerability"

require_text THIRD_PARTY_NOTICES.md "github.com/dnoegel/rasterklang-cli"
require_text THIRD_PARTY_NOTICES.md "wasm_exec.js"

echo "Release documents are present."
