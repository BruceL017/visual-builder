import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import { COMPANIONS, checkCompanions, resolveCodexHome } from "../scripts/check-companions.mjs";

const execFileAsync = promisify(execFile);
const scriptFile = fileURLToPath(new URL("../scripts/check-companions.mjs", import.meta.url));

async function makeCodexHome() {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "visual-builder-companions-"));
  const bin = path.join(codexHome, "bin");
  await mkdir(bin);
  const rsvg = path.join(bin, "rsvg-convert");
  await writeFile(rsvg, "#!/bin/sh\necho 'rsvg-convert fixture'\n");
  await chmod(rsvg, 0o755);
  return codexHome;
}

function runtimeEnv(codexHome, overrides = {}) {
  return { ...process.env, PATH: path.join(codexHome, "bin"), ...overrides };
}

function check(codexHome, options = {}) {
  return checkCompanions({ codexHome, env: runtimeEnv(codexHome, options.env) });
}

const SCRIPT_FIXTURES = {
  "visual-builder/scripts/build-contact-sheet.mjs": "#!/usr/bin/env node\nconsole.error(\"--concept is required\");\nprocess.exitCode = 1;\n",
  "visual-builder/scripts/validate-candidate.mjs": "#!/usr/bin/env node\nif (process.argv.includes(\"--help\")) console.log(\"Usage: validate\");\n",
  "visual-builder/scripts/mark-approved.mjs": "#!/usr/bin/env node\nif (process.argv.includes(\"--help\")) console.log(\"Usage: approve\");\n",
  "post-illustration-images/scripts/validate-style-bundle.mjs": "#!/usr/bin/env node\nconsole.error(\"--bundle is required unless --installed is used\");\nprocess.exitCode = 1;\n",
  "post-illustration-images/scripts/install-style-bundle.mjs": "#!/usr/bin/env node\nconsole.error(\"--bundle is required\");\nprocess.exitCode = 1;\n",
};

function fixtureContent(name, relativeFile) {
  if (relativeFile === "SKILL.md") return `---\nname: ${name}\ndescription: Test fixture.\n---\n`;
  if (relativeFile.endsWith(".json")) return "{}\n";
  if (relativeFile.endsWith(".yaml")) return "interface: {}\n";
  if (relativeFile.endsWith(".mjs")) return SCRIPT_FIXTURES[`${name}/${relativeFile}`] ?? "// Test fixture.\n";
  return "# Test fixture\n";
}

async function writeSkillRoot(root, name, { omitFiles = [], omitDirectories = [] } = {}) {
  const definition = COMPANIONS.find((companion) => companion.name === name);
  await mkdir(root, { recursive: true });
  for (const relativeDirectory of definition.requiredDirectories) {
    if (!omitDirectories.includes(relativeDirectory)) await mkdir(path.join(root, relativeDirectory), { recursive: true });
  }
  for (const relativeFile of definition.requiredFiles) {
    if (omitFiles.includes(relativeFile)) continue;
    const file = path.join(root, relativeFile);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, fixtureContent(name, relativeFile));
  }
}

async function writeSkill(codexHome, name, options) {
  await writeSkillRoot(path.join(codexHome, "skills", name), name, options);
}

async function installAllCompanions(codexHome) {
  await writeSkill(codexHome, "visual-dna-system");
  await writeSkill(codexHome, "visual-builder");
  await writeSkill(codexHome, "post-illustration-images");
}

