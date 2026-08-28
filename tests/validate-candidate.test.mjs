import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { checkCompanions } from "../scripts/check-companions.mjs";
import { markApproved } from "../scripts/mark-approved.mjs";
import { HARD_GATE_KEYS, SCORE_KEYS, validateCandidate } from "../scripts/validate-candidate.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PLATFORM = {
  width: 1080,
  height: 1440,
  ratio: "3:4",
  orientation: "vertical",
};

const PLATFORM_CASES = {
  wechat: {
    specPlatform: "wechat",
    canvas: { width: 1600, height: 1200, ratio: "4:3", orientation: "horizontal" },
    safeArea: { x: 80, y: 80, width: 1440, height: 1040 },
  },
  xhs: {
    specPlatform: "xiaohongshu",
    canvas: PLATFORM,
    safeArea: { x: 80, y: 96, width: 920, height: 1248 },
  },
  zhihu: {
    specPlatform: "zhihu",
    canvas: { width: 1600, height: 900, ratio: "16:9", orientation: "horizontal" },
    safeArea: { x: 80, y: 70, width: 1440, height: 760 },
  },
  weibo: {
    specPlatform: "weibo",
    canvas: PLATFORM,
    safeArea: { x: 80, y: 96, width: 920, height: 1248 },
  },
  toutiao: {
    specPlatform: "toutiao",
    canvas: { width: 1600, height: 900, ratio: "16:9", orientation: "horizontal" },
    safeArea: { x: 80, y: 70, width: 1440, height: 760 },
    minShortEdge: 900,
  },
};

const pngCache = new Map();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function pngHeader(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 0, 0, 0, 0], 8);
  return ihdr;
}

