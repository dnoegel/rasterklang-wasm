# Security Policy

## Supported Versions

Rasterklang WASM has not published a stable release yet. Security fixes target
the current `main` branch until the first public tag is cut.

After `v0.1.0`, supported versions will be listed here before release.

## Reporting a Vulnerability

Please report suspected security issues privately instead of opening a public
issue. Email the maintainer at `security@rasterklang.de` with:

- affected version or commit
- browser and operating system
- reproduction steps or proof of concept
- expected impact

You should receive an acknowledgement within seven days. Public disclosure,
release notes, and credits will be coordinated after a fix is available.

## Scope

Security reports are most useful for crashes, hangs, runaway resource use, or
unsafe behavior triggered by untrusted SID files, malformed PSID/RSID headers,
`rasterklang.wasm` instantiation, `wasm_exec.js` loading, release artifact
integrity issues, or CI/release pipeline problems.

The SDK runs inside the browser and does not upload local SID files by default.
Reports about unexpected network access or accidental tune-data disclosure are
also in scope.
