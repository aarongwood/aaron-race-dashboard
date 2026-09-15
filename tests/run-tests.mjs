import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { buildAll, enrichRecord, inline, paths, placementPercentile, readRecord, recordTemplate, renderPostRaceReport, renderPreRaceReport, validateRecord } from "../lib/report-factory.mjs";

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

const built = await buildAll();
assert.ok(built.built.length >= 1);
for (const file of [built.archive, path.join(paths.reports, "brielle-2026", "index.html"), path.join(paths.reports, "brielle-2026", "pre-race", "index.html"), path.join(paths.reports, "brielle-2026", "post-race", "index.html")]) {
  const stat = await fs.stat(file);
  assert.ok(stat.size > 600, `${file} should be a substantial HTML document`);
}

const root = await fs.readFile(path.join(paths.root, "index.html"), "utf8");
assert.match(root, /id="race-story"/);
assert.match(root, /id="race-execution"/);
assert.match(root, /44:11\.6/);

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
assert.equal(brielle.race.name, "Brielle Day Hill & Dale 10K");

const imported = importBasics('<html><head><title>Example 10K | RunSignup</title><script type="application/ld+json">{"@type":"Event","name":"Example 10K","startDate":"2027-04-03T09:00:00-04:00","location":{"name":"Town Park","address":{"addressLocality":"Exampleton","addressRegion":"NJ"}}}</script></head></html>', "https://example.com/race");
assert.equal(imported.race.name, "Example 10K");
assert.equal(imported.race.date, "2027-04-03");
assert.equal(imported.race.startTime, "9:00 AM");
assert.equal(imported.race.location, "Exampleton, NJ");
assert.equal(imported.race.distance, "10K");

await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
console.log("All two-stage race-report tests passed.");