function encodePng(width, height, raw) {
  const ihdr = pngHeader(width, height);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function png(width, height, marker) {
  const key = `${width}x${height}:${marker}`;
  if (pngCache.has(key)) return pngCache.get(key);
  const raw = Buffer.alloc((width + 1) * height);
  raw[1] = Buffer.from(marker)[0] ?? 0;
  const result = encodePng(width, height, raw);
  pngCache.set(key, result);
  return result;
}

function gates(value = true) {
  return Object.fromEntries(HARD_GATE_KEYS.map((key) => [key, value]));
}

function scores(value) {
  return Object.fromEntries(SCORE_KEYS.map((key) => [key, value]));
}

function validStyleMarkdown() {
  return `# Quiet Grid

## Purpose

Support structured explainers and practical checklists.

## Visual Character

Use a calm editorial rhythm with clear visual hierarchy.

### Supporting Details

Keep secondary elements restrained and legible.

## Palette Roles

Use warm paper, dark ink, and one restrained accent role.

## Typography

Use sturdy display type with quieter supporting text.

## Composition Grammar

Build around one focal idea and balanced supporting groups.

## Components And Illustration

Use simple panels, labels, dividers, and geometric icons.

## Texture And Material

Apply subtle paper grain without reducing readability.

## Platform Geometry

Respect the platform safe area and preserve a clear composition.

## Originality And Prohibitions

Do not copy source identity, wording, or signature motifs.

## Calibration Guidance

Preserve the visual system across concept, process, and checklist structures.
`;
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function mutateJson(root, relative, change) {
  const file = path.join(root, relative);
  const value = JSON.parse(await readFile(file, "utf8"));
  change(value);
  await writeJson(file, value);
}

async function makeValidCandidate() {
  const root = await mkdtemp(path.join(os.tmpdir(), "visual-builder-test-"));
  await mkdir(path.join(root, "prompts"));
  await mkdir(path.join(root, "calibration"));
  await writeJson(path.join(root, "candidate.json"), {
    schemaVersion: 2,
    status: "ready_for_review",
    template_ready: false,
    style: {
      id: "quiet-grid",
      displayName: "Quiet Grid",
      platform: "xhs",
      defaultUse: "Structured explainers and practical checklists",
      aliases: ["editorial-grid"],
    },
    files: {
      styleMarkdown: "style.md",
      styleSpec: "style.spec.json",
      provenance: "provenance.json",
      styleReference: "calibration/style-reference.png",
      qa: "qa.json",
    },
    humanApproval: { status: "pending", approvedAt: null, note: null },
  });
  await writeFile(path.join(root, "visual-dna.md"), "# Visual DNA\n\nA normalized system.\n");
  await writeJson(path.join(root, "visual-dna.json"), {
    schema_version: 1,
    visual_dna_system: { palette: { relationship: "warm paper with dark ink" } },
    design_signal: {
      observable: {
        color_roles: true,
        typography_hierarchy: true,
        composition: true,
        shape_components: true,
        material_texture: true,
        illustration_icon_language: false,
      },
      identity_dominates: false,
      observable_count: 5,
      evidence_complete: true,
      missing_evidence: [],
      decision: "pass",
      reason: null,
    },
  });
  await writeJson(path.join(root, "provenance.json"), {
    schema_version: 1,
    extraction_mode: "image",
    source: { sha256: "a".repeat(64), width: 1080, height: 1440, short_edge: 1080 },
    confidence: 0.92,
    original_retained: false,
    used_as_generation_reference: false,
  });
  await writeFile(path.join(root, "style.md"), validStyleMarkdown());
  await writeJson(path.join(root, "style.spec.json"), {
    id: "quiet-grid",
    styleFile: "references/styles/quiet-grid.md",
    platform: "xiaohongshu",
    canvas: PLATFORM,
    colors: { "paper.warm": "#F8F5EE", "ink.dark": "#1B1B1B" },
    layout: {
      contentSafeArea: { x: 80, y: 96, width: 920, height: 1248 },
    },
    inputHandling: {
      preserveNativeOutput: true,
      ratioTolerance: 0.002,
      outputCanvasRole: "design-coordinate-system",
      allowPostGenerationResize: false,
      allowCrop: false,
      allowPadding: false,
      allowRotation: false,
      allowWrongRatioStretch: false,
      wrongRatioAction: "regenerate",
    },
    styleReference: {
      image: "assets/style-references/quiet-grid.png",
      usage: "QA and failure review only",
      contentPolicy: "Ignore semantic content, identity, logos, watermarks, and signatures.",
      isGenerationInput: false,
    },
  });

  const imageScores = { concept: 92, process: 90, checklist: 88 };
  for (const id of ["concept", "process", "checklist"]) {
    await writeFile(path.join(root, "prompts", `${id}.md`), `# ${id}\n\nNeutral content.\n`);
    await writeFile(path.join(root, "calibration", `${id}.png`), png(1080, 1440, id));
  }
  await writeFile(path.join(root, "calibration", "style-reference.png"), png(1080, 1440, "concept"));
  await writeFile(path.join(root, "calibration", "contact-sheet.png"), png(1080, 1440, "contact-sheet"));
  await writeJson(path.join(root, "qa.json"), {
    schemaVersion: 1,
    reviews: {
      style: {
        reviewer: "style-review-subagent",
        run_id: "style-run-1",
        backend: "codex",
        model: "test-review-model",
        reviewed_at: "2026-07-16T08:00:00.000Z",
        input_scope: "style-contract-and-all-calibration-images",
        source_visible: false,
        originality_review_visible: false,
        conclusion: "pass",
      },
      originality: {
        reviewer: "originality-review-subagent",
        run_id: "originality-run-1",
        backend: "codex",
        model: "test-review-model",
        reviewed_at: "2026-07-16T08:01:00.000Z",
        input_scope: "source-and-all-calibration-images",
        source_mode: "image",
        source_pixels_visible: true,
        style_scores_visible: false,
        limitation: null,
        conclusion: "pass",
      },
    },
    hard_gates: gates(),
    calibration_images: ["concept", "process", "checklist"].map((id) => ({
      id,
      file: `calibration/${id}.png`,
      prompt_file: `prompts/${id}.md`,
      total_score: imageScores[id],
      scores: scores(imageScores[id]),
      hard_gates: gates(),
      generation: { backend: "runtime-image-tool", model: "test-model", width: 1080, height: 1440 },
    })),
    average_score: 90,
    dimension_averages: scores(90),
    selected_reference: {
      image_id: "concept",
      source_image: "calibration/concept.png",
      path: "calibration/style-reference.png",
    },
    contact_sheet: "calibration/contact-sheet.png",
  });
  return root;
}

async function withCandidate(run) {
  const root = await makeValidCandidate();
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function configurePlatformCandidate(root, platform, {
  width = PLATFORM_CASES[platform].canvas.width,
  height = PLATFORM_CASES[platform].canvas.height,
  makeDefault = false,
} = {}) {
  const platformCase = PLATFORM_CASES[platform];
  await mutateJson(root, "candidate.json", (candidate) => {
    candidate.style.platform = platform;
    candidate.style.makeDefault = makeDefault;
  });
  await mutateJson(root, "style.spec.json", (spec) => {
    spec.platform = platformCase.specPlatform;
    spec.canvas = platformCase.canvas;
    spec.layout.contentSafeArea = platformCase.safeArea;
    spec.inputHandling = {
      preserveNativeOutput: true,
      ratioTolerance: 0.002,
      outputCanvasRole: "design-coordinate-system",
      allowPostGenerationResize: false,
      allowCrop: false,
      allowPadding: false,
      allowRotation: false,
      allowWrongRatioStretch: false,
      wrongRatioAction: "regenerate",
    };
    if (platformCase.minShortEdge) spec.inputHandling.minShortEdge = platformCase.minShortEdge;
  });
  await mutateJson(root, "qa.json", (qa) => {
    for (const image of qa.calibration_images) {
      image.generation.width = width;
      image.generation.height = height;
    }
  });
  for (const id of ["concept", "process", "checklist"]) {
    await writeFile(path.join(root, "calibration", `${id}.png`), png(width, height, id));
  }
  await writeFile(path.join(root, "calibration", "style-reference.png"), png(width, height, "concept"));
}

async function configureToutiaoCandidate(root, { width = 1672, height = 941 } = {}) {
  await configurePlatformCandidate(root, "toutiao", {
    width,
    height,
    makeDefault: true,
  });
}

test("accepts a complete reviewable candidate", () => withCandidate(async (root) => {
  const result = await validateCandidate(root);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.summary.styleId, "quiet-grid");
  assert.equal(result.summary.platform, "xhs");
  assert.equal(result.summary.makeDefault, false);
  assert.equal(result.summary.installable, false);
}));

test("rejects candidate schemaVersion 1", () => withCandidate(async (root) => {
  await mutateJson(root, "candidate.json", (candidate) => { candidate.schemaVersion = 1; });
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "candidate.schemaVersion"));
}));

