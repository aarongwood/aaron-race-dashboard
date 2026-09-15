const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let record;
let phase = "pre";
let existingSlug = "";

const arrayShapes = {
  contenders: ["name", "age", "best", "evidence", "threat"],
  strategy: ["segment", "pace", "power", "cue"],
  logistics: ["time", "item"],
  sources: ["label", "url", "note"],
  competitors: ["place", "name", "time", "gap"],
  splits: ["segment", "pace", "hr", "power", "note"],
  progression: ["label", "value", "note"],
  futureGoals: ["label", "title", "text"],
};

const getPath = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const setPath = (object, path, value) => {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((item, key) => item[key] ??= {}, object);
  target[last] = value;
};
const slugify = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const escapeHtml = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const lineArray = (value) => String(value || "").split("\n").map((line) => line.trim()).filter(Boolean);
const parseRows = (value, shape) => lineArray(value).map((line) => Object.fromEntries(arrayShapes[shape].map((key, index) => [key, (line.split("|")[index] || "").trim()])));
const formatRows = (value, shape) => (Array.isArray(value) ? value : []).map((row) => arrayShapes[shape].map((key) => row[key] || "").join(" | ")).join("\n");

function show(message, ok = true) {
  const status = $("#status");
  status.textContent = message;
  status.className = `status ${ok ? "ok" : "error"}`;
}

function field(label, path, options = {}) {
  const tag = options.type === "textarea" ? "textarea" : "input";
  const attrs = [`data-path="${path}"`];
  if (options.type && options.type !== "textarea") attrs.push(`type="${options.type}"`);
  if (options.placeholder) attrs.push(`placeholder="${escapeHtml(options.placeholder)}"`);
  if (options.array) attrs.push(`data-array="${options.array}"`);
  if (options.list) attrs.push("data-list");
  const control = tag === "input" ? `<input ${attrs.join(" ")}>` : `<textarea ${attrs.join(" ")}></textarea>`;
  return `<label class="${options.className || ""}">${label}${control}${options.help ? `<span class="repeat-help">${options.help}</span>` : ""}</label>`;
}

function card(step, title, intro, contents) {
  return `<section class="form-card"><div class="card-heading"><div><p class="step">${step}</p><h2>${title}</h2></div></div>${intro ? `<p class="section-intro">${intro}</p>` : ""}${contents}</section>`;
}

function preRaceForm() {
  return [
    card("STEP 2A", "Editorial frame", "This is the conclusion and race purpose the full plan will support.", `<div class="fields two">${field("Headline", "preRace.headline", { placeholder: "Hill & Dale." })}${field("Subhead", "preRace.subhead")}${field("Report deck", "preRace.deck", { type: "textarea", className: "span-full" })}${field("The verdict", "preRace.verdict", { type: "textarea", className: "span-full", help: "Supports **bold** emphasis." })}</div>`),
    card("STEP 2B", "Targets and governing plan", "Give the plan a hierarchy so one missed number never turns into a bad race.", `<div class="fields three">${field("Target time", "preRace.targetTime")}${field("Target pace", "preRace.targetPace")}${field("Target power", "preRace.targetPower")}${field("A goal", "preRace.goalA")}${field("B goal", "preRace.goalB")}${field("C goal", "preRace.goalC")}${field("Race-day outlook", "preRace.outlook", { type: "textarea", className: "span-full" })}${field("Non-negotiable guardrails", "preRace.guardrails", { type: "textarea", className: "span-full" })}</div>`),
    card("STEP 2C", "Course and conditions", "Record what is known, what is estimated, and how it should change execution.", `<div class="fields two">${field("Course diagnosis", "preRace.courseSummary", { type: "textarea" })}${field("Forecast and implications", "preRace.weather", { type: "textarea" })}</div>`),
    card("STEP 2D", "Competitive field", "Use public entries and history as a dated seed—not a guarantee of who starts.", `<div class="fields two">${field("Expected field", "preRace.fieldSize")}${field("Expected age-group field", "preRace.ageGroupSize")}${field("Field read", "preRace.fieldRead", { type: "textarea", className: "span-full" })}${field("Contenders", "preRace.contenders", { type: "textarea", array: "contenders", className: "span-full", placeholder: "Scott Isgett | 57 | 44:48 Brielle | returning contender | Favorite", help: "One per line: Name | Age | Known mark | Evidence | Competitive read" })}</div>`),
    card("STEP 2E", "Race execution", "This section always publishes at the stable #race-execution link.", `<div class="fields two">${field("Strategy summary", "preRace.strategySummary", { type: "textarea", className: "span-full" })}${field("Course-segment plan", "preRace.strategy", { type: "textarea", array: "strategy", className: "span-full", placeholder: "Start–mile 1 | Controlled | 380–390 W | Accept being passed and settle.", help: "One per line: Segment | Pace / effort | Power | Execution cue" })}</div>`),
    card("STEP 2F", "Readiness gate", "Health and movement retain veto power over the target.", `<div class="fields three">${field("Green · race", "preRace.readinessGreen", { type: "textarea" })}${field("Yellow · adjust", "preRace.readinessYellow", { type: "textarea" })}${field("Red · stop", "preRace.readinessRed", { type: "textarea" })}</div>`),
    card("STEP 2G", "Race-day logistics", "Make this usable in the parking lot, not just interesting the night before.", `<div class="fields two">${field("Timeline", "preRace.logistics", { type: "textarea", array: "logistics", className: "span-full", placeholder: "7:15 AM | Park and walk to registration", help: "One per line: Time | Action" })}${field("Registration / bib pickup", "preRace.bibPickup", { type: "textarea" })}${field("Parking", "preRace.parking", { type: "textarea" })}${field("Arrival plan", "preRace.arrival")}${field("Warm-up", "preRace.warmup")}</div>`),
    card("STEP 2H", "Fuel, hydration and equipment", "Use practiced choices and make the race-day decision explicit.", `<div class="fields two">${field("Shoes", "preRace.shoes")}${field("Fuel", "preRace.fuel")}${field("Hydration", "preRace.hydration")}${field("Watch / equipment notes", "preRace.equipmentNotes", { type: "textarea" })}</div>`),
    card("STEP 2I", "Evidence", "Every operational or competitive claim should point back to a source.", `<div class="fields two">${field("Sources", "preRace.sources", { type: "textarea", array: "sources", className: "span-full", placeholder: "Official race page | https://… | logistics and start time", help: "One per line: Label | URL | What it supports" })}</div>`),
  ].join("");
}

