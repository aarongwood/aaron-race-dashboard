#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildAll, packetTemplate, paths, readPacket, validatePacket } from "./lib/report-factory.mjs";

const exec = promisify(execFile);
const HOST = "127.0.0.1";
const PORT = Number(process.env.RACE_REPORT_PORT || 4173);
const MAX_BODY = 3 * 1024 * 1024;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("Request is larger than 3 MB.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function savePacket(packet) {
  const errors = validatePacket(packet);
  if (errors.length) throw new Error(errors.join("\n"));
  await fs.mkdir(paths.races, { recursive: true });
  const packetPath = path.join(paths.races, `${packet.slug}.json`);
  await fs.writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  const result = await buildAll();
  return {
    packetPath,
    reportPath: path.join(paths.reports, packet.slug, "index.html"),
    reportCount: result.built.length,
  };
}

async function publishPacket(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || "")) throw new Error("Invalid race slug.");
  const relativePacket = path.join("races", `${slug}.json`);
  const { packet } = await readPacket(relativePacket);
  await buildAll();
  const allowed = [relativePacket, path.join("reports", slug, "index.html"), path.join("reports", "index.html")];
  const staged = (await exec("git", ["diff", "--cached", "--name-only"], { cwd: paths.root })).stdout.trim();
  if (staged) throw new Error(`Publish stopped: the repository already has staged files. Commit or unstage them first:\n${staged}`);
  await exec("git", ["add", "--", ...allowed], { cwd: paths.root });
  const diff = await exec("git", ["diff", "--cached", "--name-only"], { cwd: paths.root });
  if (!diff.stdout.trim()) return { changed: false, message: "Nothing changed; this report is already published." };
  await exec("git", ["commit", "-m", `Publish ${packet.raceName} race report`, "--", ...allowed], { cwd: paths.root });
  await exec("git", ["push", "origin", "HEAD:main"], { cwd: paths.root });
  const sha = (await exec("git", ["rev-parse", "HEAD"], { cwd: paths.root })).stdout.trim();
  return {
    changed: true,
    sha,
    url: `https://aarongwood.github.io/brielle-2026-race-report/reports/${slug}/`,
  };
}

async function serveFile(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  let relative = decodeURIComponent(url.pathname);
  if (relative === "/") relative = "/studio/";
  if (relative.endsWith("/")) relative += "index.html";
  const target = path.resolve(paths.root, `.${relative}`);
  if (!target.startsWith(`${paths.root}${path.sep}`)) return json(res, 403, { error: "Forbidden" });
  try {
    const body = await fs.readFile(target);
    res.writeHead(200, { "content-type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream" });
    res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") return json(res, 404, { error: "Not found" });
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (req.method === "GET" && url.pathname === "/api/template") return json(res, 200, packetTemplate());
    if (req.method === "GET" && url.pathname === "/api/brielle") {
      const { packet } = await readPacket("races/brielle-2026.json");
      return json(res, 200, packet);
    }
    if (req.method === "POST" && url.pathname === "/api/generate") {
      const payload = await readJson(req);
      const result = await savePacket(payload.packet || payload);
      return json(res, 200, {
        ok: true,
        slug: (payload.packet || payload).slug,
        previewUrl: `/reports/${(payload.packet || payload).slug}/`,
        packetPath: path.relative(paths.root, result.packetPath),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/publish") {
      const payload = await readJson(req);
      if (payload.confirm !== "PUBLISH") return json(res, 400, { error: "Type PUBLISH to confirm." });
      return json(res, 200, { ok: true, ...(await publishPacket(payload.slug)) });
    }
    return await serveFile(req, res);
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message });
  }
});

export { server };

server.listen(PORT, HOST, () => {
  console.log(`Aaron Race Report Easy Button: http://${HOST}:${PORT}/studio/`);
  console.log("Press Ctrl+C to stop.");
});
