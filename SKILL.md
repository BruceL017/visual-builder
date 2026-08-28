---
name: visual-builder
description: >-
  Orchestrate the complete human-gated pipeline that turns a user-supplied designed image or visual_dna_system document into a debranded, platform-specific illustration style, calibrates it across concept, process, and checklist structures, and registers it with the local post-illustration-images skill after approval. Use only when explicitly invoked as $visual-builder. Do NOT use for ordinary image editing, one-off image generation, natural-photo presets, logo extraction, pixel-identical cloning, or installing an unreviewed style.
metadata:
  version: "0.2.0"
  author: "BruceL017"
  updated_at: "2026-08-28"
  origin: "own"
  allow_exec: true
---

# Visual Builder

Build and register a reusable style from visual evidence without carrying over its identity or subject. Treat the reference as evidence for visual grammar, never as a generation reference or a source to imitate literally.

## Companion Preflight

Resolve `VisualBuilderRoot` to the directory containing this `SKILL.md`; a normal installation uses `${CODEX_HOME:-$HOME/.codex}/skills/visual-builder`. Use that absolute root for every Visual Builder script. Run this preflight before validating inputs, resolving a candidate path, or creating any candidate files:

```bash
node <visual-builder>/scripts/check-companions.mjs --json
```

The complete pipeline requires all three local skills under `${CODEX_HOME:-$HOME/.codex}/skills`: `visual-dna-system`, `visual-builder`, and `post-illustration-images`. The downstream skill must also contain `scripts/validate-style-bundle.mjs` and `scripts/install-style-bundle.mjs`. The read-only preflight also requires the `rsvg-convert` executable from `librsvg` because contact-sheet rendering depends on it.

After a successful check, set `VisualBuilderRoot` and `PostIllustrationRoot` from the corresponding `realRoot` values. Use these canonical paths for every CLI invocation so symlink-based installations execute their entrypoints correctly.

When preflight reports a missing or invalid skill:

1. Stop before extraction or candidate creation and report all failures together.
2. Show the exact official `repo`, `path`, and `name` returned by the checker for only the failed skills.
3. Ask once for permission to install them with the system `skill-installer`. Do not install from another source or silently fall back.
4. After explicit permission, install only the failed skills and rerun the checker. Continue in the same task when it reports `ready: true`; otherwise stop with `companion-unavailable`.
5. If a newly installed companion was not in the task's initial skill catalog, read its verified `SKILL.md` completely before using it in the current task.

When the skill files pass but a runtime in `runtimes` is missing, stop before candidate creation and report its `command`, `package`, and `purpose`. Ask the user to install that system package, then rerun preflight and continue only when it is ready. Do not attempt to install a system package with `skill-installer` or treat reinstalling `visual-builder` as a fix.

The official sources are `BruceL017/visual-dna-skills` at `skills/visual-dna-system`, `BruceL017/visual-builder` at `.`, and `BruceL017/post-illustration-images` at `.`. Never create the candidate library as a side effect of preflight.

## Inputs

For a new candidate, require all named inputs before compiling:

- `input_mode`: `image` or `visual-dna`.
- `source`: readable image path for `image`, or JSON/Markdown containing a `visual_dna_system` object for `visual-dna`.
- `target_platform`: exactly `wechat`, `xhs`, `zhihu`, `weibo`, or `toutiao`; never infer it from the source ratio.
- Optional overrides before review: `style_id`, `display_name`, `purpose`, `aliases`, `default_use`, `brand_default_enabled`, and `make_default`. Map `purpose` only to `style.md` `## Purpose`; map `default_use` to `candidate.style.defaultUse` and the registry's `defaultUse`. Map `make_default` to optional `candidate.style.makeDefault`; omit it or use `false` unless the user explicitly requests this style as the platform default.

Write new candidates only to `${CODEX_HOME:-$HOME/.codex}/visual-builder-candidates/<style_id>`. Do not accept an alternate output root for a new candidate. Refuse to overwrite an existing style directory; treat an existing directory as a resume request only when the user identifies that candidate.

For a resume request, require either a `style_id`, resolved only under the fixed candidate library, or an explicit absolute path to a legacy candidate. Do not search other directories. If both inputs identify different candidates, stop and request one unambiguous target.

Use these authoritative platform design coordinate systems. They define layout geometry, not required delivery pixels:

| `target_platform` | Canvas | Ratio | Target style platform |
| --- | ---: | ---: | --- |
| `wechat` | 1600 x 1200 | 4:3 | `wechat` |
| `xhs` | 1080 x 1440 | 3:4 | `xiaohongshu` |
| `zhihu` | 1600 x 900 | 16:9 | `zhihu` |
| `weibo` | 1080 x 1440 | 3:4 | `weibo` |
| `toutiao` | 1600 x 900 | 16:9 | `toutiao` |