const LEGACY_FIELD_CASES = [
  {
    name: "candidate style.brandPolicy",
    file: "candidate.json",
    field: "candidate.style.brandPolicy",
    mutate: (candidate) => { candidate.style.brandPolicy = { defaultEnabled: false, userOverrideAllowed: true }; },
  },
  {
    name: "spec brandPolicy",
    file: "style.spec.json",
    field: "style.spec.brandPolicy",
    mutate: (spec) => { spec.brandPolicy = { defaultEnabled: false, userOverrideAllowed: true }; },
  },
  {
    name: "spec layout.brandReservedArea",
    file: "style.spec.json",
    field: "style.spec.layout.brandReservedArea",
    mutate: (spec) => { spec.layout.brandReservedArea = { x: 842, y: 44, width: 208, height: 90 }; },
  },
  {
    name: "spec fixedComponents.brandSlot",
    file: "style.spec.json",
    field: "style.spec.fixedComponents.brandSlot",
    mutate: (spec) => { spec.fixedComponents = { brandSlot: { x: 872, y: 64, width: 148, height: 40 } }; },
  },
  {
    name: "spec generationConstraints.forbidModelDrawnBrand",
    file: "style.spec.json",
    field: "style.spec.generationConstraints.forbidModelDrawnBrand",
    mutate: (spec) => { spec.generationConstraints = { forbidModelDrawnBrand: true }; },
  },
  {
    name: "spec generationConstraints.keepBrandReservedAreaClear",
    file: "style.spec.json",
    field: "style.spec.generationConstraints.keepBrandReservedAreaClear",
    mutate: (spec) => { spec.generationConstraints = { keepBrandReservedAreaClear: true }; },
  },
  {
    name: "QA top-level hard_gates.brand_free",
    file: "qa.json",
    field: "qa.hard_gates.brand_free",
    mutate: (qa) => { qa.hard_gates.brand_free = true; },
  },
  {
    name: "QA per-image hard_gates.brand_free",
    file: "qa.json",
    field: "qa.calibration_images[0].hard_gates.brand_free",
    mutate: (qa) => { qa.calibration_images[0].hard_gates.brand_free = true; },
  },
  {
    name: "QA selected_reference.unbranded",
    file: "qa.json",
    field: "qa.selected_reference.unbranded",
    mutate: (qa) => { qa.selected_reference.unbranded = true; },
  },
];

