# Run Coach workspace

This repository powers Aaron's public Run Coach and race-reporting system.

## Canonical destinations

- Public dashboard: https://aarongwood.github.io/aaron-race-dashboard/
- Browser studio: https://aarongwood.github.io/aaron-race-dashboard/studio/
- Source repository: https://github.com/aarongwood/aaron-race-dashboard
- Default branch: `main`

## Working rules

- Treat `races/*.json` as the canonical race records and generated files under
  `reports/` as derived output.
- Preserve the pre-race and post-race lifecycle, the historical ledger, and the
  stable `#race-execution` link described in `README.md`.
- Do not invent race results, splits, physiological metrics, competitors,
  footwear, or athlete observations. Keep source-quality labels intact.
- Use `races/brielle-2026.json` as the fully enriched reference implementation.
- Keep credentials and private health data out of race records and generated
  pages.
- Do not publish or push without an explicit request. The local Studio's
  publish flow requires the user to type `PUBLISH` intentionally.
- Before proposing a release, run `npm test` and confirm generated reports are
  unchanged unless the task intentionally updates them.

## Common commands

- Start the local Studio: `npm run studio`
- Validate all race data and reports: `npm test`
- Regenerate all reports: `npm run build`
- Create a race record: `npm run race -- new <slug>`
- Validate one race: `npm run race -- validate races/<slug>.json`
- Build one race: `npm run race -- build races/<slug>.json`

Read `README.md` for the editorial workflow and `races/SCHEMA.md` before
changing the race-record format.
