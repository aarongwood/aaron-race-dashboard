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

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const safeUrl = (value = "") => {
  const url = String(value).trim();
  return /^(https?:\/\/|#)/.test(url) ? escapeHtml(url) : "#";
};

export function inline(value = "") {
  let text = escapeHtml(value);
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|#[^)]+)\)/g, (_m, label, url) => `<a href="${safeUrl(url)}">${label}</a>`);
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  return text;
}

export function validatePacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return ["Packet must be a JSON object."];
  if (!SLUG_PATTERN.test(packet.slug || "")) errors.push("slug must use lowercase letters, numbers, and single hyphens.");
  for (const key of ["athlete", "raceName", "date", "location", "title", "deck", "verdict"]) {
    if (!String(packet[key] || "").trim()) errors.push(`${key} is required.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(packet.date || "")) errors.push("date must use YYYY-MM-DD.");
  if (!Array.isArray(packet.facts) || packet.facts.length < 3) errors.push("facts must contain at least three result cards.");
  if (!Array.isArray(packet.sections) || packet.sections.length < 2) errors.push("sections must contain at least two report sections.");
  const ids = new Set();
  for (const [index, section] of (packet.sections || []).entries()) {
    if (!SLUG_PATTERN.test(section.id || "")) errors.push(`sections[${index}].id is invalid.`);
    if (ids.has(section.id)) errors.push(`section id '${section.id}' is duplicated.`);
    ids.add(section.id);
    if (!section.title) errors.push(`sections[${index}].title is required.`);
    if (!Array.isArray(section.blocks) || !section.blocks.length) errors.push(`sections[${index}].blocks cannot be empty.`);
    for (const [blockIndex, block] of (section.blocks || []).entries()) {
      const prefix = `sections[${index}].blocks[${blockIndex}]`;
      if (!["paragraph", "quote", "callout", "table", "metrics", "list", "cards", "timeline"].includes(block.type)) errors.push(`${prefix}.type is unsupported.`);
      if (block.type === "table" && (!Array.isArray(block.columns) || !Array.isArray(block.rows))) errors.push(`${prefix} table requires columns and rows arrays.`);
      if (["metrics", "cards", "timeline"].includes(block.type) && !Array.isArray(block.items)) errors.push(`${prefix} requires an items array.`);
      if (block.type === "list" && !Array.isArray(block.items)) errors.push(`${prefix} requires an items array.`);
      if (["paragraph", "quote"].includes(block.type) && !String(block.text || "").trim()) errors.push(`${prefix}.text is required.`);
    }
  }
  if (!ids.has("race-execution")) errors.push("A race-execution section is required so every report has the stable #race-execution anchor.");
  return errors;
}

export async function readPacket(packetPath) {
  const absolute = path.resolve(ROOT, packetPath);
  const raw = await fs.readFile(absolute, "utf8");
  const packet = JSON.parse(raw);
  const errors = validatePacket(packet);
  if (errors.length) throw new Error(`Invalid race packet:\n- ${errors.join("\n- ")}`);
  return { packet, absolute };
}

function renderTable(block) {
  const headings = block.columns.map((column) => `<th>${inline(column)}</th>`).join("");
  const rows = block.rows.map((row) => {
    const className = row.highlight ? ' class="winner-row"' : "";
    return `<tr${className}>${row.cells.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`;
  }).join("\n");
  return `<div class="table-scroll"><table><thead><tr>${headings}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderMetrics(block, className = "metric-grid") {
  return `<div class="${className}">${block.items.map((item) => `<div><span>${inline(item.label)}</span><strong>${inline(item.value)}</strong>${item.note ? `<small>${inline(item.note)}</small>` : ""}</div>`).join("")}</div>`;
}

function renderBlock(block) {
  switch (block.type) {
    case "paragraph": return `<p>${inline(block.text)}</p>`;
    case "quote": return `<blockquote>${inline(block.text)}</blockquote>`;
    case "callout": return `<div class="callout ${escapeHtml(block.tone || "success")}"><strong>${inline(block.title)}</strong><p>${inline(block.text)}</p></div>`;
    case "table": return renderTable(block);
    case "metrics": return renderMetrics(block, block.variant === "comparison" ? "comparison" : "metric-grid");
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const cls = block.ordered ? "numbered-analysis" : "opportunity-list";
      return `<${tag} class="${cls}">${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`;
    }
    case "cards": return `<div class="horizon-grid">${block.items.map((item) => `<div><span>${inline(item.label)}</span><h3>${inline(item.title)}</h3><p>${inline(item.text)}</p></div>`).join("")}</div>`;
    case "timeline": return `<div class="timeline">${block.items.map((item) => `<div${item.highlight ? ' class="timeline-win"' : ""}><time>${inline(item.label)}</time><strong>${inline(item.value)}</strong><span>${inline(item.note)}</span></div>`).join("")}</div>`;
    default: throw new Error(`Unsupported block type: ${block.type}`);
  }
}

export function renderReport(packet, cssHref = "../../assets/report.css") {
  const factsClass = packet.facts.length > 4 ? "facts facts-eight" : "facts";
  const nav = packet.sections.map((section) => `<a href="#${escapeHtml(section.id)}">${inline(section.title)}</a>`).join("\n");
  const sections = packet.sections.map((section, index) => {
    const number = String(index + 1).padStart(2, "0");
    return `<h2 id="${escapeHtml(section.id)}"><span class="section-number">${number}</span>${inline(section.title)}</h2>\n${section.blocks.map(renderBlock).join("\n")}`;
  }).join("\n");
  const facts = packet.facts.map((fact) => `<div><span>${inline(fact.label)}</span><strong>${inline(fact.value)}</strong>${fact.note ? `<small>${inline(fact.note)}</small>` : ""}</div>`).join("\n");
  const sources = (packet.sources || []).map((source) => `<li>${source.url ? `<a href="${safeUrl(source.url)}">${inline(source.label)}</a>` : inline(source.label)}${source.note ? ` — ${inline(source.note)}` : ""}</li>`).join("\n");
  const sourceSection = sources ? `<h2 id="sources"><span class="section-number">${String(packet.sections.length + 1).padStart(2, "0")}</span>Sources &amp; limits</h2><ul>${sources}</ul>${packet.sourceNote ? `<p class="source-note">${inline(packet.sourceNote)}</p>` : ""}` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(packet.pageTitle || `${packet.raceName} · ${packet.athlete}`)}</title>
  <meta name="description" content="${escapeHtml(packet.description || packet.deck)}">
  <meta name="theme-color" content="#102c34">
  <link rel="stylesheet" href="${escapeHtml(cssHref)}">
</head>
<body>
  <a class="skip" href="#report">Skip to report</a>
  <header class="masthead">
    <a class="brand" href="#top">AARON’S RUN COACH <span>/ RACE REPORT</span></a>
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </header>
  <main id="top">
    <section class="hero victory-hero">
      <p class="eyebrow">${inline(packet.location.toUpperCase())} · ${inline(packet.displayDate || packet.date)}</p>
      <p class="kicker">${inline(packet.kicker || "POST-RACE ANALYSIS")}</p>
      <h1>${inline(packet.title)}${packet.subtitle ? `<br><em>${inline(packet.subtitle)}</em>` : ""}</h1>
      <p class="deck">${inline(packet.deck)}</p>
      <p class="edition">${inline(packet.edition || "Final post-race edition")}</p>
    </section>
    <section class="${factsClass}" aria-label="Race result">${facts}</section>
    <div class="verdict"><p class="verdict-label">THE VERDICT</p><p>${inline(packet.verdict)}</p></div>
    <div class="layout">
      <aside><details open><summary>IN THIS REPORT</summary><nav aria-label="Report sections">${nav}${sources ? '<a href="#sources">Sources &amp; limits</a>' : ""}</nav></details></aside>
      <article id="report">${sections}${sourceSection}</article>
    </div>
  </main>
  <footer>
    <p><strong>${inline(packet.athlete)} · ${inline(packet.raceName)} · ${inline(packet.displayDate || packet.date)}</strong></p>
    ${packet.footerNote ? `<p>${inline(packet.footerNote)}</p>` : ""}
    <a href="#top">Back to top</a>
  </footer>
</body>
</html>\n`;
}

export async function buildPacket(packetPath) {
  const { packet, absolute } = await readPacket(packetPath);
  const reportDir = path.join(paths.reports, packet.slug);
  await fs.mkdir(reportDir, { recursive: true });
  const output = path.join(reportDir, "index.html");
  await fs.writeFile(output, renderReport(packet), "utf8");
  return { packet, packetPath: absolute, output };
}

export async function listPackets() {
  await fs.mkdir(paths.races, { recursive: true });
  const entries = await fs.readdir(paths.races, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => path.join(paths.races, entry.name)).sort();
}

export async function buildArchive(builtReports) {
  await fs.mkdir(paths.reports, { recursive: true });
  const cards = builtReports
    .sort((a, b) => b.packet.date.localeCompare(a.packet.date))
    .map(({ packet }) => `<a class="archive-card" href="${escapeHtml(packet.slug)}/"><span>${inline(packet.displayDate || packet.date)}</span><h2>${inline(packet.raceName)}</h2><strong>${inline(packet.facts[0]?.value || "View report")}</strong><p>${inline(packet.kicker || "Race report")}</p></a>`)
    .join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aaron Greenwood · Race Reports</title><link rel="stylesheet" href="../assets/report.css"></head><body><header class="masthead"><a class="brand" href="../">AARON’S RUN COACH <span>/ RACE REPORT ARCHIVE</span></a></header><main><section class="hero"><p class="eyebrow">PERMANENT PERFORMANCE ARCHIVE</p><h1>Race reports.</h1><p class="deck">Verified results, execution analysis, competitive context, mechanics, progression and next steps.</p></section><section class="archive-grid">${cards}</section></main></body></html>\n`;
  const output = path.join(paths.reports, "index.html");
  await fs.writeFile(output, html, "utf8");
  return output;
}

export async function buildAll() {
  const packetPaths = await listPackets();
  const built = [];
  for (const packetPath of packetPaths) built.push(await buildPacket(packetPath));
  const archive = await buildArchive(built);
  return { built, archive };
}

export function packetTemplate(slug = "race-name-year") {
  return {
    slug,
    athlete: "Aaron Greenwood",
    raceName: "Race Name",
    date: "2026-01-01",
    displayDate: "JANUARY 1, 2026",
    location: "City, State",
    pageTitle: "Race Name · Aaron Greenwood",
    description: "Aaron Greenwood's post-race performance report.",
    kicker: "POST-RACE ANALYSIS",
    title: "The race-day headline.",
    subtitle: "The supporting story.",
    deck: "A concise explanation of what happened and why it matters.",
    edition: "Final post-race edition · Official time and placements",
    verdict: "**State the blunt performance conclusion here.** Add the strongest evidence in one or two sentences.",
    facts: [
      { label: "OFFICIAL TIME", value: "00:00.0", note: "final" },
      { label: "OFFICIAL PACE", value: "0:00", note: "per mile" },
      { label: "AGE GROUP", value: "0 / 0", note: "Male 50–59" }
    ],
    sections: [
      { id: "result", title: "The result", blocks: [{ type: "paragraph", text: "Summarize the official result and its competitive meaning." }] },
      { id: "race-execution", title: "Race execution", blocks: [{ type: "paragraph", text: "Explain how the race unfolded, using splits, terrain, heart rate and power where available." }] }
    ],
    sources: [],
    sourceNote: "Separate measured facts, derived calculations and coaching interpretation.",
    footerNote: "Data from official results, athlete report and available device evidence."
  };
}
