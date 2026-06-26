import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageJsonPath = "package.json";
assert.ok(existsSync(packageJsonPath), "package.json should exist");

const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const readme = readFileSync("README.md", "utf8");
const goMod = readFileSync("go.mod", "utf8");
const sdkTypes = readFileSync("types/rasterklang.d.ts", "utf8");
const releaseWorkflow = readFileSync(".github/workflows/release.yml", "utf8");
const makefile = readFileSync("Makefile", "utf8");
assert.equal(pkg.name, "rasterklang-wasm");
assert.equal(pkg.type, "module");
assert.equal(pkg.license, "MIT");
assert.equal(pkg.sideEffects, false);
assert.equal(pkg.main, "./dist/rasterklang.js");
assert.equal(pkg.types, "./dist/rasterklang.d.ts");
assert.equal(pkg.repository?.type, "git");
assert.equal(pkg.repository?.url, "git+https://github.com/dnoegel/rasterklang-wasm.git");
assert.equal(pkg.bugs?.url, "https://github.com/dnoegel/rasterklang-wasm/issues");
assert.equal(pkg.homepage, "https://github.com/dnoegel/rasterklang-wasm#readme");
assert.ok(pkg.keywords.includes("sid"));
assert.ok(pkg.keywords.includes("wasm"));
assert.ok(pkg.keywords.includes("commodore-64"));
assert.equal(pkg.exports?.["."]?.import, "./dist/rasterklang.js");
assert.equal(pkg.exports?.["."]?.types, "./dist/rasterklang.d.ts");

for (const expectedFile of [
  "dist/rasterklang.js",
  "dist/rasterklang.d.ts",
  "dist/rasterklang.wasm",
  "dist/wasm_exec.js",
  "dist/THIRD_PARTY_LICENSE_REPORT.md",
  "dist/RELEASE_PROVENANCE.json",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
]) {
  assert.ok(pkg.files.includes(expectedFile), `package files should include ${expectedFile}`);
}

assert.ok(existsSync("types/rasterklang.d.ts"), "source type declarations should exist");

const engineMatch = goMod.match(/^require\s+github\.com\/dnoegel\/rasterklang-cli\s+(v[^\s]+)$/m);
assert.ok(engineMatch, "go.mod should declare the rasterklang engine dependency");

const packageReleaseVersion = `v${pkg.version}`;
const engineVersion = engineMatch[1];
const archiveExample = `rasterklang-wasm-${packageReleaseVersion}.tar.gz`;

const matchingVersion = spawnSync(
  process.execPath,
  ["scripts/check-package-version.mjs", "--version", packageReleaseVersion],
  { encoding: "utf8" },
);
assert.equal(matchingVersion.status, 0, matchingVersion.stderr || matchingVersion.stdout);

const mismatchedVersion = spawnSync(
  process.execPath,
  ["scripts/check-package-version.mjs", "--version", "v9.9.9"],
  { encoding: "utf8" },
);
assert.notEqual(mismatchedVersion.status, 0);
assert.match(mismatchedVersion.stderr, /package.json version 0\.1\.0 does not match release version v9\.9\.9/);

for (const phrase of [
  "## Version Compatibility",
  "## Build Metadata",
  "releaseInfo()",
  "BUILD_VERSION",
  "DATE defaults to the current commit timestamp",
  `| ${packageReleaseVersion} | github.com/dnoegel/rasterklang-cli ${engineVersion} |`,
  "## Browser Compatibility",
  "Chrome/Chromium",
  "Firefox",
  "Safari",
  "## Serving And Caching",
  "Content-Type: application/wasm",
  "Cache-Control: public, max-age=31536000, immutable",
  "Cache-Control: no-cache",
  "## Verify A Release Archive",
  `sha256sum -c ${archiveExample}.sha256`,
  `shasum -a 256 -c ${archiveExample}.sha256`,
  "## Release Provenance",
  "RELEASE_PROVENANCE.json",
  "## npm Publishing",
  "npm pack --dry-run",
  "node scripts/check-package-version.mjs --version",
  "npm publish --provenance --access public",
  "NPM_TOKEN",
]) {
  assert.ok(readme.includes(phrase), `README.md should document: ${phrase}`);
}