function postRaceForm() {
  return [
    card("STEP 3A", "Official result", "The official result controls time and placement; device data explains execution.", `<div class="fields four">${field("Official time", "postRace.officialTime")}${field("Official pace", "postRace.officialPace")}${field("Device time", "postRace.deviceTime")}${field("Bib", "postRace.bib")}${field("Age-group place", "postRace.ageGroupPlace")}${field("Age-group field", "postRace.ageGroupSize")}${field("Overall place", "postRace.overallPlace")}${field("Overall field", "postRace.overallSize")}${field("Male place", "postRace.malePlace")}${field("Male field", "postRace.maleSize")}${field("Winning / rival margin", "postRace.winningMargin")}${field("Course ascent", "postRace.courseAscent")}${field("Improvement", "postRace.prImprovement")}${field("Improvement label", "postRace.recordLabel")}${field("Division", "postRace.division", { className: "span-2" })}</div>`),
    card("STEP 3B", "Performance thesis", "Say what happened, why it matters and what the official record can honestly claim.", `<div class="fields two">${field("Headline", "postRace.headline")}${field("Subhead", "postRace.subhead")}${field("Report deck", "postRace.deck", { type: "textarea", className: "span-full" })}${field("The verdict", "postRace.verdict", { type: "textarea", className: "span-full" })}${field("Result summary", "postRace.resultSummary", { type: "textarea", className: "span-full" })}${field("Record / certification note", "postRace.recordNote", { type: "textarea" })}${field("Pull quote", "postRace.resultQuote", { type: "textarea" })}</div>`),
    card("STEP 3C", "Competitive-field outcome", "Show placement context, not just finish time.", `<div class="fields two">${field("Field diagnosis", "postRace.fieldRead", { type: "textarea", className: "span-full" })}${field("Leading results", "postRace.competitors", { type: "textarea", array: "competitors", className: "span-full", placeholder: "1 | Aaron Greenwood | 44:11.6 | —", help: "One per line: Place | Athlete | Time | Gap" })}</div>`),
    card("STEP 3D", "Race execution", "Reconcile splits, terrain, heart rate, power and decisive moments.", `<div class="fields two">${field("Execution story", "postRace.executionSummary", { type: "textarea", className: "span-full" })}${field("Splits / course segments", "postRace.splits", { type: "textarea", array: "splits", className: "span-full", placeholder: "Final 0.5 mi | 6:15/mi | 169 | 421 W | Best running came late.", help: "One per line: Segment | Pace | HR | Power | Diagnosis" })}${field("Execution diagnosis", "postRace.executionDiagnosis", { type: "textarea", className: "span-full" })}</div>`),
    card("STEP 3E", "Aerobic ability", "Use the whole pattern—duration, progression, sustainable output and finish.", `<div class="fields four">${field("Average HR", "postRace.avgHR")}${field("Max HR", "postRace.maxHR")}${field("Average power", "postRace.avgPower")}${field("Normalized power", "postRace.normPower")}${field("Aerobic effect", "postRace.aerobicEffect")}${field("Aerobic diagnosis", "postRace.aerobicDiagnosis", { type: "textarea", className: "span-full" })}</div>`),
    card("STEP 3F", "Form under pressure", "Compare race-wide mechanics with the close whenever the device provides them.", `<div class="fields four">${field("Cadence", "postRace.cadence")}${field("Stride length", "postRace.strideLength")}${field("Ground contact", "postRace.groundContact")}${field("Vertical ratio", "postRace.verticalRatio")}${field("Balance", "postRace.balance")}${field("Closing cadence", "postRace.closingCadence")}${field("Closing stride", "postRace.closingStride")}${field("Closing contact", "postRace.closingGroundContact")}${field("Form diagnosis", "postRace.formDiagnosis", { type: "textarea", className: "span-full" })}</div>`),
    card("STEP 3G", "Athlete report", "Your felt experience decides whether the metrics describe healthy performance or compensation.", `<div class="fields two">${field("How the race felt", "postRace.subjective", { type: "textarea" })}${field("Pain, injury or movement changes", "postRace.pain", { type: "textarea" })}${field("Race shoes", "postRace.shoes")}</div>`),
    card("STEP 3H", "Meaning, progression and future", "Turn the result into a durable diagnosis and specific next targets.", `<div class="fields two">${field("What worked", "postRace.whatWorked", { type: "textarea", list: true, help: "One evidence-backed reason per line." })}${field("Where the next gains live", "postRace.opportunities", { type: "textarea", list: true, help: "One specific opportunity per line." })}${field("Progression timeline", "postRace.progression", { type: "textarea", array: "progression", className: "span-full", placeholder: "SEP 2026 | 44:11.6 · 10K | Brielle champion", help: "One per line: Date label | Result | Meaning" })}${field("Progression diagnosis", "postRace.progressionSummary", { type: "textarea", className: "span-full" })}${field("Future goals", "postRace.futureGoals", { type: "textarea", array: "futureGoals", className: "span-full", placeholder: "NEXT 10K | Sub-43 | A flatter certified course makes this defensible.", help: "One per line: Horizon | Goal | Why it is supported" })}${field("Future outlook", "postRace.futureSummary", { type: "textarea" })}${field("Immediate next step", "postRace.nextStep", { type: "textarea" })}</div>`),
    card("STEP 3I", "Evidence", "Keep official results, device measures, athlete report and interpretation visibly distinct.", `<div class="fields two">${field("Sources", "postRace.sources", { type: "textarea", array: "sources", className: "span-full", placeholder: "Official results | https://… | time and placements", help: "One per line: Label | URL | What it supports" })}</div>`),
  ].join("");
}