for (const legacy of LEGACY_FIELD_CASES) {
  test(`rejects legacy ${legacy.name}`, () => withCandidate(async (root) => {
    await mutateJson(root, legacy.file, legacy.mutate);
    const result = await validateCandidate(root);
    assert.ok(result.errors.some((error) => error.field === legacy.field && error.code === "legacy-field"));
  }));
}

test("identity_leakage covers logo, watermark, and signature leakage", () => withCandidate(async (root) => {
  await mutateJson(root, "qa.json", (qa) => { qa.hard_gates.identity_leakage = false; });
  const result = await validateCandidate(root);
  const error = result.errors.find((item) => item.field === "qa.hard_gates.identity_leakage");
  assert.equal(error?.code, "qa-hard-gate");
  assert.match(error?.message ?? "", /logo.*watermark.*signature/i);
}));

test("accepts a style-reference policy covering semantic content and identity leakage", () => withCandidate(async (root) => {
  const result = await validateCandidate(root);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
}));

for (const [name, policy] of [
  ["identity leakage only", "Ignore identity, logos, watermarks, and signatures."],
  ["semantic content only", "Ignore semantic content."],
  ["semantic content and logos without identity", "Ignore semantic content and logos."],
]) {
  test(`rejects a style-reference policy covering ${name}`, () => withCandidate(async (root) => {
    await mutateJson(root, "style.spec.json", (spec) => { spec.styleReference.contentPolicy = policy; });
    const result = await validateCandidate(root);
    assert.ok(result.errors.some((error) => error.field === "style.spec.styleReference.contentPolicy"));
  }));
}

for (const [platform, displayName] of [["wechat", "WeChat"], ["zhihu", "Zhihu"]]) {
  test(`accepts a complete ${displayName} candidate`, () => withCandidate(async (root) => {
    await configurePlatformCandidate(root, platform);
    const result = await validateCandidate(root);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.summary.platform, platform);
  }));
}

test("accepts a Weibo default candidate", () => withCandidate(async (root) => {
  await configurePlatformCandidate(root, "weibo", {
    makeDefault: true,
  });

  const result = await validateCandidate(root);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.summary.platform, "weibo");
  assert.equal(result.summary.makeDefault, true);
}));

test("accepts a Toutiao candidate at native 1672x941", () => withCandidate(async (root) => {
  await configureToutiaoCandidate(root);
  const result = await validateCandidate(root);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.summary.platform, "toutiao");
  assert.equal(result.summary.makeDefault, true);
}));

test("rejects a Toutiao candidate below the 900px short-edge floor", () => withCandidate(async (root) => {
  await configureToutiaoCandidate(root, { width: 1598, height: 899 });
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => /short edge/i.test(error.message)));
}));