async function withCodexHome(run) {
  const codexHome = await makeCodexHome();
  try {
    await run(codexHome);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

test("reports all three complete companions as ready", () => withCodexHome(async (codexHome) => {
  await installAllCompanions(codexHome);
  const result = await check(codexHome);

  assert.equal(result.ready, true);
  assert.deepEqual(result.runtimes.map(({ name, status }) => ({ name, status })), [
    { name: "rsvg-convert", status: "ready" },
  ]);
  assert.deepEqual(result.companions.map(({ name, status }) => ({ name, status })), [
    { name: "visual-dna-system", status: "ready" },
    { name: "visual-builder", status: "ready" },
    { name: "post-illustration-images", status: "ready" },
  ]);
  assert.deepEqual(result.companions[0].source, {
    repo: "BruceL017/visual-dna-skills",
    path: "skills/visual-dna-system",
    name: "visual-dna-system",
  });
}));

test("reports every missing companion in one result", () => withCodexHome(async (codexHome) => {
  await writeSkill(codexHome, "visual-builder");
  const result = await check(codexHome);

  assert.equal(result.ready, false);
  assert.deepEqual(result.companions.filter(({ ready }) => !ready).map(({ name }) => name), [
    "visual-dna-system",
    "post-illustration-images",
  ]);
  assert.ok(result.companions.find(({ name }) => name === "visual-dna-system").missingFiles.includes("SKILL.md"));
  assert.ok(result.companions.find(({ name }) => name === "post-illustration-images").missingFiles.includes("SKILL.md"));
}));

test("reports incomplete downstream scripts precisely", () => withCodexHome(async (codexHome) => {
  await writeSkill(codexHome, "visual-dna-system");
  await writeSkill(codexHome, "visual-builder");
  await writeSkill(codexHome, "post-illustration-images", { omitFiles: ["scripts/install-style-bundle.mjs"] });
  const result = await check(codexHome);
  const downstream = result.companions.find(({ name }) => name === "post-illustration-images");

  assert.equal(result.ready, false);
  assert.equal(downstream.status, "invalid");
  assert.deepEqual(downstream.missingFiles, ["scripts/install-style-bundle.mjs"]);
}));

test("a repaired downstream installation passes a fresh recheck", () => withCodexHome(async (codexHome) => {
  await writeSkill(codexHome, "visual-dna-system");
  await writeSkill(codexHome, "visual-builder");
  await writeSkill(codexHome, "post-illustration-images", { omitFiles: ["scripts/install-style-bundle.mjs"] });
  assert.equal((await check(codexHome)).ready, false);

  const installer = path.join(codexHome, "skills", "post-illustration-images", "scripts", "install-style-bundle.mjs");
  await writeFile(installer, fixtureContent("post-illustration-images", "scripts/install-style-bundle.mjs"));
  const rechecked = await check(codexHome);

  assert.equal(rechecked.ready, true);
  assert.ok(rechecked.companions.every(({ missingFiles }) => missingFiles.length === 0));
}));

test("reports the canonical root for a symlink-installed downstream skill", () => withCodexHome(async (codexHome) => {
  await writeSkill(codexHome, "visual-dna-system");
  await writeSkill(codexHome, "visual-builder");
  const sourceRoot = path.join(codexHome, "sources", "post-illustration-images");
  await writeSkillRoot(sourceRoot, "post-illustration-images");
  await symlink(sourceRoot, path.join(codexHome, "skills", "post-illustration-images"), "dir");

  const result = await check(codexHome);
  const downstream = result.companions.find(({ name }) => name === "post-illustration-images");

  assert.equal(result.ready, true);
  assert.equal(downstream.realRoot, await realpath(sourceRoot));
}));

test("reports a present but nonfunctional downstream script as invalid", () => withCodexHome(async (codexHome) => {
  await installAllCompanions(codexHome);
  await writeFile(
    path.join(codexHome, "skills", "post-illustration-images", "scripts", "install-style-bundle.mjs"),
    "#!/usr/bin/env node\n",
  );

  const result = await check(codexHome);
  const downstream = result.companions.find(({ name }) => name === "post-illustration-images");

  assert.equal(result.ready, false);
  assert.equal(downstream.status, "invalid");
  assert.ok(downstream.invalidChecks.some((message) => message.includes("install-style-bundle.mjs")));
}));

test("--codex-home and --json report readiness without creating a candidate store", () => withCodexHome(async (codexHome) => {
  await installAllCompanions(codexHome);
  const candidateStore = path.join(codexHome, "visual-builder-candidates");
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [scriptFile, "--codex-home", codexHome, "--json"],
    { env: runtimeEnv(codexHome) },
  );
  const result = JSON.parse(stdout);

  assert.equal(stderr, "");
  assert.equal(result.ready, true);
  assert.equal(result.codexHome, path.resolve(codexHome));
  assert.equal(await pathExists(candidateStore), false);
}));

test("reports a missing contact-sheet runtime before candidate creation", () => withCodexHome(async (codexHome) => {
  await installAllCompanions(codexHome);
  const result = await check(codexHome, { env: { PATH: path.join(codexHome, "empty-bin") } });

  assert.equal(result.ready, false);
  assert.deepEqual(result.runtimes.map(({ name, status }) => ({ name, status })), [
    { name: "rsvg-convert", status: "missing" },
  ]);
  assert.match(result.runtimes[0].error, /not on PATH/);
  assert.equal(await pathExists(path.join(codexHome, "visual-builder-candidates")), false);
}));

test("CODEX_HOME falls back to HOME/.codex when unset or empty", () => {
  assert.equal(resolveCodexHome(null, { HOME: "/tmp/example-home" }), path.resolve("/tmp/example-home/.codex"));
  assert.equal(resolveCodexHome(null, { CODEX_HOME: "", HOME: "/tmp/example-home" }), path.resolve("/tmp/example-home/.codex"));
});

test("--codex-home rejects a missing value", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [scriptFile, "--codex-home", "--json"]),
    (error) => error.code === 2 && error.stderr.includes("--codex-home requires a non-empty path"),
  );
});
