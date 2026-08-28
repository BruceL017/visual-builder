import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildContactSheet } from "../scripts/build-contact-sheet.mjs";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDVQAAAABJRU5ErkJggg==",
  "base64",
);

test("renders a readable PNG contact sheet from three valid PNGs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "visual-builder-contact-sheet-"));
  try {
    const inputs = {};
    for (const id of ["concept", "process", "checklist"]) {
      inputs[id] = path.join(root, `${id}.png`);
      await writeFile(inputs[id], ONE_PIXEL_PNG);
    }
    const output = path.join(root, "contact-sheet.png");
    const result = buildContactSheet({ ...inputs, output });
    const bytes = await readFile(output);

    assert.equal(result.width, 1200);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16), result.width);
    assert.equal(bytes.readUInt32BE(20), result.height);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