test("rejects a non-boolean makeDefault intent", () => withCandidate(async (root) => {
  await mutateJson(root, "candidate.json", (candidate) => { candidate.style.makeDefault = "yes"; });
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "candidate.style.makeDefault"));
}));

test("accepts trimmed natural-language aliases", () => withCandidate(async (root) => {
  await mutateJson(root, "candidate.json", (candidate) => { candidate.style.aliases = ["编辑网格", "Editorial grid"]; });
  const result = await validateCandidate(root);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
}));

test("rejects case-insensitive duplicate aliases", () => withCandidate(async (root) => {
  await mutateJson(root, "candidate.json", (candidate) => { candidate.style.aliases = ["Editorial Grid", "editorial grid"]; });
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "candidate.style.aliases[1]"));
}));

test("rejects a duplicate registry ID", () => withCandidate(async (root) => {
  const registry = path.join(root, "registry.json");
  await writeJson(registry, { styles: [{ id: "quiet-grid", aliases: [] }] });
  const result = await validateCandidate(root, { registryPath: registry });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "duplicate-style-id"));
}));

test("rejects an invalid canvas ratio", () => withCandidate(async (root) => {
  await mutateJson(root, "style.spec.json", (spec) => { spec.canvas.ratio = "1:1"; });
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "style.spec.canvas"));
}));

test("rejects a missing bundle file", () => withCandidate(async (root) => {
  await rm(path.join(root, "prompts", "process.md"));
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "prompts/process.md" && error.code === "missing-file"));
}));

test("rejects style.md when a required section is missing", () => withCandidate(async (root) => {
  const file = path.join(root, "style.md");
  const markdown = await readFile(file, "utf8");
  await writeFile(file, markdown.replace("## Texture And Material\n\nApply subtle paper grain without reducing readability.\n\n", ""));
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "style.md.sections" && error.code === "invalid-style-contract"));
}));

test("rejects style.md when required sections are out of order", () => withCandidate(async (root) => {
  const file = path.join(root, "style.md");
  const markdown = await readFile(file, "utf8");
  const typography = "## Typography\n\nUse sturdy display type with quieter supporting text.\n\n";
  const composition = "## Composition Grammar\n\nBuild around one focal idea and balanced supporting groups.\n\n";
  await writeFile(file, markdown.replace(`${typography}${composition}`, `${composition}${typography}`));
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "style.md.sections" && error.code === "invalid-style-contract"));
}));

test("rejects style.md when a required section has no body", () => withCandidate(async (root) => {
  const file = path.join(root, "style.md");
  const markdown = await readFile(file, "utf8");
  await writeFile(file, markdown.replace("## Typography\n\nUse sturdy display type with quieter supporting text.\n\n", "## Typography\n\n### Supporting Details\n\n"));
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "style.md.sections[3]" && error.code === "empty-style-section"));
}));

test("rejects style.md when H1 differs from candidate displayName", () => withCandidate(async (root) => {
  const file = path.join(root, "style.md");
  const markdown = await readFile(file, "utf8");
  await writeFile(file, markdown.replace("# Quiet Grid", "# Different Name"));
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "style.md.h1" && error.code === "invalid-style-contract"));
}));

test("rejects a missing calibration contact sheet", () => withCandidate(async (root) => {
  await rm(path.join(root, "calibration", "contact-sheet.png"));
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "qa.contact_sheet" && error.code === "missing-file"));
}));

test("rejects an out-of-baseline safe area", () => withCandidate(async (root) => {
  await mutateJson(root, "style.spec.json", (spec) => { spec.layout.contentSafeArea.x = 81; });
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "style.spec.layout.contentSafeArea"));
}));

test("rejects a selected reference that is not byte-identical", () => withCandidate(async (root) => {
  await writeFile(path.join(root, "calibration", "style-reference.png"), png(1080, 1440, "different"));
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.code === "wrong-reference"));
}));

