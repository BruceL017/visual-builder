import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

async function withInstalledSymlink(run) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "visual-builder-symlink-"));
  const installedRoot = path.join(temporaryRoot, "visual-builder");
  await symlink(repositoryRoot, installedRoot, "dir");
  try {
    await run(installedRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

for (const script of ["check-companions.mjs", "validate-candidate.mjs", "mark-approved.mjs"]) {
  test(`${script} executes its CLI through a symlink installation`, () => withInstalledSymlink(async (installedRoot) => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      path.join(installedRoot, "scripts", script),
      "--help",
    ]);
    assert.match(stdout, /Usage:/);
    assert.equal(stderr, "");
  }));
}

test("build-contact-sheet.mjs executes its CLI through a symlink installation", () => withInstalledSymlink(async (installedRoot) => {
  await assert.rejects(
    execFileAsync(process.execPath, [path.join(installedRoot, "scripts", "build-contact-sheet.mjs")]),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /--concept is required/);
      return true;
    },
  );
}));
