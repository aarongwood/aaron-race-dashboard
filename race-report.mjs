#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { buildAll, buildRecord, paths, readRecord, recordTemplate, validateRecord } from "./lib/report-factory.mjs";

const args = process.argv.slice(2);
const command = args[0] || "help";

function usage() {
  console.log(`Aaron Race Report Factory v2

Commands:
  node race-report.mjs new <slug>       Create one two-stage race record
  node race-report.mjs validate <file>  Validate a race record
  node race-report.mjs build <file>     Build its pre/post editions
  node race-report.mjs build-all        Build the permanent archive
  node race-report.mjs preview          Start Aaron's Race Desk
  node race-report.mjs publish <file>   Build, commit this race, and push

Recommended: npm run studio`);
}

function run(program, programArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, programArgs, { cwd: paths.root, stdio: "inherit", ...options });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${program} exited with ${code}`)));
  });
}

if (command === "new") {
  const slug = args[1];
  if (!slug) throw new Error("Provide a slug, for example: new chicago-marathon-2026");
  const record = recordTemplate(slug);
  const slugErrors = validateRecord(record, "pre").filter((error) => error.startsWith("slug"));
  if (slugErrors.length) throw new Error(slugErrors.join("\n"));
  await fs.mkdir(paths.races, { recursive: true });
  const output = path.join(paths.races, `${slug}.json`);
  try { await fs.access(output); throw new Error(`${output} already exists.`); } catch (error) { if (error.code !== "ENOENT") throw error; }
  await fs.writeFile(output, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  console.log(`Created ${path.relative(paths.root, output)}`);
} else if (command === "validate") {
  const file = args[1];
  if (!file) throw new Error("Provide a race record path.");
  const { record } = await readRecord(file);
  console.log(`Valid: ${record.slug} · pre ${record.preRace.status} · post ${record.postRace.status}`);
} else if (command === "build") {
  const file = args[1];
  if (!file) throw new Error("Provide a race record path.");
  const result = await buildRecord(file);
  const all = await buildAll();
  console.log(`Built ${path.relative(paths.root, result.pre)}`);
  if (result.post) console.log(`Built ${path.relative(paths.root, result.post)}`);
  console.log(`Current edition: ${path.relative(paths.root, result.main)}`);
  console.log(`Updated ${path.relative(paths.root, all.archive)}`);
} else if (command === "build-all") {
  const result = await buildAll();
  console.log(`Built ${result.built.length} race(s) and ${path.relative(paths.root, result.archive)}.`);
} else if (command === "preview") {
  await run(process.execPath, [path.join(paths.root, "studio-server.mjs")]);
} else if (command === "publish") {
  const file = args[1];
  if (!file) throw new Error("Provide a race record path.");
  const { record, absolute } = await readRecord(file);
  if (!args.includes("--yes")) {
    if (!process.stdin.isTTY) throw new Error("Publishing requires an interactive confirmation or --yes.");
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question(`Type PUBLISH to publish ${record.race.name}: `);
    prompt.close();
    if (answer.trim() !== "PUBLISH") throw new Error("Publish canceled.");
  }
  await buildAll();
  const allowed = [path.relative(paths.root, absolute), path.join("reports", record.slug, "index.html"), path.join("reports", "index.html"), path.join("reports", "data.json")];
  if (record.preRace?.status !== "not-preserved") allowed.push(path.join("reports", record.slug, "pre-race", "index.html"));
  if (record.postRace?.status === "final") allowed.push(path.join("reports", record.slug, "post-race", "index.html"));
  await run("git", ["add", "--", ...allowed]);
  await run("git", ["commit", "-m", `${record.postRace?.status === "final" ? "Publish" : "Plan"} ${record.race.name}`, "--", ...allowed]);
  await run("git", ["push", "origin", "HEAD:main"]);
  console.log(`Published: https://aarongwood.github.io/aaron-race-dashboard/reports/${record.slug}/`);
} else {
  usage();
}
