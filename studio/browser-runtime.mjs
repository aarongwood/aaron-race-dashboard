const value = (input, fallback = "") => String(input ?? "").trim() || fallback;
const items = (input) => Array.isArray(input) ? input : [];
const has = (input) => value(input) !== "";

export function browserRecordTemplate() {
  return {
    schemaVersion: 2,
    slug: "race-name-year",
    athlete: "Aaron Greenwood",
    race: {
      name: "",
      distance: "5K",
      date: "",
      startTime: "9:00 AM",
      timezone: "America/New_York",
      location: "",
      venue: "",
      priority: "B race",
      purpose: "execute a competitive, healthy race",
      courseType: "Road",
      surface: "Paved",
      certification: "Unverified",
      registrationUrl: "",
      resultsUrl: "",
      courseUrl: "",
      weatherUrl: "",
    },
    preRace: {
      status: "draft",
      preparedAt: new Date().toISOString().slice(0, 10),
      headline: "",
      subhead: "Know the course. Run your race.",
      deck: "",
      verdict: "",
      targetTime: "",
      targetPace: "",
      targetPower: "",
      goalA: "",
      goalB: "",
      goalC: "finish healthy",
      outlook: "",
      guardrails: "",
      courseSummary: "",
      weather: "",
      fieldSize: "",
      ageGroupSize: "",
      fieldRead: "",
      contenders: [],
      strategySummary: "",
      strategy: [],
      readinessGreen: "",
      readinessYellow: "",
      readinessRed: "",
      logistics: [],
      bibPickup: "",
      parking: "",
      arrival: "",
      warmup: "",
      shoes: "",
      fuel: "",
      hydration: "",
      equipmentNotes: "",
      sources: [],
    },
    postRace: {
      status: "pending",
      analyzedAt: "",
      headline: "",
      subhead: "",
      deck: "",
      verdict: "",
      officialTime: "",
      deviceTime: "",
      officialPace: "",
      bib: "",
      division: "Male 50–59",
      ageGroupPlace: "",
      ageGroupSize: "",
      overallPlace: "",
      overallSize: "",
      malePlace: "",
      maleSize: "",
      winningMargin: "",
      courseAscent: "",
      prImprovement: "",
      recordLabel: "",
      resultSummary: "",
      recordNote: "",
      resultQuote: "",
      fieldRead: "",
      competitors: [],
      executionSummary: "",
      splits: [],
      executionDiagnosis: "",
      avgHR: "",
      maxHR: "",
      avgPower: "",
      normPower: "",
      aerobicEffect: "",
      aerobicDiagnosis: "",
      cadence: "",
      strideLength: "",
      groundContact: "",
      verticalRatio: "",
      balance: "",
      closingCadence: "",
      closingStride: "",
      closingGroundContact: "",
      formDiagnosis: "",
      subjective: "",
      pain: "",
      shoes: "",
      whatWorked: [],
      opportunities: [],
      progression: [],
      progressionSummary: "",
      futureGoals: [],
      futureSummary: "",
      nextStep: "",
      sources: [],
    },
  };
}

function setBlank(object, key, next) {
  if (!has(object[key])) object[key] = next;
}

function distanceFamily(distance) {
  const normalized = value(distance).toLowerCase();
  if (normalized.includes("marathon") && !normalized.includes("half")) return "marathon";
  if (normalized.includes("half")) return "half";
  if (normalized.includes("10k") || normalized.includes("12k") || normalized.includes("15k") || normalized.includes("10 mile")) return "long-road";
  if (normalized.includes("mile") && !normalized.includes("5 mile")) return "mile";
  if (normalized.includes("trail")) return "trail";
  return "short-road";
}

