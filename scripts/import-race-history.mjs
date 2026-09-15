#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { buildAll, paths, recordTemplate, slugify } from "../lib/report-factory.mjs";

const args = process.argv.slice(2);
const sourceArg = args.find((arg) => !arg.startsWith("--")) || "data/race-history.json";
const sourcePath = path.resolve(paths.root, sourceArg);
const overwrite = args.includes("--overwrite");
const noBuild = args.includes("--no-build");

const value = (input) => input == null ? "" : String(input);
const ordinal = (input) => {
  const number = Number(input);
  if (!number) return "";
  const mod100 = number % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th");
  return `${number}${suffix}`;
};

function evidenceFor(dataQuality = "") {
  if (/official.*(?:FIT|Garmin)|(?:FIT|Garmin).*race review/i.test(dataQuality)) return { level: "complete", label: "Official result + performance evidence", shortLabel: "complete", note: "Official result evidence is paired with device data and/or a preserved race review." };
  if (/^official|official result|official runsignup/i.test(dataQuality)) return { level: "official", label: "Official result", shortLabel: "official", note: "The canonical ledger identifies the result as official. Richer split and mechanics evidence is not attached to this historical record." };
  if (/provisional|preliminary|result graphic/i.test(dataQuality)) return { level: "provisional", label: "Partial or provisional result", shortLabel: "provisional", note: "The result is preserved from a posted graphic, preliminary listing, race review or device estimate and is labeled accordingly." };
  return { level: "historical", label: "Historical ledger", shortLabel: "ledger", note: "The canonical ledger preserves the result, but the original source packet is not attached to this record." };
}

function fieldSentence(row) {
  const parts = [];
  if (row.agePlace) parts.push(`${ordinal(row.agePlace)} of ${row.ageField || "an unrecorded field size"} in the recorded age division`);
  if (row.overallPlace) parts.push(`${ordinal(row.overallPlace)}${row.overallField ? ` of ${row.overallField}` : ""} overall`);
  return parts.length ? `The ledger records Aaron ${parts.join(" and ")}.` : "Placement detail is not preserved in the ledger.";
}

function summarySentence(row, evidence) {
  const status = evidence.level === "provisional" ? "a provisional/posted" : evidence.level === "historical" ? "a recorded" : "an official";
  const placements = [];
  if (row.agePlace) placements.push(`${ordinal(row.agePlace)}${row.ageField ? ` of ${row.ageField}` : ""} in his recorded age division`);
  if (row.overallPlace) placements.push(`${ordinal(row.overallPlace)}${row.overallField ? ` of ${row.overallField}` : ""} overall`);
  return `Aaron Greenwood ran ${value(row.effectiveTime)} for ${row.distance} at ${row.race}, ${status} result${placements.length ? ` that placed him ${placements.join(" and ")}` : ""}.`;
}

function headlineFor(row) {
  if (Number(row.agePlace) === 1) return "Age-group victory";
  if (Number(row.agePlace) > 0 && Number(row.agePlace) <= 3) return "A podium result";
  if (/PR|best/i.test(value(row.record))) return "A new benchmark";
  return "The result, preserved";
}

function createRecord(row, source, athlete) {
  const year = row.date.slice(0, 4);
  const baseSlug = slugify(row.race);
  const slug = row.race === "Brielle Day Hill & Dale 10K Challenge" ? "brielle-2026" : baseSlug.endsWith(`-${year}`) ? baseSlug : `${baseSlug}-${year}`;
  const record = recordTemplate(slug);
  const evidence = evidenceFor(value(row.dataQuality));
  record.athlete = athlete || "Aaron Greenwood";
  record.evidence = evidence;
  record.provenance = { source: source.workbook, sheet: source.sheet, row: row.sourceRow, imported: true };
  record.race = {
    ...record.race,
    name: row.race,
    distance: row.distance,
    date: row.date,
    startTime: "",
    timezone: "America/New_York",
    location: row.locationNotes || "Location not preserved in ledger",
    venue: "",
    priority: row.priority || "Historical",
    purpose: "Permanent race-history record",
    courseType: row.courseType || "Course type not preserved",
    surface: /trail|off-road|fields/i.test(value(row.courseType)) ? "Mixed / off-road" : /boardwalk/i.test(value(row.courseType)) ? "Boardwalk / paved" : "Road / paved",
    certification: /certified/i.test(value(row.locationNotes)) ? "Certified (ledger note)" : "Not preserved",
    registrationUrl: "",
    resultsUrl: "",
    courseUrl: "",
    weatherUrl: "",
  };
  record.preRace = { status: "not-preserved", preparedAt: "", outlook: "", strategy: [], sources: [] };
  record.postRace = {
    ...record.postRace,
    status: "final",
    analyzedAt: source.extractedThrough || "",
    headline: headlineFor(row),
    subhead: `${row.race}.`,
    deck: `A source-labeled historical record of Aaron Greenwood’s ${row.distance} result, placement and benchmark status.`,
    verdict: `**Permanent result:** ${summarySentence(row, evidence)}`,
    officialTime: value(row.effectiveTime),
    officialPace: value(row.pacePerMile),
    timeStatus: evidence.level === "provisional" ? "provisional / posted" : "effective result time",
    bib: value(row.bib),
    division: "Recorded age division",
    ageGroupPlace: value(row.agePlace),
    ageGroupSize: value(row.ageField),
    overallPlace: value(row.overallPlace),
    overallSize: value(row.overallField),
    malePlace: "",
    maleSize: "",
    resultSummary: summarySentence(row, evidence),
    recordNote: [row.resultNotes, row.record].filter(Boolean).join(" **Record:** "),
    fieldRead: fieldSentence(row),
    recordLabel: value(row.record),
    dataQuality: value(row.dataQuality),
    historicalRecord: {
      clockTime: value(row.clockTime),
      chipTime: value(row.chipTime),
      effectiveTime: value(row.effectiveTime),
      locationNotes: value(row.locationNotes),
      resultNotes: value(row.resultNotes),
      sourceRow: row.sourceRow,
    },
    sources: [{ label: source.workbook, url: "", note: `${source.sheet}, row ${row.sourceRow}. ${row.dataQuality || "Historical ledger entry"}.` }],
  };
  return record;
}

const dataset = JSON.parse(await fs.readFile(sourcePath, "utf8"));
if (dataset.schemaVersion !== 1 || !Array.isArray(dataset.races)) throw new Error("History source must be schemaVersion 1 with a races array.");
await fs.mkdir(paths.races, { recursive: true });

let created = 0;
let replaced = 0;
let preserved = 0;
for (const row of dataset.races) {
  const record = createRecord(row, dataset.source || {}, dataset.athlete);
  const output = path.join(paths.races, `${record.slug}.json`);
  let exists = false;
  try { await fs.access(output); exists = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (exists && !overwrite) {
    preserved++;
    console.log(`Preserved enriched record: ${record.slug}`);
    continue;
  }
  await fs.writeFile(output, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  exists ? replaced++ : created++;
  console.log(`${exists ? "Replaced" : "Created"}: ${record.slug}`);
}

if (!noBuild) await buildAll();
console.log(`History import complete: ${created} created, ${replaced} replaced, ${preserved} preserved, ${dataset.races.length} source rows.`);
