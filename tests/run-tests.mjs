import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { buildAll, inline, paths, readPacket, renderReport, validatePacket } from "../lib/report-factory.mjs";

const { packet } = await readPacket("races/brielle-2026.json");
assert.equal(validatePacket(packet).length, 0, "Brielle packet must validate");
assert.match(inline("**strong**"), /<strong>strong<\/strong>/);
assert.match(inline("<script>alert(1)</script>"), /&lt;script&gt;/);

const rendered = renderReport(packet);
assert.match(rendered, /id="race-execution"/);
assert.match(rendered, /44:11\.6/);
assert.match(rendered, /1 \/ 25/);
assert.match(rendered, /Scott Isgett/);
assert.doesNotMatch(rendered, /<script>alert/);

const invalid = structuredClone(packet);
invalid.slug = "Bad Slug";
invalid.sections = invalid.sections.filter((section) => section.id !== "race-execution");
const invalidErrors = validatePacket(invalid);
assert.ok(invalidErrors.some((error) => error.startsWith("slug")));
assert.ok(invalidErrors.some((error) => error.includes("race-execution")));

const built = await buildAll();
assert.ok(built.built.length >= 1);
for (const file of [built.archive, path.join(paths.reports, "brielle-2026", "index.html")]) {
  const stat = await fs.stat(file);
  assert.ok(stat.size > 600, `${file} should be a substantial HTML document`);
}

const root = await fs.readFile(path.join(paths.root, "index.html"), "utf8");
assert.match(root, /id="race-story"/);
assert.match(root, /id="race-execution"/);
assert.match(root, /44:11\.6/);

process.env.RACE_REPORT_PORT = "4174";
const { server } = await import("../studio-server.mjs");
await new Promise((resolve, reject) => {
  if (server.listening) return resolve();
  server.once("listening", resolve);
  server.once("error", reject);
});
const studioHtml = await fetch("http://127.0.0.1:4174/studio/").then((response) => response.text());
const brielleJson = await fetch("http://127.0.0.1:4174/api/brielle").then((response) => response.json());
assert.match(studioHtml, /Race Report/);
assert.equal(brielleJson.slug, "brielle-2026");
await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

console.log("All race-report factory tests passed.");