function starterStrategy(record) {
  const pre = record.preRace;
  const pace = value(pre.targetPace, "Effort-led");
  const power = value(pre.targetPower, "Optional");
  const family = distanceFamily(record.race.distance);
  const plans = {
    mile: [
      ["Opening 400 m", "Controlled-fast", power, "Establish position without sprinting the first turn."],
      ["Middle 800 m", pace, power, "Hold posture, rhythm and contact with the race."],
      ["Final 400 m", "Progress to all available", "Uncapped if Green", "Commit in stages; use cadence before strain."],
    ],
    "short-road": [
      ["Start–mile 1", "Slightly slower than goal average", power, "Settle breathing and mechanics before pressing."],
      ["Middle miles", pace, power, "Lock rhythm, run tangents and compete without surging."],
      ["Final mile", "Progressive", power, "Increase commitment while form remains organized."],
      ["Final 400 m", "All available", "Uncapped if Green", "Quick feet, relaxed shoulders, race through the line."],
    ],
    "long-road": [
      ["Opening mile", "Controlled", power, "Let the field go if necessary; make the race come back to you."],
      ["Early middle", pace, power, "Settle into economical rhythm and take free speed."],
      ["Late middle", "Goal effort", power, "Stay patient through terrain and make clean passes."],
      ["Final 2 km", "Progress if Green", "Upper race range", "Compete directly; finish with mechanics, not strain."],
    ],
    half: [
      ["First 5K", "Conservative", power, "Protect the day from early enthusiasm."],
      ["5K–15K", pace, power, "Fuel on schedule and hold economical rhythm."],
      ["15K–20K", "Goal effort", power, "Stay tall and shorten the decision horizon."],
      ["Final 1.1K", "Progress if Green", "All sustainable", "Build cadence and compete through the line."],
    ],
    marathon: [
      ["First 10K", "Deliberately conservative", power, "Let pace come to you; fuel before you feel a need."],
      ["10K–half", pace, power, "Stay economical, calm and exact with fueling."],
      ["Half–20 miles", "Hold planned effort", power, "Protect mechanics and solve one mile at a time."],
      ["Final 10K", "Effort-led", "Only progress if Green", "Race the final hour; do not borrow from it early."],
    ],
    trail: [
      ["Opening terrain", "Controlled by effort", power, "Stay patient while footing and traffic settle."],
      ["Climbs", "Sustainable pressure", "Cap effort", "Short steps, quick contact; hike only if it is faster."],
      ["Runnable / descents", "Free speed", "Let power fall", "Quick feet, sight the line and avoid braking."],
      ["Final segment", "Progress if Green", "All sustainable", "Compete without sacrificing footing or form."],
    ],
  };
  return (plans[family] || plans["short-road"]).map(([segment, segmentPace, segmentPower, cue]) => ({ segment, pace: segmentPace, power: segmentPower, cue }));
}

