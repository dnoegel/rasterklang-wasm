import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const engineDependency = "github.com/dnoegel/rasterklang-cli@v0.1.0";
const temporaryCaches = [];

const goMod = readFileSync("go.mod", "utf8");
if (/^replace\s+/m.test(goMod) || /\nreplace\s*\(/.test(goMod)) {
  fail("go.mod must not contain replace directives for a public release");
}

const goModCache = process.env.GOMODCACHE || temporaryCache("gomod");
const goBuildCache = process.env.GOCACHE || temporaryCache("gobuild");
let failed = false;

try {
  const result = spawnSync("go", ["mod", "download", "all"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GOWORK: "off",
      GOMODCACHE: process.env.GOMODCACHE || goModCache,
      GOCACHE: process.env.GOCACHE || goBuildCache,
    },
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    console.error(
      [
        "standalone module preflight failed",
        "",
        `Expected ${engineDependency} to resolve without a local go.work or private credentials.`,
        "Publish the canonical rasterklang core repository/tag, align module paths, then rerun:",
        "",
        "  GOWORK=off go mod download all",
        "",
        details,
      ].join("\n"),
    );
    failed = true;
  } else {
    console.log(`Standalone release preflight passed for ${engineDependency}.`);
  }
} finally {
  for (const cache of temporaryCaches) {
    rmSync(cache, { recursive: true, force: true });
  }
}

if (failed) {
  process.exit(1);
}

function temporaryCache(name) {
  const cache = mkdtempSync(join(tmpdir(), `rasterklang-standalone-${name}-`));
  temporaryCaches.push(cache);
  return cache;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
