#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildAll, enrichRecord, listRecords, paths, readRecord, recordTemplate, validateRecord } from "./lib/report-factory.mjs";

const exec = promisify(execFile);
const HOST = "127.0.0.1";
const PORT = Number(process.env.RACE_REPORT_PORT || 4173);
const MAX_BODY = 3 * 1024 * 1024;
const MAX_IMPORT = 2 * 1024 * 1024;
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml" };

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

function assertPublicUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Race URL must use http or https.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) throw new Error("Local and private-network URLs cannot be imported.");
  return url;
}

function decodeEntities(value = "") {
  return String(value).replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

function metaContent(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1].trim());
  }
  return "";
}

function eventFromJsonLd(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const inspect = (value) => {
    if (!value) return null;
    if (Array.isArray(value)) return value.map(inspect).find(Boolean) || null;
    if (value["@type"] === "Event" || (Array.isArray(value["@type"]) && value["@type"].includes("Event"))) return value;
    return inspect(value["@graph"]);
  };
  for (const script of scripts) {
    try { const event = inspect(JSON.parse(script[1])); if (event) return event; } catch { /* malformed publisher JSON-LD */ }
  }
  return null;
}

function locationText(location) {
  if (!location) return "";
  if (typeof location === "string") return location;
  const address = typeof location.address === "string" ? location.address : location.address || {};
  return [address.addressLocality, address.addressRegion].filter(Boolean).join(", ") || location.name || "";
}

function importBasics(html, url) {
  const event = eventFromJsonLd(html);
  const titleTag = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<[^>]+>/g, "").trim());
  const sourceTitle = metaContent(html, "og:title") || titleTag;
  const rawName = event?.name || sourceTitle;
  const name = rawName.replace(/\s*[|·–-]\s*(RunSignup|runsignup\.com|Race Entry|UltraSignup).*$/i, "").trim();
  const dateValue = event?.startDate || metaContent(html, "event:start_time");
  let date = "";
  let startTime = "";
  if (dateValue) {
    const parsed = new Date(dateValue);
    if (!Number.isNaN(parsed.valueOf())) {
      date = /^\d{4}-\d{2}-\d{2}/.exec(String(dateValue))?.[0] || parsed.toISOString().slice(0, 10);
      const clock = /T(\d{2}):(\d{2})/.exec(String(dateValue));
      if (clock) {
        const hour = Number(clock[1]);
        startTime = `${hour % 12 || 12}:${clock[2]} ${hour >= 12 ? "PM" : "AM"}`;
      }
    }
  }
  const distance = name.match(/\b(1\s*mile|5K|8K|10K|15K|half(?:\s+marathon)?|marathon|50K|50\s*mile)\b/i)?.[1] || "";
  return { sourceTitle, race: { name, date, startTime, location: locationText(event?.location), venue: typeof event?.location === "object" ? event.location.name || "" : "", distance, registrationUrl: url } };
}

async function importRace(urlValue) {
  const url = assertPublicUrl(urlValue);
  const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "AaronRaceDesk/2.0 (+https://aarongwood.github.io/brielle-2026-race-report/)" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Race page returned HTTP ${response.status}.`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_IMPORT) throw new Error("Race page is too large to import safely.");
  const html = (await response.text()).slice(0, MAX_IMPORT);
  return importBasics(html, response.url);
}

async function saveRecord(record, phase) {
  enrichRecord(record);
  const errors = validateRecord(record, phase);
  if (errors.length) throw new Error(errors.join("\n"));
  await fs.mkdir(paths.races, { recursive: true });
  const recordPath = path.join(paths.races, `${record.slug}.json`);
  await fs.writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  const result = await buildAll();
  return { recordPath, result };
}

async function publishRecord(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || "")) throw new Error("Invalid race slug.");
  const relativeRecord = path.join("races", `${slug}.json`);
  const { record } = await readRecord(relativeRecord);
  await buildAll();
  const allowed = [relativeRecord, path.join("reports", slug, "index.html"), path.join("reports", slug, "pre-race", "index.html"), path.join("reports", "index.html")];
  if (record.postRace?.status === "final") allowed.push(path.join("reports", slug, "post-race", "index.html"));
  const staged = (await exec("git", ["diff", "--cached", "--name-only"], { cwd: paths.root })).stdout.trim();
  if (staged) throw new Error(`Publish stopped: the repository already has staged files. Commit or unstage them first:\n${staged}`);
  await exec("git", ["add", "--", ...allowed], { cwd: paths.root });
  const diff = (await exec("git", ["diff", "--cached", "--name-only"], { cwd: paths.root })).stdout.trim();
  if (!diff) return { changed: false, message: "Nothing changed; this race is already published." };
  await exec("git", ["commit", "-m", `${record.postRace?.status === "final" ? "Publish" : "Plan"} ${record.race.name}`, "--", ...allowed], { cwd: paths.root });
  await exec("git", ["push", "origin", "HEAD:main"], { cwd: paths.root });
  return { changed: true, sha: (await exec("git", ["rev-parse", "HEAD"], { cwd: paths.root })).stdout.trim(), url: `https://aarongwood.github.io/brielle-2026-race-report/reports/${slug}/` };
}

async function raceSummaries() {
  const races = [];
  for (const file of await listRecords()) {
    const record = JSON.parse(await fs.readFile(file, "utf8"));
    races.push({ slug: record.slug, name: record.race.name, date: record.race.date, preStatus: record.preRace?.status, postStatus: record.postRace?.status });
  }
  return races.sort((a, b) => b.date.localeCompare(a.date));
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
    if (req.method === "GET" && url.pathname === "/api/template") return json(res, 200, recordTemplate());
    if (req.method === "GET" && url.pathname === "/api/races") return json(res, 200, await raceSummaries());
    if (req.method === "GET" && url.pathname.startsWith("/api/races/")) {
      const slug = decodeURIComponent(url.pathname.slice("/api/races/".length));
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid race slug.");
      const { record } = await readRecord(path.join("races", `${slug}.json`));
      return json(res, 200, record);
    }
    if (req.method === "GET" && url.pathname === "/api/brielle") {
      const { record } = await readRecord("races/brielle-2026.json");
      return json(res, 200, record);
    }
    if (req.method === "POST" && url.pathname === "/api/import-race") {
      const payload = await readJson(req);
      return json(res, 200, await importRace(payload.url));
    }
    if (req.method === "POST" && url.pathname === "/api/generate") {
      const payload = await readJson(req);
      const record = payload.record || payload;
      const phase = payload.phase === "post" ? "post" : "pre";
      const result = await saveRecord(record, phase);
      return json(res, 200, { ok: true, slug: record.slug, previewUrl: `/reports/${record.slug}/${phase}-race/`, mainUrl: `/reports/${record.slug}/`, recordPath: path.relative(paths.root, result.recordPath), currentEdition: record.postRace?.status === "final" ? "post-race" : "pre-race" });
    }
    if (req.method === "POST" && url.pathname === "/api/publish") {
      const payload = await readJson(req);
      if (payload.confirm !== "PUBLISH") return json(res, 400, { error: "Type PUBLISH to confirm." });
      return json(res, 200, { ok: true, ...(await publishRecord(payload.slug)) });
    }
    return await serveFile(req, res);
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message });
  }
});

export { importBasics, server };

server.listen(PORT, HOST, () => {
  console.log(`Aaron’s Race Desk: http://${HOST}:${PORT}/studio/`);
  console.log("Press Ctrl+C to stop.");
});
