import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { buildAll, enrichRecord, inline, listRecords, paths, placementPercentile, readRecord, recordTemplate, renderHistoricalRaceReport, renderPostRaceReport, renderPreRaceReport, validateRecord } from "../lib/report-factory.mjs";
import { buildJourneyContexts, journeyNarrative } from "../lib/journey-context.mjs";

const { record } = await readRecord("races/brielle-2026.json");
assert.equal(validateRecord(record, "both").length, 0, "Brielle two-stage record must validate");
assert.equal(record.schemaVersion, 2);
assert.equal(record.preRace.status, "final");
assert.equal(record.postRace.status, "final");
assert.match(inline("**strong**"), /<strong>strong<\/strong>/);
assert.match(inline("<script>alert(1)</script>"), /&lt;script&gt;/);
assert.equal(placementPercentile(19, 202)?.toFixed(1), "9.4");

const pre = renderPreRaceReport(record);
assert.match(pre, /Race-day logistics/);
assert.match(pre, /Competitive field/);
assert.match(pre, /id="race-execution"/);
assert.match(pre, /Scott Isgett/);
assert.match(pre, /ASICS Metaspeed Sky Tokyo/);

const post = renderPostRaceReport(record);
assert.match(post, /44:11\.6/);
assert.match(post, /1 \/ 25/);
assert.match(post, /top 9\.4%/);
assert.match(post, /Aerobic diagnosis/);
assert.match(post, /Form under pressure/);
assert.match(post, /id="race-execution"/);
assert.doesNotMatch(post, /<script>alert/);

const template = recordTemplate("next-race-2027");
assert.equal(validateRecord(template, "pre").length, 0);
template.postRace.officialTime = "40:00";
template.postRace.competitors = [{ place: "1", name: "Aaron Greenwood", time: "40:00", gap: "" }, { place: "2", name: "Runner Two", time: "41:15", gap: "" }];
enrichRecord(template);
assert.equal(template.postRace.officialPace, "6:26");
assert.equal(template.postRace.winningMargin, "1:15");
assert.equal(template.postRace.competitors[1].gap, "+1:15");
template.postRace.status = "final";
assert.ok(validateRecord(template, "post").some((error) => error.includes("resultSummary")));

const historyFiles = await listRecords();
assert.equal(historyFiles.length, 22, "canonical archive must contain all 22 completed races through Brielle");
const { record: oceanGate } = await readRecord("races/ocean-gate-5k-2025.json");
assert.equal(oceanGate.preRace.status, "not-preserved");
assert.equal(oceanGate.evidence.level, "official");
assert.equal(validateRecord(oceanGate, "both").length, 0);
const sourceRecords = [];
for (const file of historyFiles) sourceRecords.push((await readRecord(file)).record);
const journeyContexts = buildJourneyContexts(sourceRecords);
assert.equal(journeyContexts.size, 22);
assert.equal(journeyContexts.get("ocean-gate-5k-2025").raceNumber, 1);
assert.equal(journeyNarrative(journeyContexts.get("ocean-gate-5k-2025")).headline, "The starting point");
assert.equal(journeyNarrative(journeyContexts.get("christmas-in-the-pines-trail-run-2025")).headline, "The first recorded victory");
assert.equal(journeyContexts.get("ocean-gate-5k-christmas-in-july-2026").priorBestSameDistance.direction, "faster");
oceanGate.journeyContext = journeyContexts.get(oceanGate.slug);
const historical = renderHistoricalRaceReport(oceanGate);
assert.match(historical, /28:18\.9/);
assert.match(historical, /3 \/ 13/);
assert.match(historical, /Where Aaron stood that day/);
assert.match(historical, /The starting point/);
assert.match(historical, /What followed/);
assert.doesNotMatch(historical, /Pre-race plan<\/a>/);