test("rejects a PNG that contains only a forged IHDR header", () => withCandidate(async (root) => {
  const stub = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(stub, 0);
  stub.writeUInt32BE(13, 8);
  stub.write("IHDR", 12, "ascii");
  stub.writeUInt32BE(1080, 16);
  stub.writeUInt32BE(1440, 20);
  await writeFile(path.join(root, "calibration", "style-reference.png"), stub);
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "qa.selected_reference.path" && error.code === "invalid-png"));
}));

test("rejects a PNG whose inflated scanlines contradict IHDR", () => withCandidate(async (root) => {
  await writeFile(path.join(root, "calibration", "style-reference.png"), encodePng(1080, 1440, Buffer.from([0])));
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "qa.selected_reference.path" && error.code === "invalid-png"));
}));

test("rejects duplicate PNG IHDR chunks", () => withCandidate(async (root) => {
  const malformed = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", pngHeader(1080, 1440)),
    pngChunk("IHDR", pngHeader(1080, 1440)),
    pngChunk("IDAT", deflateSync(Buffer.alloc((1080 + 1) * 1440))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  await writeFile(path.join(root, "calibration", "style-reference.png"), malformed);
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "qa.selected_reference.path" && error.code === "invalid-png"));
}));

test("rejects PNG dimensions above the validation cap", () => withCandidate(async (root) => {
  const malformed = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", pngHeader(1, 0xffffffff)),
    pngChunk("IDAT", deflateSync(Buffer.from([0]))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  await writeFile(path.join(root, "calibration", "style-reference.png"), malformed);
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "qa.selected_reference.path" && error.code === "invalid-png"));
}));

test("rejects installation before explicit approval", () => withCandidate(async (root) => {
  const result = await validateCandidate(root, { requireInstallable: true });
  assert.ok(result.errors.some((error) => error.code === "not-installable"));
}));

test("rejects an image input below the 512px signal gate", () => withCandidate(async (root) => {
  await mutateJson(root, "provenance.json", (value) => {
    value.source.width = 400;
    value.source.short_edge = 400;
  });
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "provenance.source.short_edge" && error.code === "insufficient-design-signal"));
}));

test("accepts a minimal blocked audit bundle for insufficient design signal", () => withCandidate(async (root) => {
  await mutateJson(root, "candidate.json", (candidate) => {
    candidate.status = "blocked";
    candidate.template_ready = false;
  });
  await mutateJson(root, "visual-dna.json", (dna) => {
    dna.design_signal.observable.material_texture = false;
    dna.design_signal.observable.shape_components = false;
    dna.design_signal.observable_count = 3;
    dna.design_signal.decision = "blocked";
    dna.design_signal.reason = "insufficient-design-signal";
  });
  await rm(path.join(root, "style.md"));
  await rm(path.join(root, "style.spec.json"));
  await rm(path.join(root, "qa.json"));
  await rm(path.join(root, "prompts"), { recursive: true });
  await rm(path.join(root, "calibration"), { recursive: true });
  const result = await validateCandidate(root);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.summary.status, "blocked");
}));

test("accepts a blocked audit for an image below the 512px gate", () => withCandidate(async (root) => {
  await mutateJson(root, "candidate.json", (candidate) => {
    candidate.status = "blocked";
    candidate.template_ready = false;
  });
  await mutateJson(root, "visual-dna.json", (dna) => {
    dna.design_signal.decision = "blocked";
    dna.design_signal.reason = "insufficient-design-signal";
  });
  await mutateJson(root, "provenance.json", (provenance) => {
    provenance.source.width = 400;
    provenance.source.short_edge = 400;
  });
  await rm(path.join(root, "style.md"));
  await rm(path.join(root, "style.spec.json"));
  await rm(path.join(root, "qa.json"));
  await rm(path.join(root, "prompts"), { recursive: true });
  await rm(path.join(root, "calibration"), { recursive: true });
  const result = await validateCandidate(root);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
}));