function bindFields() {
  $$('[data-path]').forEach((input) => {
    const value = getPath(record, input.dataset.path);
    input.value = input.dataset.array ? formatRows(value, input.dataset.array) : input.hasAttribute("data-list") ? (Array.isArray(value) ? value.join("\n") : "") : value ?? "";
    input.oninput = () => {
      const next = input.dataset.array ? parseRows(input.value, input.dataset.array) : input.hasAttribute("data-list") ? lineArray(input.value) : input.value;
      setPath(record, input.dataset.path, next);
      if (!existingSlug && ["race.name", "race.date"].includes(input.dataset.path)) record.slug = slugify(`${record.race.name} ${String(record.race.date || "").slice(0,4)}`);
    };
  });
  $("#race-url").value = record.race.registrationUrl || "";
}

function renderPhase() {
  $("#phase-form").innerHTML = phase === "pre" ? preRaceForm() : postRaceForm();
  $$(".phase-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.phase === phase));
  $("#action-step").textContent = phase === "pre" ? "STEP 2" : "STEP 3";
  $("#action-title").textContent = `Generate the ${phase}-race ${phase === "pre" ? "plan" : "analysis"}`;
  $("#action-copy").textContent = phase === "pre" ? "This saves the race record and creates the complete plan. The post-race intake remains attached for race day." : "This updates the same race record, preserves the pre-race plan, calculates placement context, and creates the final performance edition.";
  $("#generate").textContent = `Generate ${phase}-race report`;
  $("#output-list").innerHTML = (phase === "pre" ? ["Race-day overview", "Registration and logistics", "Course and weather", "Competitive field", "Segment pacing strategy", "Readiness gate", "Fuel and footwear"] : ["Official result and percentiles", "Race-execution diagnosis", "Competitive impact", "Aerobic ability", "Form under pressure", "Progression and opportunities", "Future goals and next step"]).map((item) => `<li>${item}</li>`).join("");
  bindFields();
}

async function loadTemplate() {
  record = await fetch("/api/template").then((response) => response.json());
  existingSlug = "";
  $("#race-picker").value = "";
  renderPhase();
  show("New race ready. Start with the race page, name, date and location.");
}

async function loadRace(slug) {
  const response = await fetch(`/api/races/${encodeURIComponent(slug)}`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  record = result;
  existingSlug = record.slug;
  $("#race-picker").value = slug;
  renderPhase();
  show(`${record.race.name} loaded.\nPre-race: ${record.preRace.status}. Post-race: ${record.postRace.status}.`);
}

async function refreshRaces() {
  const races = await fetch("/api/races").then((response) => response.json());
  const picker = $("#race-picker");
  picker.innerHTML = '<option value="">New race</option>' + races.map((race) => `<option value="${escapeHtml(race.slug)}">${escapeHtml(race.date)} · ${escapeHtml(race.name)}</option>`).join("");
}

$("#race-form").onsubmit = async (event) => {
  event.preventDefault();
  try {
    if (!record.slug || record.slug === "race-name-year") record.slug = slugify(`${record.race.name} ${String(record.race.date || "").slice(0,4)}`);
    record.preRace.status = record.preRace.status === "draft" && phase === "pre" ? "final" : record.preRace.status;
    if (phase === "post") {
      record.postRace.status = "final";
      record.postRace.analyzedAt ||= new Date().toISOString().slice(0, 10);
    }
    show("Validating the record and building both editions…");
    const response = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ record, phase }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    existingSlug = record.slug;
    $("#preview-link").href = result.previewUrl;
    $("#preview-link").hidden = false;
    show(`Built the ${phase}-race edition.\nSaved: ${result.recordPath}\nMain race page now shows: ${result.currentEdition}.`);
    await refreshRaces();
    $("#race-picker").value = record.slug;
    window.open(result.previewUrl, "_blank");
  } catch (error) { show(error.message, false); }
};

$("#import-race").onclick = async () => {
  try {
    const url = $("#race-url").value.trim();
    if (!url) throw new Error("Paste the official race URL first.");
    show("Reading public race-page metadata…");
    const response = await fetch("/api/import-race", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    record.race.registrationUrl = url;
    for (const [key, value] of Object.entries(result.race)) if (value && (!record.race[key] || ["Race Name", "City, State"].includes(record.race[key]))) record.race[key] = value;
    if (!existingSlug) record.slug = slugify(`${record.race.name} ${String(record.race.date || "").slice(0,4)}`);
    renderPhase();
    show(`Pulled what the page exposed. Review the highlighted race basics before building.\nSource: ${result.sourceTitle || url}`);
  } catch (error) { show(error.message, false); }
};

$("#publish").onclick = async () => {
  try {
    if (!existingSlug) throw new Error("Generate the report before publishing.");
    show("Running the final build, scoped commit and push…");
    const response = await fetch("/api/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: record.slug, phase, confirm: $("#confirm").value.trim() }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    show(result.changed ? `Published.\nCommit: ${result.sha}\n${result.url}` : result.message);
  } catch (error) { show(error.message, false); }
};

$("#new-race").onclick = () => loadTemplate().catch((error) => show(error.message, false));
$("#load-brielle").onclick = () => loadRace("brielle-2026").catch((error) => show(error.message, false));
$("#race-picker").onchange = (event) => event.target.value ? loadRace(event.target.value).catch((error) => show(error.message, false)) : loadTemplate().catch((error) => show(error.message, false));
$$(".phase-tabs button").forEach((button) => button.onclick = () => { phase = button.dataset.phase; renderPhase(); });

$("#show-json").onclick = () => { $("#record-json").value = JSON.stringify(record, null, 2); $("#json-dialog").showModal(); };
$("#apply-json").onclick = (event) => {
  try { record = JSON.parse($("#record-json").value); existingSlug = record.slug === "race-name-year" ? "" : record.slug; renderPhase(); }
  catch (error) { event.preventDefault(); show(`JSON not applied: ${error.message}`, false); }
};

const localStudio = ["127.0.0.1", "localhost"].includes(location.hostname);
if (!localStudio) {
  $$('button,input,textarea,select').forEach((control) => control.disabled = true);
  show("This public page is a safe read-only shell. Press Open private Race Desk, sign in to GitHub, and use the forwarded 4173 port to edit and publish from anywhere.", false);
} else {
  await refreshRaces();
  await loadTemplate();
}
