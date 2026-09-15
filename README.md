# Aaron Race Report Factory

This repository now has two jobs:

1. Preserve the original Brielle victory report at the existing root URL, including `#race-execution`.
2. Generate the same class of evidence-driven report for every future race from one structured race packet.

## The Easy Button

On Aaron's Linux or Mac checkout:

```bash
npm run studio
```

Open `http://127.0.0.1:4173/studio/`.

The studio has four deliberate actions:

1. Load the blank template or Brielle example.
2. Paste or edit one race packet.
3. Press **Generate report** and review the preview.
4. Type `PUBLISH` and press **Publish to GitHub Pages**.

The publish button stages and commits only:

- `races/<slug>.json`
- `reports/<slug>/index.html`
- `reports/index.html`

It refuses to publish when unrelated files are already staged.

## Lowest-effort ChatGPT/Codex workflow

After a race, provide the result page or screenshots, Garmin evidence, your subjective report, and any photos. Then use this request:

> Build my final race report using the Aaron Race Report Factory in `aarongwood/brielle-2026-race-report`. Reconcile the official result, competitive field, Garmin/FIT data, my athlete report, progression and next steps. Create one valid race packet under `races/`, run the tests, build the report, show me the preview, and wait for my approval before publishing.

That is the real easy button: Aaron supplies evidence and experience; the program enforces structure, validation, consistent presentation and publishing boundaries.

## Command-line workflow

```bash
# Create a starter packet
npm run race -- new chicago-marathon-2026

# Validate it
npm run race -- validate races/chicago-marathon-2026.json

# Generate the report and archive
npm run race -- build races/chicago-marathon-2026.json

# Run all validation and build tests
npm test

# Publish after review; the command requires typing PUBLISH
npm run race -- publish races/chicago-marathon-2026.json

# Explicit non-interactive automation only
npm run race -- publish races/chicago-marathon-2026.json --yes
```

Generated URLs follow this stable pattern:

- Report: `https://aarongwood.github.io/brielle-2026-race-report/reports/<slug>/`
- Race execution: `https://aarongwood.github.io/brielle-2026-race-report/reports/<slug>/#race-execution`
- Archive: `https://aarongwood.github.io/brielle-2026-race-report/reports/`

The original Brielle URLs remain unchanged.

## Post-race intake checklist

The richest report needs five evidence groups:

- Official result: time, pace, bib, placements, division, field size and awards.
- Competitive context: leading finishers, gaps, expected challengers and course conditions.
- Garmin/FIT: elapsed and timer time, splits, HR, power, elevation, Training Effect and running dynamics.
- Athlete report: freshness, RPE, pain, form, decisive moments, shoe and fueling.
- Historical comparison: prior bests, recent training, progression, goals and what the result changes.

See [`races/SCHEMA.md`](races/SCHEMA.md) for the exact packet contract.

## Design and safety guarantees

- Every report is mobile responsive and print/PDF friendly.
- Every report has a stable `#race-execution` anchor.
- User-entered text is HTML-escaped before restrained inline Markdown is applied.
- Unsupported block types fail the build.
- A packet cannot overwrite another race unless it uses the same slug intentionally.
- Publishing requires an explicit confirmation in the studio.
- Command-line publishing requires an interactive `PUBLISH` confirmation unless automation deliberately supplies `--yes`.
- No credentials are stored in the site or packet files.