const built = await buildAll();
assert.equal(built.built.length, 22);
for (const file of [built.archive, path.join(paths.reports, "brielle-2026", "index.html"), path.join(paths.reports, "brielle-2026", "pre-race", "index.html"), path.join(paths.reports, "brielle-2026", "post-race", "index.html")]) {
  const stat = await fs.stat(file);
  assert.ok(stat.size > 600, `${file} should be a substantial HTML document`);
}
const firstWinStory = await fs.readFile(path.join(paths.reports, "christmas-in-the-pines-trail-run-2025", "index.html"), "utf8");
assert.match(firstWinStory, /The first recorded victory/);
assert.match(firstWinStory, /First recorded age-group victory/);
const oceanGateBreakthrough = await fs.readFile(path.join(paths.reports, "ocean-gate-5k-christmas-in-july-2026", "index.html"), "utf8");
assert.match(oceanGateBreakthrough, /fastest same-distance mark then in the ledger/i);
assert.match(oceanGateBreakthrough, /What this result changed/);
assert.match(oceanGateBreakthrough, /href="\.\.\/\.\.\/"/);

const root = await fs.readFile(path.join(paths.root, "index.html"), "utf8");
assert.match(root, /MASTER RACE INDEX/);
assert.match(root, /PRS \/ CURRENT BESTS<\/span><strong>13<\/strong>/);
assert.match(root, /href="reports\/brielle-2026\/"/);
assert.match(root, /RACES<\/span><strong>22<\/strong>/);
assert.match(root, /Journey report/);
const brielleFeature = await fs.readFile(path.join(paths.root, "features", "brielle-2026", "index.html"), "utf8");
assert.match(brielleFeature, /id="race-story"/);
assert.match(brielleFeature, /id="race-execution"/);
assert.match(brielleFeature, /44:11\.6/);
const archive = await fs.readFile(built.archive, "utf8");
assert.match(archive, /AGE-GROUP WINS<\/span><strong>6<\/strong>/);
assert.match(archive, /AGE-GROUP PODIUMS<\/span><strong>14<\/strong>/);
assert.match(archive, /filter-distance/);
const publicData = JSON.parse(await fs.readFile(path.join(paths.reports, "data.json"), "utf8"));
assert.equal(publicData.stats.completed, 22);
assert.equal(publicData.races.length, 22);

process.env.RACE_REPORT_PORT = "4174";
const { importBasics, server } = await import("../studio-server.mjs");
await new Promise((resolve, reject) => {
  if (server.listening) return resolve();
  server.once("listening", resolve);
  server.once("error", reject);
});

const studioHtml = await fetch("http://127.0.0.1:4174/studio/").then((response) => response.text());
const races = await fetch("http://127.0.0.1:4174/api/races").then((response) => response.json());
const brielle = await fetch("http://127.0.0.1:4174/api/races/brielle-2026").then((response) => response.json());
assert.match(studioHtml, /One race/i);
assert.match(studioHtml, /Pre-race plan/);
assert.match(studioHtml, /Post-race analysis/);
assert.ok(races.some((race) => race.slug === "brielle-2026"));
assert.equal(races.length, 22);
assert.equal(brielle.race.name, "Brielle Day Hill & Dale 10K");
const health = await fetch("http://127.0.0.1:4174/api/health").then((response) => response.json());
assert.equal(health.ok, true);

const imported = importBasics('<html><head><title>Example 10K | RunSignup</title><script type="application/ld+json">{"@type":"Event","name":"Example 10K","startDate":"2027-04-03T09:00:00-04:00","location":{"name":"Town Park","address":{"addressLocality":"Exampleton","addressRegion":"NJ"}}}</script></head></html>', "https://example.com/race");
assert.equal(imported.race.name, "Example 10K");
assert.equal(imported.race.date, "2027-04-03");
assert.equal(imported.race.startTime, "9:00 AM");
assert.equal(imported.race.location, "Exampleton, NJ");
assert.equal(imported.race.distance, "10K");

await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
console.log("All two-stage race-report tests passed.");