test("allows incomplete DNA-only evidence only as a draft", () => withCandidate(async (root) => {
  await mutateJson(root, "candidate.json", (candidate) => { candidate.status = "draft"; });
  await mutateJson(root, "provenance.json", (provenance) => {
    provenance.extraction_mode = "visual-dna";
    provenance.source = { kind: "provided-visual-dna" };
    provenance.confidence = null;
  });
  await mutateJson(root, "visual-dna.json", (dna) => {
    dna.design_signal.evidence_complete = false;
    dna.design_signal.missing_evidence = ["identity_analysis"];
  });
  await mutateJson(root, "qa.json", (qa) => {
    qa.reviews.originality.input_scope = "visual-dna-and-all-calibration-images";
    qa.reviews.originality.source_mode = "visual-dna";
    qa.reviews.originality.source_pixels_visible = false;
    qa.reviews.originality.limitation = "source-pixels-unavailable";
  });
  const draft = await validateCandidate(root);
  assert.equal(draft.valid, true, JSON.stringify(draft.errors));
  await mutateJson(root, "candidate.json", (candidate) => { candidate.status = "ready_for_review"; });
  const reviewable = await validateCandidate(root);
  assert.ok(reviewable.errors.some((error) => error.code === "incomplete-dna-evidence"));
}));

test("rejects non-independent review run IDs", () => withCandidate(async (root) => {
  await mutateJson(root, "qa.json", (qa) => { qa.reviews.originality.run_id = qa.reviews.style.run_id; });
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "qa.reviews.originality.run_id"));
}));

test("requires an explicit human-review acknowledgement", () => withCandidate(async (root) => {
  await assert.rejects(() => markApproved(root, { confirmedBy: "Reviewer" }), /Explicit/);
  const candidate = JSON.parse(await readFile(path.join(root, "candidate.json"), "utf8"));
  assert.equal(candidate.status, "ready_for_review");
}));

test("rejects approved human metadata on a draft", () => withCandidate(async (root) => {
  await mutateJson(root, "candidate.json", (candidate) => {
    candidate.status = "draft";
    candidate.humanApproval = { status: "approved", approvedAt: "2026-07-16T08:00:00.000Z", note: "stale approval" };
  });
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "candidate.humanApproval.status"));
}));

test("requires a UTC ISO timestamp for approval", () => withCandidate(async (root) => {
  await mutateJson(root, "candidate.json", (candidate) => {
    candidate.status = "approved";
    candidate.template_ready = true;
    candidate.humanApproval = { status: "approved", approvedAt: "2026-07-16", note: "reviewed" };
  });
  const result = await validateCandidate(root);
  assert.ok(result.errors.some((error) => error.field === "candidate.humanApproval.approvedAt"));
}));

test("marks a valid candidate approved and installable", () => withCandidate(async (root) => {
  const approval = await markApproved(root, {
    confirmHumanReview: true,
    confirmedBy: "Reviewer",
    note: "Reviewed all three structures.",
  });
  assert.equal(approval.status, "approved");
  const candidate = JSON.parse(await readFile(path.join(root, "candidate.json"), "utf8"));
  assert.equal(candidate.status, "approved");
  assert.equal(candidate.template_ready, true);
  assert.equal(candidate.humanApproval.status, "approved");
  assert.match(candidate.humanApproval.note, /Approved by Reviewer/);
  const result = await validateCandidate(root, { requireInstallable: true });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
}));

