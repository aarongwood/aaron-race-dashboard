#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { buildAll, buildPacket, packetTemplate, paths, readPacket, validatePacket } from "./lib/report-factory.mjs";

const args = process.argv.slice(2);
const command = args[0] || "help";

function usage() {
  console.log(`Aaron Race Report Factory

Commands:
  node race-report.mjs new <slug>       Create one race packet from the template
  node race-report.mjs validate <file>  Validate a race packet
  node race-report.mjs build <file>     Build one report and the archive
  node race-report.mjs build-all        Build every race packet
  node race-report.mjs preview          Start the Easy Button web studio
  node race-report.mjs publish <file>   Build, commit only that report, and push

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
  const packet = packetTemplate(slug);
  const errors = validatePacket(packet);
  if (errors.some((error) => error.startsWith("slug"))) throw new Error(errors.join("\n"));
  await fs.mkdir(paths.races, { recursive: true });
  const output = path.join(paths.races, `${slug}.json`);
  try { await fs.access(output); throw new Error(`${output} already exists.`); } catch (error) { if (error.code !== "ENOENT") throw error; }
  await fs.writeFile(output, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  console.log(`Created ${path.relative(paths.root, output)}`);
} else if (command === "validate") {
  const file = args[1];
  if (!file) throw new Error("Provide a race packet path.");
  const { packet } = await readPacket(file);
  console.log(`Valid: ${packet.slug}`);
} else if (command === "build") {
  const file = args[1];
  if (!file) throw new Error("Provide a race packet path.");
  const result = await buildPacket(file);
  const all = await buildAll();
  console.log(`Built ${path.relative(paths.root, result.output)}`);
  console.log(`Updated ${path.relative(paths.root, all.archive)}`);
} else if (command === "build-all") {
  const result = await buildAll();
  console.log(`Built ${result.built.length} report(s) and ${path.relative(paths.root, result.archive)}.`);
} else if (command === "preview") {
  await run(process.execPath, [path.join(paths.root, "studio-server.mjs")]);
} else if (command === "publish") {
  const file = args[1];
  if (!file) throw new Error("Provide a race packet path.");
  const { packet, absolute } = await readPacket(file);
  if (!args.includes("--yes")) {
    if (!process.stdin.isTTY) throw new Error("Publishing requires an interactive confirmation or the explicit --yes flag.");
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question(`Type PUBLISH to publish ${packet.raceName}: `);
    prompt.close();
    if (answer.trim() !== "PUBLISH") throw new Error("Publish canceled.");
  }
  await buildAll();
  const allowed = [
    path.relative(paths.root, absolute),
    path.join("reports", packet.slug, "index.html"),
    path.join("reports", "index.html")
  ];
  await run("git", ["add", "--", ...allowed]);
  await run("git", ["commit", "-m", `Publish ${packet.raceName} race report`]);
  await run("git", ["push", "origin", "HEAD:main"]);
  console.log(`Published: https://aarongwood.github.io/brielle-2026-race-report/reports/${packet.slug}/`);
} else {
  usage();
}
