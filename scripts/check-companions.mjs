#!/usr/bin/env node

import { constants, realpathSync } from "node:fs";
import { access, readFile, realpath, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const COMPANIONS = [
  {
    name: "visual-dna-system",
    requiredFiles: [
      "SKILL.md",
      "references/output-schema.md",
      "references/originality-guardrails.md",
    ],
    requiredDirectories: [],
    probes: [],
    source: {
      repo: "BruceL017/visual-dna-skills",
      path: "skills/visual-dna-system",
      name: "visual-dna-system",
    },
  },
  {
    name: "visual-builder",
    requiredFiles: [
      "SKILL.md",
      "agents/openai.yaml",
      "references/candidate-contract.md",
      "references/compiler.md",
      "references/qa.md",
      "scripts/build-contact-sheet.mjs",
      "scripts/check-companions.mjs",
      "scripts/mark-approved.mjs",
      "scripts/validate-candidate.mjs",
    ],
    requiredDirectories: [],
    probes: [
      { relativeFile: "scripts/validate-candidate.mjs", args: ["--help"], status: 0, stdout: "Usage:" },
      { relativeFile: "scripts/mark-approved.mjs", args: ["--help"], status: 0, stdout: "Usage:" },
      { relativeFile: "scripts/build-contact-sheet.mjs", args: [], status: 1, stderr: "--concept is required" },
    ],
    source: {
      repo: "BruceL017/visual-builder",
      path: ".",
      name: "visual-builder",
    },
  },
  {
    name: "post-illustration-images",
    requiredFiles: [
      "SKILL.md",
      "references/style-bundle-contract.md",
      "references/style-index.md",
      "references/style-registry.json",
      "scripts/validate-style-bundle.mjs",
      "scripts/install-style-bundle.mjs",
    ],
    requiredDirectories: ["assets/style-references", "references/styles"],
    probes: [
      { relativeFile: "scripts/validate-style-bundle.mjs", args: [], status: 1, stderr: "--bundle is required unless --installed is used" },
      { relativeFile: "scripts/install-style-bundle.mjs", args: [], status: 1, stderr: "--bundle is required" },
    ],
    source: {
      repo: "BruceL017/post-illustration-images",
      path: ".",
      name: "post-illustration-images",
    },
  },
];

export const RUNTIME_REQUIREMENTS = [
  {
    name: "rsvg-convert",
    command: "rsvg-convert",
    args: ["--version"],
    package: "librsvg",
    purpose: "render calibration/contact-sheet.png",
  },
];

function usage() {
  return "Usage: node scripts/check-companions.mjs [--codex-home <path>] [--json]";
}

export function parseArguments(argv) {
  const options = { codexHome: null, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--codex-home") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--codex-home requires a non-empty path");
      options.codexHome = value;
    }
    else if (argument === "--json") options.json = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

export function resolveCodexHome(explicitPath, env = process.env) {
  const configured = explicitPath || env.CODEX_HOME;
  const fallbackHome = env.HOME || os.homedir();
  return path.resolve(configured || path.join(fallbackHome, ".codex"));
}

async function isReadableFile(file) {
  try {
    const metadata = await stat(file);
    if (!metadata.isFile()) return false;
    await access(file, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function isReadableDirectory(directory) {
  try {
    const metadata = await stat(directory);
    if (!metadata.isDirectory()) return false;
    await access(directory, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function validateSkillName(root, expectedName) {
  try {
    const content = await readFile(path.join(root, "SKILL.md"), "utf8");
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const name = frontmatter?.[1].match(/^name:\s*["']?([^"'\s#]+)["']?\s*$/m)?.[1];
    return name === expectedName ? null : `SKILL.md name must be ${expectedName}`;
  } catch (error) {
    return `SKILL.md cannot be parsed: ${error.message}`;
  }
}

function runProbe(root, probe, env) {
  const result = spawnSync(process.execPath, [path.join(root, probe.relativeFile), ...probe.args], {
    encoding: "utf8",
    env,
    timeout: 5000,
  });
  if (result.error) return `${probe.relativeFile} probe failed: ${result.error.message}`;
  if (result.status !== probe.status) {
    return `${probe.relativeFile} probe exited ${result.status}, expected ${probe.status}`;
  }
  if (probe.stdout && !result.stdout.includes(probe.stdout)) {
    return `${probe.relativeFile} probe stdout is missing ${JSON.stringify(probe.stdout)}`;
  }
  if (probe.stderr && !result.stderr.includes(probe.stderr)) {
    return `${probe.relativeFile} probe stderr is missing ${JSON.stringify(probe.stderr)}`;
  }
  return null;
}

function checkRuntime(requirement, env) {
  const result = spawnSync(requirement.command, requirement.args, {
    encoding: "utf8",
    env,
    timeout: 5000,
  });
  let error = null;
  if (result.error) error = result.error.code === "ENOENT"
    ? `${requirement.command} is not on PATH`
    : `${requirement.command} probe failed: ${result.error.message}`;
  else if (result.status !== 0) error = `${requirement.command} probe exited ${result.status}`;
  return {
    name: requirement.name,
    ready: error === null,
    status: error === null ? "ready" : "missing",
    command: requirement.command,
    package: requirement.package,
    purpose: requirement.purpose,
    error,
  };
}

export async function checkCompanions({ codexHome, env = process.env } = {}) {
  const resolvedCodexHome = resolveCodexHome(codexHome, env);
  const companions = await Promise.all(COMPANIONS.map(async (definition) => {
    const root = path.join(resolvedCodexHome, "skills", definition.name);
    const realRoot = await realpath(root).catch(() => null);
    const checks = await Promise.all(definition.requiredFiles.map(async (relativeFile) => ({
      relativeFile,
      readable: await isReadableFile(path.join(root, relativeFile)),
    })));
    const missingFiles = checks.filter((check) => !check.readable).map((check) => check.relativeFile);
    const directoryChecks = await Promise.all(definition.requiredDirectories.map(async (relativeDirectory) => ({
      relativeDirectory,
      readable: await isReadableDirectory(path.join(root, relativeDirectory)),
    })));
    const missingDirectories = directoryChecks
      .filter((check) => !check.readable)
      .map((check) => check.relativeDirectory);
    const invalidChecks = [];
    if (!missingFiles.includes("SKILL.md")) {
      const skillNameError = await validateSkillName(root, definition.name);
      if (skillNameError) invalidChecks.push(skillNameError);
    }
    if (realRoot) {
      for (const probe of definition.probes) {
        if (missingFiles.includes(probe.relativeFile)) continue;
        const probeError = runProbe(realRoot, probe, env);
        if (probeError) invalidChecks.push(probeError);
      }
    }
    const ready = missingFiles.length === 0 && missingDirectories.length === 0 && invalidChecks.length === 0;
    const status = ready ? "ready" : realRoot ? "invalid" : "missing";
    return {
      name: definition.name,
      ready,
      status,
      root,
      realRoot,
      requiredFiles: [...definition.requiredFiles],
      missingFiles,
      requiredDirectories: [...definition.requiredDirectories],
      missingDirectories,
      invalidChecks,
      source: { ...definition.source },
    };
  }));
  const runtimes = RUNTIME_REQUIREMENTS.map((requirement) => checkRuntime(requirement, env));

  return {
    ready: companions.every((companion) => companion.ready) && runtimes.every((runtime) => runtime.ready),
    codexHome: resolvedCodexHome,
    companions,
    runtimes,
  };
}

export function formatText(result) {
  const lines = [
    `Companion preflight: ${result.ready ? "ready" : "blocked"}`,
    `CODEX_HOME: ${result.codexHome}`,
  ];
  for (const companion of result.companions) {
    lines.push(`- ${companion.name}: ${companion.status}`);
    if (companion.missingFiles.length > 0) lines.push(`  missing: ${companion.missingFiles.join(", ")}`);
    if (companion.missingDirectories.length > 0) lines.push(`  missing directories: ${companion.missingDirectories.join(", ")}`);
    for (const invalidCheck of companion.invalidChecks) lines.push(`  invalid: ${invalidCheck}`);
    if (!companion.ready) {
      lines.push(`  install: repo=${companion.source.repo} path=${companion.source.path} name=${companion.source.name}`);
    }
  }
  for (const runtime of result.runtimes) {
    lines.push(`- runtime ${runtime.name}: ${runtime.status}`);
    if (!runtime.ready) {
      lines.push(`  missing: ${runtime.error}`);
      lines.push(`  package: ${runtime.package} (${runtime.purpose})`);
    }
  }
  return lines.join("\n");
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(usage());
    return;
  }

  const result = await checkCompanions({ codexHome: options.codexHome });
  console.log(options.json ? JSON.stringify(result, null, 2) : formatText(result));
  if (!result.ready) process.exitCode = 1;
}

const isCli = process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isCli) await main();
