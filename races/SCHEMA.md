# Canonical two-stage race record

Every file in `races/` is a complete lifecycle record with `schemaVersion: 2`.

## Identity and race facts

- `slug`: lowercase URL-safe ID; it does not change when the race moves from planning to results.
- `athlete`: Aaron Greenwood by default.
- `race`: name, distance, date, start time, timezone, location, venue, priority, purpose, course type, surface, certification status and official URLs.

## `preRace`

The pre-race phase includes:

- editorial headline, deck and verdict;
- target time, pace and power plus A/B/C goal hierarchy;
- race-day outlook and health guardrails;
- course and weather diagnosis;
- field size, age-group size, field read and contenders;
- segment-level strategy (`segment`, `pace`, `power`, `cue`);
- Green/Yellow/Red readiness rules;
- operational timeline, bib pickup, parking, arrival and warm-up;
- shoes, fuel, hydration and equipment notes;
- evidence sources.

`preRace.status` is `draft` or `final`.

## `postRace`

The post-race phase includes:

- official and device time, official pace and bib;
- age-group, overall and male place/field-size pairs;
- margin, ascent, improvement and record label;
- result thesis and certification caveat;
- leading competitor results;
- execution story and split/terrain evidence;
- heart rate, power and aerobic diagnosis;
- race-wide and closing running dynamics plus form diagnosis;
- athlete experience, pain/injury report and race shoes;
- success factors, opportunities, progression, future goals and immediate next step;
- evidence sources.

`postRace.status` remains `pending` until the report is final. A final post-race record requires `officialTime` and `resultSummary`.

## Evidence hierarchy

1. Official or organizer-posted results control time and placement.
2. Device data explains splits, physiology, terrain and mechanics.
3. Aaron’s report controls felt experience, pain and decision context.
4. Calculations derive gaps and percentiles from recorded facts.
5. Coaching interpretation explains meaning and next steps without being mislabeled as measurement.

Predictions stay in `preRace`; official results stay in `postRace`. Course-certification uncertainty remains explicit.