Accepted calibration rasters preserve native pixel dimensions when their ratio is within `0.002`. Toutiao additionally requires a shortest edge of at least `900px`; `1672 x 941` is valid.

## Outputs And Done

Write one candidate bundle at `${CODEX_HOME:-$HOME/.codex}/visual-builder-candidates/<style_id>/` with this shape:

```text
candidate.json
visual-dna.md
visual-dna.json
style.md
style.spec.json
provenance.json
prompts/
  concept.md
  process.md
  checklist.md
calibration/
  concept.png
  process.png
  checklist.png
  style-reference.png
  contact-sheet.png
qa.json
```

Use statuses `draft`, `ready_for_review`, `approved`, `installed`, or `blocked`. Read [candidate-contract.md](references/candidate-contract.md) before creating or changing a bundle.

Define **candidate done** as: the complete bundle validates, all three calibration images pass QA, and status is `ready_for_review`. Explicit human approval authorizes both the guarded `approved` transition and immediate downstream installation; it does not require a second confirmation. Define **workflow done** as: the target installer succeeds, its registry and generated index agree, and status is `installed`. If downstream validation or installation fails after approval, keep status `approved`, report the blocker, and do not describe the style as installed or production-ready. Never describe a draft or merely generated bundle as done.

## Resume By Status

An image-mode resume that will repeat extraction, compilation, generation, QA, or originality review requires the user to provide the source image again. Before changing the candidate, hash the supplied image and require its SHA-256 and dimensions to match `provenance.json`; stop with `source-mismatch` when they differ. Never store a source path as a substitute because temporary paths are not durable. An approval-only or installed-state verification does not require source pixels.

- `draft`: continue only the failed or incomplete stage, then rerun affected QA and validation.
- `ready_for_review`: present the three calibration images and contact sheet, then wait for explicit human approval.
- `approved`: validate and install immediately; do not request approval again.
- `installed`: run `node <post-skill>/scripts/validate-style-bundle.mjs --installed --skill-root <post-skill>`, then require exactly one matching `style_id` in `references/style-registry.json`; report completion without reinstalling.
- `blocked`: report the recorded reason and required new evidence; do not bypass the gate.

## Guarded Procedure

CREATE A TODO LIST FOR THE TASKS BELOW and update it while running. Stop at the first failed gate; record the failure instead of improvising around it.

- [ ] Pass the strict three-skill companion preflight.
- [ ] Confirm named inputs and explicit `target_platform`.
- [ ] Extract or validate Visual DNA.
- [ ] Pass the design-signal and source-integrity gates.
- [ ] Suggest and confirm debranded candidate metadata.
- [ ] Compile debranded style documents and platform geometry.
- [ ] Generate the three neutral calibration images independently.
- [ ] Run machine QA and select the best unbranded reference.
- [ ] Validate the candidate bundle.
- [ ] Obtain explicit human approval.
- [ ] Mark approved, invoke the target skill installer, and revalidate its registry.

### 1. Acquire Visual DNA

For `image` mode:

1. Verify the source is a designed artifact, readable, and at least 512 px on its shortest edge.
2. Use the required `visual-dna-system` skill to extract its complete five-part output. Preserve the normalized design system as `visual-dna.md` and `visual-dna.json`; there is no built-in extraction fallback.
3. Assess all six design signals plus source scope and identity dominance. Absence of a signal is `false`, not missing evidence. Do not invent unsupported visual facts. If the readable image does not support a complete assessment or fails the signal gate, follow the existing blocked or extraction-failure path instead of weakening the contract.
4. Hash the original with SHA-256 and write the complete image-mode `provenance.json` from [candidate-contract.md](references/candidate-contract.md), including schema version, source hash and dimensions, confidence, `original_retained: false`, and `used_as_generation_reference: false`.
5. Run the existing image-mode originality review with the source pixels visible to that review. Do not copy, embed, upload, or retain the original image in the candidate or target skill.

For `visual-dna` mode:

1. Require a non-empty top-level `visual_dna_system` object in JSON or an unambiguous fenced JSON object in Markdown.
2. Preserve the normalized object in both Visual DNA files and record `extraction_mode: "visual-dna"`.
3. Treat missing evidence as unknown. Do not invent source dimensions, identity analysis, or confidence.
4. Record `design_signal.evidence_complete` and the supported `missing_evidence` keys.

### 2. Enforce The Design-Signal Gate

Evaluate exactly six signals: color roles, typography hierarchy, composition, shape components, material/texture, and illustration/icon language. Require at least four observable signals.

Block with `status: "blocked"`, `template_ready: false`, and reason `insufficient-design-signal` when any condition holds:

- fewer than four signals are observable;
- an image's shortest edge is below 512 px;
- a logo, brand name, mascot, signature icon, or other identity element dominates the artifact;
- the input is a natural photo, pure logo, blurry crop, or content fragment without a reusable design system;
- fewer than four design signals are evidenced, even in DNA-only mode.

Do not produce `style.md`, prompts, or calibration images after a hard gate fails. A blocked bundle may contain only the audit files required by [candidate-contract.md](references/candidate-contract.md).

DNA-only input with at least four signals and no dominant identity may continue as a full `draft` when key evidence is missing. It must list those gaps, cannot become `ready_for_review`, and cannot be approved or installed. After the user supplies the missing evidence, normalize the DNA again, rerun affected compilation and QA, then validate before changing status.

### 2.5 Suggest Candidate Metadata

When overrides are absent, derive a generic two-to-four-token `style_id`, a concise display name, `purpose`, `default_use`, and zero or more natural-language aliases from the debranded DNA. Default `makeDefault` to false or omit it; only set it to true from an explicit user request. Do not reuse source brands, titles, proper nouns, topics, or identity-bearing motifs. Check the target registry for case-insensitive ID/alias conflicts when it is available. Write the suggestions into the candidate and `style.md`; the user may change them before approval. Revalidate after any change, and rebuild paths/prompts/QA when `style_id` or brand default changes.

### 3. Compile Without Identity Leakage

Read [compiler.md](references/compiler.md). Preserve mood, color relationships, typography character, whitespace density, material treatment, component language, illustration/icon language, and composition grammar.

Always remove or generalize:

- logos, brand names, watermarks, mascots, signatures, and unique icons;
- source copy, proper nouns, claims, numbers, topic, and narrative;
- exact layout coordinates and a full exact palette;
- product-specific navigation, forms, controls, motion, and interaction behavior;
- copyrighted characters or a living artist's identity.

Never pass the source image to a generation backend. Never ask for “the same image,” pixel matching, or literal reconstruction. Use the compiled text-only style contract for generation.

Compile `style.md` and a target-compatible `style.spec.json`. Derive the design coordinate system, content safe area, brand reserved area, and brand slot from the platform baseline, not from the source. Include:

```json
"brandPolicy": {
  "defaultEnabled": true,
  "userOverrideAllowed": true
}
```

Allow `defaultEnabled: false` only when the user changes it before approval. Keep a valid brand slot either way. Set `styleReference.isGenerationInput` to `false` and its final path to `assets/style-references/<style_id>.png`.

### 4. Calibrate Across Three Structures

Resolve image generation by capability, not by credential variable name or provider label. Accept a callable runtime-native backend or an already-configured API adapter, including third-party endpoints and third-party keys. Names such as `openai-compatible` or `OPENAI_API_KEY` describe an adapter dialect only; they never prove that the endpoint or credential was issued by OpenAI, and an official OpenAI key must not be required. For a configured API adapter, resolve its active endpoint and credential context explicitly; a runtime-native tool needs only callable image capability and current-request artifact verification. In both cases verify an image-capable model and its platform-compatible geometry, and never persist or print credential values. Use non-billable model metadata when the backend supports it, then treat the first readable, current-request raster artifact as the capability canary. Generate images two and three only after that canary passes artifact, aspect-ratio, single-meaning, fixed-area, and any platform minimum-edge checks. Preserve accepted native pixels; never crop, pad, stretch, upscale, or force them to the design coordinate dimensions.

Create new, neutral subject matter unrelated to the source. Compile and save one text-only prompt per structure:

- `concept`: explain one abstract concept with a focal relationship.
- `process`: show a clear three- or four-step directional sequence.
- `checklist`: show a scannable set of four or five parallel items.

Generate each image independently at the platform ratio. Record backend, model, actual output dimensions, and prompt path in `qa.json`, using the existing candidate schema. The three prompts must share the style contract but not a fixed composition. Do not place production branding or page numbers in calibration images. When `brandPolicy.defaultEnabled` is true, keep the platform brand area naturally quiet; when false, that area is inactive and receives no reservation instruction.

### 5. Review And Select

Read [qa.md](references/qa.md). Score every image independently for color, typography, texture, illustration, spacing, composition, and cross-content adaptability. Require every dimension to be at least 75, every image total to be at least 85, and the three-image average to be at least 88. Require all hard checks to pass.

Choose the highest-total passing image, copy it byte-for-byte to `calibration/style-reference.png`, and record both paths in `qa.selected_reference`. A tie resolves in the stable order `concept`, `process`, `checklist`. Run `node <visual-builder>/scripts/build-contact-sheet.mjs --concept <path> --process <path> --checklist <path> --output calibration/contact-sheet.png`, then record it as `qa.contact_sheet`. The reference must be unbranded and is for QA/failure review only.

