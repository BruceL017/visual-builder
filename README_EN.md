# Visual Builder

[中文](README.md) | English

Visual Builder is a Codex orchestration skill for onboarding reusable visual styles. It converts a user-supplied designed image or an existing `visual_dna_system` document into a debranded, platform-specific illustration style candidate, calibrates it across three structures, and registers it with local `post-illustration-images` after explicit human approval.

It extracts reusable visual grammar instead of reproducing the source pixel for pixel. Brands, subject matter, copy, proper nouns, and identity-bearing elements from the source are excluded from the resulting template.

## Installation And Required Skills

Install Visual Builder with Codex's built-in `skill-installer`:

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo BruceL017/visual-builder \
  --path . \
  --name visual-builder
```

Contact-sheet rendering also requires `rsvg-convert` from `librsvg` on the system `PATH`. On macOS with Homebrew, run `brew install librsvg`. Preflight verifies the executable before creating a candidate.

The complete pipeline requires all three local skills:

| Position | Skill | Role |
| --- | --- | --- |
| Upstream | [`visual-dna-system`](https://github.com/BruceL017/visual-dna-skills) | Extracts complete, debranded Visual DNA from designed images |
| Current | `visual-builder` | Compiles, calibrates, validates, and manages human approval |
| Downstream | [`post-illustration-images`](https://github.com/BruceL017/post-illustration-images) | Registers approved styles and uses them for production illustrations |

Install the upstream extraction skill:

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo BruceL017/visual-dna-skills \
  --path skills/visual-dna-system \
  --name visual-dna-system
```

Install the downstream production skill:

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo BruceL017/post-illustration-images \
  --path . \
  --name post-illustration-images
```

Each explicit `$visual-builder` invocation checks all three skills, the downstream validator and installer, and `rsvg-convert`. If anything is missing, the workflow stops before candidate creation. Missing skills report their official sources and request installation permission; a missing runtime reports its system package. After a passing recheck, the workflow continues in the same task. There is no built-in fallback.

## Core Capabilities

- Accept designed images or Visual DNA documents as input.
- Evaluate design signals across color, typography, composition, shapes, material, and illustration language.
- Compile debranded style documents, structured specifications, and text-only prompts.
- Generate separate calibration images for concept, process, and checklist structures.
- Validate dimensions, file integrity, PNG structure, review scores, and safety constraints.
- Require explicit human review before a candidate can be approved and installed.

## Supported Platforms

| Platform | Design coordinate system | Ratio | Orientation |
| --- | ---: | ---: | --- |
| WeChat | 1600 x 1200 | 4:3 | Horizontal |
| Xiaohongshu | 1080 x 1440 | 3:4 | Vertical |
| Zhihu | 1600 x 900 | 16:9 | Horizontal |
| Weibo | 1080 x 1440 | 3:4 | Vertical |
| Toutiao | 1600 x 900 | 16:9 | Horizontal |

These dimensions define layout coordinates. Calibration images that pass the ratio check preserve their native pixels without cropping, padding, stretching, or forced resizing. Toutiao images must also have a shortest edge of at least 900 pixels.

## Workflow

1. Check all three local skills and the contact-sheet runtime; with permission, install missing dependencies and recheck.
2. Confirm the input mode, source, and explicit target platform.
3. Use `visual-dna-system` to extract or validate Visual DNA and pass the design-signal and source-integrity gates.
4. Suggest debranded candidate metadata such as name, purpose, and aliases.
5. Compile the style contract, platform geometry, prompts, and candidate metadata.
6. Generate independent concept, process, and checklist calibration images.
7. Run machine QA, select the best reference, and build a contact sheet.
8. Validate the complete bundle and stop for human review.
9. Explicit approval immediately marks the candidate approved, validates it downstream, and registers it; success changes the status to `installed`.

## Candidate Bundle

```text
${CODEX_HOME:-$HOME/.codex}/visual-builder-candidates/<style_id>/
├── candidate.json
├── visual-dna.md
├── visual-dna.json
├── style.md
├── style.spec.json
├── provenance.json
├── prompts/
│   ├── concept.md
│   ├── process.md
│   └── checklist.md
├── calibration/
│   ├── concept.png
│   ├── process.png
│   ├── checklist.png
│   ├── style-reference.png
│   └── contact-sheet.png
└── qa.json
```

Candidate states progress through `draft`, `ready_for_review`, `approved`, and `installed`; failed hard gates use `blocked`. Generated does not mean reviewed, and machine validation does not replace explicit human approval.

Human approval also authorizes downstream validation and installation, so there is no second registration confirmation. A failed installation leaves the complete candidate in the fixed library with status `approved`; a successful installation changes it to `installed`. The downstream skill stores only the style Markdown, spec, provenance, selected reference, registry entry, and generated index, not the Visual DNA, prompts, QA, or full calibration set.

## Usage

This skill runs only when explicitly invoked as `$visual-builder`. For example:

```text
Use $visual-builder to turn this 1080 x 1440 knowledge card into a Xiaohongshu illustration style.
Remove the original branding and copy, preserve the paper texture, editorial hierarchy, and whitespace rhythm, stop after the three calibration images, then register the style locally after I approve it.
```

Required inputs:

- `input_mode`: `image` or `visual-dna`
- `source`: an image path or JSON/Markdown containing `visual_dna_system`
- `target_platform`: `wechat`, `xhs`, `zhihu`, `weibo`, or `toutiao`

New candidates always use `${CODEX_HOME:-$HOME/.codex}/visual-builder-candidates/<style_id>`. To resume across tasks, provide the `style_id`; an absolute path can resume a legacy candidate. Visual Builder does not search other directories or overwrite an existing candidate.

## Local Validation

Run the test suite:

```bash
node --test tests/*.test.mjs
```

Run the cross-repository v2 temporary-install check against a local `post-illustration-images` repository:

```bash
POST_ILLUSTRATION_SKILL_ROOT=/path/to/post-illustration-images node --test tests/validate-candidate.test.mjs
```

When `POST_ILLUSTRATION_SKILL_ROOT` is unset, the corresponding cross-repository integration test is skipped and the remaining tests run normally.

Check the three local skills:

```bash
node scripts/check-companions.mjs --json
```

Validate a candidate bundle:

```bash
node scripts/validate-candidate.mjs /absolute/path/to/candidate
```

Mark a candidate approved after human review:

```bash
node scripts/mark-approved.mjs /absolute/path/to/candidate \
  --confirm-human-review \
  --confirmed-by "<reviewer>"
```

## Guardrails

- Never send the source image to the image-generation backend.
- Never copy source brands, logos, watermarks, characters, source copy, or unique identity elements; originality QA also rejects any unrelated or fabricated third-party logo, logo-like mark, watermark, or signature.
- Never treat a natural photo, standalone logo, or content without a reusable design system as a valid template source.
- Never infer the target platform from the source aspect ratio; the user must choose it explicitly.
- Never install a candidate without all three calibration images, machine QA, and human review.
- Never use the selected calibration reference as a generation input.

See [candidate-contract.md](references/candidate-contract.md), [compiler.md](references/compiler.md), and [qa.md](references/qa.md) for the complete behavior contract, compilation rules, and QA requirements.
