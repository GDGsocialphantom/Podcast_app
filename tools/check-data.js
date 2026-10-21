#!/usr/bin/env node
// Validates data/shows.js, data/episodes.js and data/transcripts/*.json before they hit the site.
// Run: node tools/check-data.js   (exit code 1 on any problem)
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const ctx = vm.createContext({});
let src = "";
for (const f of ["data/shows.js", "data/episodes.js"]) {
  const code = fs.readFileSync(path.join(root, f), "utf8");
  try {
    new vm.Script(code, { filename: f }); // syntax check with a useful file:line
  } catch (e) {
    console.error(`${f}: does not parse. ${e.message}\n${e.stack.split("\n").slice(0, 3).join("\n")}`);
    process.exit(1);
  }
  src += code + "\n";
}
const { SHOWS, EPISODES } = vm.runInContext(src + "\n;({ SHOWS: typeof SHOWS === 'undefined' ? undefined : SHOWS, EPISODES: typeof EPISODES === 'undefined' ? undefined : EPISODES })", ctx);
const RULES = require("./rules.js");   // the same rules js/admin.js and the Worker use
const problems = [];
const bad = (id, msg) => problems.push(`${id}: ${msg}`);

if (!Array.isArray(SHOWS) || !SHOWS.length) bad("shows", "SHOWS is missing or empty");
if (!Array.isArray(EPISODES)) bad("episodes", "EPISODES is not an array");

const showIds = new Set();
for (const s of SHOWS || []) {
  const id = s.id || "(no id)";
  if (s.id && showIds.has(s.id)) bad(id, "duplicate show id");
  for (const msg of RULES.validateShow(s, { showIds, editingId: s.id })) bad(id, msg);
  showIds.add(s.id);
}

const episodesSrc = fs.readFileSync(path.join(root, "data/episodes.js"), "utf8");
const epIds = new Set();
const SAMPLE_YT = "dQw4w9WgXcQ";
for (const e of EPISODES || []) {
  const id = e.id || "(no id)";
  if (e.id && epIds.has(e.id)) bad(id, "duplicate episode id");
  const r = RULES.validateEpisode(e, { showIds, episodeIds: epIds, editingId: e.id, todoName: RULES.hasTodoName(episodesSrc, e.id) });
  for (const msg of r.problems) bad(id, msg);
  for (const msg of r.warnings) console.warn(`warning ${id}: ${msg}`);
  epIds.add(e.id);
  if (e.youtube === SAMPLE_YT) console.warn(`warning ${id}: still using the sample YouTube id`);
}

// data/transcripts/<episode id>.json: one file per episode, an array of cues { t: seconds, s: speaker, x: text }
const txDir = path.join(root, "data", "transcripts");
let txCount = 0;
if (fs.existsSync(txDir)) {
  for (const f of fs.readdirSync(txDir).filter(f => f.endsWith(".json")).sort()) {
    const id = f.slice(0, -5), label = "transcripts/" + f;
    let cues;
    try { cues = JSON.parse(fs.readFileSync(path.join(txDir, f), "utf8")); } catch (e) { bad(label, "does not parse as JSON: " + e.message); continue; }
    if (!epIds.has(id)) console.warn(`warning ${label}: no episode with id "${id}"`);
    for (const msg of RULES.validateTranscript(cues)) bad(label, msg);
    txCount++;
  }
}

// data/transcript-status.json: written by tools/fetch-transcripts.js
const statusPath = path.join(root, "data", "transcript-status.json");
const txFiles = fs.existsSync(txDir) ? fs.readdirSync(txDir).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)) : [];
if (fs.existsSync(statusPath)) {
  let st = null;
  try { st = JSON.parse(fs.readFileSync(statusPath, "utf8")); } catch (e) { bad("transcript-status.json", "does not parse as JSON: " + e.message); }
  if (st) {
    if (typeof st !== "object" || typeof st.episodes !== "object") bad("transcript-status.json", "needs an episodes object");
    if (st.last_run && isNaN(Date.parse(st.last_run))) bad("transcript-status.json", "last_run is not a date");
    if (typeof st.credits_used_total !== "number") bad("transcript-status.json", "credits_used_total should be a number");
    for (const [id, v] of Object.entries(st.episodes || {})) {
      if (!v || !["ok", "no_captions", "credits_exhausted", "error"].includes(v.status)) bad("transcript-status.json", `${id}: status should be ok, no_captions, credits_exhausted or error`);
      if (!v || isNaN(Date.parse(v.checked))) bad("transcript-status.json", `${id}: checked should be a date`);
      if (!v || typeof v.credits_used !== "number") bad("transcript-status.json", `${id}: credits_used should be a number`);
      if (!epIds.has(id)) console.warn(`warning transcript-status.json: no episode with id "${id}"`);
      if (v && v.status === "ok" && !txFiles.includes(id)) console.warn(`warning transcript-status.json: ${id} is marked ok but has no transcript file`);
    }
    for (const id of txFiles) if (!st.episodes[id]) console.warn(`warning transcripts/${id}.json: no entry in transcript-status.json`);
  }
} else if (txFiles.length) {
  console.warn(`warning: ${txFiles.length} transcript file(s) but no data/transcript-status.json`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"} found.`);
  process.exit(1);
}
console.log(`OK: ${SHOWS.length} shows, ${EPISODES.length} episodes, ${txCount} transcripts.`);
