import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const engineDependency = "github.com/dnoegel/rasterklang-cli@v0.1.0";

const goMod = readFileSync("go.mod", "utf8");
if (/^replace\s+/m.test(goMod) || /\nreplace\s*\(/.test(goMod)) {
  fail("go.mod must not contain replace directives for a public release");
}

const result = spawnSync("go", ["mod", "download", "all"], {
  cwd: process.cwd(),
  env: { ...process.env, GOWORK: "off" },
  encoding: "utf8",
});

if (result.status !== 0) {
  const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  fail(
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
}

console.log(`Standalone release preflight passed for ${engineDependency}.`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
