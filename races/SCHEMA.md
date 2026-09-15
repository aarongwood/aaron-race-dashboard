# Race packet contract

Each report is driven by one UTF-8 JSON file in `races/`. The filename should match `slug`.

## Required top-level fields

- `slug`: lowercase URL-safe identifier, for example `chicago-marathon-2026`.
- `athlete`, `raceName`, `date`, `location`.
- `title`, `deck`, `verdict`: the editorial thesis of the report.
- `facts`: at least three verified result cards.
- `sections`: at least two sections. One section must use the exact id `race-execution`; this guarantees the stable `#race-execution` deep link for every race.

Optional presentation fields include `displayDate`, `pageTitle`, `description`, `kicker`, `subtitle`, `edition`, `sources`, `sourceNote`, and `footerNote`.

## Supported content blocks

- `paragraph`: `{ "type": "paragraph", "text": "..." }`
- `quote`: `{ "type": "quote", "text": "..." }`
- `callout`: `{ "type": "callout", "tone": "success", "title": "...", "text": "..." }`
- `table`: `{ "type": "table", "columns": [...], "rows": [{ "cells": [...], "highlight": true }] }`
- `metrics`: `{ "type": "metrics", "items": [{ "label": "...", "value": "...", "note": "..." }] }`
- `list`: `{ "type": "list", "ordered": false, "items": [...] }`
- `cards`: `{ "type": "cards", "items": [{ "label": "...", "title": "...", "text": "..." }] }`
- `timeline`: `{ "type": "timeline", "items": [{ "label": "...", "value": "...", "note": "...", "highlight": true }] }`

Text fields support restrained inline Markdown: `**bold**`, `*emphasis*`, `` `code` ``, and `[label](https://example.com)`.

## Evidence standard

Facts must distinguish:

1. Official or organizer-posted results.
2. Device-measured data.
3. Athlete-reported experience.
4. Derived calculations.
5. Coaching interpretation.

Do not promote predictions, provisional entries, watch estimates, or unverified course claims into official results.
