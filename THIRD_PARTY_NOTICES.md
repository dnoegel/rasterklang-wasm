# Third-Party Notices

Rasterklang WASM is licensed under the MIT License. See `LICENSE`.

This repository depends on third-party Go modules declared in `go.mod`. Release
archives are built from the exact tagged source state, so this notice must be
reviewed whenever `go.mod`, `go.sum`, or the generated WASM runtime changes.

Known runtime dependency and artifact surface for the WASM SDK release:

| Component | Version | License | Use |
| --- | --- | --- | --- |
| `github.com/dnoegel/rasterklang-cli` | v0.1.0 | MIT | SID parsing, rendering, and debug engine compiled into `rasterklang.wasm`. |
| Go `wasm_exec.js` | local Go toolchain | BSD-3-Clause | JavaScript runtime support file required by Go WebAssembly. |

Release archives include `wasm_exec.js`, copied from the local Go toolchain at
build time. That file is governed by the Go project's BSD-style license.

The WASM SDK release archive does not intentionally include the HVSC tune corpus,
C64 ROM images, or third-party SID files.

Before each public release, generate and review a complete dependency license
report from the exact tagged source state and include any required notices with
the release.
