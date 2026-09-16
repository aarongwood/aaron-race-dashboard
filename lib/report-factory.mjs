import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildJourneyContexts, journeyNarrative } from "./journey-context.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const paths = {
  root: ROOT,
  races: path.join(ROOT, "races"),
  reports: path.join(ROOT, "reports"),
};

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const list = (value) => Array.isArray(value) ? value : [];
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const present = (value) => text(value) !== "";

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const safeUrl = (value = "") => {
  const url = text(value);
  return /^(https?:\/\/|#)/.test(url) ? escapeHtml(url) : "#";
};

export function inline(value = "") {
  let output = escapeHtml(value);
  output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|#[^)]+)\)/g, (_match, label, url) => `<a href="${safeUrl(url)}">${label}</a>`);
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  return output;
}

export function displayDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return text(value, "DATE TBD");
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

export function slugify(value) {
  return text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function parseTimeToSeconds(value) {
  const parts = text(value).split(":").map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const rounded = Math.round(seconds * 10) / 10;
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = (rounded % 60).toFixed(Number.isInteger(rounded) ? 0 : 1).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}

export function placementPercentile(place, size) {
  const p = number(place);
  const s = number(size);
  return p > 0 && s >= p ? (p / s) * 100 : null;
}

export function distanceMiles(value) {
  const normalized = text(value).toLowerCase().replaceAll(" ", "");
  const known = { "1mile": 1, "5k": 3.106856, "8k": 4.97097, "10k": 6.213712, "15k": 9.320568, "half": 13.1094, "halfmarathon": 13.1094, "marathon": 26.2188, "50k": 31.0686, "50mile": 50 };
  if (known[normalized]) return known[normalized];
  const numeric = Number.parseFloat(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return normalized.includes("km") || normalized.endsWith("k") ? numeric * 0.621371 : numeric;
}

export function formatPace(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

export function enrichRecord(record) {
  const post = record.postRace || {};
  const officialSeconds = parseTimeToSeconds(post.officialTime);
  const miles = distanceMiles(record.race?.distance);
  if (!present(post.officialPace) && officialSeconds && miles) post.officialPace = formatPace(officialSeconds / miles);
  const competitors = list(post.competitors);
  const timed = competitors.map((item) => ({ item, seconds: parseTimeToSeconds(item.time) })).filter((entry) => entry.seconds !== null);
  const winner = timed.length ? Math.min(...timed.map((entry) => entry.seconds)) : null;
  if (winner !== null) for (const entry of timed) if (!present(entry.item.gap)) entry.item.gap = entry.seconds === winner ? "—" : `+${formatDuration(entry.seconds - winner)}`;
  const athleteRow = competitors.find((item) => text(item.name).toLowerCase() === text(record.athlete).toLowerCase());
  if (!present(post.winningMargin) && number(athleteRow?.place) === 1) {
    const second = competitors.find((item) => number(item.place) === 2);
    const secondSeconds = parseTimeToSeconds(second?.time);
    const athleteSeconds = parseTimeToSeconds(athleteRow?.time) ?? officialSeconds;
    if (secondSeconds !== null && athleteSeconds !== null && secondSeconds > athleteSeconds) post.winningMargin = formatDuration(secondSeconds - athleteSeconds);
  }
  return record;
}

function topLabel(place, size) {
  const percentile = placementPercentile(place, size);
  return percentile === null ? "field size not supplied" : `top ${percentile < 1 ? percentile.toFixed(1) : percentile.toFixed(1).replace(".0", "")}%`;
}

export function validateRecord(record, phase = "both") {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["Race record must be a JSON object."];
  if (record.schemaVersion !== 2) errors.push("schemaVersion must be 2.");
  if (!SLUG_PATTERN.test(record.slug || "")) errors.push("slug must use lowercase letters, numbers, and single hyphens.");
  if (!present(record.athlete)) errors.push("athlete is required.");
  const race = record.race || {};
  for (const key of ["name", "distance", "date", "location"]) if (!present(race[key])) errors.push(`race.${key} is required.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(race.date || "")) errors.push("race.date must use YYYY-MM-DD.");
  if (["pre", "both"].includes(phase)) {
    const pre = record.preRace || {};
    if (pre.status !== "not-preserved") {
      if (!present(pre.outlook)) errors.push("preRace.outlook is required for a pre-race report.");
      if (!list(pre.strategy).length) errors.push("preRace.strategy needs at least one course segment.");
    }
  }
  if (["post", "both"].includes(phase) && record.postRace?.status !== "pending") {
    const post = record.postRace || {};
    if (!present(post.officialTime)) errors.push("postRace.officialTime is required for a post-race report.");
    if (!present(post.resultSummary)) errors.push("postRace.resultSummary is required for a post-race report.");
  }
  return errors;
}

export async function readRecord(recordPath) {
  const absolute = path.resolve(ROOT, recordPath);
  const record = JSON.parse(await fs.readFile(absolute, "utf8"));
  const errors = validateRecord(record, record.postRace?.status === "final" ? "both" : "pre");
  if (errors.length) throw new Error(`Invalid race record:\n- ${errors.join("\n- ")}`);
  return { record, absolute };
}

function renderTable(columns, rows) {
  if (!rows.length) return '<p class="empty-note">No entries supplied yet.</p>';
  return `<div class="table-scroll"><table><thead><tr>${columns.map((column) => `<th>${inline(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr${row.highlight ? ' class="winner-row"' : ""}>${row.cells.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("\n")}</tbody></table></div>`;
}

function renderMetrics(items, className = "metric-grid") {
  const filtered = items.filter((item) => present(item.value));
  return filtered.length ? `<div class="${className}">${filtered.map((item) => `<div><span>${inline(item.label)}</span><strong>${inline(item.value)}</strong>${item.note ? `<small>${inline(item.note)}</small>` : ""}</div>`).join("")}</div>` : "";
}

function renderList(items, ordered = false) {
  const filtered = items.filter(present);
  if (!filtered.length) return '<p class="empty-note">Nothing recorded yet.</p>';
  const tag = ordered ? "ol" : "ul";
  return `<${tag} class="${ordered ? "numbered-analysis" : "opportunity-list"}">${filtered.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`;
}

function section(id, title, body) {
  return { id, title, body };
}

function sourceSection(sources, note) {
  const rows = list(sources).filter((source) => present(source.label) || present(source.url));
  const items = rows.map((source) => source.url ? `<li><a href="${safeUrl(source.url)}" rel="nofollow">${inline(source.label || source.url)}</a>${source.note ? ` — ${inline(source.note)}` : ""}</li>` : `<li>${inline(source.label)}${source.note ? ` — ${inline(source.note)}` : ""}</li>`).join("");
  return `${items ? `<ul>${items}</ul>` : '<p class="empty-note">No external sources recorded.</p>'}<p class="source-note">${inline(note)}</p>`;
}

function journeyTimeline(context) {
  const rows = list(context?.recentResults);
  if (!rows.length) return '<p class="empty-note">No earlier preserved results are available.</p>';
  return `<div class="timeline">${rows.map((item) => `<div${item.slug === context.current?.slug ? ' class="timeline-win"' : ""}><time>${inline(displayDate(item.date).toUpperCase())}</time><strong>${inline(`${item.time} · ${item.distance}`)}</strong><span>${inline(item.name)}${item.ageGroupPlace ? ` · AG ${inline(String(item.ageGroupPlace))}${item.ageGroupSize ? `/${inline(String(item.ageGroupSize))}` : ""}` : ""}</span></div>`).join("")}</div>`;
}

function comparisonSentence(comparison, label) {
  if (!comparison) return "";
  const percentage = Number.isFinite(comparison.percent) ? `${comparison.percent < 0.1 ? comparison.percent.toFixed(2) : comparison.percent.toFixed(1)}%` : "";
  if (comparison.direction === "equal") return `${label} ${comparison.reference.name} (${displayDate(comparison.reference.date)}), the recorded time was identical at ${comparison.reference.time}.`;
  return `${label} ${comparison.reference.name} (${displayDate(comparison.reference.date)}), this result was ${comparison.delta} ${comparison.direction}${percentage ? ` (${percentage})` : ""}.`;
}

function distanceProgression(context) {
  if (!context) return '<p class="empty-note">Journey context is unavailable.</p>';
  if (context.milestones?.firstAtDistance) return `<p>This was Aaron’s first preserved ${inline(context.current.distance)} result. It established a new distance-specific baseline rather than replacing an earlier comparable mark.</p>`;
  const sentences = [];
  if (context.previousSameDistance) sentences.push(comparisonSentence(context.previousSameDistance, "Compared with the previous preserved same-distance race,"));
  if (context.priorBestSameDistance && context.priorBestSameDistance.reference.slug !== context.previousSameDistance?.reference.slug) sentences.push(comparisonSentence(context.priorBestSameDistance, "Compared with the fastest same-distance mark then in the ledger,"));
  return `${sentences.map((sentence) => `<p>${inline(sentence)}</p>`).join("")}<p class="source-note">These are raw same-distance comparisons. They do not normalize for hills, trail surface, weather, course certification or race purpose.</p>`;
}

function reportShell({ record, phase, kicker, title, subtitle, deck, edition, facts, verdict, sections }) {
  const race = record.race;
  const cssHref = "../../../assets/report.css";
  const nav = sections.map((item) => `<a href="#${escapeHtml(item.id)}">${inline(item.title)}</a>`).join("\n");
  const sectionHtml = sections.map((item, index) => `<h2 id="${escapeHtml(item.id)}"><span class="section-number">${String(index + 1).padStart(2, "0")}</span>${inline(item.title)}</h2>\n${item.body}`).join("\n");
  const factHtml = facts.filter((fact) => present(fact.value)).map((fact) => `<div><span>${inline(fact.label)}</span><strong>${inline(fact.value)}</strong>${fact.note ? `<small>${inline(fact.note)}</small>` : ""}</div>`).join("\n");
  const hasPre = record.preRace?.status !== "not-preserved";
  const hasPost = record.postRace?.status === "final";
  const otherPhase = phase === "pre" ? "post-race" : "pre-race";
  const otherLabel = phase === "pre" ? "Post-race edition" : "Pre-race plan";
  const otherLink = (phase === "pre" ? hasPost : hasPre) ? `<a href="../${otherPhase}/">${otherLabel}</a>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(race.name)} · ${escapeHtml(phase === "pre" ? "Race plan" : "Performance report")}</title><meta name="description" content="${escapeHtml(deck)}"><meta name="theme-color" content="#102c34"><link rel="stylesheet" href="${cssHref}"></head>
<body><a class="skip" href="#report">Skip to report</a><header class="masthead"><a class="brand" href="../../../">AARON’S RUN COACH <span>/ ${phase === "pre" ? "RACE PLAN" : "RACE REPORT"}</span></a><div class="header-actions">${otherLink}<button type="button" onclick="window.print()">Print / Save PDF</button></div></header>
<main id="top"><section class="hero ${phase === "post" ? "victory-hero" : ""}"><p class="eyebrow">${inline(race.location.toUpperCase())} · ${inline(displayDate(race.date).toUpperCase())}</p><p class="kicker">${inline(kicker)}</p><h1>${inline(title)}${subtitle ? `<br><em>${inline(subtitle)}</em>` : ""}</h1><p class="deck">${inline(deck)}</p><p class="edition">${inline(edition)}</p></section><section class="facts facts-eight" aria-label="Race facts">${factHtml}</section><div class="verdict"><p class="verdict-label">THE VERDICT</p><p>${inline(verdict)}</p></div><div class="layout"><aside><details open><summary>IN THIS REPORT</summary><nav aria-label="Report sections">${nav}</nav></details></aside><article id="report">${sectionHtml}</article></div></main>
<footer><p><strong>${inline(record.athlete)} · ${inline(race.name)} · ${inline(displayDate(race.date))}</strong></p><p>Generated from one permanent two-stage race record.</p><a href="#top">Back to top</a></footer></body></html>\n`;
}

export function renderPreRaceReport(record) {
  const race = record.race;
  const pre = record.preRace || {};
  const logisticsRows = list(pre.logistics).map((item) => ({ cells: [text(item.time, "TBD"), text(item.item)] }));
  const contenders = list(pre.contenders).map((item, index) => ({ cells: [text(item.name), text(item.age, "—"), text(item.best, "—"), text(item.evidence, "—"), text(item.threat, index === 0 ? "Primary" : "Watch")], highlight: Boolean(item.highlight) }));
  const strategy = list(pre.strategy).map((item) => ({ cells: [text(item.segment), text(item.pace, "Effort-led"), text(item.power, "—"), text(item.cue)] }));
  const goals = [pre.goalA && `**A goal:** ${pre.goalA}`, pre.goalB && `**B goal:** ${pre.goalB}`, pre.goalC && `**C goal:** ${pre.goalC}`].filter(Boolean);
  const sections = [
    section("race-day-outlook", "The race-day outlook", `<p>${inline(pre.outlook)}</p>${pre.guardrails ? `<div class="callout warning"><strong>Guardrails</strong><p>${inline(pre.guardrails)}</p></div>` : ""}`),
    section("logistics", "Race-day logistics", `${renderTable(["Time", "Action"], logisticsRows)}${pre.bibPickup ? `<p><strong>Registration / bib:</strong> ${inline(pre.bibPickup)}</p>` : ""}${pre.parking ? `<p><strong>Parking:</strong> ${inline(pre.parking)}</p>` : ""}${pre.arrival ? `<p><strong>Arrival:</strong> ${inline(pre.arrival)}</p>` : ""}${pre.warmup ? `<p><strong>Warm-up:</strong> ${inline(pre.warmup)}</p>` : ""}`),
    section("course-and-conditions", "Course, weather and implications", `${renderMetrics([{ label: "COURSE", value: race.courseType, note: race.surface }, { label: "CERTIFICATION", value: race.certification }, { label: "FORECAST", value: pre.weather }, { label: "START", value: race.startTime, note: race.timezone }])}<p>${inline(text(pre.courseSummary, "Course specifics have not yet been supplied; race by effort until the terrain is verified."))}</p>`),
    section("competitive-field", "Competitive field", `<p>${inline(text(pre.fieldRead, "Treat the published entry list as a dated snapshot. Race the people who start, not the names on a screen."))}</p>${renderTable(["Athlete", "Age", "Known mark", "Evidence", "Read"], contenders)}${renderMetrics([{ label: "FIELD", value: pre.fieldSize, note: "entered / expected" }, { label: "AGE GROUP", value: pre.ageGroupSize, note: "entered / expected" }])}`),
    section("race-execution", "Race execution", `<p>${inline(text(pre.strategySummary, "Open under control, settle into the prescribed rhythm, and compete progressively."))}</p>${renderTable(["Segment", "Pace / effort", "Power", "Execution cue"], strategy)}<h3>Goal hierarchy</h3>${renderList(goals)}`),
    section("readiness-gate", "Race-morning readiness gate", `<div class="callout success"><strong>GREEN · Race</strong><p>${inline(text(pre.readinessGreen, "Normal movement, normal warm-up response, no concerning symptoms."))}</p></div><div class="callout warning"><strong>YELLOW · Adjust</strong><p>${inline(text(pre.readinessYellow, "Unexpected tightness, abnormal fatigue or a poor warm-up response: reduce the target and reassess."))}</p></div><div class="callout danger"><strong>RED · Stop</strong><p>${inline(text(pre.readinessRed, "Pain that changes gait or worsens while running overrides pace, power and competitive goals."))}</p></div>`),
    section("fuel-footwear", "Fuel, hydration and footwear", `${renderMetrics([{ label: "SHOES", value: pre.shoes }, { label: "FUEL", value: pre.fuel }, { label: "HYDRATION", value: pre.hydration }])}<p>${inline(text(pre.equipmentNotes, "Use only practiced equipment and nutrition."))}</p>`),
    section("sources", "Sources and limits", sourceSection(pre.sources, "Organizer information, forecasts and entry lists can change. Verify critical logistics on race morning; keep predictions separate from official results.")),
  ];
  return reportShell({ record, phase: "pre", kicker: text(pre.kicker, `${text(race.priority, "RACE")} · PRE-RACE PLAN`), title: text(pre.headline, race.name), subtitle: text(pre.subhead, "Know the course. Run your race."), deck: text(pre.deck, `The complete ${race.distance} plan: logistics, course, competition and an execution strategy for ${record.athlete}.`), edition: `Prepared ${displayDate(pre.preparedAt || new Date().toISOString().slice(0, 10))} · Pre-race information is a dated snapshot`, verdict: text(pre.verdict, `**The purpose is ${text(race.purpose, "to execute well")}.** Control the opening, respond to the verified course, and let the race come to you.`), facts: [{ label: "DISTANCE", value: race.distance, note: race.courseType }, { label: "START", value: race.startTime, note: race.timezone }, { label: "TARGET", value: pre.targetTime, note: "time" }, { label: "TARGET PACE", value: pre.targetPace, note: "per mile" }, { label: "TARGET POWER", value: pre.targetPower, note: "race range" }, { label: "FIELD", value: pre.fieldSize, note: "snapshot" }, { label: "AGE GROUP", value: pre.ageGroupSize, note: "snapshot" }, { label: "FOOTWEAR", value: pre.shoes, note: "planned" }], sections });
}

export function renderPostRaceReport(record) {
  const race = record.race;
  const post = record.postRace || {};
  const journey = record.journeyContext || null;
  const competitors = list(post.competitors).map((item) => ({ cells: [text(item.place), text(item.name), text(item.time), text(item.gap, "—")], highlight: Boolean(item.highlight) || text(item.name).toLowerCase() === text(record.athlete).toLowerCase() }));
  const splits = list(post.splits).map((item) => ({ cells: [text(item.segment), text(item.pace), text(item.hr, "—"), text(item.power, "—"), text(item.note)], highlight: Boolean(item.highlight) }));
  const progression = list(post.progression).length ? list(post.progression).map((item) => `<div${item.highlight ? ' class="timeline-win"' : ""}><time>${inline(item.label)}</time><strong>${inline(item.value)}</strong><span>${inline(item.note)}</span></div>`).join("") : list(journey?.recentResults).map((item) => `<div${item.slug === journey.current?.slug ? ' class="timeline-win"' : ""}><time>${inline(displayDate(item.date).toUpperCase())}</time><strong>${inline(`${item.time} · ${item.distance}`)}</strong><span>${inline(item.name)}</span></div>`).join("");
  const future = list(post.futureGoals).map((item) => `<div><span>${inline(item.label)}</span><h3>${inline(item.title)}</h3><p>${inline(item.text)}</p></div>`).join("");
  const win = number(post.ageGroupPlace) === 1;
  const ag = present(post.ageGroupPlace) && present(post.ageGroupSize) ? `${post.ageGroupPlace} / ${post.ageGroupSize}` : "";
  const overall = present(post.overallPlace) && present(post.overallSize) ? `${post.overallPlace} / ${post.overallSize}` : "";
  const men = present(post.malePlace) && present(post.maleSize) ? `${post.malePlace} / ${post.maleSize}` : "";
  const sections = [
    section("result", win ? "The victory" : "The result", `<p>${inline(post.resultSummary)}</p>${post.recordNote ? `<p>${inline(post.recordNote)}</p>` : ""}<blockquote>${inline(text(post.resultQuote, win ? "He did not merely enter the field. He changed its order." : "The clock records the performance; the evidence explains it."))}</blockquote>`),
    section("race-execution", "Race execution", `<p>${inline(text(post.executionSummary, "Execution notes have not yet been supplied."))}</p>${renderTable(["Course segment", "Pace", "HR", "Power", "What it says"], splits)}${post.executionDiagnosis ? `<p>${inline(post.executionDiagnosis)}</p>` : ""}`),
    section("competitive-field", win ? "The field Aaron disrupted" : "Competitive-field result", `<p>${inline(text(post.fieldRead, `Aaron finished ${text(overall, "in the recorded field")}.`))}</p>${renderTable(["Place", "Athlete", "Time", "Gap"], competitors)}${renderMetrics([{ label: "AGE GROUP", value: ag, note: topLabel(post.ageGroupPlace, post.ageGroupSize) }, { label: "OVERALL", value: overall, note: topLabel(post.overallPlace, post.overallSize) }, { label: "MEN", value: men, note: topLabel(post.malePlace, post.maleSize) }, { label: "MARGIN", value: post.winningMargin, note: win ? "over second" : "to reference rival" }])}`),
    section("aerobic-diagnosis", "Aerobic diagnosis", `${renderMetrics([{ label: "AVG / MAX HR", value: post.avgHR && post.maxHR ? `${post.avgHR} / ${post.maxHR}` : post.avgHR, note: "bpm" }, { label: "AVG / NORM POWER", value: post.avgPower && post.normPower ? `${post.avgPower} / ${post.normPower}` : post.avgPower, note: "running watts" }, { label: "AEROBIC EFFECT", value: post.aerobicEffect, note: "device estimate" }, { label: "DURATION", value: post.deviceTime || post.officialTime, note: "continuous running" }])}<p>${inline(text(post.aerobicDiagnosis, "Use heart-rate progression, sustained output and the finish—not one isolated metric—to judge aerobic execution."))}</p>`),
    section("form", "Form under pressure", `<p>${inline(text(post.formDiagnosis, "Running-dynamics data and visual observations should be interpreted against terrain, speed and fatigue."))}</p>${renderMetrics([{ label: "CADENCE", value: post.cadence, note: "spm" }, { label: "STRIDE", value: post.strideLength, note: "m" }, { label: "GROUND CONTACT", value: post.groundContact, note: "ms" }, { label: "VERTICAL RATIO", value: post.verticalRatio, note: "%" }, { label: "BALANCE", value: post.balance, note: "left / right" }, { label: "CLOSING CADENCE", value: post.closingCadence, note: "spm" }, { label: "CLOSING STRIDE", value: post.closingStride, note: "m" }, { label: "CLOSING CONTACT", value: post.closingGroundContact, note: "ms" }], "comparison")}`),
    section("what-worked", "What made it possible", renderList(list(post.whatWorked), true)),
    section("progression", "How far he has come", `${journey ? renderMetrics([{ label: "RACE NUMBER", value: journey.raceNumber, note: "in preserved history" }, { label: "WINS TO DATE", value: journey.winsToDate, note: "age-group" }, { label: "PODIUMS TO DATE", value: journey.podiumsToDate, note: "including wins" }, { label: "PRS / BESTS", value: journey.personalRecordsToDate, note: "recorded by then" }]) : ""}${progression ? `<div class="timeline">${progression}</div>` : '<p class="empty-note">Add prior benchmarks to show the progression.</p>'}${post.progressionSummary ? `<p>${inline(post.progressionSummary)}</p>` : journey ? `<p>${inline(journeyNarrative(journey)?.change)}</p>` : ""}`),
    section("opportunities", "Where the next gains live", renderList(list(post.opportunities))),
    section("future", "How far this can go", `${future ? `<div class="horizon-grid">${future}</div>` : '<p class="empty-note">Add future goals after interpreting the result.</p>'}${post.futureSummary ? `<p>${inline(post.futureSummary)}</p>` : ""}`),
    section("next-steps", "What comes next", `<div class="callout success"><strong>Convert the race into fitness</strong><p>${inline(text(post.nextStep, "Recover from the race-sized load, absorb the adaptation, and resume the larger training plan without repaying missed miles."))}</p></div><p><strong>Athlete report:</strong> ${inline(text(post.subjective, "Not supplied."))}</p><p><strong>Pain / injury:</strong> ${inline(text(post.pain, "Not supplied."))}</p>`),
    section("sources", "Sources and limits", sourceSection(post.sources, "Measured facts, derived calculations and coaching interpretation are distinct. Official results control time and placement; device data supplies physiological and mechanical context.")),
  ];
  return reportShell({ record, phase: "post", kicker: text(post.kicker, win ? "AGE-GROUP CHAMPION" : "POST-RACE ANALYSIS"), title: text(post.headline, win ? "A disrupting force" : "The performance, diagnosed"), subtitle: text(post.subhead, `at ${race.name}.`), deck: text(post.deck, `${record.athlete} ran ${text(post.officialTime, "a recorded result")} at ${race.name}; this report explains the result, execution and what it changes.`), edition: `Final post-race edition · ${text(post.analyzedAt ? `Analyzed ${displayDate(post.analyzedAt)}` : "official result and athlete evidence")}`, verdict: text(post.verdict, `**This result belongs in the permanent record.** ${text(post.resultSummary)}`), facts: [{ label: "OFFICIAL TIME", value: post.officialTime, note: post.deviceTime ? `Device: ${post.deviceTime}` : "final" }, { label: "OFFICIAL PACE", value: post.officialPace, note: "per mile" }, { label: "AGE GROUP", value: ag, note: text(post.division, "placement") }, { label: "OVERALL", value: overall, note: topLabel(post.overallPlace, post.overallSize) }, { label: "MEN", value: men, note: topLabel(post.malePlace, post.maleSize) }, { label: "MARGIN", value: post.winningMargin, note: win ? "over second" : "competitive gap" }, { label: "CLIMBING", value: post.courseAscent, note: "device ascent" }, { label: "IMPROVEMENT", value: post.prImprovement, note: post.recordLabel || "vs. prior best" }], sections });
}

export function renderHistoricalRaceReport(record) {
  const race = record.race;
  const post = record.postRace || {};
  const ledger = post.historicalRecord || {};
  const journey = record.journeyContext || null;
  const story = journeyNarrative(journey) || { headline: text(post.headline, race.name), change: "This result is preserved as part of Aaron’s competitive history." };
  const ag = present(post.ageGroupPlace) && present(post.ageGroupSize) ? `${post.ageGroupPlace} / ${post.ageGroupSize}` : text(post.ageGroupPlace);
  const overall = present(post.overallPlace) && present(post.overallSize) ? `${post.overallPlace} / ${post.overallSize}` : text(post.overallPlace);
  const resultRows = [
    ["Clock time", ledger.clockTime], ["Chip time", ledger.chipTime], ["Effective time", post.officialTime],
    ["Pace / mile", post.officialPace], ["Bib", post.bib], ["Course", race.courseType],
    ["Location / notes", ledger.locationNotes || race.location], ["Result notes", ledger.resultNotes], ["PR / record", post.recordLabel],
  ].filter((row) => present(row[1])).map((row) => ({ cells: row }));
  const fieldRows = [
    ["Age division", post.ageGroupPlace, post.ageGroupSize, topLabel(post.ageGroupPlace, post.ageGroupSize)],
    ["Overall", post.overallPlace, post.overallSize, topLabel(post.overallPlace, post.overallSize)],
    ["Men", post.malePlace, post.maleSize, topLabel(post.malePlace, post.maleSize)],
  ].filter((row) => present(row[1])).map((row) => ({ cells: row }));
  const evidence = record.evidence || {};
  const deviceReferenced = /FIT|Garmin|device/i.test(text(post.dataQuality));
  const executionEvidence = [ledger.resultNotes, ledger.locationNotes].filter(present);
  const next = journey?.nextRace;
  const nextStory = next ? `The next preserved start came ${present(next.daysLater) ? `${next.daysLater} days later, ` : ""}at ${next.name}: ${next.time} for ${next.distance}${next.ageGroupPlace ? `, with an age-group place of ${next.ageGroupPlace}${next.ageGroupSize ? ` of ${next.ageGroupSize}` : ""}` : ""}. That later result is retrospective context—not evidence used to reinterpret this race.` : "This is the latest completed race in the preserved ledger, so the next chapter had not yet been recorded.";
  const milestoneItems = [
    journey?.milestones?.firstRecordedRace && "First race in the preserved competitive ledger.",
    journey?.milestones?.firstRecordedPodium && "First recorded age-group podium.",
    journey?.milestones?.firstRecordedWin && "First recorded age-group victory.",
    journey?.milestones?.firstAtDistance && `First preserved ${race.distance} benchmark.`,
    journey?.milestones?.newRecordedDistanceBest && `Fastest ${race.distance} time then present in the ledger.`,
    journey?.milestones?.personalRecord && text(post.recordLabel, "Recorded as a PR or current best."),
    journey?.milestones?.ageGroupWin && `Age-group win number ${journey.winsToDate} in the preserved history.`,
  ].filter(Boolean);
  const executionBody = `${executionEvidence.length ? renderList(executionEvidence) : '<p class="empty-note">The ledger does not preserve mile splits, decisive moves or athlete-reported race sensations for this start.</p>'}${deviceReferenced ? `<div class="callout success"><strong>Device evidence is referenced</strong><p>${inline(`The source-quality field cites ${post.dataQuality}. Only facts explicitly carried into this record are presented here; unpreserved FIT metrics are not reconstructed.`)}</p></div>` : `<div class="callout warning"><strong>No attached mechanics packet</strong><p>Heart rate, power, cadence, ground contact, stride dynamics and split execution are not available in this historical record. No physiological or form diagnosis is claimed.</p></div>`}`;
  const sections = [
    section("result", number(post.ageGroupPlace) === 1 ? "The victory" : "The race and the result", `<p>${inline(post.resultSummary)}</p>${post.recordNote ? `<p>${inline(post.recordNote)}</p>` : ""}<blockquote>${inline(story.headline)}: ${inline(story.change)}</blockquote>`),
    section("race-execution", "What survives from race day", `${renderTable(["Recorded fact", "Value"], resultRows)}${executionBody}`),
    section("competitive-field", number(post.ageGroupPlace) === 1 ? "The field Aaron beat" : "Competitive-field position", `${post.fieldRead ? `<p>${inline(post.fieldRead)}</p>` : ""}${renderTable(["Field", "Place", "Field size", "Standing"], fieldRows)}<p>Placement is interpreted only from the preserved field sizes. It is not age-graded and does not assume who failed to start.</p>`),
    section("journey-context", "Where Aaron stood that day", `${journey ? renderMetrics([{ label: "RACE NUMBER", value: journey.raceNumber, note: "in preserved history" }, { label: "WINS", value: journey.winsToDate, note: "through this race" }, { label: "PODIUMS", value: journey.podiumsToDate, note: "through this race" }, { label: "PRS / BESTS", value: journey.personalRecordsToDate, note: "recorded by then" }]) : ""}<p>${inline(journey ? `This was race ${journey.raceNumber} in the surviving sequence. At that exact point—not using later achievements—Aaron’s record stood at ${journey.winsToDate} age-group win${journey.winsToDate === 1 ? "" : "s"}, ${journey.podiumsToDate} podium${journey.podiumsToDate === 1 ? "" : "s"}, and ${journey.personalRecordsToDate} recorded PR/current-best benchmark${journey.personalRecordsToDate === 1 ? "" : "s"}.` : "Point-in-time career totals are unavailable.")}</p>${journeyTimeline(journey)}`),
    section("distance-progression", `${race.distance} progression at that point`, distanceProgression(journey)),
    section("meaning", "What this result changed", `<p>${inline(story.change)}</p>${milestoneItems.length ? renderList(milestoneItems, true) : '<p>The result added depth to the competitive record without creating a new preserved milestone label.</p>'}`),
    section("next-chapter", "What followed", `<p>${inline(nextStory)}</p>`),
    section("evidence", "Evidence quality and limits", `<div class="callout warning"><strong>${inline(text(evidence.label, "Historical ledger"))}</strong><p>${inline(text(evidence.note, "The canonical race ledger preserves this result; richer source material is not attached to this record."))}</p></div><p><strong>Recorded source quality:</strong> ${inline(text(post.dataQuality, "Not specified"))}</p><p><strong>Pre-race plan:</strong> Not preserved. <strong>Device mechanics:</strong> Not added unless explicitly present in the source ledger.</p>`),
    section("sources", "Sources", sourceSection(post.sources, "Null or omitted fields mean the canonical ledger does not preserve that fact. They are not estimates.")),
  ];
  return reportShell({
    record, phase: "post", kicker: text(post.kicker, number(post.ageGroupPlace) === 1 ? "AGE-GROUP WIN · HISTORICAL RECORD" : "PERMANENT RACE HISTORY"),
    title: story.headline, subtitle: race.name,
    deck: `The story of Aaron’s ${post.officialTime} at ${race.name}: the result, the field, his point-in-time progression, what changed, and the evidence limits.`,
    edition: `Journey edition · Race ${journey?.raceNumber || "—"} in the preserved history · Source tier: ${text(evidence.label, "historical ledger")}`,
    verdict: `**This is the honest meaning of the result at that point in Aaron’s journey.** ${story.change}`,
    facts: [
      { label: "RECORDED TIME", value: post.officialTime, note: text(post.timeStatus, "effective time") },
      { label: "PACE", value: post.officialPace, note: "per mile" },
      { label: "AGE GROUP", value: ag, note: topLabel(post.ageGroupPlace, post.ageGroupSize) },
      { label: "OVERALL", value: overall, note: topLabel(post.overallPlace, post.overallSize) },
      { label: "BIB", value: post.bib, note: "race number" },
      { label: "COURSE", value: race.courseType, note: race.distance },
      { label: "RECORD", value: post.recordLabel, note: "at time of ledger update" },
      { label: "EVIDENCE", value: text(evidence.shortLabel, evidence.label), note: text(post.dataQuality) },
    ], sections,
  });
}

async function writeEdition(record, phase) {
  const reportDir = path.join(paths.reports, record.slug, `${phase}-race`);
  await fs.mkdir(reportDir, { recursive: true });
  const output = path.join(reportDir, "index.html");
  const html = phase === "pre" ? renderPreRaceReport(record) : renderPostRaceReport(record);
  await fs.writeFile(output, html, "utf8");
  return { output, html };
}

export async function buildRecord(recordPath, journeyContext = null) {
  const { record, absolute } = await readRecord(recordPath);
  enrichRecord(record);
  if (journeyContext) record.journeyContext = journeyContext;
  const pre = record.preRace?.status === "not-preserved" ? null : await writeEdition(record, "pre");
  let post = null;
  if (record.postRace?.status === "final") {
    if (record.preRace?.status === "not-preserved") {
      const reportDir = path.join(paths.reports, record.slug, "post-race");
      await fs.mkdir(reportDir, { recursive: true });
      const output = path.join(reportDir, "index.html");
      const html = renderHistoricalRaceReport(record);
      await fs.writeFile(output, html, "utf8");
      post = { output, html };
    } else post = await writeEdition(record, "post");
  }
  const latest = post || pre;
  if (!latest) throw new Error(`Race ${record.slug} has no publishable phase.`);
  const mainDir = path.join(paths.reports, record.slug);
  await fs.mkdir(mainDir, { recursive: true });
  const main = path.join(mainDir, "index.html");
  await fs.writeFile(main, latest.html.replaceAll('../../../assets/report.css', '../../assets/report.css').replaceAll('href="../../../"', 'href="../../"').replaceAll('href="../post-race/"', 'href="post-race/"').replaceAll('href="../pre-race/"', 'href="pre-race/"'), "utf8");
  return { record, recordPath: absolute, pre: pre?.output || null, post: post?.output || null, main };
}

export async function listRecords() {
  await fs.mkdir(paths.races, { recursive: true });
  const entries = await fs.readdir(paths.races, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => path.join(paths.races, entry.name)).sort();
}

export async function buildArchive(built) {
  await fs.mkdir(paths.reports, { recursive: true });
  const records = built.map(({ record }) => record).sort((a, b) => b.race.date.localeCompare(a.race.date));
  const completed = records.filter((record) => record.postRace?.status === "final");
  const wins = completed.filter((record) => number(record.postRace?.ageGroupPlace) === 1).length;
  const podiums = completed.filter((record) => number(record.postRace?.ageGroupPlace) > 0 && number(record.postRace?.ageGroupPlace) <= 3).length;
  const verified = completed.filter((record) => ["complete", "official"].includes(record.evidence?.level)).length;
  const personalRecords = completed.filter((record) => present(record.postRace?.prImprovement) || /\bPR\b|best/i.test(text(record.postRace?.recordLabel))).length;
  const distances = [...new Set(records.map((record) => text(record.race.distance)).filter(Boolean))].sort();
  const years = [...new Set(records.map((record) => record.race.date.slice(0, 4)).filter(Boolean))].sort().reverse();
  const cards = records.map((record) => {
    const final = record.postRace?.status === "final";
    const value = final ? text(record.postRace.officialTime, "Final report") : text(record.preRace.targetTime, "Race plan");
    const award = number(record.postRace?.ageGroupPlace) === 1 ? "win" : number(record.postRace?.ageGroupPlace) <= 3 && number(record.postRace?.ageGroupPlace) > 0 ? "podium" : "finish";
    const evidence = text(record.evidence?.level, final ? "official" : "planned");
    return `<a class="archive-card" data-year="${escapeHtml(record.race.date.slice(0, 4))}" data-distance="${escapeHtml(record.race.distance)}" data-evidence="${escapeHtml(evidence)}" data-award="${award}" href="${escapeHtml(record.slug)}/"><span>${inline(displayDate(record.race.date))} · ${inline(record.race.distance)}</span><h2>${inline(record.race.name)}</h2><strong>${inline(value)}</strong><p>${inline(final ? (record.preRace?.status === "not-preserved" ? "Journey report" : "Full performance story") : "Pre-race plan")}</p><div class="archive-tags"><b>${inline(award === "win" ? "AG win" : award === "podium" ? "AG podium" : "finish")}</b><b>${inline(text(record.evidence?.shortLabel, evidence))}</b></div></a>`;
  }).join("\n");
  const options = (items) => items.map((item) => `<option value="${escapeHtml(item)}">${inline(item)}</option>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aaron Greenwood · Race Reports</title><link rel="stylesheet" href="../assets/report.css"></head><body><header class="masthead"><a class="brand" href="../">AARON’S RUN COACH <span>/ RACE ARCHIVE</span></a><div class="header-actions"><a href="../studio/">Build a race report</a></div></header><main><section class="hero archive-hero"><p class="eyebrow">PERMANENT RACE HISTORY · BEFORE AND AFTER</p><h1>The record,<br><em>race by race.</em></h1><p class="deck">Full pre/post reports for new races. Source-labeled historical result pages for older races. No reconstructed strategy, physiology or mechanics where the evidence does not survive.</p></section><section class="archive-stats" aria-label="Career race statistics"><div><span>RACES</span><strong>${completed.length}</strong><small>completed</small></div><div><span>AGE-GROUP WINS</span><strong>${wins}</strong><small>recorded</small></div><div><span>AGE-GROUP PODIUMS</span><strong>${podiums}</strong><small>top three</small></div><div><span>OFFICIAL / COMPLETE</span><strong>${verified}</strong><small>source tier</small></div></section><section class="archive-controls" aria-label="Filter race archive"><label>Year<select id="filter-year"><option value="">All years</option>${options(years)}</select></label><label>Distance<select id="filter-distance"><option value="">All distances</option>${options(distances)}</select></label><label>Result<select id="filter-award"><option value="">All results</option><option value="win">Age-group wins</option><option value="podium">Other age-group podiums</option><option value="finish">Other finishes</option></select></label><button id="clear-filters" type="button">Clear</button><p id="archive-count" aria-live="polite"></p></section><section class="archive-grid" id="archive-grid">${cards}</section></main><script>(()=>{const cards=[...document.querySelectorAll('.archive-card')];const year=document.querySelector('#filter-year');const distance=document.querySelector('#filter-distance');const award=document.querySelector('#filter-award');const count=document.querySelector('#archive-count');function apply(){let shown=0;for(const card of cards){const visible=(!year.value||card.dataset.year===year.value)&&(!distance.value||card.dataset.distance===distance.value)&&(!award.value||card.dataset.award===award.value);card.hidden=!visible;if(visible)shown++}count.textContent=shown+' race'+(shown===1?'':'s')+' shown'}[year,distance,award].forEach(el=>el.addEventListener('change',apply));document.querySelector('#clear-filters').addEventListener('click',()=>{year.value='';distance.value='';award.value='';apply()});apply()})()</script></body></html>\n`;
  const output = path.join(paths.reports, "index.html");
  await fs.writeFile(output, html, "utf8");
  const publicData = records.map((record) => ({ slug: record.slug, athlete: record.athlete, race: record.race, preStatus: record.preRace?.status, postStatus: record.postRace?.status, evidence: record.evidence || null, result: record.postRace?.status === "final" ? { officialTime: record.postRace.officialTime, officialPace: record.postRace.officialPace, ageGroupPlace: record.postRace.ageGroupPlace, ageGroupSize: record.postRace.ageGroupSize, overallPlace: record.postRace.overallPlace, overallSize: record.postRace.overallSize, recordLabel: record.postRace.recordLabel, dataQuality: record.postRace.dataQuality } : null }));
  await fs.writeFile(path.join(paths.reports, "data.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), stats: { completed: completed.length, ageGroupWins: wins, ageGroupPodiums: podiums, officialOrComplete: verified }, races: publicData }, null, 2)}\n`, "utf8");
  return output;
}

export async function buildMasterIndex(built) {
  const records = built.map(({ record }) => record).sort((a, b) => b.race.date.localeCompare(a.race.date));
  const completed = records.filter((record) => record.postRace?.status === "final");
  const chronological = [...completed].sort((a, b) => a.race.date.localeCompare(b.race.date));
  const wins = completed.filter((record) => number(record.postRace?.ageGroupPlace) === 1).length;
  const podiums = completed.filter((record) => number(record.postRace?.ageGroupPlace) > 0 && number(record.postRace?.ageGroupPlace) <= 3).length;
  const personalRecords = completed.filter((record) => present(record.postRace?.prImprovement) || /\bPR\b|best/i.test(text(record.postRace?.recordLabel))).length;
  const distances = [...new Set(records.map((record) => text(record.race.distance)).filter(Boolean))].sort();
  const years = [...new Set(records.map((record) => record.race.date.slice(0, 4)).filter(Boolean))].sort().reverse();
  const latest = chronological.at(-1);
  const first = chronological[0];
  const victories = chronological.filter((record) => number(record.postRace?.ageGroupPlace) === 1);
  const podiumRate = completed.length ? (podiums / completed.length) * 100 : 0;
  const dateSpan = (start, end) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
  const journeyDays = first && latest ? dateSpan(first.race.date, latest.race.date) : 0;
  const victoryDays = victories.length > 1 ? dateSpan(victories[0].race.date, victories.at(-1).race.date) : 0;
  const winningFormats = new Set(victories.map((record) => text(record.race.distance))).size;
  const progressionFor = (distance) => {
    const starts = chronological.filter((record) => record.race.distance === distance && parseTimeToSeconds(record.postRace?.officialTime) !== null);
    if (starts.length < 2) return null;
    const start = starts[0];
    const best = [...starts].sort((a, b) => parseTimeToSeconds(a.postRace.officialTime) - parseTimeToSeconds(b.postRace.officialTime))[0];
    const startSeconds = parseTimeToSeconds(start.postRace.officialTime);
    const bestSeconds = parseTimeToSeconds(best.postRace.officialTime);
    const improvement = startSeconds - bestSeconds;
    return {
      start,
      best,
      improvement: formatDuration(improvement),
      percent: startSeconds > 0 ? (improvement / startSeconds) * 100 : 0,
      days: dateSpan(start.race.date, best.race.date),
    };
  };
  const fiveK = progressionFor("5K");
  const tenK = progressionFor("10K");
  const optionHtml = (items) => items.map((item) => `<option value="${escapeHtml(item)}">${inline(item)}</option>`).join("");
  const cards = records.map((record) => {
    const final = record.postRace?.status === "final";
    const value = final ? text(record.postRace.officialTime, "Final report") : text(record.preRace?.targetTime, "Race plan");
    const place = number(record.postRace?.ageGroupPlace);
    const award = place === 1 ? "win" : place > 1 && place <= 3 ? "podium" : "finish";
    const evidence = text(record.evidence?.shortLabel, final ? "official" : "planned");
    return `<a class="archive-card" data-year="${escapeHtml(record.race.date.slice(0, 4))}" data-distance="${escapeHtml(record.race.distance)}" data-award="${award}" href="reports/${escapeHtml(record.slug)}/"><span>${inline(displayDate(record.race.date))} · ${inline(record.race.distance)}</span><h2>${inline(record.race.name)}</h2><strong>${inline(value)}</strong><p>${inline(final ? (record.preRace?.status === "not-preserved" ? "Journey report" : "Complete performance story") : "Upcoming race plan")}</p><div class="archive-tags"><b>${inline(award === "win" ? "AG win" : award === "podium" ? "AG podium" : "finish")}</b><b>${inline(evidence)}</b></div></a>`;
  }).join("\n");
  const stats = [
    ["RACES", completed.length, "completed starts"], ["VICTORIES", wins, "age-group wins"], ["PODIUMS", podiums, "top three, including wins"],
    ["PODIUM RATE", `${podiumRate.toFixed(1)}%`, `${podiums} of ${completed.length} starts`], ["PRS / CURRENT BESTS", personalRecords, "recorded benchmarks"], ["DISTANCES", distances.length, "race formats"],
  ].map(([label, value, note]) => `<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("");
  const victoryLabels = ["The breakthrough", "The road breakthrough", "Winning becomes repeatable", "The 5K high-water mark", "Range confirmed", "The statement victory"];
  const victoryCards = victories.map((record, index) => {
    const post = record.postRace;
    const division = post.ageGroupSize ? `1st of ${inline(post.ageGroupSize)} in division` : "Age-group champion";
    const overall = post.overallPlace ? `${inline(post.overallPlace)}${post.overallSize ? ` of ${inline(post.overallSize)}` : ""} overall` : "";
    const distinction = post.winningMargin ? `Won by ${inline(post.winningMargin)}` : text(post.recordLabel);
    return `<a class="victory-card" href="reports/${escapeHtml(record.slug)}/"><span>VICTORY ${String(index + 1).padStart(2, "0")} · ${inline(victoryLabels[index] || "Another win")}</span><time>${inline(displayDate(record.race.date))}</time><h3>${inline(record.race.name)}</h3><strong>${inline(post.officialTime)}</strong><p>${division}${overall ? ` · ${overall}` : ""}</p>${distinction ? `<small>${inline(distinction)}</small>` : ""}</a>`;
  }).join("");
  const progressionCards = [
    fiveK ? ["5K TRANSFORMATION", `${fiveK.start.postRace.officialTime} → ${fiveK.best.postRace.officialTime}`, `${fiveK.improvement} removed from the clock—a ${fiveK.percent.toFixed(1)}% reduction across ${fiveK.days} days. The first preserved 5K was a podium; the fastest was a victory.`] : null,
    tenK ? ["10K TRANSFORMATION", `${tenK.start.postRace.officialTime} → ${tenK.best.postRace.officialTime}`, `${tenK.improvement} faster—a ${tenK.percent.toFixed(1)}% reduction from the first preserved 10K to the hilly Brielle win.`] : null,
    ["COMPETITIVE CONSISTENCY", `${podiums} podiums / ${completed.length} starts`, `${podiumRate.toFixed(1)}% of every preserved start ended in the age-group top three. Victory arrived ${wins} times.`],
    ["WINNING RANGE", `${wins} wins · ${winningFormats} formats`, `The victories span trail, road 5K, off-road half-marathon and hilly 10K racing—not one course type or one distance.`],
  ].filter(Boolean).map(([label, value, note]) => `<div><span>${inline(label)}</span><strong>${inline(value)}</strong><p>${inline(note)}</p></div>`).join("");
  const bestByDistance = new Map();
  for (const record of chronological) {
    const seconds = parseTimeToSeconds(record.postRace?.officialTime);
    const previous = bestByDistance.get(record.race.distance);
    if (seconds !== null && (!previous || seconds < previous.seconds)) bestByDistance.set(record.race.distance, { record, seconds });
  }
  const distanceOrder = ["1 Mile", "5K", "5 Mile", "10K", "Half Marathon", "4 Mile Trail"];
  const bestCards = distanceOrder.filter((distance) => bestByDistance.has(distance)).map((distance) => {
    const record = bestByDistance.get(distance).record;
    return `<a href="reports/${escapeHtml(record.slug)}/"><span>${inline(distance)}</span><strong>${inline(record.postRace.officialTime)}</strong><small>${inline(record.race.name)} · ${inline(displayDate(record.race.date))}</small></a>`;
  }).join("");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aaron Greenwood · Race History and Reports</title><meta name="description" content="Aaron Greenwood's master race dashboard: career statistics, podiums, personal records, pre-race plans and post-race performance reports."><link rel="stylesheet" href="assets/report.css"><link rel="stylesheet" href="assets/dashboard.css"></head>
<body><header class="masthead"><a class="brand" href="./">AARON’S RUN COACH <span>/ HOME</span></a><div class="header-actions"><a href="features/brielle-2026/">Brielle feature</a><a href="studio/">Build a race report</a></div></header>
<main><section class="hero archive-hero"><p class="eyebrow">MASTER RACE INDEX · THROUGH ${inline(displayDate(latest?.race.date).toUpperCase())}</p><h1>From first podium<br><em>to a six-win force.</em></h1><p class="deck">Across ${journeyDays} days, Aaron built a record of ${podiums} podiums in ${completed.length} starts, ${wins} age-group victories and competitive marks from the mile through the half marathon. This is the complete evidence trail—every breakthrough, every win and every race that moved the ceiling.</p></section>
<section class="builder-callout"><div><span>THE NEXT START BEGINS HERE</span><h2>Build the next Brielle-level race plan.</h2><p>Enter an upcoming race, press one button for Aaron’s strategy and guardrails, then preview and download the complete pre-race report.</p></div><a href="studio/">Open the pre-race report builder →</a></section>
<section class="archive-stats dashboard-stats" aria-label="Career race statistics">${stats}</section>
<section class="journey-story" aria-labelledby="journey-title"><div class="section-heading"><p class="eyebrow">THE ASCENT</p><h2 id="journey-title">The results stopped being isolated successes.<br><em>They became a winning pattern.</em></h2></div><div class="journey-copy"><p>The preserved story begins with a third-place age-group finish at Ocean Gate on ${inline(displayDate(first?.race.date))}. The early pattern was persistence: four podiums in the first six starts, each result creating a stronger baseline.</p><p>The competitive identity changed at Christmas in the Pines. That first recorded win began a run of ${wins} victories in ${victoryDays} days. By Brielle, Aaron was no longer arriving as a hopeful podium challenger—he was a repeat winner capable of taking control across distances, surfaces and race shapes.</p></div></section>
<section class="progression-grid" aria-label="Performance progression">${progressionCards}</section>
<section class="victory-section" aria-labelledby="victory-title"><div class="section-heading compact"><p class="eyebrow">THE VICTORY LEDGER</p><h2 id="victory-title">Six races. Six chapters in becoming a winner.</h2><p>Each card opens the full race story and preserves what that victory meant at that exact point in the journey.</p></div><div class="victory-grid">${victoryCards}</div></section>
<section class="dashboard-callout"><div><span>FEATURED PERFORMANCE · VICTORY 06</span><h2>Brielle 2026 · A decisive championship run</h2><p>44:11.6 · 1st of 25 M50–59 · won by 2:38.8 · 19th of 202 overall</p></div><a href="features/brielle-2026/">Read the full victory story →</a></section>
<section class="best-section" aria-labelledby="best-title"><div class="section-heading compact"><p class="eyebrow">CURRENT PERFORMANCE BOARD</p><h2 id="best-title">The fastest marks now in the ledger.</h2><p>Exact-distance bests from the preserved race history. Course, surface and certification context remains inside each report.</p></div><div class="best-grid">${bestCards}</div></section>
<div class="index-heading"><p class="eyebrow">EVERY START · EVERY CHAPTER</p><h2>Open the complete race history.</h2></div>
<section class="archive-controls" aria-label="Filter race index"><label>Year<select id="filter-year"><option value="">All years</option>${optionHtml(years)}</select></label><label>Distance<select id="filter-distance"><option value="">All distances</option>${optionHtml(distances)}</select></label><label>Result<select id="filter-award"><option value="">All results</option><option value="win">Age-group wins</option><option value="podium">Other age-group podiums</option><option value="finish">Other finishes</option></select></label><button id="clear-filters" type="button">Clear</button><p id="archive-count" aria-live="polite"></p></section>
<section class="archive-grid" id="archive-grid">${cards}</section></main>
<script>(()=>{const cards=[...document.querySelectorAll('.archive-card')];const year=document.querySelector('#filter-year');const distance=document.querySelector('#filter-distance');const award=document.querySelector('#filter-award');const count=document.querySelector('#archive-count');function apply(){let shown=0;for(const card of cards){const visible=(!year.value||card.dataset.year===year.value)&&(!distance.value||card.dataset.distance===distance.value)&&(!award.value||card.dataset.award===award.value);card.hidden=!visible;if(visible)shown++}count.textContent=shown+' race'+(shown===1?'':'s')+' shown'}[year,distance,award].forEach(el=>el.addEventListener('change',apply));document.querySelector('#clear-filters').addEventListener('click',()=>{year.value='';distance.value='';award.value='';apply()});apply()})()</script></body></html>\n`;
  const output = path.join(paths.root, "index.html");
  await fs.writeFile(output, html, "utf8");
  return output;
}

export async function buildAll() {
  const recordPaths = await listRecords();
  const sourceRecords = [];
  for (const recordPath of recordPaths) sourceRecords.push((await readRecord(recordPath)).record);
  const journeyContexts = buildJourneyContexts(sourceRecords);
  const built = [];
  for (const recordPath of recordPaths) {
    const slug = path.basename(recordPath, ".json");
    built.push(await buildRecord(recordPath, journeyContexts.get(slug) || null));
  }
  const archive = await buildArchive(built);
  const home = await buildMasterIndex(built);
  return { built, archive, home };
}

export function recordTemplate(slug = "race-name-year") {
  return {
    schemaVersion: 2, slug, athlete: "Aaron Greenwood",
    race: { name: "Race Name", distance: "10K", date: "2026-01-01", startTime: "9:00 AM", timezone: "America/New_York", location: "City, State", venue: "", priority: "B race", purpose: "execute a competitive, healthy race", courseType: "Road", surface: "Paved", certification: "Unverified", registrationUrl: "", resultsUrl: "", courseUrl: "", weatherUrl: "" },
    preRace: { status: "draft", preparedAt: new Date().toISOString().slice(0, 10), headline: "", subhead: "Know the course. Run your race.", deck: "", verdict: "", targetTime: "", targetPace: "", targetPower: "", goalA: "", goalB: "", goalC: "finish healthy", outlook: "State the race purpose, current readiness and central challenge.", guardrails: "Symptoms override pace, power, cadence and competitive goals.", courseSummary: "", weather: "", fieldSize: "", ageGroupSize: "", fieldRead: "", contenders: [], strategySummary: "", strategy: [{ segment: "Opening", pace: "Controlled", power: "", cue: "Settle before pressing." }, { segment: "Middle", pace: "Goal effort", power: "", cue: "Lock rhythm and compete." }, { segment: "Finish", pace: "All available", power: "", cue: "Build cadence and close." }], readinessGreen: "Normal movement, normal warm-up response and no concerning symptoms.", readinessYellow: "Unexpected tightness, fatigue or poor warm-up response: adjust the goal.", readinessRed: "Pain that changes gait or worsens while running: stop.", logistics: [], bibPickup: "", parking: "", arrival: "", warmup: "", shoes: "", fuel: "", hydration: "", equipmentNotes: "", sources: [] },
    postRace: { status: "pending", analyzedAt: "", headline: "", subhead: "", deck: "", verdict: "", officialTime: "", deviceTime: "", officialPace: "", bib: "", division: "Male 50–59", ageGroupPlace: "", ageGroupSize: "", overallPlace: "", overallSize: "", malePlace: "", maleSize: "", winningMargin: "", courseAscent: "", prImprovement: "", recordLabel: "", resultSummary: "", recordNote: "", resultQuote: "", fieldRead: "", competitors: [], executionSummary: "", splits: [], executionDiagnosis: "", avgHR: "", maxHR: "", avgPower: "", normPower: "", aerobicEffect: "", aerobicDiagnosis: "", cadence: "", strideLength: "", groundContact: "", verticalRatio: "", balance: "", closingCadence: "", closingStride: "", closingGroundContact: "", formDiagnosis: "", subjective: "", pain: "", shoes: "", whatWorked: [], opportunities: [], progression: [], progressionSummary: "", futureGoals: [], futureSummary: "", nextStep: "", sources: [] }
  };
}

export const packetTemplate = recordTemplate;
export const validatePacket = validateRecord;
export const readPacket = readRecord;
export const buildPacket = buildRecord;
