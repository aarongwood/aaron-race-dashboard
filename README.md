# Aaron’s Race Desk

This is a repeatable **before-and-after race reporting system**, not a blank report editor.

One permanent race record begins when a race enters Aaron’s calendar and closes after the official result is diagnosed. The system turns that record into two consistent editions:

1. **Pre-race plan:** overview, purpose, logistics, course/weather, competitive field, segment-by-segment strategy, readiness gate, fueling, hydration, footwear and sources.
2. **Post-race analysis:** official result, placement percentiles, race execution, competitive impact, aerobic diagnosis, form under pressure, success factors, progression, opportunities, future goals and next step.

Both editions use the Brielle visual language and preserve the stable `#race-execution` deep link.

## The easy-button workflow

From this repository:

```bash
git pull --ff-only
npm run studio
```

Open `http://127.0.0.1:4173/studio/`.

### Before the race

1. Press **New race**.
2. Paste the official race URL and press **Pull race basics**. The importer uses public page metadata where available; review the result.
3. Complete the pre-race form. Repeating rows use one pipe-delimited entry per line and show their format directly below the field.
4. Press **Generate pre-race report** and review it.
5. Type `PUBLISH` only when it is ready to go live.

### After the race

1. Select the same race under **Saved races**.
2. Press **Post-race analysis**.
3. Add official results, leading competitors, device splits and metrics, the athlete report, progression and future targets.
4. Press **Generate post-race report**. The pre-race edition remains intact, while the race’s main URL becomes the final report.
5. Review, type `PUBLISH`, and publish.

## Permanent URL pattern

For a slug such as `brielle-2026`:

- Current edition: `/reports/brielle-2026/`
- Preserved pre-race plan: `/reports/brielle-2026/pre-race/`
- Preserved post-race analysis: `/reports/brielle-2026/post-race/`
- Stable execution link on either edition: `#race-execution`
- Archive: `/reports/`

Before results are entered, the current edition is the pre-race plan. Once the post-race status becomes final, the current edition switches to the post-race analysis.

## What is automated

- A public race-page importer reads common Event JSON-LD and page metadata to prefill race name, date, time, distance and location when exposed.
- The fixed report templates assemble every required pre- and post-race section.
- Placement percentiles are calculated from official place and field size.
- The same race record carries goals and predictions into the post-race comparison.
- HTML is escaped before restrained inline Markdown is applied.
- Build validation prevents a final post-race report without an official time and result summary.
- Publishing refuses to run with unrelated files already staged.

The importer is deliberately evidence-conservative: it never turns an entry-list prediction or device estimate into an official result. Dynamic race sites may expose only a title; those fields remain for Aaron or Codex to complete.

## Command line

```bash
npm run race -- new chicago-marathon-2026
npm run race -- validate races/chicago-marathon-2026.json
npm run race -- build races/chicago-marathon-2026.json
npm test
npm run race -- publish races/chicago-marathon-2026.json
```

Use `npm run studio` for normal operation. The JSON commands are an advanced escape hatch.

## Publishing boundary

The Studio stages only:

- `races/<slug>.json`
- `reports/<slug>/index.html`
- `reports/<slug>/pre-race/index.html`
- `reports/<slug>/post-race/index.html` when final
- `reports/index.html`

No credentials are stored in race records or generated pages.

## Brielle as the reference implementation

`races/brielle-2026.json` contains both the actual pre-race intelligence and the final 44:11.6 age-group-winning diagnosis. Load **Brielle example** in the Studio to see the full lifecycle populated.

The original hand-built Brielle victory page remains at the repository root.