function parseStartMinutes(startTime) {
  const match = value(startTime).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

function clockBefore(startMinutes, offset, fallback) {
  if (startMinutes === null) return fallback;
  let total = (startMinutes - offset + 1440) % 1440;
  const hour24 = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hour24 % 12 || 12}:${String(minutes).padStart(2, "0")} ${hour24 >= 12 ? "PM" : "AM"}`;
}

function starterLogistics(record) {
  const start = parseStartMinutes(record.race.startTime);
  return [
    { time: clockBefore(start, 180, "T–3:00"), item: "Familiar breakfast and first fluids; nothing experimental." },
    { time: clockBefore(start, 90, "T–1:30"), item: "Arrive, park, collect bib and locate bathrooms and staging." },
    { time: clockBefore(start, 45, "T–0:45"), item: "Begin the distance-appropriate warm-up and readiness check." },
    { time: clockBefore(start, 15, "T–0:15"), item: "Final equipment check, staging and one clear execution cue." },
    { time: value(record.race.startTime, "START"), item: "Race start." },
  ];
}

export function populateStarterPlan(record) {
  const race = record.race;
  const pre = record.preRace;
  const family = distanceFamily(race.distance);
  const purpose = value(race.purpose, "execute a competitive, healthy race");
  setBlank(pre, "preparedAt", new Date().toISOString().slice(0, 10));
  setBlank(pre, "headline", value(race.name, "Race day"));
  setBlank(pre, "subhead", "Know the course. Run your race.");
  setBlank(pre, "deck", `The complete ${value(race.distance, "race")} plan for ${value(race.name, "the next start")}: purpose, logistics, course, competition, execution and health guardrails.`);
  setBlank(pre, "verdict", `**The purpose is to ${purpose}.** Control the opening, respond to the verified course, and make the competitive decision only after the race is established.`);
  setBlank(pre, "goalA", `${value(race.priority, "Race")}: execute the best supported performance while staying inside health guardrails`);
  setBlank(pre, "goalB", "Run progressively, keep mechanics organized and compete intelligently over the final third");
  setBlank(pre, "goalC", "Finish healthy and protect the next training block");
  setBlank(pre, "outlook", `${value(race.name, "This race")} is a ${value(race.priority, "scheduled race")} whose job is to ${purpose}. Current fitness can be expressed only if Aaron starts under control, respects the course, and reaches the decisive portion with healthy mechanics.`);
  setBlank(pre, "guardrails", "Pain that changes gait, sharp or escalating symptoms, illness, dizziness or an abnormal warm-up response override pace, power, cadence and competitive goals. Aaron’s tendency to do too much is managed by preserving the next training block, not borrowing from it.");
  setBlank(pre, "courseSummary", `${value(race.courseType, "Course type not yet verified")} over ${value(race.surface, "an unverified surface")}. Confirm the official map, elevation, turns and measurement before assigning narrow pace targets; race by effort where terrain changes the cost.`);
  setBlank(pre, "weather", "Add the final forecast 24–48 hours before the start. Heat, humidity, wind or poor footing should change pace expectations before they change safe effort.");
  setBlank(pre, "fieldRead", "No verified entry-list analysis has been added yet. Treat registrations as a dated seed, verify returning results where available, and race the athletes who actually start.");
  setBlank(pre, "strategySummary", `The ${value(race.distance, "race")} should build from control to commitment. Pace may change with terrain and conditions; effort and mechanical organization govern the plan.`);
  if (!items(pre.strategy).length) pre.strategy = starterStrategy(record);
  setBlank(pre, "readinessGreen", "Normal gait and stairs, ordinary soreness only, stable energy and a warm-up that improves movement: race the supported plan.");
  setBlank(pre, "readinessYellow", "Heavy legs, incomplete recovery or mild tightness with normal gait: reduce the target, extend the warm-up and reassess.");
  setBlank(pre, "readinessRed", "Sharp or increasing pain, gait change, illness, dizziness, abnormal fatigue or worsening symptoms: do not race hard.");
  if (!items(pre.logistics).length) pre.logistics = starterLogistics(record);
  setBlank(pre, "arrival", "Target arrival 75–90 minutes before the start, adjusted for parking, bib pickup and course access.");
  setBlank(pre, "warmup", family === "mile" || family === "short-road" ? "Easy running, mobility, activation and short progressive strides; finish warm, not tired." : "Easy movement, mobility and activation; use only the amount of running that improves readiness without spending race energy.");
  setBlank(pre, "fuel", family === "half" || family === "marathon" ? "Use the practiced pre-race meal and the practiced on-course carbohydrate schedule; do not improvise products or timing." : "Use the familiar pre-race meal and optional practiced pre-start carbohydrate; in-race fuel is unnecessary unless previously trained for this event." );
  setBlank(pre, "hydration", "Arrive normally hydrated, use practiced sodium/fluid choices, and adjust quantity to verified weather rather than forcing a fixed volume.");
  setBlank(pre, "equipmentNotes", "Charge the watch, confirm data screens and auto-lap settings, pin the bib, and choose only equipment already proven in training or racing.");
  const sources = items(pre.sources);
  const candidates = [
    ["Official race page", race.registrationUrl, "date, start, registration and organizer logistics"],
    ["Official course / map", race.courseUrl, "route, surface, turns and elevation"],
    ["Forecast source", race.weatherUrl, "race-morning conditions"],
  ];
  for (const [label, url, note] of candidates) if (has(url) && !sources.some((source) => source.url === url)) sources.push({ label, url, note });
  pre.sources = sources;
  return record;
}

const escapeHtml = (input = "") => String(input).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function inline(input = "") {
  let output = escapeHtml(input);
  output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return output;
}

function displayDate(input) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value(input))) return value(input, "Date TBD");
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${input}T00:00:00Z`));
}

