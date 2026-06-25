import { readFileSync } from "node:fs";

const args = parseArgs(process.argv.slice(2));
const releaseVersion = required(args.version, "--version");
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const normalizedReleaseVersion = releaseVersion.replace(/^v/, "");

if (packageVersion !== normalizedReleaseVersion) {
  fail(`package.json version ${packageVersion} does not match release version ${releaseVersion}`);
}

console.log(`package.json version ${packageVersion} matches ${releaseVersion}.`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      fail(`unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`${arg} requires a value`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function required(value, name) {
  if (!value) {
    fail(`${name} is required`);
  }
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
