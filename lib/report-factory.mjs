import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    if (!present(pre.outlook)) errors.push("preRace.outlook is required for a pre-race report.");
    if (!list(pre.strategy).length) errors.push("preRace.strategy needs at least one course segment.");
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

function reportShell({ record, phase, kicker, title, subtitle, deck, edition, facts, verdict, sections }) {
  const race = record.race;
  const cssHref = "../../../assets/report.css";
  const nav = sections.map((item) => `<a href="#${escapeHtml(item.id)}">${inline(item.title)}</a>`).join("\n");
  const sectionHtml = sections.map((item, index) => `<h2 id="${escapeHtml(item.id)}"><span class="section-number">${String(index + 1).padStart(2, "0")}</span>${inline(item.title)}</h2>\n${item.body}`).join("\n");
  const factHtml = facts.filter((fact) => present(fact.value)).map((fact) => `<div><span>${inline(fact.label)}</span><strong>${inline(fact.value)}</strong>${fact.note ? `<small>${inline(fact.note)}</small>` : ""}</div>`).join("\n");
  const otherPhase = phase === "pre" ? "post-race" : "pre-race";
  const otherLabel = phase === "pre" ? "Post-race edition" : "Pre-race plan";
  const otherLink = phase === "post" || record.postRace?.status === "final" ? `<a href="../${otherPhase}/">${otherLabel}</a>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(race.name)} · ${escapeHtml(phase === "pre" ? "Race plan" : "Performance report")}</title><meta name="description" content="${escapeHtml(deck)}"><meta name="theme-color" content="#102c34"><link rel="stylesheet" href="${cssHref}"></head>
<body><a class="skip" href="#report">Skip to report</a><header class="masthead"><a class="brand" href="../../">AARON’S RUN COACH <span>/ ${phase === "pre" ? "RACE PLAN" : "RACE REPORT"}</span></a><div class="header-actions">${otherLink}<button type="button" onclick="window.print()">Print / Save PDF</button></div></header>
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
  const competitors = list(post.competitors).map((item) => ({ cells: [text(item.place), text(item.name), text(item.time), text(item.gap, "—")], highlight: Boolean(item.highlight) || text(item.name).toLowerCase() === text(record.athlete).toLowerCase() }));
  const splits = list(post.splits).map((item) => ({ cells: [text(item.segment), text(item.pace), text(item.hr, "—"), text(item.power, "—"), text(item.note)], highlight: Boolean(item.highlight) }));
  const progression = list(post.progression).map((item) => `<div${item.highlight ? ' class="timeline-win"' : ""}><time>${inline(item.label)}</time><strong>${inline(item.value)}</strong><span>${inline(item.note)}</span></div>`).join("");
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
    section("progression", "How far he has come", `${progression ? `<div class="timeline">${progression}</div>` : '<p class="empty-note">Add prior benchmarks to show the progression.</p>'}${post.progressionSummary ? `<p>${inline(post.progressionSummary)}</p>` : ""}`),
    section("opportunities", "Where the next gains live", renderList(list(post.opportunities))),
    section("future", "How far this can go", `${future ? `<div class="horizon-grid">${future}</div>` : '<p class="empty-note">Add future goals after interpreting the result.</p>'}${post.futureSummary ? `<p>${inline(post.futureSummary)}</p>` : ""}`),
    section("next-steps", "What comes next", `<div class="callout success"><strong>Convert the race into fitness</strong><p>${inline(text(post.nextStep, "Recover from the race-sized load, absorb the adaptation, and resume the larger training plan without repaying missed miles."))}</p></div><p><strong>Athlete report:</strong> ${inline(text(post.subjective, "Not supplied."))}</p><p><strong>Pain / injury:</strong> ${inline(text(post.pain, "Not supplied."))}</p>`),
    section("sources", "Sources and limits", sourceSection(post.sources, "Measured facts, derived calculations and coaching interpretation are distinct. Official results control time and placement; device data supplies physiological and mechanical context.")),
  ];
  return reportShell({ record, phase: "post", kicker: text(post.kicker, win ? "AGE-GROUP CHAMPION" : "POST-RACE ANALYSIS"), title: text(post.headline, win ? "A disrupting force" : "The performance, diagnosed"), subtitle: text(post.subhead, `at ${race.name}.`), deck: text(post.deck, `${record.athlete} ran ${text(post.officialTime, "a recorded result")} at ${race.name}; this report explains the result, execution and what it changes.`), edition: `Final post-race edition · ${text(post.analyzedAt ? `Analyzed ${displayDate(post.analyzedAt)}` : "official result and athlete evidence")}`, verdict: text(post.verdict, `**This result belongs in the permanent record.** ${text(post.resultSummary)}`), facts: [{ label: "OFFICIAL TIME", value: post.officialTime, note: post.deviceTime ? `Device: ${post.deviceTime}` : "final" }, { label: "OFFICIAL PACE", value: post.officialPace, note: "per mile" }, { label: "AGE GROUP", value: ag, note: text(post.division, "placement") }, { label: "OVERALL", value: overall, note: topLabel(post.overallPlace, post.overallSize) }, { label: "MEN", value: men, note: topLabel(post.malePlace, post.maleSize) }, { label: "MARGIN", value: post.winningMargin, note: win ? "over second" : "competitive gap" }, { label: "CLIMBING", value: post.courseAscent, note: "device ascent" }, { label: "IMPROVEMENT", value: post.prImprovement, note: post.recordLabel || "vs. prior best" }], sections });
}

async function writeEdition(record, phase) {
  const reportDir = path.join(paths.reports, record.slug, `${phase}-race`);
  await fs.mkdir(reportDir, { recursive: true });
  const output = path.join(reportDir, "index.html");
  const html = phase === "pre" ? renderPreRaceReport(record) : renderPostRaceReport(record);
  await fs.writeFile(output, html, "utf8");
  return { output, html };
}

export async function buildRecord(recordPath) {
  const { record, absolute } = await readRecord(recordPath);
  enrichRecord(record);
  const pre = await writeEdition(record, "pre");
  let post = null;
  if (record.postRace?.status === "final") post = await writeEdition(record, "post");
  const latest = post || pre;
  const mainDir = path.join(paths.reports, record.slug);
  await fs.mkdir(mainDir, { recursive: true });
  const main = path.join(mainDir, "index.html");
  await fs.writeFile(main, latest.html.replaceAll('../../../assets/report.css', '../../assets/report.css').replaceAll('href="../../"', 'href="../"').replaceAll('href="../post-race/"', 'href="post-race/"').replaceAll('href="../pre-race/"', 'href="pre-race/"'), "utf8");
  return { record, recordPath: absolute, pre: pre.output, post: post?.output || null, main };
}

export async function listRecords() {
  await fs.mkdir(paths.races, { recursive: true });
  const entries = await fs.readdir(paths.races, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => path.join(paths.races, entry.name)).sort();
}

export async function buildArchive(built) {
  await fs.mkdir(paths.reports, { recursive: true });
  const cards = built.sort((a, b) => b.record.race.date.localeCompare(a.record.race.date)).map(({ record }) => {
    const final = record.postRace?.status === "final";
    const value = final ? text(record.postRace.officialTime, "Final report") : text(record.preRace.targetTime, "Race plan");
    return `<a class="archive-card" href="${escapeHtml(record.slug)}/"><span>${inline(displayDate(record.race.date))}</span><h2>${inline(record.race.name)}</h2><strong>${inline(value)}</strong><p>${inline(final ? "Final post-race report" : "Pre-race plan")}</p></a>`;
  }).join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aaron Greenwood · Race Reports</title><link rel="stylesheet" href="../assets/report.css"></head><body><header class="masthead"><a class="brand" href="../">AARON’S RUN COACH <span>/ RACE ARCHIVE</span></a></header><main><section class="hero"><p class="eyebrow">ONE RECORD · BEFORE AND AFTER</p><h1>Race plans<br><em>and performance reports.</em></h1><p class="deck">Every race begins with a researched plan and closes with an evidence-based diagnosis. Both editions remain in the permanent archive.</p></section><section class="archive-grid">${cards}</section></main></body></html>\n`;
  const output = path.join(paths.reports, "index.html");
  await fs.writeFile(output, html, "utf8");
  return output;
}

export async function buildAll() {
  const built = [];
  for (const recordPath of await listRecords()) built.push(await buildRecord(recordPath));
  return { built, archive: await buildArchive(built) };
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