test("a temporary CODEX_HOME recovers dependencies, approves, and installs only the production subset", {
  skip: !process.env.POST_ILLUSTRATION_SKILL_ROOT,
}, async () => {
  const postRoot = path.resolve(process.env.POST_ILLUSTRATION_SKILL_ROOT);
  const candidateSource = await makeValidCandidate();
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "visual-builder-recovery-"));
  const skillsRoot = path.join(codexHome, "skills");
  const targetRoot = path.join(skillsRoot, "post-illustration-images");
  const candidateRoot = path.join(codexHome, "visual-builder-candidates", "quiet-grid");
  try {
    await mkdir(path.join(skillsRoot, "visual-dna-system", "references"), { recursive: true });
    await writeFile(
      path.join(skillsRoot, "visual-dna-system", "SKILL.md"),
      "---\nname: visual-dna-system\ndescription: Recovery fixture.\n---\n",
    );
    await writeFile(path.join(skillsRoot, "visual-dna-system", "references", "output-schema.md"), "# Schema\n");
    await writeFile(path.join(skillsRoot, "visual-dna-system", "references", "originality-guardrails.md"), "# Guardrails\n");
    await symlink(repositoryRoot, path.join(skillsRoot, "visual-builder"), "dir");

    const blocked = await checkCompanions({ codexHome });
    assert.equal(blocked.ready, false);
    assert.equal(blocked.companions.find(({ name }) => name === "post-illustration-images").status, "missing");
    await assert.rejects(stat(path.join(codexHome, "visual-builder-candidates")), { code: "ENOENT" });

    await mkdir(targetRoot, { recursive: true });
    await cp(path.join(postRoot, "SKILL.md"), path.join(targetRoot, "SKILL.md"));
    await cp(path.join(postRoot, "scripts"), path.join(targetRoot, "scripts"), { recursive: true });
    await cp(path.join(postRoot, "references"), path.join(targetRoot, "references"), { recursive: true });
    await cp(path.join(postRoot, "assets"), path.join(targetRoot, "assets"), { recursive: true });
    assert.equal((await checkCompanions({ codexHome })).ready, true);

    await mkdir(path.dirname(candidateRoot), { recursive: true });
    await cp(candidateSource, candidateRoot, { recursive: true });
    const before = await validateCandidate(candidateRoot);
    assert.equal(before.valid, true, JSON.stringify(before.errors));
    await markApproved(candidateRoot, { confirmHumanReview: true, confirmedBy: "Integration reviewer" });

    const validator = await import(pathToFileURL(path.join(targetRoot, "scripts", "validate-style-bundle.mjs")));
    const installer = await import(pathToFileURL(path.join(targetRoot, "scripts", "install-style-bundle.mjs")));
    assert.equal(validator.validateStyleBundle({ bundleDir: candidateRoot, skillRoot: targetRoot }).candidate.style.id, "quiet-grid");

    const conflict = path.join(targetRoot, "references", "styles", "quiet-grid.md");
    await writeFile(conflict, "existing file\n");
    assert.throws(
      () => installer.installStyleBundle({ bundleDir: candidateRoot, skillRoot: targetRoot }),
      /will not overwrite existing file/,
    );
    assert.equal(JSON.parse(await readFile(path.join(candidateRoot, "candidate.json"), "utf8")).status, "approved");
    await rm(conflict);

    const installed = installer.installStyleBundle({ bundleDir: candidateRoot, skillRoot: targetRoot });
    assert.equal(installed.styleId, "quiet-grid");
    assert.equal(JSON.parse(await readFile(path.join(candidateRoot, "candidate.json"), "utf8")).status, "installed");
    const registry = JSON.parse(await readFile(path.join(targetRoot, "references", "style-registry.json"), "utf8"));
    assert.equal(registry.styles.filter(({ id }) => id === "quiet-grid").length, 1);
    assert.equal(registry.styles.at(-1).provenanceFile, "references/styles/quiet-grid.provenance.json");
    assert.ok(validator.validateInstalledRegistry({ skillRoot: targetRoot }).styles > 0);
    await readFile(path.join(targetRoot, "references", "styles", "quiet-grid.md"));
    await readFile(path.join(targetRoot, "references", "styles", "quiet-grid.spec.json"));
    await readFile(path.join(targetRoot, "references", "styles", "quiet-grid.provenance.json"));
    await readFile(path.join(targetRoot, "assets", "style-references", "quiet-grid.png"));
    for (const candidateOnlyPath of ["candidate.json", "visual-dna.md", "visual-dna.json", "qa.json", "prompts", "calibration"]) {
      await assert.rejects(stat(path.join(targetRoot, candidateOnlyPath)), { code: "ENOENT" });
    }
  } finally {
    await rm(candidateSource, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});