Run:

```bash
node <visual-builder>/scripts/validate-candidate.mjs /absolute/path/to/candidate
```

Set status to `ready_for_review` only after validation succeeds and `design_signal.evidence_complete` is true. Present all three images plus the selected reference to the user. Do not infer approval from silence, previous approval, or a request to “finish.”

### 6. Approve And Install

After the human explicitly confirms the candidate, run:

```bash
node <visual-builder>/scripts/mark-approved.mjs /absolute/path/to/candidate \
  --confirm-human-review \
  --confirmed-by "<reviewer>"
```

After `mark-approved.mjs` succeeds, use the preflight-verified canonical `PostIllustrationRoot`. Explicit approval is also installation authorization, so do not ask again. Run the target validator first, then its installer with the exact same approved bundle. Do not use another similarly named directory, manually copy files, or edit its registry:

```bash
node <post-skill>/scripts/validate-style-bundle.mjs \
  --bundle /absolute/path/to/candidate \
  --skill-root /absolute/path/to/post-illustration-images

node <post-skill>/scripts/install-style-bundle.mjs \
  --bundle /absolute/path/to/candidate \
  --skill-root /absolute/path/to/post-illustration-images
```

Installation must refuse overwrites and roll back files created by a failed attempt. Do not install when validation fails, status is not `approved`, or `template_ready` is not `true`.

The complete candidate remains in the fixed candidate library. The downstream installer stores only its production subset: style Markdown, style spec, provenance, selected reference image, registry entry, and generated index.

## Examples

Good requests:

- “Use `$visual-builder` with this knowledge card to build and register an XHS illustration style; remove its brand and keep the paper texture and editorial hierarchy.”
- “Use `$visual-builder` to compile this `visual_dna_system` JSON into a WeChat style, generate the three calibration structures, and stop for my approval.”
- “Use `$visual-builder` to resume candidate `quiet-grid`; I reviewed and approve its calibration images.”

Expected handling:

- A clear poster with five observable signals becomes a debranded candidate at the explicit platform geometry.
- A valid DNA document with only three evidenced signals remains blocked; do not fill the fourth from guesswork.
- A candidate with passing machine scores remains `ready_for_review` until the user explicitly approves it.

Bad requests and required response:

- “Turn this holiday photo into a reusable design template.” -> Return `insufficient-design-signal`; suggest supplying a designed layout.
- “Copy this branded campaign exactly, including logo and slogan.” -> Refuse literal/identity copying; offer debranded visual abstraction.
- “Pick whatever platform fits the image.” -> Ask for `wechat`, `xhs`, `zhihu`, `weibo`, or `toutiao`; do not infer.
- “Install the first generated result; no need to review.” -> Stop before approval because three-image QA and human confirmation are mandatory.

## Failure Handling

- Missing/ambiguous input: stop and request only the missing named input.
- Missing/invalid companion or runtime: stop before candidate creation; install skills only from their official sources with `skill-installer`, install `librsvg` through the system package manager when its runtime is missing, and rerun preflight.
- Image-mode resume source missing or mismatched: do not modify the candidate; request the original source again and verify its hash and dimensions against provenance.
- Extraction failure: do not create a candidate bundle or claim a valid `blocked` state for a new candidate; report the extractor diagnostics in the task and stop. On resume, leave the existing draft unchanged. Use `blocked` only for the schema-defined `insufficient-design-signal` decision.
- Generation failure: keep successful artifacts, remain `draft`, and regenerate only the failed structure.
- QA failure: remain `draft`; revise the compiler contract or failed prompt, then regenerate affected calibration images. Never edit scores to pass.
- Validation failure: report exact error paths from the validator and repair the bundle before review.
- Human rejection: keep `template_ready: false`, record the note, and return to the requested stage.
- Duplicate style ID or installer failure: do not overwrite; keep status `approved`, report the conflict, and leave the target skill unchanged.

## Resources

- [candidate-contract.md](references/candidate-contract.md): bundle schemas, lifecycle invariants, and platform geometry.
- [compiler.md](references/compiler.md): Visual DNA-to-template mapping and debranding rules.
- [qa.md](references/qa.md): calibration content, scoring rubric, hard checks, and approval policy.
- `scripts/build-contact-sheet.mjs`: deterministic three-image review sheet renderer.
- `scripts/check-companions.mjs`: read-only strict dependency preflight with machine-readable output.
- `scripts/validate-candidate.mjs`: deterministic bundle validator; add `--json` for machine-readable output and `--registry <path>` for duplicate checks.
- `scripts/mark-approved.mjs`: guarded human-approval transition; it never installs a template.