assert.ok(
  !makefile.includes("DATE ?= $(shell date -u"),
  "Makefile DATE default must not use wall-clock time because it dirties checked website WASM assets",
);
assert.match(
  makefile,
  /DATE \?= \$\(shell git log -1 --format=%cI/,
  "Makefile DATE default should use the current commit timestamp for deterministic local builds",
);
assert.match(
  makefile,
  /npm_config_cache="\$\(DIST\)\/\.npm-cache"/,
  "make npm-pack should use an isolated npm cache under dist/",
);
assert.match(
  makefile,
  /npm_config_update_notifier=false/,
  "make npm-pack should disable npm's update notifier for release checks",
);
assert.match(
  makefile,
  /npm pack --dry-run --json/,
  "make npm-pack should emit machine-readable npm pack dry-run output",
);

for (const phrase of [
  "export interface RasterklangReleaseInfo",
  "version: string;",
  "commit: string;",
  "date: string;",
  "releaseInfo(): RasterklangReleaseInfo;",
]) {
  assert.ok(sdkTypes.includes(phrase), `types/rasterklang.d.ts should document: ${phrase}`);
}

for (const phrase of [
  "id-token: write",
  'registry-url: "https://registry.npmjs.org"',
  "npm pack --dry-run",
  "node scripts/check-package-version.mjs --version",
  "npm publish --provenance --access public",
  "NODE_AUTH_TOKEN",
]) {
  assert.ok(releaseWorkflow.includes(phrase), `.github/workflows/release.yml should contain: ${phrase}`);
}

const version = process.env.TEST_WASM_PACKAGE_VERSION || "v0.0.0-package-test";
const archiveName = `rasterklang-wasm-${version}.tar.gz`;
const archivePath = join("dist", archiveName);
const checksumPath = `${archivePath}.sha256`;
const goBuildCache = mkdtempSync(join(tmpdir(), "rasterklang-wasm-package-go-build-"));

rmSync("dist", { recursive: true, force: true });
execFileSync("make", ["dist", `VERSION=${version}`], {
  encoding: "utf8",
  env: {
    ...process.env,
    GOCACHE: process.env.GOCACHE || goBuildCache,
  },
  stdio: "pipe",
});

for (const expectedDistFile of [
  "dist/rasterklang.js",
  "dist/rasterklang.d.ts",
  "dist/rasterklang.wasm",
  "dist/wasm_exec.js",
  "dist/THIRD_PARTY_LICENSE_REPORT.md",
  "dist/RELEASE_PROVENANCE.json",
  archivePath,
  checksumPath,
]) {
  assert.ok(existsSync(expectedDistFile), `${expectedDistFile} should be generated`);
}

const archiveEntries = execFileSync("tar", ["-tzf", archivePath], { encoding: "utf8" })
  .trim()
  .split("\n");

for (const expectedEntry of [
  "rasterklang.js",
  "rasterklang.d.ts",
  "rasterklang.wasm",
  "wasm_exec.js",
  "THIRD_PARTY_LICENSE_REPORT.md",
  "RELEASE_PROVENANCE.json",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
]) {
  assert.ok(archiveEntries.includes(expectedEntry), `${expectedEntry} should be in release archive`);
}

const checksum = readFileSync(checksumPath, "utf8").trim();
assert.match(checksum, new RegExp(`^[a-f0-9]{64}\\s+${archiveName}$`));

const provenance = JSON.parse(readFileSync("dist/RELEASE_PROVENANCE.json", "utf8"));
assert.equal(provenance.schemaVersion, 1);
assert.equal(provenance.name, "rasterklang-wasm");
assert.equal(provenance.version, version);
assert.equal(provenance.sourceRepository, "https://github.com/dnoegel/rasterklang-wasm");
assert.equal(provenance.artifact.kind, "wasm-sdk-archive");
assert.equal(provenance.artifact.name, archiveName);
assert.equal(provenance.artifact.targetOs, "js");
assert.equal(provenance.artifact.targetArch, "wasm");

const npmCache = join("dist", ".npm-cache");
mkdirSync(npmCache, { recursive: true });
const packOutput = execFileSync("npm", ["pack", "--dry-run", "--json"], {
  encoding: "utf8",
  env: {
    ...process.env,
    npm_config_cache: npmCache,
    npm_config_update_notifier: "false",
  },
});
const [pack] = JSON.parse(packOutput);
assert.equal(pack.name, pkg.name);
assert.equal(pack.version, pkg.version);
const packedFiles = new Set(pack.files.map((entry) => entry.path));

for (const expectedFile of pkg.files) {
  assert.ok(packedFiles.has(expectedFile), `npm pack should include ${expectedFile}`);
}

rmSync(goBuildCache, { recursive: true, force: true });