function renderTable(columns, rows) {
  if (!rows.length) return '<p class="empty-note">No entries supplied yet.</p>';
  return `<div class="table-scroll"><table><thead><tr>${columns.map((column) => `<th>${inline(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr${row.highlight ? ' class="winner-row"' : ""}>${row.cells.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderMetrics(metrics, className = "metric-grid") {
  const filtered = metrics.filter((metric) => has(metric.value));
  return filtered.length ? `<div class="${className}">${filtered.map((metric) => `<div><span>${inline(metric.label)}</span><strong>${inline(metric.value)}</strong>${metric.note ? `<small>${inline(metric.note)}</small>` : ""}</div>`).join("")}</div>` : "";
}

function renderList(values, ordered = false) {
  const filtered = items(values).filter(has);
  if (!filtered.length) return '<p class="empty-note">Nothing recorded yet.</p>';
  const tag = ordered ? "ol" : "ul";
  return `<${tag} class="${ordered ? "numbered-analysis" : "opportunity-list"}">${filtered.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`;
}

function sourceSection(sources, note) {
  const rows = items(sources).filter((source) => has(source.label) || has(source.url));
  const links = rows.map((source) => {
    let url = "";
    try { const parsed = new URL(source.url); if (["http:", "https:"].includes(parsed.protocol)) url = parsed.href; } catch { /* label-only source */ }
    return `<li>${url ? `<a href="${escapeHtml(url)}">${inline(source.label || url)}</a>` : inline(source.label)}${source.note ? ` — ${inline(source.note)}` : ""}</li>`;
  }).join("");
  return `${links ? `<ul>${links}</ul>` : '<p class="empty-note">No external sources recorded.</p>'}<p class="source-note">${inline(note)}</p>`;
}

function reportShell(record, phase, options, sections, urls) {
  const race = record.race;
  const nav = sections.map((section) => `<a href="#${escapeHtml(section.id)}">${inline(section.title)}</a>`).join("");
  const body = sections.map((section, index) => `<h2 id="${escapeHtml(section.id)}"><span class="section-number">${String(index + 1).padStart(2, "0")}</span>${inline(section.title)}</h2>${section.body}`).join("");
  const facts = options.facts.filter((fact) => has(fact.value)).map((fact) => `<div><span>${inline(fact.label)}</span><strong>${inline(fact.value)}</strong>${fact.note ? `<small>${inline(fact.note)}</small>` : ""}</div>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(race.name)} · ${phase === "pre" ? "Race plan" : "Performance report"}</title><meta name="description" content="${escapeHtml(options.deck)}"><meta name="theme-color" content="#102c34"><link rel="stylesheet" href="${escapeHtml(urls.css)}"></head><body><a class="skip" href="#report">Skip to report</a><header class="masthead"><a class="brand" href="${escapeHtml(urls.dashboard)}">AARON’S RUN COACH <span>/ ${phase === "pre" ? "RACE PLAN" : "RACE REPORT"}</span></a><div class="header-actions"><button type="button" onclick="window.print()">Print / Save PDF</button></div></header><main id="top"><section class="hero ${phase === "post" ? "victory-hero" : ""}"><p class="eyebrow">${inline(value(race.location).toUpperCase())} · ${inline(displayDate(race.date).toUpperCase())}</p><p class="kicker">${inline(options.kicker)}</p><h1>${inline(options.title)}${options.subtitle ? `<br><em>${inline(options.subtitle)}</em>` : ""}</h1><p class="deck">${inline(options.deck)}</p><p class="edition">${inline(options.edition)}</p></section><section class="facts facts-eight" aria-label="Race facts">${facts}</section><div class="verdict"><p class="verdict-label">THE VERDICT</p><p>${inline(options.verdict)}</p></div><div class="layout"><aside><details open><summary>IN THIS REPORT</summary><nav aria-label="Report sections">${nav}</nav></details></aside><article id="report">${body}</article></div></main><footer><p><strong>${inline(record.athlete)} · ${inline(race.name)} · ${inline(displayDate(race.date))}</strong></p><p>Generated by Aaron’s Race Report Builder from one reusable race record.</p><a href="#top">Back to top</a></footer></body></html>`;
}

function preRaceReport(record, urls) {
  const race = record.race;
  const pre = record.preRace;
  const logistics = items(pre.logistics).map((item) => ({ cells: [value(item.time, "TBD"), value(item.item)] }));
  const contenders = items(pre.contenders).map((item) => ({ cells: [value(item.name), value(item.age, "—"), value(item.best, "—"), value(item.evidence, "—"), value(item.threat, "Watch")], highlight: Boolean(item.highlight) }));
  const strategy = items(pre.strategy).map((item) => ({ cells: [value(item.segment), value(item.pace, "Effort-led"), value(item.power, "—"), value(item.cue)] }));
  const goals = [pre.goalA && `**A goal:** ${pre.goalA}`, pre.goalB && `**B goal:** ${pre.goalB}`, pre.goalC && `**C goal:** ${pre.goalC}`].filter(Boolean);
  const sections = [
    { id: "race-day-outlook", title: "The race-day outlook", body: `<p>${inline(pre.outlook)}</p>${pre.guardrails ? `<div class="callout warning"><strong>Guardrails</strong><p>${inline(pre.guardrails)}</p></div>` : ""}` },
    { id: "logistics", title: "Race-day logistics", body: `${renderTable(["Time", "Action"], logistics)}${pre.bibPickup ? `<p><strong>Registration / bib:</strong> ${inline(pre.bibPickup)}</p>` : ""}${pre.parking ? `<p><strong>Parking:</strong> ${inline(pre.parking)}</p>` : ""}${pre.arrival ? `<p><strong>Arrival:</strong> ${inline(pre.arrival)}</p>` : ""}${pre.warmup ? `<p><strong>Warm-up:</strong> ${inline(pre.warmup)}</p>` : ""}` },
    { id: "course-and-conditions", title: "Course, weather and implications", body: `${renderMetrics([{ label: "COURSE", value: race.courseType, note: race.surface }, { label: "CERTIFICATION", value: race.certification }, { label: "FORECAST", value: pre.weather }, { label: "START", value: race.startTime, note: race.timezone }])}<p>${inline(value(pre.courseSummary, "Course specifics are not yet verified; race by effort until they are."))}</p>` },
    { id: "competitive-field", title: "Competitive field", body: `<p>${inline(value(pre.fieldRead, "Treat the entry list as a dated snapshot."))}</p>${renderTable(["Athlete", "Age", "Known mark", "Evidence", "Read"], contenders)}${renderMetrics([{ label: "FIELD", value: pre.fieldSize, note: "entered / expected" }, { label: "AGE GROUP", value: pre.ageGroupSize, note: "entered / expected" }])}` },
    { id: "race-execution", title: "Race execution", body: `<p>${inline(pre.strategySummary)}</p>${renderTable(["Segment", "Pace / effort", "Power", "Execution cue"], strategy)}<h3>Goal hierarchy</h3>${renderList(goals)}` },
    { id: "readiness-gate", title: "Race-morning readiness gate", body: `<div class="callout success"><strong>GREEN · Race</strong><p>${inline(pre.readinessGreen)}</p></div><div class="callout warning"><strong>YELLOW · Adjust</strong><p>${inline(pre.readinessYellow)}</p></div><div class="callout danger"><strong>RED · Stop</strong><p>${inline(pre.readinessRed)}</p></div>` },
    { id: "fuel-footwear", title: "Fuel, hydration and footwear", body: `${renderMetrics([{ label: "SHOES", value: pre.shoes }, { label: "FUEL", value: pre.fuel }, { label: "HYDRATION", value: pre.hydration }])}<p>${inline(value(pre.equipmentNotes, "Use only practiced equipment and nutrition."))}</p>` },
    { id: "sources", title: "Sources and limits", body: sourceSection(pre.sources, "Organizer information, forecasts and entry lists can change. Verify critical logistics on race morning; keep predictions separate from official results.") },
  ];
  return reportShell(record, "pre", {
    kicker: value(pre.kicker, `${value(race.priority, "RACE")} · PRE-RACE PLAN`),
    title: value(pre.headline, race.name),
    subtitle: value(pre.subhead, "Know the course. Run your race."),
    deck: value(pre.deck, `The complete ${race.distance} plan for ${record.athlete}.`),
    edition: `Prepared ${displayDate(pre.preparedAt)} · Browser-generated pre-race edition`,
    verdict: value(pre.verdict, `**The purpose is ${value(race.purpose, "to execute well")}.** Control the opening and let the race come to you.`),
    facts: [
      { label: "DISTANCE", value: race.distance, note: race.courseType }, { label: "START", value: race.startTime, note: race.timezone },
      { label: "TARGET", value: pre.targetTime, note: "time" }, { label: "TARGET PACE", value: pre.targetPace, note: "per mile" },
      { label: "TARGET POWER", value: pre.targetPower, note: "race range" }, { label: "FIELD", value: pre.fieldSize, note: "snapshot" },
      { label: "AGE GROUP", value: pre.ageGroupSize, note: "snapshot" }, { label: "FOOTWEAR", value: pre.shoes, note: "planned" },
    ],
  }, sections, urls);
}

function placementText(place, size) {
  return has(place) && has(size) ? `${place} / ${size}` : value(place);
}

function postRaceReport(record, urls) {
  const race = record.race;
  const post = record.postRace;
  const win = Number(post.ageGroupPlace) === 1;
  const competitors = items(post.competitors).map((item) => ({ cells: [value(item.place), value(item.name), value(item.time), value(item.gap, "—")], highlight: item.highlight || value(item.name).toLowerCase() === value(record.athlete).toLowerCase() }));
  const splits = items(post.splits).map((item) => ({ cells: [value(item.segment), value(item.pace), value(item.hr, "—"), value(item.power, "—"), value(item.note)], highlight: Boolean(item.highlight) }));
  const future = items(post.futureGoals).map((item) => `<div><span>${inline(item.label)}</span><h3>${inline(item.title)}</h3><p>${inline(item.text)}</p></div>`).join("");
  const sections = [
    { id: "result", title: win ? "The victory" : "The result", body: `<p>${inline(post.resultSummary)}</p>${post.recordNote ? `<p>${inline(post.recordNote)}</p>` : ""}<blockquote>${inline(value(post.resultQuote, win ? "He did not merely enter the field. He changed its order." : "The clock records the performance; the evidence explains it."))}</blockquote>` },
    { id: "race-execution", title: "Race execution", body: `<p>${inline(post.executionSummary)}</p>${renderTable(["Course segment", "Pace", "HR", "Power", "What it says"], splits)}<p>${inline(post.executionDiagnosis)}</p>` },
    { id: "competitive-field", title: win ? "The field Aaron disrupted" : "Competitive-field result", body: `<p>${inline(post.fieldRead)}</p>${renderTable(["Place", "Athlete", "Time", "Gap"], competitors)}${renderMetrics([{ label: "AGE GROUP", value: placementText(post.ageGroupPlace, post.ageGroupSize) }, { label: "OVERALL", value: placementText(post.overallPlace, post.overallSize) }, { label: "MEN", value: placementText(post.malePlace, post.maleSize) }, { label: "MARGIN", value: post.winningMargin }])}` },
    { id: "aerobic-diagnosis", title: "Aerobic diagnosis", body: `${renderMetrics([{ label: "AVG / MAX HR", value: post.avgHR && post.maxHR ? `${post.avgHR} / ${post.maxHR}` : post.avgHR }, { label: "AVG / NORM POWER", value: post.avgPower && post.normPower ? `${post.avgPower} / ${post.normPower}` : post.avgPower }, { label: "AEROBIC EFFECT", value: post.aerobicEffect }, { label: "DURATION", value: post.deviceTime || post.officialTime }])}<p>${inline(post.aerobicDiagnosis)}</p>` },
    { id: "form", title: "Form under pressure", body: `<p>${inline(post.formDiagnosis)}</p>${renderMetrics([{ label: "CADENCE", value: post.cadence }, { label: "STRIDE", value: post.strideLength }, { label: "GROUND CONTACT", value: post.groundContact }, { label: "VERTICAL RATIO", value: post.verticalRatio }, { label: "BALANCE", value: post.balance }, { label: "CLOSING CADENCE", value: post.closingCadence }], "comparison")}` },
    { id: "what-worked", title: "What made it possible", body: renderList(post.whatWorked, true) },
    { id: "opportunities", title: "Where the next gains live", body: renderList(post.opportunities) },
    { id: "future", title: "How far this can go", body: `${future ? `<div class="horizon-grid">${future}</div>` : '<p class="empty-note">Add future goals after interpreting the result.</p>'}<p>${inline(post.futureSummary)}</p>` },
    { id: "next-steps", title: "What comes next", body: `<div class="callout success"><strong>Convert the race into fitness</strong><p>${inline(post.nextStep)}</p></div><p><strong>Athlete report:</strong> ${inline(value(post.subjective, "Not supplied."))}</p><p><strong>Pain / injury:</strong> ${inline(value(post.pain, "Not supplied."))}</p>` },
    { id: "sources", title: "Sources and limits", body: sourceSection(post.sources, "Official results control time and placement; device data supplies physiological and mechanical context. Keep facts, calculations and interpretation distinct.") },
  ];
  return reportShell(record, "post", {
    kicker: value(post.kicker, win ? "AGE-GROUP CHAMPION" : "POST-RACE ANALYSIS"),
    title: value(post.headline, win ? "A disrupting force" : "The performance, diagnosed"),
    subtitle: value(post.subhead, `at ${race.name}.`),
    deck: value(post.deck, `${record.athlete} ran ${value(post.officialTime, "a recorded result")} at ${race.name}; this report explains what it means.`),
    edition: `Final post-race edition · ${post.analyzedAt ? `Analyzed ${displayDate(post.analyzedAt)}` : "browser-generated"}`,
    verdict: value(post.verdict, `**This result belongs in the permanent record.** ${value(post.resultSummary)}`),
    facts: [
      { label: "OFFICIAL TIME", value: post.officialTime }, { label: "OFFICIAL PACE", value: post.officialPace },
      { label: "AGE GROUP", value: placementText(post.ageGroupPlace, post.ageGroupSize), note: post.division },
      { label: "OVERALL", value: placementText(post.overallPlace, post.overallSize) }, { label: "MEN", value: placementText(post.malePlace, post.maleSize) },
      { label: "MARGIN", value: post.winningMargin }, { label: "CLIMBING", value: post.courseAscent }, { label: "IMPROVEMENT", value: post.prImprovement, note: post.recordLabel },
    ],
  }, sections, urls);
}

export function renderBrowserReport(record, phase, urls) {
  return phase === "post" ? postRaceReport(record, urls) : preRaceReport(record, urls);
}

export function extractRaceBasics(html, sourceUrl) {
  const document = new DOMParser().parseFromString(html, "text/html");
  let event = null;
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent);
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const next = queue.shift();
        if (!next || typeof next !== "object") continue;
        const types = Array.isArray(next["@type"]) ? next["@type"] : [next["@type"]];
        if (types.includes("Event")) { event = next; break; }
        if (Array.isArray(next["@graph"])) queue.push(...next["@graph"]);
      }
    } catch { /* malformed publisher metadata */ }
    if (event) break;
  }
  const meta = (selector) => document.querySelector(selector)?.content || "";
  const name = value(event?.name || meta('meta[property="og:title"]') || document.title).replace(/\s*[|·–]\s*(RunSignup|Race Entry|UltraSignup).*$/i, "").trim();
  const dateValue = value(event?.startDate || meta('meta[property="event:start_time"]'));
  const date = /^\d{4}-\d{2}-\d{2}/.exec(dateValue)?.[0] || "";
  const distance = name.match(/\b(1\s*mile|5K|8K|10K|12K|15K|half(?:\s+marathon)?|marathon|50K|50\s*mile)\b/i)?.[1] || "";
  const location = event?.location;
  const address = typeof location?.address === "object" ? location.address : {};
  return {
    name,
    date,
    distance,
    location: [address.addressLocality, address.addressRegion].filter(Boolean).join(", ") || value(typeof location === "string" ? location : location?.name),
    venue: value(typeof location === "object" ? location.name : ""),
    registrationUrl: sourceUrl,
  };
}

export function downloadText(filename, content, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
